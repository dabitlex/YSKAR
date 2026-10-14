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

export function einstiegMerken(): void {
  try { localStorage.setItem(MODUS, 'pool'); } catch { /* privates Fenster */ }
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
