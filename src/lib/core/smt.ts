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

  Kompakt abgelegt (21.10.2026): Die Knoten liegen nicht als einzelne
  Objekte im Speicher, sondern als Zeilen in wenigen grossen Feldern
  (Typed Arrays). Ein Blatt haelt nur Schluessel und Blatt-Hash -- der
  Wert wird beim Setzen sofort gehasht und nicht aufbewahrt. Ein innerer
  Knoten haelt Trennbit, beide Kinder, seinen Hash und die zuletzt
  gerechnete Huelle. Freie Zeilen werden wiederverwendet.

  Die Pruefung, dass beide Wege gleich rechnen, steht in
  tests/smt-baum.test.ts (zufaellige Folgen, gezielte Grenzfaelle) und in
  scripts/zustandsbaum-abgleich (echte Kette gegen die Gegenrechnung).
*/

const KEIN = -1;
const BLATT = 1;          // Kennzeichen: Zeile ist ein Blatt
const HASH_GUELTIG = 2;   // Kennzeichen: innerer Knoten, Hash ist aktuell

function erstesAnderesBit(a: Uint8Array, ao: number, b: Uint8Array, bo: number): number {
  for (let i = 0; i < 32; i++) {
    const x = a[ao + i] ^ b[bo + i];
    if (x !== 0) return i * 8 + Math.clz32(x) - 24;
  }
  return -1;
}

function bitIn(feld: Uint8Array, o: number, d: number): number {
  return (feld[o + (d >> 3)] >> (7 - (d & 7))) & 1;
}

export class SmtBaum {
  private kap = 0;
  private hoch = 0;                         // hoechste je benutzte Zeile + 1
  private frei: number[] = [];
  private art = new Uint8Array(0);          // BLATT | HASH_GUELTIG
  private links = new Int32Array(0);
  private rechts = new Int32Array(0);
  private bit = new Int16Array(0);          // Trennbit (innerer Knoten)
  private huelleTiefe = new Int16Array(0);  // Tiefe der gemerkten Huelle, -1 = keine
  private hashFeld = new Uint8Array(0);     // 32 Byte je Zeile: Blatt- bzw. Knoten-Hash
  private zweit = new Uint8Array(0);        // 32 Byte je Zeile: Schluessel (Blatt) bzw. Huelle (innen)
  private wurzelZeile = KEIN;
  private zahl = 0;

  /** Wie viele Eintraege im Baum stehen. */
  get size(): number { return this.zahl; }

  /** Eintrag setzen oder ersetzen. Schluessel: 32 Byte. */
  set(key: Uint8Array, value: Uint8Array): void {
    if (key.length !== 32) throw new Error('Schluessel im Zustandsbaum muss 32 Byte haben');
    const blattHash = smtLeaf(key, value);

    if (this.wurzelZeile === KEIN) {
      this.wurzelZeile = this.neuesBlatt(key, blattHash);
      this.zahl = 1;
      return;
    }

    // Zum naechstgelegenen Blatt absteigen, unterwegs nichts aendern.
    let n = this.wurzelZeile;
    while (!(this.art[n] & BLATT)) n = bitIn(key, 0, this.bit[n]) === 0 ? this.links[n] : this.rechts[n];
    const c = erstesAnderesBit(key, 0, this.zweit, n * 32);

    if (c < 0) {
      // Derselbe Schluessel: Blatt-Hash ersetzen, Pfad als geaendert markieren.
      this.hashFeld.set(blattHash, n * 32);
      this.markierePfad(key);
      return;
    }

    // Neuer Schluessel: dort einfuegen, wo das Trennbit c in den Pfad passt.
    const blatt = this.neuesBlatt(key, blattHash);
    let eltern = KEIN, linksVomEltern = false;
    let k = this.wurzelZeile;
    while (!(this.art[k] & BLATT) && this.bit[k] < c) {
      this.vergiss(k);
      eltern = k;
      linksVomEltern = bitIn(key, 0, this.bit[k]) === 0;
      k = linksVomEltern ? this.links[k] : this.rechts[k];
    }
    const innen = this.neueZeile();
    this.art[innen] = 0;
    this.bit[innen] = c;
    this.huelleTiefe[innen] = -1;
    if (bitIn(key, 0, c) === 0) { this.links[innen] = blatt; this.rechts[innen] = k; }
    else { this.links[innen] = k; this.rechts[innen] = blatt; }
    if (eltern === KEIN) this.wurzelZeile = innen;
    else if (linksVomEltern) this.links[eltern] = innen;
    else this.rechts[eltern] = innen;
    this.zahl++;
  }

