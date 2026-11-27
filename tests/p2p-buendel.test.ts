/**
 * Tx-Ankuendigungen werden je Peer gesammelt (Volllast-Konzept M2).
 *
 * Vorher ging je Ueberweisung eine eigene inv-Nachricht an jeden Peer. Hier
 * werden 1.280 Ueberweisungen an einen Peer angekuendigt: Es muessen wenige
 * inv-Nachrichten mit je hoechstens MAX_INV Eintraegen sein, und alle
 * Ueberweisungen muessen ankommen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { txid } from '../src/lib/core/tx.ts';
import { decodeInv, MAX_INV } from '../src/lib/node/p2p/messages.ts';
import { knoten, kette, warte, UEBERWEISUNGEN } from './helpers/mempoolNetz.ts';

async function zaehle(txBuendelMs: number | undefined) {
  const bloecke = kette();
  const a = knoten({ port: 19820 + (txBuendelMs ?? 9), txBuendelMs });
  await a.start();
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: 19820 + (txBuendelMs ?? 9) }] });
  await b.start();
  for (const k of [a, b]) for (const bl of bloecke) assert.ok(k.chain.accept(bl.body).ok);
  await warte(1200);

  let invs = 0, eintraege = 0, groesste = 0;
  const original = PeerConnection.prototype.send;
  PeerConnection.prototype.send = function (this: PeerConnection, command, payload) {
    if (command === 'inv' && a.peers.alle().includes(this)) {
      const n = decodeInv(payload).length; invs++; eintraege += n; groesste = Math.max(groesste, n);
    }
    return original.call(this, command, payload);
  };
  try {
    for (const tx of UEBERWEISUNGEN) {
      assert.ok(a.pool.add(tx, a.chain.state(), a.chain.height() + 1).ok);
      a.sync.kuendigeAnTx(txid(tx));
    }
    const t0 = Date.now();
    while (b.pool.size() < UEBERWEISUNGEN.length && Date.now() - t0 < 20000) await warte(50);
  } finally {
    PeerConnection.prototype.send = original;
  }
  const angekommen = b.pool.size();
  await a.stop(); await b.stop();
  return { invs, eintraege, groesste, angekommen };
}

test('1.280 Überweisungen: gebündelt wenige inv-Nachrichten, alle kommen an', async () => {
  const r = await zaehle(undefined);
  assert.equal(r.angekommen, UEBERWEISUNGEN.length);
  assert.equal(r.eintraege, UEBERWEISUNGEN.length);
  assert.ok(r.groesste <= MAX_INV, `höchstens ${MAX_INV} Einträge je inv, waren ${r.groesste}`);
  assert.ok(r.invs <= 10, `erwartet höchstens 10 inv-Nachrichten, waren ${r.invs}`);
});

test('txBuendelMs 0: einzeln wie früher (eine inv je Überweisung)', async () => {
  const r = await zaehle(0);
  assert.equal(r.angekommen, UEBERWEISUNGEN.length);
  assert.equal(r.invs, UEBERWEISUNGEN.length);
});
