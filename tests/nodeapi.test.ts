/**
 * Leseschnittstelle des Knotens.
 *
 * Geprüft wird vor allem eines: Die Antworten haben GENAU die Form der
 * Vercel-Routen. Die Mini App soll eine andere Adresse bekommen, keinen
 * anderen Code — weicht ein Feld ab, fällt es erst im Betrieb auf, und
 * dann bei jemandem, der nichts davon weiß.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { ReadApi } from '../src/lib/node/fullnode/ReadApi.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { UNIT } from '../src/lib/core/params.ts';
import { baueKette, MINER_A } from './helpers/regtest.ts';

function api(bloecke = 5) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();

  const kette = baueKette(bloecke);
  for (const b of kette.bloecke) {
    const r = chain.accept(b.body);
    assert.ok(r.ok, JSON.stringify(r));
  }
  return { store, chain, pool, lesen: new ReadApi({ chain, store, pool }), kette };
}

const such = (s = '') => new URLSearchParams(s);

// ------------------------------------------------------------ Kennzahlen

test('summary hat alle Felder, die die App liest', () => {
  const { lesen, store } = api();
  const s = lesen.summary();

  // Genau die Felder, die NetzTab, InfoTab und der Explorer verwenden.
  for (const feld of ['token', 'height', 'nextHeight', 'difficulty', 'hashrate',
                      'targetBlockTime', 'tipHash', 'stateHeight', 'stateRoot',
                      'totalSupply', 'maxSupply', 'nextReward', 'mempool',
                      'activeMiners']) {
    assert.ok(feld in s, `Feld ${feld} fehlt`);
  }
  assert.equal(s.height, 4);
  assert.equal(s.totalSupply, (5n * 875n * UNIT).toString());
  assert.equal((s.token as { decimals: number }).decimals, 8);
  store.close();
});

test('Die Zustandswurzel stimmt mit dem Block überein', () => {
  const { lesen, store, chain } = api();
  assert.equal(lesen.summary().stateRoot, toHex(chain.tip()!.stateRoot));
  store.close();
});

// ---------------------------------------------------------------- Blöcke

test('blocks liefert die neuesten zuerst', () => {
  const { lesen, store } = api(6);
  const r = lesen.blocks(such('limit=3')) as { blocks: { height: number }[] };
  assert.equal(r.blocks.length, 3);
  assert.deepEqual(r.blocks.map(b => b.height), [5, 4, 3]);
  store.close();
});

test('before blättert nach hinten', () => {
  const { lesen, store } = api(6);
  const r = lesen.blocks(such('limit=2&before=3')) as { blocks: { height: number }[] };
  assert.deepEqual(r.blocks.map(b => b.height), [2, 1]);
  store.close();
});

test('Ein Block bringt seine Transaktionen mit', () => {
  const { lesen, store } = api();
  const r = lesen.block(2) as { status: number; body: Record<string, unknown> };
  assert.equal(r.status, 200);
  assert.equal(r.body.height, 2);

  const txs = r.body.txs as Record<string, unknown>[];
  assert.equal(txs.length, 1);
  assert.equal(txs[0].type, 'coinbase');
  assert.equal(txs[0].to, encodeAddress(MINER_A));
  assert.equal(txs[0].recipients, null, 'Fassung 1 hat keine Empfängerliste');
  store.close();
});

test('Ein Block, den es nicht gibt, ergibt 404', () => {
  const { lesen, store } = api();
  assert.equal((lesen.block(999) as { status: number }).status, 404);
  store.close();
});

// ---------------------------------------------------------------- Konten

test('account liefert Guthaben und Verlauf', () => {
  const { lesen, store } = api();
  const adr = encodeAddress(MINER_A);
  const r = lesen.account(adr) as { status: number; body: Record<string, unknown> };

  assert.equal(r.status, 200);
  assert.equal(r.body.address, adr);
  assert.equal(r.body.balance, (5n * 875n * UNIT).toString());
  assert.equal(r.body.blocksFound, 5);
  assert.equal((r.body.history as unknown[]).length, 5);
  assert.equal((r.body.history as { kind: string }[])[0].kind, 'reward');
  store.close();
});

test('Die Suchtiefe wird ehrlich mitgeliefert', () => {
  // Sonst hält jemand einen abgeschnittenen Verlauf für vollständig.
  const { lesen, store } = api();
  const r = lesen.account(encodeAddress(MINER_A)) as { body: Record<string, unknown> };
  assert.ok(typeof r.body.historyDepth === 'number');
  store.close();
});

test('Eine unbekannte Adresse ist kein Fehler', () => {
  const { lesen, store } = api();
  const fremd = encodeAddress(new Uint8Array(20).fill(0x77));
  const r = lesen.account(fremd) as { status: number; body: Record<string, unknown> };
  assert.equal(r.status, 200);
  assert.equal(r.body.balance, '0');
  store.close();
});

test('Eine kaputte Adresse ergibt 400', () => {
  const { lesen, store } = api();
  assert.equal((lesen.account('ysr1kaputt') as { status: number }).status, 400);
  store.close();
});

// ----------------------------------------------------------------- Suche

test('Die Suche erkennt Höhe, Hash und Adresse', () => {
  const { lesen, store, chain } = api();

  assert.equal((lesen.search(such('q=3')) as { kind: string }).kind, 'block');
  assert.equal((lesen.search(such(`q=${toHex(chain.tip()!.hash)}`)) as
    { kind: string }).kind, 'block');
  assert.equal((lesen.search(such(`q=${encodeAddress(MINER_A)}`)) as
    { kind: string }).kind, 'address');
  assert.equal((lesen.search(such('q=unfug')) as { kind: string }).kind, 'nichts');
  assert.equal((lesen.search(such('q=99999')) as { kind: string }).kind, 'nichts');
  store.close();
});

test('Eine Transaktion lässt sich über ihre Kennung finden', () => {
  const { lesen, store } = api();
  const b = lesen.block(1) as { body: { txs: { txid: string }[] } };
  const id = b.body.txs[0].txid;

  const s = lesen.search(such(`q=${id}`)) as { kind: string; height: number };
  assert.equal(s.kind, 'tx');
  assert.equal(s.height, 1);

  const t = lesen.tx(id) as { status: number; body: Record<string, unknown> };
  assert.equal(t.status, 200);
  assert.equal(t.body.status, 'confirmed');
  assert.equal(t.body.height, 1);
  store.close();
});

// ------------------------------------------------------------------ Sync

test('sync liefert rohe Blockkörper', () => {
  const { lesen, store, kette } = api();
  const r = lesen.sync(such('from=0&count=3')) as
    { blocks: { height: number; body: string }[]; tip: number };
  assert.equal(r.blocks.length, 3);
  assert.equal(r.tip, 4);
  // Byteweise identisch -- daraus baut ein anderer Knoten die Kette auf.
  assert.equal(r.blocks[0].body, toHex(kette.bloecke[0].body));
  store.close();
});

// -------------------------------------------------------------- Weiterleitung

test('Die Weiterleitung greift nur bei bekannten Pfaden', () => {
  const { lesen, store } = api();
  assert.equal(lesen.behandle('GET', '/gibtsnicht', such()), null);
  assert.equal(lesen.behandle('POST', '/summary', such()), null,
    'POST gehört nicht in die Leseschnittstelle');
  assert.ok(lesen.behandle('GET', '/summary', such()) !== null);
  assert.ok(lesen.behandle('GET', '/blocks/1', such()) !== null);
  store.close();
});
