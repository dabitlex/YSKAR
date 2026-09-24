/**
 * Pool-Mining, Ende zu Ende.
 *
 * Nicht die Abrechnung für sich — die ist in pool-settlement.test.ts
 * geprüft. Hier geht es um den Weg: Shares kommen herein, daraus entsteht
 * eine Coinbase mit mehreren Empfängern, und der Knoten nimmt den Block an.
 *
 * Der letzte Schritt ist der eigentliche Beweis. Eine Aufteilung, die der
 * Konsens ablehnt, wäre wertlos — und die Summe muss dafür auf die
 * kleinste Einheit stimmen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { deserializeBlock } from '../src/lib/core/block.ts';
import { coinbaseTotal, TX_COINBASE, type Coinbase } from '../src/lib/core/tx.ts';
import { rewardAt } from '../src/lib/core/params.ts';
import { nameToExtra, finderName } from '../src/lib/chain/finderName.ts';

const A = new Uint8Array(20).fill(0xa1);
const B = new Uint8Array(20).fill(0xb2);
const C = new Uint8Array(20).fill(0xc3);
const BETREIBER = new Uint8Array(20).fill(0xee);

/*
  Netz-Difficulty für die Fenstergröße.

  Das PPLNS-Fenster ist doppelt so groß wie die Netz-Difficulty. Mit dem
  Regtest-Wert 1 wäre es 2 Arbeitseinheiten groß, und nur der jüngste Share
  läge darin -- die Aufteilung hätte dann genau einen Empfänger.

  Hier 1000, also ein Fenster von 2000. Die Shares unten summieren sich auf
  600 und liegen damit vollständig darin.
*/
const NETZ = 1000n;

function knoten() {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, new TxPool(), REGTEST,
    () => { const t = uhr; uhr += REGTEST.targetBlockTime; return t; });
  return { store, chain, mining };
}

function pool(feeBps = 0) {
  return new PoolCoordinator({
    name: 'pool.yskar.net', feeBps,
    payoutAddress: feeBps > 0 ? BETREIBER : null,
  });
}

/** Einen Block minen und zurückgeben, was in der Kette landete. */
function mine(k: ReturnType<typeof knoten>, job: { jobId: string }) {
  for (let n = 0n; n < 20_000_000n; n++) {
    const r = k.mining.submitNonce(job.jobId, n);
    if (r.ok && r.block) return r;
  }
  throw new Error('kein Block gefunden');
}

// ------------------------------------------------------------ Aufteilung

test('Drei Miner teilen sich einen Block nach geleisteter Arbeit', () => {
  const k = knoten();
  const p = pool();
  // Arbeit im Verhältnis 3 : 2 : 1
  p.share(A, 300n); p.share(B, 200n); p.share(C, 100n);

  const job = k.mining.createJob(A, 1n, new Uint8Array(0),
    brutto => p.coinbase(0, 0n, NETZ)!.outputs.map(o => ({ ...o })));
  mine(k, job);

  const cb = deserializeBlock(k.store.mainAt(0)!.body).txs[0] as Coinbase;
  assert.equal(cb.type, TX_COINBASE);
  assert.equal(cb.version, 2, 'muss Coinbase Fassung 2 sein');
  assert.equal(cb.outputs.length, 3, 'drei Empfänger');

  // Die Summe muss EXAKT stimmen, sonst hätte der Knoten abgelehnt.
  assert.equal(coinbaseTotal(cb), rewardAt(0));

  const anteil = (adr: Uint8Array) =>
    cb.outputs.find(o => toHex(o.to) === toHex(adr))!.amount;
  assert.ok(anteil(A) > anteil(B), 'wer mehr arbeitet, bekommt mehr');
  assert.ok(anteil(B) > anteil(C));
  k.store.close();
});

