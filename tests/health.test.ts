/**
 * GET /api/v2/health -- ok, degraded, down; 503 nur bei down.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import {
  MiningServer, GESUND_BLOCK_WARN_S, GESUND_BLOCK_DOWN_S, GESUND_ZURUECK_WARN, GESUND_ZURUECK_DOWN,
} from '../src/lib/node/fullnode/MiningServer.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { baueKette } from './helpers/regtest.ts';

async function knoten(port?: number) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  const mining = new MiningCoordinator(chain, store, pool, REGTEST);
  for (const g of baueKette(3).bloecke) assert.ok(chain.accept(g.body).ok);
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  if (port) await server.listen('127.0.0.1', port);
  const tipZeit = Number(chain.tip()!.blockTime);
  return { server, tipZeit, async zu() { if (port) await server.close(); store.close(); } };
}

test('Frischer Block, Peers da, nicht zurueck: ok', async () => {
  const k = await knoten();
  try {
    k.server.gesundheitsDaten = () => ({ version: '1.0.2', build: 'ab', p2p: true, peers: 5, besterPeerHoehe: 2 });
    const g = k.server.gesundheit(k.tipZeit + 120);
    assert.equal(g.status, 'ok');
    assert.equal(g.version, '1.0.2');
    assert.equal(g.checks.chain.lastBlockAgeSec, 120);
    assert.equal(g.checks.peers.count, 5);
    assert.equal(g.checks.sync.behind, 0);
  } finally { await k.zu(); }
});

test('Lange kein Block: erst degraded, nach Stunden down', async () => {
  const k = await knoten();
  try {
    k.server.gesundheitsDaten = () => ({ p2p: true, peers: 3, besterPeerHoehe: null });
    assert.equal(k.server.gesundheit(k.tipZeit + GESUND_BLOCK_WARN_S + 1).status, 'degraded');
    assert.equal(k.server.gesundheit(k.tipZeit + GESUND_BLOCK_DOWN_S + 1).status, 'down');
  } finally { await k.zu(); }
});

test('Keine Peers: degraded; ohne Knotennetz (--no-p2p) kein Abzug', async () => {
  const k = await knoten();
  try {
    k.server.gesundheitsDaten = () => ({ p2p: true, peers: 0, besterPeerHoehe: null });
    const g = k.server.gesundheit(k.tipZeit + 60);
    assert.equal(g.status, 'degraded');
    assert.equal(g.checks.peers.detail, 'no peers');
    k.server.gesundheitsDaten = () => ({ p2p: false });
    assert.equal(k.server.gesundheit(k.tipZeit + 60).status, 'ok');
  } finally { await k.zu(); }
});

test('Hinter den Peers: ein paar Bloecke degraded, weit zurueck down', async () => {
  const k = await knoten();
  try {
    k.server.gesundheitsDaten = () => ({ p2p: true, peers: 2, besterPeerHoehe: 2 + GESUND_ZURUECK_WARN + 1 });
    assert.equal(k.server.gesundheit(k.tipZeit + 60).status, 'degraded');
    k.server.gesundheitsDaten = () => ({ p2p: true, peers: 2, besterPeerHoehe: 2 + GESUND_ZURUECK_DOWN + 1 });
    const g = k.server.gesundheit(k.tipZeit + 60);
    assert.equal(g.status, 'down');
    assert.equal(g.checks.sync.behind, GESUND_ZURUECK_DOWN + 1);
  } finally { await k.zu(); }
});

test('HTTP: 503 nur bei down, keine Adressen in der Antwort, kein Absturz bei kaputten Zusatzdaten', async () => {
  const k = await knoten(18_951);
  try {
    // Die Testkette ist von 2026-09: aus heutiger Sicht seit Stunden kein Block -> down -> 503.
    k.server.gesundheitsDaten = () => ({ p2p: true, peers: 1, besterPeerHoehe: 2 });
    const r = await fetch('http://127.0.0.1:18951/api/v2/health');
    assert.equal(r.status, 503);
    const text = await r.text();
    assert.equal(JSON.parse(text).status, 'down');
    assert.doesNotMatch(text, /\d+\.\d+\.\d+\.\d+/, 'keine IP-Adressen');

    k.server.gesundheitsDaten = () => { throw new Error('kaputt'); };
    const r2 = await fetch('http://127.0.0.1:18951/api/v2/health');
    assert.equal(r2.status, 503);
  } finally { await k.zu(); }
});

test('Ohne Kette: down mit Begruendung', async () => {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  const server = new MiningServer({ chain, store, pool, mining: new MiningCoordinator(chain, store, pool, REGTEST) }, { params: REGTEST });
  const g = server.gesundheit();
  assert.equal(g.status, 'down');
  assert.equal(g.checks.chain.detail, 'no chain');
  store.close();
});
