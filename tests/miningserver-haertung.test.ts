/**
 * Was die Mining-Schnittstelle NICHT mit sich machen laesst.
 *
 * Die Schnittstelle ist fuer jeden erreichbar, der den Knoten erreicht. Drei
 * Dinge haben eine Pruefung von aussen nicht ueberstanden und sind hier
 * festgehalten:
 *
 *   1. "GET //" beendete den ganzen Knoten.
 *   2. Derselbe Treffer liess sich im Pool immer wieder gutschreiben.
 *   3. Meldungen ueber Miner (stats) mit immer neuer Kennung fuellten den
 *      Speicher, bis der Knoten stand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { NetzStatistik, STATS_VERFALL_MS } from '../src/lib/node/fullnode/NetzStatistik.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';

const A = 'ysr1z43a5eevpzh0h5n7wukhywghzfydt975zpqqlc';
const B = 'ysr1lfn8dw6st25jxv653vypcp929xs9lzg44954zz';
const adr = (n: number) => new Uint8Array(20).fill(n);

async function knoten(port: number) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => { const t = uhr; uhr += REGTEST.targetBlockTime; return t; });
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  const pk = new PoolCoordinator({ name: 'pool.test', feeBps: 0, payoutAddress: null, pplnsFaktor: 1_000_000n });
  server.poolKoordinator = pk;
  const fehler: string[] = [];
  server.onFehler = (wo, e) => fehler.push(`${wo}: ${e.message}`);
  await server.listen('127.0.0.1', port);
  return { server, mining, pk, fehler, url: `http://127.0.0.1:${port}/api/v2`, port,
           async zu() { await server.close(); store.close(); } };
}

const hole = async (url: string, pfad: string, body?: unknown) => {
  const res = await fetch(url + pfad, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() as Record<string, any> };
};

/** Eine Anfrage Zeichen fuer Zeichen -- auch solche, die kein Programm sonst schickt. */
function roh(port: number, anfrage: string): Promise<string> {
  return new Promise((auf, ab) => {
    const s = connect(port, '127.0.0.1', () => s.write(anfrage));
    let text = '';
    s.on('data', c => { text += c; });
    s.on('end', () => auf(text));
    s.on('error', ab);
    setTimeout(() => { s.destroy(); auf(text); }, 1500);
  });
}

