'use client';

import { useEffect, useRef } from 'react';

/**
 * Was die App von Telegram ueber den Nutzer wissen darf -- nur im Browser,
 * nur was der Client ohnehin mitliefert. Nichts davon wird gespeichert;
 * das Guthaben haengt an Schluesseln, nicht an Telegram.
 */

export interface TgNutzer {
  vorname: string;
  nachname: string | null;
  benutzername: string | null;
  foto: string | null;
}

export function telegramNutzer(): TgNutzer | null {
  if (typeof window === 'undefined') return null;
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!u || !u.first_name) return null;
  return {
    vorname: String(u.first_name),
    nachname: u.last_name ? String(u.last_name) : null,
    benutzername: u.username ? String(u.username) : null,
    foto: u.photo_url ? String(u.photo_url) : null,
  };
}

/** Rahmenfarben des Telegram-Clients an das Design angleichen -- hell oder dunkel. */
export function telegramFarben(dunkel = false) {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    // Nur noch dunkel (Redesign Oktober 2026); der Parameter bleibt fuer alte Aufrufer.
    void dunkel;
    tg.setHeaderColor?.('#03060F');
    tg.setBackgroundColor?.('#03060F');
    tg.setBottomBarColor?.('#03060F');
  } catch { /* aeltere Clients kennen die Aufrufe nicht */ }
}

/**
 * QR-Code ueber den Telegram-Client scannen.
 *
 * Liefert den Text des ersten Codes, null wenn der Nutzer abbricht --
 * oder undefined, wenn der Client die Funktion nicht hat (dann uebernimmt
 * die eigene Kamera-Ansicht).
 */
export function telegramScan(text: string): Promise<string | null> | undefined {
  const tg = window.Telegram?.WebApp;
  if (!tg?.showScanQrPopup || !tg.isVersionAtLeast?.('6.4')) return undefined;
  return new Promise(resolve => {
    let fertig = false;
    const ende = (wert: string | null) => {
      if (fertig) return;
      fertig = true;
      tg.offEvent?.('scanQrPopupClosed', abbruch);
      resolve(wert);
    };
    const abbruch = () => ende(null);
    tg.onEvent?.('scanQrPopupClosed', abbruch);
    try {
      tg.showScanQrPopup({ text }, (daten: string) => {
        // true zurueckgeben schliesst das Popup.
        ende(daten);
        return true;
      });
    } catch {
      ende(null);
    }
  });
}

/* ------------------------------------------------------------------------
   Einstieg (Oktober 2026): Zurueck-Taste, Haptik, Teilen, Kampagne.
   Jede Funktion tut ausserhalb von Telegram einfach nichts -- oder nimmt
   den Weg, den die Android-App und der Browser haben.
   ------------------------------------------------------------------------ */


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webApp = (): any => (typeof window !== 'undefined' ? window.Telegram?.WebApp : null);

/**
 * Telegrams eigene Zurueck-Taste (oben links im Client, und die Zurueck-
 * Geste auf Android). Sichtbar, solange `aktiv`; ein Tipp ruft `zurueck`.
 *
 * Die kleinen Pfeile in der App bleiben -- die Taste ist der zweite Weg,
 * den Telegram-Nutzer ohnehin gewohnt sind.
 */
export function useZurueckTaste(aktiv: boolean, zurueck: () => void): void {
  const ref = useRef(zurueck); ref.current = zurueck;
  useEffect(() => {
    const knopf = webApp()?.BackButton;
    if (!knopf || !aktiv) return;
    const tipp = () => ref.current();
    try { knopf.onClick(tipp); knopf.show(); } catch { return; }
    return () => { try { knopf.offClick(tipp); knopf.hide(); } catch { /* egal */ } };
  }, [aktiv]);
}

/** Laeuft die App in Telegram (mit initData)? Ausserhalb: Android-App oder Browser. */
export function imTelegram(): boolean {
  const tg = webApp();
  return !!(tg && tg.initData);
}

/** Kurzes Vibrieren, wo Telegram es anbietet. Sonst nichts. */
export function haptik(art: 'tipp' | 'auswahl' | 'erfolg' | 'warnung' | 'fehler'): void {
  const h = webApp()?.HapticFeedback;
  if (!h) return;
  try {
    if (art === 'tipp') h.impactOccurred('light');
    else if (art === 'auswahl') h.selectionChanged();
    else if (art === 'fehler') h.notificationOccurred('error');
    else h.notificationOccurred(art === 'erfolg' ? 'success' : 'warning');
  } catch { /* aeltere Clients */ }
}

/**
 * Einen Link teilen. In Telegram ueber den Teilen-Dialog des Clients, sonst
 * ueber das Teilen des Systems, zuletzt in die Zwischenablage.
 *
 * Liefert, was passiert ist -- damit die Oberflaeche "kopiert" sagen kann.
 */
export async function teilen(url: string, text: string): Promise<'geteilt' | 'kopiert' | 'nichts'> {
  const tg = webApp();
  if (tg?.openTelegramLink) {
    try {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      return 'geteilt';
    } catch { /* weiter */ }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ url, text }); return 'geteilt'; } catch { /* abgebrochen */ }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); return 'kopiert'; } catch { return 'nichts'; }
}

const KAMPAGNE = 'yskar.kampagne';

/**
 * Woher jemand kam: der Parameter aus t.me/YSKAR_bot?startapp=<code>.
 *
 * Gemerkt wird nur der ERSTE Code, nur auf diesem Geraet, und er verlaesst
 * das Geraet nicht. Ob und wie er je gezaehlt wird, ist eine eigene
 * Entscheidung (anonym, ohne Telegram-Kennung) -- hier wird nur nichts
 * verloren.
 */
export function kampagneMerken(): void {
  const code = webApp()?.initDataUnsafe?.start_param;
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) return;
  try {
    if (localStorage.getItem(KAMPAGNE)) return;
    localStorage.setItem(KAMPAGNE, JSON.stringify({ code, am: new Date().toISOString() }));
  } catch { /* privates Fenster */ }
}
