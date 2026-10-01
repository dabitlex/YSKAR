'use client';

import { istNativ, letzteFehler } from './plattform';
import { protokollLesen } from '@/lib/miningProtokoll';
import { nativMiningVerfuegbar, nativStatus } from './nativMining';

/**
 * Diagnose der nativen Bruecke -- fuer die Einstellungen der Android-App.
 *
 * Ohne Entwicklerwerkzeuge am Geraet ist das der einzige Weg zu sehen, ob
 * die Plugins ueberhaupt ankommen. Alles hier ist Anzeige, nichts wird
 * veraendert.
 */
export interface Diagnose {
  plattform: string;
  bruecke: boolean;
  plugins: string[];
  appInfo: string;
  biometrie: string;
  speicher: string;
  miningDienst: string;
  fehler: string[];
  mining: string[];
  /** Natives Mining (APK ab 1.0.9): Zustand und Protokoll des Dienstes. */
  nativ: string[];
}

async function probe(fn: () => Promise<unknown>): Promise<string> {
  try { return JSON.stringify(await fn()).slice(0, 600); }
  catch (e) { return `Fehler: ${String((e as Error)?.message ?? e).slice(0, 200)}`; }
}

export async function diagnose(): Promise<Diagnose> {
  const cap = (window as any).Capacitor;
  const d: Diagnose = {
    plattform: cap?.getPlatform?.() ?? 'unbekannt',
    bruecke: !!cap?.isNativePlatform?.(),
    plugins: Object.keys(cap?.Plugins ?? {}),
    appInfo: '', biometrie: '', speicher: '', miningDienst: '',
    fehler: letzteFehler(),
    mining: protokollLesen(40),
    nativ: [],
  };
  if (!istNativ()) return d;
  d.appInfo = await probe(async () => (await import('@capacitor/app')).App.getInfo());
  d.biometrie = await probe(async () =>
    (await import('@aparajita/capacitor-biometric-auth')).BiometricAuth.checkBiometry());
  d.speicher = await probe(async () =>
    (await import('@aparajita/capacitor-secure-storage')).SecureStorage.keys());
  d.miningDienst = await probe(async () => {
    const { registerPlugin } = await import('@capacitor/core');
    const p = registerPlugin<{ ping(): Promise<{ ok: boolean; laeuft: boolean }> }>('MiningService');
    return await p.ping();
  });
  if (nativMiningVerfuegbar()) {
    const s = await nativStatus();
    if (s) {
      d.nativ = [
        `laeuft ${s.laeuft} · dienst ${s.dienst} · ${s.threads ?? '?'} threads · ${s.duty ?? '?'} %`,
        `rechenweg ${s.rechenweg ?? '?'} · ${s.messung ?? ''}`,
        `hashrate ${Math.round(Number(s.hashrate ?? 0))} H/s · shares ${s.angenommen ?? 0} ok / ${s.abgelehnt ?? 0} abgelehnt · ziel ${s.ziel ?? '?'}`,
        ...(s.fehler ? [`fehler ${s.fehlerArt}: ${s.fehler}${s.fehlerDetail ? ' (' + s.fehlerDetail + ')' : ''}`] : []),
        ...(s.protokoll ?? []).slice(-50),
      ];
    }
  }
  return d;
}
