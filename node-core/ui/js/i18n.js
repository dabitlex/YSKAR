/*
 * Texte der Oberfläche. Deutsch ist die Quelle; fehlt ein englischer Text,
 * erscheint der deutsche -- nie ein leerer Platz.
 */
import { de } from './de.js';
import { en } from './en.js';

let aktuell = 'de';
/*
 * Das Betriebssystem, auf dem das Programm laeuft (process.platform des
 * Kerns). Unter Linux gilt zu einem Schluessel zuerst seine Fassung
 * "<schluessel>.linux", wenn es eine gibt -- etwa fuer Texte, die sonst von
 * Windows sprechen.
 */
let plattform = 'win32';

export const sprache = () => aktuell;

export function setzeSprache(s) {
  aktuell = s === 'en' ? 'en' : 'de';
  document.documentElement.lang = aktuell;
}

export function setzePlattform(p) {
  plattform = p === 'linux' ? 'linux' : 'win32';
}

/** Text zu einem Schlüssel. Platzhalter {0}, {1} oder eine Funktion. */
export function t(schluessel, ...werte) {
  if (plattform === 'linux' && (schluessel + '.linux') in de) schluessel += '.linux';
  const w = (aktuell === 'en' ? en[schluessel] : undefined) ?? de[schluessel];
  if (w === undefined) return schluessel;
  if (typeof w === 'function') return w(...werte);
  return w.replace(/\{(\d)\}/g, (_, i) => (werte[Number(i)] ?? ''));
}

/** Für Tests: alle Schlüssel beider Sprachen. */
export const schluessel = () => ({ de: Object.keys(de), en: Object.keys(en) });
