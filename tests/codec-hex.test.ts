/**
 * toHex ueber eine Tabelle muss Zeichen fuer Zeichen dasselbe liefern wie
 * die fruehere Form (Array.from/padStart/join) -- txids, Adressschluessel und
 * die Zustandswurzel haengen daran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHex, fromHex } from '../src/lib/core/codec.ts';

const frueher = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

test('toHex: jeder Bytewert, leere und lange Felder wie frueher', () => {
  const alle = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.equal(toHex(alle), frueher(alle));
  assert.equal(toHex(new Uint8Array(0)), '');
  let saat = 7;
  for (let n = 0; n < 200; n++) {
    const b = new Uint8Array(n * 3 + 1);
    for (let i = 0; i < b.length; i++) { saat = (saat * 1103515245 + 12345) % 2 ** 31; b[i] = saat & 0xff; }
    assert.equal(toHex(b), frueher(b));
    assert.deepEqual(fromHex(toHex(b)), b);
  }
});
