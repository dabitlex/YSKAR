/**
 * Plaetze und Sitzungen ohne Arbeit (Befund S3).
 *
 *   - Eine Pool-Sitzung OHNE einen einzigen Share haelt ihren Platz zwei
 *     Minuten lang (vorher zehn). Danach braucht es einen Share.
 *   - Kennt der Knoten den Absender (--sender-ip), halten je Absender
 *     hoechstens zwei solche Sitzungen einen Platz auf Probe, und er haelt
 *     hoechstens 32 Sitzungen ohne Share je Absender -- die naechste
 *     Anmeldung verdraengt die aelteste davon.
 *   - Ohne --sender-ip gelten keine Grenzen je Absender (wie bisher).
 *
 * Wer schon einen Share geliefert hat, wird nie verdraengt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer, type AbsenderQuelle } from '../src/lib/node/fullnode/MiningServer.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { encodeAddress } from '../src/lib/core/address.ts';

const adr = (n: number) => encodeAddress(new Uint8Array(20).fill(n));

async function knoten(port: number, max: number, absender: AbsenderQuelle = null) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  let sek = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => (sek += 600n));
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST, absender });
  server.poolKoordinator = new PoolCoordinator({ name: 'pool.test', feeBps: 0, payoutAddress: null, maxMiner: max });
  // Treffer ohne Rechnen: jede Nonce erreicht 5000 (ueber 128, kein Block).
  (mining as any).submitNonce = () => ({ ok: true, block: false, achieved: '5000' });
  await server.listen('127.0.0.1', port);
  const url = `http://127.0.0.1:${port}/api/v2`;
  const hole = async (pfad: string, body?: unknown, von?: string) => {
    const kopf: Record<string, string> = { 'content-type': 'application/json' };
    if (von) kopf['x-forwarded-for'] = von;
    const res = await fetch(url + pfad, body === undefined ? { headers: kopf }
      : { method: 'POST', headers: kopf, body: JSON.stringify(body) });
    return { status: res.status, ...(await res.json() as Record<string, any>) };
  };
  return {
    server, hole,
    anmelden: (address: string, von?: string, mode = 'pool') => hole('/session', { address, mode }, von),
    async share(sessionId: string, nonce = '1') {
      const job = await hole(`/job?session=${sessionId}`);
      return hole('/share', { sessionId, jobId: job.jobId, nonce });
    },
    sitzungen: () => (server as any).sessions as Map<string, any>,
    async zu() { await server.close(); store.close(); },
  };
}

const ECHT = Date.now.bind(Date);
function uhrVor(ms: number) { Date.now = () => ECHT() + ms; return () => { Date.now = ECHT; }; }

test('Ohne Share haelt eine Anmeldung ihren Platz zwei Minuten -- nicht mehr zehn', async () => {
  const k = await knoten(18_831, 1);
  let zurueck = () => {};
  try {
    await k.anmelden(adr(1));
    assert.equal((await k.anmelden(adr(2))).status, 409, 'sofort: der Platz gilt');
    zurueck = uhrVor(90_000);
    assert.equal((await k.anmelden(adr(2))).status, 409, 'nach 90 Sekunden noch');
    zurueck = uhrVor(150_000);
    const b = await k.anmelden(adr(2));
    assert.equal(b.status, 200, 'nach zweieinhalb Minuten ohne Share ist der Platz frei');
  } finally { zurueck(); await k.zu(); }
});

test('Mit Share haelt eine Sitzung ihren Platz wie bisher zehn Minuten ab dem letzten Share', async () => {
  const k = await knoten(18_832, 1);
  let zurueck = () => {};
  try {
    const a = await k.anmelden(adr(1));
    assert.equal((await k.share(a.sessionId)).accepted, true);
    zurueck = uhrVor(4 * 60_000);
    assert.equal((await k.anmelden(adr(2))).status, 409, 'vier Minuten nach dem Share: belegt');
    zurueck = uhrVor(9 * 60_000);
    assert.equal((await k.anmelden(adr(2))).status, 409, 'neun Minuten: belegt');
  } finally { zurueck(); await k.zu(); }
});

test('--sender-ip proxy: je Absender hoechstens zwei Plaetze auf Probe; der letzte Eintrag zaehlt', async () => {
  const k = await knoten(18_833, 3, 'proxy');
  try {
    // Der Absender schreibt selbst etwas davor -- zaehlen darf nur, was der Proxy anhaengt.
    for (const n of [1, 2, 3]) assert.equal((await k.anmelden(adr(n), `1.2.3.${n}, 9.9.9.9`)).status, 200);
    for (const s of k.sitzungen().values()) assert.equal(s.absender, '9.9.9.9');
    const stand = await k.hole('/pool');
    assert.equal(stand.belegt, 2, 'drei Anmeldungen von einem Anschluss halten zwei Plaetze');
    assert.equal((await k.anmelden(adr(4), '8.8.8.8')).status, 200, 'der dritte Platz bleibt fuer andere');
    assert.equal((await k.anmelden(adr(5), '7.7.7.7')).status, 409, 'jetzt ist der Pool voll');
  } finally { await k.zu(); }
});

test('--sender-ip proxy: Wer liefert, haelt seinen Platz -- egal wie viele vom selben Anschluss kommen', async () => {
  const k = await knoten(18_834, 4, 'proxy');
  try {
    const ids: string[] = [];
    for (const n of [1, 2, 3]) ids.push((await k.anmelden(adr(n), '9.9.9.9')).sessionId);
    for (const id of ids) assert.equal((await k.share(id)).accepted, true);
    assert.equal((await k.hole('/pool')).belegt, 3, 'drei mit Share: drei Plaetze');
  } finally { await k.zu(); }
});

test('--sender-ip proxy: hoechstens 32 Sitzungen ohne Share je Absender -- die aelteste macht Platz', async () => {
  const k = await knoten(18_835, 64, 'proxy');
  try {
    const mitShare = (await k.anmelden(adr(200), '9.9.9.9', 'solo')).sessionId;
    assert.equal((await k.share(mitShare)).accepted, true);
    const ohne: string[] = [];
    for (let i = 0; i < 33; i++) ohne.push((await k.anmelden(adr(100 + i), '9.9.9.9', 'solo')).sessionId);
    const vonDort = [...k.sitzungen().values()].filter(s => s.absender === '9.9.9.9');
    assert.equal(vonDort.filter(s => s.angenommen === 0).length, 32);
    assert.ok(k.sitzungen().has(mitShare), 'wer geliefert hat, bleibt');
    assert.equal((await k.hole(`/job?session=${ohne[0]}`)).error, 'session_inactive', 'die aelteste ist weg');
    assert.ok((await k.hole(`/job?session=${ohne[32]}`)).jobId, 'die neueste ist da');
    // Ein anderer Anschluss ist davon nicht betroffen.
    assert.equal((await k.anmelden(adr(250), '8.8.8.8', 'solo')).status, 200);
  } finally { await k.zu(); }
});

test('Ohne --sender-ip: keine Grenzen je Absender -- wie bisher', async () => {
  const k = await knoten(18_836, 64);
  try {
    for (let i = 0; i < 40; i++) assert.equal((await k.anmelden(adr(100 + i), '9.9.9.9', 'solo')).status, 200);
    assert.equal(k.sitzungen().size, 40);
    for (const s of k.sitzungen().values()) assert.equal(s.absender, null);
    // Und drei Pool-Anmeldungen halten drei Plaetze auf Probe.
    for (const n of [1, 2, 3]) await k.anmelden(adr(n), '9.9.9.9');
    assert.equal((await k.hole('/pool')).belegt, 3);
  } finally { await k.zu(); }
});

test('500: Der Fehlertext bleibt im Protokoll des Knotens und geht nicht nach aussen', async () => {
  const k = await knoten(18_837, 64);
  try {
    const protokoll: string[] = [];
    k.server.onFehler = (wo, e) => protokoll.push(`${wo}: ${e.message}`);
    (k.server as any).lesen.behandle = () => { throw new Error('geheim: /home/yskar/knoten/chain.db'); };
    const r = await k.hole('/summary');
    assert.equal(r.status, 500);
    assert.equal(r.error, 'internal');
    assert.doesNotMatch(JSON.stringify(r), /geheim|chain\.db/);
    assert.equal(r.where, 'GET /summary');
    assert.match(protokoll.join('\n'), /geheim/, 'der Betreiber sieht ihn');
  } finally { await k.zu(); }
});

test('Weitergabe an den Spiegel: Antwortet die Gegenstelle nie, endet sie nach der Frist', async () => {
  const { createServer } = await import('node:http');
  const haengt = createServer(() => { /* nimmt an, antwortet nie */ });
  await new Promise<void>(r => haengt.listen(0, '127.0.0.1', r));
  const port = (haengt.address() as { port: number }).port;
  const k = await knoten(18_838, 64);
  try {
    // Einen Block finden lassen (Testnetz: jeder Treffer ist ein Block) und weitergeben.
    const server: any = k.server;
    const coord = server.mining;
    const job = coord.createJob(new Uint8Array(20).fill(1), 1n);
    const { finalizeBlock } = await import('../src/lib/core/builder.ts');
    const { serializeBlock, headerHash } = await import('../src/lib/core/block.ts');
    const { targetFromDifficulty } = await import('../src/lib/core/params.ts');
    const offen = coord.offen.get(job.jobId);
    let block;
    for (let n = 0n; ; n++) {
      block = finalizeBlock(offen.gebaut, n);
      const h = headerHash(block.header);
      let w = 0n; for (const b of h) w = (w << 8n) | BigInt(b);
      if (w <= targetFromDifficulty(block.header.difficulty)) break;
    }
    assert.ok(server.chain.accept(serializeBlock(block)).ok);
    const hash = Buffer.from(headerHash(block.header)).toString('hex');

    server.upstream = `http://127.0.0.1:${port}`;
    server.weitergabeFristMs = 300;
    let ergebnis: any = null;
    server.onUpstream = (e: unknown) => { ergebnis = e; };
    const t0 = Date.now();
    await server.weitergeben(hash);
    assert.ok(Date.now() - t0 < 3_000, `dauerte ${Date.now() - t0} ms`);
    assert.equal(ergebnis?.ok, false);
  } finally {
    await k.zu();
    haengt.closeAllConnections();
    await new Promise<void>(r => haengt.close(() => r()));
  }
});
