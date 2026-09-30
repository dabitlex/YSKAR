'use client';

/**
 * Mining-Protokoll: die letzten Ereignisse mit Zeitstempel.
 *
 * Fuer den Fall, der sich am Schreibtisch nicht nachstellen laesst: Mining
 * im Hintergrund der Android-App. Ohne Entwicklerwerkzeuge am Geraet zeigt
 * nur dieses Protokoll, ob Jobs erneuert und Shares eingereicht wurden,
 * waehrend der Bildschirm aus war. Sichtbar in Einstellungen -> Diagnose.
 */
const ZEILEN: string[] = [];
const MAX = 200;

export function protokoll(text: string) {
  const z = new Date();
  const hh = String(z.getHours()).padStart(2, '0'), mm = String(z.getMinutes()).padStart(2, '0'),
    ss = String(z.getSeconds()).padStart(2, '0');
  ZEILEN.push(`${hh}:${mm}:${ss} ${text}`.slice(0, 160));
  if (ZEILEN.length > MAX) ZEILEN.shift();
}

export function protokollLesen(n = 60): string[] { return ZEILEN.slice(-n); }
