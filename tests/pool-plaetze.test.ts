/**
 * Plätze im Pool.
 *
 * Eine Coinbase zahlt höchstens 64 Adressen aus (63, wenn der Betreiber
 * eine Gebühr nimmt). Bisher nahm der Pool trotzdem jeden an — wer zu viel
 * war, minte mit und fiel bei der Abrechnung heraus, solange er zu den
 * Kleinsten gehörte.
 *
 * Geprüft wird über den Server, nicht am Koordinator vorbei: anmelden,
 * abmelden, ablaufen lassen — und jedes Mal nachsehen, was /pool sagt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { nameToExtra } from '../src/lib/chain/finderName.ts';

/** Die n-te Testadresse. Gültig, aber niemandes Schlüssel. */
const adr = (n: number) => encodeAddress(new Uint8Array(20).fill(n));
const A = adr(1), B = adr(2), C = adr(3);

async function knoten(port: number, pool: { max?: number; fee?: number } | null = {}) {
  const store = new ChainStore(':memory:',
    { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const txpool = new TxPool();
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, txpool, REGTEST, () => {
    const t = uhr; uhr += REGTEST.targetBlockTime; return t;
  });
  const server = new MiningServer({ chain, store, pool: txpool, mining }, { params: REGTEST });
  const pk = pool
    ? new PoolCoordinator({
        name: 'pool.test', feeBps: pool.fee ?? 0,
        payoutAddress: pool.fee ? new Uint8Array(20).fill(200) : null,
        ...(pool.max ? { maxMiner: pool.max } : {}),
      })
    : null;
  server.poolKoordinator = pk;
  if (pk) server.blockName = nameToExtra('pool.test');
  await server.listen('127.0.0.1', port);
  return {
    server, pk, url: `http://127.0.0.1:${port}/api/v2`,
    async zu() { await server.close(); store.close(); },
  };
}

/** Antwort MIT Statuscode — um den geht es hier. */
const hole = async (url: string, pfad: string, body?: unknown) => {
  const res = await fetch(url + pfad, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json() as Record<string, any>) };
};

const anmelden = (url: string, address: string, mode: 'pool' | 'solo' = 'pool') =>
  hole(url, '/session', { address, mode });

/**
 * Einen Share einreichen -- echte Arbeit, wie in pool-server.test.ts. Im
 * Testnetz ist die Blockdifficulty 1; gesucht wird gegen das Blockziel.
 */
async function arbeiten(url: string, sessionId: string): Promise<void> {
  const job = await hole(url, `/job?session=${sessionId}`);
  const kopf = new Uint8Array(136);
  const dv = new DataView(kopf.buffer);
  dv.setUint32(0, job.version, true);
  dv.setUint32(4, job.height, true);
  kopf.set(fromHex(job.prevHash), 8);
  kopf.set(fromHex(job.merkleRoot), 40);
  kopf.set(fromHex(job.stateRoot), 72);
  dv.setBigUint64(104, BigInt(job.timestamp), true);
  dv.setUint32(112, job.difficulty, true);
  dv.setUint32(116, job.txCount, true);
  dv.setBigUint64(120, BigInt(job.extranonce), true);
  const ziel = (1n << 240n) / BigInt(job.difficulty);
  for (let n = 0n; n < 5_000_000n; n++) {
    dv.setBigUint64(128, n, true);
    if (BigInt('0x' + toHex(sha256(sha256(kopf)))) < ziel) {
      const r = await hole(url, '/share', { sessionId, jobId: job.jobId, nonce: n.toString() });
      assert.equal(r.accepted, true, `Share abgelehnt: ${r.reason ?? ''}`);
      return;
    }
  }
  throw new Error('kein Treffer');
}

/** Die Uhr des Servers vorstellen. Der Server fragt Date.now(). */
const ECHT = Date.now.bind(Date);
function uhrVor(ms: number): () => void {
  Date.now = () => ECHT() + ms;      // absolut -- ein zweiter Aufruf ersetzt den ersten
  return () => { Date.now = ECHT; };
}

// --------------------------------------------------------------- Koordinator

