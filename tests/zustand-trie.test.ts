/**
 * Der Zustand als Trie (src/lib/core/zustand.ts) verhaelt sich wie eine Map
 * -- in jeder Folge von Aenderungen, Kopien und Vergleichen. Geprueft gegen
 * eine gewoehnliche Map als Referenz, mit Zufall und festem Startwert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Zustand, unterschiede, type Konto } from '../src/lib/core/zustand.ts';

/** Kleiner Zufallsgenerator mit festem Startwert (xorshift32). */
function zufall(start: number) {
  let x = start >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x1_0000_0000; };
}

const HEX = '0123456789abcdef';
/** Schluessel mit vielen gemeinsamen Anfaengen -- damit der Trie tief wird und sich teilt. */
function schluessel(r: () => number): string {
  const lang = r() < 0.3;
  const n = lang ? 66 : 40;
  let s = lang ? '01' : '';
  const gemeinsam = Math.floor(r() * 8);
  for (let i = s.length; i < n; i++) s += i < gemeinsam + (lang ? 2 : 0) ? 'a' : HEX[Math.floor(r() * 16)];
  return s;
}

function gleichWieMap(z: Zustand, m: Map<string, Konto>, was: string) {
  assert.equal(z.size, m.size, `${was}: size`);
  let summe = 0n;
  for (const [k, v] of m) {
    const x = z.get(k);
    assert.ok(x, `${was}: ${k} fehlt`);
    assert.equal(x!.balance, v.balance); assert.equal(x!.nonce, v.nonce);
    assert.ok(z.has(k));
    summe += v.balance;
  }
  assert.equal(z.summe(), summe, `${was}: summe`);
  const keys = [...z.keys()];
  assert.equal(keys.length, m.size);
  assert.deepEqual(keys, [...keys].sort((x, y) => x.length - y.length || (x < y ? -1 : x > y ? 1 : 0)), `${was}: sortiert`);
  assert.deepEqual(new Set(keys), new Set(m.keys()));
}

test('Zustand: zufaellige Folgen von set/delete/clone -- wie eine Map', () => {
  for (let lauf = 1; lauf <= 40; lauf++) {
    const r = zufall(lauf * 7919);
    const pool: string[] = [];
    let z = new Zustand();
    let m = new Map<string, Konto>();
    const alte: { z: Zustand; m: Map<string, Konto> }[] = [];
    for (let i = 0; i < 600; i++) {
      const w = r();
      if (w < 0.55 || pool.length === 0) {
        const k = pool.length > 0 && r() < 0.4 ? pool[Math.floor(r() * pool.length)] : schluessel(r);
        if (!pool.includes(k)) pool.push(k);
        const v = { balance: BigInt(Math.floor(r() * 1e9)), nonce: BigInt(Math.floor(r() * 50)) };
        z.set(k, v); m.set(k, v);
      } else if (w < 0.85) {
        const k = r() < 0.9 ? pool[Math.floor(r() * pool.length)] : schluessel(r);
        assert.equal(z.delete(k), m.delete(k), 'delete-Rueckgabe');
      } else if (w < 0.95) {
        // Kopie: beide entwickeln sich danach unabhaengig.
        alte.push({ z: z.kopie(), m: new Map(m) });
      } else if (alte.length > 0) {
        const a = alte[Math.floor(r() * alte.length)];
        z = a.z.kopie(); m = new Map(a.m);
      }
    }
    gleichWieMap(z, m, `Lauf ${lauf}`);
    for (const [i, a] of alte.entries()) gleichWieMap(a.z, a.m, `Lauf ${lauf}, Kopie ${i}`);
  }
});

test('unterschiede: genau die geaenderten Konten -- auch zwischen entfernten Kopien', () => {
  for (let lauf = 1; lauf <= 30; lauf++) {
    const r = zufall(lauf * 104729);
    const pool: string[] = [];
    const a = new Zustand();
    for (let i = 0; i < 400; i++) {
      const k = schluessel(r); pool.push(k);
      a.set(k, { balance: BigInt(i + 1), nonce: 0n });
    }
    const b = a.kopie();
    const erwartet = new Map<string, Konto | null>();
    for (let i = 0; i < 80; i++) {
      const w = r();
      if (w < 0.4) {
        const k = pool[Math.floor(r() * pool.length)];
        const v = { balance: BigInt(Math.floor(r() * 1000)), nonce: 1n };
        b.set(k, v);
      } else if (w < 0.7) {
        const k = pool[Math.floor(r() * pool.length)];
        b.delete(k);
      } else {
        const k = schluessel(r); pool.push(k);
        b.set(k, { balance: 5n, nonce: 0n });
      }
    }
    // Referenz: Vergleich ueber alle Schluessel.
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k), y = b.get(k);
      if (!y) { if (x) erwartet.set(k, null); continue; }
      if (!x || x.balance !== y.balance || x.nonce !== y.nonce) erwartet.set(k, y);
    }
    const gemeldet = new Map<string, Konto | null>();
    unterschiede(a.wurzel, b.wurzel, (k, v) => { assert.ok(!gemeldet.has(k), `doppelt: ${k}`); gemeldet.set(k, v); });
    assert.equal(gemeldet.size, erwartet.size, `Lauf ${lauf}: Anzahl`);
    for (const [k, v] of erwartet) {
      const g = gemeldet.get(k);
      if (v === null) assert.equal(g, null, k);
      else { assert.ok(g); assert.equal(g!.balance, v.balance); assert.equal(g!.nonce, v.nonce); }
    }
    // Und rueckwaerts.
    let rueck = 0;
    unterschiede(b.wurzel, a.wurzel, () => { rueck++; });
    assert.equal(rueck, erwartet.size);
  }
});

