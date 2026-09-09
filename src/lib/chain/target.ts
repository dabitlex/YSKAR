/**
 * Target-Mathematik.
 *
 * Eine Difficulty-Einheit entspricht `DIFFICULTY_UNIT` erwarteten Hashes.
 * Daraus folgt:
 *
 *     erwartete Hashes = difficulty * DIFFICULTY_UNIT
 *     target           = 2^256 / (difficulty * DIFFICULTY_UNIT)
 *                      = 2^240 / difficulty            (bei UNIT = 2^16)
 *
 * Der Hash wird als Big-Endian-Zahl gelesen. Gültig ist `hash <= target`.
 * Diese Konvention muss mit wasm/sha256d_miner.wat übereinstimmen, wo der
 * Vergleich byteweise von Index 0 an läuft.
 */

export const DIFFICULTY_UNIT = 65536n;      // 2^16
const TWO_POW_256 = 1n << 256n;
const SHIFT = TWO_POW_256 / DIFFICULTY_UNIT; // 2^240

export function targetFromDifficulty(difficulty: bigint | number): bigint {
  const d = BigInt(difficulty);
  if (d <= 0n) throw new Error(`difficulty muss > 0 sein, ist ${d}`);
  return SHIFT / d;
}

export function targetToBytes(target: bigint): Buffer {
  const b = Buffer.alloc(32);
  let x = target;
  for (let i = 31; i >= 0; i--) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

/** Hash als Big-Endian-Zahl. */
export function hashToBigInt(hash: Uint8Array): bigint {
  let v = 0n;
  for (const byte of hash) v = (v << 8n) | BigInt(byte);
  return v;
}

export function meetsDifficulty(hash: Uint8Array, difficulty: bigint | number): boolean {
  return hashToBigInt(hash) <= targetFromDifficulty(difficulty);
}

/**
 * Welche Difficulty erfüllt dieser Hash tatsächlich?
 *
 * Das ist der Wert, mit dem ein Share gewichtet wird. Er wird NICHT vom
 * Client übernommen, sondern hier aus dem nachgerechneten Hash abgeleitet.
 */
export function achievedDifficulty(hash: Uint8Array): bigint {
  const v = hashToBigInt(hash);
  if (v === 0n) return SHIFT;           // theoretisch; praktisch unerreichbar
  return SHIFT / v;
}

/** Erwartete Hashes für eine Difficulty -- für Hashraten- und ETA-Anzeigen. */
export function expectedHashes(difficulty: bigint | number): bigint {
  return BigInt(difficulty) * DIFFICULTY_UNIT;
}

/**
 * Hashrate aus geleisteter Arbeit. Rein statistisch: die Summe der
 * Share-Difficulties mal Einheit, geteilt durch die Zeit.
 */
export function hashrateFromWeight(totalWeight: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return (totalWeight * Number(DIFFICULTY_UNIT)) / seconds;
}
