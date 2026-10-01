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

export const MIN_FEE = 100_000n;               // 0,001 YSR -- Konsens bis FEE_V3_HEIGHT

/*
 * Gebuehren je Byte -- Konsensfassung 3.
 *
 * Bis FEE_V3_HEIGHT gilt die feste Untergrenze MIN_FEE. Ab dieser Hoehe
 * gilt fee >= bytes * MIN_FEE_RATE, wie bei Bitcoin: Der Konsens verlangt
 * fast nichts (eine Ueberweisung ohne Notiz kostet 168 Einheiten, also
 * 0,00000168 YSR), den Preis macht der Markt. Wer groessere Transaktionen
 * einfuehrt (Kanaele), zahlt automatisch mehr -- ohne neue Regel.
 *
 * Dazu die Staubgrenze DUST_LIMIT: Betraege darunter sind ab derselben
 * Hoehe unzulaessig. Ohne sie liesse sich der Zustand fuer fast nichts
 * mit Millionen Kleinstkonten fuellen.
 *
 * Die Hoehe liegt rund 1.100 Bloecke (7-8 Tage) nach dem Beschluss bei
 * Hoehe 2.880 -- Zeit fuer Knoten und Miner, zu aktualisieren. Bloecke
 * darunter bleiben byteweise gueltig; fuer sie gilt MIN_FEE weiter.
 */
export const FEE_V3_HEIGHT = 4_000;
export const MIN_FEE_RATE = 1n;                // Einheiten je Byte, Konsens
export const DUST_LIMIT = 100n;                // 0,000001 YSR, Konsens

/** Konsens-Untergrenze der Gebuehr fuer eine Transaktion dieser Groesse. */
export function minFeeAt(height: number, bytes: number, feeV3Height = FEE_V3_HEIGHT): bigint {
  return height >= feeV3Height ? BigInt(bytes) * MIN_FEE_RATE : MIN_FEE;
}

/*
 * Weiterleitungs-Satz -- KEIN Konsens. Was ein Knoten mindestens je Byte
 * verlangt, um eine Transaktion in seinen Mempool zu nehmen (Bitcoins
 * minrelaytxfee). Spam-Schutz, ohne Fork nachjustierbar.
 */
export const RELAY_FEE_RATE = 10n;             // Einheiten je Byte, Policy

/*
 * Difficulty ohne Obergrenze -- Konsensfassung 4.
 *
 * Bis hierher steht die Difficulty als schlichte u32 im Header. Das Feld
 * endet bei 4.294.967.295, entsprechend rund 469 GH/s Netz-Hashrate. Darueber
 * kann die Anpassung nicht mehr folgen: Der Knoten kann keinen Header bauen,
 * die Notfallregel lockert nach 30 Minuten, und die Kette laeuft in Stoessen
 * mit langen Pausen.
 *
 * Ab DIFF_V4_HEIGHT wird dasselbe 4-Byte-Feld anders GELESEN:
 *
 *   oberstes Bit 0   difficulty = Feld                    1 .. 2^31-1
 *   oberstes Bit 1   e = Bits 23..30, m = Bits 0..22
 *                    difficulty = (2^23 + m) << e         2^31 .. MAX_DIFFICULTY
 *
 * Unterhalb von 2^31 ist das Feld damit Byte fuer Byte dasselbe wie vorher.
 * Darueber ist es eine Gleitkommazahl mit 24 Bit Genauigkeit -- die
 * Rundung kostet weniger als 2^-23 (rund 1,2e-7) relativ.
 *
 * Eindeutigkeit: Jeder Wert hat genau eine Schreibweise. Werte unter 2^31
 * nur als Klartext; die Mantisse ist normiert (fuehrende 1 implizit), und
 * e muss mindestens 8 sein -- mit e < 8 laege der Wert unter 2^31.
 *
 * Obergrenze: MAX_DIFFICULTY = (2^24 - 1) << 216, knapp unter 2^240. Dort
 * ist das Target 1 -- die Grenze von SHA-256 selbst, nicht von YSKAR.
 *
 * Die Hoehe gilt fuer ALLE Netze, weil sie im Header-Codec wirkt und der
 * keine Netzparameter kennt. Fuer Regtest ist das unschaedlich: Unter 2^31
 * unterscheiden sich alte und neue Lesart nicht.
 */
