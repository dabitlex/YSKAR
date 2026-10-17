/**
 * Konsensfassung 6 an einer echten Aktivierungshoehe (CONSENSUS_V6.md 14).
 *
 * Die uebrigen v6-Tests laufen in REGTEST_V6, also mit Fassung 6 ab Block 0.
 * Hier liegt die Hoehe bei 5: Bloecke 0 bis 4 nach Fassung 5 (Version 1,
 * flacher Zustandsbaum), ab 5 nach Fassung 6 (Version 6, Sparse-Merkle-Baum).
 * Geprueft wird der Uebergang selbst -- durch den ChainManager, mit echtem
 * Mining im Testnetz:
 *
 *   - eine Kette ueber die Hoehe
 *   - ein Reorg zwischen zwei Zweigen, die beide ueber die Hoehe laufen
 *   - ein Knoten, der nach alten Regeln ueber die Hoehe hinaus weitergelaufen
 *     ist und danach aktualisiert wird
 *   - Mempool und Sendepause an der Grenze
 *   - Spiegel und Observer rechnen die Wurzel nach der Hoehe (stateRootAt)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2.js';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { workToBytes } from '../src/lib/node/fullnode/ChainWork.ts';
import { REGTEST, MAINNET, type ConsensusParams } from '../src/lib/core/networks.ts';
import { V6_HEIGHT_UNSET, V6_HEIGHT } from '../src/lib/core/params.ts';
import { emptyState, applyBlock, cloneState, stateRoot, stateRootV6, stateRootAt, type State }
  from '../src/lib/core/state.ts';
import * as T from '../src/lib/core/tx.ts';
import { keypairFromSeed } from '../src/lib/core/wallet.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { mineBlock, MINER_A, MINER_B, zeig, type Gemint } from './helpers/regtest.ts';

const HOEHE = 5;

/** Testnetz mit Fassung 6 ab Block 5. */
const GRENZE: ConsensusParams = {
  ...REGTEST,
  network: 'yskar-regtest-v6-grenze',
  chainId: sha256(new TextEncoder().encode('yskar-regtest-v6-grenze')),
  v6Height: HOEHE,
};

/** Dasselbe Netz, wie es ein nicht aktualisierter Knoten sieht: ohne Fassung 6. */
const ALT: ConsensusParams = { ...GRENZE, v6Height: V6_HEIGHT_UNSET };

const START = 1_788_912_000n;
const ALICE = keypairFromSeed(new Uint8Array(32).fill(1));
const BOB = keypairFromSeed(new Uint8Array(32).fill(2));

function knoten(params: ConsensusParams, store = neueAblage(params)) {
  return { store, chain: new ChainManager(store, params) };
}

function neueAblage(params: ConsensusParams): ChainStore {
  const store = new ChainStore(':memory:');
  store.setMeta('network', params.network);
  store.setMeta('chain_id', toHex(params.chainId));
  return store;
}

/**
 * Bloecke von `ab` bis `bis - 1` auf einen Zustand minen. `zustand` wird
 * fortgeschrieben, `prev` ist der Hash des Vorgaengers.
 */
function mine(params: ConsensusParams, zustand: State, prev: Uint8Array, ab: number, bis: number,
  opts: { miner?: Uint8Array; extra?: string; versatz?: bigint } = {}): Gemint[] {
  const out: Gemint[] = [];
  for (let h = ab; h < bis; h++) {
    const g = mineBlock({
      height: h, prevHash: prev, state: zustand,
      timestamp: START + BigInt(h) * params.targetBlockTime + (opts.versatz ?? 0n),
      miner: opts.miner, extra: opts.extra, params,
    });
    const r = applyBlock(zustand, g.block, params);
    if (!r.ok) throw new Error(`Block ${h} nicht anwendbar: ${r.error?.reason}`);
    out.push(g);
    prev = g.hash;
  }
  return out;
}

// ---------------------------------------------------------------- Kette

