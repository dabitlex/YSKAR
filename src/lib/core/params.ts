import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Konsensparameter von YSKAR.
 *
 * ALLES HIER IST GANZZAHLIG. Sobald zwei Knoten sich einig sein muessen,
 * ist Fliesskomma ein Konsensfehler mit Ansage: Zwei Umgebungen koennen bei
 * derselben Eingabe unterschiedlich runden, und dann spaltet sich die Kette.
 * In der alten Fassung rechnete die Difficulty mit Number und Math.round --
 * genau das faellt hier weg.
 */

export const NETWORK = 'yskar-main-1';

/** Verhindert, dass eine Signatur auf einer anderen Kette gilt. */
export const CHAIN_ID: Uint8Array = sha256(new TextEncoder().encode(NETWORK));

export const DECIMALS = 8;
export const UNIT = 100_000_000n;              // 1 YSR

export const MAX_SUPPLY = 21_000_000n * UNIT;
export const INITIAL_REWARD = 875n * UNIT;
export const EPOCH_BLOCKS = 12_000;            // Halving alle 2 Seasons
export const SEASON_BLOCKS = 6_000;
export const MAX_HALVINGS = 63;

export const TARGET_BLOCK_TIME = 600n;         // Sekunden
export const DIFFICULTY_UNIT = 65_536n;        // erwartete Hashes je Einheit
export const MIN_DIFFICULTY = 4_096n;
export const GENESIS_DIFFICULTY = 24_576n;

export const LWMA_WINDOW = 45;
export const LWMA_CLAMP = 4n;                  // max. Faktor je Schritt
export const SOLVETIME_CAP = 6n;               // je Vielfaches der Zielzeit
export const EMERGENCY_FACTOR = 3n;

/** Zeitstempelregeln. Ohne sie liesse sich die Difficulty verschieben. */
export const MEDIAN_TIME_BLOCKS = 11;
export const MAX_FUTURE_DRIFT = 120n;          // Sekunden

export const MIN_FEE = 100_000n;               // 0,001 YSR
export const MAX_TXS_PER_BLOCK = 2_000;
export const MAX_MEMO_BYTES = 32;

export const ADDRESS_BYTES = 20;
export const ADDRESS_HRP = 'ysr';

/** target = 2^256 / (difficulty * DIFFICULTY_UNIT) = 2^240 / difficulty */
const SHIFT = (1n << 256n) / DIFFICULTY_UNIT;

export function targetFromDifficulty(difficulty: bigint): bigint {
  if (difficulty <= 0n) throw new Error('difficulty muss > 0 sein');
  return SHIFT / difficulty;
}

export function achievedDifficulty(hash: Uint8Array): bigint {
  const v = bytesToBig(hash);
  return v === 0n ? SHIFT : SHIFT / v;
}

export function bytesToBig(b: Uint8Array): bigint {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}

/**
 * Blockreward an einer Hoehe. Reine Bitverschiebung -- keine Potenzfunktion,
 * kein Runden. Wie bei Bitcoin laesst die Abrundung die reale Gesamtmenge
 * knapp unter MAX_SUPPLY landen.
 */
export function rewardAt(height: number): bigint {
  const era = Math.floor(height / EPOCH_BLOCKS);
  if (era >= MAX_HALVINGS) return 0n;
  return INITIAL_REWARD >> BigInt(era);
}

export function seasonAt(height: number): number {
  return Math.floor(height / SEASON_BLOCKS) + 1;
}
