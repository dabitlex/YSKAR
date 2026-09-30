/**
 * Verbreitung von Überweisungen zwischen echten Knoten.
 *
 * Zwei bzw. drei vollständige Knoten auf Loopback, echte TCP-Verbindungen,
 * echt signierte Überweisungen. Bis September 2026 gab es das überhaupt
 * nicht: INV_TX und der Befehl 'tx' waren im Protokoll definiert, aber
 * keine Zeile sendete oder empfing sie. Eine Überweisung erreichte nur den
 * Knoten, bei dem sie eingereicht wurde -- jeder andere baute Blöcke, als
 * gäbe es sie nicht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import { SyncManager } from '../src/lib/node/p2p/SyncManager.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { txid, buildTransfer, type Transfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { UNIT, MIN_FEE } from '../src/lib/core/params.ts';
import { emptyState, applyBlock, type State } from '../src/lib/core/state.ts';
import { mineBlock, zeig } from './helpers/regtest.ts';
import { serializeTx } from '../src/lib/core/tx.ts';
import { encodeInv, INV_TX } from '../src/lib/node/p2p/messages.ts';
import type { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
let port = 19600;
const naechsterPort = () => port++;

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const MINER = keypairFromMnemonic(WORTE, '', 0, 0);
const EMPFAENGER = new Uint8Array(20).fill(0xee);

/** Ein vollständiger Knoten -- diesmal MIT Warteschlange. */
function knoten(opt: { port?: number; seeds?: { host: string; port: number }[] } = {}) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool(REGTEST);

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

  sync = new SyncManager({ chain, store, peers, pool, params: REGTEST });

  return {
    store, chain, pool, peers, sync,
    async start() { await peers.start(); sync.start(); },
    async stop() { sync.stop(); await peers.stop(); store.close(); },
  };
}

function ueberweisung(nonce: bigint, betrag = UNIT): Transfer {
  return buildTransfer({ chainId: REGTEST.chainId,
    from: MINER.addressRaw, to: EMPFAENGER, amount: betrag,
    fee: MIN_FEE, nonce,
    publicKey: MINER.publicKey, privateKey: MINER.privateKey,
  });
}

/** Eine Kette, in der MINER die Coinbase bekommt -- damit er Guthaben hat. */
function ketteMitGuthaben(n: number) {
  const start = 1_788_912_000n;
  const state: State = emptyState();
  const bloecke = [];
  let prev = new Uint8Array(32);
  for (let h = 0; h < n; h++) {
    const g = mineBlock({
      height: h, prevHash: prev, state,
      timestamp: start + BigInt(h) * REGTEST.targetBlockTime,
      miner: MINER.addressRaw,
    });
    assert.ok(applyBlock(state, g.block, REGTEST).ok);
    bloecke.push(g);
    prev = g.hash;
  }
  return bloecke;
}

function fuelle(k: ReturnType<typeof knoten>, bloecke: { body: Uint8Array }[]) {
  for (const b of bloecke) {
    const r = k.chain.accept(b.body);
    assert.ok(r.ok, `Testkette nicht annehmbar: ${zeig(r)}`);
  }
}

// ---------------------------------------------------------------------------

test('Eine Überweisung wandert von einem Knoten zum anderen', async () => {
  const kette = ketteMitGuthaben(3);

  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  fuelle(a, kette);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  fuelle(b, kette);
  await warte(1200);

  const tx = ueberweisung(0n);
  const id = toHex(txid(tx));

  // Einreichen wie über die Schnittstelle: erst aufnehmen, dann ankündigen.
  assert.ok(a.pool.add(tx, a.chain.state(), a.chain.height() + 1).ok);
  a.sync.kuendigeAnTx(txid(tx));

  await warte(1500);

  assert.equal(b.pool.has(id), true, 'B muss die Überweisung kennen');
  assert.equal(b.pool.size(), 1);

  // Und sie muss unverändert angekommen sein -- gleiche txid heißt gleiche Bytes.
  const beiB = b.pool.get(id);
  assert.ok(beiB, 'B muss sie herausgeben können');
  assert.equal(toHex(txid(beiB!)), id);

  await a.stop(); await b.stop();
});

