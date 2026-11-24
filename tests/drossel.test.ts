/**
 * Drossel: Token-Bucket je Schluessel, Tabelle begrenzt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Drossel } from '../src/lib/node/fullnode/Drossel.ts';

test('Vorrat geht auf einmal, danach nur noch die Rate', () => {
  let t = 0;
  const d = new Drossel({ rate: 2, vorrat: 5 }, 100, () => t);
  for (let i = 0; i < 5; i++) assert.equal(d.erlaubt('a'), true, `Anfrage ${i + 1}`);
  assert.equal(d.erlaubt('a'), false);
  assert.equal(d.abgewiesen, 1);
  assert.equal(d.wartezeit('a'), 1);
  t += 500; // eine halbe Sekunde = eine Marke
  assert.equal(d.erlaubt('a'), true);
  assert.equal(d.erlaubt('a'), false);
  t += 60_000; // lange Pause: Vorrat wieder voll, nicht mehr
  for (let i = 0; i < 5; i++) assert.equal(d.erlaubt('a'), true);
  assert.equal(d.erlaubt('a'), false);
});

test('Schluessel sind unabhaengig', () => {
  const t = 0;
  const d = new Drossel({ rate: 1, vorrat: 2 }, 100, () => t);
  assert.equal(d.erlaubt('a'), true); assert.equal(d.erlaubt('a'), true); assert.equal(d.erlaubt('a'), false);
  assert.equal(d.erlaubt('b'), true); assert.equal(d.erlaubt('b'), true);
});

test('Die Tabelle waechst nicht ueber die Grenze; der zuletzt benutzte bleibt', () => {
  const t = 0;
  const d = new Drossel({ rate: 1, vorrat: 1 }, 3, () => t);
  d.erlaubt('a'); d.erlaubt('b'); d.erlaubt('c');
  assert.equal(d.erlaubt('a'), false);      // a ist leer und jetzt zuletzt benutzt
  d.erlaubt('d');                           // verdraengt b, den aeltesten
  assert.equal(d.groesse(), 3);
  assert.equal(d.erlaubt('a'), false, 'a darf nicht herausgefallen sein');
  for (let i = 0; i < 10_000; i++) d.erlaubt(`x${i}`);
  assert.equal(d.groesse(), 3);
});

test('vergiss und unsinnige Werte', () => {
  const d = new Drossel({ rate: 1, vorrat: 1 }, 10, () => 0);
  d.erlaubt('a'); assert.equal(d.erlaubt('a'), false);
  d.vergiss('a'); assert.equal(d.erlaubt('a'), true);
  assert.equal(d.wartezeit('unbekannt'), 0);
  assert.throws(() => new Drossel({ rate: 0, vorrat: 1 }));
  assert.throws(() => new Drossel({ rate: 1, vorrat: 0 }));
  assert.throws(() => new Drossel({ rate: Number.NaN, vorrat: 5 }));
});
