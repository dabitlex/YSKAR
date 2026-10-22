import { sha256 } from '@noble/hashes/sha2.js';
import { Reader, Writer, toHex } from './codec.ts';
import { verifySignature } from './sigcheck.ts';
import { MAX_SCRIPT_BYTES, MAX_SCRIPT_KEYS, MAX_SCRIPT_DEPTH, MAX_THRESH_ARITY } from './params.ts';

/**
 * Bedingungsskripte -- Konsensfassung 6, docs/CONSENSUS_V6.md Abschnitt 7.
 *
 * Ein Skript ist ein Baum aus fuenf Knotenarten. Keine Schleifen, kein
 * Speicher, keine Arithmetik: Die Pruefung ist linear in der Groesse, und
 * die Groesse ist begrenzt.
 *
 *   0x01 PK(pubkey32)            Signatur dieses Schluessels ueber den Sighash
 *   0x02 THRESH(k, n, kinder..)  genau k der n Kinder beruehrt und erfuellt
 *   0x03 HASH(h32)               Vorbild x mit sha256(x) = h
 *   0x04 AFTER(hoehe)            tx.validFrom >= hoehe
 *   0x05 BEFORE(hoehe)           tx.validUntil != 0 && tx.validUntil <= hoehe
 *
 * AFTER und BEFORE pruefen gegen das Gueltigkeitsfenster der TRANSAKTION,
 * nicht gegen die Blockhoehe. Zusammen mit der Regel, dass der Block im
 * Fenster liegt, ergibt das dieselbe Bedeutung -- aber die Auswertung haengt
 * nur von der Transaktion ab, nicht vom Block, in dem sie landet.
 *
 * Der Witness hat je Blatt einen Slot in Tiefe-zuerst-Reihenfolge:
 *   PK      0x00 | 0x01 sig64
 *   HASH    0x00 | 0x01 vorbild32
 *   AFTER   0x00 | 0x01
 *   BEFORE  0x00 | 0x01
 *
 * Bei THRESH muessen GENAU k Kinder beruehrt sein (t == k), nicht
 * mindestens k: Das macht den Witness so kanonisch wie moeglich und
 * begrenzt die Signaturpruefungen auf das, was das Skript braucht
 * (ueberzaehlige Signaturen sind ein Fehler).
 */

export const OP_PK = 0x01;
export const OP_THRESH = 0x02;
export const OP_HASH = 0x03;
export const OP_AFTER = 0x04;
export const OP_BEFORE = 0x05;

export type ScriptNode =
  | { op: typeof OP_PK; pubkey: Uint8Array }
  | { op: typeof OP_THRESH; k: number; children: ScriptNode[] }
  | { op: typeof OP_HASH; hash: Uint8Array }
  | { op: typeof OP_AFTER; height: number }
  | { op: typeof OP_BEFORE; height: number };

export type ScriptError =
  | 'bad_script' | 'bad_witness' | 'script_unsatisfied' | 'witness_excess';

// ----------------------------------------------------------- Kodierung

export function encodeScript(node: ScriptNode): Uint8Array {
  const w = new Writer();
  schreibe(w, node);
  return w.finish();
}

function schreibe(w: Writer, n: ScriptNode): void {
  w.u8(n.op);
  switch (n.op) {
    case OP_PK: w.bytes(n.pubkey, 32); break;
    case OP_HASH: w.bytes(n.hash, 32); break;
    case OP_AFTER:
    case OP_BEFORE: w.u32(n.height); break;
    case OP_THRESH:
      w.u8(n.k).u8(n.children.length);
      for (const c of n.children) schreibe(w, c);
      break;
  }
}

/**
 * Skript lesen UND auf Wohlgeformtheit pruefen (Abschnitt 7.2). Liefert
 * null, wenn das Skript nicht wohlgeformt ist; dann wird es nie ausgewertet.
 *
 * Die Pruefung passiert beim Lesen, weil beides dieselben Grenzen braucht
 * (Groesse, Tiefe, Aritaet) und ein zweiter Durchlauf nur Fehler einladen
 * wuerde.
 */
