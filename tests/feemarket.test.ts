/**
 * Gebührenmarkt.
 *
 * Er ist ausdrücklich KEINE Konsensregel. Nichts hier entscheidet, ob eine
 * Transaktion gültig ist — nur, wie lange sie voraussichtlich wartet.
 *
 * Die wichtigsten Tests sind die unbequemen: Was passiert, wenn mehr
 * Transaktionen ankommen als Plätze da sind, und was passiert mit der
 * Nonce-Reihenfolge im Kontenmodell.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as M from '../src/lib/core/feemarket.ts';
import * as T from '../src/lib/core/tx.ts';
import * as P from '../src/lib/core/params.ts';
import * as W from '../src/lib/core/wallet.ts';
import { emptyState, type State } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';

const KNOWN = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';

/** Ein Konto mit Guthaben, damit Überweisungen gedeckt sind. */
function zustandMit(adressen: { addressRaw: Uint8Array }[], guthaben: bigint): State {
  const s = emptyState();
  for (const a of adressen) s.set(toHex(a.addressRaw), { balance: guthaben, nonce: 0n });
  return s;
}

function tx(from: W.Keypair, to: Uint8Array, fee: bigint, nonce: bigint) {
  return T.buildTransfer({
    from: from.addressRaw, to, amount: P.UNIT, fee, nonce,
    publicKey: from.publicKey, privateKey: from.privateKey,
  });
}

const ZIEL = new Uint8Array(20).fill(0xee);

// ------------------------------------------------------------ Ohne Andrang

test('Ohne Andrang ist die Mindestgebühr die Antwort auf alles', () => {
  /*
    Drei verschiedene Preise anzubieten, wenn der Block ohnehin nicht voll
    wird, wäre eine Erfindung: Der Nutzer zahlte mehr, ohne etwas dafür zu
    bekommen.
  */
  const a = W.keypairFromMnemonic(KNOWN, '', 0, 0);
  const s = zustandMit([a], 1000n * P.UNIT);
  const pool = [tx(a, ZIEL, P.MIN_FEE, 0n), tx(a, ZIEL, P.MIN_FEE, 1n)];

  const m = M.marktlage(s, pool, 1);
  assert.equal(m.andrang, false);
  assert.equal(m.kappung, null);
  assert.equal(m.langsam.fee, P.MIN_FEE);
  assert.equal(m.normal.fee, P.MIN_FEE);
  assert.equal(m.schnell.fee, P.MIN_FEE);
  assert.equal(m.schnell.block, 1, 'ohne Andrang geht alles in den nächsten Block');
});

test('Ein leerer Mempool ergibt keine erfundenen Zahlen', () => {
  const m = M.marktlage(emptyState(), [], 1);
  assert.equal(m.wartend, 0);
  assert.equal(m.andrang, false);
  assert.equal(m.bloecke.length, 0);
});

// -------------------------------------------------------------- Mit Andrang

test('Mehr Transaktionen als Plätze: die Vorhersage verteilt sie auf Blöcke', () => {
  /*
    Genau der Fall, der eine Zusage "nächster Block, sicher" zur Lüge macht.
    Hier: 12 Absender mit je einer Transaktion, aber nur 5 Plätze je Block.
  */
  const leute = Array.from({ length: 12 }, (_, i) => W.keypairFromMnemonic(KNOWN, '', 0, i));
  const s = zustandMit(leute, 1000n * P.UNIT);
  // Gebühren absteigend, damit die Reihenfolge eindeutig ist
  const pool = leute.map((k, i) => tx(k, ZIEL, P.MIN_FEE * BigInt(12 - i), 0n));

  const m = M.marktlage(s, pool, 1, 5);
  assert.equal(m.wartend, 12);
  assert.equal(m.andrang, true, 'bei 12 Wartenden und 5 Plätzen ist Andrang');
  assert.equal(m.plaetzeJeBlock, 5);

  // Drei Blöcke: 5 + 5 + 2
  assert.deepEqual(m.bloecke.map(b => b.anzahl), [5, 5, 2]);
  assert.deepEqual(m.bloecke.map(b => b.block), [1, 2, 3]);

  // Die Kappung ist die schwächste Gebühr, die es noch in Block 1 schafft.
  assert.equal(m.kappung, P.MIN_FEE * 8n);
  // Wer sicher in Block 1 will, muss darüber liegen.
  assert.ok(m.schnell.fee > m.kappung!, 'schnell muss über der Kappung liegen');
  assert.equal(m.schnell.block, 1);
  assert.equal(m.normal.block, 2);
});

test('Die Stufen steigen mit dem Andrang', () => {
  const leute = Array.from({ length: 10 }, (_, i) => W.keypairFromMnemonic(KNOWN, '', 0, i));
  const s = zustandMit(leute, 1000n * P.UNIT);

  const wenig = M.marktlage(s, leute.slice(0, 3).map(k => tx(k, ZIEL, P.MIN_FEE, 0n)), 1, 5);
  const viel = M.marktlage(s, leute.map((k, i) => tx(k, ZIEL, P.MIN_FEE * BigInt(10 - i), 0n)), 1, 5);

  assert.equal(wenig.schnell.fee, P.MIN_FEE);
  assert.ok(viel.schnell.fee > wenig.schnell.fee,
    'mit Andrang muss der Preis für den nächsten Block steigen');
});

