/**
 * Mining-Schnittstelle des Knotens.
 *
 * Geprueft wird ueber HTTP, genau so, wie der bestehende Miner spricht.
 * Damit ist festgehalten, dass er unveraendert gegen einen lokalen Knoten
 * laufen kann -- und bleibt es auch, wenn hier jemand etwas aendert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2.js';
import { createServer } from 'node:http';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { MINER_A } from './helpers/regtest.ts';

const ADRESSE = encodeAddress(MINER_A);

async function knoten(port: number) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  // Gesetzte Uhr, wie in mining.test.ts: Sonst klettert die Difficulty mit
  // jedem Block, und der Test hinge an der Maschinenlast.
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => {
    const t = uhr;
    uhr += REGTEST.targetBlockTime;
    return t;
  });
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  await server.listen('127.0.0.1', port);
  const url = `http://127.0.0.1:${port}/api/v2`;
  return {
    store, chain, pool, server, url,
    async zu() { await server.close(); store.close(); },
  };
}

const hole = async (url: string, pfad: string, body?: unknown) => {
  const res = await fetch(url + pfad, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, any>>;
};

/** Nonce suchen wie ein echter Miner: selbst hashen, Treffer einreichen. */
function sucheNonce(job: Record<string, any>, zielHex: string): bigint {
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

  const ziel = fromHex(zielHex);
  for (let n = 0n; n < 5_000_000n; n++) {
    dv.setBigUint64(128, n, true);
    const h = sha256(sha256(kopf));
    let kleiner = true;
    for (let i = 0; i < 32; i++) {
      if (h[i] !== ziel[i]) { kleiner = h[i] < ziel[i]; break; }
    }
    if (kleiner) return n;
  }
  throw new Error(`kein Treffer bei Difficulty ${job.difficulty}`);
}

test('Der Knoten spricht das Protokoll des bestehenden Miners', async () => {
  const k = await knoten(18651);
  try {
    const s = await hole(k.url, '/session', { address: ADRESSE, platform: 'test' });
    assert.ok(s.sessionId, 'sessionId fehlt');
    assert.ok(s.extranonce, 'extranonce fehlt');
    assert.ok(s.shareDifficulty, 'shareDifficulty fehlt');
    assert.equal(s.concurrentSessions, 1);

    const job = await hole(k.url, `/job?session=${s.sessionId}`);
    // Genau die Felder, die miner/src/hasher.mjs und cli.mjs lesen.
    for (const feld of ['jobId', 'height', 'version', 'prevHash', 'merkleRoot',
                        'stateRoot', 'timestamp', 'difficulty', 'txCount',
                        'extranonce', 'target', 'shareDifficulty']) {
      assert.ok(job[feld] !== undefined, `Feld ${feld} fehlt im Job`);
    }
    assert.equal(job.height, 0);
    assert.equal(job.extranonce, s.extranonce,
      'Die Extranonce der Session muss im Job stehen');
  } finally { await k.zu(); }
});

test('Ein gefundener Block wird angenommen und landet in der Kette', async () => {
  const k = await knoten(18652);
  try {
    const s = await hole(k.url, '/session', { address: ADRESSE });
    const job = await hole(k.url, `/job?session=${s.sessionId}`);

    // Gegen das BLOCKziel suchen, nicht das Shareziel -- wir wollen einen Block.
    const blockZiel = toHex(zielBytes((1n << 240n) / BigInt(job.difficulty)));
    const nonce = sucheNonce(job, blockZiel);

    const r = await hole(k.url, '/share',
      { sessionId: s.sessionId, jobId: job.jobId, nonce: nonce.toString() });

    assert.equal(r.accepted, true, JSON.stringify(r));
    assert.equal(r.block, true);
    assert.equal(r.height, 0);
    assert.equal(r.reward, '87500000000');
    assert.equal(k.chain.height(), 0, 'Der Block muss in der Kette stehen');
    assert.equal(toHex(k.chain.tip()!.hash), r.hash);
  } finally { await k.zu(); }
});

test('Ein zu schwacher Share wird abgelehnt, mit ehrlicher Angabe', async () => {
  const k = await knoten(18653);
  try {
    const s = await hole(k.url, '/session', { address: ADRESSE });
    const job = await hole(k.url, `/job?session=${s.sessionId}`);

    // Nonce 0 trifft das Shareziel fast sicher nicht.
    const r = await hole(k.url, '/share',
      { sessionId: s.sessionId, jobId: job.jobId, nonce: '0' });

    if (!r.accepted) {
      assert.equal(r.reason, 'low_difficulty');
      assert.ok(BigInt(r.achieved) >= 0n, 'erreichte Difficulty muss dabeistehen');
      assert.ok(BigInt(r.required) > 0n);
    }
    assert.equal(k.chain.height(), -1, 'Ohne Treffer kein Block');
  } finally { await k.zu(); }
});

test('Ein fremder Job wird abgewiesen', async () => {
  const k = await knoten(18654);
  try {
    const a = await hole(k.url, '/session', { address: ADRESSE });
    const b = await hole(k.url, '/session', { address: ADRESSE });
    const jobA = await hole(k.url, `/job?session=${a.sessionId}`);

    // Session B reicht auf den Job von A ein. Ohne Prüfung könnten zwei
    // Sessions dieselbe Nonce auf denselben Job einreichen.
    const r = await hole(k.url, '/share',
      { sessionId: b.sessionId, jobId: jobA.jobId, nonce: '1' });
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'job_foreign');
  } finally { await k.zu(); }
});

