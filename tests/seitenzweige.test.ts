/**
 * Befund S7: Seitenzweige tief unter der Spitze.
 *
 * Eine Regel des Knotens, keine Konsensregel. Ein Block, der nicht die
 * eigene Spitze verlaengert, wird im Abgleich (SyncManager) nur geholt,
 * geprueft und gespeichert, wenn sein Zweig hoechstens
 * MINDESTARBEIT_BLOECKE Bloecke Arbeit unter der Spitze liegt oder bekannte
 * Header seines Zweigs so weit hinaufreichen. Der Absender bleibt
 * verbunden. Seitenbloecke mehr als SEITENBLOCK_TIEFE unter der Spitze
 * werden geloescht.
 *
 * Die Testkette hat Difficulty 1; die Grenze wird deshalb ueber
 * `mindestArbeitBloecke` klein gesetzt. Die Gegenseite spielt der Test
 * selbst (wie in p2p-grenzen.test.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager, SEITENBLOCK_TIEFE } from '../src/lib/node/fullnode/ChainManager.ts';
import {
  SyncManager, MINDESTARBEIT_BLOECKE, ZWEIG_FRIST_MS,
} from '../src/lib/node/p2p/SyncManager.ts';
import type { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { encodeHeaders, encodeInv, decodeGetData, INV_BLOCK } from '../src/lib/node/p2p/messages.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { baueKette, zweig, type Kette, type Gemint } from './helpers/regtest.ts';

let _kette: Kette | null = null;
/** Die Hauptkette: 32 Bloecke, Hoehe 0 bis 31. */
const kette = (): Kette => (_kette ??= baueKette(32));
const headerVon = (bl: Gemint[]) => encodeHeaders(bl.map(b => b.body.slice(0, 136)));

function gegenseite(name: string) {
  const g = {
    host: name, port: 8646, ready: true,
    bekommen: [] as { befehl: string; payload: Uint8Array }[],
    getrennt: [] as string[],
    send(befehl: string, payload: Uint8Array) { if (!g.ready) return false; g.bekommen.push({ befehl, payload }); return true; },
    close(grund: string) { g.getrennt.push(grund); g.ready = false; },
    fremdeArbeit: () => 1_000_000n,
    sendePuffer: () => 0,
    bestellt: () => g.bekommen.filter(x => x.befehl === 'getdata').flatMap(x => decodeGetData(x.payload)),
  };
  return g;
}
type Gegenseite = ReturnType<typeof gegenseite>;
const alsPeer = (g: Gegenseite) => g as unknown as PeerConnection;

function knoten(opt: { bloecke: number; grenze?: number; maxHeaders?: number; gegen: Gegenseite[] }) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  for (const b of kette().bloecke.slice(0, opt.bloecke)) assert.ok(chain.accept(b.body).ok);
  const gs = opt.gegen;
  const peers = {
    bereite: () => gs.filter(g => g.ready).map(alsPeer),
    besterPeer: () => (gs.find(g => g.ready) ? alsPeer(gs.find(g => g.ready)!) : null),
    kuendigeAn: () => 0,
  };
  const sync = new SyncManager({
    chain, store, peers: peers as any, params: REGTEST,
    maxHeaders: opt.maxHeaders ?? 50, mindestArbeitBloecke: opt.grenze,
  });
  const sende = (g: Gegenseite, command: string, payload: Uint8Array) =>
    sync.aufNachricht(alsPeer(g), { command: command as any, payload });
  /** Alles liefern, was bei g bestellt wurde, in der Reihenfolge der Bestellung. */
  const liefere = (g: Gegenseite, bloecke: Gemint[]) => {
    for (let runde = 0; runde < 50; runde++) {
      const wunsch = g.bestellt();
      g.bekommen = [];
      if (wunsch.length === 0) return;
      for (const w of wunsch) {
        const b = bloecke.find(x => toHex(x.hash) === toHex(w.hash));
        if (b) sende(g, 'block', b.body);
      }
    }
  };
  return { store, chain, sync, sende, liefere, innen: sync as any, zu: () => store.close() };
}

test('Grenzen: 144 Bloecke Mindestarbeit, Seitenbloecke ab 2.000 unter der Spitze geloescht', () => {
  assert.equal(MINDESTARBEIT_BLOECKE, 144);
  assert.equal(SEITENBLOCK_TIEFE, 2_000);
  assert.equal(ZWEIG_FRIST_MS, 120_000);
});

