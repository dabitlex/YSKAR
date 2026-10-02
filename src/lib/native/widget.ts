'use client';

import { istNativ } from './plattform';

/**
 * Homescreen-Widget der Android-App fuettern.
 *
 * Die Oberflaeche meldet dem Widget, was sie hat -- jedes Feld optional,
 * der Rest bleibt stehen. Ausserhalb der App tut das nichts.
 *
 * Seit APK 1.0.10 ist das Widget eine Mining-Uebersicht: Mining-Werte und
 * den Verdienst der Sitzung liefert der MiningService selbst, den Stand
 * des Netzes holt das Widget. Von hier braucht es die Adresse -- und die
 * Wahl Hell/Dunkel (widgetThemaSetzen).
 */
export interface WidgetStand {
  address?: string;
  balance?: string;
  blocksFound?: number;
  height?: number;
  difficulty?: number;
  mining?: boolean;
  rate?: string;
  shares?: number;
  ziel?: number;
}

/** Darstellung des Widgets -- der Nutzer waehlt sie in den Einstellungen. */
export type WidgetThema = 'hell' | 'dunkel';

interface Plugin {
  stand(o: WidgetStand): Promise<void>;
  leeren(): Promise<void>;
  /** Ab APK 1.0.10. Ohne Angabe nur lesen. */
  thema(o: { thema?: WidgetThema }): Promise<{ thema?: string }>;
}

let plugin: Plugin | null = null;

/* Proxy nie direkt aus async zurueckgeben -- siehe biometrie.ts. */
async function lade(): Promise<{ p: Plugin } | null> {
  if (!istNativ()) return null;
  if (!plugin) {
    const { registerPlugin } = await import('@capacitor/core');
    plugin = registerPlugin<Plugin>('Widget');
  }
  return { p: plugin };
}

export async function widgetMelden(stand: WidgetStand): Promise<void> {
  const h = await lade();
  if (!h) return;
  try { await h.p.stand(stand); } catch { /* aeltere Huelle ohne Widget */ }
}

export async function widgetLeeren(): Promise<void> {
  const h = await lade();
  if (!h) return;
  try { await h.p.leeren(); } catch { /* s.o. */ }
}

/*
  Aeltere Huellen (bis APK 1.0.9) kennen "thema" nicht. Capacitor lehnt den
  Aufruf dann ab; falls eine Version das einmal nicht tut, sorgt die Frist
  dafuer, dass niemand ewig wartet. In beiden Faellen: null.
*/
async function themaRufen(o: { thema?: WidgetThema }): Promise<WidgetThema | null> {
  const h = await lade();
  if (!h) return null;
  const p = h.p;
  try {
    const r = await Promise.race([
      p.thema(o),
      new Promise<null>(fertig => setTimeout(() => fertig(null), 2000)),
    ]);
    return r?.thema === 'dunkel' ? 'dunkel' : r?.thema === 'hell' ? 'hell' : null;
  } catch {
    return null;
  }
}

/**
 * Wie das Widget gerade aussieht. null heisst: Hier gibt es die Auswahl
 * nicht (Browser, Mini App, aeltere App) -- dann zeigt die Oberflaeche sie
 * auch nicht an.
 */
export function widgetThemaLesen(): Promise<WidgetThema | null> {
  return themaRufen({});
}

/** Hell oder Dunkel setzen. Liefert, was danach gilt (null: nicht moeglich). */
export function widgetThemaSetzen(thema: WidgetThema): Promise<WidgetThema | null> {
  return themaRufen({ thema });
}
