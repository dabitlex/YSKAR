/**
 * Das Verzeichnis (kettenIndex.ts) bei vollen Bloecken der Fassung 6.
 *
 * Bis 1.0.2 passten nur Stellen bis 4095 in einen Eintrag. Eine
 * Transaktion weiter hinten in einem 5.000er-Block landete beim naechsten
 * Block, und /account brach mit HTTP 500 ab (Stresstest 26.11.2026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { ReadApi } from '../src/lib/node/fullnode/ReadApi.ts';
import { REGTEST_V6 } from '../src/lib/core/networks.ts';
import { buildTransfer, buildBatch, transferVersionAt } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic, keypairFromSeed, seedFromMnemonic } from '../src/lib/core/wallet.ts';
import { UNIT, MIN_FEE } from '../src/lib/core/params.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { mineBlock } from './helpers/regtest.ts';

const P = REGTEST_V6;
const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('Voller Block (5.000 Tx): /account findet auch die Einträge ab Stelle 4096 -- an der richtigen Höhe', () => {
  const miner = keypairFromMnemonic(WORTE, '', 0, 0);
  const seed = seedFromMnemonic(WORTE);
  const sender = Array.from({ length: 157 }, (_, i) => keypairFromSeed(seed, 5, i));
  const ziel = new Uint8Array(20).fill(0x77);

  const state = emptyState(); const bloecke = []; let prev = new Uint8Array(32);
  const zeit = (h: number) => 1_788_912_000n + BigInt(h) * P.targetBlockTime;
  const add = (mempool: Parameters<typeof mineBlock>[0]['mempool'] = []) => {
    const h = bloecke.length;
    const g = mineBlock({ height: h, prevHash: prev, state, timestamp: zeit(h), miner: miner.addressRaw, mempool, params: P });
    assert.ok(applyBlock(state, g.block, P).ok);
    bloecke.push(g); prev = g.hash;
    return g;
  };
  for (let i = 0; i < 3; i++) add();
  add([buildBatch({ chainId: P.chainId, from: miner.addressRaw, fee: MIN_FEE * 100n, nonce: 0n,
    outputs: sender.map(k => ({ to: k.addressRaw, amount: UNIT / 10n })), publicKey: miner.publicKey, privateKey: miner.privateKey })]);
  const version = transferVersionAt(4, P.v6Height);
  const txs = sender.flatMap(k => Array.from({ length: 32 }, (_, n) => buildTransfer({ chainId: P.chainId, from: k.addressRaw, to: ziel,
    amount: 100n, fee: MIN_FEE, nonce: BigInt(n), version, publicKey: k.publicKey, privateKey: k.privateKey }))).slice(0, 4999);
  const voll = add(txs);
  assert.equal(voll.block.txs.length, 5000, 'ein voller Block');
  add();   // dahinter ein leerer Block: dorthin zeigte der falsch gepackte Eintrag

  const store = new ChainStore(':memory:', { network: P.network, chainId: P.chainId });
  const chain = new ChainManager(store, P);
  for (const b of bloecke) assert.ok(chain.accept(b.body).ok);
  const api = new ReadApi({ chain, store, pool: new TxPool(P), params: P });

  const r = api.account(encodeAddress(ziel)) as { status: number; body: { history: { height: number }[] } };
  assert.equal(r.status, 200);
  assert.equal(r.body.history.length, 40);
  assert.ok(r.body.history.every(v => v.height === 4), 'alle Einträge im vollen Block (Höhe 4)');
  store.close();
});
