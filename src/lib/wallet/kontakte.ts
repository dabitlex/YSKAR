'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { isValidAddress } from '@/lib/core/address';

/**
 * Kontakte: Namen fuer Adressen.
 *
 * Sie liegen NUR auf diesem Geraet (localStorage) -- kein Server kennt sie,
 * und sie wandern nicht mit, wenn die Wallet auf einem anderen Geraet mit
 * den 12 Woertern wiederhergestellt wird. Das ist Absicht: Wem jemand
 * Geld schickt und wie er ihn nennt, geht niemanden etwas an.
 *
 * Ein Name ist eine Merkhilfe, kein Sicherheitsmerkmal. Beim Senden zeigt
 * die Wallet trotzdem immer die volle Adresse.
 */

const SCHLUESSEL = 'yskar.kontakte';
export const NAME_MAX = 24;

export type Kontakte = Record<string, string>;

const LEER: Kontakte = Object.freeze({}) as Kontakte;
let stand: Kontakte | null = null;
const hoerer = new Set<() => void>();

function lesen(): Kontakte {
  if (typeof window === 'undefined') return LEER;
  try {
    const roh = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}');
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return LEER;
    const sauber: Kontakte = {};
    for (const [adresse, name] of Object.entries(roh)) {
      if (typeof name === 'string' && name.trim() && isValidAddress(adresse)) {
        sauber[adresse] = name.trim().slice(0, NAME_MAX);
      }
    }
    return sauber;
  } catch { return LEER; }
}

function aktuell(): Kontakte {
  if (stand === null) stand = lesen();
  return stand;
}

function schreiben(neu: Kontakte) {
  stand = neu;
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(neu)); } catch { /* voll oder privat: gilt bis zum Neuladen */ }
  hoerer.forEach(h => h());
}

function abonnieren(h: () => void): () => void {
  hoerer.add(h);
  // Ein anderes Fenster derselben App (Telegram Desktop) hat gespeichert.
  const fremd = (e: StorageEvent) => { if (e.key === SCHLUESSEL) { stand = lesen(); h(); } };
  window.addEventListener('storage', fremd);
  return () => { hoerer.delete(h); window.removeEventListener('storage', fremd); };
}

/** Name setzen oder aendern. Ein leerer Name entfernt den Kontakt. */
export function kontaktSetzen(adresse: string, name: string): boolean {
  const a = adresse.trim().toLowerCase();
  if (!isValidAddress(a)) return false;
  const n = name.trim().slice(0, NAME_MAX);
  const neu = { ...aktuell() };
  if (n) neu[a] = n; else delete neu[a];
  schreiben(neu);
  return true;
}

export function kontaktEntfernen(adresse: string) {
  kontaktSetzen(adresse, '');
}

/** Alle Kontakte entfernen -- wenn die Wallet vom Geraet geloescht wird. */
export function kontakteLeeren() {
  stand = LEER;
  try { localStorage.removeItem(SCHLUESSEL); } catch { /* egal */ }
  hoerer.forEach(h => h());
}

export function useKontakte() {
  const kontakte = useSyncExternalStore(abonnieren, aktuell, () => LEER);
  const name = useCallback((adresse: string | null | undefined): string | null =>
    (adresse && kontakte[adresse.toLowerCase()]) || null, [kontakte]);
  return { kontakte, name };
}
