/**
 * Begrenzung der Mining-Anfragen (Full Node 1.0.1, --mining-limits).
 *
 * Festgehalten wird beides: Wer flutet, wird gebremst -- und ein ehrlicher,
 * sehr schneller Miner merkt davon nichts, auch nicht beim Start, wenn das
 * Share-Ziel noch niedrig ist. Mehrere Miner hinter einer IP stoeren sich
 * nicht, weil die engen Grenzen je Sitzung gelten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer, type ServerOptionen } from '../src/lib/node/fullnode/MiningServer.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { encodeAddress } from '../src/lib/core/address.ts';

const ADR = (n: number) => encodeAddress(new Uint8Array(20).fill(n));

async function knoten(port: number, opt: Partial<ServerOptionen> = {}, ohneBlock = false) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => { const t = uhr; uhr += REGTEST.targetBlockTime; return t; });
  if (ohneBlock) {
    // Jeder Share zaehlt, keiner baut einen Block: so laesst sich ein schneller
    // Miner nachstellen, ohne wirklich zu rechnen.
    (mining as any).submitNonce = () => ({ ok: true, block: false, achieved: (1n << 60n).toString() });
    // Das Share-Ziel ist nach oben durch die Blockdifficulty gedeckelt. Im
    // Regtest ist die winzig; ohne Mainnet-aehnlichen Wert koennte das Ziel
    // nie steigen, und der Miner flutete endlos -- das gaebe es im echten
    // Netz nicht.
    const erzeuge = mining.createJob.bind(mining);
    (mining as any).createJob = (...a: unknown[]) => ({ ...(erzeuge as any)(...a), difficultyWert: '765318823' });
  }
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST, ...opt });
  await server.listen('127.0.0.1', port);
  return { server, url: `http://127.0.0.1:${port}/api/v2`, async zu() { await server.close(); store.close(); } };
}

async function anfrage(url: string, pfad: string, body?: unknown, ip?: string) {
  const kopf: Record<string, string> = { 'content-type': 'application/json' };
  if (ip) kopf['x-forwarded-for'] = ip;
  const res = await fetch(url + pfad, body === undefined ? { headers: kopf } : { method: 'POST', headers: kopf, body: JSON.stringify(body) });
  return { status: res.status, kopf: res.headers, json: await res.json() as Record<string, any> };
}
const sitzung = async (url: string, n = 7, ip?: string) =>
  (await anfrage(url, '/session', { address: ADR(n), mode: 'solo' }, ip)).json.sessionId as string;

test('/job-Flut in einer Sitzung: 429 mit Retry-After, andere Sitzung unberuehrt', async () => {
  const k = await knoten(18_801, { grenzen: { job: { rate: 1, vorrat: 20 } } });
  try {
    const a = await sitzung(k.url, 7);
    const b = await sitzung(k.url, 8);
    const status: number[] = [];
    for (let i = 0; i < 25; i++) status.push((await anfrage(k.url, `/job?session=${a}`)).status);
    assert.deepEqual(status.slice(0, 20), Array(20).fill(200));
    const r = await anfrage(k.url, `/job?session=${a}`);
    assert.equal(r.status, 429);
    assert.equal(r.json.error, 'rate_limited');
    assert.ok(Number(r.kopf.get('retry-after')) >= 1);
    assert.equal((await anfrage(k.url, `/job?session=${b}`)).status, 200, 'B hat ein eigenes Kontingent');
    const st = (await anfrage(k.url, '/status')).json;
    assert.equal(st.miningLimits.enabled, true);
    assert.ok(st.miningLimits.rejected.job >= 6);
  } finally { await k.zu(); }
});

test('Zehn Miner hinter einer IP arbeiten mit den Standardwerten ungestoert', async () => {
  const k = await knoten(18_802, { absender: 'proxy' });
  try {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await sitzung(k.url, 10 + i, '203.0.113.9'));
    assert.equal(new Set(ids).size, 10);
    for (let runde = 0; runde < 5; runde++) {
      const antworten = await Promise.all(ids.map(id => anfrage(k.url, `/job?session=${id}`, undefined, '203.0.113.9')));
      for (const a of antworten) assert.equal(a.status, 200);
    }
    const st = (await anfrage(k.url, '/status')).json;
    assert.deepEqual(st.miningLimits.rejected, { job: 0, share: 0, sessionsPerIp: 0, totalPerIp: 0 });
  } finally { await k.zu(); }
});

test('Grenze je IP (mit --sender-ip): zwei IPs sind unabhaengig', async () => {
  const k = await knoten(18_803, { absender: 'proxy', grenzen: { sitzungIp: { rate: 0.01, vorrat: 3 } } });
  try {
    for (let i = 0; i < 3; i++) assert.equal(typeof await sitzung(k.url, 20 + i, '198.51.100.1'), 'string');
    const zuViel = await anfrage(k.url, '/session', { address: ADR(30), mode: 'solo' }, '198.51.100.1');
    assert.equal(zuViel.status, 429);
    assert.equal(zuViel.json.error, 'rate_limited');
    assert.equal(typeof await sitzung(k.url, 31, '198.51.100.2'), 'string', 'andere IP nicht betroffen');
  } finally { await k.zu(); }
});

test('Ohne --sender-ip gibt es keine Grenze je IP -- alles hinter dem Proxy saehe gleich aus', async () => {
  const k = await knoten(18_804, { grenzen: { sitzungIp: { rate: 0.01, vorrat: 1 }, gesamtIp: { rate: 0.01, vorrat: 1 } } });
  try {
    for (let i = 0; i < 5; i++) assert.equal(typeof await sitzung(k.url, 40 + i), 'string');
    assert.equal((await anfrage(k.url, '/status')).json.miningLimits.perSender, false);
  } finally { await k.zu(); }
});

test('Zu viele Shares: HTTP 200, accepted false, reason rate_limited', async () => {
  const k = await knoten(18_805, { grenzen: { share: { rate: 0.01, vorrat: 3 } } }, true);
  try {
    const id = await sitzung(k.url);
    const job = (await anfrage(k.url, `/job?session=${id}`)).json;
    const antworten = [];
    for (let i = 0; i < 5; i++) antworten.push(await anfrage(k.url, '/share', { sessionId: id, jobId: job.jobId, nonce: String(i) }));
    assert.deepEqual(antworten.map(a => a.status), [200, 200, 200, 200, 200]);
    assert.deepEqual(antworten.slice(0, 3).map(a => a.json.accepted), [true, true, true]);
    assert.equal(antworten[3].json.accepted, false);
    assert.equal(antworten[3].json.reason, 'rate_limited');
  } finally { await k.zu(); }
});

test('--mining-limits off: keine Drossel, Verhalten wie bisher', async () => {
  const k = await knoten(18_806, { grenzen: false });
  try {
    const id = await sitzung(k.url);
    for (let i = 0; i < 300; i++) assert.equal((await anfrage(k.url, `/job?session=${id}`)).status, 200);
    assert.deepEqual((await anfrage(k.url, '/status')).json.miningLimits, { enabled: false });
  } finally { await k.zu(); }
});

/*
  Der ehrliche Spitzenwert, mit den echten Standardwerten.

  Ein Miner mit 50 GH/s, der JEDEN Treffer sofort einreicht -- mehr, als
  ein echter Miner schickt (die GPU-Programme melden hoechstens einen Treffer
  je Stapel). Beginn beim Start-Ziel; der Knoten hebt es Schritt fuer
  Schritt an. Gemessen bei der Entwicklung: hoechstens 133 Shares und 7
  Job-Abrufe in einer Sekunde. Keine einzige Anfrage darf gebremst werden.
*/
test('Ehrlicher schneller Miner (50 GH/s, jeder Treffer): nichts wird gebremst', async () => {
  const k = await knoten(18_807, { absender: 'proxy' }, true);
  try {
    const H = 50e9;
    const ip = '192.0.2.50';
    const id = await sitzung(k.url, 7, ip);
    let job = (await anfrage(k.url, `/job?session=${id}`, undefined, ip)).json;
    let guthaben = 0, letzte = Date.now(), nonce = 0, shares = 0, jobs = 1, spitze = 0;
    const t0 = Date.now();
    const jeSekunde = new Map<number, number>();
    while (Date.now() - t0 < 6_000) {
      await new Promise(r => setTimeout(r, 5));
      const jetzt = Date.now();
      guthaben += (jetzt - letzte) / 1000 * H / (Number(job.shareDifficulty) * 65536);
      letzte = jetzt;
      const n = Math.floor(guthaben); guthaben -= n;
      const sek = Math.floor((jetzt - t0) / 1000);
      jeSekunde.set(sek, (jeSekunde.get(sek) ?? 0) + n);
      const antworten = await Promise.all(Array.from({ length: n }, () =>
        anfrage(k.url, '/share', { sessionId: id, jobId: job.jobId, nonce: String(nonce++) }, ip)));
      shares += n;
      let neu = false;
      for (const a of antworten) {
        assert.equal(a.status, 200);
        assert.notEqual(a.json.reason, 'rate_limited');
        if (!a.json.accepted) neu = true;
      }
      if (neu) {
        guthaben = 0;
        const r = await anfrage(k.url, `/job?session=${id}`, undefined, ip);
        assert.equal(r.status, 200);
        job = r.json; jobs++;
      }
    }
    spitze = Math.max(...jeSekunde.values());
    assert.ok(spitze > 20, `die Messung muss eine echte Startspitze erzeugen (war ${spitze}/s)`);
    const st = (await anfrage(k.url, '/status')).json;
    assert.deepEqual(st.miningLimits.rejected, { job: 0, share: 0, sessionsPerIp: 0, totalPerIp: 0 },
      `Spitze ${spitze} Shares/s, ${shares} Shares, ${jobs} Jobs`);
  } finally { await k.zu(); }
});
