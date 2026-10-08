/**
 * Issue #12: Transaktionsgebuehren in Pool-Bloecken werden mit der
 * Belohnung verteilt -- nach Arbeit, und die Pool-Gebuehr gilt fuer beides.
 *
 * Vorher rechnete der Pool ohne Gebuehren, und der Blockbau schlug die ganze
 * Differenz dem groessten Anteil zu -- unter Umstaenden dem Betreiber.
 *
 * Geprueft am echten Weg: Kette mit Guthaben, eine Ueberweisung mit hoher
 * Gebuehr im Mempool, Pool-Sitzung ueber HTTP, Job holen, die Coinbase des
 * gebauten Blocks nachrechnen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { abrechnen } from '../src/lib/pool/settlement.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { buildTransfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { UNIT, rewardAt } from '../src/lib/core/params.ts';
import { baueKette } from './helpers/regtest.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const SENDER = keypairFromMnemonic(WORTE, '', 0, 0);
const adr = (b: number) => { const a = new Uint8Array(20); a.fill(b); return a; };
const X = adr(0x31), Y = adr(0x32), BETREIBER = adr(0x77);

test('Pool-Block: Transaktionsgebuehren werden nach Arbeit verteilt, die Pool-Gebuehr gilt fuer sie mit', async () => {
  const kette = baueKette(4, { miner: SENDER.addressRaw });
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  for (const b of kette.bloecke) assert.ok(chain.accept(b.body).ok);

  const pool = new TxPool(REGTEST);
  const GEBUEHR = 40n * UNIT;      // gross genug, dass die alte Zuteilung auffiele
  const tx = buildTransfer({
    chainId: REGTEST.chainId, from: SENDER.addressRaw, to: adr(0x55), amount: 1n * UNIT, fee: GEBUEHR,
    nonce: 0n, publicKey: SENDER.publicKey, privateKey: SENDER.privateKey,
  });
  assert.ok(pool.add(tx, chain.state(), chain.height() + 1).ok);

  let uhr = kette.zeit;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => { const t = uhr; uhr += 60n; return t; });
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  // Testnetz: Difficulty 1. Der Faktor macht das Fenster gross genug fuer beide Shares.
  const pk = new PoolCoordinator({ name: 'TEST', feeBps: 100, payoutAddress: BETREIBER, pplnsFaktor: 100_000_000n });
  server.poolKoordinator = pk;
  // X mit dreimal so viel Arbeit wie Y.
  pk.share(X, 3_000_000n);
  pk.share(Y, 1_000_000n);

  const port = 18990 + Math.floor(Math.random() * 9);
  await server.listen('127.0.0.1', port);
  try {
    const url = `http://127.0.0.1:${port}/api/v2`;
    const post = async (pfad: string, body: unknown) => (await fetch(url + pfad, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })).json() as Promise<Record<string, any>>;
    const s = await post('/session', { address: encodeAddress(X), mode: 'pool' });
    assert.ok(s.sessionId, JSON.stringify(s));
    const job = await (await fetch(`${url}/job?session=${encodeURIComponent(s.sessionId)}`)).json() as Record<string, any>;
    assert.ok(job.jobId, JSON.stringify(job));
    assert.equal(job.txCount, 2, 'die Ueberweisung ist im Block');

    const offen = (mining as any).offen.get(job.jobId);
    const cb = offen.gebaut.block.txs[0];
    const outs = new Map<string, bigint>(cb.outputs.map((o: any) => [toHex(o.to), o.amount]));

    const hoehe = chain.height() + 1;
    const brutto = rewardAt(hoehe) + GEBUEHR;
    // Summe exakt brutto.
    let summe = 0n; for (const v of outs.values()) summe += v;
    assert.equal(summe, brutto);

    // Genau die Aufteilung, die abrechnen() fuer brutto liefert.
    const soll = abrechnen(brutto, [{ to: X, work: 3_000_000n }, { to: Y, work: 1_000_000n }], 100, BETREIBER);
    for (const o of soll.outputs) assert.equal(outs.get(toHex(o.to)), o.amount, `Betrag fuer ${toHex(o.to)}`);
    assert.equal(outs.size, soll.outputs.length);

    // Und konkret: Der Betreiber bekommt 1 % von brutto, nicht 1 % der Belohnung.
    assert.equal(outs.get(toHex(BETREIBER)), brutto / 100n);
    // Y bekommt ein Viertel der Gebuehren mit -- vorher gingen sie ganz an X.
    assert.ok(outs.get(toHex(Y))! > (rewardAt(hoehe) - rewardAt(hoehe) / 100n) / 4n, 'Y hat Anteil an den Gebuehren');
  } finally {
    await server.close(); store.close();
  }
});
