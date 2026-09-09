/**
 * Postgres liefert bytea als Text mit vorangestelltem \x. Das ist ein
 * Speicherformat und gehoert nicht in eine API-Antwort.
 *
 * Bewusst eine Funktion statt einer Regex an jeder Fundstelle: Der Wert
 * enthaelt EINEN Backslash, und je nachdem, durch wie viele Schichten der
 * Quelltext geht, wird daraus in der Regex schnell einer zu viel. Genau das
 * ist passiert -- /^\\\\x/ suchte zwei Backslashes und traf nie.
 */
export function unprefix(value: string): string;
export function unprefix(value: null | undefined): null;
export function unprefix(value: string | null | undefined): string | null;
export function unprefix(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.startsWith('\\x') ? value.slice(2) : value;
}

/** Wert fuer eine bytea-Spalte. Die Gegenrichtung. */
export function prefix(hex: string): string {
  return hex.startsWith('\\x') ? hex : '\\x' + hex;
}
