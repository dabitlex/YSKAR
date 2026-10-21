/**
 * Skript-Pruefer gegen eine zweite Umsetzung (docs/CONSENSUS_V6.md 14,
 * "Script checker") -- Teil 1: Faelle erzeugen und von YSKAR entscheiden lassen.
 *
 *   node --experimental-strip-types scripts/skript-gegenpruefung/erzeugen.ts \
 *        --out <datei.jsonl> [--anzahl 50000] [--seed 1]
 *
 * Erzeugt zufaellige Bedingungsskripte (Abschnitt 7) mit passenden und
 * unpassenden Witnesses und laesst den YSKAR-Code entscheiden:
 *   decodeScript    wohlgeformt (7.2) oder nicht
 *   decodeWitness + evaluateScript   erfuellt (7.3, 7.4) oder mit welchem Fehler nicht
 * Jede Zeile der Ausgabe enthaelt die rohen Bytes und das Ergebnis.
 * gegenpruefung.py rechnet dieselben Bytes mit der unabhaengigen Umsetzung
 * (scripts/v6-vektoren/gegenrechnung/v6.py) nach und vergleicht.
 *
 * Absichtlich dabei: Grenzwerte (Tiefe 3 und 4, 16 und 17 Kinder, 16 und 17
 * Schluessel, k = 0 und k > n, Hoehe 0, 1.024 und 1.025 Byte), doppelte
 * Schluessel, Zweige ohne Schluessel, kaputte Bytes (umgedreht, abgeschnitten,
 * angehaengt), Witness mit falschem Slotbyte, zu kurz, zu lang, ueberzaehlige
 * und fehlende Belegungen, falsche Signaturen und Vorbilder, Zeitgrenzen
 * genau auf und neben der Hoehe.
 *
 * Nicht dabei: konstruierte Grenzfall-Signaturen (nicht kanonische Punkte,
 * kleine Ordnung). Dort unterscheiden sich RFC 8032 (Gegenrechnung) und die
 * Regel aus 7.8 (YSKAR) absichtlich; das prueft tests/zip215.test.ts.
 */
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';

import * as SC from '../../src/lib/core/script.ts';
import { toHex } from '../../src/lib/core/codec.ts';

function arg(name: string, vorgabe?: string): string {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (vorgabe !== undefined) return vorgabe;
  throw new Error(`${name} fehlt`);
}
const aus = arg('--out');
const anzahl = Number(arg('--anzahl', '50000'));
let zustand = Number(arg('--seed', '1')) >>> 0 || 1;

// xorshift32: klein, deterministisch, wiederholbar.
function z(): number { zustand ^= zustand << 13; zustand >>>= 0; zustand ^= zustand >>> 17; zustand ^= zustand << 5; zustand >>>= 0; return zustand / 2 ** 32; }
const ganz = (n: number) => Math.floor(z() * n);
const wahl = <T>(xs: T[]): T => xs[ganz(xs.length)];
const bytes = (n: number) => Uint8Array.from({ length: n }, () => ganz(256));

// Schluessel und Vorbilder, aus denen Skripte gebaut werden.
const geheim = Array.from({ length: 20 }, (_, i) => createHash('sha256').update(`schluessel-${i}`).digest());
const schluessel = geheim.map(g => ({ priv: new Uint8Array(g), pub: ed25519.getPublicKey(new Uint8Array(g)) }));
const vorbilder = Array.from({ length: 4 }, (_, i) => new Uint8Array(createHash('sha256').update(`vorbild-${i}`).digest()));
const hashVon = (x: Uint8Array) => new Uint8Array(createHash('sha256').update(x).digest());
const hoehen = [0, 1, 2, 99, 100, 101, 5_000, 0xffffffff];

/** Rohform eines Knotens -- auch fuer Knoten, die decodeScript ablehnen muss. */
type Roh =
  | { t: 'PK'; pub: Uint8Array } | { t: 'HASH'; h: Uint8Array }
  | { t: 'AFTER' | 'BEFORE'; hoehe: number } | { t: 'THRESH'; k: number; kinder: Roh[] };

