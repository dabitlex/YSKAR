import { db } from '@/lib/db/service';
import { toHex } from '@/lib/core/codec';

/**
 * Was eine Adresse je Kalendertag bekommen hat -- aus dem Spiegel
 * (Migration 00024):
 *
 *   chain2.einnahmen_tage   Mining: Blockrewards und Pool-Anteile
 *   chain2.eingaenge_tage   empfangene Ueberweisungen
 *
 * Beide liefern je Tag genau eine Zeile, aelteste zuerst, auch fuer Tage
 * ohne Betrag. Hier werden sie nur zusammengelegt und weitergereicht.
 */

export interface EinnahmenTag {
  /** Kalendertag in der Zone des Geraets, "JJJJ-MM-TT". */
  tag: string;
  /** Mining-Einnahmen in ganzen Einheiten. */
  summe: string;
  bloecke: number;
  /** Empfangene Ueberweisungen in ganzen Einheiten. */
  eingaenge: string;
}

export const TAGE_MAX = 90;

/** "7" -> 7; alles andere -> 30. Hoechstens 90. */
export function tageAus(s: string | null): number {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, TAGE_MAX) : 30;
}

/**
 * Zeitzone des Geraets (IANA-Name). Unbekanntes wird zu UTC -- die
 * Datenbank finge es ebenfalls ab, aber so kommt gar kein fremder Text an.
 */
export function zoneAus(s: string | null): string {
  const z = (s ?? '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(z)) return 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return z; }
  catch { return 'UTC'; }
}

export async function einnahmenLaden(raw: Uint8Array, tage: number, zone: string): Promise<EinnahmenTag[]> {
  const sb = db().schema('chain2');
  const p = { p_addr: '\\x' + toHex(raw), p_tage: tage, p_zone: zone };
  const [mining, eingang] = await Promise.all([sb.rpc('einnahmen_tage', p), sb.rpc('eingaenge_tage', p)]);
  if (mining.error) throw new Error(mining.error.message);
  if (eingang.error) throw new Error(eingang.error.message);
  const tagVon = (z: { tag: string }) => String(z.tag).slice(0, 10);
  const eingaenge = new Map(
    ((eingang.data ?? []) as { tag: string; summe: string | number }[]).map(z => [tagVon(z), String(z.summe)]));
  return ((mining.data ?? []) as { tag: string; summe: string | number; bloecke: number }[]).map(z => ({
    tag: tagVon(z),
    summe: String(z.summe),
    bloecke: Number(z.bloecke) || 0,
    eingaenge: eingaenge.get(tagVon(z)) ?? '0',
  }));
}
