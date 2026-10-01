import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { encodeAddress } from '@/lib/core/address';
import { toHex, fromHex } from '@/lib/core/codec';
import type { Suche } from '@/lib/api/suche';

/**
 * Verlauf einer Adresse, seitenweise -- aus dem Spiegel
 * (chain2.verlauf_suche, Migration 00022; ohne Filter dasselbe wie
 * chain2.verlauf aus 00021).
 *
 * Eine Stelle fuer beide Routen: /api/v2/account liefert die erste Seite
 * gleich mit, /api/v2/account/:adresse/verlauf die weiteren.
 *
 * Cursor "hoehe:idx" ist das letzte Paar der vorigen Seite. Die Datenbank
 * sortiert nach (Hoehe, Index) absteigend; so bleibt die Reihenfolge
 * eindeutig, auch wenn mehrere Eintraege im selben Block liegen.
 */

export type Richtung = 'alle' | 'ein' | 'aus';

export interface VerlaufEintrag {
  txid: string;
  height: number;
  idx: number;
  timestamp: string | null;
  kind: 'reward' | 'pool' | 'in' | 'out';
  counterparty: string | null;
  /** Bei einem Pool-Anteil: wie viele sich den Block geteilt haben. */
  shares?: number;
  amount: string;
  fee: string;
  memo: string | null;
}

export interface VerlaufSeite {
  eintraege: VerlaufEintrag[];
  /** Cursor fuer die naechste Seite, null = das war alles. */
  weiter: string | null;
}

export function richtungAus(s: string | null): Richtung {
  return s === 'ein' || s === 'aus' ? s : 'alle';
}

/** "2975:1" -> [2975, 1]; alles andere -> null (erste Seite). */
export function cursorAus(s: string | null): [number, number] | null {
  const m = /^(\d{1,9}):(\d{1,6})$/.exec(s ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

interface Zeile {
  txid: string; block_height: number; idx: number; type: number;
  from_addr: string | null; to_addr: string | null;
  amount: number | string; fee: number | string; memo: string | null;
  pool: boolean; empfaenger: number; block_time: number | string | null;
}

/** Optionale Filter: Suche und Zeitraum (Blockzeit, Unix-Sekunden, [von, bis)). */
export interface VerlaufFilter {
  suche?: Suche | null;
  von?: number | null;
  bis?: number | null;
}

export async function verlaufLaden(
  raw: Uint8Array, richtung: Richtung, vor: [number, number] | null, limit: number,
  filter: VerlaufFilter = {},
): Promise<VerlaufSeite> {
  const n = Math.min(Math.max(Math.trunc(limit) || 40, 1), 200);
  const s = filter.suche ?? null;
  const hex = (h: string | null) => (h ? '\\x' + h : null);
  const { data, error } = await db().schema('chain2').rpc('verlauf_suche', {
    p_addr: '\\x' + toHex(raw),
    p_richtung: richtung,
    p_vor_hoehe: vor ? vor[0] : null,
    p_vor_idx: vor ? vor[1] : null,
    p_limit: n,
    p_von_zeit: filter.von ?? null,
    p_bis_zeit: filter.bis ?? null,
    p_hoehe: s?.hoehe ?? null,
    p_tx_lo: hex(s?.txLo ?? null),
    p_tx_hi: hex(s?.txHi ?? null),
    p_gegen_lo: hex(s?.gegenLo ?? null),
    p_gegen_hi: hex(s?.gegenHi ?? null),
    p_memo: s?.memo ?? null,
  });
  if (error) throw new Error(error.message);

  const eigen = toHex(raw);
  const zeilen = (data ?? []) as Zeile[];
  const eintraege = zeilen.map((t): VerlaufEintrag => {
    const eingang = unprefix(t.to_addr) === eigen;
    // Als bech32m, nicht als Rohbytes: Der Nutzer soll dieselbe
    // Zeichenkette sehen wie in seiner Wallet und sie vergleichen koennen.
    const gegenHex = unprefix(eingang ? t.from_addr : t.to_addr);
    return {
      txid: unprefix(t.txid),
      height: t.block_height,
      idx: t.idx,
      timestamp: t.block_time == null ? null : String(t.block_time),
      kind: t.type === 0 ? (t.pool ? 'pool' : 'reward') : (eingang ? 'in' : 'out'),
      counterparty: t.type === 0 || !gegenHex ? null : encodeAddress(fromHex(gegenHex)),
      shares: t.pool ? t.empfaenger : undefined,
      amount: String(t.amount),
      fee: String(t.fee),
      memo: unprefix(t.memo) || null,
    };
  });

  const letzte = zeilen[zeilen.length - 1];
  return {
    eintraege,
    // Volle Seite: es kann mehr geben. Ist die naechste leer, sagt sie es.
    weiter: zeilen.length === n && letzte ? `${letzte.block_height}:${letzte.idx}` : null,
  };
}
