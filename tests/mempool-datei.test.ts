/**
 * Warteschlange ueber einen Neustart (mempoolDatei.ts, Volllast-Konzept M3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { leseMempool, schreibeMempool, schreibeMempoolSofort, nimmWiederAuf } from '../src/lib/node/fullnode/mempoolDatei.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MEMPOOL_MAX_ALTER } from '../src/lib/node/fullnode/mempoolPflege.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { txid } from '../src/lib/core/tx.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { kette, UEBERWEISUNGEN } from './helpers/mempoolNetz.ts';

const ordner = () => mkdtempSync(join(tmpdir(), 'mempool-datei-'));

function zustand() {
  const state = emptyState();
  for (const b of kette()) assert.ok(applyBlock(state, b.block, REGTEST).ok);
  return state;
}
const HOEHE = 4;

test('Rundweg: alles kommt zurück, mit Ankunftszeit und eigener Markierung', async () => {
  const d = ordner(); const pfad = join(d, 'mempool.dat');
  const state = zustand();
  let uhr = 1_000_000;
  const pool = new TxPool(REGTEST, undefined, { jetzt: () => uhr });
  UEBERWEISUNGEN.forEach((tx, i) => { uhr += 1000; assert.ok(pool.add(tx, state, HOEHE, { lokal: i < 32 }).ok); });
  await schreibeMempool(pfad, REGTEST.network, pool.sicherung());

  const gelesen = leseMempool(pfad, REGTEST.network);
  assert.equal(gelesen.hinweis, undefined);
  assert.equal(gelesen.eintraege.length, UEBERWEISUNGEN.length);

  const neu = new TxPool(REGTEST, undefined, { jetzt: () => uhr });
  const r = await nimmWiederAuf(gelesen.eintraege, e => neu.add(e.tx, state, HOEHE, { lokal: e.lokal, seit: e.seit }).ok);
  assert.deepEqual(r, { aufgenommen: UEBERWEISUNGEN.length, abgewiesen: 0 });
  assert.equal(neu.size(), pool.size());
  assert.equal(neu.lokale().length, 32);
  const vorher = new Map(pool.sicherung().map(e => [toHex(txid(e.tx)), e.seit]));
  for (const e of neu.sicherung()) assert.equal(e.seit, vorher.get(toHex(txid(e.tx))), 'Ankunftszeit bleibt');
  rmSync(d, { recursive: true, force: true });
});

test('Die 72-Stunden-Frist läuft über den Neustart weiter', async () => {
  const d = ordner(); const pfad = join(d, 'mempool.dat');
  const state = zustand();
  let uhr = 1_000_000;
  const pool = new TxPool(REGTEST, undefined, { jetzt: () => uhr });
  for (const tx of UEBERWEISUNGEN.slice(0, 32)) assert.ok(pool.add(tx, state, HOEHE).ok);
  schreibeMempoolSofort(pfad, REGTEST.network, pool.sicherung());

  // 71 Stunden später neu gestartet ...
  uhr += 71 * 3600 * 1000;
  const neu = new TxPool(REGTEST, undefined, { jetzt: () => uhr });
  await nimmWiederAuf(leseMempool(pfad, REGTEST.network).eintraege, e => neu.add(e.tx, state, HOEHE, { seit: e.seit }).ok);
  assert.equal(neu.size(), 32);
  // ... und nach zwei weiteren Stunden sind sie abgelaufen, nicht erst nach 74.
  uhr += 2 * 3600 * 1000;
  neu.aufraeumen(MEMPOOL_MAX_ALTER);
  assert.equal(neu.size(), 0);
  rmSync(d, { recursive: true, force: true });
});

test('Ankunftszeit aus der Zukunft wird auf jetzt begrenzt', () => {
  const state = zustand();
  const pool = new TxPool(REGTEST, undefined, { jetzt: () => 5_000 });
  assert.ok(pool.add(UEBERWEISUNGEN[0], state, HOEHE, { seit: 9_999_999 }).ok);
  assert.equal(pool.sicherung()[0].seit, 5_000);
});

test('Fehlende, fremde und kaputte Dateien verhindern den Start nicht', () => {
  const d = ordner(); const pfad = join(d, 'mempool.dat');
  assert.deepEqual(leseMempool(pfad, REGTEST.network), { eintraege: [] });

  schreibeMempoolSofort(pfad, 'yskar-main-1', []);
  assert.match(leseMempool(pfad, REGTEST.network).hinweis ?? '', /gehoert zu yskar-main-1/);

  writeFileSync(pfad, 'irgendwas');
  assert.equal(leseMempool(pfad, REGTEST.network).hinweis, 'unbekanntes Format');

  const state = zustand();
  const pool = new TxPool(REGTEST);
  for (const tx of UEBERWEISUNGEN.slice(0, 10)) assert.ok(pool.add(tx, state, HOEHE).ok);
  schreibeMempoolSofort(pfad, REGTEST.network, pool.sicherung());
  const voll = readFileSync(pfad);
  writeFileSync(pfad, voll.subarray(0, voll.length - 50));
  const r = leseMempool(pfad, REGTEST.network);
  assert.equal(r.eintraege.length, 9);
  assert.match(r.hinweis ?? '', /abgeschnitten nach 9 von 10/);
  rmSync(d, { recursive: true, force: true });
});
