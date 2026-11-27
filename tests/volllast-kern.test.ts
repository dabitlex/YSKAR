/**
 * Hauptknoten unter Andrang (Volllast-Konzept M1): gleiche Ergebnisse,
 * weniger Arbeit.
 *
 *  - Stapel-Signaturen bei der Aufnahme: addStapel == add je Eintrag,
 *    auch mit einer gefaelschten Signatur im Stapel.
 *  - Gebuehrenvorschau in Scheiben == am Stueck.
 *  - Vergleichsbau der Mining-Vorlage: bei Andrang nur Stichproben, sonst
 *    wie bisher jedes Mal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator, VORLAGE_STICHPROBE } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { vorschau, vorschauInScheiben } from '../src/lib/core/feemarket.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { txid } from '../src/lib/core/tx.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { aktiviereZip215Wasm } from '../src/lib/node/zip215.ts';
import { kette, UEBERWEISUNGEN } from './helpers/mempoolNetz.ts';

aktiviereZip215Wasm();
const HOEHE = 4;
function zustand() {
  const state = emptyState();
  for (const b of kette()) assert.ok(applyBlock(state, b.block, REGTEST).ok);
  return state;
}

test('addStapel nimmt genau dasselbe auf wie add -- auch mit einer gefälschten Signatur im Stapel', () => {
  const state = zustand();
  const txs = UEBERWEISUNGEN.slice(0, 300).map(t => ({ ...t }));
  // Eine Signatur fälschen, eine Überweisung doppelt einreichen.
  txs[123] = { ...txs[123], signature: new Uint8Array(txs[123].signature).map((b, i) => (i === 5 ? b ^ 1 : b)) };
  txs.push(txs[7]);

  const einzeln = new TxPool(REGTEST);
  const a = txs.map(t => einzeln.add(t, state, HOEHE));
  const gestapelt = new TxPool(REGTEST);
  const b = gestapelt.addStapel(txs.map(tx => ({ tx })), state, HOEHE);

  assert.deepEqual(b.map(r => (r.ok ? 'ok' : r.reason)), a.map(r => (r.ok ? 'ok' : r.reason)));
  assert.equal(b[123].ok ? 'ok' : b[123].reason, 'bad_signature');
  assert.equal(b[300].ok ? 'ok' : b[300].reason, 'duplicate');
  assert.deepEqual(gestapelt.alle().map(t => toHex(txid(t))).sort(), einzeln.alle().map(t => toHex(txid(t))).sort());
});

test('Gebührenvorschau in Scheiben ist dieselbe wie am Stück', async () => {
  const state = zustand();
  const pool = new TxPool(REGTEST);
  for (const t of UEBERWEISUNGEN) assert.ok(pool.add(t, state, HOEHE).ok);
  const mempool = pool.fuerBlock(HOEHE);
  const amStueck = vorschau(state, mempool, HOEHE, 8, 100, REGTEST, { vorgeprueft: true });
  let pausen = 0;
  const inScheiben = await vorschauInScheiben(state, mempool, HOEHE, 8, 100, REGTEST, { vorgeprueft: true },
    { pause: async () => { pausen++; } });
  assert.ok(inScheiben);
  assert.deepEqual(inScheiben!.bloecke, amStueck.bloecke);
  assert.deepEqual([...inScheiben!.plaetze].sort(), [...amStueck.plaetze].sort());
  assert.ok(pausen >= 8, 'eine Pause je Vorschaublock');
});

test('Vorschau in Scheiben bricht ab, wenn ein neuer Block sie entwertet', async () => {
  const state = zustand();
  const pool = new TxPool(REGTEST);
  for (const t of UEBERWEISUNGEN) assert.ok(pool.add(t, state, HOEHE).ok);
  let n = 0;
  const r = await vorschauInScheiben(state, pool.fuerBlock(HOEHE), HOEHE, 8, 100, REGTEST, {},
    { pause: async () => { n++; }, abbrechen: () => n >= 3 });
  assert.equal(r, null);
});

function knoten() {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  for (const b of kette()) assert.ok(chain.accept(b.body).ok);
  const pool = new TxPool(REGTEST);
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => 1_788_912_000n + 4n * REGTEST.targetBlockTime);
  return { store, chain, pool, mining };
}

test('Vorlage: im Normalbetrieb wird jede neue Vorlage verglichen', () => {
  const k = knoten();
  const miner = new Uint8Array(20).fill(0x42);
  for (let i = 0; i < 25; i++) {
    assert.ok(k.pool.add(UEBERWEISUNGEN[i * 32], k.chain.state(), k.chain.height() + 1).ok);
    k.mining.createJob(miner, BigInt(i));
  }
  assert.equal(k.mining.vollGeprueft, 25);
  assert.equal(k.mining.vorlageAn, true);
  k.store.close();
});

test('Vorlage: bei Andrang nur jede zehnte verglichen', () => {
  const k = knoten();
  const miner = new Uint8Array(20).fill(0x42);
  // Andrang nachstellen: Jede Vorlage gilt als teuer.
  k.mining.stichprobeAbMs = 0;
  for (let i = 0; i < 25; i++) {
    assert.ok(k.pool.add(UEBERWEISUNGEN[i * 32], k.chain.state(), k.chain.height() + 1).ok);
    k.mining.createJob(miner, BigInt(i));
  }
  // Erste Vorlage immer, danach bei Nummer 11 und 21.
  assert.equal(k.mining.vollGeprueft, Math.ceil(25 / VORLAGE_STICHPROBE));
  assert.equal(k.mining.vorlageAn, true);
  k.store.close();
});
