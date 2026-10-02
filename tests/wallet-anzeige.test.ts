import { test } from 'node:test';
import assert from 'node:assert/strict';

import { betragText, betragZahl, dezimalZeichen, eingabeEinheiten, einheitenEingabe } from '../src/lib/wallet/betrag.ts';
import { vierer, kurzAdresse } from '../src/lib/wallet/adresse.ts';
import { gruppiere, tagSchluessel, type Posten } from '../src/lib/wallet/verlaufGruppen.ts';
import { notizKuerzen, notizBytes, notizAusHex } from '../src/lib/wallet/notiz.ts';

const E = 100_000_000n;

test('Betrag: zwei bis vier Nachkommastellen in der Schreibweise der Sprache', () => {
  assert.equal(betragText(5n * E, 'de-DE'), '5,00');
  assert.equal(betragText(128_570_000n, 'de-DE'), '1,2857');
  assert.equal(betragText(128_455_120_000n, 'de-DE'), '1.284,5512');
  assert.equal(betragText(128_455_120_000n, 'en-US'), '1,284.5512');
  assert.equal(betragText('2550000000', 'de-DE'), '25,50');
});

test('Betrag: abgeschnitten, nie aufgerundet', () => {
  assert.equal(betragText(99_999_999n, 'de-DE'), '0,9999');
  assert.equal(betragZahl(99_999_999n), 0.9999);
  assert.equal(betragText(-150_000_000n, 'de-DE'), '1,50');
  assert.equal(betragZahl(-150_000_000n), -1.5);
});

test('Betrag: winzig, aber nicht null', () => {
  assert.equal(betragText(1n, 'de-DE'), '< 0,0001');
  assert.equal(betragText(0n, 'de-DE'), '0,00');
  assert.equal(betragText(null, 'de-DE'), '0,00');
  assert.equal(betragText('kaputt', 'de-DE'), '0,00');
});

test('Eingabe: Komma und Punkt, exakt in Einheiten', () => {
  assert.equal(eingabeEinheiten('25,5'), 2_550_000_000n);
  assert.equal(eingabeEinheiten('25.5'), 2_550_000_000n);
  assert.equal(eingabeEinheiten('0,1') + eingabeEinheiten('0,2'), eingabeEinheiten('0,3'));
  assert.equal(eingabeEinheiten('0,00000001'), 1n);
  assert.equal(eingabeEinheiten('0,000000019'), 1n);   // die neunte Stelle faellt weg
  assert.equal(eingabeEinheiten('5,'), 5n * E);
  assert.equal(eingabeEinheiten(',5'), 50_000_000n);
  for (const unsinn of ['', ',', 'abc', '-1', '1,2,3', '1 000']) assert.equal(eingabeEinheiten(unsinn), 0n, unsinn);
});

test('Eingabe: Einheiten zurück in Text', () => {
  assert.equal(einheitenEingabe(2_550_000_000n, ','), '25,5');
  assert.equal(einheitenEingabe(5n * E, ','), '5');
  assert.equal(einheitenEingabe(123_456_789n, '.', 8, 8), '1.23456789');
  assert.equal(einheitenEingabe(123_456_789n, '.'), '1.2345');
  assert.equal(einheitenEingabe(0n, ','), '');
  // Hin und zurueck, mit voller Genauigkeit.
  for (const w of [1n, 99_999_999n, 127_205_000_001n]) {
    assert.equal(eingabeEinheiten(einheitenEingabe(w, ',', 8, 8)), w);
  }
});

test('Dezimalzeichen je Sprache', () => {
  assert.equal(dezimalZeichen('de-DE'), ',');
  assert.equal(dezimalZeichen('en-US'), '.');
});