test('Eine unlesbare Adresse kostet nur diese eine Anfrage, nicht den Knoten', async () => {
  const k = await knoten(18_701);
  try {
    for (const pfad of ['//', '//x//y', '/\\\\', 'http://[::1', '/%']) {
      const antwort = await roh(k.port, `GET ${pfad} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
      assert.match(antwort, /^HTTP\/1\.1 (400|404)/, `${pfad} -> ${antwort.slice(0, 40)}`);
    }
    // Der Knoten lebt und antwortet weiter.
    assert.equal((await hole(k.url, '/pool')).status, 200);
  } finally { await k.zu(); }
});

test('Anfragen ohne JSON-Objekt: 400, kein interner Fehler', async () => {
  const k = await knoten(18_702);
  try {
    for (const rumpf of ['null', '[1,2]', '"text"', '17', '{kaputt']) {
      const res = await fetch(k.url + '/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: rumpf });
      assert.equal(res.status, 400, rumpf);
      assert.equal((await res.json() as any).error, 'bad_request');
    }
    assert.deepEqual(k.fehler, [], 'Das ist kein Fehler des Knotens und steht nicht in seinem Protokoll');
    // Die Angabe "platform" wird nicht in beliebiger Laenge aufgehoben.
    const s = await hole(k.url, '/session', { address: A, mode: 'pool', platform: 'x'.repeat(50_000) });
    assert.equal(s.status, 200);
    assert.ok([...((k.server as any).sessions as Map<string, { platform: string | null }>).values()].every(x => (x.platform ?? '').length <= 64));
  } finally { await k.zu(); }
});

test('Pool: Derselbe Treffer zählt genau einmal', async () => {
  const k = await knoten(18_703);
  try {
    // Der Hash wird hier nicht gerechnet: Jede Nonce gilt als Treffer mit
    // erreichter Difficulty 5000 -- weit ueber dem Share-Ziel von 128, aber
    // kein Block. So laesst sich pruefen, WAS gutgeschrieben wird.
    (k.mining as any).submitNonce = () => ({ ok: true, block: false, achieved: '5000' });

    const s = (await hole(k.url, '/session', { address: A, mode: 'pool' })).json;
    const job = (await hole(k.url, `/job?session=${s.sessionId}`)).json;
    const reiche = (nonce: string, jobId = job.jobId) => hole(k.url, '/share', { sessionId: s.sessionId, jobId, nonce });

    const erster = (await reiche('42')).json;
    assert.equal(erster.accepted, true);
    assert.equal(k.pk.arbeitGesamt(), 128n);

    // Hundertmal derselbe Treffer: nichts kommt dazu.
    for (let i = 0; i < 100; i++) {
      const r = (await reiche('42')).json;
      assert.equal(r.accepted, false);
      assert.equal(r.reason, 'duplicate');
    }
    assert.equal(k.pk.arbeitGesamt(), 128n, 'Ein Treffer, eine Gutschrift');
    // Dieselbe Zahl anders geschrieben ist derselbe Treffer.
    assert.equal((await reiche('0x2a')).json.reason, 'duplicate');
    assert.equal((await reiche('042')).json.reason, 'duplicate');

    // Ein anderer Treffer zaehlt.
    assert.equal((await reiche('43')).json.accepted, true);
    assert.equal(k.pk.arbeitGesamt(), 256n);
    // Unsinn als Nonce.
    assert.equal((await reiche('-1')).json.reason, 'malformed');
    assert.equal((await reiche('18446744073709551616')).json.reason, 'malformed');

    // Neue Arbeit: Dort ist 42 ein neuer Treffer -- es ist ein anderer Header.
    const job2 = (await hole(k.url, `/job?session=${s.sessionId}`)).json;
    assert.notEqual(job2.jobId, job.jobId);
    assert.equal((await reiche('42', job2.jobId)).json.accepted, true);
    assert.equal((await reiche('42', job2.jobId)).json.reason, 'duplicate');
    // Der alte Job gilt nicht mehr.
    assert.equal((await reiche('44')).json.reason, 'job_foreign');

    // Eine zweite Sitzung derselben Adresse hat ihren eigenen Job -- kein Weg, den Treffer mitzunehmen.
    const s2 = (await hole(k.url, '/session', { address: A, mode: 'pool' })).json;
    assert.equal((await hole(k.url, '/share', { sessionId: s2.sessionId, jobId: job2.jobId, nonce: '42' })).json.reason, 'job_foreign');
  } finally { await k.zu(); }
});

test('Sitzungen: Es gibt eine Obergrenze', async () => {
  const k = await knoten(18_704);
  try {
    const sitzungen = (k.server as any).sessions as Map<string, unknown>;
    const eine = (await hole(k.url, '/session', { address: A })).json;
    const muster = sitzungen.get(eine.sessionId);
    for (let i = 0; i < 5_000; i++) sitzungen.set('x' + i, muster);
    const voll = (await hole(k.url, '/session', { address: B })).json;
    assert.equal(voll.error, 'too_many_sessions');
    assert.equal(voll.sessionId, undefined);
  } finally { await k.zu(); }
});

test('zulassen: Der Betreiber entscheidet, wer die Schnittstelle benutzt', async () => {
  const k = await knoten(18_705);
  try {
    assert.equal((await hole(k.url, '/pool')).status, 200, 'Ohne Regel: jeder');
    k.server.zulassen = req => req.headers['x-darf'] === 'ja';
    assert.equal((await hole(k.url, '/pool')).status, 403);
    const res = await fetch(k.url + '/pool', { headers: { 'x-darf': 'ja' } });
    assert.equal(res.status, 200);
  } finally { await k.zu(); }
});

test('stats: Eine Verbindung belegt einen Platz, egal wie viele Kennungen sie nennt', () => {
  let jetzt = 1_000_000;
  const st = new NetzStatistik(1n, () => jetzt);
  const leer = { adressen: [], hashrate: 0, sessions: 0 };

  // Ein Peer flutet: 20.000 Meldungen, jede mit neuer Kennung und 500 Adressen.
  const viele = Array.from({ length: 500 }, (_, i) => adr(i % 250));
  for (let i = 0; i < 20_000; i++) {
    jetzt += 2;
    st.aufnehmen({ knoten: BigInt(1000 + i), hashrate: 10n, sessions: 1, adressen: viele }, 'v:7');
  }
  assert.equal((st as any).meldungen.size, 1, 'Aufgehoben wird je Verbindung eine Meldung');
  assert.equal(st.summe(leer).knoten, 2);

  // Zwei Verbindungen zum selben Knoten zaehlen einmal.
  jetzt += 5_000;
  st.aufnehmen({ knoten: 50n, hashrate: 100n, sessions: 2, adressen: [adr(1)] }, 'v:8');
  st.aufnehmen({ knoten: 50n, hashrate: 100n, sessions: 2, adressen: [adr(1)] }, 'v:9');
  const s = st.summe(leer);
  assert.equal(s.knoten, 3);
  assert.equal(s.hashrate, 110);

  // Zu schnell hintereinander: Die zweite Meldung wird uebergangen.
  st.aufnehmen({ knoten: 50n, hashrate: 999_999n, sessions: 2, adressen: [adr(1)] }, 'v:8');
  assert.equal(st.summe(leer).hashrate, 110);

  // Sehr viele Verbindungen: Auch dann waechst es nicht ueber die Grenze.
  for (let i = 0; i < 5_000; i++) st.aufnehmen({ knoten: BigInt(9000 + i), hashrate: 1n, sessions: 1, adressen: [] }, 'v:' + (100 + i));
  assert.ok((st as any).meldungen.size <= 256);

  // Eine geschlossene Verbindung zaehlt nicht mehr; nach der Frist verfaellt alles.
  st.vergiss('v:7');
  jetzt += STATS_VERFALL_MS + 1;
  assert.deepEqual(st.summe(leer), { knoten: 1, miner: 0, hashrate: 0, sessions: 0 });

  // Unsinnige Zahlen kommen nicht in die Summe.
  st.aufnehmen({ knoten: 60n, hashrate: -5n as unknown as bigint, sessions: 1, adressen: [adr(2)] }, 'v:a');
  assert.equal(st.summe(leer).hashrate, 0);
  assert.equal(toHex(adr(2)).length, 40);
});