test('Ein leichter Seitenblock tief unter der Spitze: nicht nachgerechnet, nicht gespeichert, Peer bleibt', () => {
  // Hauptkette bis Hoehe 29; der Block haengt an Hoehe 5 an -- 24 Bloecke tief.
  const tief = zweig(kette(), 6, 1, { extra: 'tief' })[0];
  const g = gegenseite('203.0.113.10');
  const k = knoten({ bloecke: 30, grenze: 5, gegen: [g] });

  // accept() nicht anfassen: Nachrechnen waere genau die Last, um die es geht.
  let nachgerechnet = 0;
  const echt = k.chain.accept.bind(k.chain);
  (k.chain as any).accept = (roh: Uint8Array) => { nachgerechnet++; return echt(roh); };

  k.sende(g, 'block', tief.body);
  assert.equal(nachgerechnet, 0, 'accept wurde nicht gerufen');
  assert.equal(k.store.has(tief.hash), false, 'nicht gespeichert');
  assert.deepEqual(g.getrennt, [], 'kein Fehlverhalten -- verbunden');
  assert.equal(k.sync.istZuLeicht(toHex(tief.hash)), true);

  // Neu angekuendigt: wird nicht gleich wieder geholt.
  k.sende(g, 'inv', encodeInv([{ typ: INV_BLOCK, hash: tief.hash }]));
  assert.equal(g.bestellt().length, 0);
  assert.equal(k.chain.height(), 29);
  k.zu();
});

test('Derselbe Block ist gueltig: ohne die Regel und ueber accept() direkt wird er angenommen', () => {
  const tief = zweig(kette(), 6, 1, { extra: 'tief' })[0];
  // Mit der Vorgabe von 144 Bloecken liegt er innerhalb der Grenze.
  const g = gegenseite('203.0.113.11');
  const k = knoten({ bloecke: 30, gegen: [g] });
  k.sende(g, 'block', tief.body);
  assert.equal(k.store.has(tief.hash), true);
  assert.equal(k.chain.height(), 29, 'die Hauptkette bleibt');
  k.zu();

  // Der Abgleich ueber HTTP (cli.ts) gibt Bloecke direkt an accept(): Dort
  // gilt die Regel nicht, und so bleibt es.
  const k2 = knoten({ bloecke: 30, grenze: 5, gegen: [] });
  const r = k2.chain.accept(tief.body);
  assert.equal(r.ok, true);
  assert.equal((r as { stored: boolean }).stored, true);
  k2.zu();
});

test('Ein Konkurrenzblock zur Spitze wird angenommen', () => {
  // Zweigt an Hoehe 28 ab und steht neben Block 29.
  const neben = zweig(kette(), 29, 1, { extra: 'neben' })[0];
  const g = gegenseite('203.0.113.12');
  const k = knoten({ bloecke: 30, grenze: 5, gegen: [g] });
  k.sende(g, 'block', neben.body);
  assert.equal(k.store.has(neben.hash), true);
  assert.deepEqual(g.getrennt, []);
  k.zu();
});

test('Ein schwererer Zweig nach langer Trennung wird uebernommen -- auch ueber zwei Header-Nachrichten', () => {
  // Hauptkette bis Hoehe 19 (Arbeit 20). Der andere Zweig zweigt an Hoehe 4
  // ab und reicht bis Hoehe 24 (Arbeit 25). Grenze 2 Bloecke.
  const anders = zweig(kette(), 5, 20, { extra: 'getrennt' });
  const g = gegenseite('203.0.113.13');
  const k = knoten({ bloecke: 20, grenze: 2, maxHeaders: 10, gegen: [g] });

  // Erste Nachricht: Hoehen 5 bis 14, Arbeit bis 15 -- noch zu leicht.
  k.sende(g, 'headers', headerVon(anders.slice(0, 10)));
  assert.equal(k.sync.fehlendeBloecke(), 10, 'eingereiht');
  assert.equal(g.bestellt().length, 0, 'aber noch nichts geholt');
  assert.ok(g.bekommen.some(x => x.befehl === 'getheaders'), 'und weitergefragt');

  // Zweite Nachricht: bis Hoehe 24, Arbeit 25 > 20 -- der ganze Zweig ist frei.
  k.sende(g, 'headers', headerVon(anders.slice(10)));
  assert.ok(g.bestellt().length > 0, 'jetzt wird geholt');
  k.liefere(g, anders);

  assert.equal(k.chain.height(), 24);
  assert.equal(toHex(k.chain.tip()!.hash), toHex(anders[19].hash));
  assert.deepEqual(g.getrennt, []);
  k.zu();
});

