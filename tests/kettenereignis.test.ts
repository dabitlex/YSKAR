/**
 * Reorg-Erkennung (kettenEreignis.ts).
 *
 * Der Kern der Anforderung: Ein normaler neuer Block, mehrere Bloecke auf
 * einmal, ein Konkurrenzblock auf einem Nebenzweig und eine echte
 * Reorganisation muessen sicher auseinandergehalten werden. Entscheidend
 * ist allein, ob Bloecke die aktive Kette verlassen haben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager, type AcceptResult } from '../src/lib/node/fullnode/ChainManager.ts';
import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import { SyncManager } from '../src/lib/node/p2p/SyncManager.ts';
import { ordneEin, KettenBeobachter, type KettenEreignis } from '../src/lib/node/fullnode/kettenEreignis.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { baueKette, zweig, MINER_B, zeig } from './helpers/regtest.ts';

type Gespeichert = Extract<AcceptResult, { stored: true }>;

/** Ein gespeicherter Block, wie ihn accept() in neu/verdraengt liefert -- nur die Felder, die zaehlen. */
const blk = (height: number, byte: number) =>
  ({ hash: new Uint8Array(32).fill(byte), height }) as unknown as Gespeichert['neu'][number];

const ergebnis = (teile: Partial<Gespeichert>): Gespeichert => ({
  ok: true, stored: true, reorg: false, height: 10, tip: new Uint8Array(32).fill(0xaa),
  neu: [], verdraengt: [], ...teile,
});

// ------------------------------------------------------------ Einordnung

test('Ein Block, nichts verdraengt: verlaengert', () => {
  const e = ordneEin(ergebnis({ neu: [blk(10, 1)] }), 10);
  assert.equal(e.art, 'verlaengert');
  assert.equal(e.tiefe, 0);
  assert.equal(e.alterKopf, null);
});

test('Mehrere Bloecke aktiviert, nichts verdraengt: aufgeholt -- auch wenn accept() reorg meldet', () => {
  // Genau der Fall, in dem das alte Feld `reorg` true ist, obwohl kein
  // Block seinen Platz verloren hat.
  const e = ordneEin(ergebnis({ reorg: true, neu: [blk(8, 1), blk(9, 2), blk(10, 3)] }), 10);
  assert.equal(e.art, 'aufgeholt');
  assert.equal(e.tiefe, 0);
  assert.equal(e.neu, 3);
});

test('Kein Block aktiviert: nebenzweig, die aktive Kette bleibt', () => {
  const e = ordneEin(ergebnis({ height: 10 }), 10);
  assert.equal(e.art, 'nebenzweig');
  assert.equal(e.blockHoehe, 10);
  assert.equal(e.kopfHoehe, 10);
});

test('Bloecke verdraengt: reorg mit Tiefe, altem Kopf und Abzweighoehe -- Reihenfolge der Liste egal', () => {
  const e = ordneEin(ergebnis({
    reorg: true, height: 11,
    neu: [blk(8, 0x11), blk(9, 0x12), blk(10, 0x13), blk(11, 0x14)],
    verdraengt: [blk(10, 0x23), blk(8, 0x21), blk(9, 0x22)],
  }), 11);
  assert.equal(e.art, 'reorg');
  assert.equal(e.tiefe, 3);
  assert.equal(e.abzweigHoehe, 7);
  assert.equal(e.alterKopf, '23'.repeat(32));
  assert.equal(e.neuerKopf, 'aa'.repeat(32));
});

test('Beobachter zaehlt nur echte Reorgs und Konkurrenzbloecke', () => {
  let jetzt = 1_000_000;
  const b = new KettenBeobachter(() => jetzt);
  b.nimm(ordneEin(ergebnis({ neu: [blk(10, 1)] }), 10));
  b.nimm(ordneEin(ergebnis({ reorg: true, neu: [blk(9, 1), blk(10, 2)] }), 10));
  b.nimm(ordneEin(ergebnis({}), 10));
  jetzt = 2_000_000;
  b.nimm(ordneEin(ergebnis({ neu: [blk(10, 1), blk(11, 2)], verdraengt: [blk(10, 3)], height: 11 }), 11));
  b.nimm(ordneEin(ergebnis({ neu: [blk(9, 1), blk(10, 2), blk(11, 3), blk(12, 4)],
    verdraengt: [blk(9, 5), blk(10, 6), blk(11, 7)], height: 12 }), 12));
  const s = b.stand() as { reorgs: { count: number; deepest: number; last: { tiefe: number; hoehe: number; zeit: number } }; forks: { count: number } };
  assert.equal(s.reorgs.count, 2);
  assert.equal(s.reorgs.deepest, 3);
  assert.equal(s.reorgs.last.tiefe, 3);
  assert.equal(s.reorgs.last.hoehe, 12);
  assert.equal(s.reorgs.last.zeit, 2000);
  assert.equal(s.forks.count, 1);
});

// -------------------------------------------------- Mit echtem ChainManager

function manager() {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  return { store, chain: new ChainManager(store, REGTEST) };
}

function nimm(chain: ChainManager, g: { body: Uint8Array; block: { header: { height: number } } }): KettenEreignis {
  const r = chain.accept(g.body);
  assert.ok(r.ok && r.stored, `nicht angenommen: ${zeig(r)}`);
  return ordneEin(r as Gespeichert, g.block.header.height);
}

