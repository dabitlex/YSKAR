/**
 * Zeitraum fuer den Wallet-Verlauf.
 *
 * Gefiltert wird nach der Blockzeit (Unix-Sekunden) -- der Zeit, zu der die
 * Transaktion bestaetigt wurde. Die Tagesgrenzen sind die des Geraets
 * (Ortszeit), so wie der Nutzer "heute" oder "12. September" versteht.
 *
 * Ergebnis ist ein halboffenes Intervall [von, bis): "bis" ist der Beginn
 * des Tages NACH dem letzten gewaehlten Tag.
 */

export type Zeitraum =
  | { art: 'immer' }
  | { art: 'heute' }
  | { art: 'tage7' }
  | { art: 'tage30' }
  | { art: 'monat' }
  /** Datumsangaben als "JJJJ-MM-TT", wie sie <input type="date"> liefert. */
  | { art: 'eigen'; von: string; bis: string };

export const IMMER: Zeitraum = { art: 'immer' };

const tagBeginn = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusTage = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sek = (d: Date) => Math.floor(d.getTime() / 1000);

/** "JJJJ-MM-TT" -> Beginn dieses Tages in Ortszeit; Unsinn -> null. */
export function tagAus(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getDate() === Number(m[3]) ? d : null;
}

/** Datum -> "JJJJ-MM-TT" in Ortszeit (fuer <input type="date">). */
export function tagText(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** [von, bis) in Unix-Sekunden; [null, null] = kein Zeitfilter. */
export function grenzen(z: Zeitraum, jetzt: Date = new Date()): [number | null, number | null] {
  const morgen = plusTage(tagBeginn(jetzt), 1);
  switch (z.art) {
    case 'immer': return [null, null];
    case 'heute': return [sek(tagBeginn(jetzt)), sek(morgen)];
    case 'tage7': return [sek(plusTage(morgen, -7)), sek(morgen)];
    case 'tage30': return [sek(plusTage(morgen, -30)), sek(morgen)];
    case 'monat': return [sek(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1)), sek(morgen)];
    case 'eigen': {
      let a = tagAus(z.von), b = tagAus(z.bis);
      if (!a && !b) return [null, null];
      if (a && b && a > b) [a, b] = [b, a];
      return [a ? sek(a) : null, b ? sek(plusTage(b, 1)) : null];
    }
  }
}

/** Erster und letzter Tag (einschliesslich) -- fuer die Anzeige. */
export function tage(z: Zeitraum, jetzt: Date = new Date()): [Date | null, Date | null] {
  const [von, bis] = grenzen(z, jetzt);
  return [von === null ? null : new Date(von * 1000),
          bis === null ? null : plusTage(new Date(bis * 1000), -1)];
}
