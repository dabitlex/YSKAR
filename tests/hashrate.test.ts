import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashrateTeile, hashrateText } from '../src/lib/format/hashrate.ts';

test('hashrate: ohne Sprache bleibt der Punkt', () => {
  assert.deepEqual(hashrateTeile(74_030_000), { wert: '74.03', einheit: 'MH/s' });
  assert.equal(hashrateText(1_500), '1.5 kH/s');
});

test('hashrate: mit Sprache steht das Dezimalzeichen der Sprache', () => {
  assert.deepEqual(hashrateTeile(74_030_000, 'de-DE'), { wert: '74,03', einheit: 'MH/s' });
  assert.equal(hashrateText(1_500, 'de-DE'), '1,5 kH/s');
  assert.equal(hashrateText(74_030_000, 'en-US'), '74.03 MH/s');
});

test('hashrate: feste Stellen und keine Tausendertrennung', () => {
  assert.equal(hashrateText(999_990_000, 'de-DE'), '999,99 MH/s');
  assert.equal(hashrateText(2_000_000_000, 'de-DE'), '2,00 GH/s');
});

test('hashrate: Raender', () => {
  assert.equal(hashrateText(null, 'de-DE'), '—');
  assert.deepEqual(hashrateTeile(0, 'de-DE'), { wert: '0', einheit: 'H/s' });
  assert.deepEqual(hashrateTeile(640, 'de-DE'), { wert: '640', einheit: 'H/s' });
});
