/**
 * Peers alter Fassung nach der Aktivierungshoehe (CONSENSUS_V6.md 11.4):
 * "a peer that announces a revision below 6 is not banned, but is not asked
 * for blocks."
 *
 * Gefunden im Uebergangstest vom 21.10.2026 (zwei alte, zwei neue Knoten auf
 * einem Rechner). Die Regel galt nur beim Nachbestellen aus der
 * Warteschlange (frageBloecke). Zwei Wege daran vorbei:
 *
 *  1. Ankuendigung (inv): Ein alter Peer meldet seinen neuen Block, der neue
 *     Knoten bestellt ihn sofort, lehnt ihn ab (bad_version) und trennt die
 *     Verbindung -- der alte Peer verbindet sich gleich wieder. Bei jedem
 *     Block des alten Peers von vorn.
 *  2. Header-Abgleich: Die Header des alten Peers ab der Hoehe kamen in die
 *     Warteschlange, wurden nie bestellt (frageBloecke ueberspringt sie),
 *     flogen nach einer Weile heraus und loesten eine neue Header-Anfrage
 *     aus -- im Probelauf jede Minute.
 *
 * Jetzt: Von einem Peer alter Fassung wird ab der Hoehe weder auf eine
 * Ankuendigung hin bestellt noch ein Header vorgemerkt. Vor der Hoehe bleibt
 * er eine Quelle wie jeder andere, und ein Peer der Fassung 6 ist nicht
 * betroffen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { SyncManager } from '../src/lib/node/p2p/SyncManager.ts';
import type { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { encodeHeaders, encodeInv, decodeGetData, INV_BLOCK } from '../src/lib/node/p2p/messages.ts';
import { REGTEST, regtestMitV6 } from '../src/lib/core/networks.ts';
import { HEADER_SIZE } from '../src/lib/core/block.ts';
import { emptyState, applyBlock, type State } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { mineBlock, type Gemint } from './helpers/regtest.ts';

const P = regtestMitV6(12);
const START = 1_788_912_000n;

/** Gemeinsame Kette 0..11 und der Zustand an ihrer Spitze. */
function basis(): { bloecke: Gemint[]; zustand: State } {
  const zustand = emptyState();
  const bloecke: Gemint[] = [];
  let prev = new Uint8Array(32);
  for (let h = 0; h < 12; h++) {
    const g = mineBlock({ height: h, prevHash: prev, state: zustand, params: P,
      timestamp: START + BigInt(h) * P.targetBlockTime });
    assert.ok(applyBlock(zustand, g.block, P).ok);
    bloecke.push(g);
    prev = g.hash;
  }
  return { bloecke, zustand };
}

/** Block 12 nach alten Regeln (wie ein Knoten ohne Fassung 6 ihn baut) und nach neuen. */
function block12(b: { bloecke: Gemint[]; zustand: State }) {
  const vor = b.bloecke[11];
  const zeit = START + 12n * P.targetBlockTime;
  const alt = mineBlock({ height: 12, prevHash: vor.hash, state: structuredClone(b.zustand), params: REGTEST, timestamp: zeit });
  const neu = mineBlock({ height: 12, prevHash: vor.hash, state: structuredClone(b.zustand), params: P, timestamp: zeit });
  assert.ok(alt.block.header.version < 6 && neu.block.header.version >= 6);
  return { alt, neu };
}

function gegenseite(name: string, peerFassung: number) {
  const g = {
    host: name, port: 8646, ready: true,
    bekommen: [] as { befehl: string; payload: Uint8Array }[],
    getrennt: [] as string[],
    send(befehl: string, payload: Uint8Array) { if (!g.ready) return false; g.bekommen.push({ befehl, payload }); return true; },
    close(grund: string) { g.getrennt.push(grund); g.ready = false; },
    fremdeArbeit: () => 1_000_000_000n,
    fremdeFassung: () => peerFassung,
    sendePuffer: () => 0,
  };
  return g;
}

