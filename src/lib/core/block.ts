import { Writer, Reader } from './codec.ts';
import { sha256d, merkleRoot } from './hash.ts';
import { serializeTx, deserializeTx, txid, type Tx, TX_COINBASE } from './tx.ts';
import {
  targetFromDifficulty, bytesToBig, MAX_TXS_PER_BLOCK,
} from './params.ts';

/**
 * Blockheader -- 136 Byte, Little-Endian.
 *
 *    0  u32  version        104  u64  timestamp
 *    4  u32  height         112  u32  difficulty
 *    8  32B  prev_hash      116  u32  tx_count
 *   40  32B  merkle_root    120  u64  extranonce
 *   72  32B  state_root     128  u64  nonce
 *
 * Die 136 Byte sind kein Zufall. SHA-256 verarbeitet 64-Byte-Bloecke; mit
 * Padding ergeben 136 Byte genau drei davon. Alle Felder ausser der Nonce
 * liegen in den ERSTEN 128 Byte, also in den ersten beiden Bloecken -- deren
 * Kompression laesst sich als Midstate einmal je Job berechnen. Pro Nonce
 * bleiben ein Kompressionsschritt fuer den dritten Block und einer fuer den
 * zweiten SHA-256. Zwei statt vier, wie schon beim alten Format.
 *
 * Die extranonce steht bewusst im konstanten Teil: Sie trennt die Suchraeume
 * der Miner, aendert sich aber nur beim Sessionstart.
 *
 * state_root ist neu und der eigentliche Schritt weg von der Datenbank: Er
 * verpflichtet auf den Kontostand NACH diesem Block. Zwei Knoten mit
 * demselben Root haben denselben Zustand berechnet.
 */

export const HEADER_SIZE = 136;
export const NONCE_OFFSET = 128;
export const MIDSTATE_PREFIX = 128;
export const BLOCK_VERSION = 1;

export interface BlockHeader {
  version: number;
  height: number;
  prevHash: Uint8Array;     // 32
  merkleRoot: Uint8Array;   // 32
  stateRoot: Uint8Array;    // 32
  timestamp: bigint;
  difficulty: bigint;
  txCount: number;
  extranonce: bigint;
  nonce: bigint;
}

export interface Block {
  header: BlockHeader;
  txs: Tx[];
}

export function serializeHeader(h: BlockHeader): Uint8Array {
  if (h.difficulty <= 0n || h.difficulty > 0xffffffffn) {
    throw new Error(`difficulty muss ein u32 > 0 sein, ist ${h.difficulty}`);
  }
  return new Writer()
    .u32(h.version)
    .u32(h.height)
    .bytes(h.prevHash, 32)
    .bytes(h.merkleRoot, 32)
    .bytes(h.stateRoot, 32)
    .u64(h.timestamp)
    .u32(Number(h.difficulty))
    .u32(h.txCount)
    .u64(h.extranonce)
    .u64(h.nonce)
    .finish();
}

export function deserializeHeader(b: Uint8Array): BlockHeader {
  if (b.length !== HEADER_SIZE) {
    throw new Error(`Header muss ${HEADER_SIZE} Byte sein, ist ${b.length}`);
  }
  const r = new Reader(b);
  return {
    version: r.u32(),
    height: r.u32(),
    prevHash: r.bytes(32),
    merkleRoot: r.bytes(32),
    stateRoot: r.bytes(32),
    timestamp: r.u64(),
    difficulty: BigInt(r.u32()),
    txCount: r.u32(),
    extranonce: r.u64(),
    nonce: r.u64(),
  };
}

export function headerHash(h: BlockHeader): Uint8Array {
  return sha256d(serializeHeader(h));
}

export function withNonce(header: Uint8Array, nonce: bigint): Uint8Array {
  const copy = header.slice();
  new DataView(copy.buffer).setBigUint64(NONCE_OFFSET, nonce, true);
  return copy;
}

export function txMerkleRoot(txs: Tx[]): Uint8Array {
  return merkleRoot(txs.map(txid));
}

/** Body: Anzahl und Laenge je Transaktion, dann die Transaktionen selbst. */
export function serializeBlock(b: Block): Uint8Array {
  const w = new Writer().bytes(serializeHeader(b.header), HEADER_SIZE);
  w.u32(b.txs.length);
  for (const t of b.txs) {
    const bytes = serializeTx(t);
    w.u32(bytes.length).bytes(bytes);
  }
  return w.finish();
}

export function deserializeBlock(bytes: Uint8Array): Block {
  const header = deserializeHeader(bytes.slice(0, HEADER_SIZE));
  const r = new Reader(bytes.slice(HEADER_SIZE));
  const count = r.u32();
  if (count > MAX_TXS_PER_BLOCK) throw new Error('zu viele Transaktionen');
  const txs: Tx[] = [];
  for (let i = 0; i < count; i++) txs.push(deserializeTx(r.bytes(r.u32())));
  return { header, txs };
}

export function meetsTarget(hash: Uint8Array, difficulty: bigint): boolean {
  return bytesToBig(hash) <= targetFromDifficulty(difficulty);
}

export type BlockStructureError =
  | 'bad_version' | 'tx_count_mismatch' | 'too_many_txs'
  | 'no_coinbase' | 'multiple_coinbase' | 'coinbase_height'
  | 'merkle_mismatch' | 'pow_failed';

/**
 * Strukturpruefung ohne Kenntnis des Zustands: Aufbau, Merkle-Root und
 * Proof of Work. Guthaben, Nonces und der Reward-Betrag werden in state.ts
 * geprueft, weil sie den Kontostand brauchen.
 */
export function checkBlockStructure(b: Block): BlockStructureError | null {
  if (b.header.version !== BLOCK_VERSION) return 'bad_version';
  if (b.txs.length > MAX_TXS_PER_BLOCK) return 'too_many_txs';
  if (b.header.txCount !== b.txs.length) return 'tx_count_mismatch';

  if (b.txs.length === 0 || b.txs[0].type !== TX_COINBASE) return 'no_coinbase';
  for (let i = 1; i < b.txs.length; i++) {
    if (b.txs[i].type === TX_COINBASE) return 'multiple_coinbase';
  }
  if (b.txs[0].height !== b.header.height) return 'coinbase_height';

  const root = txMerkleRoot(b.txs);
  if (bytesToBig(root) !== bytesToBig(b.header.merkleRoot)) return 'merkle_mismatch';

  if (!meetsTarget(headerHash(b.header), b.header.difficulty)) return 'pow_failed';
  return null;
}
