'use client';

/**
 * Wo laeuft die Oberflaeche gerade?
 *
 *   telegram  -- Mini App im Telegram-Client (initData vorhanden)
 *   nativ     -- YSKAR Wallet, die Android-App (Capacitor)
 *   browser   -- ein gewoehnlicher Browser, nur Lesen
 *
 * Alles, was nur auf einer Plattform geht (Biometrie, Mining-Dienst, Push,
 * Telegram-Scanner), fragt hier nach -- und nicht jede Komponente einzeln
 * nach window.Telegram oder window.Capacitor.
 */

export type Plattform = 'telegram' | 'nativ' | 'browser';

export function plattform(): Plattform {
  if (typeof window === 'undefined') return 'browser';
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.()) return 'nativ';
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initData) return 'telegram';
  return 'browser';
}

export const istNativ = () => plattform() === 'nativ';
export const istTelegram = () => plattform() === 'telegram';

/**
 * Fehlerspeicher fuer die Diagnose (nur Android-App).
 *
 * Unbehandelte Fehler und abgelehnte Promises landen hier, damit die
 * Einstellungen sie zeigen koennen. Ohne Entwicklerwerkzeuge am Geraet ist
 * das der einzige Blick in die Konsole.
 */
const FEHLER: string[] = [];
let installiert = false;

export function fehlerMerken(quelle: string, e: unknown) {
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  FEHLER.push(`${new Date().toLocaleTimeString('de-DE')} ${quelle}: ${text}`.slice(0, 300));
  if (FEHLER.length > 20) FEHLER.shift();
}

export function letzteFehler(): string[] { return [...FEHLER]; }

export function fehlerspeicherInstallieren() {
  if (installiert || typeof window === 'undefined') return;
  installiert = true;
  window.addEventListener('error', ev => fehlerMerken('error', ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', ev => fehlerMerken('promise', ev.reason));
}
