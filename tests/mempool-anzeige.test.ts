/**
 * Was Wallets und Explorer ueber die Warteschlange erfahren
 * (docs/CONSENSUS_V6.md, Abschnitt 13b): /fees mit Untergrenze, Stufen je
 * Byte und den naechsten Bloecken; /tx und /account mit dem voraussichtlichen
 * Block einer wartenden Transaktion; /tx (POST) mit `required` bei einer
 * Ablehnung wegen Andrang.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { ReadApi } from '../src/lib/node/fullnode/ReadApi.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { serializeTx } from '../src/lib/core/tx.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { UNIT } from '../src/lib/core/params.ts';
import { buildTransfer, txidHex } from '../src/lib/core/tx.ts';
import { keypairFromSeed } from '../src/lib/core/wallet.ts';
import { lage, type EigeneZahlung } from '../src/lib/wallet/wartendeZahlungen.ts';
import { baueKette, zeig } from './helpers/regtest.ts';

const K = keypairFromSeed(new Uint8Array(64).fill(9), 0, 0);
const ZIEL = new Uint8Array(20).fill(0xee);

function knoten(maxBytes?: number) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool(REGTEST, undefined, maxBytes ? { maxBytes } : {});
  for (const b of baueKette(3, { miner: K.addressRaw }).bloecke) {
    const r = chain.accept(b.body);
    assert.ok(r.ok, zeig(r));
  }
  return { store, chain, pool, lesen: new ReadApi({ chain, store, pool, params: REGTEST }) };
}

function tx(nonce: bigint, fee: bigint) {
  return buildTransfer({ from: K.addressRaw, to: ZIEL, amount: UNIT, fee, nonce, chainId: REGTEST.chainId,
    publicKey: K.publicKey, privateKey: K.privateKey });
}

test('/fees: Untergrenze, Stufen je Byte, naechste Bloecke mit Hoehe', () => {
  const { chain, pool, lesen, store } = knoten();
  for (let n = 0n; n < 3n; n++) assert.ok(pool.add(tx(n, 1680n + n * 168n), chain.state(), chain.height() + 1).ok);
  const f = lesen.fees(new URLSearchParams()) as Record<string, any>;
  assert.equal(f.mindestJeByte, '10');
  assert.equal(f.wartend, 3);
  assert.equal(f.bloecke.length, 1);
  assert.equal(f.bloecke[0].hoehe, chain.height() + 1);
  assert.equal(f.bloecke[0].anzahl, 3);
  assert.ok(typeof f.stufen.normal.jeByte === 'string');
  assert.equal(f.mempoolBytes, pool.belegt());
  assert.equal(f.blockzeit, 600);
  const mit = lesen.fees(new URLSearchParams('fee=5000')) as Record<string, any>;
  assert.equal(mit.eigene.block, 1);
  assert.equal(mit.eigene.reicht, true);
  store.close();
});

test('/tx und /account: wartende Transaktion mit voraussichtlichem Block', () => {
  const { chain, pool, lesen, store } = knoten();
  const t = tx(0n, 1680n);
  assert.ok(pool.add(t, chain.state(), chain.height() + 1).ok);
  const r = lesen.tx(txidHex(t));
  assert.equal(r.status, 200);
  const body = r.body as Record<string, any>;
  assert.equal(body.status, 'pending');
  assert.deepEqual(body.warteplatz, { block: 1, hoehe: chain.height() + 1, minuten: 10 });
  const konto = lesen.account(encodeAddress(K.addressRaw)).body as Record<string, any>;
  assert.equal(konto.pending.length, 1);
  assert.equal(konto.pending[0].block, 1);
  assert.equal(konto.nextNonce, '1');
  store.close();
});

test('Neuer Mempool-Stand: /fees rechnet neu (kleiner Mempool, sofort)', () => {
  const { chain, pool, lesen, store } = knoten();
  assert.equal((lesen.fees(new URLSearchParams()) as any).wartend, 0);
  assert.ok(pool.add(tx(0n, 1680n), chain.state(), chain.height() + 1).ok);
  assert.equal((lesen.fees(new URLSearchParams()) as any).wartend, 1);
  store.close();
});

test('POST /tx: Ablehnung wegen Andrang nennt `required`, nie "Warteschlange voll"', async () => {
  const { chain, pool, store } = knoten(170);   // genau eine Ueberweisung passt
  const mining = new MiningCoordinator(chain, store, pool, REGTEST);
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  await server.listen('127.0.0.1', 18791);
  try {
    const sende = async (x: ReturnType<typeof tx>) => (await fetch('http://127.0.0.1:18791/api/v2/tx', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: toHex(serializeTx(x)) }),
    })).json() as Promise<Record<string, any>>;
    const a = await sende(tx(0n, 1680n));
    assert.equal(a.accepted, true, JSON.stringify(a));
    // Zweite vom selben Absender: Der eigene Vorgaenger darf nicht weichen,
    // und sonst ist nichts da -- pool_min_fee ohne Betrag (keiner reichte).
    const b = await sende(tx(1n, 1680n));
    assert.equal(b.accepted, false);
    assert.equal(b.reason, 'pool_min_fee');
    assert.equal(b.required, null);
    // Ersetzung mit zu wenig Aufschlag: `required` nennt den Betrag, der reicht.
    const c = await sende(tx(0n, 1700n));
    assert.equal(c.reason, 'fee_not_higher');
    assert.equal(c.required, String(1680n + 1680n));
    const d = await sende(tx(0n, 3360n));
    assert.equal(d.accepted, true, JSON.stringify(d));
  } finally {
    await server.close();
    store.close();
  }
});

// ------------------------------------------------------------ Wallet

test('Wallet: Lage einer gemerkten Zahlung', () => {
  const z: EigeneZahlung = { txid: 'aa'.repeat(32), raw: '00', nonce: '4', an: 'x', betrag: '1', gebuehr: '1', notiz: '', um: 1_000 };
  assert.equal(lage(z, { nonce: '4', history: [{ txid: z.txid }] }, 2_000), 'bestaetigt');
  assert.equal(lage(z, { nonce: '4', pending: [{ txid: z.txid }] }, 2_000), 'wartet');
  assert.equal(lage(z, { nonce: '5' }, 2_000), 'ueberholt', 'eine Ersetzung mit dieser Nonce ist bestaetigt');
  assert.equal(lage(z, { nonce: '4' }, 2_000), 'erneut');
  assert.equal(lage({ ...z, zuletzt: 1_500 }, { nonce: '4' }, 2_000), 'abwarten');
  assert.equal(lage(z, { nonce: '4' }, 1_000 + 15 * 24 * 3600_000), 'aufgegeben');
});

test('Gebuehrenboden: Empfaenger der Version 1 macht die Ueberweisung ab Fassung 6 um 12 Byte groesser', async () => {
  const { transferBytesAt, buildTransfer: bau, serializeTx: ser } = await import('../src/lib/core/tx.ts');
  assert.equal(transferBytesAt(10, 0, 5), 174);
  assert.equal(transferBytesAt(10, 0, 5, 33), 186);
  assert.equal(transferBytesAt(10, 7, 5, 33), 193);
  assert.equal(transferBytesAt(4, 0, 5, 33), 168, 'vor der Hoehe gibt es nur Fassung 1');
  // Gegen die echte Serialisierung.
  const an = Uint8Array.from([1, ...new Array(32).fill(7)]);
  const t = bau({ from: K.addressRaw, to: an, amount: UNIT, fee: 2000n, nonce: 0n, version: 2,
    publicKey: K.publicKey, privateKey: K.privateKey });
  assert.equal(ser(t).length, transferBytesAt(10, 0, 5, 33));
  const pool = new TxPool({ ...REGTEST, v6Height: 5 });
  assert.equal(pool.mindestGebuehr(10, 0, 33), 1860n);
  assert.equal(pool.mindestGebuehr(10, 0), 1740n);
});

test('Ohne Aktivierungshoehe meldet der Knoten Fassung 5 -- mit Hoehe 6', async () => {
  const { gemeldeteFassung } = await import('../src/lib/node/fassung.ts');
  assert.equal(gemeldeteFassung(REGTEST), 5);
  assert.equal(gemeldeteFassung({ ...REGTEST, v6Height: 100 }), 6);
});

test('Wallet: Nonce einer neuen Zahlung zaehlt gemerkte eigene mit -- nie still ersetzen', async () => {
  const { naechsteEigeneNonce } = await import('../src/lib/wallet/wartendeZahlungen.ts');
  const z = (nonce: string, extra: Partial<EigeneZahlung> = {}): EigeneZahlung =>
    ({ txid: nonce.padStart(64, '0'), raw: '00', nonce, an: 'x', betrag: '1', gebuehr: '1', notiz: '', um: 1, ...extra });
  // Der Knoten hat Nonce 4 verdraengt: nextNonce 4, gemerkt ist 4 -> neue bekommt 5.
  assert.equal(naechsteEigeneNonce([z('4')], { nonce: '4', nextNonce: '4' }), 5n);
  // Kennt der Knoten sie, bleibt es bei nextNonce.
  assert.equal(naechsteEigeneNonce([z('4')], { nonce: '4', nextNonce: '5' }), 5n);
  // Schon verbrauchte Nonces zaehlen nicht.
  assert.equal(naechsteEigeneNonce([z('2')], { nonce: '4', nextNonce: '4' }), 4n);
  // Endgueltig abgelehnte zaehlen nicht -- ihre Nonce darf die neue belegen.
  assert.equal(naechsteEigeneNonce([z('4', { abgelehnt: 'bad_version' })], { nonce: '4', nextNonce: '4' }), 4n);
  // Ohne nextNonce: Zustand plus eigene wartende.
  assert.equal(naechsteEigeneNonce([], { nonce: '3', pending: [{ kind: 'out' }, { kind: 'in' }] }), 4n);
  assert.equal(naechsteEigeneNonce([], null), 0n);
});

test('Wallet: Antworten auf erneutes Einreichen werden eingeordnet', async () => {
  const { einordnen } = await import('../src/lib/wallet/wartendeZahlungen.ts');
  assert.deepEqual(einordnen({ accepted: true }), { art: 'angenommen' });
  assert.deepEqual(einordnen({ accepted: false, reason: 'duplicate' }), { art: 'angenommen' });
  assert.deepEqual(einordnen({ accepted: false, reason: 'pool_min_fee', required: '4200' }), { art: 'noetig', noetig: '4200' });
  assert.deepEqual(einordnen({ accepted: false, reason: 'pool_min_fee', required: null }), { art: 'noetig', noetig: null });
  assert.deepEqual(einordnen({ accepted: false, reason: 'nonce_too_low' }), { art: 'erledigt' });
  assert.deepEqual(einordnen({ accepted: false, reason: 'nonce_gap' }), { art: 'spaeter' });
  assert.deepEqual(einordnen({ accepted: false, reason: 'fee_not_higher', required: '9' }), { art: 'spaeter' });
  // Alte Fassung nach der Aktivierung: endgueltig, nicht still wiederholen.
  assert.deepEqual(einordnen({ accepted: false, reason: 'bad_version' }), { art: 'abgelehnt', grund: 'bad_version' });
  assert.deepEqual(einordnen({ accepted: false, reason: 'malformed' }), { art: 'abgelehnt', grund: 'malformed' });
});

test('Wallet: fehlende Deckung wird sichtbar (abgelehnt), nicht still wiederholt', async () => {
  const { einordnen } = await import('../src/lib/wallet/wartendeZahlungen.ts');
  assert.deepEqual(einordnen({ accepted: false, reason: 'insufficient_funds' }), { art: 'abgelehnt', grund: 'insufficient_funds' });
  assert.deepEqual(einordnen({ accepted: false, reason: 'unknown_account' }), { art: 'abgelehnt', grund: 'unknown_account' });
});

test('Wallet: hinter einer abgelehnten Zahlung belegt die neue deren Nonce', async () => {
  const { naechsteEigeneNonce } = await import('../src/lib/wallet/wartendeZahlungen.ts');
  const z = (nonce: string, extra: Partial<EigeneZahlung> = {}): EigeneZahlung =>
    ({ txid: nonce.padStart(64, '0'), raw: '00', nonce, an: 'x', betrag: '1', gebuehr: '1', notiz: '', um: 1, ...extra });
  // 5 abgelehnt, 6 gemerkt (haengt an der Luecke): die neue nimmt 5.
  assert.equal(naechsteEigeneNonce([z('5', { abgelehnt: 'malformed' }), z('6')], { nonce: '5', nextNonce: '5' }), 5n);
  // Abgelehnte unter dem Kontostand spielen keine Rolle.
  assert.equal(naechsteEigeneNonce([z('3', { abgelehnt: 'bad_version' }), z('6')], { nonce: '5', nextNonce: '6' }), 7n);
});
