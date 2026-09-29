/**
 * Mempool-Pflege nach einem angenommenen Block.
 *
 * WARUM DAS EINE EIGENE DATEI IST
 *
 * Bis September 2026 wurde der Mempool an genau einer Stelle aufgeraeumt:
 * in MiningCoordinator.submitNonce, also nur wenn dieser Knoten den Block
 * SELBST gefunden hatte. Ein Block, der ueber das Netz hereinkam, liess den
 * Mempool unberuehrt.
 *
 * Die Folge: Knoten A nimmt eine Ueberweisung an. Knoten B findet den
 * naechsten Block. A bekommt ihn, haengt ihn an -- und behaelt die
 * Ueberweisung in seiner Warteschlange, obwohl sie laengst in der Kette
 * steht. Beim naechsten eigenen Block baut A sie wieder ein, die Nonce ist
 * verbraucht, und A lehnt seinen eigenen Block ab. Die Arbeit daran ist weg.
 *
 * Und der umgekehrte Fall war noch schlimmer: TxPool.zurueck() gibt es seit
 * jeher, samt Kommentar, warum es noetig ist -- aufgerufen wurde es nie.
 * Nach einem Reorg verschwanden Transaktionen aus verdraengten Bloecken
 * ersatzlos. Eine bezahlte Ueberweisung, weg, weil anderswo ein Block
 * gewonnen hat.
 *
 * Diese Funktion gehoert deshalb an JEDEN angenommenen Block, egal woher
 * er kam. Sie steht bewusst nicht im ChainManager: Der haelt die Kette und
 * soll vom Mempool nichts wissen muessen.
 */
import { deserializeBlock } from '../../core/block.ts';
import { TX_COINBASE, type Transfer } from '../../core/tx.ts';
import type { State } from '../../core/state.ts';
import type { StoredBlock } from './ChainStore.ts';
import type { TxPool } from './TxPool.ts';

/** Wie lange eine Transaktion in der Warteschlange stehen darf. */
export const MEMPOOL_MAX_ALTER = 3600;

export interface PflegeErgebnis {
  /** Aus der Warteschlange genommen, weil jetzt in der Kette. */
  entfernt: number;
  /** Aus der Warteschlange genommen, weil nicht mehr gueltig. */
  ungueltig: number;
  /** Aus verdraengten Bloecken zurueckgeholt. */
  zurueck: number;
  /** Wegen Alters verworfen. */
  verfallen: number;
}

/** Die Ueberweisungen eines Blocks -- ohne die Coinbase. */
function transfers(bloecke: StoredBlock[]): Transfer[] {
  const out: Transfer[] = [];
  for (const b of bloecke) {
    let txs;
    try { txs = deserializeBlock(b.body).txs; }
    catch { continue; }   // Unlesbar gespeichert: Das ist nicht die Sorge des Mempools.
    for (const t of txs) if (t.type !== TX_COINBASE) out.push(t as Transfer);
  }
  return out;
}

/**
 * Den Mempool an die neue Kettenlage anpassen.
 *
 * `state` und `hoehe` muessen die der NEUEN aktiven Kette sein -- also nach
 * dem Umschalten abgefragt, nicht davor.
 *
 * Reihenfolge ist Absicht:
 *
 *   1. Verdraengte zurueck. Sie werden dabei erneut voll geprueft; steht
 *      dieselbe Ueberweisung auch im neuen Zweig, ist ihre Nonce dort
 *      bereits verbraucht und add() weist sie ab. Das ist kein Sonderfall,
 *      den man abfangen muesste -- es faellt von selbst richtig aus.
 *   2. Dann die Enthaltenen raus, und alles, was der neue Zustand nicht
 *      mehr deckt.
 *   3. Zuletzt die Altlasten. Dass es bei jedem Block passiert, ist der
 *      Takt: rund alle zehn Minuten, ohne eigenen Zeitgeber.
 */
export function mempoolNachziehen(
  wechsel: { neu: StoredBlock[]; verdraengt: StoredBlock[] },
  pool: TxPool,
  state: State,
  hoehe: number,
): PflegeErgebnis {
  const zurueck = wechsel.verdraengt.length > 0
    ? pool.zurueck(transfers(wechsel.verdraengt), state, hoehe)
    : 0;

  const { entfernt, ungueltig } = pool.nachBlock(transfers(wechsel.neu), state);
  const verfallen = pool.aufraeumen(MEMPOOL_MAX_ALTER);

  return { entfernt, ungueltig, zurueck, verfallen };
}