test('Der Block wird vom Knoten vollständig geprüft und angenommen', () => {
  /*
    Der eigentliche Beweis. submitNonce() lässt den Block durch dieselbe
    Validierung laufen wie jeden anderen -- eine Aufteilung, deren Summe
    nicht stimmt, käme hier nicht durch.
  */
  const k = knoten();
  const p = pool();
  p.share(A, 100n); p.share(B, 100n);

  const job = k.mining.createJob(A, 1n, new Uint8Array(0),
    () => p.coinbase(0, 0n, NETZ)!.outputs.map(o => ({ ...o })));
  const r = mine(k, job);

  assert.equal(r.ok, true);
  assert.equal(r.block, true);
  assert.equal(k.chain.height(), 0);
  assert.ok(k.store.mainAt(0), 'Block steht in der Kette');
  k.store.close();
});

test('Ohne Shares entsteht eine gewöhnliche Coinbase', () => {
  // Ein Pool ohne Teilnehmer mint für sich selbst, statt gar nicht zu
  // minen. Ein Block ohne Empfänger wäre ungültig.
  const k = knoten();
  const p = pool();

  const job = k.mining.createJob(A, 1n, new Uint8Array(0),
    () => p.coinbase(0, 0n, NETZ)?.outputs ?? []);
  mine(k, job);

  const cb = deserializeBlock(k.store.mainAt(0)!.body).txs[0] as Coinbase;
  assert.equal(cb.outputs.length, 1);
  assert.equal(cb.version, 1, 'Fassung 1 bleibt für immer gültig');
  assert.equal(toHex(cb.outputs[0].to), toHex(A));
  k.store.close();
});

// ----------------------------------------------------------------- Gebühr

test('Die Gebühr geht an den Betreiber, der Rest an die Miner', () => {
  const k = knoten();
  const p = pool(100);           // 1,00 %
  p.share(A, 100n); p.share(B, 100n);

  const job = k.mining.createJob(A, 1n, new Uint8Array(0),
    () => p.coinbase(0, 0n, NETZ)!.outputs.map(o => ({ ...o })));
  mine(k, job);

  const cb = deserializeBlock(k.store.mainAt(0)!.body).txs[0] as Coinbase;
  assert.equal(cb.outputs.length, 3, 'zwei Miner plus Betreiber');
  assert.equal(coinbaseTotal(cb), rewardAt(0), 'die Summe bleibt exakt');

  const gebuehr = cb.outputs.find(o => toHex(o.to) === toHex(BETREIBER))!.amount;
  // Abgerundet, zugunsten der Miner.
  assert.ok(gebuehr <= rewardAt(0) / 100n, 'Gebühr wird abgerundet');
  assert.ok(gebuehr > 0n);
  k.store.close();
});

// ------------------------------------------------------- Name im Block

test('Ein Pool-Block trägt den Namen des Pools', () => {
  const k = knoten();
  const p = pool();
  p.share(A, 100n);

  const job = k.mining.createJob(A, 1n, nameToExtra('pool.yskar.net'),
    () => p.coinbase(0, 0n, NETZ)!.outputs.map(o => ({ ...o })));
  mine(k, job);

  const cb = deserializeBlock(k.store.mainAt(0)!.body).txs[0] as Coinbase;

  assert.equal(finderName(toHex(cb.extra)), 'pool.yskar.net');
  k.store.close();
});

// --------------------------------------------------- Gebühren im Block

test('Transaktionsgebühren landen mit in der Aufteilung', () => {
  /*
    Die Aufteilung wird als Funktion übergeben, weil die Bruttosumme erst
    feststeht, wenn der Blockbau die Transaktionen gewählt hat. Ginge das
    schief, wäre die Summe falsch und der Block ungültig.
  */
  const k = knoten();
  const p = pool();
  p.share(A, 100n); p.share(B, 50n);

  let gesehen: bigint | null = null;
  const job = k.mining.createJob(A, 1n, new Uint8Array(0), brutto => {
    gesehen = brutto;
    const a = p.coinbase(0, 0n, NETZ)!;
    const out = a.outputs.map(o => ({ ...o }));
    const summe = out.reduce((m, o) => m + o.amount, 0n);
    out[0].amount += brutto - summe;      // Differenz auf den ersten
    return out;
  });
  mine(k, job);

  assert.equal(gesehen, rewardAt(0), 'die Funktion bekommt die echte Summe');
  const cb = deserializeBlock(k.store.mainAt(0)!.body).txs[0] as Coinbase;
  assert.equal(coinbaseTotal(cb), rewardAt(0));
  k.store.close();
});
