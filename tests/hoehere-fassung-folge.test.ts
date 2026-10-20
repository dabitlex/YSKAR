/**
 * Folge-Header einer hoeheren, unbekannten Fassung (CONSENSUS_V6.md 11.1).
 *
 * Befund A-2 (Audit 20.10.2026): Der erste Block einer neueren Fassung haengt
 * an unserer Spitze und wird als "veraltet"-Signal erkannt, der Peer bleibt
 * verbunden. Der ZWEITE Block dieser Kette hatte aber einen Vorgaenger, den
 * der Knoten nie speichert -- er galt deshalb als ungueltig (bad_version),
 * und der Peer wurde getrennt. Ein ehrlicher, neuerer Peer flog damit
 * spaetestens bei seinem naechsten Block raus.
 *
 * Jetzt merkt sich der Knoten erkannte Header hoeherer Fassung (begrenzt)
 * und prueft einen Folge-Header gegen seinen gemerkten Vorgaenger mit
 * denselben Regeln wie den ersten: Hoehe, Zeitstempel, Difficulty, Proof of
 * Work. Besteht er, bleibt der Peer verbunden. Gespeichert, angewandt oder
 * als gueltig gefuehrt wird keiner dieser Bloecke.
 *
 * Geprueft ueber beide Empfangswege des SyncManagers: Ankuendigung (inv)
 * und Header-Abgleich (headers -> getdata -> block).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager, HOEHERE_FASSUNG_MERKEN } from '../src/lib/node/fullnode/ChainManager.ts';
import { SyncManager } from '../src/lib/node/p2p/SyncManager.ts';
import type { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { encodeHeaders, encodeInv, decodeGetData, INV_BLOCK } from '../src/lib/node/p2p/messages.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { serializeHeader, type BlockHeader } from '../src/lib/core/block.ts';
import { targetFromDifficulty } from '../src/lib/core/params.ts';
import { emptyState, applyBlock, stateRoot } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { mineBlock, type Gemint } from './helpers/regtest.ts';

const P = REGTEST;
const START = 1_788_912_000n;
const JETZT = BigInt(Math.floor(Date.now() / 1000));
const sha256d = (b: Uint8Array) => createHash('sha256').update(createHash('sha256').update(b).digest()).digest();

/** Ehrliche Kette 0..11. */
let _basis: Gemint[] | null = null;
function basis(): Gemint[] {
  if (_basis) return _basis;
  const zustand = emptyState();
  const out: Gemint[] = [];
  let prev = new Uint8Array(32);
  for (let h = 0; h < 12; h++) {
    const g = mineBlock({ height: h, prevHash: prev, state: zustand, params: P,
      timestamp: START + BigInt(h) * P.targetBlockTime });
    assert.ok(applyBlock(zustand, g.block, P).ok);
    out.push(g);
    prev = g.hash;
  }
  return (_basis = out);
}

/**
 * Ein Header hoeherer Fassung mit gueltigem Proof of Work. Nur der Header
 * zaehlt: Fuer eine unbekannte Fassung liest der Knoten den Body nie.
 */
function v7(opt: { height: number; prev: Uint8Array; zeit: bigint; difficulty?: bigint; version?: number; ohneArbeit?: boolean }):
  { roh: Uint8Array; hash: Uint8Array } {
  const kopf: BlockHeader = {
    version: opt.version ?? 7, height: opt.height, prevHash: opt.prev,
    merkleRoot: new Uint8Array(32), stateRoot: new Uint8Array(32),
    timestamp: opt.zeit, difficulty: opt.difficulty ?? 1n, txCount: 1, extranonce: 0n, nonce: 0n,
  };
  const roh = Buffer.from(serializeHeader(kopf));
  const ziel = Buffer.from(targetFromDifficulty(kopf.difficulty).toString(16).padStart(64, '0'), 'hex');
  for (let n = 0; n < 50_000_000; n++) {
    roh.writeBigUInt64LE(BigInt(n), 128);
    const treffer = Buffer.compare(sha256d(roh), ziel) <= 0;
    if (treffer !== !!opt.ohneArbeit) return { roh: new Uint8Array(roh), hash: new Uint8Array(sha256d(roh)) };
  }
  throw new Error('kein Proof of Work');
}

/** Eine zusammenhaengende Kette hoeherer Fassung ab Block 12, je 600 s. */
function v7Kette(n: number): { roh: Uint8Array; hash: Uint8Array; zeit: bigint }[] {
  const out: { roh: Uint8Array; hash: Uint8Array; zeit: bigint }[] = [];
  let prev = basis()[11].hash;
  let zeit = basis()[11].block.header.timestamp;
  for (let i = 0; i < n; i++) {
    zeit += P.targetBlockTime;
    const b = v7({ height: 12 + i, prev, zeit });
    out.push({ ...b, zeit });
    prev = b.hash;
  }
  return out;
}

function knoten() {
  const store = new ChainStore(':memory:', { network: P.network, chainId: P.chainId });
  const chain = new ChainManager(store, P);
  for (const b of basis()) assert.ok(chain.accept(b.body).ok);
  return { store, chain };
}

