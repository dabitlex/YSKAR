'use client';

import { istNativ, letzteFehler } from './plattform';

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
}

async function probe(fn: () => Promise<unknown>): Promise<string> {
  try { return JSON.stringify(await fn()).slice(0, 200); }
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
  return d;
}
