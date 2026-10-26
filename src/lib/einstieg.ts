'use client';

/**
 * Uebergabe vom Einstieg an die App: "gleich nach dem Einrichten das
 * Mining im Pool starten".
 *
 * Zwei Merker:
 *
 *  - Modus "pool" (dauerhaft, derselbe Schluessel wie in usePoolAuswahl).
 *    Pool ist die Vorgabe nur fuer NEUE Nutzer -- wer schon eine Wallet hat
 *    und nie etwas gewaehlt hat, behaelt Solo, wie bisher.
 *  - "jetzt starten" (nur fuer diese Sitzung). Die App holt ihn einmal ab
 *    und loescht ihn; ein Neuladen startet also nicht noch einmal.
 */
const MODUS = 'yskar.mining.modus';
const STARTEN = 'yskar.einstieg.starten';
/**
 * Seit dem Redesign (Oktober 2026): Neue Nutzer waehlen ihren Pool selbst.
 * Solange dieser Merker steht und noch keine Wahl gespeichert ist, schlaegt
 * die App keinen Pool vor und startet nicht von selbst. Wer schon vorher
 * eine Wallet hatte, hat den Merker nicht -- fuer den bleibt alles wie es war.
 */
export const SELBST_WAEHLEN = 'yskar.pool.selbstWaehlen';

export function einstiegMerken(): void {
  try { localStorage.setItem(MODUS, 'pool'); } catch { /* privates Fenster */ }
  try { localStorage.setItem(SELBST_WAEHLEN, '1'); } catch { /* egal */ }
  try { sessionStorage.setItem(STARTEN, '1'); } catch { /* dann eben ohne Autostart */ }
}

/** true genau einmal nach dem Einstieg. */
export function einstiegAbholen(): boolean {
  try {
    if (sessionStorage.getItem(STARTEN) !== '1') return false;
    sessionStorage.removeItem(STARTEN);
    return true;
  } catch { return false; }
}
