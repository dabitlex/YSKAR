/**
 * Pool-Mining ÜBER DEN SERVER.
 *
 * Es gibt schon `pool-anbindung.test.ts` — aber der ruft den
 * PoolCoordinator direkt auf. Genau deshalb hat er einen echten Fehler
 * nicht gefunden: Im MiningServer fehlte die Zeile, die einen
 * angenommenen Share überhaupt in den Pool einträgt.
 *
 * Von außen sah alles richtig aus. Der Knoten baute Pool-Jobs, schrieb
 * seinen Namen in die Blöcke, die Sitzung meldete `mode: pool`. Nur das
 * PPLNS-Fenster blieb leer, `coinbase()` lieferte null, und der Blockbau
 * fiel auf eine Coinbase der Fassung 1 mit EINEM Empfänger zurück.
 *
 * Ein Pool, der wie Solo zahlt, und niemand merkt es.
 *
 * Dieser Test geht deshalb den ganzen Weg: anmelden, Job holen, Nonce
 * suchen, Share einreichen — und dann nachsehen, ob die Arbeit angekommen
 * ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { nameToExtra } from '../src/lib/chain/finderName.ts';

/*
  Im Testnetz ist die Blockdifficulty 1, das Share-Ziel aber 128 -- ein
  Share waere also SCHWERER zu finden als ein ganzer Block und braeuchte
  rund acht Millionen Hashes.

  Deshalb wird hier gegen das BLOCKziel gesucht. Der Server nimmt einen
  Block unabhaengig vom Share-Ziel an, und seit der Korrektur traegt auch
  der Blockpfad die Arbeit in den Pool ein -- was richtig ist: Der Miner
  hat sie geleistet.
*/
function zielBytes(ziel: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = ziel;
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}

const blockZiel = (job: Record<string, any>) =>
  toHex(zielBytes((1n << 240n) / BigInt(job.difficulty)));

const A = 'ysr1z43a5eevpzh0h5n7wukhywghzfydt975zpqqlc';
const B = 'ysr1lfn8dw6st25jxv653vypcp929xs9lzg44954zz';