test('Grenze: Kette ueber die Aktivierungshoehe wird vollstaendig angenommen', () => {
  const z = emptyState();
  const bloecke = mine(GRENZE, z, new Uint8Array(32), 0, 9);
  const { store, chain } = knoten(GRENZE);
  for (const b of bloecke) {
    const r = chain.accept(b.body);
    assert.ok(r.ok, `Block ${b.block.header.height}: ${zeig(r)}`);
  }
  assert.equal(chain.height(), 8);

  // Version und Wurzel wechseln genau an der Hoehe.
  assert.equal(bloecke[HOEHE - 1].block.header.version, 1);
  assert.equal(bloecke[HOEHE].block.header.version, 6);
  const vorher = emptyState();
  for (const b of bloecke.slice(0, HOEHE)) applyBlock(vorher, b.block, GRENZE);
  assert.equal(toHex(bloecke[HOEHE - 1].block.header.stateRoot), toHex(stateRoot(vorher)));
  assert.equal(toHex(chain.tip()!.stateRoot), toHex(stateRootV6(chain.state())));
  assert.notEqual(toHex(stateRoot(chain.state())), toHex(stateRootV6(chain.state())));

  // Neustart auf derselben Ablage rechnet ueber die Hoehe dieselbe Wurzel.
  const neu = new ChainManager(store, GRENZE);
  assert.equal(neu.height(), 8);
  assert.equal(neu.alteBloeckeVerworfen, 0);
  assert.equal(toHex(stateRootV6(neu.state())), toHex(stateRootV6(chain.state())));
  store.close();
});

test('Grenze: Reorg zwischen zwei Zweigen ueber die Hoehe', () => {
  const basis = emptyState();
  const gemeinsam = mine(GRENZE, basis, new Uint8Array(32), 0, 3);
  const spitze = gemeinsam[2].hash;

  const za = cloneState(basis);
  const a = mine(GRENZE, za, spitze, 3, 7, { miner: MINER_A, extra: 'a' });
  const zb = cloneState(basis);
  const b = mine(GRENZE, zb, spitze, 3, 8, { miner: MINER_B, extra: 'b' });

  const { store, chain } = knoten(GRENZE);
  for (const g of [...gemeinsam, ...a]) assert.ok(chain.accept(g.body).ok);
  assert.equal(chain.height(), 6);
  assert.equal(toHex(chain.tip()!.hash), toHex(a[a.length - 1].hash));

  // Der laengere Zweig gewinnt; der Zustand ist der von Zweig B.
  for (const g of b) assert.ok(chain.accept(g.body).ok, zeig(g.block.header.height));
  assert.equal(chain.height(), 7);
  assert.equal(toHex(chain.tip()!.hash), toHex(b[b.length - 1].hash));
  assert.equal(toHex(stateRootV6(chain.state())), toHex(stateRootV6(zb)));
  assert.equal(toHex(chain.tip()!.stateRoot), toHex(stateRootV6(zb)));

  // Neustart nach dem Reorg: derselbe Zustand.
  const neu = new ChainManager(store, GRENZE);
  assert.equal(toHex(stateRootV6(neu.state())), toHex(stateRootV6(zb)));
  store.close();
});

// --------------------------------------------- Knoten mit alten Bloecken