test('Eine Überweisung wird über einen Knoten hinweg weitergereicht', async () => {
  const kette = ketteMitGuthaben(3);

  // Kette A — B — C. C kennt A nicht.
  const pA = naechsterPort();
  const pB = naechsterPort();

  const a = knoten({ port: pA });
  await a.start(); fuelle(a, kette);

  const b = knoten({ port: pB, seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start(); fuelle(b, kette);

  const c = knoten({ seeds: [{ host: '127.0.0.1', port: pB }] });
  await c.start(); fuelle(c, kette);

  await warte(1500);

  const tx = ueberweisung(0n);
  const id = toHex(txid(tx));

  assert.ok(a.pool.add(tx, a.chain.state(), a.chain.height() + 1).ok);
  a.sync.kuendigeAnTx(txid(tx));

  await warte(2500);

  assert.equal(b.pool.has(id), true, 'B muss sie haben');
  assert.equal(c.pool.has(id), true, 'C muss sie über B bekommen haben');

  /*
    Und sie darf nicht im Kreis laufen: Genau ein Eintrag je Knoten.
    Weitergereicht wird nur, was tatsächlich neu aufgenommen wurde -- was
    schon liegt, kommt als duplicate zurück und wird nicht noch einmal
    herumgeschickt.
  */
  assert.equal(a.pool.size(), 1);
  assert.equal(b.pool.size(), 1);
  assert.equal(c.pool.size(), 1);

  await a.stop(); await b.stop(); await c.stop();
});

test('Eine abgewiesene Überweisung landet im Gedächtnis und wird nicht neu angefordert', async () => {
  /*
    WARUM DIESER TEST OHNE NETZ AUSKOMMT

    Der erste Versuch war ein Knoten ohne Kette, bei dem der Absender kein
    Guthaben hätte. Das geht nicht: Ein Knoten, der sich verbindet, holt
    sich die Kette -- danach ist das Guthaben da und die Überweisung
    brauchbar. Zwei Knoten dauerhaft auf verschiedenen Ketten zu halten,
    wäre ein Aufbau, der mit dem zu Prüfenden nichts zu tun hat.

    Also direkt: eine Überweisung von jemandem, den dieser Knoten nicht
    kennt. Sie ist sauber gebaut und richtig signiert -- nur ungedeckt.
    Genau der Fall, der ohne Gedächtnis eine Schleife ergäbe: ankündigen,
    anfordern, prüfen, ablehnen, von vorn.
  */
  const a = knoten({ port: naechsterPort() });
  await a.start();

  const fremder = keypairFromMnemonic(WORTE, 'anderer', 0, 0);
  const ungedeckt = buildTransfer({ chainId: REGTEST.chainId,
    from: fremder.addressRaw, to: EMPFAENGER, amount: UNIT,
    fee: MIN_FEE, nonce: 0n,
    publicKey: fremder.publicKey, privateKey: fremder.privateKey,
  });
  const id = toHex(txid(ungedeckt));

  // Ein Peer-Doppel: aufTx berührt bei einer Ablehnung nichts davon.
  const gesendet: string[] = [];
  const peer = {
    host: '127.0.0.1',
    send: (c: string) => { gesendet.push(c); return true; },
    close: (grund: string) => { gesendet.push('close:' + grund); },
  } as unknown as PeerConnection;

  a.sync.aufNachricht(peer, { command: 'tx', payload: serializeTx(ungedeckt) });

  assert.equal(a.pool.has(id), false, 'ungedeckt gehört nicht in die Warteschlange');
  assert.equal(a.sync.istAbgewiesen(id), true, 'sie muss im Gedächtnis stehen');
  assert.deepEqual(gesendet, [], 'kein Trennen: falsch gebaut war sie nicht');

  /*
    Und die Wirkung: Auf eine erneute Ankündigung folgt kein getdata mehr.
    Ohne das Gedächtnis stünde hier eines.
  */
  a.sync.aufNachricht(peer, {
    command: 'inv',
    payload: encodeInv([{ typ: INV_TX, hash: txid(ungedeckt) }]),
  });
  assert.deepEqual(gesendet, [], 'sie darf nicht erneut angefordert werden');

  await a.stop();
});

test('Eine unlesbare Überweisung trennt die Verbindung', async () => {
  const a = knoten({ port: naechsterPort() });
  await a.start();

  const gesendet: string[] = [];
  const peer = {
    host: '127.0.0.1',
    send: (c: string) => { gesendet.push(c); return true; },
    close: (grund: string) => { gesendet.push('close:' + grund); },
  } as unknown as PeerConnection;

  // Bytes, die keine Transaktion sind. Das ist Fehlverhalten, kein Pech.
  a.sync.aufNachricht(peer, { command: 'tx', payload: new Uint8Array([1, 2, 3]) });

  assert.equal(gesendet.length, 1);
  assert.match(gesendet[0], /^close:tx_unlesbar/);

  await a.stop();
});