export function decodeScript(bytes: Uint8Array): ScriptNode | null {
  if (bytes.length < 1 || bytes.length > MAX_SCRIPT_BYTES) return null;
  const r = new Reader(bytes);
  const keys = new Set<string>();
  let keyCount = 0;

  function lies(depth: number): ScriptNode | null {
    if (depth > MAX_SCRIPT_DEPTH) return null;
    if (r.rest < 1) return null;
    const op = r.u8();
    switch (op) {
      case OP_PK: {
        if (r.rest < 32) return null;
        const pubkey = r.bytes(32);
        const hex = toHex(pubkey);
        if (keys.has(hex)) return null;          // kein Schluessel zweimal
        keys.add(hex);
        if (++keyCount > MAX_SCRIPT_KEYS) return null;
        return { op: OP_PK, pubkey };
      }
      case OP_HASH: {
        if (r.rest < 32) return null;
        return { op: OP_HASH, hash: r.bytes(32) };
      }
      case OP_AFTER:
      case OP_BEFORE: {
        if (r.rest < 4) return null;
        const height = r.u32();
        if (height < 1) return null;             // AFTER(0) immer, BEFORE(0) nie erfuellbar
        return { op, height };
      }
      case OP_THRESH: {
        // THRESH nur auf Tiefe 0..2; ein Kind auf Tiefe depth+1 <= 3.
        if (depth >= MAX_SCRIPT_DEPTH) return null;
        if (r.rest < 2) return null;
        const k = r.u8();
        const n = r.u8();
        if (n < 1 || n > MAX_THRESH_ARITY || k < 1 || k > n) return null;
        const children: ScriptNode[] = [];
        for (let i = 0; i < n; i++) {
          const c = lies(depth + 1);
          if (!c) return null;
          children.push(c);
        }
        return { op: OP_THRESH, k, children };
      }
      default:
        return null;
    }
  }

  const root = lies(0);
  if (!root) return null;
  if (r.rest !== 0) return null;                 // genau scriptLen Byte
  if (!needsKey(root)) return null;              // jeder Pfad braucht eine Signatur
  return root;
}

/**
 * Regel 6 der Wohlgeformtheit: Keine erfuellende Belegung ohne Signatur.
 * THRESH braucht einen Schluessel, wenn weniger als k seiner Kinder OHNE
 * Schluessel auskommen -- dann enthaelt jede Auswahl von k Kindern eines
 * mit Schluessel.
 */
export function needsKey(n: ScriptNode): boolean {
  switch (n.op) {
    case OP_PK: return true;
    case OP_HASH:
    case OP_AFTER:
    case OP_BEFORE: return false;
    case OP_THRESH: {
      let ohne = 0;
      for (const c of n.children) if (!needsKey(c)) ohne++;
      return ohne < n.k;
    }
  }
}

export function scriptHash(script: Uint8Array): Uint8Array {
  return sha256(script);
}

/** Blaetter in Tiefe-zuerst-Reihenfolge -- die Reihenfolge der Witness-Slots. */
export function leaves(n: ScriptNode): ScriptNode[] {
  if (n.op === OP_THRESH) return n.children.flatMap(leaves);
  return [n];
}

// ------------------------------------------------------------- Witness

export type WitnessSlot =
  | { kind: 'absent' }
  | { kind: 'sig'; signature: Uint8Array }
  | { kind: 'preimage'; preimage: Uint8Array }
  | { kind: 'claim' };

/**
 * Witness lesen. Braucht das Skript, weil die Slotgroesse vom Blatt
 * abhaengt. Null bei jedem Formfehler (bad_witness): falsches Slotbyte,
 * abgeschnittene Daten, Rest nach dem letzten Slot.
 */
export function decodeWitness(script: ScriptNode, bytes: Uint8Array): WitnessSlot[] | null {
  const r = new Reader(bytes);
  const slots: WitnessSlot[] = [];
  for (const leaf of leaves(script)) {
    if (r.rest < 1) return null;
    const flag = r.u8();
    if (flag === 0x00) { slots.push({ kind: 'absent' }); continue; }
    if (flag !== 0x01) return null;
    switch (leaf.op) {
      case OP_PK:
        if (r.rest < 64) return null;
        slots.push({ kind: 'sig', signature: r.bytes(64) });
        break;
      case OP_HASH:
        if (r.rest < 32) return null;
        slots.push({ kind: 'preimage', preimage: r.bytes(32) });
        break;
      default:
        slots.push({ kind: 'claim' });
    }
  }
  return r.rest === 0 ? slots : null;
}

export function encodeWitness(slots: WitnessSlot[]): Uint8Array {
  const w = new Writer();
  for (const s of slots) {
    switch (s.kind) {
      case 'absent': w.u8(0); break;
      case 'sig': w.u8(1).bytes(s.signature, 64); break;
      case 'preimage': w.u8(1).bytes(s.preimage, 32); break;
      case 'claim': w.u8(1); break;
    }
  }
  return w.finish();
}

/** Zahl der belegten PK-Slots -- geht ins Signaturbudget des Blocks ein (7.7). */
export function witnessSigops(slots: WitnessSlot[]): number {
  let n = 0;
  for (const s of slots) if (s.kind === 'sig') n++;
  return n;
}

// ---------------------------------------------------------- Auswertung

export interface EvalContext {
  /** Sighash der Transaktion -- die Signaturen in PK-Slots gehen darueber. */
  sighash: Uint8Array;
  validFrom: number;
  validUntil: number;
}

/**
 * Skript gegen Witness und Transaktion pruefen (Abschnitt 7.4). Tiefe
 * zuerst, der erste Fehler gewinnt. Null heisst: erfuellt.
 */
