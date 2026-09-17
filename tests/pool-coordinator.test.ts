/**
 * Pool-Koordinator.
 *
 * Hier geht es um das, was der Betreiber darf — und vor allem um das, was
 * er nicht mehr ändern kann, nachdem Arbeit geleistet wurde.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PoolCoordinator, gebuehrText } from '../src/lib/pool/PoolCoordinator.ts';
import { coinbaseTotal, TX_COINBASE } from '../src/lib/core/tx.ts';
import { rewardAt, COINBASE_V2, UNIT } from '../src/lib/core/params.ts';
import { toHex } from '../src/lib/core/codec.ts';

const adr = (n: number) => {
  const a = new Uint8Array(20);
  a[0] = (n >> 8) & 0xff; a[1] = n & 0xff;
  return a;
};
const A = adr(1), B = adr(2), POOL = adr(999);
const HOEHE = 2000;          // ab der Aktivierungshöhe
const DIFF = 50_000n;

const pool = (feeBps = 200) => new PoolCoordinator({
  name: 'Testpool', feeBps, payoutAddress: POOL,
});

// ------------------------------------------------------------------ Gebühr

test('Die Gebühr liegt zwischen 0 und 5 Prozent', () => {
  assert.doesNotThrow(() => pool(0));
  assert.doesNotThrow(() => pool(500));
  assert.throws(() => pool(501), /0 und 500/);
  assert.throws(() => pool(-1), /0 und 500/);
  assert.equal(gebuehrText(250), '2,50 %');
  assert.equal(gebuehrText(0), '0,00 %');
});

test('Eine Gebühr ohne Auszahlungsadresse wird abgelehnt', () => {
  assert.throws(() => new PoolCoordinator({
    name: 'x', feeBps: 100, payoutAddress: null,
  }), /ohne Auszahlungsadresse/);
  // Ohne Gebühr braucht es keine.
  assert.doesNotThrow(() => new PoolCoordinator({
    name: 'x', feeBps: 0, payoutAddress: null,
  }));
});

test('Eine Gebührenänderung wirkt erst ab dem nächsten Block', () => {
  // Die Arbeit im aktuellen Fenster wurde unter der alten Gebühr geleistet.
  // Sie nachträglich zu erhöhen wäre ein Griff in fremde Taschen.
  const p = pool(100);
  p.share(A, 1000n);
  p.setzeGebuehr(500);

  const jetzt = p.coinbase(HOEHE, 0n, DIFF)!;
  assert.equal(jetzt.feeBps, 100, 'noch die alte Gebühr');
  assert.equal(jetzt.fee, rewardAt(HOEHE) * 100n / 10_000n);

  p.nachBlock(DIFF);
  const danach = p.coinbase(HOEHE + 1, 0n, DIFF)!;
  assert.equal(danach.feeBps, 500, 'jetzt die neue');
});

// -------------------------------------------------------------- Coinbase

test('Die Coinbase zahlt alle Beteiligten direkt aus', () => {
  const p = pool(200);
  p.share(A, 600n);
  p.share(B, 400n);

  const r = p.coinbase(HOEHE, 0n, DIFF)!;
  assert.equal(r.coinbase.type, TX_COINBASE);
  assert.equal(r.coinbase.version, COINBASE_V2);
  assert.equal(coinbaseTotal(r.coinbase), rewardAt(HOEHE),
    'die Summe muss exakt dem Reward entsprechen');

  // Aufsteigend sortiert — die Kette nimmt nur diese Reihenfolge an.
  for (let i = 1; i < r.coinbase.outputs.length; i++) {
    assert.ok(toHex(r.coinbase.outputs[i - 1].to) < toHex(r.coinbase.outputs[i].to));
  }
  // Der Pool hält nie fremdes Geld: Sein Anteil ist genau die Gebühr.
  const anPool = r.coinbase.outputs.find(o => toHex(o.to) === toHex(POOL))!;
  assert.equal(anPool.amount, r.fee);
});

test('Gebühren der Transaktionen gehören zum Bruttobetrag', () => {
  const p = pool(0);
  p.share(A, 100n);
  const gebuehren = 12_345n;
  const r = p.coinbase(HOEHE, gebuehren, DIFF)!;
  assert.equal(coinbaseTotal(r.coinbase), rewardAt(HOEHE) + gebuehren);
});

test('Ohne Arbeit im Fenster gibt es keine Pool-Coinbase', () => {
  // Direkt nach dem Start. Der Aufrufer baut dann eine gewöhnliche
  // Coinbase der Fassung 1 — ein Block ohne Empfänger wäre ungültig.
  const p = pool(200);
  assert.equal(p.coinbase(HOEHE, 0n, DIFF), null);
});

// ---------------------------------------------------------------- PPLNS

test('Ein Blockfund leert das Fenster nicht', () => {
  // Der Unterschied zur proportionalen Verteilung, und der Grund, warum
  // Pool-Hopping nichts bringt.
  const p = pool(0);
  p.share(A, 40_000n);
  const vorher = p.arbeitGesamt();

  p.coinbase(HOEHE, 0n, DIFF);
  p.nachBlock(DIFF);

  assert.equal(p.arbeitGesamt(), vorher, 'die Arbeit gilt weiter');
  const r = p.coinbase(HOEHE + 1, 0n, DIFF)!;
  assert.equal(r.coinbase.outputs.length, 1);
});

test('Alte Arbeit fällt irgendwann heraus', () => {
  const p = pool(0);
  p.share(A, 100_000n);
  // Viel neuere Arbeit von B schiebt A aus dem Fenster.
  for (let i = 0; i < 20; i++) p.share(B, 100_000n);
  p.nachBlock(DIFF);

  const anteile = p.fenster(DIFF);
  assert.equal(anteile.length, 1);
  assert.equal(toHex(anteile[0].to), toHex(B));
});

test('Der Verlauf übersteht einen Neustart', () => {
  const a = pool(200);
  a.share(A, 500n);
  a.share(B, 500n);

  const b = pool(200);
  b.laden(a.exportieren());
  assert.equal(b.arbeitGesamt(), 1000n);
  assert.deepEqual(
    b.coinbase(HOEHE, 0n, DIFF)!.coinbase.outputs.map(o => o.amount.toString()),
    a.coinbase(HOEHE, 0n, DIFF)!.coinbase.outputs.map(o => o.amount.toString()));
});

test('Die Auszahlungsadresse wird beim Share festgeschrieben', () => {
  // Nicht erst bei der Abrechnung nachgeschlagen — sonst ließe sich Arbeit
  // nachträglich umleiten.
  const p = pool(0);
  p.share(A, 500n);
  p.share(B, 500n);
  const r = p.coinbase(HOEHE, 0n, DIFF)!;
  const adressen = r.coinbase.outputs.map(o => toHex(o.to)).sort();
  assert.deepEqual(adressen, [toHex(A), toHex(B)].sort());
});

test('Ein mitminender Betreiber bekommt Anteil und Gebühr in einem Eintrag', () => {
  const p = pool(200);
  p.share(POOL, 500n);
  p.share(A, 500n);
  const r = p.coinbase(HOEHE, 0n, DIFF)!;
  assert.equal(r.coinbase.outputs.length, 2, 'keine doppelte Adresse');
  assert.equal(coinbaseTotal(r.coinbase), rewardAt(HOEHE));
});

test('Ein Pool ohne Gebühr ist zulässig', () => {
  const p = new PoolCoordinator({ name: 'Nulltarif', feeBps: 0, payoutAddress: null });
  p.share(A, 1000n);
  const r = p.coinbase(HOEHE, 0n, DIFF)!;
  assert.equal(r.fee, 0n);
  assert.equal(r.coinbase.outputs.length, 1);
  assert.equal(r.coinbase.outputs[0].amount, rewardAt(HOEHE));
});