function baue(tiefe: number): Roh {
  const r = z();
  // Tiefer als erlaubt (3) nur selten; THRESH-Wahrscheinlichkeit sinkt mit der Tiefe.
  if (tiefe < 4 && r < 0.45 - tiefe * 0.12) {
    const n = z() < 0.04 ? 17 : z() < 0.1 ? 16 : 1 + ganz(4);
    const kinder = Array.from({ length: n }, () => baue(tiefe + 1));
    const k = z() < 0.05 ? 0 : z() < 0.05 ? n + 1 : 1 + ganz(n);
    return { t: 'THRESH', k, kinder };
  }
  const blatt = z();
  if (blatt < 0.45) return { t: 'PK', pub: z() < 0.03 ? bytes(32) : wahl(schluessel).pub };
  if (blatt < 0.62) return { t: 'HASH', h: z() < 0.2 ? bytes(32) : hashVon(wahl(vorbilder)) };
  return { t: z() < 0.5 ? 'AFTER' : 'BEFORE', hoehe: wahl(hoehen) };
}

function u32(n: number): number[] { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }
function kodiere(n: Roh): number[] {
  switch (n.t) {
    case 'PK': return [0x01, ...n.pub];
    case 'HASH': return [0x03, ...n.h];
    case 'AFTER': return [0x04, ...u32(n.hoehe)];
    case 'BEFORE': return [0x05, ...u32(n.hoehe)];
    case 'THRESH': return [0x02, n.k & 0xff, n.kinder.length & 0xff, ...n.kinder.flatMap(kodiere)];
  }
}

/** Bytes gezielt beschaedigen. */
function beschaedige(b: number[]): number[] {
  const x = [...b];
  const art = ganz(5);
  if (art === 0 && x.length) x[ganz(x.length)] ^= 1 << ganz(8);                 // ein Bit
  else if (art === 1 && x.length) x.length = ganz(x.length);                     // abgeschnitten
  else if (art === 2) x.push(...bytes(1 + ganz(4)));                              // angehaengt
  else if (art === 3 && x.length) x[ganz(x.length)] = ganz(256);                 // ein Byte
  else x.push(...Array(1_025 - Math.min(x.length, 1_025)).fill(0));               // ueber 1.024 Byte
  return x;
}

function blaetter(n: SC.ScriptNode): SC.ScriptNode[] { return SC.leaves(n); }

/** Witness zu einem wohlgeformten Skript: Belegungen zufaellig, teils passend, teils nicht. */
function witnessZu(skript: SC.ScriptNode, sighash: Uint8Array): number[] {
  const out: number[] = [];
  const dichte = z();                       // mal duenn, mal fast alles belegt
  for (const b of blaetter(skript)) {
    if (z() > dichte) { out.push(0x00); continue; }
    switch (b.op) {
      case SC.OP_PK: {
        const s = schluessel.find(k => toHex(k.pub) === toHex(b.pubkey));
        const r = z();
        const sig = s && r < 0.7 ? ed25519.sign(sighash, s.priv)                      // gueltig
          : r < 0.85 ? ed25519.sign(sighash, wahl(schluessel).priv)                   // anderer Schluessel
          : r < 0.93 && s ? ed25519.sign(bytes(32), s.priv)                           // anderer Sighash
          : bytes(64);                                                                // Unsinn
        out.push(0x01, ...sig);
        break;
      }
      case SC.OP_HASH: {
        const passend = vorbilder.find(v => toHex(hashVon(v)) === toHex(b.hash));
        out.push(0x01, ...(passend && z() < 0.75 ? passend : z() < 0.5 ? wahl(vorbilder) : bytes(32)));
        break;
      }
      default: out.push(0x01);
    }
  }
  return out;
}

/**
 * Witness, der das Skript erfuellen SOLL: in jedem THRESH genau k Kinder
 * belegt, jedes belegte Blatt passend (gueltige Signatur, richtiges Vorbild,
 * Anspruch auf die Zeitbedingung). Ob es klappt, haengt noch am
 * Gueltigkeitsfenster und daran, ob Schluessel und Vorbild bekannt sind.
 */
function erfuellenderWitness(skript: SC.ScriptNode, sighash: Uint8Array): number[] {
  const belegt = new Set<SC.ScriptNode>();
  const waehle = (n: SC.ScriptNode): void => {
    if (n.op !== SC.OP_THRESH) { belegt.add(n); return; }
    const reihenfolge = n.children.map((_, i) => i).sort(() => z() - 0.5);
    for (const i of reihenfolge.slice(0, n.k)) waehle(n.children[i]);
  };
  waehle(skript);
  const out: number[] = [];
  for (const b of blaetter(skript)) {
    if (!belegt.has(b)) { out.push(0x00); continue; }
    if (b.op === SC.OP_PK) {
      const s = schluessel.find(k => toHex(k.pub) === toHex(b.pubkey));
      out.push(0x01, ...(s ? ed25519.sign(sighash, s.priv) : bytes(64)));
    } else if (b.op === SC.OP_HASH) {
      const v = vorbilder.find(x => toHex(hashVon(x)) === toHex(b.hash));
      out.push(0x01, ...(v ?? bytes(32)));
    } else out.push(0x01);
  }
  return out;
}

