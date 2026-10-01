import { decodeAddress } from '../core/address.ts';
import { ADDRESS_BYTES, ADDRESS_HRP } from '../core/params.ts';

/**
 * Suche im Wallet-Verlauf: Was der Nutzer ins Suchfeld tippt, wird hier in
 * die Filter von chain2.verlauf_suche (Migration 00022) uebersetzt.
 *
 * Ein Feld, mehrere Bedeutungen -- alle, die passen, werden gesucht (ODER):
 *   "5871"        Blocknummer UND Anfang einer TxID (Ziffern sind auch Hex)
 *   "#5871"       nur Blocknummer
 *   "1e1bef"      Anfang einer TxID
 *   "ysr1q8zt4k"  Anfang der Adresse der Gegenseite (oder die ganze)
 *   jeder Text    Teil einer Notiz (ab 2 Zeichen)
 *
 * "Beginnt mit" wird zu einem Bytebereich [lo, hi]: der Anfang mit Nullen
 * bzw. Einsen aufgefuellt. Die Datenbank vergleicht dann nur Bytes.
 */

export interface Suche {
  hoehe: number | null;
  /** Hex, je 32 Byte. */
  txLo: string | null; txHi: string | null;
  /** Hex, je 20 Byte. */
  gegenLo: string | null; gegenHi: string | null;
  memo: string | null;
}

const TXID_BYTES = 32;
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
/** Datenzeichen einer Adresse ohne Pruefsumme: 160 Bit / 5 = 32. */
const ADRESS_ZEICHEN = Math.ceil((ADDRESS_BYTES * 8) / 5);
const MIN_TXID = 4;
const MIN_ADRESSE = 2;    // Zeichen nach "ysr1"
const MIN_MEMO = 2;
const MAX_EINGABE = 100;

/** Bits (0/1) auf `bytes` Byte auffuellen -> [lo, hi] als Hex. */
export function bereich(bits: number[], bytes: number): [string, string] {
  const gesamt = bytes * 8;
  const b = bits.slice(0, gesamt);
  const hex = (fuell: number) => {
    const alle = b.concat(new Array(gesamt - b.length).fill(fuell));
    let s = '';
    for (let i = 0; i < gesamt; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | alle[i + j];
      s += v.toString(16).padStart(2, '0');
    }
    return s;
  };
  return [hex(0), hex(1)];
}

function hexBits(hex: string): number[] {
  const bits: number[] = [];
  for (const c of hex) {
    const v = parseInt(c, 16);
    for (let i = 3; i >= 0; i--) bits.push((v >> i) & 1);
  }
  return bits;
}

function bech32Bits(zeichen: string): number[] | null {
  const bits: number[] = [];
  for (const c of zeichen) {
    const v = BECH32.indexOf(c);
    if (v < 0) return null;
    for (let i = 4; i >= 0; i--) bits.push((v >> i) & 1);
  }
  return bits;
}

const LEER: Suche = { hoehe: null, txLo: null, txHi: null, gegenLo: null, gegenHi: null, memo: null };

/** Eingabe -> Filter. null = keine Suche (leer oder zu kurz fuer alles). */
export function sucheAus(eingabe: string | null): Suche | null {
  const q = (eingabe ?? '').trim().slice(0, MAX_EINGABE);
  if (!q) return null;
  const s: Suche = { ...LEER };
  const klein = q.toLowerCase();

  // Blocknummer: "#5871" nur als Block, "5871" auch als TxID-Anfang (unten).
  const block = /^#?(\d{1,9})$/.exec(q);
  if (block) s.hoehe = Number(block[1]);

  // TxID-Anfang.
  if (/^[0-9a-f]+$/.test(klein) && klein.length >= MIN_TXID && klein.length <= TXID_BYTES * 2) {
    [s.txLo, s.txHi] = bereich(hexBits(klein), TXID_BYTES);
  }

  // Adresse der Gegenseite: ganz (mit Pruefsumme) oder ihr Anfang.
  const hrp = ADDRESS_HRP + '1';
  if (klein.startsWith(hrp)) {
    let ganz: Uint8Array | null = null;
    try { ganz = decodeAddress(klein); } catch { /* nur ein Anfang */ }
    if (ganz) {
      const hex = Array.from(ganz, b => b.toString(16).padStart(2, '0')).join('');
      s.gegenLo = hex; s.gegenHi = hex;
    } else {
      const daten = klein.slice(hrp.length, hrp.length + ADRESS_ZEICHEN);
      const bits = daten.length >= MIN_ADRESSE ? bech32Bits(daten) : null;
      if (bits) [s.gegenLo, s.gegenHi] = bereich(bits, ADDRESS_BYTES);
    }
  }

  // Notiz: jeder Text ab 2 Zeichen.
  if ([...q].length >= MIN_MEMO) s.memo = q;

  return s.hoehe === null && !s.txLo && !s.gegenLo && !s.memo ? null : s;
}

/** Zeitpunkt in Unix-Sekunden aus der Anfrage; alles andere -> null. */
export function zeitAus(s: string | null): number | null {
  if (!s || !/^\d{1,12}$/.test(s)) return null;
  return Number(s);
}
