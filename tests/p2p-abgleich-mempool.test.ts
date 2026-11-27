/**
 * Ein frisch verbundener Peer bekommt die Warteschlange angekuendigt
 * (Volllast-Konzept M3).
 *
 * Vorher kannte ein Knoten nach einem Neustart nur Ueberweisungen, die
 * danach neu angekuendigt wurden. Jetzt kuendigt ihm jeder Peer beim
 * Verbinden seine Warteschlange an -- ueber die vorhandene inv-Nachricht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MEMPOOL_ABGLEICH_MAX } from '../src/lib/node/p2p/SyncManager.ts';
import { knoten, kette, warte, UEBERWEISUNGEN } from './helpers/mempoolNetz.ts';

test('Frisch verbundener Peer übernimmt die ganze Warteschlange', async () => {
  const bloecke = kette();
  const a = knoten({ port: 19840 });
  await a.start();
  for (const bl of bloecke) assert.ok(a.chain.accept(bl.body).ok);
  // Lag schon vorher da -- ohne Ankündigung.
  for (const tx of UEBERWEISUNGEN) assert.ok(a.pool.add(tx, a.chain.state(), a.chain.height() + 1).ok);

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: 19840 }] });
  for (const bl of bloecke) assert.ok(b.chain.accept(bl.body).ok);
  await b.start();
  const t0 = Date.now();
  while (b.pool.size() < UEBERWEISUNGEN.length && Date.now() - t0 < 15000) await warte(50);

  assert.equal(b.pool.size(), UEBERWEISUNGEN.length);
  await a.stop(); await b.stop();
});

test('Ein Peer, der noch aufholt, bekommt nichts angekündigt', async () => {
  const bloecke = kette();
  const a = knoten({ port: 19841 });
  await a.start();
  for (const bl of bloecke) assert.ok(a.chain.accept(bl.body).ok);
  for (const tx of UEBERWEISUNGEN.slice(0, 64)) assert.ok(a.pool.add(tx, a.chain.state(), a.chain.height() + 1).ok);

  // B kennt nur den Genesis: Er läge hinter A und könnte nichts prüfen.
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: 19841 }] });
  assert.ok(b.chain.accept(bloecke[0].body).ok);
  let gefragt = 0;
  const original = b.sync.aufNachricht.bind(b.sync);
  b.sync.aufNachricht = (p, f) => { if (f.command === 'tx') gefragt++; return original(p, f); };
  await b.start();
  await warte(2500);

  assert.equal(gefragt, 0, 'kein tx vor dem Aufholen');
  await a.stop(); await b.stop();
});

test('Obergrenze ist ein voller Block', () => {
  assert.equal(MEMPOOL_ABGLEICH_MAX, 5_000);
});