// ------------------------------------------------------- Nonce-Reihenfolge

test('Eine hohe Gebühr überholt die eigene frühere Nonce nicht', () => {
  /*
    Der Unterschied zum UTXO-Modell. Nonce 1 kann nicht vor Nonce 0 in
    einen Block — egal, was sie zahlt. Eine reine Gebührensortierung wäre
    hier schlicht falsch.
  */
  const a = W.keypairFromMnemonic(KNOWN, '', 0, 0);
  const b = W.keypairFromMnemonic(KNOWN, '', 0, 1);
  const s = zustandMit([a, b], 1000n * P.UNIT);

  const billig = tx(a, ZIEL, P.MIN_FEE, 0n);          // muss zuerst
  const teuer = tx(a, ZIEL, P.MIN_FEE * 100n, 1n);    // zahlt viel, muss warten
  const fremd = tx(b, ZIEL, P.MIN_FEE * 50n, 0n);

  const plaetze = M.projiziere(s, [teuer, fremd, billig], 1, 8, 2);
  const blockVon = (t: T.Transfer) => plaetze.get(toHex(T.txid(t)));

  assert.ok(blockVon(billig)! <= blockVon(teuer)!,
    'die frühere Nonce muss zuerst oder gleichzeitig kommen');
});

test('Eine feststeckende Transaktion blockiert die dahinter', () => {
  const a = W.keypairFromMnemonic(KNOWN, '', 0, 0);
  const s = zustandMit([a], 1000n * P.UNIT);
  const erste = tx(a, ZIEL, P.MIN_FEE, 0n);
  const zweite = tx(a, ZIEL, P.MIN_FEE * 99n, 1n);

  const blockiert = M.blockiertDurch(s, [erste, zweite], a.addressRaw, 1n);
  assert.equal(blockiert.length, 1, 'die zweite hängt an der ersten');
  assert.equal(blockiert[0].nonce, 0n);
  assert.equal(blockiert[0].fee, P.MIN_FEE);

  // Die erste selbst hängt an nichts.
  assert.equal(M.blockiertDurch(s, [erste, zweite], a.addressRaw, 0n).length, 0);
});

// ---------------------------------------------------------------- Position

test('Die Position zählt, wie viele mehr zahlen', () => {
  const leute = Array.from({ length: 5 }, (_, i) => W.keypairFromMnemonic(KNOWN, '', 0, i));
  const pool = leute.map((k, i) => tx(k, ZIEL, P.MIN_FEE * BigInt(i + 1), 0n));

  // Höchste Gebühr im Pool ist 5 × MIN_FEE.
  assert.equal(M.position(pool, P.MIN_FEE * 10n).rang, 1, 'mehr als alle → Platz 1');
  assert.equal(M.position(pool, P.MIN_FEE).rang, 5, 'niedrigste → hinten');
  assert.equal(M.position(pool, P.MIN_FEE * 3n).rang, 3);
  assert.equal(M.position(pool, P.MIN_FEE).von, 6, 'eigene Transaktion zählt mit');
});

// ------------------------------------------------------------------ Größe

test('Die Größe ist die serialisierte Länge, ohne Gewichtung', () => {
  const a = W.keypairFromMnemonic(KNOWN, '', 0, 0);
  const ohne = tx(a, ZIEL, P.MIN_FEE, 0n);
  assert.equal(M.vbytes(ohne), 168);

  const mit = T.buildTransfer({
    from: a.addressRaw, to: ZIEL, amount: P.UNIT, fee: P.MIN_FEE, nonce: 0n,
    memo: new Uint8Array(32), publicKey: a.publicKey, privateKey: a.privateKey,
  });
  assert.equal(M.vbytes(mit), 200);
  // 19 % Spannweite — deshalb ist ein Satz je Byte hier noch nicht das
  // richtige Maß. Bei Bitcoin sind es über 2000 %.
  assert.ok(M.vbytes(mit) / M.vbytes(ohne) < 1.25);
});

// ------------------------------------------------- Was es NICHT sein darf

test('Der Markt entscheidet nichts über Gültigkeit', () => {
  /*
    Die wichtigste Eigenschaft, und sie lässt sich nur so prüfen: In dieser
    Datei darf nichts stehen, was eine Transaktion ablehnt. Wäre eine
    Empfehlung eine Regel, hätten verschiedene Knoten verschiedene Regeln.
  */
  const roh = readFileSync(
    new URL('../src/lib/core/feemarket.ts', import.meta.url), 'utf8');
  // Kommentare heraus: Dort steht die Erklärung, WARUM diese Dinge hier
  // nicht hingehören — sie zu erwähnen ist erlaubt, sie zu benutzen nicht.
  const code = roh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  for (const verboten of ['checkTransfer', 'throw ', 'MIN_FEE =']) {
    assert.ok(!code.includes(verboten),
      `feemarket.ts benutzt "${verboten}" — das gehört in den Konsens, nicht hierher`);
  }
  // MIN_FEE darf gelesen werden, aber nur als Untergrenze der Anzeige.
  assert.ok(code.includes('MIN_FEE'), 'die Mindestgebühr sollte als Untergrenze dienen');
});
