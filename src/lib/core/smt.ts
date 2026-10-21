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
 * Zwei Wege zur selben Wurzel:
 *   smtRoot()  rechnet sie aus der sortierten Liste aller Eintraege neu --
 *              die Referenz, O(n) Hashes je Aufruf.
 *   SmtBaum    haelt den Baum im Speicher und rechnet nach Aenderungen nur
 *              deren Pfade neu (unten). Ihn benutzt der Knoten.
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

// ------------------------------------------------------------ Baum im Speicher

/*
  Derselbe Baum, im Speicher gehalten und Eintrag fuer Eintrag geaendert.

  smtRoot() oben rechnet die Wurzel aus der ganzen Liste neu; die Kosten
  wachsen mit der Zahl ALLER Eintraege (Messung in CONSENSUS_V6.md 14:
  2 Sekunden bei 100.000 Konten). SmtBaum haelt den Baum und rechnet nach
  einer Aenderung nur die Pfade darueber neu -- und auch die erst, wenn die
  Wurzel gebraucht wird: Viele Aenderungen hintereinander teilen sich die
  oberen Knoten, jeder wird einmal gehasht.

  Die Wurzel ist DIESELBE wie die von smtRoot() -- nicht eine Variante,
  sondern dieselbe Rechnung von hash(d, S) aus 5.2, nur gemerkt:

  Der Baum verzweigt nur dort, wo sich Schluessel wirklich unterscheiden
  (Crit-Bit-Baum). Ein innerer Knoten mit Trennbit c steht fuer die Menge S
  seiner Blaetter; alle teilen die ersten c Bits. hash(c, S) ist
  node(hash(c+1, S0), hash(c+1, S1)). Fuer eine Tiefe d < c sind S0 oder S1
  leer, und 5.2 verlangt dann node(EMPTY, x) bzw. node(x, EMPTY) -- je ein
  sha256d pro uebersprungenem Bit ("Huelle"). Ein Blatt hat in jeder Tiefe
  den Hash seines Blatts (Kompaktierung).

  Die Pruefung, dass beide Wege gleich rechnen, steht in
  tests/smt-baum.test.ts (zufaellige Folgen, gezielte Grenzfaelle) und in
  scripts/zustandsbaum-abgleich (echte Kette gegen die Gegenrechnung).
*/

interface Blatt {
  blatt: true;
  key: Uint8Array;
  value: Uint8Array;
  hash: Uint8Array | null;
}

interface Innen {
  blatt: false;
  /** Erstes Bit, in dem sich die Schluessel darunter unterscheiden. */
  bit: number;
  links: Knoten;
  rechts: Knoten;
  /** hash(bit, S) -- null, solange darunter etwas geaendert wurde. */
  hash: Uint8Array | null;
  /** Ein Schluessel darunter: die ersten `bit` Bits gelten fuer alle. */
  probe: Uint8Array;
  /** Zuletzt gerechnete Huelle: hash(huelleTiefe, S). */
  huelleTiefe: number;
  huelle: Uint8Array | null;
}

type Knoten = Blatt | Innen;

function erstesAnderesBit(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    const x = a[i] ^ b[i];
    if (x !== 0) return i * 8 + Math.clz32(x) - 24;
  }
  return -1;
}

function probeVon(k: Knoten): Uint8Array { return k.blatt ? k.key : k.probe; }

export class SmtBaum {
  private wurzelKnoten: Knoten | null = null;
  private zahl = 0;

  /** Wie viele Eintraege im Baum stehen. */
  get size(): number { return this.zahl; }

