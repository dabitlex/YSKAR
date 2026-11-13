/**
 * Verlauf nach Art filtern: nur Mining (Blockreward, Pool-Anteil) oder nur
 * Ueberweisungen (Ein- und Ausgaenge).
 *
 * Die Datenbank kennt nur die Richtung (alle, ein, aus). Die Art wird
 * deshalb HIER ausgewaehlt: Die Schnittstelle liest Seiten des Verlaufs und
 * behaelt, was passt. Der Cursor zeigt immer auf den letzten GELESENEN
 * Eintrag, nicht auf den letzten behaltenen -- so geht beim Weiterblaettern
 * nichts verloren und nichts kommt doppelt.
 *
 * Wer viel mint, hat tausende Mining-Eintraege zwischen zwei
 * Ueberweisungen. Eine Antwort liest deshalb hoechstens SEITEN_MAX Seiten;
 * ist dann noch nichts gefunden, kommt eine leere Seite MIT Cursor zurueck,
 * und der Aufrufer fragt weiter. Leer ohne Cursor heisst: Das war alles.
 *
 * Reine Funktionen, ohne Datenbank -- der Abruf wird hereingereicht.
 */

export type Art = 'mining' | 'transfer';

/** Was die Auswahl von einem Eintrag wissen muss. */
export interface ArtEintrag {
  height: number; idx: number;
  kind: 'reward' | 'pool' | 'in' | 'out';
}

export interface ArtSeite<E extends ArtEintrag> {
  eintraege: E[];
  /** Cursor "hoehe:idx" fuer die naechste Seite, null = das war alles. */
  weiter: string | null;
}

/** So viele Eintraege liest ein Abruf aus der Datenbank. */
export const SEITE = 200;
/** So viele Abrufe macht eine Antwort hoechstens. */
export const SEITEN_MAX = 5;

export function artAus(s: string | null): Art | null {
  return s === 'mining' || s === 'transfer' ? s : null;
}

export function passtZurArt(kind: ArtEintrag['kind'], art: Art): boolean {
  const mining = kind === 'reward' || kind === 'pool';
  return art === 'mining' ? mining : !mining;
}

const cursor = (e: ArtEintrag) => `${e.height}:${e.idx}`;

/**
 * Eine Seite des Verlaufs, nur mit Eintraegen der gewuenschten Art.
 *
 * `laden(vor, limit)` liefert die naechste ungefilterte Seite ab dem Cursor
 * `vor` ("hoehe:idx" oder null fuer den Anfang).
 */
export async function nachArt<E extends ArtEintrag>(
  laden: (vor: string | null, limit: number) => Promise<ArtSeite<E>>,
  art: Art, vor: string | null, limit: number,
  seitenMax: number = SEITEN_MAX,
): Promise<ArtSeite<E>> {
  const n = Math.min(Math.max(Math.trunc(limit) || 40, 1), 200);
  const gefunden: E[] = [];
  let ab = vor;
  for (let i = 0; i < seitenMax; i++) {
    const seite = await laden(ab, SEITE);
    for (let k = 0; k < seite.eintraege.length; k++) {
      const e = seite.eintraege[k];
      if (!passtZurArt(e.kind, art)) continue;
      gefunden.push(e);
      if (gefunden.length === n) {
        // Voll. Weiter geht es hinter diesem Eintrag -- ausser er war der
        // allerletzte des Verlaufs.
        const ende = k === seite.eintraege.length - 1 && !seite.weiter;
        return { eintraege: gefunden, weiter: ende ? null : cursor(e) };
      }
    }
    if (!seite.weiter) return { eintraege: gefunden, weiter: null };
    ab = seite.weiter;
  }
  // Genug gelesen fuer eine Antwort; der Aufrufer fragt ab hier weiter.
  return { eintraege: gefunden, weiter: ab };
}
