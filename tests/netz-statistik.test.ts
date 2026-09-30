/**
 * Miner-Statistik ueber mehrere Knoten.
 *
 * Wichtigster Fall: ein Knoten OHNE "+stats" (alte Fassung) darf nie eine
 * stats-Nachricht bekommen -- er kennt den Befehl nicht und wuerde die
 * Verbindung trennen. Das wird hier ueber echte TCP-Verbindungen geprueft.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import type { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { encodeStats, decodeStats, STATS_FAEHIG, type Stats } from '../src/lib/node/p2p/messages.ts';
import { NetzStatistik, STATS_VERFALL_MS } from '../src/lib/node/fullnode/NetzStatistik.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
let port = 19700;
const naechsterPort = () => port++;
const adr = (b: number) => new Uint8Array(20).fill(b);

test('stats: Kodierung hin und zurueck', () => {
  const s: Stats = { knoten: 0xdeadbeefcafen, hashrate: 148_200n, sessions: 3, adressen: [adr(1), adr(2)] };
  const d = decodeStats(encodeStats(s));
  assert.equal(d.knoten, s.knoten);
  assert.equal(d.hashrate, s.hashrate);
  assert.equal(d.sessions, 3);
  assert.deepEqual(d.adressen.map(toHex), [toHex(adr(1)), toHex(adr(2))]);
});

test('Summe: Adressen einmal gezaehlt, Hashrate und Sitzungen addiert', () => {
  const st = new NetzStatistik(1n);
  st.aufnehmen({ knoten: 2n, hashrate: 100n, sessions: 2, adressen: [adr(1), adr(3)] });
  const s = st.summe({ adressen: [toHex(adr(1)), toHex(adr(2))], hashrate: 50, sessions: 2 });
  assert.deepEqual(s, { knoten: 2, miner: 3, hashrate: 150, sessions: 4 });
});

test('Summe: eigene Meldung ueber Umwege zaehlt nicht, veraltete verfallen', () => {
  let jetzt = 1_000_000;
  const st = new NetzStatistik(7n, () => jetzt);
  st.aufnehmen({ knoten: 7n, hashrate: 999n, sessions: 9, adressen: [adr(9)] });
  st.aufnehmen({ knoten: 8n, hashrate: 10n, sessions: 1, adressen: [adr(4)] });
  const leer = { adressen: [], hashrate: 0, sessions: 0 };
  assert.equal(st.summe(leer).knoten, 2);
  assert.equal(st.summe(leer).hashrate, 10);
  jetzt += STATS_VERFALL_MS + 1;
  assert.deepEqual(st.summe(leer), { knoten: 1, miner: 0, hashrate: 0, sessions: 0 });
});

function knoten(agent: string, portNr: number, seeds: { host: string; port: number }[] = [],
                empfang?: (p: PeerConnection, s: Stats) => void) {
  return new PeerManager({
    params: REGTEST, agent, listenPort: portNr, host: '127.0.0.1', seeds,
    kette: () => ({ height: 1, chainWork: 100n }),
    onMessage: (p, f) => { if (f.command === 'stats' && empfang) empfang(p, decodeStats(f.payload)); },
  });
}

test('Zwei neue Knoten tauschen stats ueber TCP aus', async () => {
  const pA = naechsterPort();
  const erhalten: Stats[] = [];
  const a = knoten(`yskar-node/0.1.0 ${STATS_FAEHIG}`, pA, [], (_p, s) => erhalten.push(s));
  await a.start();
  const b = knoten(`yskar-node/0.1.0 ${STATS_FAEHIG}`, 0, [{ host: '127.0.0.1', port: pA }]);
  await b.start();
  await warte(500);

  const peer = b.bereite()[0];
  assert.ok(peer.info().agent.includes(STATS_FAEHIG));
  peer.send('stats', encodeStats({ knoten: 5n, hashrate: 42n, sessions: 1, adressen: [adr(5)] }));
  await warte(300);

  assert.equal(erhalten.length, 1);
  assert.equal(erhalten[0].hashrate, 42n);
  assert.equal(a.bereite().length, 1, 'Verbindung muss bestehen bleiben');
  await a.stop(); await b.stop();
});

test('Alter Knoten ohne +stats: bekommt nichts, Verbindung bleibt', async () => {
  const pAlt = naechsterPort();
  const alt = knoten('yskar-node/0.1.0', pAlt);
  await alt.start();
  const neu = knoten(`yskar-node/0.1.0 ${STATS_FAEHIG}`, 0, [{ host: '127.0.0.1', port: pAlt }]);
  await neu.start();
  await warte(500);

  // Genau die Regel aus cli.ts: nur an Peers mit "+stats".
  const nutzlast = encodeStats({ knoten: 1n, hashrate: 1n, sessions: 1, adressen: [] });
  let gesendet = 0;
  for (const p of neu.bereite()) {
    if (p.info().agent.includes(STATS_FAEHIG)) { p.send('stats', nutzlast); gesendet++; }
  }
  await warte(300);

  assert.equal(gesendet, 0, 'an einen alten Knoten darf nichts gehen');
  assert.equal(neu.bereite().length, 1, 'Verbindung zum alten Knoten besteht');
  assert.equal(alt.bereite().length, 1);
  await alt.stop(); await neu.stop();
});
