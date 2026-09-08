import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

import {
  serializeHeader, hashHeader, withNonce, sha256d,
  HEADER_SIZE, NONCE_OFFSET, type BlockHeader,
} from '../src/lib/chain/header.ts';
import {
  targetFromDifficulty, targetToBytes, hashToBigInt,
  achievedDifficulty, meetsDifficulty, DIFFICULTY_UNIT,
} from '../src/lib/chain/target.ts';

// Speicherlayout der WASM-Engine, siehe wasm/gen_wat.py
const M = { HEADER: 0, MIDSTATE: 128, BLOCK2: 160, HASH: 320, TARGET: 352, FOUND: 384 };

async function loadEngine() {
  const bin = readFileSync(new URL('../public/miner.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(bin, {});
  return {
    mem: new Uint8Array(instance.exports.memory.buffer),
    view: new DataView(instance.exports.memory.buffer),
    initJob: instance.exports.init_job as () => void,
    mine: instance.exports.mine as (start: number, iters: number) => number,
  };
}

function sampleHeader(nonce = 0n): BlockHeader {
  return {
    version: 1,
    height: 1,
    prevHash: randomBytes(32),
    merkleRoot: randomBytes(32),
    jobSeed: randomBytes(16),
    timestamp: 1788825600n,
    difficulty: 24576,
    extranonce: 42n,
    nonce,
  };
}

test('Header ist exakt 116 Byte und die Felder stehen an den erwarteten Offsets', () => {
  const h = sampleHeader(0x1122334455667788n);
  const b = serializeHeader(h);
  assert.equal(b.length, HEADER_SIZE);
  assert.equal(b.readUInt32LE(0), 1);
  assert.equal(b.readUInt32LE(4), 1);
  assert.deepEqual(b.subarray(8, 40), Buffer.from(h.prevHash));
  assert.deepEqual(b.subarray(40, 72), Buffer.from(h.merkleRoot));
  assert.deepEqual(b.subarray(72, 88), Buffer.from(h.jobSeed));
  assert.equal(b.readBigUInt64LE(88), 1788825600n);
  assert.equal(b.readUInt32LE(96), 24576);
  assert.equal(b.readBigUInt64LE(100), 42n);
  assert.equal(b.readBigUInt64LE(NONCE_OFFSET), 0x1122334455667788n);
});

test('Server und WASM-Engine erzeugen denselben Hash', async () => {
  const eng = await loadEngine();
  const h = sampleHeader();
  eng.mem.fill(0xff, M.TARGET, M.TARGET + 32);   // alles gilt als Treffer

  for (const nonce of [0n, 1n, 7n, 1000n, 65535n, 0x7fffffffn, 0xffffffffn]) {
    const header = { ...h, nonce };
    eng.mem.set(serializeHeader(header), M.HEADER);
    eng.initJob();

    const found = eng.mine(Number(nonce & 0xffffffffn) | 0, 1);
    assert.equal(found, 1, `mine() lieferte keinen Treffer bei nonce=${nonce}`);

    const fromWasm = Buffer.from(eng.mem.slice(M.HASH, M.HASH + 32));
    const fromServer = hashHeader(header);
    assert.deepEqual(fromWasm, fromServer,
      `Hash weicht ab bei nonce=${nonce}\n  wasm:   ${fromWasm.toString('hex')}` +
      `\n  server: ${fromServer.toString('hex')}`);
  }
});

test('withNonce ist identisch zum Neuaufbau des Headers', () => {
  const h = sampleHeader();
  const base = serializeHeader(h);
  for (const n of [0n, 999n, 2n ** 40n]) {
    assert.deepEqual(withNonce(base, n), serializeHeader({ ...h, nonce: n }));
  }
});

test('Die Engine findet selbständig einen Share und der Server rechnet ihn nach', async () => {
  const eng = await loadEngine();
  const h = sampleHeader();
  const shareDifficulty = 256n;

  eng.mem.set(serializeHeader(h), M.HEADER);
  eng.mem.set(targetToBytes(targetFromDifficulty(shareDifficulty)), M.TARGET);
  eng.initJob();

  let nonce: bigint | null = null;
  for (let base = 0; base < 40_000_000 && nonce === null; base += 1_000_000) {
    if (eng.mine(base, 1_000_000) === 1) nonce = BigInt(eng.view.getUint32(M.FOUND, true));
  }
  assert.notEqual(nonce, null, 'kein Share innerhalb von 40 Mio Nonces gefunden');

  // Genau das macht die Share-Route: Header selbst neu aufbauen, selbst hashen.
  const hash = hashHeader({ ...h, nonce: nonce! });
  assert.ok(meetsDifficulty(hash, shareDifficulty),
    `nachgerechneter Hash erfüllt die Share-Difficulty nicht: ${hash.toString('hex')}`);
  assert.ok(achievedDifficulty(hash) >= shareDifficulty);
});

test('Target-Mathematik ist in sich stimmig', () => {
  assert.equal(DIFFICULTY_UNIT, 65536n);
  assert.equal(targetFromDifficulty(1), (1n << 240n));
  assert.equal(targetFromDifficulty(2), (1n << 240n) / 2n);

  // Genesis-Block: 13,3 % Abstand zum Target, siehe Migration 00001
  const genesis = Buffer.from(
    '000000025033fa3c6e5a50956de77df04053008c3a6e606cc3c048c7083b75e0', 'hex');
  assert.ok(meetsDifficulty(genesis, 24576), 'Genesis erfüllt seine eigene Difficulty nicht');
  assert.ok(achievedDifficulty(genesis) >= 24576n);

  // Ein Hash mit einem gesetzten Top-Bit erfüllt nur Difficulty 1
  const worst = Buffer.alloc(32, 0xff);
  assert.equal(achievedDifficulty(worst), 0n);
  assert.equal(hashToBigInt(Buffer.alloc(32)), 0n);
});

test('Kaputte Eingaben werden abgewiesen statt still falsch serialisiert', () => {
  const h = sampleHeader();
  assert.throws(() => serializeHeader({ ...h, jobSeed: randomBytes(15) }), /jobSeed/);
  assert.throws(() => serializeHeader({ ...h, prevHash: randomBytes(31) }), /prevHash/);
  assert.throws(() => serializeHeader({ ...h, difficulty: 0 }), /difficulty/);
  assert.throws(() => targetFromDifficulty(0), /difficulty/);
});

test('Der Genesis-Header aus Migration 00001 lässt sich reproduzieren', () => {
  const genesis: BlockHeader = {
    version: 1,
    height: 0,
    prevHash: Buffer.alloc(32),
    merkleRoot: Buffer.alloc(32),
    jobSeed: Buffer.from('70726f6f66206e6f742070726f6d6973', 'hex'),
    timestamp: 1788825600n,
    difficulty: 24576,
    extranonce: 0n,
    nonce: 4017069256n,
  };
  assert.equal(
    hashHeader(genesis).toString('hex'),
    '000000025033fa3c6e5a50956de77df04053008c3a6e606cc3c048c7083b75e0',
  );
});

test('sha256d entspricht zwei einzelnen SHA-256', () => {
  const data = randomBytes(116);
  const twice = sha256d(data);
  assert.equal(twice.length, 32);
  assert.notDeepEqual(twice, sha256d(randomBytes(116)));
});
