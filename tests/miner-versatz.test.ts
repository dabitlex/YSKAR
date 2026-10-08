/**
 * Issue #4, zweiter Teil: Mit --cpu-gpu rechnen die CPU-Threads in einem
 * eigenen Nonce-Bereich. Die Karte zaehlt von 0 aufwaerts; ohne Versatz
 * begann Thread 0 ebenfalls bei 0 -- mit derselben Extranonce, also genau
 * dieselben Hashes.
 *
 * Geprueft am echten Rechen-Thread (miner/src/hasher.mjs) mit der echten
 * WASM-Engine: Treffer werden mit dem Header des Kerns nachgerechnet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { headerHash } from '../src/lib/core/block.ts';
import { fromHex } from '../src/lib/core/codec.ts';

const MINER = join(import.meta.dirname, '..', 'miner');
const WASM = readFileSync(join(MINER, readdirSync(MINER).find(n => /^miner\.[0-9a-f]{10}\.wasm$/.test(n))!));

const JOB = {
  jobId: 'v1', height: 5, version: 1,
  prevHash: '11'.repeat(32), merkleRoot: '22'.repeat(32), stateRoot: '33'.repeat(32),
  timestamp: '1788912000', difficulty: 1, txCount: 1, extranonce: '7',
  target: '0001' + '00'.repeat(30),   // Difficulty 1: alle ~65.536 Hashes ein Treffer
};

function faden(versatz: number | undefined, slot = 0) {
  const w = new Worker(join(MINER, 'src', 'hasher.mjs'), {
    workerData: { wasm: WASM, extranonce: '7', slot, stride: 4096, ...(versatz === undefined ? {} : { versatz }) },
  });
  const nonces: bigint[] = [];
  const bereit = new Promise<void>(r => w.on('message', m => {
    if (m.t === 'bereit') r();
    if (m.t === 'share') nonces.push(BigInt(m.nonce));
  }));
  return { w, nonces, bereit };
}

async function sammle(versatz: number | undefined, slot = 0, n = 3) {
  const f = faden(versatz, slot);
  await f.bereit;
  f.w.postMessage({ t: 'job', job: JOB });
  const bis = Date.now() + 20_000;
  while (f.nonces.length < n && Date.now() < bis) await new Promise(r => setTimeout(r, 50));
  await f.w.terminate();
  return f.nonces;
}

test('Ohne Versatz: Thread 0 beginnt bei Nonce 0 (wie bisher)', async () => {
  const n = await sammle(undefined);
  assert.ok(n.length >= 3);
  assert.ok(n.every(x => x < 1n << 32n), n.join(','));
});

test('Mit Versatz 2^31 (oberes Wort): alle Nonces ab 2^63 -- ausserhalb der Karte', async () => {
  const n = await sammle(0x8000_0000);
  assert.ok(n.length >= 3);
  for (const x of n) assert.ok(x >= 1n << 63n && x < (1n << 63n) + (1n << 32n), x.toString());
  // Und es sind echte Treffer: mit dem Header des Kerns nachgerechnet.
  const ziel = BigInt('0x' + JOB.target);
  for (const x of n) {
    const kopf = {
      version: 1, height: JOB.height, prevHash: fromHex(JOB.prevHash), merkleRoot: fromHex(JOB.merkleRoot),
      stateRoot: fromHex(JOB.stateRoot), timestamp: BigInt(JOB.timestamp), difficulty: 1n, txCount: 1,
      extranonce: 7n, nonce: x,
    };
    const h = headerHash(kopf as never);
    let wert = 0n; for (const b of h) wert = (wert << 8n) | BigInt(b);
    assert.ok(wert <= ziel, `Nonce ${x} trifft das Ziel nicht`);
  }
});

test('Mit Versatz bleiben die Threads untereinander getrennt', async () => {
  const n = await sammle(0x8000_0000, 1);
  for (const x of n) assert.ok(x >= (1n << 63n) + (4096n << 32n), x.toString());
});
