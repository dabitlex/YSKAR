/**
 * Begrenzung von Anfragen nach dem Token-Bucket-Verfahren.
 *
 * Je Schluessel (Sitzung oder Absender-IP) gibt es einen Vorrat an Marken.
 * Jede Anfrage verbraucht eine; nachgefuellt wird mit fester Rate bis zum
 * Vorrat. Kurze Spitzen -- etwa der Start eines Miners, wenn das Share-Ziel
 * noch niedrig ist -- deckt der Vorrat; auf Dauer gilt die Rate.
 *
 * Die Tabelle ist begrenzt (maxSchluessel). Ist sie voll, faellt der am
 * laengsten nicht benutzte Schluessel heraus. Sonst koennte die Begrenzung
 * selbst zum Angriffsziel werden: Jede neue Adresse kostete Speicher.
 * Wer herausfaellt, beginnt beim naechsten Mal mit vollem Vorrat -- das ist
 * fuer Ehrliche harmlos und fuer einen Angreifer kein Gewinn, solange die
 * Tabelle groesser ist als die Zahl gleichzeitig aktiver Schluessel.
 *
 * Keine Abhaengigkeiten, Uhr von aussen setzbar (Tests).
 */

export interface Kontingent {
  /** Marken je Sekunde, die nachfliessen. */
  rate: number;
  /** Hoechster Vorrat -- so viele Anfragen gehen auf einmal. */
  vorrat: number;
}

interface Eimer { marken: number; zuletzt: number }

export class Drossel {
  private readonly k: Kontingent;
  private readonly max: number;
  private readonly uhr: () => number;
  private eimer = new Map<string, Eimer>();
  /** Seit dem Start abgewiesene Anfragen. */
  abgewiesen = 0;

  constructor(k: Kontingent, maxSchluessel = 10_000, uhr: () => number = Date.now) {
    if (!(k.rate > 0) || !(k.vorrat >= 1)) throw new Error('Drossel: Rate > 0 und Vorrat >= 1 noetig');
    this.k = k;
    this.max = Math.max(1, Math.floor(maxSchluessel));
    this.uhr = uhr;
  }

  /** Eine Anfrage fuer diesen Schluessel: true = erlaubt (eine Marke verbraucht). */
  erlaubt(schluessel: string): boolean {
    const jetzt = this.uhr();
    let e = this.eimer.get(schluessel);
    if (e) {
      // Nach hinten stellen: zuletzt benutzt.
      this.eimer.delete(schluessel);
      const dazu = Math.max(0, jetzt - e.zuletzt) / 1000 * this.k.rate;
      e.marken = Math.min(this.k.vorrat, e.marken + dazu);
      e.zuletzt = jetzt;
    } else {
      e = { marken: this.k.vorrat, zuletzt: jetzt };
      if (this.eimer.size >= this.max) {
        const aeltester = this.eimer.keys().next().value;
        if (aeltester !== undefined) this.eimer.delete(aeltester);
      }
    }
    this.eimer.set(schluessel, e);
    if (e.marken >= 1) { e.marken -= 1; return true; }
    this.abgewiesen++;
    return false;
  }

  /** Sekunden, bis fuer diesen Schluessel wieder eine Marke da ist (fuer Retry-After). */
  wartezeit(schluessel: string): number {
    const e = this.eimer.get(schluessel);
    if (!e || e.marken >= 1) return 0;
    return Math.max(1, Math.ceil((1 - e.marken) / this.k.rate));
  }

  /** Einen Schluessel vergessen, etwa wenn seine Sitzung endet. */
  vergiss(schluessel: string): void { this.eimer.delete(schluessel); }

  groesse(): number { return this.eimer.size; }
}
