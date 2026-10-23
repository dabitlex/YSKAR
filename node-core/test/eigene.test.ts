/**
 * Eigene Transaktionen, die der Mempool nach einem Neustart nicht nimmt
 * (eigeneOffen): weiter versuchen, solange es Sinn hat -- aber nie so, dass
 * eine endgueltig ungueltige alles Spaetere desselben Absenders blockiert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { UNIT } from '../../src/lib/core/params.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { buildTransfer, txidHex, type Spend } from '../../src/lib/core/tx.ts';
import { keypairFromSeed } from '../../src/lib/core/wallet.ts';
import { emptyState } from '../../src/lib/core/state.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { NodeCoreApp } from '../src/main.ts';

const K = keypairFromSeed(new Uint8Array(64).fill(4), 0, 0);
const ZIEL = new Uint8Array(20).fill(0xee);
const tx = (nonce: bigint, fee = 5_000n): Spend => buildTransfer({ from: K.addressRaw, to: ZIEL, amount: UNIT, fee, nonce,
  publicKey: K.publicKey, privateKey: K.privateKey, chainId: REGTEST.chainId });

function app(nonce: bigint) {
  const a = new NodeCoreApp({ params: REGTEST, basis: mkdtempSync(join(tmpdir(), 'yskar-eigene-')) }) as any;
  const state = emptyState();
  state.set(toHex(K.addressRaw), { balance: 1_000n * UNIT, nonce });
  a.pool = new TxPool(REGTEST);
  a.chain = { state: () => state, height: () => 10 };
  return a;
}

test('Eine endgueltig ungueltige eigene Transaktion nimmt die spaeteren desselben Absenders mit', () => {
  const a = app(0n);
  const kaputt = { ...tx(0n), fee: 5_001n } as Spend;     // Signatur passt nicht mehr
  const danach = tx(1n);
  const r = a.eigeneVersuchen([danach, kaputt]);
  assert.equal(r.wieder, 0);
  assert.deepEqual(r.offen, [], 'nichts bleibt haengen');
  assert.equal(a.pool.size(), 0);
});

test('Voruebergehend nicht aufnehmbar: bleibt offen -- bis die Frist abgelaufen ist', () => {
  const a = app(0n);
  // Nonce 1 ohne Nonce 0: Luecke, voruebergehend.
  const t1 = tx(1n);
  let r = a.eigeneVersuchen([t1]);
  assert.equal(r.offen.length, 1);
  // Frist abgelaufen: verworfen.
  a.eigeneSeit.set(txidHex(t1), Date.now() - 73 * 3600_000);
  r = a.eigeneVersuchen(r.offen);
  assert.equal(r.offen.length, 0);
});

test('Bestaetigte und aufnehmbare: erledigt bzw. wieder im Mempool', () => {
  const a = app(1n);
  const r = a.eigeneVersuchen([tx(0n), tx(1n), tx(2n)]);
  assert.equal(r.wieder, 2, 'Nonce 1 und 2');
  assert.deepEqual(r.offen, []);
  assert.ok(a.pool.istLokal(txidHex(tx(1n))));
});