test('Zustand: gleiche Inhalte haben dieselbe Form, egal in welcher Reihenfolge', () => {
  const r = zufall(42);
  const keys = Array.from({ length: 300 }, () => schluessel(r));
  const a = new Zustand(), b = new Zustand();
  keys.forEach((k, i) => a.set(k, { balance: BigInt(i), nonce: 0n }));
  [...keys].reverse().forEach(k => b.set(k, a.get(k)!));
  // Einige rein und wieder raus.
  for (let i = 0; i < 50; i++) { const k = schluessel(r); b.set(k, { balance: 1n, nonce: 1n }); b.delete(k); }
  let n = 0;
  unterschiede(a.wurzel, b.wurzel, () => { n++; });
  assert.equal(n, 0);
});

test('Zustand: Konten sind eingefroren -- Aenderung an Ort und Stelle wirft', () => {
  const z = new Zustand();
  z.set('ab'.repeat(20), { balance: 1n, nonce: 0n });
  const k = z.get('ab'.repeat(20))!;
  assert.throws(() => { (k as { balance: bigint }).balance = 2n; });
  assert.equal(z.get('ab'.repeat(20))!.balance, 1n);
});

test('Zustand: Map-Schnittstelle (Iteration, forEach, new Map, clear)', () => {
  const z = new Zustand();
  z.set('11'.repeat(20), { balance: 3n, nonce: 1n }).set('01' + '22'.repeat(32), { balance: 4n, nonce: 0n });
  assert.ok(z instanceof Map);
  const m = new Map(z);
  assert.equal(m.size, 2);
  let n = 0; z.forEach((v, k, self) => { n++; assert.equal(self, z); assert.ok(k.length === 40 || k.length === 66); });
  assert.equal(n, 2);
  assert.equal([...z.values()].reduce((s, v) => s + v.balance, 0n), 7n);
  z.clear();
  assert.equal(z.size, 0);
  assert.equal(z.get('11'.repeat(20)), undefined);
  assert.throws(() => z.set('XY', { balance: 1n, nonce: 0n }), /Hex/);
});

test('Zustand.aus: dieselbe Form wie Einzel-set, spaetere gewinnen', () => {
  const r = zufall(7);
  const eintraege: [string, Konto][] = [];
  for (let i = 0; i < 500; i++) eintraege.push([schluessel(r), { balance: BigInt(i), nonce: 0n }]);
  eintraege.push([eintraege[3][0], { balance: 999n, nonce: 9n }]);
  const a = Zustand.aus(eintraege);
  const b = new Zustand();
  for (const [k, v] of eintraege) b.set(k, v);
  let n = 0; unterschiede(a.wurzel, b.wurzel, () => { n++; });
  assert.equal(n, 0);
  assert.equal(a.get(eintraege[3][0])!.balance, 999n);
  assert.equal(a.size, b.size);
  assert.equal(Zustand.aus([]).size, 0);
});

test('Zustand: eine Rohadresse, die Anfang einer anderen ist (20 Byte vor 33 Byte)', () => {
  const v0 = '01' + 'ab'.repeat(19);                  // 20 Byte, beginnt mit 0x01
  const v1a = v0 + '11'.repeat(13);                   // 33 Byte, beginnt mit v0
  const v1b = v0 + '22'.repeat(13);
  for (const reihe of [[v0, v1a, v1b], [v1a, v1b, v0], [v1a, v0, v1b]]) {
    const z = new Zustand();
    const m = new Map<string, Konto>();
    reihe.forEach((k, i) => { z.set(k, { balance: BigInt(i + 1), nonce: 0n }); m.set(k, { balance: BigInt(i + 1), nonce: 0n }); });
    gleichWieMap(z, m, reihe.join(','));
    const kopie = z.kopie();
    assert.ok(z.delete(v0)); m.delete(v0);
    gleichWieMap(z, m, 'nach delete');
    let n = 0; unterschiede(kopie.wurzel, z.wurzel, (k, v) => { n++; assert.equal(k, v0); assert.equal(v, null); });
    assert.equal(n, 1);
    assert.equal(Zustand.aus(reihe.map(k => [k, { balance: 1n, nonce: 0n }] as [string, Konto])).size, 3);
  }
});

test('Zustand: ungueltige Schluessel -- get/has/delete wie bei einer Map, set wirft', () => {
  const z = new Zustand();
  z.set('aa'.repeat(20), { balance: 1n, nonce: 0n });
  assert.equal(z.get('XYZ'), undefined);
  assert.equal(z.has(''), false);
  assert.equal(z.delete('abc'), false);
  assert.throws(() => z.set('a', { balance: 1n, nonce: 0n }), /Hex/);
  assert.throws(() => z.set('aa'.repeat(256), { balance: 1n, nonce: 0n }), /Hex/);
});