test('Plätze: 64 ohne Gebühr, 63 mit — die Grenze der Coinbase', () => {
  const ohne = new PoolCoordinator({ name: 'p', feeBps: 0, payoutAddress: null });
  assert.equal(ohne.plaetze(), 64);

  const mit = new PoolCoordinator(
    { name: 'p', feeBps: 100, payoutAddress: new Uint8Array(20).fill(9) });
  assert.equal(mit.plaetze(), 63, 'ein Empfänger geht an den Betreiber');
});

test('Plätze: Eine angekündigte Gebühr zählt schon vor dem nächsten Block', () => {
  const pk = new PoolCoordinator({ name: 'p', feeBps: 0, payoutAddress: null });
  pk.setzeGebuehr(50, new Uint8Array(20).fill(9));
  assert.equal(pk.einstellungen().feeBps, 0, 'die Gebühr selbst gilt noch nicht');
  assert.equal(pk.plaetze(), 63,
    'sonst wäre der Pool mit dem nächsten Block um einen Platz überbucht');
});

test('Plätze: Der Betreiber kann weniger anbieten, aber nicht mehr', () => {
  const klein = new PoolCoordinator({ name: 'p', feeBps: 0, payoutAddress: null, maxMiner: 10 });
  assert.equal(klein.plaetze(), 10);

  const zuViel = new PoolCoordinator(
    { name: 'p', feeBps: 100, payoutAddress: new Uint8Array(20).fill(9), maxMiner: 64 });
  assert.equal(zuViel.plaetze(), 63, 'mehr als die Kette auszahlt, geht nicht');

  for (const falsch of [0, -1, 65, 1.5, Number.NaN]) {
    assert.throws(
      () => new PoolCoordinator({ name: 'p', feeBps: 0, payoutAddress: null, maxMiner: falsch }),
      /Platzzahl/, `maxMiner ${falsch} muss abgelehnt werden`);
  }
});

// -------------------------------------------------------------------- /pool

test('/pool: Der Stand ist ohne Anmeldung lesbar', async () => {
  const k = await knoten(18901);
  try {
    const leer = await hole(k.url, '/pool');
    assert.equal(leer.status, 200);
    assert.equal(leer.name, 'pool.test');
    assert.equal(leer.feeBps, 0);
    assert.equal(leer.plaetze, 64);
    assert.equal(leer.miner, 0);
    assert.equal(leer.belegt, 0);
    assert.equal(leer.frei, 64);
    assert.equal(leer.voll, false);
    assert.equal(leer.dabei, undefined, 'ohne Adresse gibt es kein "dabei"');

    await anmelden(k.url, A);
    const einer = await hole(k.url, '/pool');
    assert.equal(einer.miner, 1);
    assert.equal(einer.frei, 63);

    assert.equal((await hole(k.url, `/pool?address=${A}`)).dabei, true);
    assert.equal((await hole(k.url, `/pool?address=${B}`)).dabei, false);
  } finally { await k.zu(); }
});

test('/pool: Ein Knoten ohne Pool sagt das — mit 404', async () => {
  const k = await knoten(18902, null);
  try {
    const r = await hole(k.url, '/pool');
    assert.equal(r.status, 404);
    assert.equal(r.error, 'pool_unavailable');
  } finally { await k.zu(); }
});

test('/pool: Eine kaputte Adresse wird nicht stillschweigend übergangen', async () => {
  const k = await knoten(18903);
  try {
    const r = await hole(k.url, '/pool?address=ysr1quatsch');
    assert.equal(r.status, 400);
    assert.equal(r.error, 'bad_address');
  } finally { await k.zu(); }
});

test('/pool: Solo-Sitzungen am selben Knoten belegen keinen Platz', async () => {
  const k = await knoten(18904);
  try {
    await anmelden(k.url, A, 'solo');
    const r = await hole(k.url, `/pool?address=${A}`);
    assert.equal(r.miner, 0);
    assert.equal(r.belegt, 0);
    assert.equal(r.dabei, false);
  } finally { await k.zu(); }
});

// --------------------------------------------------------------- Aufnahmestopp