const grund = (r: unknown) => {
  const x = r as { ok: boolean; grund?: string; detail?: string };
  return `${x.ok}/${x.grund}/${x.detail ?? ''}`;
};

// ------------------------------------------------------------ ChainManager

test('Folge-Header derselben hoeheren Fassung: veraltet, nicht ungueltig -- und nichts gespeichert', () => {
  const { store, chain } = knoten();
  const wurzelVorher = toHex(stateRoot(chain.state()));
  const zahlVorher = store.count();
  for (const b of v7Kette(3)) {
    const r = chain.accept(b.roh);
    assert.equal(grund(r).split('/').slice(0, 2).join('/'), 'false/fassung_unbekannt');
    assert.equal(store.has(b.hash), false, 'nie gespeichert');
  }
  assert.deepEqual(chain.hoehereFassungGesehen, { version: 7, height: 14 });
  assert.equal(chain.hoehereFassungGemerkt, 3);
  assert.equal(chain.height(), 11);
  assert.equal(store.count(), zahlVorher);
  assert.equal(toHex(stateRoot(chain.state())), wurzelVorher);
  store.close();
});

test('Folge-Header mit echter Protokollverletzung bleiben ungueltig', () => {
  const [a] = v7Kette(1);
  const elternZeit = a.zeit;
  const median = basis()[7].block.header.timestamp; // Median der letzten 11 vor b (2..11 und a)
  const faelle: [string, Parameters<typeof v7>[0], RegExp][] = [
    ['vor dem Vorgaenger', { height: 13, prev: a.hash, zeit: elternZeit - 1n }, /struktur\/bad_version/],
    ['nicht nach dem Median', { height: 13, prev: a.hash, zeit: median }, /struktur\/bad_version/],
    ['zu weit in der Zukunft', { height: 13, prev: a.hash, zeit: JETZT + 10_000n }, /struktur\/bad_version/],
    ['Difficulty falsch', { height: 13, prev: a.hash, zeit: elternZeit + 600n, difficulty: 2n }, /struktur\/bad_version/],
    ['Hoehe falsch', { height: 14, prev: a.hash, zeit: elternZeit + 600n }, /struktur\/bad_version/],
    ['Vorgaenger unbekannt', { height: 13, prev: new Uint8Array(32).fill(0xab), zeit: elternZeit + 600n }, /struktur\/bad_version/],
    ['ohne Proof of Work', { height: 13, prev: a.hash, zeit: elternZeit + 600n, ohneArbeit: true }, /struktur\/pow_failed/],
    ['Version 6 auf Fassung-7-Pfad', { height: 13, prev: a.hash, zeit: elternZeit + 600n, version: 6 }, /struktur\/bad_version/],
  ];
  for (const [name, f, erwartet] of faelle) {
    const { store, chain } = knoten();
    assert.match(grund(chain.accept(a.roh)), /fassung_unbekannt/);
    const b = v7(f);
    assert.match(grund(chain.accept(b.roh)), erwartet, name);
    assert.equal(chain.hoehereFassungGemerkt, 1, `${name}: nichts dazu gemerkt`);
    assert.equal(store.has(b.hash), false);
    assert.equal(chain.height(), 11);
    store.close();
  }
});

test('Gemerkte Header hoeherer Fassung sind begrenzt -- eine lange neuere Kette bleibt trotzdem verfolgbar', () => {
  const { store, chain } = knoten();
  const zahlVorher = store.count();
  const lang = v7Kette(HOEHERE_FASSUNG_MERKEN + 20);
  for (const b of lang) assert.match(grund(chain.accept(b.roh)), /fassung_unbekannt/);
  assert.equal(chain.hoehereFassungGemerkt, HOEHERE_FASSUNG_MERKEN);
  assert.equal(store.count(), zahlVorher);
  assert.equal(chain.height(), 11);
  // Der aelteste ist verdraengt: Ein Folge-Header zu ihm gilt wieder als ohne Vorgaenger.
  const zuAlt = v7({ height: 13, prev: lang[0].hash, zeit: lang[0].zeit + 600n });
  assert.match(grund(chain.accept(zuAlt.roh)), /struktur\/bad_version/);
  store.close();
});

// ------------------------------------------------------------ SyncManager

function gegenseite(name: string) {
  const g = {
    host: name, port: 8646, ready: true,
    bekommen: [] as { befehl: string; payload: Uint8Array }[],
    getrennt: [] as string[],
    send(befehl: string, payload: Uint8Array) { if (!g.ready) return false; g.bekommen.push({ befehl, payload }); return true; },
    close(grund: string) { g.getrennt.push(grund); g.ready = false; },
    fremdeArbeit: () => 1_000_000n,
    sendePuffer: () => 0,
  };
  return g;
}