  /** Eintrag entfernen. Gibt es ihn nicht, aendert sich nichts. */
  delete(key: Uint8Array): boolean {
    if (this.wurzelZeile === KEIN) return false;
    // Erst finden, ohne etwas zu aendern.
    let grosseltern = KEIN, eltern = KEIN, n = this.wurzelZeile;
    while (!(this.art[n] & BLATT)) {
      grosseltern = eltern; eltern = n;
      n = bitIn(key, 0, this.bit[n]) === 0 ? this.links[n] : this.rechts[n];
    }
    if (erstesAnderesBit(key, 0, this.zweit, n * 32) >= 0) return false;

    this.zahl--;
    this.gibFrei(n);
    if (eltern === KEIN) { this.wurzelZeile = KEIN; return true; }
    // Das Geschwister rueckt an die Stelle des Elternknotens.
    const geschwister = this.links[eltern] === n ? this.rechts[eltern] : this.links[eltern];
    this.gibFrei(eltern);
    if (grosseltern === KEIN) this.wurzelZeile = geschwister;
    else if (this.links[grosseltern] === eltern) this.links[grosseltern] = geschwister;
    else this.rechts[grosseltern] = geschwister;
    this.markierePfad(key, geschwister);
    return true;
  }

  /** Die Wurzel nach 5.2 -- gleich smtRoot() ueber dieselben Eintraege. */
  wurzel(): Uint8Array {
    if (this.wurzelZeile === KEIN) return SMT_EMPTY;
    return this.hashIn(this.wurzelZeile, 0).slice();
  }

  // ---------------------------------------------------------------- intern

  /** Hashes auf dem Pfad zu `key` vergessen -- bis zum Blatt oder bis zur Zeile `bis`. */
  private markierePfad(key: Uint8Array, bis = KEIN): void {
    let n = this.wurzelZeile;
    while (n !== KEIN && n !== bis && !(this.art[n] & BLATT)) {
      this.vergiss(n);
      n = bitIn(key, 0, this.bit[n]) === 0 ? this.links[n] : this.rechts[n];
    }
  }

  private vergiss(n: number): void {
    this.art[n] &= ~HASH_GUELTIG;
    this.huelleTiefe[n] = -1;
  }

  /** hash(d, S) fuer die Blaetter unter Zeile n, die alle die ersten d Bits teilen. Ein Blick ins Feld. */
  private hashIn(n: number, d: number): Uint8Array {
    if (this.art[n] & BLATT) return this.hashFeld.subarray(n * 32, n * 32 + 32);
    if (!(this.art[n] & HASH_GUELTIG)) {
      // smtNode kopiert beide Eingaben, bevor es hasht -- die Blicke ins Feld sind sicher.
      const h = smtNode(this.hashIn(this.links[n], this.bit[n] + 1), this.hashIn(this.rechts[n], this.bit[n] + 1));
      this.hashFeld.set(h, n * 32);
      this.art[n] |= HASH_GUELTIG;
      this.huelleTiefe[n] = -1;
    }
    const b = this.bit[n];
    if (d === b) return this.hashFeld.subarray(n * 32, n * 32 + 32);
    if (this.huelleTiefe[n] === d) return this.zweit.subarray(n * 32, n * 32 + 32);
    // Bits d .. b-1 teilen alle Blaetter darunter: je Bit ein Knoten mit EMPTY daneben.
    const probe = this.blattUnter(n) * 32;
    let h: Uint8Array = this.hashFeld.slice(n * 32, n * 32 + 32);
    for (let t = b - 1; t >= d; t--) {
      h = bitIn(this.zweit, probe, t) === 0 ? smtNode(h, SMT_EMPTY) : smtNode(SMT_EMPTY, h);
    }
    this.zweit.set(h, n * 32);
    this.huelleTiefe[n] = d;
    return this.zweit.subarray(n * 32, n * 32 + 32);
  }

  /** Irgendein Blatt unter Zeile n: seine ersten bit[n] Bits gelten fuer alle darunter. */
  private blattUnter(n: number): number {
    while (!(this.art[n] & BLATT)) n = this.links[n];
    return n;
  }

  private neuesBlatt(key: Uint8Array, blattHash: Uint8Array): number {
    const n = this.neueZeile();
    this.art[n] = BLATT;
    this.links[n] = KEIN; this.rechts[n] = KEIN;
    this.zweit.set(key, n * 32);
    this.hashFeld.set(blattHash, n * 32);
    return n;
  }

  private neueZeile(): number {
    const f = this.frei.pop();
    if (f !== undefined) return f;
    if (this.hoch === this.kap) this.wachse();
    return this.hoch++;
  }

  private gibFrei(n: number): void {
    this.art[n] = 0;
    this.frei.push(n);
  }

  /** Alle Felder auf die doppelte Groesse (mindestens 1.024 Zeilen). */
  private wachse(): void {
    const kap = Math.max(1_024, this.kap * 2);
    const gross = <T extends Uint8Array | Int16Array | Int32Array>(alt: T, neu: T): T => { neu.set(alt); return neu; };
    this.art = gross(this.art, new Uint8Array(kap));
    this.links = gross(this.links, new Int32Array(kap));
    this.rechts = gross(this.rechts, new Int32Array(kap));
    this.bit = gross(this.bit, new Int16Array(kap));
    this.huelleTiefe = gross(this.huelleTiefe, new Int16Array(kap));
    this.hashFeld = gross(this.hashFeld, new Uint8Array(kap * 32));
    this.zweit = gross(this.zweit, new Uint8Array(kap * 32));
    this.kap = kap;
  }
}