/** Einen gezielten Fehler in einen sonst passenden Witness: ein Slot mehr oder weniger, eine Signatur falsch. */
function knappDaneben(skript: SC.ScriptNode, w: number[], sighash: Uint8Array): number[] {
  const bl = blaetter(skript);
  // Slotgrenzen bestimmen.
  const start: number[] = [];
  let o = 0;
  for (const b of bl) {
    start.push(o);
    o += w[o] === 0x00 ? 1 : 1 + (b.op === SC.OP_PK ? 64 : b.op === SC.OP_HASH ? 32 : 0);
  }
  const j = ganz(bl.length);
  const b = bl[j];
  const vor = w.slice(0, start[j]);
  const nach = w.slice(j + 1 < bl.length ? start[j + 1] : w.length);
  let slot: number[];
  if (w[start[j]] === 0x00) {
    // Unbelegten Slot belegen -- macht THRESH meist ueberzaehlig.
    slot = b.op === SC.OP_PK ? [0x01, ...ed25519.sign(sighash, wahl(schluessel).priv)]
      : b.op === SC.OP_HASH ? [0x01, ...wahl(vorbilder)] : [0x01];
  } else if (z() < 0.5) {
    slot = [0x00];                                   // belegten Slot leeren
  } else {
    // Inhalt verfaelschen: ein Bit der Signatur bzw. des Vorbilds.
    slot = w.slice(start[j], j + 1 < bl.length ? start[j + 1] : w.length);
    if (slot.length > 1) slot[1 + ganz(slot.length - 1)] ^= 1 << ganz(8);
  }
  return [...vor, ...slot, ...nach];
}

const datei = createWriteStream(aus);
const statistik = { faelle: 0, wohlgeformt: 0, erfuellt: 0, fehler: {} as Record<string, number> };

for (let i = 0; i < anzahl; i++) {
  let skriptBytes = kodiere(baue(0));
  if (z() < 0.15) skriptBytes = beschaedige(skriptBytes);
  const sb = Uint8Array.from(skriptBytes);
  const skript = SC.decodeScript(sb);

  const sighash = bytes(32);
  /*
    Gueltigkeitsfenster: meist an den Hoehen, die im Skript selbst stehen --
    genau darauf, eins darunter, eins darueber. Sonst traefe der Zufall die
    Grenzen von AFTER (validFrom >= h) und BEFORE (validUntil <= h) kaum.
  */
  const imSkript = skript ? blaetter(skript).filter(b => b.op === SC.OP_AFTER || b.op === SC.OP_BEFORE)
    .map(b => (b as { height: number }).height) : [];
  const fenster = () => {
    if (z() < 0.2) return 0;
    const basis = imSkript.length && z() < 0.75 ? wahl(imSkript) : wahl(hoehen.filter(h => h < 0xffffffff));
    return Math.min(0xffffffff, Math.max(0, basis + ganz(3) - 1));
  };
  const vf = fenster(), vu = fenster();

  let witness: number[] = [];
  let ergebnis: string;
  if (!skript) {
    ergebnis = 'nicht_wohlgeformt';
  } else {
    statistik.wohlgeformt++;
    const modus = z();
    witness = modus < 0.45 ? erfuellenderWitness(skript, sighash)
      : modus < 0.7 ? knappDaneben(skript, erfuellenderWitness(skript, sighash), sighash)
      : witnessZu(skript, sighash);
    const w = z();
    if (w < 0.04) witness = beschaedige(witness);                 // kaputter Witness
    else if (w < 0.06 && witness.length) witness[ganz(witness.length)] = 0x02; // falsches Slotbyte
    const slots = SC.decodeWitness(skript, Uint8Array.from(witness));
    if (!slots) ergebnis = 'bad_witness';
    else ergebnis = SC.evaluateScript(skript, slots, { sighash, validFrom: vf, validUntil: vu }) ?? 'erfuellt';
  }
  if (ergebnis === 'erfuellt') statistik.erfuellt++;
  else statistik.fehler[ergebnis] = (statistik.fehler[ergebnis] ?? 0) + 1;
  statistik.faelle++;

  datei.write(JSON.stringify({
    i, skript: toHex(sb), witness: toHex(Uint8Array.from(witness)), sighash: toHex(sighash),
    validFrom: vf, validUntil: vu, yskar: ergebnis,
  }) + '\n');
}
await new Promise<void>(r => datei.end(r));
console.log(JSON.stringify(statistik, null, 2));
