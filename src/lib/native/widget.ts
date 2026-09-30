'use client';

import { istNativ } from './plattform';

/**
 * Homescreen-Widget der Android-App fuettern.
 *
 * Die Oberflaeche weiss mehr als der Server: Hashrate, Shares und
 * Share-Ziel entstehen hier im WebView. Also meldet sie dem Widget, was
 * sie hat -- jedes Feld optional, der Rest bleibt stehen. Ausserhalb der
 * App tut das nichts.
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

interface Plugin {
  stand(o: WidgetStand): Promise<void>;
  leeren(): Promise<void>;
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