test('Grenze: alte Bloecke ueber der Hoehe werden beim Start nach dem Update verworfen', () => {
  // Ein Knoten ohne Update minet nach alten Regeln ueber die Hoehe hinaus.
  const zAlt = emptyState();
  const alt = mine(ALT, zAlt, new Uint8Array(32), 0, 8, { extra: 'alt' });
  const store = neueAblage(GRENZE);
  const vorUpdate = new ChainManager(store, ALT);
  for (const g of alt) assert.ok(vorUpdate.accept(g.body).ok);
  assert.equal(vorUpdate.height(), 7);
  assert.equal(alt[HOEHE].block.header.version, 1, 'alte Regeln: Version 1 auch ueber der Hoehe');

  // Update: dieselbe Ablage, jetzt mit Fassung 6 ab Block 5. Frueher warf der
  // Start hier "Zustandswurzel weicht ab".
  const nachUpdate = new ChainManager(store, GRENZE);
  assert.equal(nachUpdate.alteBloeckeVerworfen, 3, 'Bloecke 5, 6 und 7');
  assert.equal(nachUpdate.height(), HOEHE - 1);
  assert.equal(toHex(nachUpdate.tip()!.hash), toHex(alt[HOEHE - 1].hash));
  for (const h of [5, 6, 7]) assert.equal(store.atHeight(h)[0].status, 'invalid');

  // Die richtigen Bloecke ab der Hoehe werden danach angenommen.
  const zNeu = emptyState();
  for (const g of alt.slice(0, HOEHE)) applyBlock(zNeu, g.block, GRENZE);
  const richtig = mine(GRENZE, zNeu, alt[HOEHE - 1].hash, HOEHE, 8, { extra: 'neu' });
  for (const g of richtig) {
    const r = nachUpdate.accept(g.body);
    assert.ok(r.ok, `Block ${g.block.header.height}: ${zeig(r)}`);
  }
  assert.equal(nachUpdate.height(), 7);
  assert.equal(toHex(nachUpdate.tip()!.hash), toHex(richtig[richtig.length - 1].hash));

  // Ein weiterer Start prueft nicht erneut und verwirft nichts Richtiges.
  const nochmal = new ChainManager(store, GRENZE);
  assert.equal(nochmal.alteBloeckeVerworfen, 0);
  assert.equal(nochmal.height(), 7);
  store.close();
});

test('Grenze: auch ein hoeherer, aber leichterer Seitenzweig alter Fassung wird verworfen', () => {
  // Alter Knoten: Hauptkette A bis 7, Seitenzweig B ab 3 bis 8.
  const basis = emptyState();
  const gemeinsam = mine(ALT, basis, new Uint8Array(32), 0, 3, { extra: 'alt' });
  const za = cloneState(basis);
  const a = mine(ALT, za, gemeinsam[2].hash, 3, 8, { miner: MINER_A, extra: 'a' });
  const zb = cloneState(basis);
  const b = mine(ALT, zb, gemeinsam[2].hash, 3, 9, { miner: MINER_B, extra: 'b' });

  const store = neueAblage(GRENZE);
  const vorUpdate = new ChainManager(store, ALT);
  for (const g of [...gemeinsam, ...a]) assert.ok(vorUpdate.accept(g.body).ok);
  for (const g of b) vorUpdate.accept(g.body);
  // B leichter machen als A, obwohl hoeher (wie bei abweichenden
  // Zeitstempeln unter LWMA): A bleibt aktiv, B8 liegt ueber der Spitze.
  const db = (store as unknown as { db: { prepare(q: string): { run(...a: unknown[]): void } } }).db;
  for (const g of b) db.prepare('UPDATE blocks SET chain_work = ?, main_chain = 0 WHERE hash = ?').run(workToBytes(1n), g.hash);
  for (const g of [...gemeinsam, ...a]) db.prepare('UPDATE blocks SET main_chain = 1 WHERE hash = ?').run(g.hash);
  assert.equal(store.height(), 7);
  assert.equal(store.maxHeight(), 8);

  const nachUpdate = new ChainManager(store, GRENZE);
  assert.equal(nachUpdate.height(), HOEHE - 1);
  for (const h of [5, 6, 7, 8]) {
    for (const blk of store.atHeight(h)) assert.equal(blk.status, 'invalid', `Hoehe ${h}`);
  }
  // Der beste gueltige Tip liegt nicht ueber der Hoehe - 1.
  assert.ok(store.bestTip()!.height <= HOEHE - 1);

  // Richtige Bloecke werden angenommen, ein Neustart laeuft durch.
  const zNeu = emptyState();
  for (const g of [...gemeinsam, ...a.slice(0, 2)]) applyBlock(zNeu, g.block, GRENZE);
  const richtig = mine(GRENZE, zNeu, a[1].hash, HOEHE, 7, { extra: 'neu' });
  for (const g of richtig) assert.ok(nachUpdate.accept(g.body).ok, zeig(g.block.header.height));
  assert.equal(new ChainManager(store, GRENZE).height(), 6);
  store.close();
});

