/**
 * PPLNS — Pay Per Last N Shares.
 *
 * Der Kern ist eine einzige Eigenschaft: Der Zeitpunkt, zu dem Arbeit
 * geleistet wurde, darf für die Bezahlung keine Rolle spielen. Genau daran
 * scheitert die proportionale Verteilung je Runde.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fensterAnteile, fensterGroesse, ShareLog, PPLNS_FAKTOR }
  from '../src/lib/pool/pplns.ts';
import { abrechnen } from '../src/lib/pool/settlement.ts';
import { toHex } from '../src/lib/core/codec.ts';

const adr = (n: number) => {
  const a = new Uint8Array(20);
  a[0] = (n >> 8) & 0xff; a[1] = n & 0xff;
  return a;
};
const A = adr(1), B = adr(2), C = adr(3);
const work = (a: Uint8Array, w: bigint) => ({ to: a, work: w });
const von = (anteile: { to: Uint8Array; work: bigint }[], a: Uint8Array) =>
  anteile.find(x => toHex(x.to) === toHex(a))?.work ?? 0n;

// -------------------------------------------------------------- Das Fenster

test('Das Fenster nimmt die jüngste Arbeit, nicht die älteste', () => {
  const log = [work(A, 100n), work(B, 100n), work(C, 100n)];
  const r = fensterAnteile(log, 200n);
  assert.equal(von(r, C), 100n);
  assert.equal(von(r, B), 100n);
  assert.equal(von(r, A), 0n, 'fällt aus dem Fenster');
});

test('Der älteste Eintrag im Fenster zählt nur anteilig', () => {
  // Ihn ganz mitzunehmen würde die tatsächliche Fenstergröße davon abhängig
  // machen, wie groß zufällig der Share an der Grenze war.
  const log = [work(A, 100n), work(B, 100n)];
  const r = fensterAnteile(log, 150n);
  assert.equal(von(r, B), 100n);
  assert.equal(von(r, A), 50n, 'genau der Rest, nicht der ganze Share');
  assert.equal(von(r, A) + von(r, B), 150n, 'das Fenster ist exakt gefüllt');
});

test('Weniger Arbeit als das Fenster fasst ist kein Fehler', () => {
  // Normalfall in den ersten Stunden eines Pools.
  const r = fensterAnteile([work(A, 10n)], 1000n);
  assert.equal(von(r, A), 10n);
});

test('Ein leerer Verlauf ergibt nichts', () => {
  assert.equal(fensterAnteile([], 100n).length, 0);
});

test('Die Fenstergröße folgt der Netz-Difficulty', () => {
  assert.equal(fensterGroesse(50_000n), 50_000n * PPLNS_FAKTOR);
  assert.throws(() => fensterGroesse(0n), /positiv/);
});

// ------------------------------------------------- Der eigentliche Zweck

test('Pool-Hopping bringt nichts', () => {
  /*
    Zwei Miner leisten insgesamt dieselbe Arbeit.

    A mint durchgehend: 10 Einheiten in jedem der 20 Abschnitte.
    B mint nur direkt nach einem Blockfund: 100 Einheiten in Abschnitt 0
      und 100 in Abschnitt 10 -- also dort, wo eine Runde neu beginnt.

    Beide leisten 200 Einheiten. Mit PPLNS bekommen sie über die Zeit
    denselben Anteil, weil es keine Rundengrenze gibt, die B ausnutzen
    könnte.
  */
  const log: { to: Uint8Array; work: bigint }[] = [];
  for (let i = 0; i < 20; i++) {
    log.push(work(A, 10n));
    if (i === 0 || i === 10) log.push(work(B, 100n));
  }

  // Fenster über den gesamten Verlauf: beide haben 200 geleistet.
  const alles = fensterAnteile(log, 400n);
  assert.equal(von(alles, A), 200n);
  assert.equal(von(alles, B), 200n);
  assert.equal(von(alles, A), von(alles, B),
    'gleiche Arbeit, gleicher Anteil -- unabhängig vom Zeitpunkt');
});

