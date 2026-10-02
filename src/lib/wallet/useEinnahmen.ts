'use client';

import { useEffect, useState } from 'react';
import { tagSchluessel } from '@/lib/wallet/verlaufGruppen';

/**
 * Was die Adresse in den letzten 30 Tagen je Kalendertag bekommen hat
 * (/api/v2/account/:adresse/einnahmen, Migration 00024): Mining-Einnahmen
 * und, getrennt davon, empfangene Ueberweisungen.
 *
 * Ein Abruf fuer alles: die Kachel in der Wallet (7 oder 30 Tage) und
 * "heute" auf der Guthabenkarte und auf Home. Die letzte Antwort bleibt
 * gemerkt, damit die Kachel beim Wechsel zwischen den Reitern sofort wieder
 * dasteht und nicht jedes Mal aufbaut.
 */

export interface EinnahmenTag {
  tag: string;
  /** Mining: Blockrewards und Pool-Anteile, in ganzen Einheiten. */
  summe: string;
  bloecke: number;
  /** Empfangene Ueberweisungen, in ganzen Einheiten. */
  eingaenge?: string;
}

/**
 * Heute dazugekommen: Mining und empfangene Ueberweisungen. null, wenn die
 * Zahlen (noch) nicht da sind oder der heutige Tag darin fehlt.
 */
export function heuteDazu(tage: EinnahmenTag[] | null): bigint | null {
  const heute = tage?.find(x => x.tag === tagSchluessel(Math.floor(Date.now() / 1000)));
  if (!heute) return null;
  try { return BigInt(heute.summe) + BigInt(heute.eingaenge ?? '0'); } catch { return null; }
}

const TAGE = 30;
const gemerkt = new Map<string, EinnahmenTag[]>();

function zone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/**
 * @param neuester  aendert sich, wenn im Verlauf etwas Neues steht -- dann
 *                  wird neu gelesen (ein neuer Block kann ein Ertrag sein)
 * @returns null, solange noch nichts da ist oder der Abruf scheitert
 */
export function useEinnahmen(adresse: string | null, neuester: string): EinnahmenTag[] | null {
  const [stand, setStand] = useState<{ adresse: string; tage: EinnahmenTag[] } | null>(
    () => (adresse && gemerkt.has(adresse) ? { adresse, tage: gemerkt.get(adresse)! } : null));
  // Um Mitternacht beginnt ein neuer Tag: neu lesen, auch ohne neuen Block.
  const heute = tagSchluessel(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!adresse) return;
    let lebt = true;
    fetch(`/api/v2/account/${adresse}/einnahmen?tage=${TAGE}&tz=${encodeURIComponent(zone())}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { tage?: EinnahmenTag[] }) => {
        if (!lebt || !Array.isArray(d.tage)) return;
        gemerkt.set(adresse, d.tage);
        setStand({ adresse, tage: d.tage });
      })
      .catch(() => { /* die Kachel bleibt beim letzten Stand oder weg */ });
    return () => { lebt = false; };
  }, [adresse, neuester, heute]);

  return stand && stand.adresse === adresse ? stand.tage : null;
}
