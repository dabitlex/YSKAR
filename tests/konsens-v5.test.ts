/**
 * Konsensfassung 5 (params.ts, V5_HEIGHT): ein Soft Fork mit vier Regeln.
 *
 *   1. Zeitstempel nicht vor dem des Vorgaengers (gleich ist erlaubt).
 *   2. Block genau so kodiert, wie serializeBlock schreibt; hoechstens 1 MiB.
 *   3. Coinbase nur Fassung 1 oder 2, `extra` hoechstens 32 Byte.
 *   4. Ausgaben einer Coinbase der Fassung 2 mindestens DUST_LIMIT.
 *
 * Jede Regel wird zweimal geprueft: mit REGTEST (Fassung 5 ab Block 0) wird
 * abgelehnt, mit VOR_V5 (Aktivierung weit hinten) wird derselbe Block
 * angenommen. Damit ist auch belegt, dass es ein Soft Fork ist: Alte Regeln
 * nehmen an, was die neuen verbieten -- nie umgekehrt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { REGTEST } from '../src/lib/core/networks.ts';
import { validateBlock, checkEncoding, checkParentTimestamp } from '../src/lib/core/validate.ts';
import { buildBlock, finalizeBlock } from '../src/lib/core/builder.ts';
import { emptyState, applyBlock, cloneState } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { rewardAt, DUST_LIMIT, MAX_BLOCK_BYTES, V5_HEIGHT } from '../src/lib/core/params.ts';
import { MAINNET } from '../src/lib/core/networks.ts';
import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { baueKette, mineBlock, MINER_A, MINER_B } from './helpers/regtest.ts';
import { abrechnen } from '../src/lib/pool/settlement.ts';

const VOR_V5 = { ...REGTEST, v5Height: 1_000_000 };
const adr = (n: number) => new Uint8Array(20).fill(n);

test('Das Mainnet aktiviert Fassung 5 bei Hoehe 7.000', () => {
  assert.equal(V5_HEIGHT, 7_000);
  assert.equal(MAINNET.v5Height, 7_000);
  assert.equal(REGTEST.v5Height, 0);
});

// ------------------------------------------------------------ 1. Zeitstempel

/** Kette 0..2 mit 600 s Abstand, dazu Block 3 mit dem gewuenschten Zeitstempel. */
function mitBlock3(versatz: bigint) {
  const k = baueKette(3);
  const vor = k.bloecke[2].block.header;
  const g = mineBlock({ height: 3, prevHash: k.bloecke[2].hash, state: k.state,
    timestamp: vor.timestamp + versatz, miner: MINER_B });
  const ts = k.bloecke.map(b => b.block.header.timestamp);
  const ctx = (params: typeof REGTEST) => ({
    previous: vor, state: k.state, recentTimestamps: ts,
    recentTimings: ts.slice(1).map((t, i) => ({ solveSeconds: t - ts[i], difficulty: 1n })),
    now: vor.timestamp + 1_000n, params,
  });
  return { k, g, ctx };
}

test('Zeitstempel vor dem Vorgaenger: ab Fassung 5 ungueltig, davor gueltig', () => {
  // 300 s vor dem Vorgaenger -- aber ueber dem Median der letzten Bloecke.
  const { g, ctx } = mitBlock3(-300n);
  assert.deepEqual(validateBlock(g.block, ctx(REGTEST)), { code: 'timestamp', detail: 'before_parent' });
  assert.equal(validateBlock(g.block, ctx(VOR_V5)), null);
});

test('Gleicher Zeitstempel wie der Vorgaenger bleibt gueltig', () => {
  const { g, ctx } = mitBlock3(0n);
  assert.equal(validateBlock(g.block, ctx(REGTEST)), null);
});

test('Zeitstempel-Regel auch im ChainManager (Vorpruefung vor dem Zustand)', () => {
  const { k, g } = mitBlock3(-1n);
  for (const [params, erwartet] of [[REGTEST, false], [VOR_V5, true]] as const) {
    const store = new ChainStore(':memory:');
    const chain = new ChainManager(store, params);
    for (const b of k.bloecke) assert.equal(chain.accept(b.body).ok, true);
    const r = chain.accept(g.body);
    assert.equal(r.ok, erwartet, `${params.v5Height}: ${(r as { grund?: string }).grund} ${(r as { detail?: string }).detail ?? ""}`);
    if (!erwartet) assert.equal((r as { grund: string }).grund, 'timestamp');
    store.close();
  }
});

