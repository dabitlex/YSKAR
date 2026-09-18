/**
 * Kettenabgleich zwischen echten Knoten.
 *
 * Zwei vollständige Knoten auf Loopback, eine echte Kette, echte TCP-
 * Verbindungen. Der Test, auf den alles davor hinausläuft: Wandern Blöcke
 * tatsächlich von einem Knoten zum anderen — und wird jeder davon selbst
 * geprüft?
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import { SyncManager } from '../src/lib/node/p2p/SyncManager.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { stateRoot, totalSupply } from '../src/lib/core/state.ts';
import { UNIT } from '../src/lib/core/params.ts';
import { baueKette, zweig, MINER_A, MINER_B } from './helpers/regtest.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
let port = 19400;
const naechsterPort = () => port++;

/** Ein vollständiger Knoten: Kette, Peers, Abgleich. */
function knoten(opt: { port?: number; seeds?: { host: string; port: number }[] } = {}) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);

  const angenommen: number[] = [];
  let sync: SyncManager;

  const peers = new PeerManager({
    params: REGTEST,
    agent: 'test/0.1',
    listenPort: opt.port ?? 0,
    host: '127.0.0.1',
    seeds: opt.seeds,
    kette: () => {
      const t = chain.tip();
      return { height: t?.height ?? -1, chainWork: t?.chainWork ?? 0n };
    },
    onReady: p => sync.aufPeer(p),
    onMessage: (p, f) => sync.aufNachricht(p, f),
  });

  sync = new SyncManager({
    chain, store, peers, params: REGTEST,
    onBlock: h => angenommen.push(h),
  });

  return {
    store, chain, peers, sync, angenommen,
    async start() { await peers.start(); sync.start(); },
    async stop() { sync.stop(); await peers.stop(); store.close(); },
  };
}

/** Eine Kette in einen Knoten legen, ohne Netzwerk. */
function fuelle(k: ReturnType<typeof knoten>, bloecke: { body: Uint8Array }[]) {
  for (const b of bloecke) {
    const r = k.chain.accept(b.body);
    assert.ok(r.ok, `Testkette nicht annehmbar: ${JSON.stringify(r)}`);
  }
}

// ----------------------------------------------------------- Aufholen

test('Ein leerer Knoten holt die ganze Kette', async () => {
  const kette = baueKette(6);

  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette.bloecke);
  assert.equal(a.chain.height(), 5);

  // B kennt nur A und hat selbst nichts.
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1500);

  assert.equal(b.chain.height(), 5, 'B hat nicht aufgeholt');
  assert.equal(toHex(b.chain.tip()!.hash), toHex(a.chain.tip()!.hash));

  // Und der eigentliche Beweis: B hat den Zustand SELBST gerechnet.
  assert.equal(toHex(stateRoot(b.chain.state())), toHex(stateRoot(a.chain.state())));
  assert.equal(totalSupply(b.chain.state()), 6n * 875n * UNIT);

  await a.stop(); await b.stop();
});

test('Der Zustand wird selbst gerechnet, nicht übernommen', async () => {
  // Es gibt keine Nachricht, die einen Zustand überträgt -- und das ist
  // Absicht. B baut ihn allein aus den Blöcken auf.
  const kette = baueKette(4);
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette.bloecke);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1200);

  // Die Zustandswurzel steht im Block -- B muss auf dieselbe kommen, sonst
  // hätte accept() abgelehnt.
  assert.equal(toHex(stateRoot(b.chain.state())),
               toHex(b.chain.tip()!.stateRoot));

  await a.stop(); await b.stop();
});

// -------------------------------------------------------- Verbreitung

test('Ein neuer Block wandert weiter', async () => {
  const kette = baueKette(3);
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette.bloecke);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1200);
  assert.equal(b.chain.height(), 2);

  // A bekommt einen neuen Block und kündigt ihn an.
  const weiter = zweig(kette, 3, 1, { miner: MINER_A, extra: 'neu' })[0];
  assert.ok(a.chain.accept(weiter.body).ok);
  a.sync.kuendigeAn(weiter.hash);
  await warte(800);

  assert.equal(b.chain.height(), 3, 'B hat den neuen Block nicht bekommen');
  assert.equal(toHex(b.chain.tip()!.hash), toHex(weiter.hash));
  assert.ok(b.angenommen.includes(3));

  await a.stop(); await b.stop();
});