test('Ein voller Pool lehnt eine neue Adresse ab — mit 409 und Text', async () => {
  const k = await knoten(18905, { max: 2 });
  try {
    assert.equal((await anmelden(k.url, A)).status, 200);
    assert.equal((await anmelden(k.url, B)).status, 200);

    const c = await anmelden(k.url, C);
    assert.equal(c.status, 409,
      'bei 200 hielte die App die Anmeldung für gelungen');
    assert.equal(c.error, 'pool_full');
    assert.match(c.detail, /pool_full/,
      'am Kürzel im Text erkennt die Oberfläche den Fall');
    assert.equal(c.sessionId, undefined, 'es darf keine Sitzung entstehen');
    assert.equal(c.plaetze, 2);

    const stand = await hole(k.url, `/pool?address=${C}`);
    assert.equal(stand.voll, true);
    assert.equal(stand.frei, 0);
    assert.equal(stand.miner, 2, 'die abgelehnte Adresse zählt nicht mit');
    assert.equal(stand.dabei, false);
  } finally { await k.zu(); }
});

test('Wer dabei ist, darf weitere Geräte anmelden — ein Platz je Adresse', async () => {
  const k = await knoten(18906, { max: 2 });
  try {
    await anmelden(k.url, A);
    await anmelden(k.url, B);

    const zweitgeraet = await anmelden(k.url, A);
    assert.equal(zweitgeraet.status, 200);
    assert.equal(zweitgeraet.mode, 'pool');
    assert.equal(zweitgeraet.concurrentSessions, 2);
    assert.equal(zweitgeraet.pool.miner, 2, 'zwei Adressen, nicht drei Geräte');
    assert.equal(zweitgeraet.pool.belegt, 2);
    assert.equal(zweitgeraet.pool.voll, true);
    assert.equal(zweitgeraet.pool.dabei, true);
  } finally { await k.zu(); }
});

test('Solo geht am selben Knoten weiter, auch wenn der Pool voll ist', async () => {
  const k = await knoten(18907, { max: 1 });
  try {
    await anmelden(k.url, A);
    const solo = await anmelden(k.url, B, 'solo');
    assert.equal(solo.status, 200);
    assert.equal(solo.mode, 'solo');
  } finally { await k.zu(); }
});

test('Abmelden gibt den Platz sofort frei', async () => {
  const k = await knoten(18908, { max: 1 });
  try {
    const a = await anmelden(k.url, A);
    assert.equal((await anmelden(k.url, B)).status, 409);

    await hole(k.url, '/session/stop', { sessionId: a.sessionId });
    assert.equal((await hole(k.url, '/pool')).belegt, 0);
    assert.equal((await anmelden(k.url, B)).status, 200);
  } finally { await k.zu(); }
});

test('Abmelden eines von zwei Geräten gibt den Platz NICHT frei', async () => {
  const k = await knoten(18909, { max: 1 });
  try {
    const a1 = await anmelden(k.url, A);
    await anmelden(k.url, A);
    await hole(k.url, '/session/stop', { sessionId: a1.sessionId });

    assert.equal((await hole(k.url, '/pool')).belegt, 1, 'das zweite Gerät rechnet noch');
    assert.equal((await anmelden(k.url, B)).status, 409);
  } finally { await k.zu(); }
});

test('Eine abgelaufene Sitzung hält den Platz noch eine Weile', async () => {
  /*
    Ein eingefrorenes Telefon meldet sich nicht ab. Kommt es nach zehn
    Minuten zurück, eröffnet der Miner still eine neue Sitzung — und darf
    dann nicht vor einem vollen Pool stehen.
  */
  const k = await knoten(18910, { max: 1 });
  let zurueck = () => {};
  try {
    const a = await anmelden(k.url, A);
    await arbeiten(k.url, a.sessionId);

    zurueck = uhrVor(10 * 60_000);   // Sitzung ist nach 5 Minuten abgelaufen
    const stand = await hole(k.url, `/pool?address=${A}`);
    assert.equal(stand.miner, 0, 'verbunden ist niemand mehr');
    assert.equal(stand.belegt, 1, 'der Platz ist aber noch vorgemerkt');
    assert.equal(stand.dabei, true);
    assert.equal((await anmelden(k.url, B)).status, 409);

    const wieder = await anmelden(k.url, A);
    assert.equal(wieder.status, 200, 'wer zurückkommt, bekommt seinen Platz');
    assert.equal(wieder.pool.miner, 1);
  } finally { zurueck(); await k.zu(); }
});