test('Header eines zu leichten Zweigs verlassen die Warteschlange nach ZWEIG_FRIST_MS', () => {
  const leicht = zweig(kette(), 4, 3, { extra: 'leicht' });
  const g = gegenseite('203.0.113.14');
  const k = knoten({ bloecke: 30, grenze: 5, gegen: [g] });
  k.sende(g, 'headers', headerVon(leicht));
  assert.equal(k.sync.fehlendeBloecke(), 3);
  assert.equal(g.bestellt().length, 0, 'nicht geholt');

  k.innen.pruefeOffene();
  assert.equal(k.sync.fehlendeBloecke(), 3, 'vor Ablauf der Frist bleiben sie');
  for (const w of k.innen.warteschlange) w.seit -= ZWEIG_FRIST_MS + 1;
  k.innen.pruefeOffene();
  assert.equal(k.sync.fehlendeBloecke(), 0, 'danach sind sie weg');
  assert.equal(g.bestellt().length, 0);
  assert.deepEqual(g.getrennt, []);
  k.zu();
});

test('Volle Warteschlange aus leichten Headern haelt die echte Kette nicht auf', () => {
  // maxHeaders 2: Die Warteschlange fasst 10 Nachrichten, also 20 Header.
  const leicht = zweig(kette(), 3, 20, { extra: 'fuell' });
  const boese = gegenseite('203.0.113.15');
  const ehrlich = gegenseite('203.0.113.16');
  const k = knoten({ bloecke: 30, grenze: 2, maxHeaders: 2, gegen: [ehrlich, boese] });
  for (let i = 0; i < leicht.length; i += 2) k.sende(boese, 'headers', headerVon(leicht.slice(i, i + 2)));
  assert.equal(k.sync.fehlendeBloecke(), 20, 'voll');
  assert.equal(boese.bestellt().length, 0);

  // Die Hauptkette geht weiter: Hoehen 30 und 31 verlaengern die Spitze.
  k.sende(ehrlich, 'headers', headerVon(kette().bloecke.slice(30, 32)));
  assert.equal(k.sync.fehlendeBloecke(), 2, 'die leichten sind gewichen');
  k.liefere(ehrlich, kette().bloecke);
  assert.equal(k.chain.height(), 31);
  assert.deepEqual(boese.getrennt, []);
  k.zu();
});

test('Aufholen auf derselben Kette bleibt unberuehrt', () => {
  const g = gegenseite('203.0.113.17');
  const k = knoten({ bloecke: 2, grenze: 1, gegen: [g] });
  k.sende(g, 'headers', headerVon(kette().bloecke.slice(2)));
  k.liefere(g, kette().bloecke);
  assert.equal(k.chain.height(), 31);
  k.zu();
});

test('raeumeSeitenbloecke loescht nur Seitenbloecke unter der Hoehe, samt ihren Marken', () => {
  const store = new ChainStore(':memory:');
  const block = (n: number, height: number, mainChain: boolean) => {
    const hash = new Uint8Array(32).fill(n);
    store.put({ hash, height, prevHash: new Uint8Array(32), chainWork: BigInt(height + 1), difficulty: 1n,
      blockTime: 0n, merkleRoot: new Uint8Array(32), stateRoot: new Uint8Array(32), txCount: 1,
      body: new Uint8Array(0), status: 'valid', mainChain });
    store.putSnapshot({ hash, height, stateRoot: new Uint8Array(32), accounts: [] });
    return hash;
  };
  const haupt = [block(1, 10, true), block(2, 3000, true)];
  const tiefNeben = block(3, 10, false);
  const flachNeben = block(4, 2999, false);

  assert.equal(store.raeumeSeitenbloecke(1000), 1);
  assert.equal(store.has(tiefNeben), false);
  assert.equal(store.getSnapshot(tiefNeben), null, 'seine Marke ist weg');
  assert.equal(store.has(flachNeben), true);
  for (const h of haupt) {
    assert.equal(store.has(h), true, 'die aktive Kette bleibt');
    assert.notEqual(store.getSnapshot(h), null);
  }
  assert.equal(store.raeumeSeitenbloecke(1000), 0);
  store.close();
});
