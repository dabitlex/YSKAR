/**
 * Mempool-Pflege nach angenommenen Bloecken — durch die VOLLE Validierung.
 *
 * Diese Tests gibt es wegen zweier Fehler, die lange unbemerkt liefen:
 *
 *   1. Der Mempool wurde nur aufgeraeumt, wenn DIESER Knoten den Block
 *      selbst gefunden hatte. Kam er ueber das Netz, blieben enthaltene
 *      Ueberweisungen in der Warteschlange stehen.
 *   2. TxPool.zurueck() gab es seit jeher und wurde nie aufgerufen. Nach
 *      einem Reorg verschwanden Ueberweisungen aus verdraengten Bloecken
 *      ersatzlos.
 *
 * Es wird echt gemint und echt signiert -- dieselben Funktionen wie im
 * Betrieb, nur mit Testnetz-Difficulty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { mempoolNachziehen } from '../src/lib/node/fullnode/mempoolPflege.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { txid, buildTransfer, type Transfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { UNIT, MIN_FEE } from '../src/lib/core/params.ts';
import { emptyState, applyBlock, type State } from '../src/lib/core/state.ts';
import { mineBlock, zeig } from './helpers/regtest.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';

/** Der Miner ist zugleich Absender -- so ist die Ueberweisung gedeckt. */
const MINER = keypairFromMnemonic(WORTE, '', 0, 0);
const EMPFAENGER = new Uint8Array(20).fill(0xee);

function knoten() {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  return { store, chain: new ChainManager(store, REGTEST) };
}

const idVon = (t: Transfer) => toHex(txid(t));

function ueberweisung(nonce: bigint, betrag = UNIT): Transfer {
  return buildTransfer({ chainId: REGTEST.chainId,
    from: MINER.addressRaw, to: EMPFAENGER, amount: betrag,
    fee: MIN_FEE, nonce,
    publicKey: MINER.publicKey, privateKey: MINER.privateKey,
  });
}

/**
 * Eine Kette, in der MINER die Coinbase bekommt -- damit er Guthaben hat.
 * Gibt die gemintenen Bloecke und den Zustand danach zurueck.
 */
function ketteMitGuthaben(n: number, start = 1_788_912_000n) {
  const state: State = emptyState();
  const bloecke = [];
  let prev = new Uint8Array(32);
  for (let h = 0; h < n; h++) {
    const g = mineBlock({
      height: h, prevHash: prev, state,
      timestamp: start + BigInt(h) * REGTEST.targetBlockTime,
      miner: MINER.addressRaw,
    });
    const r = applyBlock(state, g.block, REGTEST);
    assert.ok(r.ok, `Block ${h} nicht anwendbar`);
    bloecke.push(g);
    prev = g.hash;
  }
  return { bloecke, state, prev, zeit: start + BigInt(n) * REGTEST.targetBlockTime };
}

// ---------------------------------------------------------------------------

test('Ein Block aus dem Netz nimmt die enthaltene Überweisung aus der Warteschlange', () => {
  const { store, chain } = knoten();
  const k = ketteMitGuthaben(3);
  for (const b of k.bloecke) assert.ok(chain.accept(b.body).ok);

  const pool = new TxPool(REGTEST);
  const tx = ueberweisung(0n);
  const add = pool.add(tx, chain.state(), chain.height() + 1);
  assert.ok(add.ok, `Aufnahme fehlgeschlagen: ${zeig(add)}`);
  assert.equal(pool.size(), 1);

  /*
    Der Block kommt von aussen -- dieser Knoten hat ihn NICHT gebaut. Vor
    der Korrektur lief hier keinerlei Mempool-Pflege, und die Ueberweisung
    blieb stehen.
  */
  const fremd = mineBlock({
    height: 3, prevHash: k.prev, state: k.state,
    timestamp: k.zeit, miner: MINER.addressRaw, mempool: [tx],
  });
  const r = chain.accept(fremd.body);
  assert.ok(r.ok && r.stored, `Block abgelehnt: ${zeig(r)}`);

  const e = mempoolNachziehen(r, pool, chain.state(), chain.height());

  assert.equal(e.entfernt, 1, 'die enthaltene Überweisung muss entfernt sein');
  assert.equal(pool.size(), 0);
  assert.equal(pool.has(idVon(tx)), false);
  store.close();
});

