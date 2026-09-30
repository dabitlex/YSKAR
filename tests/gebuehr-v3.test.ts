/**
 * Konsensfassung 3: Gebuehr je Byte, Staubgrenze, Chain-ID in der Signatur.
 *
 * Geprueft werden beide Seiten der Aktivierungshoehe -- die alte Regel
 * muss darunter unveraendert gelten, sonst wuerden alte Bloecke ungueltig.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTransfer, checkTransfer, transferBytes, serializeTx, TRANSFER_BASE_BYTES }
  from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { MIN_FEE, MIN_FEE_RATE, FEE_V3_HEIGHT, DUST_LIMIT, RELAY_FEE_RATE, minFeeAt }
  from '../src/lib/core/params.ts';
import { MAINNET, REGTEST } from '../src/lib/core/networks.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { emptyState } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { marktlage } from '../src/lib/core/feemarket.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const A = keypairFromMnemonic(WORTE, '', 0, 0);
const B = new Uint8Array(20).fill(0xee);

function tx(o: { amount?: bigint; fee?: bigint; memo?: Uint8Array; chainId?: Uint8Array; nonce?: bigint }) {
  return buildTransfer({
    from: A.addressRaw, to: B, amount: o.amount ?? 1_000_000n, fee: o.fee ?? MIN_FEE,
    nonce: o.nonce ?? 0n, memo: o.memo, publicKey: A.publicKey, privateKey: A.privateKey,
    chainId: o.chainId,
  });
}

test('Groesse: 168 Byte ohne Notiz, plus Notiz', () => {
  assert.equal(TRANSFER_BASE_BYTES, 168);
  assert.equal(serializeTx(tx({})).length, transferBytes(0));
  const memo = new Uint8Array(32).fill(7);
  assert.equal(serializeTx(tx({ memo })).length, transferBytes(32));
});

test('Unter der Aktivierung gilt MIN_FEE unveraendert', () => {
  const h = FEE_V3_HEIGHT - 1;
  assert.equal(checkTransfer(tx({ fee: MIN_FEE }), h), null);
  assert.equal(checkTransfer(tx({ fee: MIN_FEE - 1n }), h), 'fee_too_low');
  // Staub ist darunter erlaubt -- wie bisher.
  assert.equal(checkTransfer(tx({ amount: 1n }), h), null);
  // Ohne Hoehe: die alte, strengere Regel.
  assert.equal(checkTransfer(tx({ fee: 200n })), 'fee_too_low');
});

test('Ab der Aktivierung: Gebuehr >= Bytes * Satz, Staubgrenze', () => {
  const h = FEE_V3_HEIGHT;
  const min = minFeeAt(h, transferBytes(0));
  assert.equal(min, 168n * MIN_FEE_RATE);
  assert.equal(checkTransfer(tx({ fee: min }), h), null);
  assert.equal(checkTransfer(tx({ fee: min - 1n }), h), 'fee_too_low');
  // Mit Notiz ist die Untergrenze hoeher.
  const memo = new Uint8Array(10);
  assert.equal(checkTransfer(tx({ fee: min, memo }), h), 'fee_too_low');
  assert.equal(checkTransfer(tx({ fee: min + 10n, memo }), h), null);
  // Staub
  assert.equal(checkTransfer(tx({ amount: DUST_LIMIT - 1n, fee: min }), h), 'dust');
  assert.equal(checkTransfer(tx({ amount: DUST_LIMIT, fee: min }), h), null);
});

test('Signatur gilt nur im eigenen Netz', () => {
  const h = FEE_V3_HEIGHT;
  const main = tx({});
  assert.equal(checkTransfer(main, h, MAINNET), null);
  assert.equal(checkTransfer(main, h, REGTEST), 'bad_signature');
  const reg = tx({ chainId: REGTEST.chainId });
  assert.equal(checkTransfer(reg, h, REGTEST), null);
  assert.equal(checkTransfer(reg, h, MAINNET), 'bad_signature');
});

test('Mempool-Policy: Satz je Byte und Ersetzung um mindestens den Satz', () => {
  const pool = new TxPool(REGTEST);          // feeV3Height 0
  const state = emptyState();
  state.set(toHex(A.addressRaw), { balance: 100n * 1_000_000n, nonce: 0n });
  const relay = BigInt(transferBytes(0)) * RELAY_FEE_RATE;
  assert.equal(pool.mindestGebuehr(10, 0), relay);

  const billig = tx({ fee: relay - 1n, chainId: REGTEST.chainId });
  const r1 = pool.add(billig, state, 10);
  assert.ok(!r1.ok && r1.reason === 'fee_too_low', 'unter dem Weiterleitungssatz');

  const ok = tx({ fee: relay, chainId: REGTEST.chainId });
  assert.ok(pool.add(ok, state, 10).ok);

  // Ersetzen um eine Einheit reicht nicht -- um den Satz schon.
  const knapp = tx({ fee: relay + 1n, chainId: REGTEST.chainId });
  const r2 = pool.add(knapp, state, 10);
  assert.ok(!r2.ok && r2.reason === 'fee_not_higher');
  const genug = tx({ fee: relay * 2n, chainId: REGTEST.chainId });
  const r3 = pool.add(genug, state, 10);
  assert.ok(r3.ok && r3.ersetzt, 'Ersetzung mit doppeltem Satz');
});

test('Gebuehrenmarkt faellt nie unter den Boden', () => {
  const state = emptyState();
  const boden = 1_680n;
  const m = marktlage(state, [], 5_000, undefined, boden);
  assert.equal(m.langsam.fee, boden);
  assert.equal(m.normal.fee, boden);
  assert.equal(m.schnell.fee, boden);
});