function knoten(bloecke: Gemint[], g: ReturnType<typeof gegenseite>) {
  const store = new ChainStore(':memory:', { network: P.network, chainId: P.chainId });
  const chain = new ChainManager(store, P);
  for (const b of bloecke) assert.ok(chain.accept(b.body).ok);
  const peer = g as unknown as PeerConnection;
  const peers = { bereite: () => (g.ready ? [peer] : []), besterPeer: () => (g.ready ? peer : null), kuendigeAn: () => 0 };
  const sync = new SyncManager({ chain, store, peers: peers as never, params: P, maxHeaders: 50 });
  const sende = (command: string, payload: Uint8Array) => sync.aufNachricht(peer, { command: command as never, payload });
  const bestellt = () => g.bekommen.filter(x => x.befehl === 'getdata')
    .flatMap(x => decodeGetData(x.payload).map(e => toHex(e.hash)));
  return { store, chain, sync, sende, bestellt };
}

const kopf = (g: Gemint) => g.body.slice(0, HEADER_SIZE);

test('11.4, Ankuendigung: Block eines alten Peers ab der Hoehe wird nicht bestellt -- Peer bleibt', () => {
  const b = basis();
  const { alt } = block12(b);
  const g = gegenseite('203.0.113.80', 5);
  const k = knoten(b.bloecke, g);
  k.sende('inv', encodeInv([{ typ: INV_BLOCK, hash: alt.hash }]));
  assert.deepEqual(k.bestellt(), [], 'nichts bestellt');
  assert.deepEqual(g.getrennt, []);
  assert.equal(k.chain.height(), 11);
  k.store.close();
});

test('11.4, Header-Abgleich: Header eines alten Peers ab der Hoehe kommen nicht in die Warteschlange', () => {
  const b = basis();
  const { alt } = block12(b);
  const g = gegenseite('203.0.113.81', 5);
  const k = knoten(b.bloecke, g);
  k.sende('headers', encodeHeaders([kopf(alt)]));
  assert.equal(k.sync.fehlendeBloecke(), 0, 'nichts vorgemerkt');
  assert.deepEqual(k.bestellt(), []);
  assert.deepEqual(g.getrennt, []);
  k.store.close();
});

test('11.4 gilt nur ab der Hoehe und nur fuer alte Peers', () => {
  const b = basis();
  const { neu } = block12(b);

  // Alter Peer, VOR der Hoehe: Block 11 wird auf Ankuendigung bestellt und per Header vorgemerkt.
  const g1 = gegenseite('203.0.113.82', 5);
  const k1 = knoten(b.bloecke.slice(0, 11), g1);
  k1.sende('inv', encodeInv([{ typ: INV_BLOCK, hash: b.bloecke[11].hash }]));
  assert.deepEqual(k1.bestellt(), [toHex(b.bloecke[11].hash)]);
  k1.store.close();
  const g2 = gegenseite('203.0.113.83', 5);
  const k2 = knoten(b.bloecke.slice(0, 11), g2);
  k2.sende('headers', encodeHeaders([kopf(b.bloecke[11])]));
  assert.equal(k2.sync.fehlendeBloecke() + k2.bestellt().length > 0, true, 'Block 11 vorgemerkt oder bestellt');
  k2.store.close();

  // Peer der Fassung 6, AB der Hoehe: Block 12 wird bestellt und angenommen.
  const g3 = gegenseite('203.0.113.84', 6);
  const k3 = knoten(b.bloecke, g3);
  k3.sende('inv', encodeInv([{ typ: INV_BLOCK, hash: neu.hash }]));
  assert.deepEqual(k3.bestellt(), [toHex(neu.hash)]);
  k3.sende('block', neu.body);
  assert.equal(k3.chain.height(), 12);
  assert.deepEqual(g3.getrennt, []);
  k3.store.close();
});
