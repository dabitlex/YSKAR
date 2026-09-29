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
