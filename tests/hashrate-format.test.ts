/**
 * Hashrate-Anzeige (Redesign Paket 5): Dezimalzeichen der Sprache in der
 * App, ohne Sprache wie bisher mit Punkt (Benachrichtigung, Widget).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashrateTeile, hashrateText } from '../src/lib/format/hashrate.ts';

test('ohne Sprache: Punkt wie bisher', () => {
  assert.deepEqual(hashrateTeile(52_640_000), { wert: '52.64', einheit: 'MH/s' });
  assert.equal(hashrateText(1_500), '1.5 kH/s');
});

test('Deutsch: Komma, keine Tausenderpunkte', () => {
  assert.deepEqual(hashrateTeile(52_640_000, 'de-DE'), { wert: '52,64', einheit: 'MH/s' });
  assert.equal(hashrateText(1_500, 'de-DE'), '1,5 kH/s');
  assert.equal(hashrateText(999_990_000_000, 'de-DE'), '999,99 GH/s');
});

test('Englisch: Punkt', () => {
  assert.equal(hashrateText(52_640_000, 'en-US'), '52.64 MH/s');
});

test('Grenzfaelle unveraendert', () => {
  assert.equal(hashrateText(null, 'de-DE'), '—');
  assert.deepEqual(hashrateTeile(0, 'de-DE'), { wert: '0', einheit: 'H/s' });
  assert.deepEqual(hashrateTeile(512, 'de-DE'), { wert: '512', einheit: 'H/s' });
});
