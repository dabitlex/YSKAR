import { type Block, type BlockHeader, checkBlockStructure, headerHash, meetsTarget } from './block.ts';
import { type State, cloneState, applyBlock, stateRoot } from './state.ts';
import { txMerkleRoot } from './block.ts';
import { nextDifficulty, effectiveDifficulty, checkTimestamp, type BlockTiming } from './difficulty.ts';
import { GENESIS_DIFFICULTY, MIN_DIFFICULTY } from './params.ts';
import { toHex } from './codec.ts';

/**
 * Vollstaendige Blockpruefung -- das, was ein Knoten tut, bevor er einen
 * fremden Block annimmt.
 *
 * Die Reihenfolge ist bewusst von billig nach teuer: Struktur und Proof of
 * Work zuerst, das Anwenden auf den Zustand zuletzt. Ein Angreifer soll fuer
 * jeden Versuch, uns Arbeit zu machen, selbst Arbeit geleistet haben.
 *
 * Der Zustand wird NICHT veraendert -- die Pruefung laeuft auf einer Kopie.
 * Der Aufrufer wendet den Block erst an, wenn hier null zurueckkommt.
 */

export interface Context {
  /** Header des Vorgaengers; null nur beim Genesis. */
  previous: BlockHeader | null;
  /** Zustand NACH dem Vorgaenger. */
  state: State;
  /** Zeitstempel der letzten Bloecke, aeltester zuerst. */
  recentTimestamps: bigint[];
  /** Difficulty und Loesungszeit der letzten Bloecke fuer LWMA. */
  recentTimings: BlockTiming[];
  /** Aktuelle Zeit in Sekunden -- fuer die Zukunftsgrenze. */
  now: bigint;
}

export type ValidationError =
  | { code: 'structure'; detail: string }
  | { code: 'height'; detail: string }
  | { code: 'prev_hash'; detail: string }
  | { code: 'timestamp'; detail: string }
  | { code: 'difficulty'; detail: string }
  | { code: 'state'; detail: string }
  | { code: 'state_root'; detail: string };

/**
 * Erwartete Difficulty an einer Hoehe. Deterministisch -- jeder Knoten muss
 * denselben Wert errechnen, sonst lehnt er gueltige Bloecke ab.
 *
 * Die Notfallregel geht bewusst NICHT ein: Sie darf das Target lockern,
 * waehrend gesucht wird, aber ein bereits gefundener Block wird gegen die
 * Difficulty geprueft, die in seinem eigenen Header steht -- und die muss
 * zwischen der regulaeren und der gelockerten Vorgabe liegen.
 */
export function expectedDifficulty(timings: BlockTiming[]): bigint {
  if (timings.length === 0) return GENESIS_DIFFICULTY;
  return nextDifficulty(timings);
}

export function validateBlock(block: Block, ctx: Context): ValidationError | null {
  // --- billig: Aufbau, Merkle, Proof of Work ---
  const structural = checkBlockStructure(block);
  if (structural) return { code: 'structure', detail: structural };

  const h = block.header;

  // --- Einordnung in die Kette ---
  if (ctx.previous === null) {
    if (h.height !== 0) return { code: 'height', detail: 'Genesis muss Hoehe 0 haben' };
    if (h.prevHash.some(b => b !== 0)) {
      return { code: 'prev_hash', detail: 'Genesis prev_hash muss null sein' };
    }
  } else {
    if (h.height !== ctx.previous.height + 1) {
      return { code: 'height', detail: `erwartet ${ctx.previous.height + 1}, erhalten ${h.height}` };
    }
    const want = headerHash(ctx.previous);
    if (toHex(h.prevHash) !== toHex(want)) {
      return { code: 'prev_hash', detail: `zeigt nicht auf Block ${ctx.previous.height}` };
    }
  }

  // --- Zeitstempel ---
  if (ctx.previous !== null) {
    const tsError = checkTimestamp(h.timestamp, ctx.recentTimestamps, ctx.now);
    if (tsError) return { code: 'timestamp', detail: tsError };
  }

  // --- Difficulty ---
  if (ctx.previous !== null) {
    const regular = expectedDifficulty(ctx.recentTimings);
    const elapsed = h.timestamp > ctx.previous.timestamp
      ? h.timestamp - ctx.previous.timestamp : 0n;
    const eased = effectiveDifficulty(regular, elapsed);
    // Zulaessig ist alles zwischen der gelockerten Untergrenze und dem
    // regulaeren Wert. Schwerer als noetig darf ein Miner gern arbeiten.
    if (h.difficulty > regular || h.difficulty < eased) {
      return {
        code: 'difficulty',
        detail: `${h.difficulty} liegt nicht zwischen ${eased} und ${regular}`,
      };
    }
    if (h.difficulty < MIN_DIFFICULTY) {
      return { code: 'difficulty', detail: `unter der Untergrenze ${MIN_DIFFICULTY}` };
    }
  }

  // --- teuer: Zustand anwenden ---
  const draft = cloneState(ctx.state);
  const applied = applyBlock(draft, block);
  if (!applied.ok) {
    return { code: 'state', detail: `tx ${applied.error?.tx}: ${applied.error?.reason}` };
  }

  const root = stateRoot(draft);
  if (toHex(root) !== toHex(h.stateRoot)) {
    return {
      code: 'state_root',
      detail: `berechnet ${toHex(root).slice(0, 16)}…, im Header ${toHex(h.stateRoot).slice(0, 16)}…`,
    };
  }

  return null;
}

/**
 * Kumulierte Arbeit einer Kette. Bei zwei konkurrierenden Ketten gewinnt die
 * mit der hoeheren Summe -- nicht die laengere. Wird in Phase 2 fuer Reorgs
 * gebraucht; die Formel gehoert aber zum Konsens und steht deshalb hier.
 */
export function cumulativeWork(difficulties: bigint[]): bigint {
  let sum = 0n;
  for (const d of difficulties) sum += d;
  return sum;
}
