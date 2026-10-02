/**
 * Eingabe ueber das eigene Ziffernfeld beim Senden.
 *
 * Die Tastatur des Systems bietet je nach Geraet und Sprache Komma ODER
 * Punkt an, manchmal keines von beiden -- und sie verdeckt den halben
 * Bildschirm. Das eigene Feld kennt genau die Tasten, die ein Betrag
 * braucht, und laesst nichts zu, was kein Betrag ist.
 *
 * Reine Rechnung auf dem Text, damit sie sich pruefen laesst.
 */

export type Taste = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'komma' | 'loeschen';

/** Hoechstens neun Stellen vor dem Komma -- mehr gibt es von der Waehrung nicht. */
const GANZ_MAX = 9;

/**
 * @param text     bisherige Eingabe, mit `zeichen` als Dezimaltrenner
 * @param maxBruch Nachkommastellen der Kette
 */
export function tippen(text: string, taste: Taste, zeichen: string, maxBruch = 8): string {
  if (taste === 'loeschen') return text.slice(0, -1);
  const stelle = text.indexOf(zeichen);
  if (taste === 'komma') {
    if (stelle >= 0) return text;
    return (text === '' ? '0' : text) + zeichen;
  }
  if (stelle >= 0) {
    return text.length - stelle - zeichen.length >= maxBruch ? text : text + taste;
  }
  // Keine fuehrenden Nullen: "0" + "5" ist "5", "0" + "0" bleibt "0".
  if (text === '0') return taste;
  return text.length >= GANZ_MAX ? text : text + taste;
}

/** Eingabe fuer die Anzeige: Tausender gegliedert, Nachkommateil wie getippt. */
export function eingabeAnzeige(text: string, zeichen: string, locale: string): string {
  if (!text) return '';
  const stelle = text.indexOf(zeichen);
  const ganz = stelle >= 0 ? text.slice(0, stelle) : text;
  const rest = stelle >= 0 ? text.slice(stelle) : '';
  let gegliedert = ganz;
  try { gegliedert = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(ganz || '0')); } catch { /* wie getippt */ }
  return gegliedert + rest;
}
