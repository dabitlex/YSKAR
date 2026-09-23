/**
 * Der selbst gewählte Name eines Blockfinders.
 *
 * Er steht im extra-Feld der Coinbase — einem Feld, das eigentlich nur den
 * txid eindeutig macht und deshalb fast immer Zufallsbytes enthält. Die
 * Unterscheidung muss also verlässlich sein, sonst zeigt der Explorer
 * Buchstabensalat als Pool-Namen an.
 *
 * Gegen die echte Kette geprüft: Von 1841 vorhandenen extra-Feldern war
 * genau EINES durchgehend druckbar — der Genesis-Block mit seiner
 * Inschrift.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finderName } from '../src/lib/chain/finderName.ts';

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex');

test('Die Genesis-Inschrift wird erkannt', () => {
  assert.equal(finderName(hex('proof, not promise')), 'proof, not promise');
});

test('Ein Pool-Name wird erkannt', () => {
  assert.equal(finderName(hex('pool.yskar.net')), 'pool.yskar.net');
  assert.equal(finderName(hex('YSKAR Haupt-Pool')), 'YSKAR Haupt-Pool');
});

test('Zufallsbytes sind kein Name', () => {
  // Echte Werte aus der Kette.
  for (const h of ['4192c71a1df9cb28', 'a3f10c4d92bb17e0', '00ff10']) {
    assert.equal(finderName(h), null, `"${h}" wurde als Name gelesen`);
  }
});

test('Ein Nullbyte schließt den Namen aus', () => {
  // 'p\0ool' -- druckbar bis auf ein Byte. Genau dort trennt sich
  // Absicht von Zufall.
  assert.equal(finderName('70006f6f6c'), null);
});

test('Zu kurz oder leer ist kein Name', () => {
  assert.equal(finderName(''), null);
  assert.equal(finderName(null), null);
  assert.equal(finderName(undefined), null);
  assert.equal(finderName(hex('ab')), null);
});

test('Reine Satzzeichen sind kein Name', () => {
  assert.equal(finderName(hex('...')), null);
  assert.equal(finderName(hex('---')), null);
  assert.equal(finderName(hex('a-b')), 'a-b', 'ein Buchstabe genügt');
});

test('Das Datenbank-Präfix stört nicht', () => {
  // Postgres liefert bytea als \x...
  assert.equal(finderName('\\x' + hex('mein pool')), 'mein pool');
});

test('Überlange Werte werden abgewiesen', () => {
  // Das Format erlaubt bis 255 Byte; als Name gelten höchstens 32.
  assert.equal(finderName(hex('x'.repeat(33))), null);
  assert.equal(finderName(hex('x'.repeat(32))), 'x'.repeat(32));
});

test('Umlaute und Steuerzeichen gelten nicht als Name', () => {
  // Nur druckbares ASCII. Ein Umlaut ist in UTF-8 zwei Bytes, von denen
  // keines druckbar ist -- er fällt also heraus.
  assert.equal(finderName(hex('Grüße')), null);
  assert.equal(finderName(hex('pool\nnet')), null);
});

test('Ein bösartiger Name wird als solcher durchgereicht', () => {
  /*
    Die Funktion maskiert NICHT -- das ist Aufgabe der Anzeige. Sie liefert
    den Text, wie er in der Kette steht. Wichtig ist, dass sie ihn auch
    wirklich liefert, damit die Anzeige weiß, dass sie maskieren muss.
  */
  assert.equal(finderName(hex('<script>')), '<script>');
});
