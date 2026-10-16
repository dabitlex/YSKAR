/**
 * Pool ab Konsensfassung 6: 255 Empfaenger je Coinbase (CONSENSUS_V6.md 6.5),
 * Plaetze je Hoehe, und der Auszahlungsmodus im Verzeichnis (13).
 *
 * Vor der Aktivierungshoehe muss alles bleiben, wie es ist: 64 Empfaenger,
 * 63 mit Gebuehr. Ein Pool, der vorher mehr verspricht, baut ungueltige
 * Bloecke.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { abrechnen, minerPlaetze, MAX_MINERS_JE_BLOCK, MAX_MINERS_JE_BLOCK_V6 } from '../src/lib/pool/settlement.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { standAusAntwort } from '../src/lib/pool/verzeichnis.ts';
import { MAX_COINBASE_OUTPUTS, MAX_COINBASE_OUTPUTS_V6, UNIT } from '../src/lib/core/params.ts';

const adr = (n: number) => {
  const a = new Uint8Array(20);
  a[0] = (n >> 8) & 0xff; a[1] = n & 0xff; a[19] = 1;
  return a;
};
const POOL = adr(9_999);
const anteile = (n: number) => Array.from({ length: n }, (_, i) => ({ to: adr(i + 1), work: BigInt(1_000 + i) }));

test('abrechnen: vor der Hoehe 64 Empfaenger, ab der Hoehe 255 -- die Summe stimmt immer', () => {
  const brutto = 875n * UNIT;
  const alt = abrechnen(brutto, anteile(300), 0, null);
  assert.equal(alt.outputs.length, MAX_COINBASE_OUTPUTS);
  assert.equal(alt.ausgelassen.length, 300 - MAX_COINBASE_OUTPUTS);

  const neu = abrechnen(brutto, anteile(300), 0, null, MAX_COINBASE_OUTPUTS_V6);
  assert.equal(neu.outputs.length, MAX_COINBASE_OUTPUTS_V6);
  assert.equal(neu.ausgelassen.length, 300 - MAX_COINBASE_OUTPUTS_V6);
  assert.equal(neu.outputs.reduce((s, o) => s + o.amount, 0n), brutto);

  // Mit Gebuehr: ein Platz gehoert dem Betreiber.
  const mitGebuehr = abrechnen(brutto, anteile(300), 100, POOL, MAX_COINBASE_OUTPUTS_V6);
  assert.equal(mitGebuehr.outputs.length, MAX_COINBASE_OUTPUTS_V6);
  assert.equal(mitGebuehr.ausgelassen.length, 300 - MAX_MINERS_JE_BLOCK_V6);
  assert.ok(mitGebuehr.outputs.some(o => o.to === POOL));
  // Aufsteigend sortiert, wie die Kette es verlangt.
  for (let i = 1; i < mitGebuehr.outputs.length; i++) {
    assert.ok(Buffer.compare(mitGebuehr.outputs[i - 1].to, mitGebuehr.outputs[i].to) < 0);
  }
});

test('abrechnen: eine Empfaengergrenze ausserhalb 1..255 wird abgelehnt', () => {
  assert.throws(() => abrechnen(UNIT, anteile(3), 0, null, 0), /Empfaengergrenze/);
  assert.throws(() => abrechnen(UNIT, anteile(3), 0, null, 256), /Empfaengergrenze/);
  assert.equal(minerPlaetze(64, 0), MAX_MINERS_JE_BLOCK + 1);
  assert.equal(minerPlaetze(64, 1), MAX_MINERS_JE_BLOCK);
  assert.equal(minerPlaetze(255, 100), MAX_MINERS_JE_BLOCK_V6);
});

test('PoolCoordinator.plaetze(hoehe): 64 vor, 255 ab der Aktivierungshoehe; ohne Hoehe die kleinere Grenze', () => {
  const p = new PoolCoordinator({ name: 'T', feeBps: 0, payoutAddress: null, v6Height: 100 });
  assert.equal(p.plaetze(99), 64);
  assert.equal(p.plaetze(100), 255);
  assert.equal(p.plaetze(), 64, 'ohne Hoehe nie mehr versprechen als sicher ist');

  const mitGebuehr = new PoolCoordinator({ name: 'T', feeBps: 100, payoutAddress: POOL, v6Height: 100 });
  assert.equal(mitGebuehr.plaetze(99), 63);
  assert.equal(mitGebuehr.plaetze(100), 254);

  // Eine Einstellung bis 255 ist erlaubt, wirkt vor der Hoehe aber nur bis 64.
  const begrenzt = new PoolCoordinator({ name: 'T', feeBps: 0, payoutAddress: null, v6Height: 100, maxMiner: 200 });
  assert.equal(begrenzt.plaetze(99), 64);
  assert.equal(begrenzt.plaetze(100), 200);
  assert.throws(() => new PoolCoordinator({ name: 'T', feeBps: 0, payoutAddress: null, maxMiner: 256 }), /1 und 255/);

  // Mainnet-Vorgabe: Hoehe nicht gesetzt, also ueberall 64.
  const main = new PoolCoordinator({ name: 'T', feeBps: 0, payoutAddress: null });
  assert.equal(main.plaetze(10 ** 9), 64);
});

test('PoolCoordinator.aufteilung ab der Hoehe zahlt bis 255 Adressen aus', () => {
  const p = new PoolCoordinator({ name: 'T', feeBps: 0, payoutAddress: null, v6Height: 100, pplnsFaktor: 1n });
  for (const a of anteile(300)) p.share(a.to, a.work);
  // Fenster = Difficulty x Faktor; gross genug fuer alle 300 Anteile.
  const vor = p.aufteilung(99, 0n, 10_000_000n)!;
  const nach = p.aufteilung(100, 0n, 10_000_000n)!;
  assert.equal(vor.outputs.length, 64);
  assert.equal(nach.outputs.length, 255);
});

test('Verzeichnis: 255 Plaetze und der Auszahlungsmodus werden gelesen; Unsinn wird null', () => {
  const e = { host: 'pool.example', name: 'P' };
  const s = standAusAntwort(e, 200, { plaetze: 255, belegt: 10, feeBps: 100, modus: 'batch' });
  assert.equal(s.status, 'offen');
  assert.equal(s.plaetze, 255);
  assert.equal(s.modus, 'batch');
  assert.equal(standAusAntwort(e, 200, { plaetze: 64, belegt: 1, modus: 'coinbase' }).modus, 'coinbase');
  assert.equal(standAusAntwort(e, 200, { plaetze: 64, belegt: 1 }).modus, null, 'aelterer Knoten');
  assert.equal(standAusAntwort(e, 200, { plaetze: 64, belegt: 1, modus: 'treuhand' }).modus, null);
  assert.equal(standAusAntwort(e, 200, { plaetze: 256, belegt: 1 }).status, 'keinPool', 'mehr als die Kette traegt');
});
