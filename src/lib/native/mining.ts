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

async function lade(): Promise<Plugin | null> {
  if (!istNativ()) return null;
  if (plugin) return plugin;
  const { registerPlugin } = await import('@capacitor/core');
  plugin = registerPlugin<Plugin>('MiningService');
  return plugin;
}

export async function miningDienstStart(text: string): Promise<{ notifications: boolean } | null> {
  const p = await lade();
  if (!p) return null;
  try { return await p.start({ text }); } catch { return null; }
}

export async function miningDienstText(text: string): Promise<void> {
  const p = await lade();
  if (!p) return;
  try { await p.update({ text }); } catch { /* Dienst laeuft nicht */ }
}

export async function miningDienstStop(): Promise<void> {
  const p = await lade();
  if (!p) return;
  try { await p.stop(); } catch { /* war schon aus */ }
}

export async function miningDienstBeiStopp(fn: () => void): Promise<() => void> {
  const p = await lade();
  if (!p) return () => {};
  const h = await p.addListener('stop', fn);
  return () => { h.remove().catch(() => {}); };
}