export function evaluateScript(
  root: ScriptNode, slots: WitnessSlot[], ctx: EvalContext,
): ScriptError | null {
  /*
    Erst die FORM des Witness pruefen, ohne eine Signatur anzusehen: Welche
    Blaetter sind belegt, hat jeder beruehrte THRESH genau k beruehrte
    Kinder, passt der Slot zum Blatt? Erst wenn die Form stimmt, kostet die
    Transaktion Kryptografie. So zahlt ein Angreifer mit 16 Signaturen an
    einem THRESH(1) nur das Zaehlen, nicht 16 Pruefungen (7.4, 7.7).
  */
  const form = pruefeForm(root, slots);
  if (form) return form;

  let i = 0;   // laufender Slot-Index

  // Liefert { touched, satisfied } oder einen Fehler.
  function pruefe(n: ScriptNode): { touched: boolean; ok: boolean } | ScriptError {
    if (n.op !== OP_THRESH) {
      const slot = slots[i++];
      if (!slot || slot.kind === 'absent') return { touched: false, ok: false };
      switch (n.op) {
        case OP_PK:
          if (slot.kind !== 'sig') return 'bad_witness';
          return { touched: true, ok: verifySignature(slot.signature, ctx.sighash, n.pubkey) };
        case OP_HASH:
          if (slot.kind !== 'preimage') return 'bad_witness';
          return { touched: true, ok: toHex(sha256(slot.preimage)) === toHex(n.hash) };
        case OP_AFTER:
          return { touched: true, ok: ctx.validFrom >= n.height };
        case OP_BEFORE:
          return { touched: true, ok: ctx.validUntil !== 0 && ctx.validUntil <= n.height };
      }
    }
    let touched = 0;
    for (const c of n.children) {
      const r = pruefe(c);
      if (typeof r === 'string') return r;
      if (r.touched) {
        touched++;
        if (!r.ok) return 'script_unsatisfied';   // beruehrt, aber nicht erfuellt
      }
    }
    // Kein Blatt darunter belegt: Dieser Zweig wird nicht benutzt -- etwa
    // der Rueckzahlpfad eines HTLC beim Einloesen. Unberuehrt, kein Fehler.
    if (touched === 0) return { touched: false, ok: false };
    if (touched > n.k) return 'witness_excess';
    if (touched < n.k) return 'script_unsatisfied';
    return { touched: true, ok: true };
  }

  const r = pruefe(root);
  if (typeof r === 'string') return r;
  if (!r.touched || !r.ok) return 'script_unsatisfied';
  return null;
}

/** Formpruefung ohne Kryptografie. Liefert den ersten Formfehler, Tiefe zuerst. */
function pruefeForm(root: ScriptNode, slots: WitnessSlot[]): ScriptError | null {
  let i = 0;
  function geh(n: ScriptNode): boolean | ScriptError {   // true = beruehrt
    if (n.op !== OP_THRESH) {
      const slot = slots[i++];
      if (!slot || slot.kind === 'absent') return false;
      if (n.op === OP_PK && slot.kind !== 'sig') return 'bad_witness';
      if (n.op === OP_HASH && slot.kind !== 'preimage') return 'bad_witness';
      if ((n.op === OP_AFTER || n.op === OP_BEFORE) && slot.kind !== 'claim') return 'bad_witness';
      return true;
    }
    let touched = 0;
    for (const c of n.children) {
      const r = geh(c);
      if (typeof r === 'string') return r;
      if (r) touched++;
    }
    if (touched === 0) return false;
    if (touched > n.k) return 'witness_excess';
    if (touched < n.k) return 'script_unsatisfied';
    return true;
  }
  const r = geh(root);
  if (typeof r === 'string') return r;
  if (!r) return 'script_unsatisfied';
  return null;
}

// ----------------------------------------------------- Hilfen fuer Wallets

/** Schluessel aufsteigend sortieren, wie 7.1 es Wallets vorschreibt. */
export function sortKeys(pubkeys: Uint8Array[]): Uint8Array[] {
  return [...pubkeys].sort((a, b) => (toHex(a) < toHex(b) ? -1 : toHex(a) > toHex(b) ? 1 : 0));
}

export function multisig(k: number, pubkeys: Uint8Array[]): ScriptNode {
  return { op: OP_THRESH, k, children: sortKeys(pubkeys).map(pubkey => ({ op: OP_PK, pubkey })) };
}

/** Sparkonto: Schluessel UND nicht vor `height`. */
export function timelocked(pubkey: Uint8Array, height: number): ScriptNode {
  return { op: OP_THRESH, k: 2, children: [{ op: OP_PK, pubkey }, { op: OP_AFTER, height }] };
}

/**
 * HTLC fuer Atomic Swaps: Empfaenger mit Geheimnis ODER Absender nach
 * Ablauf. Slot-Reihenfolge: [PK empfaenger, HASH, PK absender, AFTER].
 */
export function htlc(recipient: Uint8Array, hash: Uint8Array, sender: Uint8Array, refundHeight: number): ScriptNode {
  return {
    op: OP_THRESH, k: 1, children: [
      { op: OP_THRESH, k: 2, children: [{ op: OP_PK, pubkey: recipient }, { op: OP_HASH, hash }] },
      { op: OP_THRESH, k: 2, children: [{ op: OP_PK, pubkey: sender }, { op: OP_AFTER, height: refundHeight }] },
    ],
  };
}
