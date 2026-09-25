/**
 * Die GPU-Anbindung des CLI-Miners.
 *
 * Der kritische Teil ist der Header: Der Server liefert Einzelfelder, das
 * CUDA-Programm will die fertigen 136 Byte. Stimmen die nicht bitgenau mit
 * dem überein, was der Knoten serialisiert, rechnet die Karte fleißig —
 * und jeder Treffer wird abgelehnt.
 *
 * Das wäre ein Fehler, der wie ein Netzproblem aussieht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { headerHex, findeGpuProgramm } from '../miner/src/gpu.mjs';
import { serializeHeader } from '../src/lib/core/block.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';

/** Ein Job, wie der MiningServer ihn liefert. */
const JOB = {
  version: 1, height: 2061,
  prevHash: '00'.repeat(31) + 'ab',
  merkleRoot: '11'.repeat(32),
  stateRoot: '22'.repeat(32),
  timestamp: '1790274835',
  difficulty: 183140,
  txCount: 1,
  extranonce: '13111268702705097209',
};

test('Der gebaute Header ist bitgenau der des Kerns', () => {
  const meiner = headerHex(JOB);
  const echt = toHex(serializeHeader({
    version: 1, height: 2061,
    prevHash: fromHex(JOB.prevHash),
    merkleRoot: fromHex(JOB.merkleRoot),
    stateRoot: fromHex(JOB.stateRoot),
    timestamp: 1790274835n,
    difficulty: 183140n, txCount: 1,
    extranonce: 13111268702705097209n,
    nonce: 0n,
  }));
  assert.equal(meiner, echt);
  assert.equal(meiner.length / 2, 136, 'der Header ist 136 Byte lang');
});

test('Eine große Extranonce überlebt den Weg', () => {
  /*
    Genau hier ging es in der Anzeige schon einmal schief: Eine Extranonce
    über 2^53 lässt sich als JavaScript-Zahl nicht exakt darstellen. Der
    Job liefert sie als Zeichenkette, und BigInt() muss sie auch so
    bekommen.
  */
  const h = headerHex(JOB);
  // Byte 120..127, little endian
  assert.equal(h.slice(240, 256), 'f9196f2b6b95f4b5');

  const alsZahl = headerHex({ ...JOB, extranonce: Number(JOB.extranonce) as unknown as string });
  assert.notEqual(alsZahl.slice(240, 256), h.slice(240, 256),
    'als Zahl übergeben MUSS ein anderes Ergebnis geben — sonst prüft dieser Test nichts');
});

test('Das Nonce-Feld bleibt leer', () => {
  // Dort setzt die Karte ihren Wert ein. Steht da etwas, sucht sie im
  // falschen Bereich.
  assert.equal(headerHex(JOB).slice(256, 272), '0'.repeat(16));
});

test('Ohne Programm wird nichts vorgegaukelt', () => {
  assert.equal(findeGpuProgramm('/gibt/es/wirklich/nicht'), null);
});
