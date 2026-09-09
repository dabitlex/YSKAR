import {
  TARGET_BLOCK_TIME, LWMA_WINDOW, LWMA_CLAMP, SOLVETIME_CAP,
  MIN_DIFFICULTY, EMERGENCY_FACTOR, MEDIAN_TIME_BLOCKS, MAX_FUTURE_DRIFT,
} from './params.ts';

/**
 * Difficulty-Anpassung nach LWMA -- ausschliesslich in BigInt.
 *
 * In der alten Fassung rechnete das mit Number und Math.round. Mit einem
 * Server war das folgenlos. Sobald zwei Knoten sich einig sein muessen, ist
 * es ein Konsensfehler: Zwei Umgebungen koennen dieselbe Eingabe
 * unterschiedlich runden, und die Kette spaltet sich.
 *
 * Deshalb hier: keine Kommazahl, keine Potenzfunktion, jede Division
 * abgerundet und in fester Reihenfolge.
 */

export interface BlockTiming { difficulty: bigint; solveSeconds: bigint }

export function nextDifficulty(recent: BlockTiming[]): bigint {
  if (recent.length === 0) return MIN_DIFFICULTY;

  const n = BigInt(Math.min(recent.length, LWMA_WINDOW));
  const win = recent.slice(-Number(n));
  const cap = SOLVETIME_CAP * TARGET_BLOCK_TIME;

  let weighted = 0n;
  let sumDiff = 0n;
  for (let i = 0; i < win.length; i++) {
    let s = win[i].solveSeconds;
    if (s < 1n) s = 1n;
    if (s > cap) s = cap;                       // ein Ausreisser darf das Fenster nicht kippen
    weighted += s * BigInt(i + 1);
    sumDiff += win[i].difficulty;
  }
  if (weighted <= 0n) return MIN_DIFFICULTY;

  // next = (Ø Difficulty) * T / (gewichtetes Mittel der Loesungszeiten)
  // ausmultipliziert, damit nur einmal ganz am Ende geteilt wird:
  const k = (n * (n + 1n)) / 2n;
  let next = (sumDiff * TARGET_BLOCK_TIME * k) / (n * weighted);

  const last = win[win.length - 1].difficulty;
  const upper = last * LWMA_CLAMP;
  const lower = last / LWMA_CLAMP;
  if (next > upper) next = upper;
  if (next < lower) next = lower;

  return next < MIN_DIFFICULTY ? MIN_DIFFICULTY : next;
}

/**
 * Notfallregel: Ohne sie steht die Kette morgens, wenn nachts niemand gemint
 * hat -- keine Bloecke heisst keine Anpassung. Ab dem EMERGENCY_FACTOR-fachen
 * der Zielzeit lockert das Target, mit jeder Verdopplung der Wartezeit
 * halbiert es sich.
 */
export function effectiveDifficulty(base: bigint, secondsSinceLastBlock: bigint): bigint {
  const threshold = EMERGENCY_FACTOR * TARGET_BLOCK_TIME;
  if (secondsSinceLastBlock <= threshold) return base;
  const eased = (base * threshold) / secondsSinceLastBlock;
  return eased < MIN_DIFFICULTY ? MIN_DIFFICULTY : eased;
}

/**
 * Median der letzten Zeitstempel. Ein neuer Block muss echt spaeter liegen --
 * sonst liesse sich die Difficulty ueber gefaelschte Zeiten verschieben.
 */
export function medianTimePast(timestamps: bigint[]): bigint {
  if (timestamps.length === 0) return 0n;
  const w = timestamps.slice(-MEDIAN_TIME_BLOCKS).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return w[Math.floor(w.length / 2)];
}

export type TimestampError = 'too_early' | 'too_far_ahead';

export function checkTimestamp(
  ts: bigint, previousTimestamps: bigint[], now: bigint,
): TimestampError | null {
  if (previousTimestamps.length > 0 && ts <= medianTimePast(previousTimestamps)) {
    return 'too_early';
  }
  if (ts > now + MAX_FUTURE_DRIFT) return 'too_far_ahead';
  return null;
}
