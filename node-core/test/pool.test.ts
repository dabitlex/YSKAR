/**
 * Mining im Pool.
 *
 * Node Core laeuft als echte Anwendungsklasse (Testnetz, eigene Ports) und
 * mint mit dem eingebauten Miner in einem Pool. Der Pool ist ein echter
 * Knoten aus denselben Klassen, die auch der Kommandozeilen-Knoten benutzt:
 * MiningServer mit PoolCoordinator, per P2P mit Node Core verbunden.
 *
 * Geprueft wird der ganze Weg: anmelden, Arbeit holen, Shares liefern, die
 * Auszahlung in der Kette wiederfinden -- und was geschieht, wenn der Pool
 * voll ist, keiner ist oder den Miner nicht mehr aufnimmt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../../src/lib/node/fullnode/MiningServer.ts';
import { PeerManager } from '../../src/lib/node/p2p/PeerManager.ts';
import { SyncManager } from '../../src/lib/node/p2p/SyncManager.ts';
import { PoolCoordinator } from '../../src/lib/pool/PoolCoordinator.ts';
import { nameToExtra } from '../../src/lib/chain/finderName.ts';
import { NodeCoreApp } from '../src/main.ts';
import { PoolQuelle, PoolEndgueltig, fragePool } from '../src/PoolQuelle.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const MINER = keypairFromMnemonic(WORTE, '', 0, 0);
const BETREIBER = new Uint8Array(20).fill(0x77);
const FREMD = encodeAddress(new Uint8Array(20).fill(0x55));

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-pool-'));
let naechsterPort = 19_500;
const port = () => naechsterPort++;

async function bis(was: string, pruefe: () => Promise<boolean> | boolean, ms = 60_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (await pruefe()) return;
    await warte(60);
  }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

interface Antwort { status: number; text: string; json: any }

function ruf(p: number, pfad: string, opt: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Antwort> {
  return new Promise((auf, ab) => {
    const req = request({
      host: '127.0.0.1', port: p, path: pfad, method: opt.method ?? 'GET',
      headers: { host: `127.0.0.1:${p}`, ...(opt.headers ?? {}) },
    }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
        auf({ status: res.statusCode ?? 0, text, json });
      });
    });
    req.on('error', ab);
    if (opt.body !== undefined) req.write(opt.body);
    req.end();
  });
}

async function schluessel(gui: number): Promise<string> {
  const m = (await ruf(gui, '/')).text.match(/<meta name="yskar-zugang" content="([0-9a-f]{64})">/);
  assert.ok(m);
  return m![1];
}

const json = (token: string, wert: unknown) => ({
  method: 'POST',
  headers: { 'x-yskar-token': token, 'content-type': 'application/json' },
  body: JSON.stringify(wert),
});

const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16)));

/** Ein Knoten, der einen Pool betreibt -- oder keinen, wenn `pool` fehlt. */
async function poolKnoten(uhr: () => bigint, pool?: { name: string; feeBps: number; maxMiner?: number }) {
  const api = port(), p2p = port();
  const store = new ChainStore(join(ordner(), 'chain.db'), { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const mempool = new TxPool(REGTEST);
  const mining = new MiningCoordinator(chain, store, mempool, REGTEST, uhr);
  const server = new MiningServer({ chain, store, pool: mempool, mining }, { host: '127.0.0.1', port: api, params: REGTEST });
  if (pool) {
    server.poolKoordinator = new PoolCoordinator({
      name: pool.name, feeBps: pool.feeBps, payoutAddress: pool.feeBps > 0 ? BETREIBER : null,
      ...(pool.maxMiner ? { maxMiner: pool.maxMiner } : {}),
    });
    server.blockName = nameToExtra(pool.name);
  }
  let sync: SyncManager;
  const peers = new PeerManager({
    params: REGTEST, agent: 'pool-test/1', listenPort: p2p, seeds: [],
    kette: () => { const t = chain.tip(); return { height: t?.height ?? -1, chainWork: t?.chainWork ?? 0n }; },
    onReady: p => sync.aufPeer(p),
    onMessage: (p, f) => sync.aufNachricht(p, f),
  });
  sync = new SyncManager({ chain, store, peers, params: REGTEST, pool: mempool });
  server.onBlock = (_h, hash) => { sync.kuendigeAn(hexBytes(hash)); };
  await peers.start();
  sync.start();
  await server.listen('127.0.0.1', api);
  return {
    api, p2p, server, chain,
    host: `http://127.0.0.1:${api}`,
    async stop() { sync.stop(); await peers.stop(); await server.close(); store.close(); },
  };
}

function uhrNeu(): () => bigint {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 1_000_000n;
  return () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
}

/** Node Core starten, mit dem Pool-Knoten als Seed. */
async function kern(uhr: () => bigint, seedP2p: number) {
  const k = { gui: port(), api: port(), p2p: port() };
  const basis = ordner();
  const app = new NodeCoreApp({ params: REGTEST, guiPort: k.gui, basis, uhr });
  await app.startGui();
  const token = await schluessel(k.gui);
  assert.equal((await ruf(k.gui, '/api/configure',
    json(token, { dataDir: ordner(), nodePort: k.api, p2pPort: k.p2p, seed: `127.0.0.1:${seedP2p}` }))).status, 200);
  assert.equal((await ruf(k.gui, '/api/start', json(token, {}))).status, 200);
  const stand = async () => (await ruf(k.gui, '/api/status', { headers: { 'x-yskar-token': token } })).json;
  const GET = (pfad: string) => ruf(k.gui, pfad, { headers: { 'x-yskar-token': token } });
  const POST = (pfad: string, wert: unknown) => ruf(k.gui, pfad, json(token, wert));
  return { ...k, app, basis, token, stand, GET, POST };
}

// ---------------------------------------------------------------------------

test('Im Pool: anmelden, Shares liefern, Auszahlung in der Kette', async () => {
  const uhr = uhrNeu();
  const P = await poolKnoten(uhr, { name: 'Testpool Nord', feeBps: 100 });
  const A = await kern(uhr, P.p2p);
  try {
    await bis('Node Core ist mit dem Pool-Knoten verbunden', async () => (await A.stand()).peerCount === 1);

    // Die Liste: die gepflegten Pools und die eigene Adresse -- ohne dass
    // dabei eine Mining-Adresse hinausgeht.
    const liste = (await A.GET('/api/pool/liste?eigen=' + encodeURIComponent(P.host))).json;
    const eigen = liste.pools.find((p: any) => p.eigen);
    assert.ok(eigen, JSON.stringify(liste));
    assert.equal(eigen.host, P.host);
    assert.equal(eigen.status, 'offen');
    assert.equal(eigen.plaetze, 63, 'Mit Gebühr gehört ein Platz dem Betreiber');
    assert.equal(eigen.belegt, 0);
    assert.equal(eigen.feeBps, 100);
    assert.equal(eigen.kette, 'Testpool Nord');
    assert.equal(eigen.anzeige, 'Testpool Nord');
    assert.equal(liste.pools[0].anzeige, 'YSKAR Main', 'Pools der Liste heißen wie in der Liste');
    assert.equal(eigen.dabei, undefined, 'Die Liste fragt ohne Adresse');
    assert.equal((await A.GET('/api/pool/liste?eigen=' + encodeURIComponent('kein pool'))).json.eigenFehler !== null, true);

    // Ohne Pool-Angabe startet nichts.
    const ohne = await A.POST('/api/mining/start', { address: MINER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'pool' });
    assert.equal(ohne.status, 400);
    assert.equal(ohne.json.code, 'pool_fehlt');

    const los = await A.POST('/api/mining/start',
      { address: MINER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: P.host });
    assert.equal(los.status, 200, JSON.stringify(los.json));
    assert.equal(los.json.status.pool.host, P.host);
    assert.equal(los.json.status.pool.name, 'Testpool Nord', 'Eine eigene Adresse heißt, wie der Pool sich in seinen Blöcken nennt');
    assert.equal(los.json.status.config.ziel, 'pool');

    // Der Pool sieht einen Miner. Node Core zaehlt ihn NICHT noch einmal selbst.
    await bis('Der Pool zählt den Miner', async () => (await ruf(P.api, '/api/v2/pool')).json.miner === 1);
    assert.equal((await ruf(A.api, '/summary')).json.miningSessions, 0,
      'Im Pool zählt der Pool-Knoten die Sitzung, nicht der eigene');

    // Shares werden angenommen: Der Header, den Node Core aus den Feldern
    // des Jobs baut, ist derselbe, den der Pool nachrechnet.
    await bis('Der Pool nimmt Shares an', async () => (await A.stand()).mining.pool.angenommen >= 2);
    const s = (await A.stand()).mining;
    assert.equal(s.running, true);
    assert.equal(s.pool.verbunden, true);
    assert.equal(s.pool.abgelehnt, 0);
    assert.ok(s.cpu.hashrate > 0);
    assert.equal(s.pool.stand.kette, 'Testpool Nord');

    // Im Testnetz ist jeder Share ein Block. Er entsteht beim POOL und
    // kommt ueber P2P hierher -- mit der Auszahlung an die Adresse des Miners.
    await bis('Die Auszahlung steht in der Kette von Node Core', async () => (await A.stand()).mining.pool.auszahlung !== null);
    const a = (await A.stand()).mining.pool.auszahlung;
    assert.equal(a.name, 'Testpool Nord');
    assert.ok(BigInt(a.betrag) > 0n);
    const block = (await A.GET('/api/lesen/blocks/' + a.hoehe)).json;
    assert.equal(block.recipients, 2, 'Miner und Betreiber');
    assert.equal(block.finder, 'Testpool Nord');

    // Die Blöcke des Pools: aus der eigenen Kette gezählt.
    await bis('Die Liste zählt die Blöcke des Pools', async () => {
      const l = (await A.GET('/api/pool/liste?eigen=' + encodeURIComponent(P.host))).json;
      return (l.pools.find((p: any) => p.eigen)?.bloecke ?? 0) >= 1;
    });

    // Stoppen meldet ab: Der Platz ist sofort wieder frei.
    assert.equal((await A.POST('/api/mining/stop', {})).status, 200);
    const danach = (await ruf(P.api, '/api/v2/pool')).json;
    assert.equal(danach.miner, 0);
    assert.equal(danach.belegt, 0);
    const aus = (await A.stand()).mining;
    assert.equal(aus.running, false);
    assert.equal(aus.pool, null);

    // Danach geht Solo wieder ueber den eigenen Knoten.
    const solo = await A.POST('/api/mining/start', { address: MINER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'solo' });
    assert.equal(solo.status, 200, JSON.stringify(solo.json));
    const hoehe = (await A.stand()).height;
    await bis('Solo findet Node Core wieder eigene Blöcke', async () => (await A.stand()).height > hoehe);
    assert.equal((await ruf(A.api, '/summary')).json.miningSessions, 1);
    assert.equal((await ruf(P.api, '/api/v2/pool')).json.miner, 0);
    await A.POST('/api/mining/stop', {});
  } finally {
    await A.app.shutdown();
    await P.stop();
  }
});

test('Pool voll, kein Pool, keine Antwort: Der Start sagt warum, und nichts rechnet', async () => {
  const uhr = uhrNeu();
  const voll = await poolKnoten(uhr, { name: 'Kleiner Pool', feeBps: 0, maxMiner: 1 });
  const ohne = await poolKnoten(uhr);
  const A = await kern(uhr, voll.p2p);
  try {
    // Ein Fremder belegt den einzigen Platz.
    const fremd = await fetch(`${voll.host}/api/v2/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: FREMD, mode: 'pool' }),
    });
    assert.equal(fremd.status, 200);

    const liste = (await A.GET('/api/pool/liste?eigen=' + encodeURIComponent(voll.host))).json;
    assert.equal(liste.pools.find((p: any) => p.eigen).status, 'voll');

    const r1 = await A.POST('/api/mining/start', { address: MINER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: voll.host });
    assert.equal(r1.status, 400);
    assert.equal(r1.json.code, 'pool_full');

    const r2 = await A.POST('/api/mining/start', { address: MINER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: ohne.host });
    assert.equal(r2.status, 400);
    assert.equal(r2.json.code, 'pool_unavailable');

    const r3 = await A.POST('/api/mining/start', { address: MINER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: `http://127.0.0.1:${port()}` });
    assert.equal(r3.status, 400);
    assert.equal(r3.json.code, 'pool_aus');

    const s = (await A.stand()).mining;
    assert.equal(s.running, false, 'Nach einer Ablehnung rechnet nichts -- auch nicht solo');
    assert.equal(s.pool, null);
    assert.equal((await ruf(voll.api, '/api/v2/pool')).json.miner, 1, 'Nur der Fremde ist im Pool');
  } finally {
    await A.app.shutdown();
    await voll.stop();
    await ohne.stop();
  }
});

test('Nimmt der Pool den Miner nicht mehr auf, stoppt das Mining -- es rechnet nicht solo weiter', async () => {
  const uhr = uhrNeu();
  const P = await poolKnoten(uhr, { name: 'Wackelpool', feeBps: 0 });
  const A = await kern(uhr, P.p2p);
  try {
    await bis('verbunden', async () => (await A.stand()).peerCount === 1);
    const los = await A.POST('/api/mining/start', { address: MINER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: P.host });
    assert.equal(los.status, 200, JSON.stringify(los.json));
    await bis('Der Pool nimmt Shares an', async () => (await A.stand()).mining.pool?.angenommen >= 1);

    // Der Betreiber schaltet den Pool ab; die Sitzungen sind weg.
    P.server.poolKoordinator = null;
    (P.server as any).sessions.clear();

    await bis('Das Mining hat gestoppt', async () => (await A.stand()).mining.running === false);
    const s = (await A.stand()).mining;
    assert.equal(s.pool, null);
    assert.equal(s.poolEnde.code, 'pool_unavailable');
    assert.equal(s.poolEnde.pool, 'Wackelpool');
    assert.equal(s.cpu.running, false);
    // Und es bleibt dabei: kein stiller Wechsel zu Solo.
    const hoehe = (await A.stand()).height;
    await warte(1500);
    assert.equal((await A.stand()).height, hoehe);
    assert.equal((await ruf(A.api, '/summary')).json.miningSessions, 0);
  } finally {
    await A.app.shutdown();
    await P.stop();
  }
});

// ------------------------------------------------- PoolQuelle gegen Unsinn

/** Ein "Pool", der antwortet, was der Test vorgibt. */
async function falscherPool(antwort: (pfad: string, rumpf: any) => { status?: number; kopf?: Record<string, string>; body: unknown } | Buffer):
    Promise<{ basis: string; server: Server; rufe: string[] }> {
  const rufe: string[] = [];
  const server = createServer((req, res) => {
    let roh = '';
    req.on('data', c => { roh += c; });
    req.on('end', () => {
      const pfad = String(req.url);
      rufe.push(`${req.method} ${pfad}`);
      let rumpf: any = null;
      try { rumpf = roh ? JSON.parse(roh) : null; } catch { /* egal */ }
      const a = antwort(pfad, rumpf);
      if (Buffer.isBuffer(a)) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(a); return; }
      res.writeHead(a.status ?? 200, { 'content-type': 'application/json', ...(a.kopf ?? {}) });
      res.end(JSON.stringify(a.body));
    });
  });
  const p = port();
  await new Promise<void>(auf => server.listen(p, '127.0.0.1', auf));
  return { basis: `http://127.0.0.1:${p}/api/v2`, server, rufe };
}

const guterJob = {
  jobId: 'a'.repeat(32), height: 5, version: 1,
  prevHash: '11'.repeat(32), merkleRoot: '22'.repeat(32), stateRoot: '33'.repeat(32),
  timestamp: '1700000000', difficulty: 7, difficultyWert: '7', txCount: 1, extranonce: '9',
  target: '0000' + 'ff'.repeat(30), shareDifficulty: '128',
};

test('PoolQuelle: Der Header entsteht aus den Feldern, Byte für Byte', async () => {
  const f = await falscherPool(pfad => pfad.endsWith('/session')
    ? { body: { sessionId: 's1', mode: 'pool', shareDifficulty: '128' } }
    : { body: guterJob });
  try {
    const q = new PoolQuelle(f.basis, 'test/1');
    const job = await q.createJob(MINER.addressRaw);
    const h = Buffer.from(job.header, 'hex');
    assert.equal(h.length, 136);
    assert.equal(h.readUInt32LE(0), 1);
    assert.equal(h.readUInt32LE(4), 5);
    assert.equal(h.subarray(8, 40).toString('hex'), '11'.repeat(32));
    assert.equal(h.subarray(40, 72).toString('hex'), '22'.repeat(32));
    assert.equal(h.subarray(72, 104).toString('hex'), '33'.repeat(32));
    assert.equal(h.readBigUInt64LE(104), 1700000000n);
    assert.equal(h.readUInt32LE(112), 7, 'Das rohe Difficulty-Feld, unverändert');
    assert.equal(h.readUInt32LE(116), 1);
    assert.equal(h.readBigUInt64LE(120), 9n);
    assert.equal(h.readBigUInt64LE(128), 0n);
    assert.equal(job.target, guterJob.target);
    assert.equal(q.stand().shareDifficulty, '128');
    assert.deepEqual(f.rufe.slice(0, 2), ['POST /api/v2/session', 'GET /api/v2/job?session=s1']);
  } finally { f.server.close(); }
});

test('PoolQuelle: Unlesbare Arbeit kommt nicht bis zum Miner', async () => {
  const kaputt: Record<string, unknown>[] = [
    { ...guterJob, target: 'ff'.repeat(4000) },                 // viel zu lang
    { ...guterJob, target: 'zz'.repeat(32) },                   // kein Hex
    { ...guterJob, target: 'ff'.repeat(32) },                   // jeder Hash waere ein Treffer
    { ...guterJob, target: '00' + 'ff'.repeat(31) },            // leichter als Difficulty 1
    { ...guterJob, target: '00'.repeat(32) },                   // nichts waere je ein Treffer
    { ...guterJob, prevHash: '11'.repeat(31) },                 // zu kurz
    { ...guterJob, height: -1 },
    { ...guterJob, height: 2 ** 40 },
    { ...guterJob, difficulty: 2 ** 33 },
    { ...guterJob, timestamp: '99999999999999999999999' },
    { ...guterJob, extranonce: 'abc' },
    { ...guterJob, jobId: 'x\n{"t":"quit"}' },                  // Zeilenumbruch -- ginge sonst an das GPU-Programm
    { ...guterJob, jobId: 'a'.repeat(500) },
    { ...guterJob, merkleRoot: 12345 },
  ];
  for (const job of kaputt) {
    const f = await falscherPool(pfad => pfad.endsWith('/session')
      ? { body: { sessionId: 's1', mode: 'pool', shareDifficulty: '128' } } : { body: job });
    try {
      const q = new PoolQuelle(f.basis, 'test/1');
      await assert.rejects(() => q.createJob(MINER.addressRaw), /unlesbare Arbeit/, JSON.stringify(job).slice(0, 80));
      assert.match(String(q.stand().fehler), /unlesbare Arbeit/);
    } finally { f.server.close(); }
  }
});

test('PoolQuelle: zu große Antwort, Umleitung, stille Solo-Sitzung', async () => {
  // Eine Antwort, die nicht aufhoert: Bei 64 KB ist Schluss.
  const gross = await falscherPool(() => Buffer.from('{"sessionId":"' + 'a'.repeat(200_000) + '"}'));
  try {
    await assert.rejects(() => new PoolQuelle(gross.basis, 'test/1').createJob(MINER.addressRaw), /zu groß/);
  } finally { gross.server.close(); }

  // Einer Umleitung wird nicht gefolgt.
  const ziel = await falscherPool(() => ({ body: { sessionId: 'fremd', mode: 'pool' } }));
  const um = await falscherPool(() => ({ status: 307, kopf: { location: ziel.basis + '/session' }, body: {} }));
  try {
    await assert.rejects(() => new PoolQuelle(um.basis, 'test/1').createJob(MINER.addressRaw));
    assert.equal(ziel.rufe.length, 0, 'Das Ziel der Umleitung wurde nie gefragt');
    const stand = await fragePool({ host: um.basis.replace('/api/v2', ''), name: 'x' }, 'test/1');
    assert.equal(stand.status, 'aus');
  } finally { um.server.close(); ziel.server.close(); }

  // Ein Knoten, der die Pool-Sitzung still als Solo fuehrt: endgueltig nein,
  // und die Sitzung wird wieder abgemeldet.
  const solo = await falscherPool(pfad => pfad.endsWith('/session')
    ? { body: { sessionId: 's9', mode: 'solo', shareDifficulty: '128' } } : { body: { stopped: true } });
  try {
    const q = new PoolQuelle(solo.basis, 'test/1');
    let gemeldet: PoolEndgueltig | null = null;
    q.onEndgueltig = e => { gemeldet = e; };
    await assert.rejects(() => q.createJob(MINER.addressRaw), (e: any) => e instanceof PoolEndgueltig && e.code === 'pool_unavailable');
    assert.equal((gemeldet as PoolEndgueltig | null)?.code, 'pool_unavailable');
    await warte(100);
    assert.ok(solo.rufe.includes('POST /api/v2/session/stop'));
  } finally { solo.server.close(); }

  // Voll: HTTP 409 mit pool_full.
  const voll = await falscherPool(() => ({ status: 409, body: { error: 'pool_full', detail: 'Pool voll' } }));
  try {
    await assert.rejects(() => new PoolQuelle(voll.basis, 'test/1').createJob(MINER.addressRaw),
      (e: any) => e instanceof PoolEndgueltig && e.code === 'pool_full');
  } finally { voll.server.close(); }
});

test('PoolQuelle: Treffer auf einem ersetzten Job gehen nicht mehr ins Netz', async () => {
  let nr = 0;
  const f = await falscherPool((pfad, rumpf) => {
    if (pfad.endsWith('/session')) return { body: { sessionId: 's1', mode: 'pool', shareDifficulty: '128' } };
    if (pfad.includes('/job')) { nr++; return { body: { ...guterJob, jobId: 'job' + nr } }; }
    if (pfad.endsWith('/share')) {
      return rumpf.jobId === 'job' + nr
        ? { body: { accepted: true, block: false, shareDifficulty: nr === 2 ? '512' : '128', achieved: '300' } }
        : { body: { accepted: false, reason: 'job_foreign' } };
    }
    return { body: {} };
  });
  try {
    const q = new PoolQuelle(f.basis, 'test/1');
    const j1 = await q.createJob(MINER.addressRaw);
    const r1 = await q.submitNonce(j1.jobId, 1n);
    assert.equal(r1.ok, true);
    assert.equal((r1 as any).neuerJob, false, 'Gleiches Share-Ziel: kein neuer Job nötig');

    const j2 = await q.createJob(MINER.addressRaw);
    const vorher = f.rufe.length;
    const alt = await q.submitNonce(j1.jobId, 2n);
    assert.deepEqual(alt, { ok: false, grund: 'job_ersetzt' });
    assert.equal(f.rufe.length, vorher, 'Für den alten Job geht nichts mehr hinaus');

    const r2 = await q.submitNonce(j2.jobId, 3n);
    assert.equal((r2 as any).neuerJob, true, 'Das Share-Ziel hat sich geändert');
    assert.equal(q.stand().shareDifficulty, '512');
    assert.equal(q.stand().angenommen, 2);
    assert.equal(q.stand().abgelehnt, 0);

    await q.beenden();
    assert.ok(f.rufe.includes('POST /api/v2/session/stop'));
    await assert.rejects(() => q.createJob(MINER.addressRaw), /gestoppt/);
  } finally { f.server.close(); }
});

test('mining.json aus einer älteren Fassung: Ziel ist solo, ein unzulässiger Pool wird verworfen', async () => {
  const basis = ordner();
  writeFileSync(join(basis, 'mining.json'), JSON.stringify({ address: MINER.address, mode: 'cpu', cpuWorkers: 1 }));
  const gui = port();
  const app = new NodeCoreApp({ params: REGTEST, guiPort: gui, basis });
  await app.startGui();
  try {
    const t = await schluessel(gui);
    const c = (await ruf(gui, '/api/status', { headers: { 'x-yskar-token': t } })).json.mining.config;
    assert.equal(c.ziel, 'solo');
    assert.equal(c.poolHost, '');
    assert.equal(c.address, MINER.address);
  } finally { await app.shutdown(); }

  const basis2 = ordner();
  writeFileSync(join(basis2, 'mining.json'), JSON.stringify({ address: MINER.address, ziel: 'pool', poolHost: 'javascript:alert(1) //' }));
  const gui2 = port();
  const app2 = new NodeCoreApp({ params: REGTEST, guiPort: gui2, basis: basis2 });
  await app2.startGui();
  try {
    const t = await schluessel(gui2);
    const c = (await ruf(gui2, '/api/status', { headers: { 'x-yskar-token': t } })).json.mining.config;
    assert.equal(c.ziel, 'pool');
    assert.equal(c.poolHost, '', 'Keine Adresse eines Pools');
  } finally { await app2.shutdown(); }
});
