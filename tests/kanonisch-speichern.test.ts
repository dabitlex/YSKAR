/**
 * Issue #10: Der Knoten speichert jeden Block in seiner eigenen Kodierung.
 *
 * Angehaengte Bytes -- hinter der letzten Transaktion oder in einem zu
 * langen Transaktionsrahmen -- aendern weder den Blockhash noch die
 * Merkle-Wurzel. Bisher wurden sie mitgespeichert und weitergegeben. Hier
 * mit dem echten ChainManager auf einer Regtest-Kette.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { serializeBlock, deserializeBlock, headerHash } from '../src/lib/core/block.ts';
import { baueKette } from './helpers/regtest.ts';

/**
 * Unterhalb der Hoehe von Konsensfassung 5 sind falsch kodierte Kopien noch
 * gueltig -- der Knoten nimmt sie an und speichert sie sauber. Regtest prueft
 * die Fassung 5 sonst von Block 0 an; hier wird sie deshalb weit nach hinten
 * verlegt. Die Faelle AB der Fassung 5 stehen unten mit REGTEST selbst.
 */
const VOR_V5 = { ...REGTEST, v5Height: 1_000_000 };

function knoten(params = VOR_V5) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', params.network);
  store.setMeta('chain_id', toHex(params.chainId));
  return { store, chain: new ChainManager(store, params) };
}

/** Bytes in den Rahmen der Coinbase schieben: Laengenfeld groesser, Hash bleibt. */
function rahmenMuell(body: Uint8Array): Uint8Array {
  const b = Buffer.from(body);
  const len = b.readUInt32LE(140);
  const neu = Buffer.alloc(b.length + 3);
  b.copy(neu, 0, 0, 140);
  neu.writeUInt32LE(len + 3, 140);
  b.copy(neu, 144, 144, 144 + len);
  neu.write('abcdef', 144 + len, 'hex');
  b.copy(neu, 147 + len, 144 + len);
  return neu;
}

const kette = baueKette(4);
const gleich = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

test('Bytes hinter dem Block: angenommen, aber sauber gespeichert', () => {
  const { store, chain } = knoten();
  assert.equal(chain.accept(kette.bloecke[0].body).ok, true);
  const sauber = kette.bloecke[1].body;
  const aufgeblaeht = new Uint8Array(sauber.length + 1_000_000);
  aufgeblaeht.set(sauber);
  aufgeblaeht.fill(0xab, sauber.length);

  // Derselbe Block fuer den Konsens: gleicher Hash
  assert.equal(toHex(headerHash(deserializeBlock(aufgeblaeht).header)), toHex(kette.bloecke[1].hash));

  const r = chain.accept(aufgeblaeht);
  assert.equal(r.ok, true);
  const gespeichert = store.get(kette.bloecke[1].hash)!;
  assert.equal(gespeichert.body.length, sauber.length, 'kein Muell in der Ablage');
  assert.ok(gleich(gespeichert.body, sauber));

  // Die saubere Fassung danach ist "bekannt" -- und es liegt ohnehin die saubere vor.
  const r2 = chain.accept(sauber);
  assert.deepEqual(r2, { ok: true, stored: false, grund: 'bekannt' });
  store.close();
});

test('Bytes im Rahmen einer Transaktion: ebenso sauber gespeichert', () => {
  const { store, chain } = knoten();
  chain.accept(kette.bloecke[0].body);
  chain.accept(kette.bloecke[1].body);
  const sauber = kette.bloecke[2].body;
  const verbogen = rahmenMuell(sauber);
  assert.notEqual(verbogen.length, sauber.length);

  const r = chain.accept(verbogen);
  assert.equal(r.ok, true);
  assert.ok(gleich(store.get(kette.bloecke[2].hash)!.body, sauber));
  assert.ok(gleich(serializeBlock(deserializeBlock(store.get(kette.bloecke[2].hash)!.body)), sauber));
  store.close();
});

test('Ein sauberer Block wird Byte fuer Byte so gespeichert, wie er kam', () => {
  const { store, chain } = knoten();
  for (const b of kette.bloecke) {
    assert.equal(chain.accept(b.body).ok, true);
    assert.ok(gleich(store.get(b.hash)!.body, b.body));
  }
  assert.equal(chain.height(), 3);
  store.close();
});

test('Header mit Difficulty 0: abgelehnt als unlesbar, kein Absturz', () => {
  const { store, chain } = knoten();
  chain.accept(kette.bloecke[0].body);
  const b = Buffer.from(kette.bloecke[1].body);
  b.writeUInt32LE(0, 112); // Difficulty-Feld
  const r = chain.accept(b);
  assert.equal(r.ok, false);
  assert.equal((r as { grund: string }).grund, 'unlesbar');
  store.close();
});

// ------------------------------------------------- ab Konsensfassung 5

test('Ab Fassung 5: Bytes hinten oder im Rahmen -- diese Kopie wird abgelehnt, nichts gespeichert', () => {
  const { store, chain } = knoten(REGTEST);
  assert.equal(chain.accept(kette.bloecke[0].body).ok, true);
  const sauber = kette.bloecke[1].body;
  const hinten = new Uint8Array(sauber.length + 4);
  hinten.set(sauber);
  for (const kopie of [hinten, rahmenMuell(sauber)]) {
    const r = chain.accept(kopie);
    assert.equal(r.ok, false);
    assert.equal((r as { grund: string }).grund, 'kodierung');
    assert.equal(store.has(kette.bloecke[1].hash), false, 'nichts gespeichert');
  }
  // Die saubere Kopie desselben Blocks ist danach nicht gesperrt.
  const r = chain.accept(sauber);
  assert.equal(r.ok, true);
  assert.equal((r as { stored: boolean }).stored, true);
  assert.equal(chain.height(), 1);
  store.close();
});

test('Ab Fassung 5: Eine falsch kodierte Kopie eines BEKANNTEN Blocks stört nicht', () => {
  const { store, chain } = knoten(REGTEST);
  chain.accept(kette.bloecke[0].body);
  chain.accept(kette.bloecke[1].body);
  const kopie = new Uint8Array(kette.bloecke[1].body.length + 1);
  kopie.set(kette.bloecke[1].body);
  assert.deepEqual(chain.accept(kopie), { ok: true, stored: false, grund: 'bekannt' });
  assert.ok(gleich(store.get(kette.bloecke[1].hash)!.body, kette.bloecke[1].body));
  store.close();
});
