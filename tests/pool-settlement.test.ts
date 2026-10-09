/**
 * Pool-Abrechnung.
 *
 * Hier wird Geld aufgeteilt. Die wichtigste Eigenschaft ist deshalb keine
 * Funktion, sondern eine Invariante: Die Summe aller Ausgaben ist immer
 * exakt der Bruttobetrag. Keine Einheit entsteht, keine verschwindet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { abrechnen, gebuehrBetrag, MAX_FEE_BPS, MAX_MINERS_JE_BLOCK }
  from '../src/lib/pool/settlement.ts';
import { UNIT, MAX_COINBASE_OUTPUTS, DUST_LIMIT } from '../src/lib/core/params.ts';
import { toHex } from '../src/lib/core/codec.ts';

const adr = (n: number) => {
  const a = new Uint8Array(20);
  a[0] = (n >> 8) & 0xff; a[1] = n & 0xff;
  return a;
};
const A = adr(1), B = adr(2), C = adr(3), D = adr(4), POOL = adr(999);

const summe = (o: { amount: bigint }[]) => o.reduce((s, x) => s + x.amount, 0n);

// ------------------------------------------------------------------ Gebühr

test('Die Gebühr wird abgerundet — zugunsten der Miner', () => {
  // 875 YSR bei 2 % sind exakt 17,5 YSR. Bei krummen Beträgen fällt der
  // Rest den Arbeitenden zu, nicht dem Betreiber.
  assert.equal(gebuehrBetrag(875n * UNIT, 200), 17_50000000n);
  assert.equal(gebuehrBetrag(999n, 100), 9n);       // 9,99 -> 9
  assert.equal(gebuehrBetrag(1000n, 0), 0n);
});

test('Unzulässige Gebühren werden abgelehnt', () => {
  assert.throws(() => gebuehrBetrag(100n, -1), /zwischen/);
  assert.throws(() => gebuehrBetrag(100n, MAX_FEE_BPS + 1), /zwischen/);
  assert.throws(() => gebuehrBetrag(100n, 1.5), /zwischen/);
});

// ------------------------------------------------------------- Aufteilung

test('Anteile nach Arbeit, Summe geht exakt auf', () => {
  const brutto = 875n * UNIT;
  const r = abrechnen(brutto, [
    { to: A, work: 500n }, { to: B, work: 250n },
    { to: C, work: 150n }, { to: D, work: 100n },
  ], 200, POOL);

  assert.equal(r.fee, 17_50000000n);
  assert.equal(summe(r.outputs), brutto, 'keine Einheit darf verschwinden');

  const netto = brutto - r.fee;
  const find = (a: Uint8Array) =>
    r.outputs.find(o => toHex(o.to) === toHex(a))!.amount;
  assert.equal(find(A), netto / 2n);
  assert.equal(find(B), netto / 4n);
});

test('Die Summe geht auch bei krummen Anteilen exakt auf', () => {
  // Drei gleiche Anteile an einem nicht teilbaren Betrag: Der Rest muss
  // vergeben werden, nicht verschwinden.
  // (Betraege ueber DUST_LIMIT, sonst greift die Staubregel.)
  const brutto = 1_000n;
  const r = abrechnen(brutto, [
    { to: A, work: 1n }, { to: B, work: 1n }, { to: C, work: 1n },
  ], 0, null);
  assert.equal(summe(r.outputs), 1_000n);
  const betraege = r.outputs.map(o => o.amount).sort();
  assert.deepEqual(betraege, [333n, 333n, 334n]);
});

test('Der Rest geht an den größten Bruchteil, nicht an den Ersten', () => {
  // 1.001 im Verhaeltnis 7:3 ergibt 700,7 und 300,3. A hat den größten
  // Rest und muss die zusätzliche Einheit bekommen.
  const r = abrechnen(1_001n, [
    { to: A, work: 7n }, { to: B, work: 3n },
  ], 0, null);
  assert.equal(summe(r.outputs), 1_001n);
  const find = (a: Uint8Array) =>
    r.outputs.find(o => toHex(o.to) === toHex(a))!.amount;
  assert.equal(find(A), 701n);
  assert.equal(find(B), 300n);
});

test('Das Ergebnis hängt nicht von der Eingabereihenfolge ab', () => {
  const eingabe = [
    { to: C, work: 331n }, { to: A, work: 331n }, { to: B, work: 331n },
  ];
  const a = abrechnen(1000n, eingabe, 0, null);
  const b = abrechnen(1000n, [...eingabe].reverse(), 0, null);
  assert.deepEqual(
    a.outputs.map(o => [toHex(o.to), o.amount.toString()]),
    b.outputs.map(o => [toHex(o.to), o.amount.toString()]),
    'zwei Knoten müssen bei derselben Runde dasselbe herausbekommen');
});

test('Empfänger sind aufsteigend sortiert — die Kette verlangt es', () => {
  const r = abrechnen(1000n, [
    { to: D, work: 1n }, { to: A, work: 1n }, { to: C, work: 1n },
  ], 0, null);
  for (let i = 1; i < r.outputs.length; i++) {
    assert.ok(toHex(r.outputs[i - 1].to) < toHex(r.outputs[i].to));
  }
});

test('Zwei Sitzungen desselben Miners werden zusammengefasst', () => {
  // Die Coinbase erlaubt jede Adresse nur einmal, und mehrere Geräte auf
  // einer Adresse sind der Normalfall.
  const r = abrechnen(1000n, [
    { to: A, work: 300n }, { to: A, work: 200n }, { to: B, work: 500n },
  ], 0, null);
  assert.equal(r.outputs.length, 2);
  const find = (a: Uint8Array) =>
    r.outputs.find(o => toHex(o.to) === toHex(a))!.amount;
  assert.equal(find(A), 500n);
  assert.equal(find(B), 500n);
});

test('Ein mitminender Betreiber bekommt einen Eintrag, nicht zwei', () => {
  const r = abrechnen(100_000n, [
    { to: POOL, work: 500n }, { to: A, work: 500n },
  ], 200, POOL);
  assert.equal(r.outputs.length, 2);
  assert.equal(summe(r.outputs), 100_000n);
  // 100.000 brutto, 2.000 Gebühr, 98.000 verteilbar, halbe Arbeit also 49.000.
  const pool = r.outputs.find(o => toHex(o.to) === toHex(POOL))!;
  assert.equal(r.fee, 2_000n);
  assert.equal(pool.amount, 49_000n + 2_000n, 'Anteil plus Gebühr in einem Eintrag');
  const a = r.outputs.find(o => toHex(o.to) === toHex(A))!;
  assert.equal(a.amount, 49_000n);
});

// ------------------------------------------------------------ Ausgelassen

test('Wer nicht in den Block passt, geht in diesem Block leer aus -- die Kleinsten', () => {
  // Die Coinbase fasst 64 Empfänger. Mit Gebühr bleiben 63 Plätze.
  const viele = Array.from({ length: 80 }, (_, i) => ({
    to: adr(i + 1), work: BigInt(100 - i),
  }));
  const r = abrechnen(100_000n, viele, 200, POOL);

  assert.equal(r.outputs.length, MAX_MINERS_JE_BLOCK + 1);
  assert.equal(r.ausgelassen.length, 80 - MAX_MINERS_JE_BLOCK);
  assert.equal(summe(r.outputs), 100_000n);

  // Ausgelassen werden die mit der WENIGSTEN Arbeit. Sie bekommen in diesem
  // Block nichts; einen Ausgleich gibt es nicht (Issue #6).
  const kleinsteDabei = 100 - (MAX_MINERS_JE_BLOCK - 1);
  for (const a of r.ausgelassen) assert.ok(a.work < BigInt(kleinsteDabei));
  const raus = new Set(r.ausgelassen.map(a => a.to.join(',')));
  for (const o of r.outputs) assert.ok(!raus.has(o.to.join(',')), 'kein Ausgelassener hat eine Auszahlung');
});

test('Ohne Gebühr stehen alle 64 Plätze den Minern zu', () => {
  const viele = Array.from({ length: 70 }, (_, i) => ({
    to: adr(i + 1), work: BigInt(70 - i),
  }));
  const r = abrechnen(100_000n, viele, 0, null);
  assert.equal(r.outputs.length, MAX_COINBASE_OUTPUTS);
  assert.equal(r.ausgelassen.length, 70 - MAX_COINBASE_OUTPUTS);
});

// ------------------------------------------------------------------ Fehler

test('Eine Runde ohne Arbeit lässt sich nicht abrechnen', () => {
  assert.throws(() => abrechnen(1000n, [], 0, null), /keine Arbeit/);
  assert.throws(() => abrechnen(1000n, [{ to: A, work: 0n }], 0, null), /keine Arbeit/);
});

test('Eine Gebühr ohne Adresse wird abgelehnt', () => {
  assert.throws(() => abrechnen(100_000n, [{ to: A, work: 1n }], 200, null),
    /ohne Adresse/);
});

// ------------------------------------------------- Staubgrenze (Fassung 5)

test('Kein Anteil unter der Staubgrenze: wer darunter läge, geht in diesem Block leer aus', () => {
  // 875 YSR, ein großer Miner und einer mit einem Milliardstel der Arbeit.
  const brutto = 875n * 100_000_000n;
  const r = abrechnen(brutto, [
    { to: A, work: 1_000_000_000_000n }, { to: B, work: 1n },
  ], 0, null);
  assert.equal(summe(r.outputs), brutto, 'nichts entsteht, nichts verschwindet');
  assert.ok(r.outputs.every(o => o.amount >= DUST_LIMIT));
  assert.equal(r.outputs.length, 1);
  assert.deepEqual(r.ausgelassen.map(x => toHex(x.to)), [toHex(B)]);
});

test('Eine Gebühr unter der Staubgrenze geht an die Miner', () => {
  const r = abrechnen(1_000n, [{ to: A, work: 1n }], 200, POOL);
  assert.equal(r.fee, 0n);
  assert.deepEqual(r.outputs.map(o => o.amount), [1_000n]);
});

test('Über tausend zufällige Runden: keine Ausgabe unter der Staubgrenze, Summe exakt', () => {
  let saat = 7;
  const zufall = (n: number) => { saat = (saat * 1103515245 + 12345) & 0x7fffffff; return saat % n; };
  for (let i = 0; i < 1000; i++) {
    const n = 1 + zufall(70);
    const anteile = Array.from({ length: n }, (_, k) => ({ to: adr(k + 1), work: BigInt(1 + zufall(1 + zufall(1_000_000))) }));
    const brutto = BigInt(10_000 + zufall(1_000_000_000));
    const r = abrechnen(brutto, anteile, zufall(501), POOL);
    assert.equal(summe(r.outputs), brutto);
    assert.ok(r.outputs.length <= 64);
    for (const o of r.outputs) assert.ok(o.amount >= DUST_LIMIT, `Runde ${i}: ${o.amount}`);
  }
});

test('Die Invariante hält über tausend zufällige Runden', () => {
  // Der eigentliche Test. Egal wie krumm die Zahlen sind: Es entsteht und
  // verschwindet keine Einheit.
  let saat = 42;
  const zufall = (n: number) => {
    saat = (saat * 1103515245 + 12345) & 0x7fffffff;
    return saat % n;
  };
  for (let i = 0; i < 1000; i++) {
    const n = 1 + zufall(12);
    const anteile = Array.from({ length: n }, (_, k) => ({
      to: adr(k + 1), work: BigInt(1 + zufall(10_000)),
    }));
    const brutto = BigInt(1 + zufall(1_000_000_000));
    const fee = zufall(MAX_FEE_BPS + 1);
    const r = abrechnen(brutto, anteile, fee, POOL);
    assert.equal(summe(r.outputs), brutto,
      `Runde ${i}: ${summe(r.outputs)} statt ${brutto}`);
    for (const o of r.outputs) {
      assert.ok(o.amount > 0n, 'kein Empfänger mit Betrag null');
    }
    for (let j = 1; j < r.outputs.length; j++) {
      assert.ok(toHex(r.outputs[j - 1].to) < toHex(r.outputs[j].to));
    }
  }
});