test('ChainManager: normale Bloecke, Konkurrenzblock, Reorg der Tiefe 1', () => {
  const { store, chain } = manager();
  const kette = baueKette(6);
  for (const g of kette.bloecke) assert.equal(nimm(chain, g).art, 'verlaengert');

  // Konkurrenzblock zur Spitze (Hoehe 5): gleiche Arbeit, die Kette bleibt.
  const neben = zweig(kette, 5, 2, { miner: MINER_B, extra: 'eins' });
  const e1 = nimm(chain, neben[0]);
  assert.equal(e1.art, 'nebenzweig');
  assert.equal(e1.blockHoehe, 5);
  assert.equal(chain.height(), 5);

  // Der naechste Block dieses Zweigs hat mehr Arbeit: Block 5 wird verdraengt.
  const e2 = nimm(chain, neben[1]);
  assert.equal(e2.art, 'reorg');
  assert.equal(e2.tiefe, 1);
  assert.equal(e2.abzweigHoehe, 4);
  assert.equal(e2.alterKopf, toHex(kette.bloecke[5].hash));
  assert.equal(e2.neuerKopf, toHex(neben[1].hash));
  assert.equal(chain.height(), 6);
  store.close();
});

test('ChainManager: Reorg der Tiefe 3', () => {
  const { store, chain } = manager();
  const kette = baueKette(6);
  for (const g of kette.bloecke) nimm(chain, g);

  // Zweig ab Hoehe 3 mit 4 Bloecken (3, 4, 5, 6): erst gleich schwer, dann schwerer.
  const anders = zweig(kette, 3, 4, { miner: MINER_B, extra: 'drei' });
  const arten = anders.map(g => nimm(chain, g));
  assert.deepEqual(arten.slice(0, 3).map(e => e.art), ['nebenzweig', 'nebenzweig', 'nebenzweig']);
  assert.equal(arten[3].art, 'reorg');
  assert.equal(arten[3].tiefe, 3, 'Bloecke 3, 4 und 5 verlassen die aktive Kette');
  assert.equal(arten[3].abzweigHoehe, 2);
  assert.equal(arten[3].neu, 4);
  assert.equal(chain.height(), 6);
  store.close();
});

// --------------------------------------------------- Ueber das Knotennetz

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
let port = 19760 + Math.floor(Math.random() * 40);

function knoten(opt: { port?: number; seeds?: { host: string; port: number }[] } = {}) {
  const { store, chain } = manager();
  const ereignisse: KettenEreignis[] = [];
  let sync: SyncManager;
  const peers = new PeerManager({
    params: REGTEST, agent: 'test/0.1', listenPort: opt.port ?? 0, host: '127.0.0.1', seeds: opt.seeds,
    kette: () => { const t = chain.tip(); return { height: t?.height ?? -1, chainWork: t?.chainWork ?? 0n }; },
    onReady: p => sync.aufPeer(p),
    onMessage: (p, f) => sync.aufNachricht(p, f),
  });
  sync = new SyncManager({
    chain, store, peers, params: REGTEST,
    onBlock: (_h, _hash, _von, e) => { if (e) ereignisse.push(e); },
  });
  return {
    chain, sync, ereignisse,
    async start() { await peers.start(); sync.start(); },
    async stop() { sync.stop(); await peers.stop(); store.close(); },
  };
}

test('Ueber P2P: ein Reorg kommt beim Empfaenger als genau ein Reorg mit der richtigen Tiefe an', async () => {
  const basis = baueKette(4);
  const pA = port++;
  const a = knoten({ port: pA });
  await a.start();
  for (const g of basis.bloecke) assert.ok(a.chain.accept(g.body).ok);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1200);
  assert.equal(b.chain.height(), 3);
  // Beim Aufholen: nur normale Bloecke, kein Reorg.
  assert.ok(b.ereignisse.every(e => e.art === 'verlaengert'), zeig(b.ereignisse.map(e => e.art)));
  b.ereignisse.length = 0;

  // A baut einen laengeren Zweig ab Hoehe 2 (Bloecke 2', 3', 4', 5').
  const laenger = zweig(basis, 2, 4, { miner: MINER_B });
  for (const g of laenger) assert.ok(a.chain.accept(g.body).ok);
  a.sync.kuendigeAn(laenger[laenger.length - 1].hash);
  await warte(1500);

  assert.equal(b.chain.height(), 5);
  const reorgs = b.ereignisse.filter(e => e.art === 'reorg');
  assert.equal(reorgs.length, 1, zeig(b.ereignisse.map(e => e.art)));
  assert.equal(reorgs[0].tiefe, 2, 'Bloecke 2 und 3 des alten Zweigs verlassen die aktive Kette');
  assert.equal(reorgs[0].abzweigHoehe, 1);
  assert.equal(reorgs[0].alterKopf, toHex(basis.bloecke[3].hash));
  // Vor dem Reorg: Konkurrenzbloecke, danach: normale Verlaengerung.
  assert.ok(b.ereignisse.some(e => e.art === 'nebenzweig'));

  await a.stop(); await b.stop();
});
