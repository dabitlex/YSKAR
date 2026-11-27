/**
 * Hilfen fuer Tests mit Warteschlangen ueber echte Verbindungen: Knoten,
 * eine Testkette mit 40 gedeckten Konten und 1.280 Ueberweisungen.
 */
import assert from 'node:assert/strict';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { PeerManager } from '../../src/lib/node/p2p/PeerManager.ts';
import { SyncManager } from '../../src/lib/node/p2p/SyncManager.ts';
import { REGTEST } from '../../src/lib/core/networks.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { buildTransfer, type Transfer } from '../../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { UNIT, MIN_FEE } from '../../src/lib/core/params.ts';
import { emptyState, applyBlock } from '../../src/lib/core/state.ts';
import { mineBlock } from './regtest.ts';

export const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MINER = keypairFromMnemonic(WORTE, '', 0, 0);
const ZIEL = new Uint8Array(20).fill(0xee);
export const KONTEN = Array.from({ length: 40 }, (_, i) => keypairFromMnemonic(WORTE, '', 1, i));

export function knoten(opt: { port?: number; seeds?: { host: string; port: number }[]; txBuendelMs?: number } = {}) {
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

export function kette() {
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

export const UEBERWEISUNGEN = KONTEN.flatMap(k => Array.from({ length: 32 }, (_, n) => buildTransfer({
  chainId: REGTEST.chainId, from: k.addressRaw, to: ZIEL, amount: 1000n, fee: MIN_FEE,
  nonce: BigInt(n), publicKey: k.publicKey, privateKey: k.privateKey })));

