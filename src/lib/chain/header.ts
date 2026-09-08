import { createHash } from 'node:crypto';

/**
 * Block-Header, 116 Byte, Little-Endian für alle Zahlenfelder.
 *
 * Offset  Länge  Feld
 *      0      4  version      u32
 *      4      4  height       u32
 *      8     32  prevHash
 *     40     32  merkleRoot
 *     72     16  jobSeed
 *     88      8  timestamp    u64
 *     96      4  difficulty   u32
 *    100      8  extranonce   u64
 *    108      8  nonce        u64
 *
 * Der Client variiert ausschließlich die Nonce. Alles andere kommt vom
 * Server, der den Header zur Prüfung aus seinen eigenen Daten neu aufbaut.
 *
 * Diese Datei muss bitgenau dasselbe erzeugen wie wasm/sha256d_miner.wat.
 * tests/header.test.ts prüft genau das gegen die echte WASM-Engine.
 */

export const HEADER_SIZE = 116;
export const NONCE_OFFSET = 108;

export interface BlockHeader {
  version: number;
  height: number;
  prevHash: Uint8Array;    // 32
  merkleRoot: Uint8Array;  // 32
  jobSeed: Uint8Array;     // 16
  timestamp: bigint;       // Unix-Sekunden
  difficulty: number;
  extranonce: bigint;
  nonce: bigint;
}

function expect(buf: Uint8Array, len: number, name: string): void {
  if (buf.length !== len) {
    throw new Error(`${name} muss ${len} Byte sein, ist ${buf.length}`);
  }
}

export function serializeHeader(h: BlockHeader): Buffer {
  expect(h.prevHash, 32, 'prevHash');
  expect(h.merkleRoot, 32, 'merkleRoot');
  expect(h.jobSeed, 16, 'jobSeed');
  if (!Number.isInteger(h.difficulty) || h.difficulty <= 0 || h.difficulty > 0xffffffff) {
    throw new Error(`difficulty muss ein u32 > 0 sein, ist ${h.difficulty}`);
  }

  const b = Buffer.alloc(HEADER_SIZE);
  b.writeUInt32LE(h.version >>> 0, 0);
  b.writeUInt32LE(h.height >>> 0, 4);
  Buffer.from(h.prevHash).copy(b, 8);
  Buffer.from(h.merkleRoot).copy(b, 40);
  Buffer.from(h.jobSeed).copy(b, 72);
  b.writeBigUInt64LE(BigInt(h.timestamp), 88);
  b.writeUInt32LE(h.difficulty >>> 0, 96);
  b.writeBigUInt64LE(BigInt(h.extranonce), 100);
  b.writeBigUInt64LE(BigInt(h.nonce), 108);
  return b;
}

export function sha256d(data: Uint8Array): Buffer {
  const once = createHash('sha256').update(data).digest();
  return createHash('sha256').update(once).digest();
}

export function hashHeader(h: BlockHeader): Buffer {
  return sha256d(serializeHeader(h));
}

/** Nur die Nonce eines fertigen Headers austauschen -- spart das Neuaufbauen. */
export function withNonce(header: Buffer, nonce: bigint): Buffer {
  const copy = Buffer.from(header);
  copy.writeBigUInt64LE(nonce, NONCE_OFFSET);
  return copy;
}

export function hex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}

export function unhex(s: string): Buffer {
  const clean = s.startsWith('\\x') ? s.slice(2) : s;
  return Buffer.from(clean, 'hex');
}
