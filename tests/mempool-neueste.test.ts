/**
 * Anzeige der Warteschlange ohne Volldurchlauf (Volllast-Konzept M5):
 * TxPool.neueste() und TxPool.seit().
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { txid } from '../src/lib/core/tx.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { kette, UEBERWEISUNGEN } from './helpers/mempoolNetz.ts';

function zustand() {
  const state = emptyState();
  for (const b of kette()) assert.ok(applyBlock(state, b.block, REGTEST).ok);
  return state;
}

test('neueste(n) liefert die zuletzt aufgenommenen in Aufnahmereihenfolge -- wie alle().slice(-n)', () => {
  const state = zustand();
  let uhr = 1000;
  const pool = new TxPool(REGTEST, undefined, { jetzt: () => uhr });
  for (const tx of UEBERWEISUNGEN.slice(0, 500)) { uhr += 10; assert.ok(pool.add(tx, state, 4).ok); }
  for (const n of [0, 1, 7, 200, 500, 800]) {
    const erwartet = pool.alle().slice(-n).map(t => toHex(txid(t)));
    assert.deepEqual(pool.neueste(n).map(e => e.id), n === 0 ? [] : erwartet, `n=${n}`);
  }
  // Auch nach dem Entfernen aus der Mitte
  for (const tx of UEBERWEISUNGEN.slice(480, 500)) pool.remove(toHex(txid(tx)));
  assert.deepEqual(pool.neueste(30).map(e => e.id), pool.alle().slice(-30).map(t => toHex(txid(t))));
});

test('seit() ist die Ankunftszeit im Mempool', () => {
  const state = zustand();
  let uhr = 5000;
  const pool = new TxPool(REGTEST, undefined, { jetzt: () => uhr });
  assert.ok(pool.add(UEBERWEISUNGEN[0], state, 4).ok);
  uhr = 9000;
  assert.ok(pool.add(UEBERWEISUNGEN[1], state, 4).ok);
  assert.equal(pool.seit(toHex(txid(UEBERWEISUNGEN[0]))), 5000);
  assert.equal(pool.seit(toHex(txid(UEBERWEISUNGEN[1]))), 9000);
  assert.equal(pool.seit('00'.repeat(32)), undefined);
  assert.deepEqual(pool.neueste(5).map(e => e.seit), [5000, 9000]);
});
