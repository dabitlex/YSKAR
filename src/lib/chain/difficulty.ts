/**
 * Difficulty-Anpassung nach LWMA-1 (Zawy), plus eine Notfallregel.
 *
 * Warum nicht das Bitcoin-Verfahren mit festem Retarget-Intervall: Bei einem
 * Netz, dessen Teilnehmerzahl zwischen Tag und Nacht um eine Größenordnung
 * schwankt, reagiert es viel zu träge. LWMA gewichtet junge Blöcke stärker
 * und fängt Sprünge innerhalb weniger Blöcke ab.
 *
 * Die Notfallregel deckt den Fall ab, den LWMA nicht lösen kann: Wenn nachts
 * niemand mint, kommt kein neuer Block, und ohne neuen Block passt sich die
 * Difficulty nie an. Die Kette bliebe stehen. Deshalb lockert das Target mit
 * zunehmender Wartezeit -- rein aus der verstrichenen Zeit, ohne neuen Block.
 */

export interface DifficultyParams {
  targetBlockTime: number;   // Sekunden
  lwmaWindow: number;        // Anzahl Blöcke im Fenster
  lwmaClamp: number;         // max. Änderungsfaktor pro Schritt
  minDifficulty: bigint;
  emergencyFactor: number;   // ab dem Wielfachen der Zielzeit lockert das Target
}

export interface BlockTiming {
  difficulty: bigint;
  solveSeconds: number;   // Zeit zum Vorgängerblock
}

/**
 * Nächste Difficulty aus den letzten N Blöcken.
 *
 * `recent` ist aufsteigend nach Höhe sortiert; das letzte Element ist der
 * zuletzt gefundene Block.
 */
export function nextDifficulty(recent: BlockTiming[], p: DifficultyParams): bigint {
  if (recent.length === 0) return p.minDifficulty;

  const N = Math.min(recent.length, p.lwmaWindow);
  const win = recent.slice(-N);
  const T = p.targetBlockTime;

  // Ausreißer begrenzen: eine einzelne absurde Lösungszeit (Uhrensprung,
  // stundenlange Pause) darf das Fenster nicht dominieren.
  const clampSolve = (s: number) => Math.max(1, Math.min(s, 6 * T));

  // LWMA: Gewicht i für den i-ten Block im Fenster, jüngster hat das höchste.
  let weightedSum = 0;
  let difficultySum = 0n;
  for (let i = 0; i < N; i++) {
    weightedSum += clampSolve(win[i].solveSeconds) * (i + 1);
    difficultySum += win[i].difficulty;
  }
  const k = (N * (N + 1)) / 2;
  let lwma = weightedSum / k;
  if (lwma < T / 20) lwma = T / 20;   // Division durch nahezu Null verhindern

  const avgDifficulty = Number(difficultySum) / N;
  let next = BigInt(Math.round((avgDifficulty * T) / lwma));

  // Änderung pro Schritt begrenzen
  const last = win[win.length - 1].difficulty;
  const upper = BigInt(Math.round(Number(last) * p.lwmaClamp));
  const lower = BigInt(Math.round(Number(last) / p.lwmaClamp));
  if (next > upper) next = upper;
  if (next < lower) next = lower;

  return next < p.minDifficulty ? p.minDifficulty : next;
}

/**
 * Difficulty für einen Job, der gerade ausgegeben wird.
 *
 * Bis zum `emergencyFactor`-fachen der Zielzeit passiert nichts. Danach
 * halbiert sich die Difficulty mit jeder Verdopplung der Wartezeit, bis zur
 * Untergrenze. Ohne diese Regel steht die Kette morgens, wenn nachts die
 * Miner weg waren.
 */
export function effectiveDifficulty(
  base: bigint,
  secondsSinceLastBlock: number,
  p: DifficultyParams,
): bigint {
  const threshold = p.emergencyFactor * p.targetBlockTime;
  if (secondsSinceLastBlock <= threshold) return base;

  const eased = BigInt(Math.floor((Number(base) * threshold) / secondsSinceLastBlock));
  return eased < p.minDifficulty ? p.minDifficulty : eased;
}
