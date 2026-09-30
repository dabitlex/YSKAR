/**
 * Miner und Hashrate ueber alle verbundenen Knoten.
 *
 * Jeder Knoten kennt nur die Sitzungen, die an IHM haengen. Wer am PC ueber
 * einen eigenen Knoten mint, taucht in den Zahlen des Raspberry nicht auf.
 * Deshalb melden sich Knoten mit "+stats" gegenseitig alle 30 Sekunden
 * ihre Sitzungen (messages.ts, Stats), und hier wird zusammengezaehlt.
 *
 * GRENZEN, ausdruecklich:
 *   - GEMELDET, nicht bewiesen. Ein Knoten kann luegen. Die beweisbare
 *     Zahl ist die Hashrate aus Difficulty und Blockzeit (ReadApi).
 *   - Nur DIREKTE Peers. Meldungen werden nicht weitergereicht; ein Knoten
 *     hinter einem anderen fehlt in der Summe.
 *   - Miner werden nach ADRESSE gezaehlt, ueber alle Knoten hinweg. Wer mit
 *     derselben Adresse an zwei Knoten mint, zaehlt einmal.
 */
import { toHex } from '../../core/codec.ts';
import type { Stats } from '../p2p/messages.ts';

/** Nach so langer Stille gilt eine Meldung als veraltet. */
export const STATS_VERFALL_MS = 90_000;

export interface LokaleStatistik {
  adressen: string[];      // Hex, 20 Byte
  hashrate: number;
  sessions: number;
}

export interface NetzSumme {
  /** Knoten, die gerade eine gueltige Meldung haben -- dieser eingeschlossen. */
  knoten: number;
  miner: number;
  hashrate: number;
  sessions: number;
}

interface Eintrag { stats: Stats; zeit: number }

export class NetzStatistik {
  private meldungen = new Map<string, Eintrag>();
  /** Kennung dieses Knotens -- eigene Meldungen ueber Umwege zaehlen nicht. */
  readonly eigeneKennung: bigint;
  private uhr: () => number;

  constructor(eigeneKennung: bigint, uhr: () => number = Date.now) {
    this.eigeneKennung = eigeneKennung;
    this.uhr = uhr;
  }

  aufnehmen(s: Stats): void {
    if (s.knoten === this.eigeneKennung) return;
    this.meldungen.set(s.knoten.toString(), { stats: s, zeit: this.uhr() });
  }

  /** Veraltete Meldungen entfernen. */
  private aufraeumen(): void {
    const grenze = this.uhr() - STATS_VERFALL_MS;
    for (const [k, e] of this.meldungen) if (e.zeit < grenze) this.meldungen.delete(k);
  }

  summe(lokal: LokaleStatistik): NetzSumme {
    this.aufraeumen();
    const adressen = new Set(lokal.adressen);
    let hashrate = lokal.hashrate;
    let sessions = lokal.sessions;
    for (const { stats } of this.meldungen.values()) {
      for (const a of stats.adressen) adressen.add(toHex(a));
      hashrate += Number(stats.hashrate);
      sessions += stats.sessions;
    }
    return { knoten: 1 + this.meldungen.size, miner: adressen.size, hashrate, sessions };
  }
}
