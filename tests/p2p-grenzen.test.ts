/**
 * Grenzen im Austausch zwischen Knoten (Befund S4, Teil B).
 *
 *   - Header unter der Untergrenze der Kette, mit falscher Hoehe oder ohne
 *     Anschluss werden nicht eingereiht.
 *   - Header, deren Koerper nie kommt, verlassen die Warteschlange nach
 *     WARTEND_VERSUCHE_MAX vergeblichen Bestellungen -- mit allem, was auf
 *     ihnen aufbaut.
 *   - getdata wird hoechstens mit BLOCK_FENSTER Bloecken beantwortet;
 *     getheaders hoechstens GETHEADERS_JE_FENSTER mal je Fenster; was
 *     darueber geht oder bei vollem Sendepuffer kommt, wird zurueckgestellt
 *     und im Takt beantwortet -- nicht verworfen.
 *   - Angeforderte Ueberweisungen haben eine Frist und eine Obergrenze.
 *   - Eine Verbindung, deren Sendepuffer ueber SENDEPUFFER_MAX waechst,
 *     wird getrennt.
 *
 * Die Gegenseite spielt der Test selbst (wie in p2p-abgleich-lang.test.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect, type Socket } from 'node:net';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import {
  SyncManager, WARTEND_VERSUCHE_MAX, BLOCK_FENSTER, GETHEADERS_JE_FENSTER, GETHEADERS_FENSTER_MS,
  OFFENE_TX_MAX, ANTWORT_PUFFER_MAX,
} from '../src/lib/node/p2p/SyncManager.ts';
import { PeerConnection, SENDEPUFFER_MAX } from '../src/lib/node/p2p/PeerConnection.ts';
import {
  encodeHeaders, encodeGetHeaders, encodeGetData, decodeGetData, decodeInv, encodeInv,
  encodeNotFound, INV_BLOCK, INV_TX,
} from '../src/lib/node/p2p/messages.ts';
import { REGTEST, type ConsensusParams } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { baueKette, mineBlock, MINER_B, type Kette, type Gemint } from './helpers/regtest.ts';

let _kette: Kette | null = null;
const kette = (): Kette => (_kette ??= baueKette(40));
const headerVon = (bl: Gemint[]) => encodeHeaders(bl.map(b => b.body.slice(0, 136)));

function gegenseite(name: string, puffer = 0) {
  const g = {
    host: name, port: 8646, ready: true, puffer,
    bekommen: [] as { befehl: string; payload: Uint8Array }[],
    getrennt: [] as string[],
    send(befehl: string, payload: Uint8Array) { if (!g.ready) return false; g.bekommen.push({ befehl, payload }); return true; },
    close(grund: string) { g.getrennt.push(grund); g.ready = false; },
    fremdeArbeit: () => 1_000_000n,
    sendePuffer: () => g.puffer,
    zahl: (b: string) => g.bekommen.filter(x => x.befehl === b).length,
  };
  return g;
}
type Gegenseite = ReturnType<typeof gegenseite>;
const alsPeer = (g: Gegenseite) => g as unknown as PeerConnection;

function knoten(opt: { bloecke?: number; params?: ConsensusParams; mitPool?: boolean; gegen?: Gegenseite[] } = {}) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  for (const b of kette().bloecke.slice(0, opt.bloecke ?? 0)) assert.ok(chain.accept(b.body).ok);
  const gs = opt.gegen ?? [];
  const peers = {
    bereite: () => gs.filter(g => g.ready).map(alsPeer),
    besterPeer: () => (gs.find(g => g.ready) ? alsPeer(gs.find(g => g.ready)!) : null),
    kuendigeAn: () => 0,
  };
  const pool = opt.mitPool ? new TxPool(REGTEST) : undefined;
  const sync = new SyncManager({ chain, store, peers: peers as any, params: opt.params ?? REGTEST, pool, maxHeaders: 50 });
  const sende = (g: Gegenseite, command: string, payload: Uint8Array) =>
    sync.aufNachricht(alsPeer(g), { command: command as any, payload });
  return { store, chain, sync, sende, innen: sync as any, zu: () => store.close() };
}

// ------------------------------------------------------------------ Header

test('Header unter der Untergrenze der Kette: getrennt, nichts eingereiht', () => {
  const g = gegenseite('203.0.113.1');
  // Ein Netz, dessen Untergrenze ueber der Difficulty der Testkette liegt.
  const k = knoten({ bloecke: 1, params: { ...REGTEST, minDifficulty: 2n }, gegen: [g] });
  k.sende(g, 'headers', headerVon(kette().bloecke.slice(1, 5)));
  assert.deepEqual(g.getrennt, ['header_unter_untergrenze']);
  assert.equal(k.sync.fehlendeBloecke(), 0);
  k.zu();
});

test('Header mit falscher Hoehe: getrennt -- einer ohne Anschluss: still uebergangen', () => {
  const g = gegenseite('203.0.113.2');
  const k = knoten({ bloecke: 3, gegen: [g] });
  const state = emptyState();
  for (const b of kette().bloecke.slice(0, 3)) assert.ok(applyBlock(state, b.block, REGTEST).ok);

  // Vorgaenger ist Block 2, die Hoehe im Header aber 7. Proof of Work stimmt.
  const falsch = mineBlock({ height: 7, prevHash: kette().bloecke[2].hash, state,
    timestamp: kette().bloecke[2].block.header.timestamp + 600n, miner: MINER_B, extra: 'falsch' });
  // Ein Header, dessen Vorgaenger niemand kennt.
  const lose = mineBlock({ height: 9, prevHash: new Uint8Array(32).fill(0xab), state,
    timestamp: kette().bloecke[2].block.header.timestamp + 600n, miner: MINER_B, extra: 'lose' });

  k.sende(g, 'headers', headerVon([lose]));
  assert.deepEqual(g.getrennt, [], 'ohne Anschluss: kein Fehlverhalten, nur nicht eingereiht');
  assert.equal(k.sync.fehlendeBloecke(), 0);

  k.sende(g, 'headers', headerVon([falsch]));
  assert.deepEqual(g.getrennt, ['header_hoehe_falsch']);
  assert.equal(k.sync.fehlendeBloecke(), 0);

  // Die echten Header schliessen an und werden eingereiht.
  const ehrlich = gegenseite('203.0.113.3');
  k.sende(ehrlich, 'headers', headerVon(kette().bloecke.slice(3, 10)));
  assert.equal(k.sync.fehlendeBloecke(), 7);
  assert.deepEqual(ehrlich.getrennt, []);
  k.zu();
});

test('Header ohne lieferbaren Koerper verlassen die Warteschlange -- mit allen, die auf ihnen aufbauen', () => {
  const g = gegenseite('203.0.113.4');
  const k = knoten({ bloecke: 3, gegen: [g] });
  k.sende(g, 'headers', headerVon(kette().bloecke.slice(3, 20)));
  assert.equal(k.sync.fehlendeBloecke(), 17);

  // Der Peer hat keinen der Bloecke: Jede Bestellung endet mit notfound.
  for (let runde = 0; runde < WARTEND_VERSUCHE_MAX; runde++) {
    assert.ok(k.sync.fehlendeBloecke() > 0, `Runde ${runde}: zu frueh geraeumt`);
    const bestellt = g.bekommen.filter(x => x.befehl === 'getdata').flatMap(x => decodeGetData(x.payload));
    g.bekommen = [];
    if (bestellt.length === 0) { k.innen.meiden.clear(); k.innen.pruefeOffene(); continue; }
    k.sende(g, 'notfound', encodeNotFound(bestellt));
    k.innen.meiden.clear();
    k.innen.pruefeOffene();
  }
  assert.equal(k.sync.fehlendeBloecke(), 0, 'nach den Versuchen ist die Warteschlange leer');
  assert.ok(g.zahl('getheaders') >= 1, 'und der Knoten fragt neu nach Headern');
  k.zu();
});

// ----------------------------------------------------------- Beantworten

test('getdata: hoechstens BLOCK_FENSTER Bloecke je Anfrage, der Rest als notfound', () => {
  const g = gegenseite('203.0.113.5');
  const k = knoten({ bloecke: 40, gegen: [g] });
  const alle = kette().bloecke.slice(0, 40).map(b => ({ typ: INV_BLOCK, hash: b.hash }));
  k.sende(g, 'getdata', encodeGetData(alle));
  assert.equal(g.zahl('block'), BLOCK_FENSTER);
  const nf = g.bekommen.filter(x => x.befehl === 'notfound').flatMap(x => decodeInv(x.payload));
  assert.equal(nf.length, 40 - BLOCK_FENSTER);
  k.zu();
});

test('Viel Ungelesenes im Sendepuffer: keine Bloecke und keine Header, bis er sich leert', () => {
  const g = gegenseite('203.0.113.6', ANTWORT_PUFFER_MAX + 1);
  const k = knoten({ bloecke: 10, gegen: [g] });
  k.sende(g, 'getdata', encodeGetData([{ typ: INV_BLOCK, hash: kette().bloecke[1].hash }]));
  k.sende(g, 'getheaders', encodeGetHeaders({ locator: [kette().bloecke[0].hash], stop: new Uint8Array(32) }));
  assert.equal(g.zahl('block'), 0);
  assert.equal(g.zahl('notfound'), 1, 'der Peer erfaehrt, dass er neu bestellen muss');
  assert.equal(g.zahl('headers'), 0);
  // Im Takt, solange der Puffer voll ist: weiter zurueckgestellt.
  k.innen.pruefeOffene();
  assert.equal(g.zahl('headers'), 0);
  // Puffer leer: Der naechste Takt beantwortet die zurueckgestellte Anfrage --
  // ohne dass der Peer neu fragen muss (das tut ein Knoten nicht von selbst).
  g.puffer = 0;
  k.innen.pruefeOffene();
  assert.equal(g.zahl('headers'), 1);
  k.innen.pruefeOffene();
  assert.equal(g.zahl('headers'), 1, 'nur einmal');
  k.zu();
});

test('getheaders: hoechstens GETHEADERS_JE_FENSTER Antworten je Fenster und Peer', () => {
  const g = gegenseite('203.0.113.7'), h = gegenseite('203.0.113.8');
  const k = knoten({ bloecke: 10, gegen: [g, h] });
  const frage = encodeGetHeaders({ locator: [kette().bloecke[0].hash], stop: new Uint8Array(32) });
  for (let i = 0; i < GETHEADERS_JE_FENSTER + 15; i++) k.sende(g, 'getheaders', frage);
  assert.equal(g.zahl('headers'), GETHEADERS_JE_FENSTER);
  assert.deepEqual(g.getrennt, [], 'nicht getrennt -- nur zurueckgestellt');
  k.sende(h, 'getheaders', frage);
  assert.equal(h.zahl('headers'), 1, 'ein anderer Peer ist davon nicht betroffen');

  // Im selben Fenster bleibt es bei der Grenze ...
  k.innen.pruefeOffene();
  assert.equal(g.zahl('headers'), GETHEADERS_JE_FENSTER);
  // ... im naechsten wird die zurueckgestellte Anfrage beantwortet, genau
  // einmal (die 15 ueberzaehligen zaehlen als eine: die letzte).
  k.innen.getheadersZaehler.get(g).ab -= GETHEADERS_FENSTER_MS + 1;
  k.innen.pruefeOffene();
  assert.equal(g.zahl('headers'), GETHEADERS_JE_FENSTER + 1);
  k.innen.pruefeOffene();
  assert.equal(g.zahl('headers'), GETHEADERS_JE_FENSTER + 1);
  k.zu();
});

// ---------------------------------------------------------- Ueberweisungen

test('Angeforderte Ueberweisungen: Obergrenze und Frist', () => {
  const g = gegenseite('203.0.113.9');
  const k = knoten({ bloecke: 1, mitPool: true, gegen: [g] });
  let n = 0;
  const neueHashes = (anzahl: number) => Array.from({ length: anzahl }, () => {
    const h = new Uint8Array(32); new DataView(h.buffer).setUint32(0, ++n); return { typ: INV_TX, hash: h };
  });
  for (let i = 0; i < 12; i++) k.sende(g, 'inv', encodeInv(neueHashes(500)));
  assert.equal(k.sync.offeneUeberweisungen(), OFFENE_TX_MAX, 'nicht mehr als die Obergrenze');

  // Nach Ablauf der Frist sind sie frei -- und koennen bei einem anderen geholt werden.
  const echt = Date.now;
  try {
    Date.now = () => echt() + 31_000;
    k.innen.pruefeOffene();
  } finally { Date.now = echt; }
  assert.equal(k.sync.offeneUeberweisungen(), 0);
  k.zu();
});

// ------------------------------------------------------------ Verbindung

test('Eine Verbindung, deren Gegenseite nicht liest, wird beim vollen Sendepuffer getrennt', async () => {
  const angenommen: Socket[] = [];
  const server = createServer(s => { s.pause(); angenommen.push(s); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const sock = connect(port, '127.0.0.1');
  await new Promise<void>(r => sock.once('connect', () => r()));
  let grund = '';
  const p = new PeerConnection({
    socket: sock, richtung: 'ein', params: REGTEST, agent: 'test', listenPort: 0,
    eigeneKette: () => ({ height: 0, chainWork: 0n }),
    callbacks: { onClose: (_p, g) => { grund = g; } },
  });
  const brocken = new Uint8Array(1_000_000);
  let gesendet = 0;
  for (let i = 0; i < 200 && p.send('block', brocken); i++) gesendet++;
  assert.equal(grund, 'sendepuffer_voll');
  assert.ok(gesendet * brocken.length >= SENDEPUFFER_MAX, `getrennt nach ${gesendet} MB`);
  assert.ok(gesendet < 200, 'nicht unbegrenzt');
  for (const s of angenommen) s.destroy();
  await new Promise<void>(r => server.close(() => r()));
});
