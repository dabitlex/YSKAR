/*
 * Texte der Oberfläche. Deutsch ist die Quelle; fehlt ein englischer Text,
 * erscheint der deutsche -- nie ein leerer Platz.
 */
import { de } from './de.js';
import { en } from './en.js';

let aktuell = 'de';

export const sprache = () => aktuell;

export function setzeSprache(s) {
  aktuell = s === 'en' ? 'en' : 'de';
  document.documentElement.lang = aktuell;
}

/** Text zu einem Schlüssel. Platzhalter {0}, {1} oder eine Funktion. */
export function t(schluessel, ...werte) {
  const w = (aktuell === 'en' ? en[schluessel] : undefined) ?? de[schluessel];
  if (w === undefined) return schluessel;
  if (typeof w === 'function') return w(...werte);
  return w.replace(/\{(\d)\}/g, (_, i) => (werte[Number(i)] ?? ''));
}

/** Für Tests: alle Schlüssel beider Sprachen. */
export const schluessel = () => ({ de: Object.keys(de), en: Object.keys(en) });