test('Die Vormerkung läuft ab — ein verlassener Platz wird frei', async () => {
  const k = await knoten(18911, { max: 1 });
  let zurueck = () => {};
  try {
    const a = await anmelden(k.url, A);
    await arbeiten(k.url, a.sessionId);

    zurueck = uhrVor(21 * 60_000);   // 5 Minuten Sitzung + 15 Minuten Vormerkung
    const stand = await hole(k.url, `/pool?address=${A}`);
    assert.equal(stand.belegt, 0);
    assert.equal(stand.dabei, false);
    assert.equal((await anmelden(k.url, B)).status, 200);
  } finally { zurueck(); await k.zu(); }
});

test('Vorgemerkt wird nur, wer gearbeitet hat', async () => {
  // Sonst hielte eine Anmeldung ohne einen einzigen Share den Platz noch
  // zwanzig Minuten, nachdem sich niemand mehr meldet.
  const k = await knoten(18913, { max: 1 });
  let zurueck = () => {};
  try {
    await anmelden(k.url, A);          // meldet sich an und tut nichts

    zurueck = uhrVor(6 * 60_000);
    assert.equal((await hole(k.url, '/pool')).belegt, 0, 'nach dem Ablauf ist der Platz frei');
    assert.equal((await anmelden(k.url, B)).status, 200);
  } finally { zurueck(); await k.zu(); }
});

test('Meldet sich ein Gerät ab, bleibt die Vormerkung des eingefrorenen zweiten', async () => {
  const k = await knoten(18914, { max: 1 });
  let zurueck = () => {};
  try {
    const eingefroren = await anmelden(k.url, A);
    await arbeiten(k.url, eingefroren.sessionId);

    zurueck = uhrVor(10 * 60_000);     // Geraet 2 ist verstummt und abgelaufen
    const wach = await anmelden(k.url, A);   // Geraet 1 derselben Adresse
    await hole(k.url, '/session/stop', { sessionId: wach.sessionId });

    assert.equal((await hole(k.url, '/pool')).belegt, 1,
      'das Abmelden von Gerät 1 darf den Platz von Gerät 2 nicht freigeben');
    assert.equal((await anmelden(k.url, B)).status, 409);
  } finally { zurueck(); await k.zu(); }
});

test('"Stopp" nach dem Ablauf der eigenen Sitzung gibt den Platz frei', async () => {
  // Die App kommt aus dem Hintergrund zurück, die Sitzung ist längst weg —
  // und der Nutzer drückt Stopp. Dann soll nichts mehr vorgemerkt bleiben.
  const k = await knoten(18915, { max: 1 });
  let zurueck = () => {};
  try {
    const a = await anmelden(k.url, A);
    await arbeiten(k.url, a.sessionId);

    zurueck = uhrVor(10 * 60_000);
    assert.equal((await hole(k.url, '/pool')).belegt, 1);
    await hole(k.url, '/session/stop', { sessionId: a.sessionId });
    assert.equal((await hole(k.url, '/pool')).belegt, 0);
    assert.equal((await anmelden(k.url, B)).status, 200);
  } finally { zurueck(); await k.zu(); }
});

test('Wer angemeldet ist und nicht rechnet, hält keinen Platz', async () => {
  /*
    Sonst ließe sich ein Pool zustellen: anmelden, alle paar Minuten einen Job
    abholen, nie einen Share liefern. Die Sitzung bleibt bestehen — sie zählt
    nach zehn Minuten nur nicht mehr als belegter Platz.
  */
  const k = await knoten(18919, { max: 1 });
  let zurueck = () => {};
  try {
    const a = await anmelden(k.url, A);
    assert.equal((await anmelden(k.url, B)).status, 409, 'in den ersten Minuten gilt der Platz');

    // Elf Minuten lang nur Jobs abholen.
    for (const min of [4, 8, 11]) {
      zurueck = uhrVor(min * 60_000);
      assert.ok((await hole(k.url, `/job?session=${a.sessionId}`)).jobId, 'die Sitzung lebt');
    }
    const stand = await hole(k.url, `/pool?address=${A}`);
    assert.equal(stand.miner, 1, 'verbunden ist A weiterhin');
    assert.equal(stand.belegt, 0, 'einen Platz hält A nicht mehr');
    assert.equal(stand.dabei, false);

    const b = await anmelden(k.url, B);
    assert.equal(b.status, 200, 'der Platz geht an jemanden, der ihn nutzen will');

    // A rechnet doch noch: Die Sitzung wurde nicht beendet, der Share zählt.
    await arbeiten(k.url, a.sessionId);
    const danach = await hole(k.url, `/pool?address=${A}`);
    assert.equal(danach.dabei, true, 'wer liefert, zählt wieder');
    assert.equal(danach.frei, 0, 'und "frei" wird nie negativ');
    assert.equal(danach.voll, true);
  } finally { zurueck(); await k.zu(); }
});