test('Ein Block erreicht auch den dritten Knoten', async () => {
  // A kennt B, B kennt C. Der Block muss über B hinweg bis C kommen --
  // ohne dass A und C je verbunden wären.
  const kette = baueKette(3);
  const pA = naechsterPort(), pB = naechsterPort();

  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette.bloecke);

  const b = knoten({ port: pB, seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1000);

  const c = knoten({ seeds: [{ host: '127.0.0.1', port: pB }] });
  await c.start();
  await warte(1200);
  assert.equal(c.chain.height(), 2, 'C hat die Ausgangskette nicht');

  const weiter = zweig(kette, 3, 1, { miner: MINER_A, extra: 'kette' })[0];
  assert.ok(a.chain.accept(weiter.body).ok);
  a.sync.kuendigeAn(weiter.hash);
  await warte(1200);

  assert.equal(c.chain.height(), 3, 'der Block kam nicht bis C');

  await a.stop(); await b.stop(); await c.stop();
});

// ------------------------------------------------------------- Gabelung

test('Der Zweig mit mehr Arbeit setzt sich durch', async () => {
  const basis = baueKette(4);

  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, basis.bloecke);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1200);
  assert.equal(b.chain.height(), 3);

  // A baut einen längeren Zweig ab Höhe 2.
  const laenger = zweig(basis, 2, 4, { miner: MINER_B });
  for (const g of laenger) assert.ok(a.chain.accept(g.body).ok);
  assert.equal(a.chain.height(), 5);

  a.sync.kuendigeAn(laenger[laenger.length - 1].hash);
  await warte(1500);

  assert.equal(b.chain.height(), 5, 'B ist nicht auf den längeren Zweig');
  assert.equal(toHex(b.chain.tip()!.hash), toHex(a.chain.tip()!.hash));
  // Der alte Zweig ist bei B nicht gelöscht, nur nicht mehr aktiv.
  assert.ok(b.store.atHeight(3).length >= 1);

  await a.stop(); await b.stop();
});

// --------------------------------------------------------- Fehlverhalten

test('Ein Header ohne Arbeit trennt die Verbindung', async () => {
  /*
    Der wichtigste Schutz beim Aufholen. Header sind billig zu erfinden,
    wenn man die Arbeit weglässt -- ein Peer könnte zweitausend schicken
    und uns dazu bringen, zweitausend Blockkörper anzufragen.

    Der Hash kostet Mikrosekunden und macht genau das unmöglich.
  */
  const kette = baueKette(2);
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette.bloecke);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1000);
  assert.equal(b.peers.bereite().length, 1);

  // B schickt A einen erfundenen Header: gültiger Aufbau, keine Arbeit.
  const erfunden = new Uint8Array(kette.bloecke[1].body.slice(0, 136));
  erfunden[128] ^= 0xff;              // Nonce verdrehen -> PoW stimmt nicht
  const { encodeHeaders } = await import('../src/lib/node/p2p/messages.ts');
  b.peers.bereite()[0].send('headers', encodeHeaders([erfunden]));
  await warte(600);

  assert.equal(a.peers.bereite().length, 0, 'A hat die Verbindung gehalten');
  // Und A hat nichts davon übernommen.
  assert.equal(a.chain.height(), 1);

  await a.stop(); await b.stop();
});

test('Ein ungültiger Block trennt die Verbindung', async () => {
  const kette = baueKette(3);
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette.bloecke);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1000);

  /*
    Ein NEUER Block mit verdrehter Coinbase.

    Einen bereits bekannten zu verdrehen taugt nicht: Ein Block wird über
    seinen HEADER-Hash erkannt, und der bleibt beim Ändern des Körpers
    gleich. accept() antwortet dann "bekannt" und lässt den eigenen,
    geprüften Körper unangetastet -- richtig so, aber eben kein Test für
    einen ungültigen Block.
  */
  const frisch = zweig(kette, 3, 1, { miner: MINER_A, extra: 'boese' })[0];
  const kaputt = new Uint8Array(frisch.body);
  kaputt[160] ^= 0x01;              // trifft die Coinbase -> Merkle stimmt nicht
  const hoeheVorher = b.chain.height();
  a.peers.bereite()[0].send('block', kaputt);
  await warte(600);

  assert.equal(b.chain.height(), hoeheVorher, 'B hat ihn übernommen');
  assert.equal(b.peers.bereite().length, 0, 'B hat die Verbindung gehalten');

  await a.stop(); await b.stop();
});

test('Ein unbekannter Block wird nicht doppelt angefragt', async () => {
  const kette = baueKette(3);
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette.bloecke);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(1200);

  // Dieselbe Ankündigung dreimal.
  const h = a.chain.tip()!.hash;
  for (let i = 0; i < 3; i++) a.sync.kuendigeAn(h);
  await warte(500);

  assert.equal(b.sync.offeneAnfragen(), 0, 'Anfragen blieben offen');
  assert.equal(b.chain.height(), 2);

  await a.stop(); await b.stop();
});
