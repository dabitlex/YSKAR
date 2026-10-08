/**
 * Das Share-Ziel gilt je JOB (Befund S2).
 *
 * Vorher gehoerte das Ziel der Sitzung und aenderte sich nach jedem
 * angenommenen Share. Die Gutschrift haengte damit davon ab, in welcher
 * Reihenfolge und wie schnell Treffer eingereicht wurden. Jetzt:
 *
 *   - Das Ziel wird festgelegt, wenn der Job ausgegeben wird.
 *   - Jeder Treffer auf diesen Job wird damit geprueft und mit genau
 *     diesem Wert gutgeschrieben -- auch ein Blockfund.
 *   - Die Nachfuehrung wirkt erst auf den naechsten Job; liegt sie um
 *     Faktor 4 oder mehr daneben, endet der laufende Job vorzeitig.
 *   - Das Ziel liegt nie ueber einem Achtel der Blockdifficulty.
 *
 * Die Treffer selbst werden hier nicht gerechnet: submitNonce ist ersetzt
 * und meldet die erreichte Difficulty, die der Test vorgibt. Geprueft wird,
 * was der Knoten daraus macht. Die Uhr des Knotens (Date.now) steht
 * ebenfalls unter der Kontrolle des Tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { REGTEST, type ConsensusParams } from '../src/lib/core/networks.ts';
import { encodeAddress } from '../src/lib/core/address.ts';

const A = encodeAddress(new Uint8Array(20).fill(1));
const B = encodeAddress(new Uint8Array(20).fill(2));
/** Ein Netz mit spuerbarer Blockdifficulty -- sonst greift die Obergrenze sofort. */
const BLOCK_D = 1n << 20n;
const NETZ: ConsensusParams = { ...REGTEST, genesisDifficulty: BLOCK_D };
const DECKEL = BLOCK_D / 8n;

const ECHT = Date.now.bind(Date);
let uhr = ECHT();
function uhrSteuern() { Date.now = () => uhr; return () => { Date.now = ECHT; }; }