test('Jede Session bekommt eine eigene Extranonce', async () => {
  const k = await knoten(18655);
  try {
    const a = await hole(k.url, '/session', { address: ADRESSE });
    const b = await hole(k.url, '/session', { address: ADRESSE });
    assert.notEqual(a.extranonce, b.extranonce,
      'Gleiche Extranonce hieße: beide durchsuchen denselben Nonce-Raum');
    assert.equal(b.concurrentSessions, 2);

    const jobA = await hole(k.url, `/job?session=${a.sessionId}`);
    const jobB = await hole(k.url, `/job?session=${b.sessionId}`);
    assert.notEqual(jobA.jobId, jobB.jobId);
  } finally { await k.zu(); }
});

test('Eine unbekannte Session bekommt keinen Job', async () => {
  const k = await knoten(18656);
  try {
    const r = await hole(k.url, '/job?session=00000000-0000-0000-0000-000000000000');
    assert.equal(r.error, 'session_inactive');
  } finally { await k.zu(); }
});

function zielBytes(ziel: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = ziel;
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}

// ------------------------------------------------------- Weitergabe

/**
 * Die Einreichroute des Servers laesst sich hier nicht starten -- sie
 * braucht Next.js und Supabase. Geprueft wird deshalb die Gegenseite: dass
 * der Knoten einen gefundenen Block vollstaendig und unveraendert
 * weitergibt, und dass er mit einer Ablehnung umgehen kann.
 */
test('Ein gefundener Block wird unverändert weitergereicht', async () => {
  const k = await knoten(18657);
  const empfangen: string[] = [];
  let antwort: Record<string, unknown> = { accepted: true, height: 0 };

  const gegenstelle = createServer((req, res) => {
    let roh = '';
    req.on('data', c => { roh += c; });
    req.on('end', () => {
      empfangen.push(JSON.parse(roh).raw);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(antwort));
    });
  });
  await new Promise<void>(auf => gegenstelle.listen(18757, '127.0.0.1', auf));

  const gemeldet: { ok: boolean; grund?: string }[] = [];
  k.server.upstream = 'http://127.0.0.1:18757';
  k.server.onUpstream = e => gemeldet.push(e);

  try {
    const s = await hole(k.url, '/session', { address: ADRESSE });
    const job = await hole(k.url, `/job?session=${s.sessionId}`);
    const blockZiel = toHex(zielBytes((1n << 240n) / BigInt(job.difficulty)));
    const nonce = sucheNonce(job, blockZiel);
    const r = await hole(k.url, '/share',
      { sessionId: s.sessionId, jobId: job.jobId, nonce: nonce.toString() });
    assert.equal(r.block, true);

    // Die Weitergabe laeuft nebenher, damit der Miner nicht wartet.
    await new Promise(auf => setTimeout(auf, 200));

    assert.equal(empfangen.length, 1, 'genau eine Weitergabe');
    const gespeichert = k.store.get(fromHex(r.hash))!;
    assert.equal(empfangen[0], toHex(gespeichert.body),
      'Weitergegeben werden muss genau das, was lokal geprüft wurde');
    assert.equal(gemeldet[0]?.ok, true);
  } finally {
    await new Promise<void>(auf => gegenstelle.close(() => auf()));
    await k.zu();
  }
});

test('Eine Ablehnung der Gegenstelle wird gemeldet, nicht verschluckt', async () => {
  const k = await knoten(18658);
  const gegenstelle = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'stale',
                               detail: 'Höhe 0, Kette steht bei 5' }));
    });
  });
  await new Promise<void>(auf => gegenstelle.listen(18758, '127.0.0.1', auf));

  const gemeldet: { ok: boolean; grund?: string }[] = [];
  k.server.upstream = 'http://127.0.0.1:18758';
  k.server.onUpstream = e => gemeldet.push(e);

  try {
    const s = await hole(k.url, '/session', { address: ADRESSE });
    const job = await hole(k.url, `/job?session=${s.sessionId}`);
    const blockZiel = toHex(zielBytes((1n << 240n) / BigInt(job.difficulty)));
    const nonce = sucheNonce(job, blockZiel);
    await hole(k.url, '/share',
      { sessionId: s.sessionId, jobId: job.jobId, nonce: nonce.toString() });
    await new Promise(auf => setTimeout(auf, 200));

    assert.equal(gemeldet[0]?.ok, false);
    assert.match(String(gemeldet[0]?.grund), /Kette steht bei 5/);
    // Lokal bleibt er trotzdem gültig -- die Gegenstelle irrt vielleicht.
    assert.equal(k.chain.height(), 0);
  } finally {
    await new Promise<void>(auf => gegenstelle.close(() => auf()));
    await k.zu();
  }
});

test('Ohne erreichbare Gegenstelle läuft der Knoten weiter', async () => {
  const k = await knoten(18659);
  const gemeldet: { ok: boolean; grund?: string }[] = [];
  k.server.upstream = 'http://127.0.0.1:1';   // niemand da
  k.server.onUpstream = e => gemeldet.push(e);

  try {
    const s = await hole(k.url, '/session', { address: ADRESSE });
    const job = await hole(k.url, `/job?session=${s.sessionId}`);
    const blockZiel = toHex(zielBytes((1n << 240n) / BigInt(job.difficulty)));
    const nonce = sucheNonce(job, blockZiel);
    const r = await hole(k.url, '/share',
      { sessionId: s.sessionId, jobId: job.jobId, nonce: nonce.toString() });

    // Der Miner bekommt seine Antwort sofort, unabhängig von der Weitergabe.
    assert.equal(r.block, true);
    await new Promise(auf => setTimeout(auf, 400));
    assert.equal(gemeldet[0]?.ok, false);
    assert.equal(k.chain.height(), 0, 'Lokal ist der Block angenommen');
  } finally { await k.zu(); }
});
