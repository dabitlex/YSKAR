/**
 * Der Zustandsbaum im Speicher (SmtBaum) gegen die Neuberechnung (smtRoot).
 *
 * Beide muessen fuer jede Menge von Eintraegen DIESELBE Wurzel liefern
 * (CONSENSUS_V6.md 5.2) -- nach jeder Folge von Einfuegen, Aendern und
 * Loeschen, in jeder Reihenfolge. Geprueft mit zufaelligen Folgen und mit
 * gezielt gebauten Schluesseln: lange gemeinsame Praefixe, Unterschied erst
 * im letzten Bit, Unterschied schon im ersten.
 *
 * Und dasselbe eine Ebene hoeher: stateRootV6 (mit dem Baum) gegen
 * stateRootV6Voll (Neuberechnung), auch wenn sich verschiedene Zustaende
 * abwechseln und ein Konto an Ort und Stelle geaendert wird.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { SmtBaum, smtRoot, SMT_EMPTY, type SmtEntry } from '../src/lib/core/smt.ts';
import {
  stateRootV6, stateRootV6Voll, emptyState, cloneState, type State,
  ZustandsBaum, SELBSTPRUEFUNG_IMMER_BIS, SELBSTPRUEFUNG_ZEITWEISE_BIS, SELBSTPRUEFUNG_ABSTAND_MS,
} from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';

/** Kleiner deterministischer Zufall (xorshift32), damit ein Fehlschlag wiederholbar ist. */
function zufall(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}
const schluessel = (n: number) => new Uint8Array(createHash('sha256').update(`k${n}`).digest());
const wert = (n: number) => new Uint8Array(createHash('sha256').update(`v${n}`).digest()).slice(0, 17);
const hex = toHex;

function referenz(m: Map<string, SmtEntry>): string {
  return hex(smtRoot([...m.values()]));
}

test('SmtBaum: leer, ein Eintrag, wieder leer', () => {
  const b = new SmtBaum();
  assert.equal(hex(b.wurzel()), hex(SMT_EMPTY));
  b.set(schluessel(1), wert(1));
  assert.equal(hex(b.wurzel()), hex(smtRoot([{ key: schluessel(1), value: wert(1) }])));
  assert.equal(b.delete(schluessel(2)), false, 'unbekannter Schluessel');
  assert.equal(b.delete(schluessel(1)), true);
  assert.equal(hex(b.wurzel()), hex(SMT_EMPTY));
  assert.equal(b.size, 0);
});

test('SmtBaum: zufaellige Folgen aus Einfuegen, Aendern, Loeschen -- nach jedem Schritt gleich smtRoot', () => {
  for (const seed of [1, 2, 3, 42, 4711]) {
    const r = zufall(seed);
    const b = new SmtBaum();
    const m = new Map<string, SmtEntry>();
    for (let schritt = 0; schritt < 1_500; schritt++) {
      const n = Math.floor(r() * 300);          // kleiner Vorrat: viele Aenderungen und Loeschungen
      const k = schluessel(n);
      const aktion = r();
      if (aktion < 0.55) {
        const v = wert(Math.floor(r() * 1e6));
        b.set(k, v); m.set(hex(k), { key: k, value: v });
      } else {
        assert.equal(b.delete(k), m.delete(hex(k)), `seed ${seed}, Schritt ${schritt}: delete`);
      }
      // Nicht nach jedem Schritt fragen: so werden auch mehrere Aenderungen
      // zwischen zwei Wurzeln geprueft (geteilte obere Pfade).
      if (r() < 0.3 || schritt === 1_499) {
        assert.equal(hex(b.wurzel()), referenz(m), `seed ${seed}, Schritt ${schritt}`);
      }
      assert.equal(b.size, m.size);
    }
  }
});