test('checkParentTimestamp greift erst ab v5Height', () => {
  const h = (height: number, timestamp: bigint) => ({ height, timestamp }) as never;
  const p = { ...REGTEST, v5Height: 10 };
  assert.equal(checkParentTimestamp(h(9, 99n), h(8, 100n), p), null);
  assert.equal(checkParentTimestamp(h(10, 99n), h(9, 100n), p), 'before_parent');
  assert.equal(checkParentTimestamp(h(10, 100n), h(9, 100n), p), null);
});

// ------------------------------------------------------------ 2. Kodierung

test('Kodierung: Bytes hinten oder ueber 1 MiB ab Fassung 5 abgelehnt, davor nicht', () => {
  const k = baueKette(2);
  const b = k.bloecke[1];
  assert.equal(checkEncoding(b.body, b.block, REGTEST), null);
  const hinten = new Uint8Array(b.body.length + 1); hinten.set(b.body);
  assert.equal(checkEncoding(hinten, b.block, REGTEST), 'nicht_kanonisch');
  assert.equal(checkEncoding(hinten, b.block, VOR_V5), null);
  const riesig = new Uint8Array(MAX_BLOCK_BYTES + 1); riesig.set(b.body);
  assert.equal(checkEncoding(riesig, b.block, REGTEST), `block_zu_gross:${MAX_BLOCK_BYTES + 1}`);
});

// ------------------------------------------------------------ 3./4. Coinbase

/** Einen Block 1 auf leerem Zustand bauen (ohne Proof of Work -- applyBlock prueft keinen). */
function block1(opts: { extra?: number; anteile?: { to: Uint8Array; amount: bigint }[]; hoehe?: number; params?: typeof REGTEST }) {
  const hoehe = opts.hoehe ?? 1;
  const gebaut = buildBlock({
    params: opts.params ?? VOR_V5, height: hoehe, prevHash: new Uint8Array(32), state: emptyState(), mempool: [],
    minerAddress: MINER_A, timestamp: 1_788_912_600n, difficulty: 1n, extranonce: 0n,
    coinbaseExtra: new Uint8Array(opts.extra ?? 0), anteile: opts.anteile ? () => opts.anteile! : undefined,
  });
  return finalizeBlock(gebaut, 0n);
}
const anwenden = (block: ReturnType<typeof block1>, params: typeof REGTEST) =>
  applyBlock(cloneState(emptyState()), block, params);

test('Coinbase-Fassung ausser 1 und 2: ab Fassung 5 ungueltig, davor gueltig', () => {
  const b = block1({});
  (b.txs[0] as { version: number }).version = 7;
  assert.equal(anwenden(b, VOR_V5).ok, true);
  const r = anwenden(b, REGTEST);
  assert.equal(r.ok, false);
  assert.equal(r.error?.reason, 'coinbase_fassung:7');
});

test('Coinbase-extra ueber 32 Byte: ab Fassung 5 ungueltig; 32 Byte gueltig', () => {
  assert.equal(anwenden(block1({ extra: 32 }), REGTEST).ok, true);
  const b = block1({ extra: 33 });
  assert.equal(anwenden(b, VOR_V5).ok, true);
  assert.equal(anwenden(b, REGTEST).error?.reason, 'coinbase_extra:33');
});

test('Coinbase Fassung 2 mit Ausgabe unter der Staubgrenze: ab Fassung 5 ungueltig', () => {
  const brutto = rewardAt(1);
  const klein = [{ to: adr(1), amount: DUST_LIMIT - 1n }, { to: adr(2), amount: brutto - DUST_LIMIT + 1n }];
  const b = block1({ anteile: klein });
  assert.equal(anwenden(b, VOR_V5).ok, true);
  assert.equal(anwenden(b, REGTEST).error?.reason, 'coinbase_output_staub');
  const genau = [{ to: adr(1), amount: DUST_LIMIT }, { to: adr(2), amount: brutto - DUST_LIMIT }];
  assert.equal(anwenden(block1({ anteile: genau }), REGTEST).ok, true);
});

