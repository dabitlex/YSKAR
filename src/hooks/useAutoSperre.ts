'use client';

import { useEffect, useRef } from 'react';

/**
 * Automatische Sperre.
 *
 * Eine im Hintergrund liegende App war bisher beim Zurueckkommen noch
 * offen -- wer das Telefon in die Hand bekam, hatte die Wallet. Jetzt
 * sperrt sie sich, wenn sie laenger als die eingestellte Zeit unsichtbar
 * war (Vorgabe: eine Minute). "Sperren" heisst nur: Schluessel aus dem
 * Speicher, PIN-Bildschirm davor. Das Mining laeuft darunter weiter --
 * AppShell bleibt eingehaengt, die Sperre liegt als Ebene darueber.
 */
const MERKER = 'yskar.sperre';
export const SPERRE_VORGABE_MS = 60_000;
/** 0 = sofort, -1 = nie, sonst Millisekunden. */
export const SPERRE_STUFEN = [0, 60_000, 5 * 60_000, 15 * 60_000, -1] as const;

export function sperreLesen(): number {
  try {
    const v = localStorage.getItem(MERKER);
    if (v == null) return SPERRE_VORGABE_MS;
    const n = Number(v);
    return Number.isFinite(n) ? n : SPERRE_VORGABE_MS;
  } catch { return SPERRE_VORGABE_MS; }
}

export function sperreSetzen(ms: number) {
  try { localStorage.setItem(MERKER, String(ms)); } catch { /* egal */ }
}

export function useAutoSperre(offen: boolean, sperren: () => void) {
  const versteckt = useRef<number | null>(null);
  useEffect(() => {
    if (!offen) return;
    const onWechsel = () => {
      const grenze = sperreLesen();
      if (grenze < 0) return;
      if (document.hidden) {
        versteckt.current = Date.now();
        if (grenze === 0) sperren();
        return;
      }
      if (versteckt.current != null && Date.now() - versteckt.current >= grenze) sperren();
      versteckt.current = null;
    };
    document.addEventListener('visibilitychange', onWechsel);
    return () => document.removeEventListener('visibilitychange', onWechsel);
  }, [offen, sperren]);
}
