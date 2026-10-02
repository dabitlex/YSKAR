'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Guthaben verbergen.
 *
 * Ein Tipp auf das Auge neben dem Guthaben ersetzt die Betraege durch
 * Punkte -- fuer den Blick ueber die Schulter in Bus und Bahn. Die Wahl
 * bleibt gemerkt, bis man sie wieder aendert. Kein Schutz gegen jemanden,
 * der das Telefon in der Hand haelt; dafuer ist die App-Sperre da.
 */

const SCHLUESSEL = 'yskar.guthabenVerborgen';
let stand: boolean | null = null;
const hoerer = new Set<() => void>();

function aktuell(): boolean {
  if (stand === null) {
    try { stand = localStorage.getItem(SCHLUESSEL) === '1'; } catch { stand = false; }
  }
  return stand;
}

function abonnieren(h: () => void): () => void {
  hoerer.add(h);
  return () => { hoerer.delete(h); };
}

export function useGuthabenVerborgen(): [boolean, () => void] {
  const verborgen = useSyncExternalStore(abonnieren, aktuell, () => false);
  const umschalten = useCallback(() => {
    stand = !aktuell();
    try { localStorage.setItem(SCHLUESSEL, stand ? '1' : '0'); } catch { /* gilt bis zum Neuladen */ }
    hoerer.forEach(h => h());
  }, []);
  return [verborgen, umschalten];
}
