'use client';

import { istNativ } from './plattform';

/**
 * Update-Hinweis fuer die Android-App.
 *
 * Die App wird als APK ueber GitHub Releases verteilt. Beim Start fragt sie
 * die neueste Veroeffentlichung ab, vergleicht die Version mit der eigenen
 * und zeigt einen Hinweis mit Download. Installieren tut Android selbst --
 * die APK ist mit demselben Schluessel signiert, sonst lehnt das System sie
 * als Update ab.
 *
 * Tags heissen app-v1.2.3; andere Tags (Kette, Knoten) werden ignoriert.
 */

export const REPO = 'dabitlex/YSKAR';
const RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
const TAG = /^app-v(\d+)\.(\d+)\.(\d+)$/;

export interface Update {
  version: string;
  aktuell: string;
  url: string;          // direkte APK
  seite: string;        // Release-Seite
  notizen: string;
}

export async function appVersion(): Promise<{ version: string; build: string } | null> {
  if (!istNativ()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const i = await App.getInfo();
    return { version: i.version, build: i.build };
  } catch { return null; }
}

function vergleich(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Neuere Version als die installierte? Sonst null. */
export async function updatePruefen(): Promise<Update | null> {
  const eigene = await appVersion();
  if (!eigene) return null;
  try {
    const res = await fetch(RELEASES, { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const liste = await res.json() as {
      tag_name: string; html_url: string; body: string | null;
      draft: boolean; prerelease: boolean;
      assets: { name: string; browser_download_url: string }[];
    }[];
    const neueste = liste
      .filter(r => !r.draft && !r.prerelease && TAG.test(r.tag_name))
      .sort((x, y) => vergleich(y.tag_name.slice(5), x.tag_name.slice(5)))[0];
    if (!neueste) return null;
    const version = neueste.tag_name.slice(5);
    if (vergleich(version, eigene.version) <= 0) return null;
    const apk = neueste.assets.find(a => a.name.endsWith('.apk'));
    return {
      version, aktuell: eigene.version,
      url: apk?.browser_download_url ?? neueste.html_url,
      seite: neueste.html_url,
      notizen: (neueste.body ?? '').trim(),
    };
  } catch { return null; }
}

/** Download im System-Browser oeffnen -- der installiert die APK. */
export async function updateOeffnen(url: string): Promise<void> {
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank');
  }
}

/**
 * Update aus der App heraus (Android): APK laden, Installer oeffnen.
 *
 * "erlaubnis": Android will erst die Freigabe "Apps aus dieser Quelle
 * installieren" -- die Einstellungsseite ist schon offen, danach erneut
 * tippen. null: Huelle ohne dieses Plugin -> Browser-Weg.
 */
export type LadeStand = { status: 'laedt' | 'erlaubnis' | 'fertig' | 'fehler' | 'keins'; prozent: number };

interface UpdatePlugin {
  laden(o: { url: string; version: string }): Promise<{ status: 'laedt' | 'erlaubnis' }>;
  stand(): Promise<LadeStand>;
  installieren(): Promise<void>;
}

async function updatePlugin(): Promise<{ p: UpdatePlugin } | null> {
  if (!istNativ()) return null;
  const { registerPlugin } = await import('@capacitor/core');
  return { p: registerPlugin<UpdatePlugin>('AppUpdate') };
}

export async function updateLaden(u: Update): Promise<LadeStand | null> {
  const h = await updatePlugin();
  if (!h) return null;
  try {
    const r = await h.p.laden({ url: u.url, version: u.version });
    return { status: r.status, prozent: 0 };
  } catch {
    return null;
  }
}

export async function updateStand(): Promise<LadeStand | null> {
  const h = await updatePlugin();
  if (!h) return null;
  try { return await h.p.stand(); } catch { return null; }
}

export async function updateInstallieren(): Promise<boolean> {
  const h = await updatePlugin();
  if (!h) return false;
  try { await h.p.installieren(); return true; } catch { return false; }
}