async function knoten(port: number, mitPool = true) {
  const store = new ChainStore(':memory:',
    { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => {
    const t = uhr; uhr += REGTEST.targetBlockTime; return t;
  });
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  /*
    Grosser PPLNS-Faktor, weil die Blockdifficulty im Testnetz 1 ist.

    Das Fenster ist normalerweise doppelt so gross wie die Netz-Difficulty --
    hier also ZWEI Arbeitseinheiten, waehrend ein einzelner Share 128 wiegt.
    Nach dem ersten Block bliebe nichts uebrig, und die Aufteilung haette
    immer genau einen Empfaenger.

    Auf dem Mainnet (Difficulty ~170.000) stellt sich die Frage nicht: Das
    Fenster fasst dort hunderte Shares.
  */
  const pk = mitPool
    ? new PoolCoordinator({ name: 'pool.test', feeBps: 0, payoutAddress: null,
                            pplnsFaktor: 1_000_000n })
    : null;
  server.poolKoordinator = pk;
  if (pk) server.blockName = nameToExtra('pool.test');
  await server.listen('127.0.0.1', port);
  return {
    store, chain, server, pk, url: `http://127.0.0.1:${port}/api/v2`,
    async zu() { await server.close(); store.close(); },
  };
}

const hole = async (url: string, pfad: string, body?: unknown) => {
  const res = await fetch(url + pfad, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, any>>;
};

/** Nonce suchen wie ein echter Miner -- wie in miningserver.test.ts. */
function sucheNonce(job: Record<string, any>, zielHex: string): bigint {
  const kopf = new Uint8Array(136);
  const dv = new DataView(kopf.buffer);
  dv.setUint32(0, job.version, true);
  dv.setUint32(4, job.height, true);
  kopf.set(fromHex(job.prevHash), 8);
  kopf.set(fromHex(job.merkleRoot), 40);
  kopf.set(fromHex(job.stateRoot), 72);
  dv.setBigUint64(104, BigInt(job.timestamp), true);
  dv.setUint32(112, job.difficulty, true);
  dv.setUint32(116, job.txCount, true);
  dv.setBigUint64(120, BigInt(job.extranonce), true);

  const ziel = fromHex(zielHex);
  for (let n = 0n; n < 5_000_000n; n++) {
    dv.setBigUint64(128, n, true);
    const h = sha256(sha256(kopf));
    let kleiner = true;
    for (let i = 0; i < 32; i++) {
      if (h[i] !== ziel[i]) { kleiner = h[i] < ziel[i]; break; }
    }
    if (kleiner) return n;
  }
  throw new Error(`kein Treffer bei Difficulty ${job.difficulty}`);
}

// ------------------------------------------------------------------ Tests

test('Ein angenommener Share landet im PPLNS-Fenster', async () => {
  /*
    DER TEST, DER GEFEHLT HAT. Ohne die Eintragung im MiningServer bleibt
    arbeitGesamt() bei 0 — und der Pool zahlt still wie Solo.
  */
  const k = await knoten(18801);
  try {
    assert.equal(k.pk!.arbeitGesamt(), 0n, 'am Anfang ist das Fenster leer');

    const s = await hole(k.url, '/session', { address: A, mode: 'pool' });
    assert.equal(s.mode, 'pool');

    const job = await hole(k.url, `/job?session=${s.sessionId}`);
    const n = sucheNonce(job, blockZiel(job));
    const r = await hole(k.url, '/share',
      { sessionId: s.sessionId, jobId: job.jobId, nonce: n.toString() });

    assert.equal(r.accepted, true, `Share abgelehnt: ${r.reason ?? ''}`);
    assert.ok(k.pk!.arbeitGesamt() > 0n,
      'die Arbeit ist NICHT im Pool angekommen');
  } finally { await k.zu(); }
});

test('Eine Solo-Sitzung trägt nichts in den Pool ein', async () => {
  const k = await knoten(18802);
  try {
    const s = await hole(k.url, '/session', { address: A, mode: 'solo' });
    assert.equal(s.mode, 'solo');
    assert.equal(s.pool, null, 'eine Solo-Sitzung bekommt keine Pool-Angaben');

    const job = await hole(k.url, `/job?session=${s.sessionId}`);
    const n = sucheNonce(job, blockZiel(job));
    const r = await hole(k.url, '/share',
      { sessionId: s.sessionId, jobId: job.jobId, nonce: n.toString() });

    assert.equal(r.accepted, true);
    assert.equal(k.pk!.arbeitGesamt(), 0n,
      'Solo-Arbeit darf nicht im Pool landen');
  } finally { await k.zu(); }
});

test('Ein Knoten ohne Pool lehnt eine Pool-Anmeldung ab', async () => {
  // Stillschweigend als Solo zu führen wäre schlimmer: Der Miner glaubte,
  // seine Arbeit werde geteilt, und bekäme nichts.
  const k = await knoten(18803, false);
  try {
    const s = await hole(k.url, '/session', { address: A, mode: 'pool' });
    assert.equal(s.error, 'pool_unavailable');
    assert.equal(s.sessionId, undefined, 'es darf keine Sitzung entstehen');
  } finally { await k.zu(); }
});

test('Zwei Miner im Pool teilen sich das Fenster', async () => {
  const k = await knoten(18804);
  try {
    for (const adr of [A, B]) {
      const s = await hole(k.url, '/session', { address: adr, mode: 'pool' });
      const job = await hole(k.url, `/job?session=${s.sessionId}`);
      const n = sucheNonce(job, blockZiel(job));
      const r = await hole(k.url, '/share',
        { sessionId: s.sessionId, jobId: job.jobId, nonce: n.toString() });
      assert.equal(r.accepted, true, `Share von ${adr} abgelehnt`);
    }

    // Beide Adressen müssen im Fenster stehen.
    const a = k.pk!.coinbase(2, 0n, 1n);
    assert.ok(a, 'die Aufteilung fehlt');
    assert.equal(a!.outputs.length, 2, 'beide Miner müssen Anteile bekommen');
  } finally { await k.zu(); }
});

test('Die Pool-Angaben der Sitzung sind gemessen, nicht behauptet', async () => {
  const k = await knoten(18805);
  try {
    const s1 = await hole(k.url, '/session', { address: A, mode: 'pool' });
    assert.equal(s1.pool.name, 'pool.test');
    assert.equal(s1.pool.feeBps, 0);
    assert.equal(s1.pool.miner, 1);

    const s2 = await hole(k.url, '/session', { address: B, mode: 'pool' });
    assert.equal(s2.pool.miner, 2, 'der zweite Miner muss mitgezählt werden');
  } finally { await k.zu(); }
});
