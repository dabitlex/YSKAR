/**
 * Y-Statuszeichen (Mini-App-Redesign, Paket 2): Zustand aus Wallet, Netz
 * und Mining. Die Funktion liest nur; sie entscheidet nichts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appStatus } from '../src/components/ys/status.ts';

test('alles an', () => {
  assert.deepEqual(appStatus({ gesichert: true, hoehe: 7530, mining: true }),
    { wallet: 'gesichert', netz: 'verbunden', mining: 'an' });
});

test('Woerter offen, Mining aus', () => {
  assert.deepEqual(appStatus({ gesichert: false, hoehe: 7530, mining: false }),
    { wallet: 'offen', netz: 'verbunden', mining: 'aus' });
});

test('ohne Blockhoehe ist das Netz getrennt', () => {
  for (const hoehe of [null, undefined, Number.NaN]) {
    assert.equal(appStatus({ gesichert: true, hoehe, mining: false }).netz, 'getrennt');
  }
});

test('Hoehe 0 (Genesis) zaehlt als verbunden', () => {
  assert.equal(appStatus({ gesichert: true, hoehe: 0, mining: false }).netz, 'verbunden');
});
