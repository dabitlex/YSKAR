/**
 * Fassungsstand und Handschlag (docs/CONSENSUS_V6.md 11.1, 11.4, 13).
 *
 * Nichts davon ist Konsens -- aber ein Handschlag, der alte Knoten trennt,
 * waere ein Netzausfall mit Ansage. Deshalb zuerst: Ein Peer ohne die
 * neuen Felder bleibt lesbar, und ein alter Leser kommt mit den neuen
 * Feldern zurecht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as M from '../src/lib/node/p2p/messages.ts';
import { MAINNET, REGTEST, REGTEST_V6 } from '../src/lib/core/networks.ts';
import { V6_HEIGHT_UNSET } from '../src/lib/core/params.ts';
import {
  IMPLEMENTIERTE_FASSUNG, fassungsStatus, naechsteAktivierung, liefertBloeckeAb,
  imVerdraengungsfenster, netzGruppe, UPDATE_EMPFOHLEN_NACH_S, VERMUTLICH_ABGESPALTEN_NACH_S,
} from '../src/lib/node/fassung.ts';
import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { ReadApi } from '../src/lib/node/fullnode/ReadApi.ts';
import { toHex } from '../src/lib/core/codec.ts';

const basis: M.Version = {
  protocol: M.PROTOCOL_VERSION,
  network: MAINNET.network,
  chainId: MAINNET.chainId,
  agent: 'yskar-node/1.0.0',
  height: 12_345,
  chainWork: '76967472',
  nonce: 0x0123456789abcdefn,
  port: 8646,
  timestamp: 1788912000n,
  revision: 6,
  nextActivationHeight: 15_000,
};

// ------------------------------------------------------------ Handschlag

test('version: Fassung und Aktivierungshoehe ueberleben den Rueckweg', () => {
  const z = M.decodeVersion(M.encodeVersion(basis));
  assert.equal(z.revision, 6);
  assert.equal(z.nextActivationHeight, 15_000);
  assert.equal(z.timestamp, basis.timestamp);
});

test('version ohne die Felder (alter Peer) liest sich als Fassung 5 ohne Aktivierung', () => {
  // Genau die Bytes bis zum Zeitstempel, wie ein Knoten vor 11.4 sie schickt.
  const voll = M.encodeVersion(basis);
  const alt = voll.slice(0, voll.length - 5);
  const z = M.decodeVersion(alt);
  assert.equal(z.revision, M.FASSUNG_OHNE_FELDER);
  assert.equal(z.nextActivationHeight, 0);
  assert.equal(z.height, basis.height);
  assert.equal(z.nonce, basis.nonce);
});

test('version mit halbem Fassungsfeld ist unlesbar', () => {
  const voll = M.encodeVersion(basis);
  for (const kuerzung of [1, 2, 3, 4]) {
    assert.throws(() => M.decodeVersion(voll.slice(0, voll.length - kuerzung)), /unvollstaendig/);
  }
});

test('version: die neuen Felder haengen hinter dem Zeitstempel -- ein alter Leser ueberliest sie', () => {
  // Nachgebauter Leser der Fassung vor 11.4: liest bis zum Zeitstempel und hoert auf.
  const voll = M.encodeVersion(basis);
  const alt = M.decodeVersion(voll.slice(0, voll.length - 5));
  const neu = M.decodeVersion(voll);
  for (const k of ['protocol', 'network', 'agent', 'height', 'chainWork', 'nonce', 'port', 'timestamp'] as const) {
    assert.deepEqual(neu[k], alt[k], k);
  }
  assert.equal(toHex(neu.chainId), toHex(alt.chainId));
  // Und das Protokoll bleibt 1: Ein alter Knoten trennt bei jeder anderen Zahl.
  assert.equal(M.PROTOCOL_VERSION, 1);
});

// ---------------------------------------------------------- Fassungsstand

test('fassungsStatus: ein gesehener Block hoeherer Fassung schlaegt alles', () => {
  assert.equal(fassungsStatus(true, 0, 0), 'outdated');
  assert.equal(fassungsStatus(true, 10 ** 9, 1), 'outdated');
});

test('fassungsStatus: ohne gesetzten Zeitstempel gibt es keine Zeitregel', () => {
  assert.equal(fassungsStatus(false, 4_000_000_000, 0), 'current');
});

test('fassungsStatus: 180 Tage -> update_recommended, 365 Tage -> probably_forked', () => {
  const t0 = 1_800_000_000;
  assert.equal(fassungsStatus(false, t0, t0), 'current');
  assert.equal(fassungsStatus(false, t0 + UPDATE_EMPFOHLEN_NACH_S - 1, t0), 'current');
  assert.equal(fassungsStatus(false, t0 + UPDATE_EMPFOHLEN_NACH_S, t0), 'update_recommended');
  assert.equal(fassungsStatus(false, t0 + VERMUTLICH_ABGESPALTEN_NACH_S - 1, t0), 'update_recommended');
  assert.equal(fassungsStatus(false, t0 + VERMUTLICH_ABGESPALTEN_NACH_S, t0), 'probably_forked');
});

test('naechsteAktivierung: 0 solange die Hoehe nicht gesetzt ist', () => {
  assert.equal(MAINNET.v6Height, V6_HEIGHT_UNSET);
  assert.equal(naechsteAktivierung(MAINNET), 0);
  assert.equal(naechsteAktivierung(REGTEST), 0);
  assert.equal(naechsteAktivierung(REGTEST_V6), 0, 'Hoehe 0 heisst: seit Genesis, also keine kommende Aktivierung');
  assert.equal(naechsteAktivierung({ ...REGTEST, v6Height: 500 }), 500);
});

// ----------------------------------------------------------- Netzverhalten

test('liefertBloeckeAb: alte Peers nur fuer Bloecke vor der Hoehe', () => {
  const p = { ...REGTEST, v6Height: 500 };
  assert.equal(liefertBloeckeAb(5, 499, p), true);
  assert.equal(liefertBloeckeAb(5, 500, p), false);
  assert.equal(liefertBloeckeAb(6, 500, p), true);
  assert.equal(liefertBloeckeAb(0, 10, p), true, 'vor dem Handschlag: Hoehe entscheidet');
  // Ohne gesetzte Hoehe gibt es nichts, was ein alter Peer nicht haette.
  assert.equal(liefertBloeckeAb(5, 10 ** 9, MAINNET), true);
  assert.equal(IMPLEMENTIERTE_FASSUNG, 6);
});

test('imVerdraengungsfenster: genau die 1.000 Bloecke vor der Hoehe', () => {
  const p = { ...REGTEST, v6Height: 5_000 };
  assert.equal(imVerdraengungsfenster(3_999, p), false);
  assert.equal(imVerdraengungsfenster(4_000, p), true);
  assert.equal(imVerdraengungsfenster(4_999, p), true);
  assert.equal(imVerdraengungsfenster(5_000, p), false);
  assert.equal(imVerdraengungsfenster(4_500, MAINNET), false, 'ohne Hoehe kein Fenster');
});

test('netzGruppe: /16 bei IPv4, /32 bei IPv6, Namen wie sie sind', () => {
  assert.equal(netzGruppe('203.0.113.7'), '203.0');
  assert.equal(netzGruppe('::ffff:203.0.113.7'), '203.0');
  assert.equal(netzGruppe('2001:db8:1::7'), '2001:db8');
  assert.equal(netzGruppe('2001:DB8::1'), '2001:db8');
  assert.equal(netzGruppe('Pool.Yskar.App'), 'pool.yskar.app');
  assert.notEqual(netzGruppe('203.0.113.7'), netzGruppe('203.1.113.7'));
});

// -------------------------------------------------------------- Status-API

test('/summary nennt Fassung, Aktivierungshoehe und Fassungsstand', () => {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool(REGTEST);
  const api = new ReadApi({ chain, store, pool, params: REGTEST });
  const s = api.summary() as Record<string, unknown>;
  assert.equal(s.revision, 6);
  assert.equal(s.nextActivationHeight, 0);
  assert.equal(s.revision_status, 'current');

  const mitHoehe = new ReadApi({ chain, store, pool, params: { ...REGTEST, v6Height: 777 } });
  assert.equal((mitHoehe.summary() as Record<string, unknown>).nextActivationHeight, 777);
});

// --------------------------------------------------- Verdraengung (11.4)

import { connect } from 'node:net';
import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import { FrameReader, encodeFrame, magicFor } from '../src/lib/node/p2p/wire.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Ein Peer alter Fassung, von Hand gebaut: Er spricht den Handschlag ohne
 * die Felder von 11.4 -- genau die Bytes, die ein Knoten vor dieser
 * Fassung schickt -- und bleibt danach still.
 */
