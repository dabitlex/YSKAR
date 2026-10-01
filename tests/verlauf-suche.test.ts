import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sucheAus, bereich, zeitAus } from '../src/lib/api/suche.ts';
import { encodeAddress } from '../src/lib/core/address.ts';

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

test('leer und zu kurz: keine Suche', () => {
  assert.equal(sucheAus(null), null);
  assert.equal(sucheAus('   '), null);
  assert.equal(sucheAus('x'), null);
});

test('Ziffern: Blocknummer und TxID-Anfang, "#" nur Block', () => {
  const s = sucheAus('5871')!;
  assert.equal(s.hoehe, 5871);
  assert.equal(s.txLo, '5871' + '00'.repeat(30));
  assert.equal(s.txHi, '5871' + 'ff'.repeat(30));
  const nur = sucheAus('#5871')!;
  assert.equal(nur.hoehe, 5871);
  assert.equal(nur.txLo, null);
  // Drei Ziffern: zu kurz fuer eine TxID, aber eine Blocknummer.
  assert.equal(sucheAus('587')!.txLo, null);
  assert.equal(sucheAus('587')!.hoehe, 587);
});

test('TxID-Anfang mit ungerader Laenge: Halbbyte genau', () => {
  const s = sucheAus('1E1BE')!;     // Gross/klein egal
  assert.equal(s.txLo, '1e1be0' + '00'.repeat(29));
  assert.equal(s.txHi, '1e1bef' + 'ff'.repeat(29));
  const voll = 'ab'.repeat(32);
  assert.equal(sucheAus(voll)!.txLo, voll);
  assert.equal(sucheAus(voll)!.txHi, voll);
  assert.equal(sucheAus('ab'.repeat(33))!.txLo, null);   // zu lang fuer eine TxID
});

test('ganze Adresse: genau diese Bytes', () => {
  const raw = Uint8Array.from({ length: 20 }, (_, i) => i * 13);
  const s = sucheAus(encodeAddress(raw))!;
  assert.equal(s.gegenLo, hex(raw));
  assert.equal(s.gegenHi, hex(raw));
});

test('Adress-Anfang: Bereich enthaelt die Adresse, Nachbarn nicht', () => {
  const raw = Uint8Array.from({ length: 20 }, (_, i) => (i * 37 + 5) & 0xff);
  const text = encodeAddress(raw);
  for (const n of [6, 10, 20, 36]) {
    const s = sucheAus(text.slice(0, n))!;
    assert.ok(s.gegenLo! <= hex(raw) && hex(raw) <= s.gegenHi!, `Anfang ${n}`);
  }
  // Ein anderes erstes Byte liegt ausserhalb.
  const anders = Uint8Array.from(raw); anders[0] ^= 0x80;
  const s = sucheAus(text.slice(0, 10))!;
  assert.ok(!(s.gegenLo! <= hex(anders) && hex(anders) <= s.gegenHi!));
  // Ungueltige bech32-Zeichen ("b", "i", "o", "1") -> keine Adresssuche.
  assert.equal(sucheAus('ysr1bbbb')!.gegenLo, null);
});

test('Notiz: jeder Text ab 2 Zeichen', () => {
  assert.equal(sucheAus('Miete')!.memo, 'Miete');
  assert.equal(sucheAus('Miete')!.hoehe, null);
  assert.equal(sucheAus('Miete')!.txLo, null);
  assert.equal(sucheAus('  Kaffee  ')!.memo, 'Kaffee');
});

test('bereich: Bits auffuellen', () => {
  assert.deepEqual(bereich([1], 1), ['80', 'ff']);
  assert.deepEqual(bereich([0, 1, 0], 2), ['4000', '5fff']);
});

test('zeitAus: nur ganze Sekunden', () => {
  assert.equal(zeitAus('1790869492'), 1790869492);
  assert.equal(zeitAus('-1'), null);
  assert.equal(zeitAus('1.5'), null);
  assert.equal(zeitAus(null), null);
});

import { grenzen, tage, tagAus } from '../src/lib/wallet/zeitraum.ts';

test('Zeitraum: Tagesgrenzen in Ortszeit, [von, bis)', () => {
  const jetzt = new Date(2026, 8, 30, 15, 20);   // 30.09.2026 15:20
  const s = (d: Date) => Math.floor(d.getTime() / 1000);
  assert.deepEqual(grenzen({ art: 'immer' }, jetzt), [null, null]);
  assert.deepEqual(grenzen({ art: 'heute' }, jetzt), [s(new Date(2026, 8, 30)), s(new Date(2026, 9, 1))]);
  assert.deepEqual(grenzen({ art: 'tage7' }, jetzt), [s(new Date(2026, 8, 24)), s(new Date(2026, 9, 1))]);
  assert.deepEqual(grenzen({ art: 'monat' }, jetzt), [s(new Date(2026, 8, 1)), s(new Date(2026, 9, 1))]);
  // Eigener Zeitraum: "bis" schliesst den ganzen letzten Tag ein; vertauscht wird gerichtet.
  const e = grenzen({ art: 'eigen', von: '2026-09-19', bis: '2026-09-12' }, jetzt);
  assert.deepEqual(e, [s(new Date(2026, 8, 12)), s(new Date(2026, 8, 20))]);
  const [a, b] = tage({ art: 'eigen', von: '2026-09-12', bis: '2026-09-19' }, jetzt);
  assert.equal(a!.getDate(), 12); assert.equal(b!.getDate(), 19);
  // Nur ein Ende.
  assert.deepEqual(grenzen({ art: 'eigen', von: '', bis: '2026-09-12' }, jetzt), [null, s(new Date(2026, 8, 13))]);
  assert.equal(tagAus('2026-02-30'), null);
});
