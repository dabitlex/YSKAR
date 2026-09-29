'use client';

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

/** Rahmenfarben des Telegram-Clients an das helle Design angleichen. */
export function telegramFarben() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.setHeaderColor?.('#F4F7FB');
    tg.setBackgroundColor?.('#F4F7FB');
    tg.setBottomBarColor?.('#FFFFFF');
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
