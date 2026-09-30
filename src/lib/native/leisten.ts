'use client';

import { istNativ } from './plattform';

/**
 * Systemleisten der Android-App: helle oder dunkle Symbole.
 *
 * Die Huelle zeichnet bis unter Status- und Gestenleiste; deren Symbole
 * muessen zum Grund passen. Plugin "Oberflaeche" in der Huelle; fehlt es
 * (aeltere Huelle), passiert nichts -- dann bleiben die Symbole dunkel,
 * wie in capacitor.config.ts voreingestellt.
 */
interface OberflaechePlugin { leisten(o: { dunkel: boolean }): Promise<void> }

export async function leistenFaerben(dunkel: boolean): Promise<void> {
  if (!istNativ()) return;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const p = registerPlugin<OberflaechePlugin>('Oberflaeche');
    await p.leisten({ dunkel });
  } catch { /* aeltere Huelle */ }
}