test('Ein Blockfund setzt das Fenster nicht zurück', () => {
  // Das ist der Unterschied zur proportionalen Verteilung. Dort begänne
  // nach jedem Fund eine neue Zählung; hier wandert das Fenster einfach
  // weiter.
  const log = [work(A, 100n), work(B, 100n)];
  const vorFund = fensterAnteile(log, 200n);

  // Block gefunden, danach arbeitet nur noch B ein wenig weiter.
  log.push(work(B, 20n));
  const nachFund = fensterAnteile(log, 200n);

  assert.equal(von(vorFund, A), 100n);
  assert.equal(von(nachFund, A), 80n,
    'A verliert nur, was aus dem Fenster fällt -- nicht alles');
  assert.equal(von(nachFund, B), 120n);
});

test('Wer aufhört, bekommt noch eine Weile etwas — und dann nichts mehr', () => {
  // Die Kehrseite des Verfahrens, und sie ist fair: Die Arbeit wirkt
  // genauso lange nach, wie sie beim Einstieg gefehlt hat.
  const log = [work(A, 100n)];
  assert.equal(von(fensterAnteile(log, 100n), A), 100n);

  for (let i = 0; i < 10; i++) log.push(work(B, 20n));
  assert.equal(von(fensterAnteile(log, 100n), A), 0n, 'irgendwann ist es vorbei');
});

// ---------------------------------------------- Zusammenspiel mit der Abrechnung

test('Fenster und Abrechnung ergeben zusammen eine exakte Aufteilung', () => {
  const log = [
    work(A, 300n), work(B, 100n), work(A, 200n), work(C, 400n),
  ];
  const anteile = fensterAnteile(log, 1000n);
  const brutto = 875n * 100_000_000n;
  const r = abrechnen(brutto, anteile, 200, adr(999));

  let summe = 0n;
  for (const o of r.outputs) summe += o.amount;
  assert.equal(summe, brutto, 'keine Einheit darf verschwinden');
  assert.equal(r.fee, brutto * 200n / 10_000n);
});

// ----------------------------------------------------------------- ShareLog

test('Der Verlauf wächst nicht unbegrenzt', () => {
  const log = new ShareLog(3n);
  for (let i = 0; i < 500; i++) log.add(A, 100n);
  assert.equal(log.gesamt(), 50_000n);

  const fenster = 1000n;
  log.aufraeumen(fenster);
  // Behalten wird das Dreifache des Fensters, also 3000 Einheiten.
  assert.ok(log.gesamt() <= 3000n + 100n, `noch ${log.gesamt()}`);
  assert.ok(log.gesamt() >= 3000n, 'aber nicht zu wenig');
  // Und das Fenster selbst bleibt vollständig bedienbar.
  const r = log.anteile(fenster);
  assert.equal(r.reduce((s, x) => s + x.work, 0n), fenster);
});

test('Aufräumen mit Reserve verschluckt keine Arbeit, die noch zählt', () => {
  // Steigt die Difficulty, wächst das Fenster. Die Reserve fängt das ab.
  const log = new ShareLog(3n);
  for (let i = 0; i < 100; i++) log.add(A, 100n);
  log.aufraeumen(1000n);                 // Reserve: 3000 behalten
  const r = log.anteile(3000n);          // Difficulty verdreifacht
  assert.equal(r.reduce((s, x) => s + x.work, 0n), 3000n);
});

test('Der Verlauf lässt sich sichern und wiederherstellen', () => {
  const a = new ShareLog();
  a.add(A, 100n); a.add(B, 50n);
  const b = new ShareLog();
  b.laden(a.exportieren());
  assert.equal(b.gesamt(), 150n);
  assert.deepEqual(
    b.anteile(200n).map(x => [toHex(x.to), x.work.toString()]),
    a.anteile(200n).map(x => [toHex(x.to), x.work.toString()]));
});