test('SmtBaum: gezielte Schluessel -- lange gemeinsame Praefixe, Unterschied im ersten und im letzten Bit', () => {
  const basis = new Uint8Array(32).fill(0xa5);
  const mitBit = (i: number) => { const k = basis.slice(); k[i >> 3] ^= 0x80 >> (i & 7); return k; };
  const faelle: Uint8Array[][] = [
    [basis, mitBit(255)],                                   // erst im letzten Bit verschieden
    [basis, mitBit(0)],                                     // schon im ersten Bit
    [basis, mitBit(255), mitBit(254), mitBit(128), mitBit(7), mitBit(0)],
    Array.from({ length: 256 }, (_, i) => mitBit(i)),      // jedes Bit einmal
    [new Uint8Array(32), new Uint8Array(32).fill(0xff)],   // Extreme
  ];
  for (const [nr, keys] of faelle.entries()) {
    for (const reihenfolge of ['vor', 'rueck', 'misch'] as const) {
      const ks = reihenfolge === 'vor' ? keys : reihenfolge === 'rueck' ? [...keys].reverse()
        : [...keys].sort((a, b) => (a[31] ^ 0x3c) - (b[31] ^ 0x3c) || a[0] - b[0]);
      const b = new SmtBaum();
      const m = new Map<string, SmtEntry>();
      for (const [i, k] of ks.entries()) {
        const v = wert(i);
        b.set(k, v); m.set(hex(k), { key: k, value: v });
        assert.equal(hex(b.wurzel()), referenz(m), `Fall ${nr} ${reihenfolge}: nach Einfuegen ${i}`);
      }
      // Wieder abbauen, in anderer Reihenfolge.
      for (const [i, k] of [...ks].reverse().entries()) {
        if (i % 2 === 1) continue;
        b.delete(k); m.delete(hex(k));
        assert.equal(hex(b.wurzel()), referenz(m), `Fall ${nr} ${reihenfolge}: nach Loeschen ${i}`);
      }
    }
  }
});

function konto(i: number) { return { balance: BigInt(1_000 + i), nonce: BigInt(i % 5) }; }
function adr(i: number) { const a = new Uint8Array(20); a[0] = 7; a[1] = i >> 8; a[2] = i & 0xff; return toHex(a); }

test('stateRootV6: gleich der Neuberechnung, auch bei wechselnden Zustaenden und Aenderung an Ort und Stelle', () => {
  const a: State = emptyState();
  for (let i = 0; i < 400; i++) a.set(adr(i), konto(i));
  assert.equal(hex(stateRootV6(a)), hex(stateRootV6Voll(a)));

  // Ein zweiter Zustand mit anderen Konten, abwechselnd mit dem ersten.
  const b = cloneState(a);
  for (let i = 0; i < 400; i += 3) b.delete(adr(i));
  for (let i = 400; i < 450; i++) b.set(adr(i), konto(i));
  b.set(adr(1), { balance: 5n, nonce: 9n });
  for (let runde = 0; runde < 3; runde++) {
    assert.equal(hex(stateRootV6(b)), hex(stateRootV6Voll(b)), `b, Runde ${runde}`);
    assert.equal(hex(stateRootV6(a)), hex(stateRootV6Voll(a)), `a, Runde ${runde}`);
  }

  // Ein Konto an Ort und Stelle geaendert -- der Baum darf das nicht uebersehen.
  a.get(adr(10))!.balance += 1n;
  assert.equal(hex(stateRootV6(a)), hex(stateRootV6Voll(a)), 'nach Aenderung an Ort und Stelle');

  // Ein Konto mit null Guthaben und Nonce null, falls es im Zustand steht: wie die Neuberechnung.
  a.set(adr(999), { balance: 0n, nonce: 0n });
  assert.equal(hex(stateRootV6(a)), hex(stateRootV6Voll(a)), 'Null-Konto');

  // Leerer Zustand und zurueck.
  assert.equal(hex(stateRootV6(emptyState())), hex(SMT_EMPTY));
  assert.equal(hex(stateRootV6(a)), hex(stateRootV6Voll(a)), 'nach leerem Zustand');

  // Die zurueckgegebene Wurzel ist eine Kopie: Wer sie veraendert, aendert den Baum nicht.
  const w = stateRootV6(a);
  w.fill(0);
  assert.equal(hex(stateRootV6(a)), hex(stateRootV6Voll(a)), 'Kopie');
});

