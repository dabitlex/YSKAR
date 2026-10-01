'use client';

import { istNativ } from './plattform';

/**
 * Natives Mining der Android-App (ab APK 1.0.9) -- Bruecke zum MiningService.
 *
 * Dort rechnet der Dienst selbst (NativMiner.java); die Oberflaeche steuert
 * nur und zeigt an. Grund: Der WebView friert seine Worker ~40 s nach dem
 * Wechsel in den Hintergrund ein (Diagnose 01.10.2026).
 *
 * Erkennung OHNE Warten: Die neue APK haengt "YSKAR-NativMining/1" an den
 * User-Agent (capacitor.config.ts, android.appendUserAgent). Die Mini App
 * in Telegram, ein Browser und aeltere APKs haben das nicht -- sie bleiben
 * beim bisherigen Mining im WebView (useMining.ts, miner.worker.ts), das
 * hier nicht angefasst wird.
 */

export const NATIV_KENNUNG = 'YSKAR-NativMining/1';

export function nativMiningVerfuegbar(): boolean {
  if (typeof navigator === 'undefined') return false;
  return istNativ() && navigator.userAgent.includes(NATIV_KENNUNG);
}

export interface NativStatus {
  laeuft: boolean;
  dienst?: boolean;
  seit?: number;
  hashrate?: number;
  threads?: number;
  duty?: number;
  modus?: string;
  modusIst?: string | null;
  rechenweg?: string;
  messung?: string | null;
  angenommen?: number;
  abgelehnt?: number;
  ziel?: string | null;
  letzteArbeit?: number;
  jobHoehe?: number;
  pool?: { name: string; feeBps: number; miner: number; hashrate: number; eintraege: number } | null;
  fehler?: string | null;
  fehlerArt?: 'netz' | 'share' | 'sitzung' | 'kein_pool' | null;
  fehlerDetail?: string | null;
  letzterShare?: { hash: string; difficulty: string; at: number } | null;
  fund?: { height: number; reward: string; hash: string; at: number } | null;
  shares?: { achieved: number; required: number; blockDifficulty: number; accepted: boolean; isBlock: boolean; at: number }[];
  protokoll?: string[];
}

interface Plugin {
  nativStart(o: {
    basis: string; address: string; mode: 'solo' | 'pool'; platform: string;
    threads: number; duty: number; vorlage: string;
  }): Promise<{ notifications: boolean }>;
  nativDuty(o: { duty: number }): Promise<void>;
  nativStatus(): Promise<NativStatus>;
  stop(): Promise<void>;
  addListener(ev: 'stop', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

let plugin: Plugin | null = null;

// Wie in mining.ts: den Proxy nie direkt aus einer async-Funktion zurueckgeben.
async function lade(): Promise<{ p: Plugin } | null> {
  if (!istNativ()) return null;
  if (!plugin) {
    const { registerPlugin } = await import('@capacitor/core');
    plugin = registerPlugin<Plugin>('MiningService');
  }
  return { p: plugin };
}

export async function nativStart(o: Parameters<Plugin['nativStart']>[0]): Promise<{ notifications: boolean }> {
  const h = await lade();
  if (!h) throw new Error('nicht in der App');
  return await h.p.nativStart(o);
}

export async function nativDuty(duty: number): Promise<void> {
  const h = await lade();
  if (!h) return;
  try { await h.p.nativDuty({ duty }); } catch { /* laeuft nicht */ }
}

export async function nativStatus(): Promise<NativStatus | null> {
  const h = await lade();
  if (!h) return null;
  try { return await h.p.nativStatus(); } catch { return null; }
}

export async function nativStop(): Promise<void> {
  const h = await lade();
  if (!h) return;
  try { await h.p.stop(); } catch { /* war schon aus */ }
}

export async function nativBeiStopp(fn: () => void): Promise<() => void> {
  const h = await lade();
  if (!h) return () => {};
  const handle = await h.p.addListener('stop', fn);
  return () => { handle.remove().catch(() => {}); };
}
