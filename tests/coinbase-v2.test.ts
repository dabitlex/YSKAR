/**
 * Coinbase mit mehreren Empfängern — Konsensfassung 2.
 *
 * Grundlage für Pool Mining ohne Verwahrung: Der Block zahlt alle
 * Beteiligten direkt aus, der Betreiber hält nie fremdes Geld.
 *
 * Jede Regel steht hier einzeln, weil jede einzelne Konsens ist. Wer eine
 * davon lockert, ändert die Kette.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as T from '../src/lib/core/tx.ts';
import * as S from '../src/lib/core/state.ts';
import * as P from '../src/lib/core/params.ts';
import { buildCoinbaseV2 } from '../src/lib/core/builder.ts';
import { serializeTx, deserializeTx } from '../src/lib/core/tx.ts';
import { txMerkleRoot, BLOCK_VERSION, type Block } from '../src/lib/core/block.ts';
import { MAINNET, REGTEST } from '../src/lib/core/networks.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';

const adr = (b: number) => { const a = new Uint8Array(20); a[0] = b; return a; };
const A = adr(0x11), B = adr(0x22), C = adr(0x33);

function block(height: number, txs: T.Tx[]): Block {
  return {
    header: {
      version: BLOCK_VERSION, height,
      prevHash: new Uint8Array(32), merkleRoot: txMerkleRoot(txs),
      stateRoot: new Uint8Array(32), timestamp: 1_788_912_000n + BigInt(height) * 600n,
      difficulty: 4096n, txCount: txs.length, extranonce: 0n, nonce: 0n,
    },
    txs,
  };
}

// ------------------------------------------------------- Format und Bytes

test('Fassung 1 bleibt byteweise unverändert', () => {
  // Der wichtigste Test überhaupt: Die alte Kodierung darf sich nicht um ein
  // einziges Byte verschieben, sonst wären alle bisherigen Blöcke ungültig.
  const cb: T.Coinbase = {
    type: T.TX_COINBASE, version: T.TX_VERSION, height: 7,
    outputs: [{ to: A, amount: 875n * P.UNIT }],
    extra: new TextEncoder().encode('xy'),
  };
  const roh = serializeTx(cb);
  // u16 version + u8 type + u32 height + 20 to + u64 amount + u8 len + 2
  assert.equal(roh.length, 2 + 1 + 4 + 20 + 8 + 1 + 2);
  // Kein Zählfeld vor der Adresse: Byte 7 ist bereits das erste Adressbyte.
  assert.equal(roh[7], 0x11);

  const zurueck = deserializeTx(roh) as T.Coinbase;
  assert.equal(zurueck.outputs.length, 1);
  assert.equal(toHex(zurueck.outputs[0].to), toHex(A));
  assert.equal(zurueck.outputs[0].amount, 875n * P.UNIT);
});

test('Fassung 2 trägt ein Zählfeld und überlebt Hin- und Rückweg', () => {
  const cb = buildCoinbaseV2(7, [
    { to: B, amount: 500n * P.UNIT },
    { to: A, amount: 375n * P.UNIT },
  ], 0n);
  const roh = serializeTx(cb);
  assert.equal(roh[7], 2, 'Zählfeld direkt nach der Höhe');

  const zurueck = deserializeTx(roh) as T.Coinbase;
  assert.equal(zurueck.version, P.COINBASE_V2);
  assert.equal(zurueck.outputs.length, 2);
  assert.equal(T.coinbaseTotal(zurueck), 875n * P.UNIT);
});

// -------------------------------------------------------------- Aktivierung

test('Vor der Aktivierungshöhe wird Fassung 2 abgelehnt', () => {
  const cb = buildCoinbaseV2(5, [{ to: A, amount: P.rewardAt(5) }], 0n);
  const r = S.applyBlock(S.emptyState(), block(5, [cb]), MAINNET);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /coinbase_v2_zu_frueh/);
});

test('Ab der Aktivierungshöhe wird sie angenommen', () => {
  const h = MAINNET.coinbaseV2Height;
  const cb = buildCoinbaseV2(h, [
    { to: A, amount: P.rewardAt(h) / 2n },
    { to: B, amount: P.rewardAt(h) - P.rewardAt(h) / 2n },
  ], 0n);
  const st = S.emptyState();
  const r = S.applyBlock(st, block(h, [cb]), MAINNET);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(st.get(toHex(A))!.balance, P.rewardAt(h) / 2n);
  assert.equal(S.totalSupply(st), P.rewardAt(h));
});

test('Fassung 1 bleibt auch nach der Aktivierung gültig', () => {
  // Solo-Mining darf sich durch die Erweiterung nicht ändern.
  const h = MAINNET.coinbaseV2Height + 10;
  const cb: T.Coinbase = {
    type: T.TX_COINBASE, version: T.TX_VERSION, height: h,
    outputs: [{ to: A, amount: P.rewardAt(h) }], extra: new Uint8Array(0),
  };
  const r = S.applyBlock(S.emptyState(), block(h, [cb]), MAINNET);
  assert.equal(r.ok, true, JSON.stringify(r.error));
});

// ------------------------------------------------------------------ Regeln

test('Die Summe muss exakt aufgehen', () => {
  const h = REGTEST.coinbaseV2Height;
  // Ein Satoshi zu viel ist kein Rundungsfehler, sondern ein ungültiger Block.
  const cb: T.Coinbase = {
    type: T.TX_COINBASE, version: P.COINBASE_V2, height: h,
    outputs: [{ to: A, amount: P.rewardAt(h) + 1n }], extra: new Uint8Array(0),
  };
  const r = S.applyBlock(S.emptyState(), block(h, [cb]), REGTEST);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /coinbase_amount/);
});

test('Unsortierte Empfänger werden abgelehnt', () => {
  // Sonst gäbe es für dieselbe Auszahlung mehrere gültige Kodierungen --
  // und damit verschiedene Merkle-Wurzeln für dieselbe Aussage.
  const h = REGTEST.coinbaseV2Height;
  const halb = P.rewardAt(h) / 2n;
  const cb: T.Coinbase = {
    type: T.TX_COINBASE, version: P.COINBASE_V2, height: h,
    outputs: [{ to: C, amount: halb }, { to: A, amount: P.rewardAt(h) - halb }],
    extra: new Uint8Array(0),
  };
  const r = S.applyBlock(S.emptyState(), block(h, [cb]), REGTEST);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /unsortiert/);
});

test('Derselbe Empfänger zweimal wird abgelehnt', () => {
  const h = REGTEST.coinbaseV2Height;
  const halb = P.rewardAt(h) / 2n;
  const cb: T.Coinbase = {
    type: T.TX_COINBASE, version: P.COINBASE_V2, height: h,
    outputs: [{ to: A, amount: halb }, { to: A, amount: P.rewardAt(h) - halb }],
    extra: new Uint8Array(0),
  };
  const r = S.applyBlock(S.emptyState(), block(h, [cb]), REGTEST);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /unsortiert/);
  // Und der Bauhelfer lässt es gar nicht erst zu.
  assert.throws(() => buildCoinbaseV2(h, [
    { to: A, amount: halb }, { to: A, amount: P.rewardAt(h) - halb },
  ], 0n), /zweimal/);
});

test('Ein Empfänger ohne Betrag wird abgelehnt', () => {
  // Sonst ließe sich der Block mit leeren Einträgen aufblähen.
  const h = REGTEST.coinbaseV2Height;
  const cb: T.Coinbase = {
    type: T.TX_COINBASE, version: P.COINBASE_V2, height: h,
    outputs: [{ to: A, amount: P.rewardAt(h) }, { to: B, amount: 0n }],
    extra: new Uint8Array(0),
  };
  const r = S.applyBlock(S.emptyState(), block(h, [cb]), REGTEST);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /coinbase_output_null/);
});

test('Mehr als die Obergrenze an Empfängern wird abgelehnt', () => {
  const h = REGTEST.coinbaseV2Height;
  const n = P.MAX_COINBASE_OUTPUTS + 1;
  const outputs = Array.from({ length: n }, (_, i) => {
    const a = new Uint8Array(20); a[0] = i >> 8; a[1] = i & 0xff;
    return { to: a, amount: 1n };
  });
  assert.throws(() => buildCoinbaseV2(h, outputs, 0n), /bis 64/);
  // Und beim Einlesen aus rohen Bytes ebenfalls.
  const roh = new Uint8Array(2 + 1 + 4 + 1 + n * 28 + 1);
  const dv = new DataView(roh.buffer);
  dv.setUint16(0, P.COINBASE_V2, true);
  roh[2] = T.TX_COINBASE;
  dv.setUint32(3, h, true);
  roh[7] = n;
  assert.throws(() => deserializeTx(roh), /unzulaessig/);
});

test('Der Bauhelfer sortiert selbst und prüft die Summe', () => {
  const h = REGTEST.coinbaseV2Height;
  const drittel = P.rewardAt(h) / 3n;
  const rest = P.rewardAt(h) - 2n * drittel;
  const cb = buildCoinbaseV2(h, [
    { to: C, amount: rest }, { to: A, amount: drittel }, { to: B, amount: drittel },
  ], 0n);
  assert.equal(toHex(cb.outputs[0].to), toHex(A));
  assert.equal(toHex(cb.outputs[2].to), toHex(C));
  assert.equal(T.coinbaseTotal(cb), P.rewardAt(h));

  // Ein Satoshi zu wenig fällt schon beim Bauen auf, nicht erst im Block.
  assert.throws(() => buildCoinbaseV2(h, [
    { to: A, amount: drittel }, { to: B, amount: drittel },
  ], 0n), /ergeben/);
});

test('Gebühren gehören zur Summe', () => {
  const h = REGTEST.coinbaseV2Height;
  const gebuehren = 5_000n;
  const cb = buildCoinbaseV2(h, [
    { to: A, amount: P.rewardAt(h) },
    { to: B, amount: gebuehren },
  ], gebuehren);
  assert.equal(T.coinbaseTotal(cb), P.rewardAt(h) + gebuehren);
});
