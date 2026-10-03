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

/**
 * Mehr Meldungen werden nicht aufgehoben. Aufgehoben wird je VERBINDUNG eine;
 * die Grenze greift erst, wenn es mehr Verbindungen gaebe, als ein Knoten je
 * haelt.
 */
const MELDUNGEN_MAX = 256;
/** Kommt von derselben Verbindung schneller eine weitere Meldung, wird sie uebergangen. */
const MELDUNG_ABSTAND_MS = 1_000;

interface Eintrag { knoten: string; adressen: string[]; hashrate: number; sessions: number; zeit: number }

export class NetzStatistik {
  /** Je Verbindung die juengste Meldung. */
  private meldungen = new Map<string, Eintrag>();
  /** Kennung dieses Knotens -- eigene Meldungen ueber Umwege zaehlen nicht. */
  readonly eigeneKennung: bigint;
  private uhr: () => number;

  constructor(eigeneKennung: bigint, uhr: () => number = Date.now) {
    this.eigeneKennung = eigeneKennung;
    this.uhr = uhr;
  }

  /**
   * Eine Meldung aufnehmen.
   *
   * @param quelle  die Verbindung, ueber die sie kam. Aufgehoben wird je
   *                Verbindung EINE Meldung -- die naechste ersetzt sie.
   *
   * Frueher war die gemeldete Kennung der Schluessel. Die waehlt aber der
   * Absender: Mit jeder Meldung eine neue Kennung, und der Knoten hob sie
   * alle auf, bis ihm der Speicher ausging. Jetzt kann eine Verbindung nur
   * ihren eigenen Platz ueberschreiben.
   *
   * Ohne `quelle` gilt die Kennung als Quelle -- so wie bisher, fuer
   * Aufrufer, die selbst nur eine Meldung je Knoten liefern.
   */
  aufnehmen(s: Stats, quelle?: string): void {
    if (s.knoten === this.eigeneKennung) return;
    const jetzt = this.uhr();
    const schluessel = quelle ?? `k:${s.knoten}`;
    const alt = this.meldungen.get(schluessel);
    if (alt && jetzt - alt.zeit < MELDUNG_ABSTAND_MS) return;
    if (!alt && this.meldungen.size >= MELDUNGEN_MAX) {
      this.aufraeumen();
      if (this.meldungen.size >= MELDUNGEN_MAX) return;
    }
    const hashrate = Number(s.hashrate);
    this.meldungen.set(schluessel, {
      knoten: s.knoten.toString(),
      adressen: s.adressen.map(a => toHex(a)),
      hashrate: Number.isFinite(hashrate) && hashrate >= 0 ? hashrate : 0,
      sessions: s.sessions,
      zeit: jetzt,
    });
  }

  /** Eine Verbindung ist zu -- ihre Meldung gilt nicht mehr. */
  vergiss(quelle: string): void {
    this.meldungen.delete(quelle);
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
    // Zwei Verbindungen zum selben Knoten: Er zaehlt einmal, mit der juengsten Meldung.
    const jeKnoten = new Map<string, Eintrag>();
    for (const e of this.meldungen.values()) {
      const alt = jeKnoten.get(e.knoten);
      if (!alt || e.zeit > alt.zeit) jeKnoten.set(e.knoten, e);
    }
    for (const e of jeKnoten.values()) {
      for (const a of e.adressen) adressen.add(a);
      hashrate += e.hashrate;
      sessions += e.sessions;
    }
    return { knoten: 1 + jeKnoten.size, miner: adressen.size, hashrate, sessions };
  }
}