// ------------------------------------------------------------ Selbstpruefung

/** Ein Baum mit Fehler: liefert eine falsche Wurzel. */
class FalscherBaum extends SmtBaum {
  wurzel(): Uint8Array { return new Uint8Array(32).fill(0xee); }
}

function zustandMit(n: number, bereich = 9): State {
  const s = emptyState();
  for (let i = 0; i < n; i++) {
    const a = new Uint8Array(20); a[0] = bereich; a[1] = i >> 16; a[2] = (i >> 8) & 0xff; a[3] = i & 0xff;
    s.set(toHex(a), konto(i));
  }
  return s;
}

test('Selbstpruefung: Weicht der Baum ab, gilt die Neuberechnung, es wird gemeldet und neu aufgebaut', () => {
  const meldungen: string[] = [];
  let erster = true;
  const zb = new ZustandsBaum({
    neuerBaum: () => { if (erster) { erster = false; return new FalscherBaum(); } return new SmtBaum(); },
    melde: t => meldungen.push(t),
  });
  const s = zustandMit(50);
  assert.equal(hex(zb.wurzel(s)), hex(stateRootV6Voll(s)), 'trotz falschem Baum die richtige Wurzel');
  assert.equal(zb.abweichungen, 1);
  assert.equal(meldungen.length, 1);
  assert.match(meldungen[0], /ZUSTANDSBAUM WEICHT AB bei 50 Konten/);
  // Danach rechnet der neu aufgebaute, richtige Baum -- ohne weitere Meldung.
  s.set(adr(3), { balance: 77n, nonce: 1n });
  assert.equal(hex(zb.wurzel(s)), hex(stateRootV6Voll(s)));
  assert.equal(zb.abweichungen, 1);
  assert.equal(meldungen.length, 1);
});

test('Selbstpruefung: wann geprueft wird', () => {
  let uhr = 1_000_000;
  const zb = new ZustandsBaum({ jetzt: () => uhr, melde: () => { throw new Error('keine Abweichung erwartet'); } });

  // Bis SELBSTPRUEFUNG_IMMER_BIS: jedes Mal.
  const klein = zustandMit(SELBSTPRUEFUNG_IMMER_BIS, 1);
  zb.wurzel(klein); zb.wurzel(klein); zb.wurzel(klein);
  assert.equal(zb.pruefungen, 3);

  // Darueber bis SELBSTPRUEFUNG_ZEITWEISE_BIS: hoechstens einmal je Abstand.
  const mittel = zustandMit(SELBSTPRUEFUNG_IMMER_BIS + 1, 2);
  zb.wurzel(mittel);
  assert.equal(zb.pruefungen, 3, 'gerade erst geprueft (kleiner Zustand eben)');
  uhr += SELBSTPRUEFUNG_ABSTAND_MS;
  zb.wurzel(mittel);
  assert.equal(zb.pruefungen, 4, 'nach Ablauf des Abstands');
  uhr += SELBSTPRUEFUNG_ABSTAND_MS - 1;
  zb.wurzel(mittel);
  assert.equal(zb.pruefungen, 4, 'noch nicht wieder');
  uhr += 1;
  zb.wurzel(mittel);
  assert.equal(zb.pruefungen, 5);

  // Ueber SELBSTPRUEFUNG_ZEITWEISE_BIS: nie automatisch.
  const gross = zustandMit(SELBSTPRUEFUNG_ZEITWEISE_BIS + 1, 3);
  uhr += SELBSTPRUEFUNG_ABSTAND_MS * 10;
  assert.equal(hex(zb.wurzel(gross)), hex(stateRootV6Voll(gross)));
  assert.equal(zb.pruefungen, 5);
  assert.equal(zb.abweichungen, 0);
});
