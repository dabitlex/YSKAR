/**
 * Umlaufmenge fuer CoinMarketCap: erzeugt minus Null-Adresse, Text ohne Rundung.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mengenBerechnen, ysrText, atomarLesen, NULL_ADRESSE } from '../src/lib/api/umlauf.ts';

test('Null-Adresse ist die bekannte Burn-Adresse', () => {
  assert.equal(NULL_ADRESSE, 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw');
});

test('Stand Hoehe 8.196: Umlauf = erzeugt - Null-Adresse', () => {
  const m = mengenBerechnen(717237500000000n, 106697738404227n);
  assert.equal(ysrText(m.umlauf), '6105397.61595773');
  assert.equal(ysrText(m.erzeugt), '7172375');
  assert.equal(ysrText(m.hoechst), '21000000');
});

test('ysrText: Nachkommastellen ohne Rundung, Nullen am Ende weg', () => {
  assert.equal(ysrText(0n), '0');
  assert.equal(ysrText(1n), '0.00000001');
  assert.equal(ysrText(150000000n), '1.5');
  assert.equal(ysrText(87500000000n), '875');
});

test('ungueltige Eingaben werden abgelehnt', () => {
  assert.throws(() => mengenBerechnen(1n, 2n));
  assert.throws(() => ysrText(-1n));
  assert.throws(() => atomarLesen('1.5', 'x'));
  assert.throws(() => atomarLesen(undefined, 'x'));
  assert.equal(atomarLesen('106697738404227', 'x'), 106697738404227n);
  assert.equal(atomarLesen(42, 'x'), 42n);
});
