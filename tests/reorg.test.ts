/**
 * Gabelungen und Reorgs — durch die VOLLE Validierung.
 *
 * Bis hierher war das nicht testbar: Bei Mainnet-Difficulty kostet ein
 * Block rund 1,6 Milliarden Hashes. Im Testnetz (Difficulty 1) sind es
 * rund 65.536, also etwa eine halbe Sekunde.
 *
 * Wichtig: Es wird ECHT gemint. Derselbe Header, dieselbe Hashfunktion,
 * dieselbe Pruefung, derselbe ChainManager. Nur das Ziel ist niedriger.
 * Die Tests pruefen damit genau die Regel, die auch im echten Netz laeuft.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { stateRoot, totalSupply } from '../src/lib/core/state.ts';
import { UNIT } from '../src/lib/core/params.ts';
import { baueKette, zweig, MINER_A, MINER_B } from './helpers/regtest.ts';

function knoten() {
  const store = new ChainStore(':memory:');
  // Die Ablage merkt sich das Mainnet aus ihrer Vorgabe -- fuers Testnetz
  // wird sie hier umgeschrieben, bevor der Manager sie benutzt.
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  return { store, chain: new ChainManager(store, REGTEST) };
}

test('Testnetz: eine gerade Kette wird vollständig angenommen', () => {
  const k = baueKette(6);
  const { store, chain } = knoten();
  for (const b of k.bloecke) {
    const r = chain.accept(b.body);
    assert.ok(r.ok, `Block ${b.block.header.height}: ${JSON.stringify(r)}`);
  }
  assert.equal(chain.height(), 5);
  assert.equal(toHex(stateRoot(chain.state())), toHex(stateRoot(k.state)));
  assert.equal(totalSupply(chain.state()), 6n * 875n * UNIT);
  store.close();
});

test('Ein zweiter Block auf derselben Höhe wird gespeichert, nicht verworfen', () => {
  const k = baueKette(4);
  const { store, chain } = knoten();
  for (const b of k.bloecke) chain.accept(b.body);

  // Konkurrent zu Block 3, gleiche Höhe, andere Coinbase
  const anderer = zweig(k, 3, 1, { miner: MINER_B })[0];
  const r = chain.accept(anderer.body);

  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(store.atHeight(3).length, 2,
    'Beide Zweige müssen existieren, sonst ist keine Auflösung möglich');

  // Gleiche Arbeit: Der kleinere Hash gewinnt, deterministisch.
  const tip = chain.tip()!;
  const beide = store.atHeight(3);
  const kleinerer = beide.reduce((a, b) => toHex(a.hash) < toHex(b.hash) ? a : b);
  assert.equal(toHex(tip.hash), toHex(kleinerer.hash));
  store.close();
});

test('Der längere Zweig mit mehr Arbeit übernimmt — Reorg', () => {
  const k = baueKette(6);                      // Höhe 0..5
  const { store, chain } = knoten();
  for (const b of k.bloecke) chain.accept(b.body);
  assert.equal(chain.height(), 5);
  const vorher = toHex(chain.tip()!.hash);

  // Konkurrenzzweig ab Höhe 3, drei Blöcke länger
  const b = zweig(k, 3, 6, { miner: MINER_B });   // Höhe 3..8
  let reorgGesehen = false;
  for (const g of b) {
    const r = chain.accept(g.body);
    assert.ok(r.ok, `Zweigblock ${g.block.header.height}: ${JSON.stringify(r)}`);
    if ((r as { reorg?: boolean }).reorg) reorgGesehen = true;
  }

  assert.ok(reorgGesehen, 'Der Wechsel muss als Reorg gemeldet werden');
  assert.equal(chain.height(), 8);
  assert.notEqual(toHex(chain.tip()!.hash), vorher);
  assert.equal(toHex(chain.tip()!.hash), toHex(b[5].hash));

  // Der alte Zweig ist NICHT gelöscht, nur nicht mehr aktiv.
  assert.equal(store.atHeight(4).length, 2);
  assert.equal(store.atHeight(5).length, 2);
  assert.equal(store.mainAt(5)!.mainChain, true);
  assert.equal(toHex(store.mainAt(5)!.hash), toHex(b[2].hash));
  store.close();
});

test('Nach dem Reorg stimmt der Zustand zum neuen Zweig', () => {
  const k = baueKette(5);
  const { store, chain } = knoten();
  for (const b of k.bloecke) chain.accept(b.body);

  const b = zweig(k, 2, 5, { miner: MINER_B });   // Höhe 2..6
  for (const g of b) chain.accept(g.body);

  assert.equal(chain.height(), 6);
  // Die Zustandswurzel muss zu der im Block passen -- das prüft der
  // Manager selbst, hier wird es noch einmal von außen bestätigt.
  assert.equal(toHex(stateRoot(chain.state())), toHex(chain.tip()!.stateRoot));
  // 7 Blöcke à 875 YSR, aufgeteilt auf zwei Miner
  assert.equal(totalSupply(chain.state()), 7n * 875n * UNIT);

  const a = chain.state().get(toHex(MINER_A));
  const bb = chain.state().get(toHex(MINER_B));
  assert.equal(a!.balance, 2n * 875n * UNIT, 'Höhe 0 und 1 vom ersten Miner');
  assert.equal(bb!.balance, 5n * 875n * UNIT, 'Höhe 2 bis 6 vom zweiten');
  store.close();
});

test('Ein kürzerer Zweig mit weniger Arbeit übernimmt nicht', () => {
  const k = baueKette(6);
  const { store, chain } = knoten();
  for (const b of k.bloecke) chain.accept(b.body);
  const tipVorher = toHex(chain.tip()!.hash);

  const kurz = zweig(k, 4, 1, { miner: MINER_B });   // nur Höhe 4
  const r = chain.accept(kurz[0].body);

  assert.ok(r.ok, 'gültig ist er ja');
  assert.equal(chain.height(), 5, 'Höhe darf nicht sinken');
  assert.equal(toHex(chain.tip()!.hash), tipVorher, 'Kein Wechsel ohne mehr Arbeit');
  assert.equal(store.atHeight(4).length, 2, 'Trotzdem gespeichert');
  store.close();
});

test('Ein Reorg lässt sich rückgängig machen, wenn der alte Zweig wieder führt', () => {
  const k = baueKette(5);                     // Höhe 0..4
  const { store, chain } = knoten();
  for (const b of k.bloecke) chain.accept(b.body);

  // Zweig übernimmt
  const b = zweig(k, 3, 4, { miner: MINER_B });   // Höhe 3..6
  for (const g of b) chain.accept(g.body);
  assert.equal(chain.height(), 6);
  assert.equal(toHex(chain.tip()!.hash), toHex(b[3].hash));

  // Der ursprüngliche Zweig wird weitergebaut und überholt wieder
  const weiter = zweig(k, 3, 6, { miner: MINER_A, extra: 'zurueck' });  // Höhe 3..8
  for (const g of weiter) chain.accept(g.body);

  assert.equal(chain.height(), 8);
  assert.equal(toHex(chain.tip()!.hash), toHex(weiter[5].hash));
  // Alle drei Zweige liegen weiterhin vollständig vor. Auf Höhe 4 treffen
  // sie sich: die ursprüngliche Kette, der erste Konkurrent und der zweite.
  // (Auf Höhe 5 sind es nur zwei — die ursprüngliche Kette endet bei 4.)
  assert.equal(store.atHeight(4).length, 3);
  assert.equal(store.atHeight(5).length, 2);
  // Der zwischenzeitlich führende Zweig ist erhalten, nur nicht mehr aktiv.
  const verdraengt = store.get(b[3].hash);
  assert.ok(verdraengt);
  assert.equal(verdraengt.status, 'valid');
  assert.equal(verdraengt.mainChain, false);
  store.close();
});

test('Ein ungültiger Block auf einem Nebenzweig wird abgelehnt', () => {
  const k = baueKette(4);
  const { store, chain } = knoten();
  for (const b of k.bloecke) chain.accept(b.body);

  const gut = zweig(k, 2, 1, { miner: MINER_B })[0];
  const kaputt = new Uint8Array(gut.body);
  kaputt[160] ^= 0x01;                       // ein Byte in der Coinbase

  const r = chain.accept(kaputt);
  assert.equal(r.ok, false);
  assert.equal(store.atHeight(2).length, 1, 'Nichts Ungeprüftes speichern');
  store.close();
});

test('Nach einem Reorg lässt sich der Zustand aus den Blöcken neu berechnen', () => {
  const k = baueKette(5);
  const { store, chain } = knoten();
  for (const b of k.bloecke) chain.accept(b.body);
  for (const g of zweig(k, 2, 5, { miner: MINER_B })) chain.accept(g.body);

  const wurzel = toHex(stateRoot(chain.state()));
  const hoehe = chain.height();

  // Alle Marken weg, neuer Manager auf derselben Ablage: muss von Block 0
  // an neu rechnen -- über die Gabelung hinweg, nur entlang der aktiven
  // Kette.
  store.dropSnapshotsAbove(-1);
  const neu = new ChainManager(store, REGTEST);

  assert.equal(neu.height(), hoehe);
  assert.equal(toHex(stateRoot(neu.state())), wurzel);
  store.close();
});
