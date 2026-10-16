import { sha256 } from '@noble/hashes/sha2.js';
import { sha256d } from './hash.ts';

/**
 * Binaerer Sparse-Merkle-Baum mit Blattkompaktierung -- der Zustandsbaum ab
 * Konsensfassung 6 (docs/CONSENSUS_V6.md 5.2).
 *
 *   key     = sha256(rohadresse)                            256 Bit
 *   leaf    = sha256d(0x00 | key | wert)
 *   node    = sha256d(0x01 | links | rechts)
 *   EMPTY   = 32 Nullbytes
 *
 *   hash(d, S):  S leer     -> EMPTY
 *                |S| = 1    -> leaf                 (Kompaktierung, egal wie tief)
 *                |S| >= 2   -> node(hash(d+1, S0), hash(d+1, S1))
 *                              S0/S1 nach Bit d des Schluessels (MSB zuerst)
 *
 * Ein Teilbaum mit genau einem Konto hat den Hash seines Blatts. Das ist
 * sicher, weil das Blatt den vollen Schluessel enthaelt und damit seine
 * Position festlegt (Jellyfish Merkle Tree). Die Kosten je Aenderung sind
 * dadurch etwa log2(Kontenzahl) Hashes statt 256.
 *
 * Diese Fassung rechnet die Wurzel aus der sortierten Liste neu: O(n log n),
 * fuer die heutige Kontenzahl voellig ausreichend. Eine inkrementelle
 * Ablage aendert die Wurzel nicht und kann spaeter dazukommen.
 */

export const SMT_EMPTY = new Uint8Array(32);

export interface SmtEntry { key: Uint8Array; value: Uint8Array }

export function smtKey(rawAddress: Uint8Array): Uint8Array {
  return sha256(rawAddress);
}

export function smtLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  const b = new Uint8Array(1 + 32 + value.length);
  b[0] = 0x00;
  b.set(key, 1);
  b.set(value, 33);
  return sha256d(b);
}

export function smtNode(left: Uint8Array, right: Uint8Array): Uint8Array {
  const b = new Uint8Array(65);
  b[0] = 0x01;
  b.set(left, 1);
  b.set(right, 33);
  return sha256d(b);
}

function bit(key: Uint8Array, d: number): number {
  return (key[d >> 3] >> (7 - (d & 7))) & 1;
}

function compareKeys(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Wurzel ueber eine Menge von Eintraegen. Die Schluessel muessen 32 Byte
 * und paarweise verschieden sein; die Reihenfolge der Eingabe ist egal.
 */
export function smtRoot(entries: SmtEntry[]): Uint8Array {
  if (entries.length === 0) return SMT_EMPTY;
  const sorted = [...entries].sort((a, b) => compareKeys(a.key, b.key));
  for (let i = 1; i < sorted.length; i++) {
    if (compareKeys(sorted[i - 1].key, sorted[i].key) === 0) throw new Error('doppelter Schluessel im Zustandsbaum');
  }
  return hashRange(sorted, 0, sorted.length, 0);
}

// Eintraege [lo, hi) teilen sich die ersten d Bits. Sortiert heisst: die
// mit Bit d = 0 stehen vorn, die mit 1 hinten -- die Trennstelle findet
// eine Suche nach dem ersten Eintrag mit Bit 1.
function hashRange(s: SmtEntry[], lo: number, hi: number, d: number): Uint8Array {
  const n = hi - lo;
  if (n === 0) return SMT_EMPTY;
  if (n === 1) return smtLeaf(s[lo].key, s[lo].value);
  if (d >= 256) throw new Error('doppelter Schluessel im Zustandsbaum');
  let a = lo, b = hi;
  while (a < b) {
    const m = (a + b) >> 1;
    if (bit(s[m].key, d) === 0) a = m + 1; else b = m;
  }
  return smtNode(hashRange(s, lo, a, d + 1), hashRange(s, a, hi, d + 1));
}