function syncKnoten(g: ReturnType<typeof gegenseite>) {
  const { store, chain } = knoten();
  const peer = g as unknown as PeerConnection;
  const peers = { bereite: () => (g.ready ? [peer] : []), besterPeer: () => (g.ready ? peer : null), kuendigeAn: () => 0 };
  const sync = new SyncManager({ chain, store, peers: peers as never, params: P, maxHeaders: 50 });
  const sende = (command: string, payload: Uint8Array) => sync.aufNachricht(peer, { command: command as never, payload });
  return { store, chain, sync, sende };
}

test('Ankuendigung (inv): ein neuerer Peer bleibt ueber mehrere Bloecke verbunden', () => {
  const g = gegenseite('203.0.113.70');
  const k = syncKnoten(g);
  const zahlVorher = k.store.count();
  for (const b of v7Kette(3)) {
    k.sende('inv', encodeInv([{ typ: INV_BLOCK, hash: b.hash }]));
    k.sende('block', b.roh);
    assert.deepEqual(g.getrennt, [], `Block ${toHex(b.hash).slice(0, 8)}: Peer bleibt`);
    assert.equal(k.store.has(b.hash), false);
  }
  assert.ok(k.chain.hoehereFassungGesehen);
  assert.equal(k.chain.height(), 11);
  assert.equal(k.store.count(), zahlVorher);
  k.store.close();
});

test('Header-Abgleich: neuere Kette per headers und Bloecke -- Peer bleibt, Warteschlange leer', () => {
  const g = gegenseite('203.0.113.71');
  const k = syncKnoten(g);
  const zahlVorher = k.store.count();
  const kette = v7Kette(3);
  k.sende('headers', encodeHeaders(kette.map(b => b.roh.slice(0, 136))));
  assert.ok(g.bekommen.some(x => x.befehl === 'getdata'), 'Bloecke angefordert');
  for (const b of kette) k.sende('block', b.roh);
  assert.deepEqual(g.getrennt, []);
  assert.equal(k.sync.fehlendeBloecke(), 0);
  assert.equal(k.chain.height(), 11);
  assert.equal(k.store.count(), zahlVorher);
  k.store.close();
});

test('Ankuendigung (inv): Folge-Block mit falschem Zeitstempel trennt den Peer weiterhin', () => {
  const g = gegenseite('203.0.113.72');
  const k = syncKnoten(g);
  const [a] = v7Kette(1);
  k.sende('block', a.roh);
  assert.deepEqual(g.getrennt, []);
  const falsch = v7({ height: 13, prev: a.hash, zeit: a.zeit - 1n });
  k.sende('inv', encodeInv([{ typ: INV_BLOCK, hash: falsch.hash }]));
  k.sende('block', falsch.roh);
  assert.deepEqual(g.getrennt, ['ungueltiger_block:struktur']);
  assert.equal(k.store.has(falsch.hash), false);
  k.store.close();
});

/*
  Risiko 1 aus dem A-2-Bericht: Der Header-Abgleich stellte Bloecke hoeherer
  Fassung, die schon abgelehnt waren, erneut in die Warteschlange und holte
  ihre Koerper noch einmal -- bei jeder neuen Header-Antwort desselben Peers.
  Jetzt bleiben sie draussen; neue Folge-Header schliessen trotzdem an.
*/
test('Header-Abgleich: schon abgelehnte Bloecke hoeherer Fassung werden nicht erneut geholt', () => {
  const g = gegenseite('203.0.113.73');
  const k = syncKnoten(g);
  const kette = v7Kette(4);
  const alt = kette.slice(0, 3);
  const getdata = () => g.bekommen.filter(x => x.befehl === 'getdata')
    .flatMap(x => decodeGetData(x.payload).map(e => toHex(e.hash)));

  k.sende('headers', encodeHeaders(alt.map(b => b.roh.slice(0, 136))));
  for (const b of alt) k.sende('block', b.roh);
  assert.equal(getdata().length, 3, 'beim ersten Mal alle drei geholt');
  assert.equal(k.sync.fehlendeBloecke(), 0);

  // Dieselben Header noch einmal: nichts Neues bestellen, nichts wartet.
  k.sende('headers', encodeHeaders(alt.map(b => b.roh.slice(0, 136))));
  assert.equal(getdata().length, 3, 'keine erneute Bestellung');
  assert.equal(k.sync.fehlendeBloecke(), 0, 'nichts in der Warteschlange');

  // Dieselben Header plus ein neuer: genau der neue wird geholt -- und als
  // hoehere Fassung erkannt, obwohl sein Vorgaenger nicht neu geholt wurde.
  k.sende('headers', encodeHeaders(kette.map(b => b.roh.slice(0, 136))));
  assert.deepEqual(getdata().slice(3), [toHex(kette[3].hash)], 'nur der neue Block');
  k.sende('block', kette[3].roh);
  assert.deepEqual(g.getrennt, []);
  assert.equal(k.sync.fehlendeBloecke(), 0);
  assert.equal(k.chain.hoehereFassungGemerkt, 4);
  assert.equal(k.chain.height(), 11);
  assert.equal(k.store.has(kette[3].hash), false);
  k.store.close();
});
