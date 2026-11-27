/**
 * Tx-Ankuendigungen werden je Peer gesammelt (Volllast-Konzept M2).
 *
 * Vorher ging je Ueberweisung eine eigene inv-Nachricht an jeden Peer. Hier
 * werden 1.280 Ueberweisungen an einen Peer angekuendigt: Es muessen wenige
 * inv-Nachrichten mit je hoechstens MAX_INV Eintraegen sein, und alle
 * Ueberweisungen muessen ankommen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import { SyncManager } from '../src/lib/node/p2p/SyncManager.ts';
import { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { txid, buildTransfer, type Transfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { UNIT, MIN_FEE } from '../src/lib/core/params.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { decodeInv, MAX_INV } from '../src/lib/node/p2p/messages.ts';
import { mineBlock } from './helpers/regtest.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MINER = keypairFromMnemonic(WORTE, '', 0, 0);
const ZIEL = new Uint8Array(20).fill(0xee);
const KONTEN = Array.from({ length: 40 }, (_, i) => keypairFromMnemonic(WORTE, '', 1, i));

function knoten(opt: { port?: number; seeds?: { host: string; port: number }[]; txBuendelMs?: number } = {}) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool(REGTEST);
  let sync: SyncManager;
  const peers = new PeerManager({
    params: REGTEST, agent: 'test/0.1', listenPort: opt.port ?? 0, host: '127.0.0.1', seeds: opt.seeds,
    txBuendelMs: opt.txBuendelMs,
    kette: () => { const t = chain.tip(); return { height: t?.height ?? -1, chainWork: t?.chainWork ?? 0n }; },
    onReady: p => sync.aufPeer(p),
    onMessage: (p, f) => sync.aufNachricht(p, f),
  });
  sync = new SyncManager({ chain, store, peers, pool, params: REGTEST });
  return { chain, pool, peers, sync, store,
    async start() { await peers.start(); sync.start(); },
    async stop() { sync.stop(); await peers.stop(); store.close(); } };
}

function kette() {
  const state = emptyState(); const bloecke = []; let prev = new Uint8Array(32);
  const add = (mempool: Transfer[] = []) => {
    const h = bloecke.length;
    const g = mineBlock({ height: h, prevHash: prev, state, timestamp: 1_788_912_000n + BigInt(h) * REGTEST.targetBlockTime, miner: MINER.addressRaw, mempool });
    assert.ok(applyBlock(state, g.block, REGTEST).ok);
    bloecke.push(g); prev = g.hash;
  };
  for (let i = 0; i < 3; i++) add();
  add(KONTEN.map((k, i) => buildTransfer({ chainId: REGTEST.chainId, from: MINER.addressRaw, to: k.addressRaw,
    amount: UNIT, fee: MIN_FEE, nonce: BigInt(i), publicKey: MINER.publicKey, privateKey: MINER.privateKey })));
  return bloecke;
}

const UEBERWEISUNGEN = KONTEN.flatMap(k => Array.from({ length: 32 }, (_, n) => buildTransfer({
  chainId: REGTEST.chainId, from: k.addressRaw, to: ZIEL, amount: 1000n, fee: MIN_FEE,
  nonce: BigInt(n), publicKey: k.publicKey, privateKey: k.privateKey })));

async function zaehle(txBuendelMs: number | undefined) {
  const bloecke = kette();
  const a = knoten({ port: 19820 + (txBuendelMs ?? 9), txBuendelMs });
  await a.start();
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: 19820 + (txBuendelMs ?? 9) }] });
  await b.start();
  for (const k of [a, b]) for (const bl of bloecke) assert.ok(k.chain.accept(bl.body).ok);
  await warte(1200);

  let invs = 0, eintraege = 0, groesste = 0;
  const original = PeerConnection.prototype.send;
  PeerConnection.prototype.send = function (this: PeerConnection, command, payload) {
    if (command === 'inv' && a.peers.alle().includes(this)) {
      const n = decodeInv(payload).length; invs++; eintraege += n; groesste = Math.max(groesste, n);
    }
    return original.call(this, command, payload);
  };
  try {
    for (const tx of UEBERWEISUNGEN) {
      assert.ok(a.pool.add(tx, a.chain.state(), a.chain.height() + 1).ok);
      a.sync.kuendigeAnTx(txid(tx));
    }
    const t0 = Date.now();
    while (b.pool.size() < UEBERWEISUNGEN.length && Date.now() - t0 < 20000) await warte(50);
  } finally {
    PeerConnection.prototype.send = original;
  }
  const angekommen = b.pool.size();
  await a.stop(); await b.stop();
  return { invs, eintraege, groesste, angekommen };
}

test('1.280 Überweisungen: gebündelt wenige inv-Nachrichten, alle kommen an', async () => {
  const r = await zaehle(undefined);
  assert.equal(r.angekommen, UEBERWEISUNGEN.length);
  assert.equal(r.eintraege, UEBERWEISUNGEN.length);
  assert.ok(r.groesste <= MAX_INV, `höchstens ${MAX_INV} Einträge je inv, waren ${r.groesste}`);
  assert.ok(r.invs <= 10, `erwartet höchstens 10 inv-Nachrichten, waren ${r.invs}`);
});

test('txBuendelMs 0: einzeln wie früher (eine inv je Überweisung)', async () => {
  const r = await zaehle(0);
  assert.equal(r.angekommen, UEBERWEISUNGEN.length);
  assert.equal(r.invs, UEBERWEISUNGEN.length);
});
