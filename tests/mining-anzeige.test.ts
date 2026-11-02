/**
 * Mining-Hauptansicht (Redesign Paket 3): Schaetzung je Pool-Block und
 * sichtbare Fehlermeldung. Die Regeln stammen unveraendert aus dem alten
 * MiningTab.tsx; diese Tests halten sie fest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anteilJeBlock, fehlerAnzeige } from '../src/components/mining/anzeige.ts';

test('Anteil: nur waehrend des Minings und mit Pool-Leistung', () => {
  const basis = { mining: true, hashrate: 2_000, poolRate: 1_000_000, belohnung: 875, feeBps: 100 };
  assert.equal(anteilJeBlock({ ...basis, mining: false }), null);
  assert.equal(anteilJeBlock({ ...basis, poolRate: null }), null);
  assert.equal(anteilJeBlock({ ...basis, poolRate: 0 }), null);
  assert.equal(anteilJeBlock({ ...basis, hashrate: 0 }), null);
});

test('Anteil: Leistung ÷ Pool-Leistung × Belohnung − Gebuehr', () => {
  const a = anteilJeBlock({ mining: true, hashrate: 2_000, poolRate: 1_000_000, belohnung: 875, feeBps: 100 });
  assert.ok(a !== null && Math.abs(a - 0.002 * 875 * 0.99) < 1e-12);
});

test('Anteil: nie mehr als die ganze Belohnung', () => {
  assert.equal(anteilJeBlock({ mining: true, hashrate: 5e9, poolRate: 1e9, belohnung: 875, feeBps: null }), 875);
});

const f = (o: Partial<Parameters<typeof fehlerAnzeige>[0]>) => fehlerAnzeige({
  fehler: null, mining: false, modus: 'pool', vollGezeigt: false, ueberholt: null, poolOffen: false, ...o,
});

test('Fehler: ohne Fehler nichts', () => {
  assert.equal(f({}), null);
});

test('Fehler: Pool voll waehrend des Minings', () => {
  assert.deepEqual(f({ fehler: 'pool_full', mining: true }), { art: 'voll' });
});

test('Fehler: Pool voll nach dem Anhalten, schon angezeigt -> nichts', () => {
  assert.equal(f({ fehler: 'pool_full', vollGezeigt: true }), null);
  assert.equal(f({ fehler: 'pool_full', modus: 'solo' }), null);
  assert.equal(f({ fehler: 'pool_full', ueberholt: 'pool_full', poolOffen: true }), null);
});

test('Fehler: Pool voll nach dem Anhalten, nirgends angezeigt -> voll', () => {
  assert.deepEqual(f({ fehler: 'pool_full' }), { art: 'voll' });
});

test('Fehler: verlorene Sitzung nach dem Anhalten im Pool -> nichts', () => {
  assert.equal(f({ fehler: 'session_inactive' }), null);
  assert.deepEqual(f({ fehler: 'session_inactive', mining: true }), { art: 'text', text: 'session_inactive' });
  assert.deepEqual(f({ fehler: 'session_inactive', modus: 'solo' }), { art: 'text', text: 'session_inactive' });
});

test('Fehler: alles andere wie gemeldet', () => {
  assert.deepEqual(f({ fehler: 'Netz nicht erreichbar' }), { art: 'text', text: 'Netz nicht erreichbar' });
});
