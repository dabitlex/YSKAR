/**
 * Was ein angenommener Block mit der aktiven Kette gemacht hat.
 *
 * WARUM NICHT EINFACH `reorg` AUS accept()?
 *
 * accept() meldet `reorg: true`, sobald der neue Kopf nicht direkt am alten
 * haengt. Das trifft auch zu, wenn ein Block mehrere vorher gespeicherte
 * Bloecke auf einmal an die aktive Kette anschliesst -- ohne dass ein
 * einziger Block seinen Platz verliert. Eine Meldung "Reorg" waere dann
 * falsch, und wer Reorgs zaehlt (Betreiber, OTC, Observer), bekaeme
 * Fehlalarme.
 *
 * Entscheidend ist deshalb allein, ob Bloecke die aktive Kette VERLASSEN
 * haben (`verdraengt`) und wie viele aktiv WURDEN (`neu`):
 *
 *   verlaengert  nichts verdraengt, genau ein Block neu   -- normaler Block
 *   aufgeholt    nichts verdraengt, mehrere Bloecke neu   -- kein Reorg
 *   nebenzweig   kein Block neu                           -- Konkurrenzblock
 *                                                            gespeichert, die
 *                                                            Kette bleibt
 *   reorg        mindestens ein Block verdraengt          -- echte
 *                                                            Reorganisation;
 *                                                            Tiefe = Anzahl
 *                                                            der verdraengten
 *
 * Nur Lesen und Zaehlen. Die Kettenwahl selbst bleibt im ChainManager.
 */
import { toHex } from '../../core/codec.ts';
import type { AcceptResult } from './ChainManager.ts';

export type EreignisArt = 'verlaengert' | 'aufgeholt' | 'nebenzweig' | 'reorg';

export interface KettenEreignis {
  art: EreignisArt;
  /** Hoehe des angenommenen Blocks selbst. */
  blockHoehe: number;
  /** Hoehe des aktiven Kopfs nach der Annahme. */
  kopfHoehe: number;
  /** Hash des aktiven Kopfs nach der Annahme (hex). */
  neuerKopf: string;
  /** Nur bei reorg: der bisherige Kopf (hex) und die Hoehe, ab der sich die Zweige trennen. */
  alterKopf: string | null;
  abzweigHoehe: number | null;
  /** Anzahl der Bloecke, die die aktive Kette verlassen haben. 0 ausser bei reorg. */
  tiefe: number;
  /** Anzahl der Bloecke, die aktiv wurden. */
  neu: number;
}

type Gespeichert = Extract<AcceptResult, { stored: true }>;

/** Ein gespeichertes Ergebnis von accept() einordnen. */
export function ordneEin(r: Gespeichert, blockHoehe: number): KettenEreignis {
  const tiefe = r.verdraengt.length;
  const neu = r.neu.length;
  const art: EreignisArt = tiefe > 0 ? 'reorg'
    : neu === 0 ? 'nebenzweig'
    : neu === 1 ? 'verlaengert'
    : 'aufgeholt';

  let alterKopf: string | null = null;
  let abzweigHoehe: number | null = null;
  if (tiefe > 0) {
    // Hoechster und niedrigster verdraengter Block -- unabhaengig davon, in
    // welcher Reihenfolge die Liste kommt.
    let hoch = r.verdraengt[0], tief = r.verdraengt[0];
    for (const b of r.verdraengt) {
      if (b.height > hoch.height) hoch = b;
      if (b.height < tief.height) tief = b;
    }
    alterKopf = toHex(hoch.hash);
    abzweigHoehe = tief.height - 1;
  }

  return {
    art, blockHoehe, kopfHoehe: r.height, neuerKopf: toHex(r.tip),
    alterKopf, abzweigHoehe, tiefe, neu,
  };
}

/**
 * Zaehlt Reorgs und Nebenzweig-Bloecke seit dem Start des Knotens.
 *
 * Nur im Arbeitsspeicher: Nach einem Neustart beginnt die Zaehlung bei null.
 * Dauerhaft festhalten ist Aufgabe des Protokolls (journalctl) oder eines
 * Observers.
 */
export class KettenBeobachter {
  private reorgs = 0;
  private tiefster = 0;
  private letzter: { hoehe: number; tiefe: number; zeit: number; alterKopf: string; neuerKopf: string } | null = null;
  private forks = 0;
  private readonly seit: number;
  private readonly uhr: () => number;

  constructor(uhr: () => number = Date.now) {
    this.uhr = uhr;
    this.seit = uhr();
  }

  nimm(e: KettenEreignis): void {
    if (e.art === 'nebenzweig') { this.forks++; return; }
    if (e.art !== 'reorg') return;
    this.reorgs++;
    if (e.tiefe > this.tiefster) this.tiefster = e.tiefe;
    this.letzter = {
      hoehe: e.kopfHoehe, tiefe: e.tiefe, zeit: Math.floor(this.uhr() / 1000),
      alterKopf: e.alterKopf ?? '', neuerKopf: e.neuerKopf,
    };
  }

  /** Fuer /status. Zeiten in Unix-Sekunden. */
  stand(): Record<string, unknown> {
    return {
      reorgs: {
        count: this.reorgs,
        deepest: this.tiefster,
        last: this.letzter,
        since: Math.floor(this.seit / 1000),
      },
      forks: { count: this.forks, since: Math.floor(this.seit / 1000) },
    };
  }
}
