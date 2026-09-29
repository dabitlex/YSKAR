'use client';

import { istNativ } from './plattform';

/**
 * Mining im Hintergrund -- Bruecke zum MiningService der Android-App.
 *
 * Der Dienst haelt Prozess und CPU wach und zeigt die dauerhafte
 * Benachrichtigung mit der Hashrate. Die Worker laufen weiter hier im
 * WebView. Tippt der Nutzer in der Benachrichtigung auf Stopp, kommt das
 * Ereignis "stop" -- und die App stoppt das Mining ordentlich.
 *
 * Ausserhalb der App tun alle Funktionen nichts.
 */

interface Plugin {
  start(o: { text: string }): Promise<{ notifications: boolean }>;
  update(o: { text: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(ev: 'stop', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

let plugin: Plugin | null = null;

/*
  Der Proxy darf nie direkt aus einer async-Funktion zurueckkommen: JavaScript
  prueft beim Aufloesen `.then`, der Proxy meldet "then() is not implemented",
  und der Aufruf scheitert, ohne dass eine Methode je gerufen wurde.
*/
async function lade(): Promise<{ p: Plugin } | null> {
  if (!istNativ()) return null;
  if (!plugin) {
    const { registerPlugin } = await import('@capacitor/core');
    plugin = registerPlugin<Plugin>('MiningService');
  }
  return { p: plugin };
}

export type DienstErgebnis =
  | { ok: true; notifications: boolean }
  | { ok: false; fehler: string };

export async function miningDienstStart(text: string): Promise<DienstErgebnis | null> {
  const h = await lade();
  if (!h) return null;
  const p = h.p;
  try {
    const r = await p.start({ text });
    return { ok: true, notifications: !!r?.notifications };
  } catch (e) {
    return { ok: false, fehler: String((e as Error)?.message ?? e) };
  }
}

export async function miningDienstText(text: string): Promise<void> {
  const h = await lade();
  if (!h) return;
  try { await h.p.update({ text }); } catch { /* Dienst laeuft nicht */ }
}

export async function miningDienstStop(): Promise<void> {
  const h = await lade();
  if (!h) return;
  try { await h.p.stop(); } catch { /* war schon aus */ }
}

export async function miningDienstBeiStopp(fn: () => void): Promise<() => void> {
  const h = await lade();
  if (!h) return () => {};
  const handle = await h.p.addListener('stop', fn);
  return () => { handle.remove().catch(() => {}); };
}
