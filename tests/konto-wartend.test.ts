/**
 * Kontoauskunft des Knotens: wartende Zahlungen in BEIDE Richtungen und
 * die Nonce fuer die naechste Zahlung.
 *
 * Vorher sah der Absender seine Ueberweisung im Verlauf erst mit dem Block,
 * der Empfaenger ebenso -- und eine zweite Zahlung vor der Bestaetigung
 * trug dieselbe Nonce wie die erste, weil die App nur die Zustands-Nonce
 * kannte. Der Knoten lehnte sie als "fee_not_higher" ab.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { ReadApi } from '../src/lib/node/fullnode/ReadApi.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { buildTransfer, type Transfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { UNIT, MIN_FEE } from '../src/lib/core/params.ts';
import { emptyState, applyBlock, type State } from '../src/lib/core/state.ts';
import { mineBlock, zeig } from './helpers/regtest.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const MINER = keypairFromMnemonic(WORTE, '', 0, 0);
const EMPFAENGER = new Uint8Array(20).fill(0xee);

function ueberweisung(nonce: bigint, betrag = UNIT): Transfer {
  return buildTransfer({ chainId: REGTEST.chainId,
    from: MINER.addressRaw, to: EMPFAENGER, amount: betrag,
    fee: MIN_FEE, nonce,
    publicKey: MINER.publicKey, privateKey: MINER.privateKey,
  });
}

function knotenMitGuthaben(n: number) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const state: State = emptyState();
  let prev = new Uint8Array(32);
  const start = 1_788_912_000n;
  for (let h = 0; h < n; h++) {
    const g = mineBlock({
      height: h, prevHash: prev, state,
      timestamp: start + BigInt(h) * REGTEST.targetBlockTime,
      miner: MINER.addressRaw,
    });
    assert.ok(applyBlock(state, g.block, REGTEST).ok);
    assert.ok(chain.accept(g.body).ok);
    prev = g.hash;
  }
  const pool = new TxPool(REGTEST);
  const api = new ReadApi({ chain, store, pool });
  return { store, chain, pool, api };
}

interface Auskunft {
  nonce: string; nextNonce: string;
  pending: { kind: 'in' | 'out'; from: string; to: string; amount: string; nonce: string }[];
}

const konto = (api: ReadApi, adr: string): Auskunft => {
  const r = api.behandle('GET', `/account/${adr}`, new URLSearchParams());
  assert.ok(r && r.status === 200, `Kontoauskunft fehlgeschlagen: ${zeig(r)}`);
  return r.body as Auskunft;
};

test('Wartende Zahlung: Absender sieht "out", Empfänger sieht "in"', () => {
  const { store, chain, pool, api } = knotenMitGuthaben(3);
  const tx = ueberweisung(0n);
  const add = pool.add(tx, chain.state(), chain.height() + 1);
  assert.ok(add.ok, `Aufnahme fehlgeschlagen: ${zeig(add)}`);

  const absender = encodeAddress(MINER.addressRaw);
  const empfaenger = encodeAddress(EMPFAENGER);

  const a = konto(api, absender);
  assert.equal(a.pending.length, 1);
  assert.equal(a.pending[0].kind, 'out');
  assert.equal(a.pending[0].to, empfaenger);
  assert.equal(a.pending[0].from, absender);
  assert.equal(a.pending[0].amount, UNIT.toString());

  const e = konto(api, empfaenger);
  assert.equal(e.pending.length, 1, 'der Empfänger muss die Zahlung schon vor dem Block sehen');
  assert.equal(e.pending[0].kind, 'in');
  assert.equal(e.pending[0].from, absender);
  store.close();
});

test('nextNonce zählt eigene wartende Zahlungen mit, fremde nicht', () => {
  const { store, chain, pool, api } = knotenMitGuthaben(3);
  const absender = encodeAddress(MINER.addressRaw);
  const empfaenger = encodeAddress(EMPFAENGER);

  assert.equal(konto(api, absender).nextNonce, '0');

  assert.ok(pool.add(ueberweisung(0n), chain.state(), chain.height() + 1).ok);
  assert.equal(konto(api, absender).nonce, '0', 'die Zustands-Nonce bleibt bis zum Block');
  assert.equal(konto(api, absender).nextNonce, '1');

  // Genau diese Nonce nimmt der Pool auch an -- die zweite Zahlung ist kein
  // Ersatz der ersten.
  const zweite = pool.add(ueberweisung(1n), chain.state(), chain.height() + 1);
  assert.ok(zweite.ok, `zweite Zahlung abgelehnt: ${zeig(zweite)}`);
  assert.equal(konto(api, absender).nextNonce, '2');

  // Der Empfaenger hat zwei eingehende, aber keine eigene -- seine Nonce
  // bewegt sich nicht.
  const e = konto(api, empfaenger);
  assert.equal(e.pending.length, 2);
  assert.equal(e.nextNonce, '0');
  store.close();
});