  /** Eintrag setzen oder ersetzen. Schluessel: 32 Byte. */
  set(key: Uint8Array, value: Uint8Array): void {
    if (key.length !== 32) throw new Error('Schluessel im Zustandsbaum muss 32 Byte haben');
    const neuesBlatt: Blatt = { blatt: true, key, value, hash: null };
    if (!this.wurzelKnoten) { this.wurzelKnoten = neuesBlatt; this.zahl = 1; return; }

    // Zum naechstgelegenen Blatt absteigen.
    let n: Knoten = this.wurzelKnoten;
    while (!n.blatt) n = bit(key, n.bit) === 0 ? n.links : n.rechts;
    const c = erstesAnderesBit(key, n.key);

    if (c < 0) {
      // Derselbe Schluessel: Wert ersetzen, Pfad als geaendert markieren.
      this.markiere(key, (vor, kind) => {
        if (kind.blatt) { kind.value = value; kind.hash = null; }
        return vor;
      });
      return;
    }

    // Neuer Schluessel: einfuegen, wo das Trennbit c in den Pfad passt.
    const einfuegen = (k: Knoten): Knoten => {
      if (k.blatt || k.bit > c) {
        const neuLinks = bit(key, c) === 0;
        return {
          blatt: false, bit: c,
          links: neuLinks ? neuesBlatt : k,
          rechts: neuLinks ? k : neuesBlatt,
          hash: null, probe: key, huelleTiefe: -1, huelle: null,
        };
      }
      if (bit(key, k.bit) === 0) k.links = einfuegen(k.links); else k.rechts = einfuegen(k.rechts);
      k.hash = null; k.huelle = null;
      return k;
    };
    this.wurzelKnoten = einfuegen(this.wurzelKnoten);
    this.zahl++;
  }

  /** Eintrag entfernen. Gibt es ihn nicht, aendert sich nichts. */
  delete(key: Uint8Array): boolean {
    if (!this.wurzelKnoten) return false;
    let gefunden = false;
    const entferne = (k: Knoten): Knoten | null => {
      if (k.blatt) {
        if (erstesAnderesBit(k.key, key) >= 0) return k;
        gefunden = true;
        return null;
      }
      const links = bit(key, k.bit) === 0;
      const kind = entferne(links ? k.links : k.rechts);
      if (!gefunden) return k;
      if (kind === null) return links ? k.rechts : k.links;   // Geschwister rueckt auf
      if (links) k.links = kind; else k.rechts = kind;
      k.hash = null; k.huelle = null;
      return k;
    };
    this.wurzelKnoten = entferne(this.wurzelKnoten);
    if (gefunden) this.zahl--;
    return gefunden;
  }

  /** Die Wurzel nach 5.2 -- gleich smtRoot() ueber dieselben Eintraege. */
  wurzel(): Uint8Array {
    return this.wurzelKnoten ? this.hashIn(this.wurzelKnoten, 0) : SMT_EMPTY;
  }

  /** Pfad zu `key` als geaendert markieren (Hashes vergessen). */
  private markiere(key: Uint8Array, amBlatt: (vor: Knoten, kind: Knoten) => Knoten): void {
    let n = this.wurzelKnoten!;
    while (!n.blatt) {
      n.hash = null; n.huelle = null;
      n = bit(key, n.bit) === 0 ? n.links : n.rechts;
    }
    amBlatt(n, n);
  }

  /** hash(d, S) fuer die Blaetter unter k, die alle die ersten d Bits teilen. */
  private hashIn(k: Knoten, d: number): Uint8Array {
    if (k.blatt) {
      if (!k.hash) k.hash = smtLeaf(k.key, k.value);
      return k.hash;
    }
    if (!k.hash) k.hash = smtNode(this.hashIn(k.links, k.bit + 1), this.hashIn(k.rechts, k.bit + 1));
    if (d === k.bit) return k.hash;
    if (k.huelle && k.huelleTiefe === d) return k.huelle;
    // Bits d .. bit-1 teilen alle Blaetter: je Bit ein Knoten mit EMPTY daneben.
    let h = k.hash;
    for (let t = k.bit - 1; t >= d; t--) {
      h = bit(probeVon(k), t) === 0 ? smtNode(h, SMT_EMPTY) : smtNode(SMT_EMPTY, h);
    }
    k.huelleTiefe = d; k.huelle = h;
    return h;
  }
}
