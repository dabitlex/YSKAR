/**
 * PPLNS — Pay Per Last N Shares.
 *
 * Bezahlt wird nicht "alle Shares seit dem letzten Block", sondern immer
 * die letzten N Arbeitseinheiten — ueber Blockfunde hinweg.
 *
 * WARUM DAS DER UNTERSCHIED IST, DER ZAEHLT:
 *
 * Bei proportionaler Verteilung je Runde beginnt nach jedem Block eine neue
 * Zaehlung. Wer kurz nach einem Fund einsteigt und nach kurzer Zeit wieder
 * geht, hat einen grossen Anteil an einer kleinen Runde -- und bekommt im
 * Mittel mehr als seine Arbeit wert ist. Bezahlt wird das von denen, die
 * durchhalten. Das ist als Pool-Hopping bekannt und kein theoretisches
 * Problem: Es lohnt sich messbar.
 *
 * Das PPLNS-Fenster kennt keine Rundengrenze. Es wandert einfach mit. Damit
 * ist der Zeitpunkt des Einstiegs gleichgueltig -- eine Einheit Arbeit ist
 * eine Einheit Arbeit, egal wann sie geleistet wurde.
 *
 * Der Preis: Wer neu dazukommt, muss das Fenster erst "fuellen", bevor er
 * vollen Anteil bekommt. Und wer aufhoert, bekommt noch eine Weile etwas.
 * Ueber die Zeit gleicht sich das exakt aus; nur wer einmalig kurz
 * hineinschaut, verliert. Genau das ist gewollt.
 *
 * Gerechnet wird ausschliesslich in Ganzzahlen.
 */
import { toHex } from '../core/codec.ts';
import type { Anteil } from './settlement.ts';

/**
 * Fenstergroesse als Vielfaches der Netz-Difficulty.
 *
 * Bei 2 umfasst das Fenster die Arbeit von rund zwei erwarteten Bloecken.
 * Groesser heisst gleichmaessiger, aber traeger: Wer aufhoert, bekommt
 * laenger etwas, und wer anfaengt, wartet laenger auf vollen Anteil.
 *
 * Zwei ist der in Pools ueblichste Wert und ein vernuenftiger Ausgleich.
 */
export const PPLNS_FAKTOR = 2n;

export interface ShareEintrag {
  /**
   * Auszahlungsadresse, festgeschrieben beim Einreichen des Shares.
   *
   * Nicht erst bei der Abrechnung nachgeschlagen: Sonst koennte ein Miner
   * -- oder der Betreiber -- die Adresse nachtraeglich aendern und damit
   * Arbeit umleiten, die jemand anderes geleistet hat.
   */
  to: Uint8Array;
  /** Gutgeschriebene Arbeit in Difficulty-Einheiten. Immer > 0. */
  work: bigint;
}

/**
 * Die letzten N Arbeitseinheiten aus dem Verlauf, nach Adresse
 * zusammengefasst.
 *
 * @param log     chronologisch, aeltester Eintrag zuerst
 * @param fenster N in Difficulty-Einheiten
 *
 * Ist weniger Arbeit vorhanden als das Fenster fasst, wird genommen, was da
 * ist. Das ist der Normalfall in den ersten Stunden eines Pools.
 */
export function fensterAnteile(log: ShareEintrag[], fenster: bigint): Anteil[] {
  if (fenster <= 0n) throw new Error('Fenster muss positiv sein');

  const summiert = new Map<string, Anteil>();
  let gesammelt = 0n;

  // Rueckwaerts: die juengste Arbeit zaehlt sicher, die aelteste faellt
  // heraus.
  for (let i = log.length - 1; i >= 0 && gesammelt < fenster; i--) {
    const e = log[i];
    if (e.work <= 0n) continue;

    /*
      Der aelteste Eintrag im Fenster zaehlt nur anteilig.

      Ihn ganz mitzunehmen waere einfacher und falsch: Dann haenge die
      tatsaechliche Fenstergroesse davon ab, wie gross zufaellig der Share
      an der Grenze war -- und zwei Knoten mit verschieden geschnittenen
      Logs kaemen zu verschiedenen Ergebnissen.

      Der Teilbetrag ist exakt der Rest, also Ganzzahlarithmetik ohne
      Rundung.
    */
    const rest = fenster - gesammelt;
    const zaehlt = e.work <= rest ? e.work : rest;
    gesammelt += zaehlt;

    const k = toHex(e.to);
    const vorhanden = summiert.get(k);
    if (vorhanden) vorhanden.work += zaehlt;
    else summiert.set(k, { to: e.to, work: zaehlt });
  }

  return [...summiert.values()];
}

/** Fenstergroesse fuer eine gegebene Netz-Difficulty. */
export function fensterGroesse(netzDifficulty: bigint, faktor = PPLNS_FAKTOR): bigint {
  if (netzDifficulty <= 0n) throw new Error('Difficulty muss positiv sein');
  return netzDifficulty * faktor;
}

/**
 * Verlauf der eingereichten Arbeit.
 *
 * Haelt nur so viel, wie das Fenster braucht -- mit Reserve, weil die
 * Netz-Difficulty steigen kann und das Fenster damit groesser wird.
 */
export class ShareLog {
  private eintraege: ShareEintrag[] = [];
  private summe = 0n;
  /** Wie viel mehr als das Fenster aufgehoben wird. */
  private readonly reserve: bigint;

  constructor(reserveFaktor = 3n) { this.reserve = reserveFaktor; }

  add(to: Uint8Array, work: bigint): void {
    if (work <= 0n) return;
    this.eintraege.push({ to, work });
    this.summe += work;
  }

  /** Gesamte gehaltene Arbeit. */
  gesamt(): bigint { return this.summe; }
  laenge(): number { return this.eintraege.length; }

  anteile(fenster: bigint): Anteil[] {
    return fensterAnteile(this.eintraege, fenster);
  }

  /**
   * Alte Eintraege verwerfen, die das Fenster nicht mehr erreichen kann.
   *
   * Ohne das waechst der Verlauf unbegrenzt. Mit Reserve, damit ein Anstieg
   * der Difficulty nicht sofort Arbeit verschluckt, die noch zaehlen
   * muesste.
   */
  aufraeumen(fenster: bigint): number {
    const behalten = fenster * this.reserve;
    let weg = 0;
    while (this.eintraege.length > 0 && this.summe - this.eintraege[0].work >= behalten) {
      this.summe -= this.eintraege[0].work;
      this.eintraege.shift();
      weg++;
    }
    return weg;
  }

  /** Fuer Wiederherstellung nach einem Neustart. */
  laden(eintraege: ShareEintrag[]): void {
    this.eintraege = eintraege.filter(e => e.work > 0n);
    this.summe = this.eintraege.reduce((s, e) => s + e.work, 0n);
  }

  exportieren(): ShareEintrag[] { return [...this.eintraege]; }
}
