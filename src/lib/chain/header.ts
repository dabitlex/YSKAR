import { createHash } from 'node:crypto';
import {
  serializeHeaderBytes, HEADER_SIZE, NONCE_OFFSET,
  type HeaderFields,
} from './serialize.ts';

export { HEADER_SIZE, NONCE_OFFSET };
export type BlockHeader = HeaderFields;

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

export function serializeHeader(h: BlockHeader): Buffer {
  return Buffer.from(serializeHeaderBytes(h));
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
