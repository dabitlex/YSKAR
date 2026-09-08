/**
 * VarDiff -- pro Session ein eigenes Share-Target.
 *
 * Ziel: Jede Session liefert etwa alle `targetSeconds` einen Share, egal ob
 * altes Android-Handy oder nachgebauter Client auf einer Grafikkarte.
 *
 * Das ist der Grund, warum die Serverlast mit der ANZAHL der Miner skaliert
 * und nicht mit ihrer Hashrate. Ein schnelles Gerät bekommt nicht mehr
 * Shares, sondern Shares mit höherer Difficulty -- und die zählen
 * entsprechend mehr. Die Summe aller Share-Difficulties einer Runde ergibt
 * dabei exakt die Block-Difficulty, weshalb die anteilige Reward-Verteilung
 * ohne Korrekturfaktor aufgeht.
 */

export interface VarDiffParams {
  targetSeconds: number;   // gewünschter Abstand zwischen zwei Shares
  min: bigint;
  max: bigint;
  blockDifficulty: bigint;
  shareDiffBlockRatio: number;  // Share-Difficulty höchstens block/ratio
}

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
 * Neue Share-Difficulty nach einem eingegangenen Share.
 *
 * `observedSeconds` ist der Abstand zum vorherigen Share dieser Session.
 * Die Anpassung ist absichtlich träge (Faktor höchstens 4 pro Schritt und
 * eine Totzone um den Zielwert): Die Zeit zwischen zwei Shares ist
 * exponentialverteilt, ein einzelner kurzer oder langer Abstand ist also
 * kein Signal, sondern Rauschen.
 */
export function adjust(
  current: bigint,
  observedSeconds: number,
  p: VarDiffParams,
): bigint {
  if (!Number.isFinite(observedSeconds) || observedSeconds <= 0) {
    return clamp(current, p);
  }

  const ratio = p.targetSeconds / observedSeconds;   // >1 = zu schnell
  if (ratio > 0.75 && ratio < 1.33) return clamp(current, p);  // Totzone

  const bounded = Math.max(0.25, Math.min(4, ratio));
  const next = BigInt(Math.max(1, Math.round(Number(current) * bounded)));
  return clamp(next, p);
}

/**
 * Startwert für eine neue Session. Bewusst niedrig: Ein schwaches Gerät soll
 * schnell seinen ersten Share liefern, damit die Anzeige nicht minutenlang
 * auf Null steht. Nach oben regelt sich das innerhalb weniger Shares ein.
 */
export function initial(p: VarDiffParams): bigint {
  return clamp(128n, p);
}