async function knoten(port: number, opt: { feste?: boolean; netz?: ConsensusParams } = {}) {
  const params = opt.netz ?? NETZ;
  const store = new ChainStore(':memory:', { network: params.network, chainId: params.chainId });
  const chain = new ChainManager(store, params);
  const pool = new TxPool(params);
  let sek = 1_788_912_000n;
  // feste: Die Uhr des Blockbaus steht -- wie mehrere Anfragen in derselben Sekunde.
  const mining = new MiningCoordinator(chain, store, pool, params,
    () => opt.feste ? sek : (sek += 1n));
  const server = new MiningServer({ chain, store, pool, mining }, { params });
  const pk = new PoolCoordinator({ name: 'pool.test', feeBps: 0, payoutAddress: null, pplnsFaktor: 1_000_000n });
  server.poolKoordinator = pk;
  await server.listen('127.0.0.1', port);
  const url = `http://127.0.0.1:${port}/api/v2`;
  const hole = async (pfad: string, body?: unknown) => {
    const res = await fetch(url + pfad, body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json() as Record<string, any>;
  };
  /** Treffer mit dieser erreichten Difficulty (kein Block). */
  let erreicht = 10n ** 6n;
  let block = false;
  (mining as any).submitNonce = () => block
    ? { ok: true, block: true, height: 0, hash: '00'.repeat(32), reward: '1' }
    : { ok: true, block: false, achieved: erreicht.toString() };
  return {
    server, mining, pk, hole,
    setzeTreffer(d: bigint) { erreicht = d; },
    setzeBlock(b: boolean) { block = b; },
    sitzung(id: string) { return (server as any).sessions.get(id); },
    async zu() { await server.close(); store.close(); },
  };
}

const zielZu = (d: bigint) => ((1n << 240n) / d).toString(16).padStart(64, '0');

test('Share-Ziel: gutgeschrieben wird das Ziel des Jobs; die Anpassung kommt mit dem naechsten Job', async () => {
  const zurueck = uhrSteuern();
  const k = await knoten(18_811);
  try {
    const s = await k.hole('/session', { address: A, mode: 'pool' });
    const j1 = await k.hole(`/job?session=${s.sessionId}`);
    assert.equal(j1.shareDifficulty, '128');
    assert.equal(j1.target, zielZu(128n));

    // Alle 12 Sekunden ein Share: rund das 2,5-Fache des Startwerts waere richtig.
    for (let i = 0; i < 4; i++) {
      uhr += 12_000;
      const r = await k.hole('/share', { sessionId: s.sessionId, jobId: j1.jobId, nonce: String(i) });
      assert.equal(r.accepted, true, JSON.stringify(r));
      assert.equal(r.credited, '128', 'gutgeschrieben wird das Ziel des Jobs');
      assert.equal(r.shareDifficulty, '128', 'gemeldet wird das Ziel des laufenden Jobs');
    }
    assert.equal(k.pk.arbeitGesamt(), 4n * 128n);
    const vorgemerkt = k.sitzung(s.sessionId).shareDifficulty as bigint;
    assert.ok(vorgemerkt > 128n && vorgemerkt < 512n, `vorgemerkt ${vorgemerkt}`);

    // Unter Faktor 4: Der Job laeuft weiter, Treffer zaehlen weiter mit 128.
    uhr += 12_000;
    const weiter = await k.hole('/share', { sessionId: s.sessionId, jobId: j1.jobId, nonce: '99' });
    assert.equal(weiter.accepted, true);
    assert.equal(weiter.credited, '128');

    // Der naechste Job traegt das neue Ziel -- und danach zaehlt es.
    const j2 = await k.hole(`/job?session=${s.sessionId}`);
    assert.notEqual(j2.jobId, j1.jobId);
    assert.equal(j2.shareDifficulty, vorgemerkt.toString());
    assert.equal(j2.target, zielZu(vorgemerkt));
    uhr += 12_000;
    const r2 = await k.hole('/share', { sessionId: s.sessionId, jobId: j2.jobId, nonce: '1' });
    assert.equal(r2.credited, vorgemerkt.toString());
    assert.equal(k.pk.arbeitGesamt(), 5n * 128n + vorgemerkt);

    // Unter dem Ziel des Jobs: abgelehnt, mit dem Ziel des Jobs als Angabe.
    k.setzeTreffer(vorgemerkt - 1n);
    const schwach = await k.hole('/share', { sessionId: s.sessionId, jobId: j2.jobId, nonce: '2' });
    assert.equal(schwach.reason, 'low_difficulty');
    assert.equal(schwach.required, vorgemerkt.toString());
  } finally { zurueck(); await k.zu(); }
});

test('Share-Ziel: Reihenfolge und Takt der Einreichung aendern die Gutschrift nicht', async () => {
  /*
    Zwei Sitzungen mit denselben Treffern: eine reicht sie aufsteigend,
    die andere absteigend nach erreichter Difficulty ein, beide so schnell
    wie moeglich. Vorher stieg das Ziel dabei mit jedem Share, und die
    spaeteren -- die besten -- Treffer wurden mit dem hoeheren Wert
    gutgeschrieben. Jetzt zaehlt jeder Treffer eines Jobs gleich.
  */
  const zurueck = uhrSteuern();
  const k = await knoten(18_812);
  try {
    const treffer = Array.from({ length: 12 }, (_, i) => 128n << BigInt(i));   // 128 ... 262144
    const ergebnis: bigint[] = [];
    for (const [adresse, folge] of [[A, treffer], [B, [...treffer].reverse()]] as const) {
      const vorher = k.pk.arbeitGesamt();
      const s = await k.hole('/session', { address: adresse, mode: 'pool' });
      const job = await k.hole(`/job?session=${s.sessionId}`);
      let angenommen = 0;
      for (const [i, d] of folge.entries()) {
        uhr += 1;
        k.setzeTreffer(d);
        const r = await k.hole('/share', { sessionId: s.sessionId, jobId: job.jobId, nonce: String(i) });
        if (r.accepted) {
          angenommen++;
          assert.equal(r.credited, '128', 'jeder Treffer dieses Jobs zaehlt gleich');
        } else {
          assert.equal(r.reason, 'job_expired', 'nach Faktor 4 endet der Job -- keine hoehere Gutschrift');
        }
      }
      const gutgeschrieben = k.pk.arbeitGesamt() - vorher;
      assert.equal(gutgeschrieben, BigInt(angenommen) * 128n);
      ergebnis.push(gutgeschrieben);
    }
    assert.equal(ergebnis[0], ergebnis[1], 'aufsteigend und absteigend bringen dasselbe');
  } finally { zurueck(); await k.zu(); }
});

test('Share-Ziel: weit daneben -- der Job endet, der naechste hat eine neue Kennung, auch in derselben Sekunde', async () => {
  const zurueck = uhrSteuern();
  const k = await knoten(18_813, { feste: true });
  try {
    const s = await k.hole('/session', { address: A, mode: 'solo' });
    const j1 = await k.hole(`/job?session=${s.sessionId}`);
    // Sehr schnelle Treffer: Das Ziel muesste ein Vielfaches sein.
    let ende = -1;
    for (let i = 0; i < 10; i++) {
      uhr += 10;
      const r = await k.hole('/share', { sessionId: s.sessionId, jobId: j1.jobId, nonce: String(i) });
      if (!r.accepted) { ende = i; assert.equal(r.reason, 'job_expired'); break; }
    }
    assert.ok(ende > 0, 'der Job wurde vorzeitig beendet');
    assert.equal(k.sitzung(s.sessionId).abgelehnt, 0, 'ein beendeter Job ist kein Fehler des Miners');

    // Mehrere Anfragen auf einmal (die Kommandozeile kann das): alle
    // bekommen DENSELBEN neuen Job -- mit neuer Kennung und neuem Ziel.
    const jobs = await Promise.all([1, 2, 3].map(() => k.hole(`/job?session=${s.sessionId}`)));
    for (const j of jobs) {
      assert.equal(j.jobId, jobs[0].jobId);
      assert.equal(j.shareDifficulty, '512');
      assert.equal(j.target, zielZu(512n));
    }
    assert.notEqual(jobs[0].jobId, j1.jobId);
    assert.equal(BigInt(jobs[0].timestamp), BigInt(j1.timestamp) + 1n, 'eine Sekunde spaeter, nicht mehr');

    // Auf den neuen Job wird wieder angenommen; der alte ist fremd.
    uhr += 10;
    assert.equal((await k.hole('/share', { sessionId: s.sessionId, jobId: jobs[0].jobId, nonce: '1' })).accepted, true);
    assert.equal((await k.hole('/share', { sessionId: s.sessionId, jobId: j1.jobId, nonce: '1' })).reason, 'job_foreign');
  } finally { zurueck(); await k.zu(); }
});

test('Share-Ziel: nie ueber einem Achtel der Blockdifficulty -- auch nicht beim Blockfund', async () => {
  const zurueck = uhrSteuern();
  const k = await knoten(18_814);
  try {
    const s = await k.hole('/session', { address: A, mode: 'pool' });
    let job = await k.hole(`/job?session=${s.sessionId}`);
    let hoechstes = 0n;
    // Immer schneller einreichen, ueber viele Jobs: Das Ziel klettert bis an den Deckel.
    for (let runde = 0; runde < 40; runde++) {
      uhr += 1;
      k.setzeTreffer(BLOCK_D - 1n);
      const r = await k.hole('/share', { sessionId: s.sessionId, jobId: job.jobId, nonce: String(runde) });
      if (!r.accepted) job = await k.hole(`/job?session=${s.sessionId}`);
      const vorgemerkt = k.sitzung(s.sessionId).shareDifficulty as bigint;
      assert.ok(vorgemerkt <= DECKEL, `vorgemerkt ${vorgemerkt} > ${DECKEL}`);
      assert.ok(BigInt(job.shareDifficulty) <= DECKEL);
      if (BigInt(job.shareDifficulty) > hoechstes) hoechstes = BigInt(job.shareDifficulty);
    }
    assert.equal(hoechstes, DECKEL, 'der Deckel wird erreicht, nicht ueberschritten');

    // Ein Blockfund wird mit dem Ziel des Jobs gutgeschrieben.
    // (Nach einem Block schiebt der Pool sein Fenster weiter -- die Summe
    // taugt dann nicht als Mass. Deshalb wird die Eintragung selbst gelesen.)
    const eingetragen: bigint[] = [];
    const original = k.pk.share.bind(k.pk);
    (k.pk as any).share = (adr: Uint8Array, d: bigint) => { eingetragen.push(d); return original(adr, d); };
    k.setzeBlock(true);
    const fund = await k.hole('/share', { sessionId: s.sessionId, jobId: job.jobId, nonce: '4711' });
    assert.equal(fund.block, true);
    assert.equal(fund.credited, job.shareDifficulty);
    assert.deepEqual(eingetragen, [BigInt(job.shareDifficulty)]);
  } finally { zurueck(); await k.zu(); }
});

test('Share-Ziel: Im Testnetz (Blockdifficulty 1) bleibt es beim Startwert 128 -- der Deckel liegt nie darunter', async () => {
  const zurueck = uhrSteuern();
  const k = await knoten(18_815, { netz: REGTEST });
  try {
    const s = await k.hole('/session', { address: A, mode: 'pool' });
    const job = await k.hole(`/job?session=${s.sessionId}`);
    assert.equal(job.shareDifficulty, '128');
    for (let i = 0; i < 6; i++) {
      uhr += 1;
      const r = await k.hole('/share', { sessionId: s.sessionId, jobId: job.jobId, nonce: String(i) });
      assert.equal(r.accepted, true, 'kein vorzeitiges Ende: hoeher als 128 geht es hier nicht');
      assert.equal(r.credited, '128');
    }
  } finally { zurueck(); await k.zu(); }
});

test('Share-Ziel: Die Nachfuehrung findet das richtige Ziel -- ohne Ueberschiessen, wenn das Ziel zwischen zwei Shares wechselt', async () => {
  /*
    Ein Miner mit fester Rechenleistung, Shares genau im erwarteten Abstand
    (Ziel * 65.536 / Leistung). Er holt alle 45 Sekunden neue Arbeit --
    unabhaengig davon, wann seine Shares fallen -- und sofort nach
    "job_expired", wie die Kommandozeile. Das Ziel muss sich auf rund 30
    Sekunden je Share einpendeln und darf dabei nicht weit darueber hinaus.
  */
  const zurueck = uhrSteuern();
  try {
    for (const [port, leistung] of [[18_816, 1.6e6], [18_817, 50e6], [18_818, 1e9]] as const) {
      const k = await knoten(port);
      try {
        const richtig = Math.min(leistung * 30 / 65536, Number(DECKEL));
        const s = await k.hole('/session', { address: A, mode: 'pool' });
        let job = await k.hole(`/job?session=${s.sessionId}`);
        let naechsterAbruf = uhr + 45_000;     // Takt der Kommandozeile, unabhaengig von Shares
        let fortschritt = 0;                   // Anteil eines Shares, der schon gerechnet ist
        let nonce = 0;
        const verlauf: number[] = [];
        for (let schritt = 0; schritt < 600; schritt++) {
          const ziel = Number(job.shareDifficulty);
          const msJeShare = ziel * 65536 / leistung * 1000;
          const bisShare = (1 - fortschritt) * msJeShare;
          const bisAbruf = naechsterAbruf - uhr;
          if (bisAbruf < bisShare) {
            // Neue Arbeit mitten zwischen zwei Shares -- genau der heikle Fall.
            uhr += bisAbruf;
            fortschritt += bisAbruf / msJeShare;
            job = await k.hole(`/job?session=${s.sessionId}`);
            naechsterAbruf = uhr + 45_000;
            verlauf.push(Number(job.shareDifficulty));
            continue;
          }
          uhr += Math.max(1, Math.round(bisShare));
          fortschritt = 0;
          const r = await k.hole('/share', { sessionId: s.sessionId, jobId: job.jobId, nonce: String(nonce++) });
          if (!r.accepted) {
            job = await k.hole(`/job?session=${s.sessionId}`);
            naechsterAbruf = uhr + 45_000;
            verlauf.push(Number(job.shareDifficulty));
          }
        }
        const ende = verlauf.slice(-5);
        for (const z of ende) {
          assert.ok(z >= richtig * 0.69 && z <= richtig * 1.41,
            `Leistung ${leistung}: Ziel ${z}, richtig ${richtig.toFixed(0)} -- Verlauf ${verlauf.slice(0, 12).join(',')}`);
        }
        assert.ok(Math.max(...verlauf) <= richtig * 1.41, `ueberschossen: ${Math.max(...verlauf)} > ${richtig}`);
      } finally { await k.zu(); }
    }
  } finally { zurueck(); }
});

test('Share-Ziel: Die Messung teilt jeden Abschnitt durch das Ziel, das in ihm galt', async () => {
  /*
    Wechselt das Ziel zwischen zwei Shares (neuer Job), zaehlt die Zeit
    unter dem alten Ziel mit dem alten. Ein Beispiel zum Nachrechnen:
    20 Sekunden bei 512, dann 5 Sekunden bei 2048 bis zum Share:
        20 / 512 + 5 / 2048 = 0,041015625 Sekunden je Difficulty-Einheit.
    Wer alles durch 2048 teilte (25 / 2048 = 0,0122), hielte den Miner fuer
    gut dreimal so schnell, wie er ist.
  */
  const zurueck = uhrSteuern();
  const k = await knoten(18_819);
  try {
    const s = await k.hole('/session', { address: A, mode: 'solo' });
    const sitz = k.sitzung(s.sessionId);
    sitz.shareDifficulty = 512n;
    const j1 = await k.hole(`/job?session=${s.sessionId}`);
    assert.equal(j1.shareDifficulty, '512');
    assert.equal((await k.hole('/share', { sessionId: s.sessionId, jobId: j1.jobId, nonce: '1' })).accepted, true);
    uhr += 20_000;
    sitz.shareDifficulty = 2048n;
    const j2 = await k.hole(`/job?session=${s.sessionId}`);
    assert.equal(j2.shareDifficulty, '2048');
    uhr += 5_000;
    assert.equal((await k.hole('/share', { sessionId: s.sessionId, jobId: j2.jobId, nonce: '2' })).accepted, true);
    assert.ok(Math.abs(sitz.proben.at(-1) - (20 / 512 + 5 / 2048)) < 1e-9, `gemessen ${sitz.proben.at(-1)}`);
  } finally { zurueck(); await k.zu(); }
});