test('Nach einem Reorg kommt die Überweisung des verdrängten Blocks zurück', () => {
  const { store, chain } = knoten();
  const k = ketteMitGuthaben(3);
  for (const b of k.bloecke) assert.ok(chain.accept(b.body).ok);

  const pool = new TxPool(REGTEST);
  const tx = ueberweisung(0n);
  assert.ok(pool.add(tx, chain.state(), chain.height() + 1).ok);

  // Zweig 1: ein Block MIT der Überweisung.
  const mitTx = mineBlock({
    height: 3, prevHash: k.prev, state: k.state,
    timestamp: k.zeit, miner: MINER.addressRaw, mempool: [tx], extra: 'zweig-1',
  });
  const r1 = chain.accept(mitTx.body);
  assert.ok(r1.ok && r1.stored);
  mempoolNachziehen(r1, pool, chain.state(), chain.height());
  assert.equal(pool.size(), 0, 'nach dem Einbau ist sie draußen');

  /*
    Zweig 2 OHNE die Überweisung, dann eine Verlängerung darauf.

    WARUM NACH JEDEM BLOCK GEPFLEGT WIRD, und nicht erst am Ende: Bei
    gleicher Höhe und gleicher Arbeit entscheidet der Hash, welcher Zweig
    gewinnt. Der Umschwung kann also schon beim zweiten Block auf Höhe 3
    passieren oder erst bei der Verlängerung -- das hängt daran, welcher
    Hash zufällig kleiner ausfällt.

    Ein Test, der den Umschwung an einer bestimmten Stelle erwartet, würde
    mal grün und mal rot sein. Und er würde am Betrieb vorbeitesten: Dort
    wird nach JEDEM angenommenen Block gepflegt. Genau das macht dieser
    Test -- und prüft am Ende die Aussage, auf die es ankommt.
  */
  const ohneTx = mineBlock({
    height: 3, prevHash: k.prev, state: k.state,
    timestamp: k.zeit, miner: MINER.addressRaw, extra: 'zweig-2',
  });
  const r2 = chain.accept(ohneTx.body);
  assert.ok(r2.ok && r2.stored, `zweiter Block auf Höhe 3 abgelehnt: ${zeig(r2)}`);
  mempoolNachziehen(r2, pool, chain.state(), chain.height());

  // Zustand nach Zweig 2 für den Aufsatzpunkt des vierten Blocks.
  const zustand2: State = emptyState();
  for (const b of k.bloecke) applyBlock(zustand2, b.block, REGTEST);
  applyBlock(zustand2, ohneTx.block, REGTEST);

  const weiter = mineBlock({
    height: 4, prevHash: ohneTx.hash, state: zustand2,
    timestamp: k.zeit + REGTEST.targetBlockTime,
    miner: MINER.addressRaw, extra: 'zweig-2',
  });
  const r3 = chain.accept(weiter.body);
  assert.ok(r3.ok && r3.stored, `vierter Block abgelehnt: ${zeig(r3)}`);
  mempoolNachziehen(r3, pool, chain.state(), chain.height());

  // Zweig 2 hat jetzt mehr Arbeit und ist die aktive Kette.
  assert.equal(chain.height(), 4);
  assert.equal(toHex(chain.tip()!.hash), toHex(weiter.hash), 'Zweig 2 muss gewonnen haben');

  /*
    Die Überweisung steht in keinem Block der aktiven Kette mehr. Sie war
    bezahlt und gültig -- sie gehört zurück in die Warteschlange, sonst
    verschwindet sie, weil anderswo ein Block gewonnen hat.
  */
  assert.equal(pool.has(idVon(tx)), true, 'sie muss wieder in der Warteschlange stehen');
  store.close();
});

test('Eine bloße Verlängerung meldet keinen Reorg und keine verdrängten Blöcke', () => {
  const { store, chain } = knoten();
  const k = ketteMitGuthaben(3);
  for (const b of k.bloecke) assert.ok(chain.accept(b.body).ok);

  const weiter = mineBlock({
    height: 3, prevHash: k.prev, state: k.state,
    timestamp: k.zeit, miner: MINER.addressRaw,
  });
  const r = chain.accept(weiter.body);
  assert.ok(r.ok && r.stored);
  assert.equal(r.reorg, false);
  assert.equal(r.verdraengt.length, 0);
  assert.equal(r.neu.length, 1, 'genau der eine neue Block');
  store.close();
});

test('Eine Überweisung, die der neue Zustand nicht mehr deckt, fällt raus', () => {
  const { store, chain } = knoten();
  const k = ketteMitGuthaben(3);
  for (const b of k.bloecke) assert.ok(chain.accept(b.body).ok);

  const pool = new TxPool(REGTEST);
  /*
    Zwei Überweisungen mit DERSELBEN Nonce sind nicht gleichzeitig möglich --
    deshalb nacheinander: Erst kommt Nonce 0 in den Block, danach ist die
    zweite mit Nonce 0 wertlos.
  */
  const ersteImBlock = ueberweisung(0n);
  const zweiteMitGleicherNonce = ueberweisung(0n, UNIT * 2n);

  assert.ok(pool.add(zweiteMitGleicherNonce, chain.state(), chain.height() + 1).ok);
  assert.equal(pool.size(), 1);

  const block = mineBlock({
    height: 3, prevHash: k.prev, state: k.state,
    timestamp: k.zeit, miner: MINER.addressRaw, mempool: [ersteImBlock],
  });
  const r = chain.accept(block.body);
  assert.ok(r.ok && r.stored);

  const e = mempoolNachziehen(r, pool, chain.state(), chain.height());

  assert.equal(e.ungueltig, 1, 'die verbrauchte Nonce macht sie ungültig');
  assert.equal(pool.size(), 0);
  store.close();
});
