/**
 * VarDiff -- pro Session ein eigenes Share-Target.
 *
 * Ziel: Jede Session liefert etwa alle `targetSeconds` einen Share, egal ob
 * altes Android-Handy oder nachgebauter Client auf einer Grafikkarte. Dadurch
 * skaliert die Serverlast mit der ANZAHL der Miner, nicht mit ihrer Hardware,
 * und die Summe aller Share-Difficulties einer Runde ergibt exakt die
 * Block-Difficulty.
 *
 * WARUM UEBER EINEN MITTELWERT UND NICHT UEBER EINEN EINZELWERT:
 *
 * Der Abstand zwischen zwei Shares ist exponentialverteilt. Selbst bei
 * perfekt eingestellter Difficulty liegt ein einzelner gemessener Abstand
 * mit 53 % Wahrscheinlichkeit unter 0,75 und mit 26 % ueber 1,33 des
 * Erwartungswerts -- zusammen 79 %. Eine Anpassung je Einzelwert schwingt
 * deshalb praktisch dauerhaft, auch wenn nichts falsch ist.
 *
 * Im Betrieb hatte das reale Folgen: Der Client rechnete noch gegen das alte
 * Target, waehrend der Server schon ein neues gespeichert hatte, und rund
 * 60 % aller eingereichten Shares fielen als `low_difficulty` durch.
 */

export interface VarDiffParams {
  targetSeconds: number;
  min: bigint;
  max: bigint;
  blockDifficulty: bigint;
  shareDiffBlockRatio: number;
}

/** Wie viele Abstaende in den Mittelwert eingehen. */
export const HISTORY = 8;
/** Ab wie vielen Messwerten auch nach unten geregelt wird. */
const MIN_SAMPLES_TO_LOWER = 4;
/** Unter so vielen Messwerten passiert gar nichts -- ein einzelner Abstand
 *  ist bei exponentialverteilten Zeiten reines Rauschen und wuerde die
 *  Anlaufphase auf einen Zufallswert hochreissen. */
const MIN_SAMPLES_TO_ACT = 2;

/** Obergrenze: ein Share darf nie fast so schwer sein wie ein Block. */
export function ceiling(p: VarDiffParams): bigint {
  const fromBlock = p.blockDifficulty / BigInt(p.shareDiffBlockRatio);
  const cap = fromBlock < p.max ? fromBlock : p.max;
  return cap < p.min ? p.min : cap;
}

export function clamp(value: bigint, p: VarDiffParams): bigint {
  const hi = ceiling(p);
  if (value > hi) return hi;
  if (value < p.min) return p.min;
  return value;
}

/**
 * Messwert anhaengen, aelteste verwerfen.
 *
 * Gespeichert wird NICHT der rohe Abstand, sondern Sekunden je
 * Difficulty-Einheit. Sonst mittelt man Abstaende, die bei verschiedenen
 * Targets gemessen wurden -- ein Abstand bei Difficulty 128 und einer bei
 * 3072 sind nicht dieselbe Groesse, und der Regler schwingt sich daran auf.
 *
 * Normiert ist der Wert direkt ein Schaetzer fuer den Geraetedurchsatz:
 *   Sekunden je Einheit = 65536 / Hashrate
 */
export function pushSample(
  history: number[],
  seconds: number,
  measuredAt: bigint,
): number[] {
  if (!Number.isFinite(seconds) || seconds <= 0 || measuredAt <= 0n) return history;
  return [...history, seconds / Number(measuredAt)].slice(-HISTORY);
}

/**
 * Neue Share-Difficulty aus der Abstandshistorie.
 *
 * Solange weniger als MIN_SAMPLES_TO_LOWER Messwerte vorliegen, wird nur
 * ERHOEHT. Der Startwert ist absichtlich niedrig, damit auch ein schwaches
 * Geraet schnell seinen ersten Share liefert; nach unten zu regeln, bevor
 * ueberhaupt eine belastbare Messung existiert, wuerde diesen Startwert nur
 * zementieren.
 */
export function adjustFromHistory(
  current: bigint,
  history: number[],
  p: VarDiffParams,
): bigint {
  if (history.length < MIN_SAMPLES_TO_ACT) return clamp(current, p);

  const perUnit = history.reduce((a, b) => a + b, 0) / history.length;
  if (!Number.isFinite(perUnit) || perUnit <= 0) return clamp(current, p);

  // Difficulty, die den Zielabstand treffen wuerde
  const ideal = p.targetSeconds / perUnit;
  const ratio = ideal / Number(current);

  if (history.length < MIN_SAMPLES_TO_LOWER) {
    if (ratio <= 1) return clamp(current, p);
    const up = Math.min(4, ratio);
    return clamp(BigInt(Math.max(1, Math.round(Number(current) * up))), p);
  }

  // Totzone. Der Mittelwert aus acht exponentialverteilten Messwerten streut
  // noch mit rund 35 % -- enger zu regeln hiesse, Rauschen nachzujagen.
  if (ratio > 0.6 && ratio < 1.6) return clamp(current, p);

  const bounded = Math.max(0.25, Math.min(4, ratio));
  return clamp(BigInt(Math.max(1, Math.round(Number(current) * bounded))), p);
}

/**
 * Startwert fuer eine neue Session. Bewusst niedrig, damit die Anzeige nicht
 * minutenlang auf Null steht; nach oben regelt sich das in wenigen Shares.
 */
export function initial(p: VarDiffParams): bigint {
  return clamp(128n, p);
}
