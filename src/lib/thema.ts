'use client';

/**
 * Hell oder dunkel.
 *
 * Drei Einstellungen: "system" folgt dem Geraet (im Telegram-Client dessen
 * Farbschema), "hell" und "dunkel" sind fest. Gemerkt wird in localStorage
 * unter demselben Schluessel, den auch der Explorer liest.
 *
 * Angewendet wird ueber das Attribut data-thema am <html>-Element; die
 * Farbwerte dazu stehen in globals.css. Damit beim Start nichts hell
 * aufblitzt, setzt ein kleines Skript im Layout das Attribut schon vor
 * dem ersten Zeichnen -- derselbe Code wie hier, nur ohne React.
 */
export type Thema = 'system' | 'hell' | 'dunkel';
export const THEMEN: Thema[] = ['system', 'hell', 'dunkel'];
export const THEMA_SCHLUESSEL = 'yskar.thema';

export function themaLesen(): Thema {
  try {
    const t = localStorage.getItem(THEMA_SCHLUESSEL);
    if (t === 'hell' || t === 'dunkel') return t;
  } catch { /* egal */ }
  return 'system';
}

/** Was das System gerade will. */
export function systemDunkel(): boolean {
  if (typeof window === 'undefined') return false;
  const tg = window.Telegram?.WebApp;
  if (tg?.colorScheme) return tg.colorScheme === 'dark';
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/**
 * Seit dem Redesign vom Oktober 2026 gibt es nur noch das dunkle Design,
 * wie auf yskar.app und in der YSKAR Wallet. Eine alte Einstellung "hell"
 * wird einfach nicht mehr beachtet.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function istDunkel(_t: Thema = themaLesen()): boolean {
  return true;
}

export function themaAnwenden(t: Thema): boolean {
  const dunkel = istDunkel(t);
  document.documentElement.dataset.thema = dunkel ? 'dunkel' : 'hell';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#03060F');
  return dunkel;
}

export function themaSetzen(t: Thema) {
  try { localStorage.setItem(THEMA_SCHLUESSEL, t); } catch { /* egal */ }
}

/**
 * Startskript fuer das Layout: laeuft vor React, damit der erste Frame
 * schon die richtige Farbe hat. Muss inhaltlich zu istDunkel() passen.
 */
export const THEMA_STARTSKRIPT = `(function(){try{document.documentElement.dataset.thema='dunkel';}catch(e){}})();`;
