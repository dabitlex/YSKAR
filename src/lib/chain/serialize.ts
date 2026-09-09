/**
 * Header-Serialisierung und Target-Mathematik, frei von Node-Abhaengigkeiten.
 *
 * Wird sowohl vom Server (src/lib/chain/header.ts) als auch vom Block
 * Explorer im Browser genutzt. Nur so kann der Explorer den Hash eines Blocks
 * wirklich selbst nachrechnen, statt der Datenbank zu glauben.
 *
 * Header: 116 Byte, Little-Endian.
 *      0  u32  version        72  16B  jobSeed
 *      4  u32  height         88  u64  timestamp
 *      8  32B  prevHash       96  u32  difficulty
 *     40  32B  merkleRoot    100  u64  extranonce
 *                            108  u64  nonce
 */

export const HEADER_SIZE = 116;
export const NONCE_OFFSET = 108;
export const DIFFICULTY_UNIT = 65536n;
const SHIFT = (1n << 256n) / DIFFICULTY_UNIT;   // 2^240

export interface HeaderFields {
  version: number;
  height: number;
  prevHash: Uint8Array;    // 32
  merkleRoot: Uint8Array;  // 32
  jobSeed: Uint8Array;     // 16
  timestamp: bigint;
  difficulty: number;
  extranonce: bigint;
  nonce: bigint;
}

function expect(buf: Uint8Array, len: number, name: string): void {
  if (buf.length !== len) {
    throw new Error(`${name} muss ${len} Byte sein, ist ${buf.length}`);
  }
}

export function serializeHeaderBytes(h: HeaderFields): Uint8Array {
  expect(h.prevHash, 32, 'prevHash');
  expect(h.merkleRoot, 32, 'merkleRoot');
  expect(h.jobSeed, 16, 'jobSeed');
  if (!Number.isInteger(h.difficulty) || h.difficulty <= 0 || h.difficulty > 0xffffffff) {
    throw new Error(`difficulty muss ein u32 > 0 sein, ist ${h.difficulty}`);
  }

  const b = new Uint8Array(HEADER_SIZE);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, h.version >>> 0, true);
  dv.setUint32(4, h.height >>> 0, true);
  b.set(h.prevHash, 8);
  b.set(h.merkleRoot, 40);
  b.set(h.jobSeed, 72);
  dv.setBigUint64(88, BigInt(h.timestamp), true);
  dv.setUint32(96, h.difficulty >>> 0, true);
  dv.setBigUint64(100, BigInt(h.extranonce), true);
  dv.setBigUint64(108, BigInt(h.nonce), true);
  return b;
}

export function targetFromDifficulty(difficulty: bigint | number): bigint {
  const d = BigInt(difficulty);
  if (d <= 0n) throw new Error(`difficulty muss > 0 sein, ist ${d}`);
  return SHIFT / d;
}

/** Hash als Big-Endian-Zahl. Gueltig ist hash <= target. */
export function hashToBigInt(hash: Uint8Array): bigint {
  let v = 0n;
  for (const byte of hash) v = (v << 8n) | BigInt(byte);
  return v;
}

export function achievedDifficulty(hash: Uint8Array): bigint {
  const v = hashToBigInt(hash);
  return v === 0n ? SHIFT : SHIFT / v;
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export function fromHex(s: string): Uint8Array {
  const clean = s.startsWith('\\x') ? s.slice(2) : s;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

/** SHA-256d ueber WebCrypto -- laeuft im Browser ohne Fremdbibliothek. */
export async function sha256dWeb(data: Uint8Array): Promise<Uint8Array> {
  const once = await crypto.subtle.digest('SHA-256', data as BufferSource);
  const twice = await crypto.subtle.digest('SHA-256', once);
  return new Uint8Array(twice);
}