test('Adresse: Vierergruppen und Kurzform', () => {
  const a = 'ysr1rucyz5nrwjzedface8dwhlqdrch5q5tzg436np';
  assert.deepEqual(vierer(a), ['ysr1', 'rucy', 'z5nr', 'wjze', 'dfac', 'e8dw', 'hlqd', 'rch5', 'q5tz', 'g436', 'np']);
  assert.equal(vierer(a).join(''), a);
  assert.equal(kurzAdresse(a, '?'), 'ysr1rucy…36np');
  assert.equal(kurzAdresse(null, '?'), '?');
});

test('Notiz: Kürzen nach Bytes, Lesen aus Hex', () => {
  assert.equal(notizKuerzen('Danke!'), 'Danke!');
  assert.equal(notizBytes(notizKuerzen('ä'.repeat(40))), 32);
  assert.equal(notizKuerzen('a' + '😀'.repeat(10)), 'a' + '😀'.repeat(7));   // 1 + 7*4 = 29; das achte passt nicht
  assert.equal(notizAusHex('4b6166666565'), 'Kaffee');
  assert.equal(notizAusHex('ff00'), '');
  assert.equal(notizAusHex(null), '');
});

// ---------------------------------------------------------------- Verlauf gliedern

const tag = (ts: string | number | null) => (ts == null ? '' : `T${Math.floor(Number(ts) / 100)}`);
let lauf = 0;
const p = (kind: Posten['kind'], ts: number, amount = 10, shares?: number): Posten =>
  ({ txid: `tx${++lauf}`, height: 1000 - lauf, timestamp: String(ts), kind, amount: String(amount), shares });

test('Verlauf: Mining-Erträge eines Tages stehen in einer Zeile', () => {
  const liste = [
    p('out', 290), p('pool', 280, 10, 4), p('in', 270), p('pool', 260, 12, 5), p('reward', 250, 50),
    p('pool', 180, 7, 3), p('out', 170), p('pool', 160, 8, 1),
  ];
  const tage = gruppiere(liste, tag);
  assert.deepEqual(tage.map(t => t.schluessel), ['T2', 'T1']);

  // Tag 2: Ausgang, Buendel (an der Stelle des neuesten Ertrags), Eingang.
  assert.deepEqual(tage[0].zeilen.map(z => z.art), ['einzeln', 'mining', 'einzeln']);
  const b = tage[0].zeilen[1];
  assert.ok(b.art === 'mining');
  assert.equal(b.eintraege.length, 3);
  assert.equal(b.summe, 72n);
  assert.equal(b.pool, 2);
  assert.equal(b.solo, 1);

  // Tag 1: Ein Pool-Block, den man mit niemandem geteilt hat, zaehlt als eigener Fund.
  const c = tage[1].zeilen[0];
  assert.ok(c.art === 'mining');
  assert.equal(c.summe, 15n);
  assert.equal(c.pool, 1);
  assert.equal(c.solo, 1);
});

test('Verlauf: ein einzelner Ertrag bleibt eine gewöhnliche Zeile', () => {
  const tage = gruppiere([p('in', 390), p('pool', 380, 9, 4)], tag);
  assert.deepEqual(tage[0].zeilen.map(z => z.art), ['einzeln', 'einzeln']);
});

test('Verlauf: nichts geht verloren, die Reihenfolge der Überweisungen bleibt', () => {
  const liste = Array.from({ length: 30 }, (_, i) => p(i % 3 === 0 ? 'out' : 'pool', 1000 - i * 7, i + 1, 4));
  const tage = gruppiere(liste, tag);
  const wieder = tage.flatMap(t => t.zeilen.flatMap(z => z.art === 'einzeln' ? [z.eintrag] : z.eintraege));
  assert.equal(wieder.length, liste.length);
  assert.equal(new Set(wieder.map(e => e.txid)).size, liste.length);
  const aus = (l: Posten[]) => l.filter(e => e.kind === 'out').map(e => e.txid);
  assert.deepEqual(aus(wieder), aus(liste));
  const summe = tage.flatMap(t => t.zeilen).reduce((s, z) => s + (z.art === 'mining' ? z.summe : 0n), 0n);
  const einzelnMining = tage.flatMap(t => t.zeilen)
    .reduce((s, z) => s + (z.art === 'einzeln' && z.eintrag.kind === 'pool' ? BigInt(z.eintrag.amount) : 0n), 0n);
  assert.equal(summe + einzelnMining, liste.filter(e => e.kind === 'pool').reduce((s, e) => s + BigInt(e.amount), 0n));
});