test('Grenze: Knoten ohne Bloecke ueber der Hoehe verwirft nichts', () => {
  const z = emptyState();
  const bloecke = mine(GRENZE, z, new Uint8Array(32), 0, 4);
  const { store, chain } = knoten(GRENZE);
  for (const g of bloecke) assert.ok(chain.accept(g.body).ok);
  const neu = new ChainManager(store, GRENZE);
  assert.equal(neu.alteBloeckeVerworfen, 0);
  assert.equal(neu.height(), 3);
  store.close();
});

// ------------------------------------------------- Mempool und Wallets

test('Grenze: Fassung und Sendepause je Hoehe', () => {
  assert.equal(T.transferVersionAt(HOEHE - 1, HOEHE), T.TX_VERSION);
  assert.equal(T.transferVersionAt(HOEHE, HOEHE), T.TRANSFER_V2);
  // Pause in den drei Bloecken vor der Hoehe, nicht davor und nicht danach.
  assert.equal(T.sendepause(1, HOEHE), false);
  for (const h of [2, 3, 4]) assert.equal(T.sendepause(h, HOEHE), true, `Hoehe ${h}`);
  assert.equal(T.sendepause(HOEHE, HOEHE), false);
  assert.equal(T.sendepause(HOEHE + 1, HOEHE), false);
  // Ohne gesetzte Hoehe nie eine Pause.
  assert.equal(T.sendepause(1_000_000, V6_HEIGHT_UNSET), false);
});

test('Grenze: Ueberweisung Fassung 1 faellt an der Hoehe aus dem Mempool', () => {
  // Alice bekommt die Belohnungen der ersten Bloecke.
  const z = emptyState();
  mine(GRENZE, z, new Uint8Array(32), 0, 4, { miner: ALICE.addressRaw });

  const basis = { from: ALICE.addressRaw, to: BOB.addressRaw, amount: 1_000n, fee: 100_000n,
    nonce: 0n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: GRENZE.chainId };
  const v1 = T.buildTransfer(basis);
  const v2 = T.buildTransfer({ ...basis, version: T.TRANSFER_V2 });

  const pool = new TxPool(GRENZE);
  // Vor der Hoehe gilt nur Fassung 1.
  assert.ok(pool.add(v1, z, HOEHE - 1).ok, 'Fassung 1 vor der Hoehe');
  assert.equal(pool.add(v2, z, HOEHE - 1).ok, false, 'Fassung 2 vor der Hoehe');

  // Der naechste Block ist der an der Hoehe: Fassung 1 faellt heraus.
  const r = pool.nachBlock([], z, HOEHE);
  assert.equal(r.ungueltig, 1);
  assert.equal(pool.alle().length, 0);

  // Ab der Hoehe nimmt der Pool Fassung 2 an und Fassung 1 nicht.
  assert.ok(pool.add(v2, z, HOEHE).ok, 'Fassung 2 ab der Hoehe');
  assert.equal(pool.add(T.buildTransfer({ ...basis, nonce: 1n }), z, HOEHE).ok, false);
});

// ------------------------------------------------- Spiegel und Observer

test('Grenze: stateRootAt waehlt den Baum nach der Hoehe; REGTEST bleibt ohne Fassung 6', () => {
  const z = emptyState();
  mine(GRENZE, z, new Uint8Array(32), 0, 3);
  assert.equal(toHex(stateRootAt(z, HOEHE - 1, GRENZE)), toHex(stateRoot(z)));
  assert.equal(toHex(stateRootAt(z, HOEHE, GRENZE)), toHex(stateRootV6(z)));
  // Spiegel und Observer rufen stateRootAt ohne Netz auf, also mit MAINNET.
  assert.equal(MAINNET.v6Height, V6_HEIGHT);
  // REGTEST haengt nicht an der Mainnet-Hoehe (CONSENSUS_V6.md 2.1).
  assert.equal(REGTEST.v6Height, V6_HEIGHT_UNSET);
});