test('Wer rechnet, behält seinen Platz — auch über Stunden', async () => {
  const k = await knoten(18920, { max: 1 });
  let zurueck = () => {};
  try {
    const a = await anmelden(k.url, A);
    for (const min of [4, 8, 12, 16, 20, 24]) {
      zurueck = uhrVor(min * 60_000);
      await arbeiten(k.url, a.sessionId);
      assert.equal((await hole(k.url, '/pool')).belegt, 1, `Minute ${min}`);
      assert.equal((await anmelden(k.url, B)).status, 409, `Minute ${min}`);
    }
  } finally { zurueck(); await k.zu(); }
});

// ------------------------------------------------- was die Miner draus machen

test('Der Miner der Android-App bekommt die Ablehnung mit 200', async () => {
  /*
    NativMiner.java hält alles ab 400 für einen Netzfehler und versucht es
    endlos weiter. Eine Ablehnung nimmt er nur aus einer 200-Antwort mit
    `error` an — dann hält er sauber an.
  */
  const k = await knoten(18916, { max: 1 });
  try {
    await anmelden(k.url, A);
    const als = async (agent: string) => {
      const res = await fetch(k.url + '/session', {
        method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': agent },
        body: JSON.stringify({ address: B, mode: 'pool', platform: 'android' }),
      });
      return { status: res.status, ...(await res.json() as Record<string, any>) };
    };
    const nativ = await als('YSKAR-Wallet-Nativ/1');
    assert.equal(nativ.status, 200);
    assert.equal(nativ.error, 'pool_full');
    assert.match(nativ.detail, /pool_full/);
    assert.equal(nativ.sessionId, undefined);

    for (const agent of ['Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile', 'node', 'YSKAR-Wallet/1.0.8']) {
      assert.equal((await als(agent)).status, 409, agent);
    }
    assert.equal((await hole(k.url, '/pool')).belegt, 1, 'niemand davon hat einen Platz bekommen');
  } finally { await k.zu(); }
});

test('Die übrigen Ablehnungen der Anmeldung kommen wie bisher mit 200', async () => {
  // Darauf verlassen sich die Miner, die es schon gibt.
  const mit = await knoten(18917);
  const ohne = await knoten(18918, null);
  try {
    const fehlt = await hole(mit.url, '/session', { mode: 'pool' });
    assert.deepEqual([fehlt.status, fehlt.error], [200, 'missing_address']);
    const kaputt = await hole(mit.url, '/session', { address: 'ysr1quatsch', mode: 'pool' });
    assert.deepEqual([kaputt.status, kaputt.error], [200, 'bad_address']);
    const keinPool = await anmelden(ohne.url, A);
    assert.deepEqual([keinPool.status, keinPool.error], [200, 'pool_unavailable']);

    // Und die Antwort auf eine gelungene Anmeldung hat alle bisherigen Felder.
    const ok = await anmelden(mit.url, A);
    for (const feld of ['sessionId', 'extranonce', 'mode', 'pool', 'shareDifficulty', 'address', 'concurrentSessions']) {
      assert.ok(feld in ok, `Feld ${feld} fehlt`);
    }
    for (const feld of ['name', 'feeBps', 'miner', 'hashrate', 'eintraege', 'arbeitGesamt']) {
      assert.ok(feld in ok.pool, `pool.${feld} fehlt`);
    }
  } finally { await mit.zu(); await ohne.zu(); }
});

test('Mit Gebühr sind es 63 Plätze — und der 64. wird abgelehnt', async () => {
  const k = await knoten(18912, { fee: 100 });
  try {
    for (let i = 1; i <= 63; i++) {
      const r = await anmelden(k.url, adr(i));
      assert.equal(r.status, 200, `Adresse ${i} abgelehnt`);
    }
    const stand = await hole(k.url, '/pool');
    assert.equal(stand.plaetze, 63);
    assert.equal(stand.voll, true);
    assert.equal((await anmelden(k.url, adr(64))).status, 409);
  } finally { await k.zu(); }
});