function alterPeer(port: number, params = REGTEST): Promise<{ ende: () => void }> {
  return new Promise(auf => {
    const magic = magicFor(params.chainId);
    const leser = new FrameReader(magic);
    const sock = connect(port, '127.0.0.1', () => {
      const voll = M.encodeVersion({
        ...basis, network: params.network, chainId: params.chainId,
        agent: 'yskar-node/0.7.1', nonce: BigInt(Date.now()) ^ 0x5a5an,
      });
      sock.write(encodeFrame(magic, 'version', voll.slice(0, voll.length - 5)));
    });
    sock.on('data', b => {
      for (const f of leser.push(new Uint8Array(b)).frames) {
        if (f.command === 'version') sock.write(encodeFrame(magic, 'verack', new Uint8Array(0)));
        if (f.command === 'verack') auf({ ende: () => sock.destroy() });
      }
    });
    sock.on('error', () => {});
  });
}

test('Kurz vor der Hoehe macht ein Peer alter Fassung einen vollen Platz frei -- ein neuer nicht', async () => {
  const params = { ...REGTEST, v6Height: 1_500 };
  const port = 19_600 + Math.floor(Math.random() * 300);
  const knoten = (p: number, listen: boolean) => new PeerManager({
    params, agent: 'test/1.0', listenPort: listen ? p : 0, host: '127.0.0.1',
    maxEin: 2, kette: () => ({ height: 1_000, chainWork: 100n }),
  });
  const a = knoten(port, true);
  await a.start();

  const alt = await alterPeer(port, params);
  const neu1 = knoten(0, false); await neu1.start(); neu1.verbinde('127.0.0.1', port);
  await warte(500);
  assert.equal(a.zahlEin(), 2);
  assert.deepEqual(a.info().map(p => p.revision).sort(), [5, 6]);

  // Der dritte Gast: Jemand muss weichen -- der alte, nicht der neue.
  const neu2 = knoten(0, false); await neu2.start(); neu2.verbinde('127.0.0.1', port);
  await warte(500);
  assert.ok(a.zahlEin() <= 2, `A hat ${a.zahlEin()} eingehende`);
  assert.deepEqual(a.info().map(p => p.revision), [6, 6]);

  alt.ende();
  await a.stop(); await neu1.stop(); await neu2.stop();
});

test('Ausserhalb des Fensters wird ein Peer alter Fassung nicht verdraengt', async () => {
  const params = { ...REGTEST, v6Height: 1_500 };
  const port = 19_900 + Math.floor(Math.random() * 300);
  const knoten = (p: number, listen: boolean) => new PeerManager({
    params, agent: 'test/1.0', listenPort: listen ? p : 0, host: '127.0.0.1',
    maxEin: 2, kette: () => ({ height: 100, chainWork: 100n }),
  });
  const a = knoten(port, true);
  await a.start();
  const alt = await alterPeer(port, params);
  const neu1 = knoten(0, false); await neu1.start(); neu1.verbinde('127.0.0.1', port);
  await warte(500);
  const neu2 = knoten(0, false); await neu2.start(); neu2.verbinde('127.0.0.1', port);
  await warte(500);
  assert.ok(a.zahlEin() <= 2);
  assert.ok(a.info().some(p => p.revision === 5), 'der alte Peer bleibt');

  alt.ende();
  await a.stop(); await neu1.stop(); await neu2.stop();
});