test('Coinbase Fassung 1 darf kleiner sein als die Staubgrenze (spaete Halbierungen)', () => {
  // Bei Hoehe 400.000 ist die Belohnung 10 Einheiten; ein Block ohne
  // Gebuehren muss trotzdem gueltig bleiben.
  const b = block1({ hoehe: 400_000 });
  assert.equal(rewardAt(400_000), 10n);
  assert.equal(anwenden(b, REGTEST).ok, true);
});

test('Pool nach Hoehe 360.000: Belohnung unter der Staubgrenze ergibt trotzdem einen gueltigen Block', () => {
  // Zwei Miner mit gleicher Arbeit, Belohnung 10 Einheiten, keine Gebuehren.
  const hoehe = 400_000;
  const brutto = rewardAt(hoehe);
  const r = abrechnen(brutto, [{ to: adr(1), work: 5n }, { to: adr(2), work: 5n }], 100, adr(9));
  assert.equal(r.fee, 0n, 'Gebuehr unter der Staubgrenze faellt weg');
  assert.equal(r.outputs.length, 1, 'einer bekommt alles');
  assert.equal(r.outputs[0].amount, brutto);
  assert.equal(r.ausgelassen.length, 1);
  // Der Blockbau macht daraus eine Coinbase der Fassung 1 -- gueltig ab Fassung 5.
  const b = block1({ hoehe, anteile: r.outputs, params: REGTEST });
  assert.equal(b.txs[0].version, 1);
  assert.equal(anwenden(b, REGTEST).ok, true);
  // Vor Fassung 5 bleibt es bei Fassung 2 wie bisher.
  const gebaut = buildBlock({
    params: VOR_V5, height: hoehe, prevHash: new Uint8Array(32), state: emptyState(), mempool: [],
    minerAddress: MINER_A, timestamp: 1_788_912_600n, difficulty: 1n, extranonce: 0n,
    anteile: () => r.outputs,
  });
  assert.equal(gebaut.block.txs[0].version, 2);
});

// ------------------------------------------------------------ Knoten

test('Jobs bekommen nie einen Zeitstempel vor dem Vorgaenger, auch wenn die Uhr nachgeht', () => {
  const k = baueKette(3);
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store, REGTEST);
  for (const b of k.bloecke) assert.equal(chain.accept(b.body).ok, true);
  const kopf = k.bloecke[2].block.header.timestamp;
  // Die Uhr des Knotens geht 2.000 s nach -- weit hinter dem Vorgaenger.
  const mining = new MiningCoordinator(chain, store, new TxPool(REGTEST), REGTEST, () => kopf - 2_000n);
  const job = mining.createJob(MINER_A, 0n);
  assert.equal(BigInt(job.timestamp), kopf);
  store.close();
});

test('bestTip: bei vielen Spitzen gleicher Arbeit gewinnt immer der kleinste Hash', () => {
  const store = new ChainStore(':memory:');
  const hashes: Uint8Array[] = [];
  for (let i = 0; i < 12; i++) {
    const hash = new Uint8Array(randomBytes(32));
    hashes.push(hash);
    store.put({ hash, height: 5, prevHash: new Uint8Array(32), chainWork: 1_000n, difficulty: 1n,
      blockTime: 0n, merkleRoot: new Uint8Array(32), stateRoot: new Uint8Array(32), txCount: 1,
      body: new Uint8Array(0), status: 'valid', mainChain: false });
  }
  const kleinster = hashes.map(toHex).sort()[0];
  assert.equal(toHex(store.bestTip()!.hash), kleinster);
  store.close();
});

test('Soft Fork: eine Kette nach den neuen Regeln nimmt ein Knoten mit alten Regeln an', () => {
  const k = baueKette(6);
  const store = new ChainStore(':memory:');
  const alt = new ChainManager(store, VOR_V5);
  for (const b of k.bloecke) assert.equal(alt.accept(b.body).ok, true);
  assert.equal(alt.height(), 5);
  store.close();
});