test('Verlauf: Einträge ohne Zeit und leere Liste', () => {
  assert.deepEqual(gruppiere([], tag), []);
  const ohne: Posten = { txid: 'x', height: 1, timestamp: null, kind: 'in', amount: '1' };
  assert.equal(gruppiere([ohne], tag)[0].schluessel, '');
  assert.equal(tagSchluessel(null), '');
  assert.match(tagSchluessel(1_790_000_000), /^\d{4}-\d{2}-\d{2}$/);
});

import { betragGenau } from '../src/lib/wallet/betrag.ts';

test('Betrag genau: jede Stelle der Kette, mindestens zwei', () => {
  assert.equal(betragGenau(2_550_000_000n, 'de-DE'), '25,50');
  assert.equal(betragGenau(2_550_000_226n, 'de-DE'), '25,50000226');
  assert.equal(betragGenau(226n, 'de-DE', 8, 4), '0,00000226');
  assert.equal(betragGenau(100_000n, 'de-DE', 8, 4), '0,0010');
  assert.equal(betragGenau(124_654_920_000n, 'de-DE'), '1.246,5492');
  assert.equal(betragGenau(124_654_920_000n, 'en-US'), '1,246.5492');
  assert.equal(betragGenau(0n, 'de-DE'), '0,00');
});

test('Verlauf: ohne Bündeln bleibt jeder Ertrag eine Zeile', () => {
  const tage = gruppiere([p('pool', 480, 5, 4), p('pool', 470, 5, 4), p('reward', 460, 50)], tag, false);
  assert.deepEqual(tage[0].zeilen.map(z => z.art), ['einzeln', 'einzeln', 'einzeln']);
});

import { tippen, eingabeAnzeige, type Taste } from '../src/lib/wallet/ziffern.ts';

test('Ziffernfeld: tippen, Komma, löschen', () => {
  const folge = (tasten: Taste[], z = ',') => tasten.reduce((s, k) => tippen(s, k, z), '');
  assert.equal(folge(['2', '5', 'komma', '5']), '25,5');
  assert.equal(folge(['komma', '5']), '0,5');
  assert.equal(folge(['0', '0', '5']), '5');
  assert.equal(folge(['0', 'komma', '0', '1']), '0,01');
  assert.equal(folge(['1', 'komma', 'komma', '2']), '1,2');
  assert.equal(folge(['1', '2', 'loeschen']), '1');
  assert.equal(folge(['loeschen']), '');
  assert.equal(folge(['1', 'komma', 'loeschen', '5']), '15');
  assert.equal(folge(['2', '5', 'komma', '5'], '.'), '25.5');
});

test('Ziffernfeld: Grenzen', () => {
  let s = '1,';
  for (let i = 0; i < 12; i++) s = tippen(s, '3', ',');
  assert.equal(s, '1,33333333');
  let g = '';
  for (let i = 0; i < 12; i++) g = tippen(g, '9', ',');
  assert.equal(g, '999999999');
  assert.equal(eingabeEinheiten(s), 133_333_333n);
});

test('Ziffernfeld: Anzeige gliedert nur den ganzen Teil', () => {
  assert.equal(eingabeAnzeige('1284,5', ',', 'de-DE'), '1.284,5');
  assert.equal(eingabeAnzeige('1284,', ',', 'de-DE'), '1.284,');
  assert.equal(eingabeAnzeige('1284.50', '.', 'en-US'), '1,284.50');
  assert.equal(eingabeAnzeige('0,00', ',', 'de-DE'), '0,00');
  assert.equal(eingabeAnzeige('', ',', 'de-DE'), '');
});