export const DIFF_V4_HEIGHT = 6_000;
export const DIFF_KLARTEXT_GRENZE = 1n << 31n;          // ab hier Gleitkomma
const MANTISSE_BITS = 24n;
const EXP_MIN = 8n;
const EXP_MAX = 216n;
export const MAX_DIFFICULTY = ((1n << MANTISSE_BITS) - 1n) << EXP_MAX;
const U32_MAX = 0xffffffffn;

/**
 * Groesster darstellbarer Wert <= v. Monoton: aus a <= b folgt
 * floorDifficulty(a) <= floorDifficulty(b). Darauf beruht, dass der
 * zulaessige Bereich in validate nie leer wird.
 */
export function floorDifficulty(v: bigint): bigint {
  if (v < DIFF_KLARTEXT_GRENZE) return v;
  if (v >= MAX_DIFFICULTY) return MAX_DIFFICULTY;
  const e = BigInt(v.toString(2).length) - MANTISSE_BITS;
  return (v >> e) << e;
}

/** Difficulty, die an dieser Hoehe tatsaechlich im Header stehen kann. */
export function difficultyAtHeight(v: bigint, height: number, v4Height = DIFF_V4_HEIGHT): bigint {
  return height >= v4Height ? floorDifficulty(v) : v;
}

/** Wert -> 4-Byte-Feld. Wirft, wenn der Wert so nicht darstellbar ist. */
export function encodeDifficulty(v: bigint, height: number, v4Height = DIFF_V4_HEIGHT): number {
  if (v <= 0n) throw new Error(`difficulty muss > 0 sein, ist ${v}`);
  if (height < v4Height) {
    if (v > U32_MAX) throw new Error(`difficulty muss ein u32 > 0 sein, ist ${v}`);
    return Number(v);
  }
  if (v < DIFF_KLARTEXT_GRENZE) return Number(v);
  if (v > MAX_DIFFICULTY) throw new Error(`difficulty ueber dem Hoechstwert: ${v}`);
  const e = BigInt(v.toString(2).length) - MANTISSE_BITS;
  const m = v >> e;
  if (m << e !== v) throw new Error(`difficulty nicht darstellbar (erst abrunden): ${v}`);
  return Number((1n << 31n) | (e << 23n) | (m - (1n << 23n)));
}

/** 4-Byte-Feld -> Wert. Wirft bei nicht-kanonischer Schreibweise. */
export function decodeDifficulty(feld: number, height: number, v4Height = DIFF_V4_HEIGHT): bigint {
  if (!Number.isInteger(feld) || feld < 0 || feld > 0xffffffff) {
    throw new Error(`difficulty-Feld ausserhalb u32: ${feld}`);
  }
  const f = BigInt(feld);
  if (height < v4Height || f < DIFF_KLARTEXT_GRENZE) return f;
  const e = (f >> 23n) & 0xffn;
  const m = (f & 0x7fffffn) | (1n << 23n);
  if (e < EXP_MIN || e > EXP_MAX) throw new Error(`difficulty-Exponent unzulaessig: ${e}`);
  return m << e;
}
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

/**
 * Coinbase mit mehreren Empfaengern -- Konsensfassung 2.
 *
 * Bis hierher hat die Coinbase genau einen Empfaenger. Fuer Pool Mining ohne
 * Verwahrung braucht es mehrere: Der Block selbst zahlt alle Beteiligten
 * aus, und der Pool haelt nie fremdes Geld.
 *
 * AKTIVIERUNGSHOEHE. Bloecke unterhalb dieser Hoehe duerfen KEINE
 * Coinbase der Fassung 2 enthalten -- damit bleibt jeder bisherige Block
 * byteweise gueltig und die Geschichte unveraendert. Ab dieser Hoehe sind
 * beide Fassungen zulaessig; Solo-Mining aendert sich also nicht.
 *
 * Der Wert ist bewusst grosszuegig gewaehlt: Bei rund 500 Sekunden je Block
 * liegen zwischen Hoehe 850 und 2000 etwa acht Tage. Wer einen Knoten oder
 * Miner betreibt, hat damit Zeit zu aktualisieren, bevor die Regel greift.
 */
export const COINBASE_V2_HEIGHT = 2000;

/** Hoechstzahl der Empfaenger in einer Coinbase der Fassung 2. */
export const MAX_COINBASE_OUTPUTS = 64;

/** Fassung einer Coinbase mit mehreren Empfaengern. */
export const COINBASE_V2 = 2;
