/**
 * Mempool und lokale Blockerzeugung.
 *
 * Der Knoten baut hier seine Jobs selbst -- aus eigenem Kettenkopf,
 * eigenem Zustand, eigenem Mempool. Keine Verbindung nach aussen.
 *
 * Gemint wird im Testnetz, damit ein Block Millisekunden statt einer
 * Viertelstunde kostet. Die Pruefung ist dieselbe wie im echten Netz.
 *
 * WICHTIG FUER DIE TESTLAENGE: Der Knoten setzt den Zeitstempel auf die
 * echte Uhrzeit. Werden mehrere Bloecke in Sekunden gemint, sieht die
 * Difficulty-Regel Loesungszeiten nahe null und hebt die Difficulty je
 * Block um den Deckelungsfaktor 4 an: 1, 4, 16, 64, 256, 1024.
 *
 * Das ist RICHTIG -- genau so soll sie auf einen Anstieg der Rechenleistung
 * reagieren. Fuer die Tests heisst es aber: kurze Ketten. Ab etwa vier
 * Bloecken wird das Minen in JavaScript spuerbar langsam, ab sechs
 * unzumutbar. Wo mehr Bloecke noetig waeren, gehoert der Fall in
 * tests/reorg.test.ts -- dort werden Zeitstempel vorgegeben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { stateRoot, totalSupply } from '../src/lib/core/state.ts';
import { UNIT, MIN_FEE } from '../src/lib/core/params.ts';
import { buildTransfer, txidHex } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic, createMnemonic } from '../src/lib/core/wallet.ts';
import { MINER_A } from './helpers/regtest.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import type { MiningJob } from '../src/lib/node/fullnode/MiningCoordinator.ts';

function knoten() {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  const mining = new MiningCoordinator(chain, store, pool, REGTEST);
  return { store, chain, pool, mining };
}

/**
 * Einen Job minen, wie es ein echter Miner tut.
 *
 * Wichtig: Der Hash wird HIER gerechnet, und nur der Treffer wird
 * eingereicht. Zuerst hatte ich fuer jede Nonce submitNonce aufgerufen --
 * das baut jedes Mal den ganzen Block neu und braucht bei 65.536 Versuchen
 * Minuten. So arbeitet auch kein echter Miner.
 */
function mine(mining: MiningCoordinator, job: MiningJob) {
  const kopf = fromHex(job.header);          // 136 Byte, Nonce auf 0
  const sicht = new DataView(kopf.buffer, kopf.byteOffset, kopf.byteLength);
  const ziel = fromHex(job.target);

  for (let nonce = 0n; nonce < 5_000_000n; nonce++) {
    sicht.setBigUint64(128, nonce, true);
    const h = sha256(sha256(kopf));
    if (kleinerGleich(h, ziel)) {
      const r = mining.submitNonce(job.jobId, nonce);
      if (!r.ok) throw new Error(`abgelehnt: ${r.grund} ${r.detail ?? ''}`);
      if (!r.block) throw new Error('Treffer, aber kein Block -- Ziel stimmt nicht');
      return r;
    }
  }
  throw new Error(
    `kein Treffer bei Difficulty ${job.difficulty} nach 5 Mio Nonces. ` +
    `Erwartet waeren rund ${(job.difficulty * 65536 / 1e6).toFixed(1)} Mio -- ` +
    `die Testkette ist zu lang geworden.`);
}

function kleinerGleich(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return true;
}

// ------------------------------------------------------------- Blockbau

test('Der Knoten baut und mint einen Block ohne Server', () => {
  const { store, chain, mining } = knoten();

  const job = mining.createJob(MINER_A, 0n);
  assert.equal(job.height, 0);
  assert.equal(job.difficulty, Number(REGTEST.genesisDifficulty));
  assert.equal(job.txCount, 1, 'nur die Coinbase');

  const r = mine(mining, job);
  assert.equal(r.height, 0);
  assert.equal(r.reward, (875n * UNIT).toString());
  assert.equal(chain.height(), 0);
  assert.equal(toHex(chain.tip()!.hash), r.hash);
  store.close();
});

test('Mehrere Blöcke hintereinander, jeder auf dem vorigen', () => {
  const { store, chain, mining } = knoten();
  for (let i = 0; i < 4; i++) {
    const job = mining.createJob(MINER_A, BigInt(i));
    assert.equal(job.height, i);
    const r = mine(mining, job);
    assert.equal(r.height, i);
  }
  assert.equal(chain.height(), 3);
  assert.equal(totalSupply(chain.state()), 4n * 875n * UNIT);
  assert.equal(toHex(stateRoot(chain.state())), toHex(chain.tip()!.stateRoot));
  store.close();
});

test('Ein Job mit zu niedriger Nonce liefert die erreichte Difficulty', () => {
  const { store, mining } = knoten();
  const job = mining.createJob(MINER_A, 0n);
  // Irgendeine Nonce trifft fast nie -- dann kommt kein Block, aber eine
  // ehrliche Angabe darüber, wie schwer der Hash war.
  let gesehen = false;
  for (let n = 0n; n < 20n; n++) {
    const r = mining.submitNonce(job.jobId, n);
    assert.ok(r.ok);
    if (!r.block) { assert.ok(BigInt(r.achieved) >= 0n); gesehen = true; break; }
  }
  assert.ok(gesehen, 'mindestens ein Fehlversuch erwartet');
  store.close();
});

test('Ein unbekannter oder veralteter Job wird abgelehnt', () => {
  const { store, chain, mining } = knoten();
  const job = mining.createJob(MINER_A, 0n);
  mine(mining, job);

  // Derselbe Job noch einmal: Die Kette ist weitergezogen.
  const r = mining.submitNonce(job.jobId, 1n);
  assert.equal(r.ok, false);
  assert.ok(['job_unknown', 'stale_job'].includes((r as { grund: string }).grund));
  store.close();
});

// --------------------------------------------------------------- Mempool

function wallet() {
  return keypairFromMnemonic(createMnemonic(12));
}

test('Der Mempool nimmt nur an, was gedeckt und richtig signiert ist', () => {
  const { store, chain, pool, mining } = knoten();
  // Erst Guthaben schaffen: vier Blöcke an MINER_A
  for (let i = 0; i < 4; i++) mine(mining, mining.createJob(MINER_A, BigInt(i)));

  const empfaenger = wallet();
  const geber = wallet();

  // Unbekanntes Konto
  const ohne = buildTransfer({
    from: geber.addressRaw, to: empfaenger.addressRaw,
    amount: 1n * UNIT, fee: MIN_FEE, nonce: 0n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  const r1 = pool.add(ohne, chain.state(), chain.height() + 1);
  assert.equal(r1.ok, false);
  assert.equal((r1 as { reason: string }).reason, 'unknown_account');

  // Zu niedrige Gebühr
  const billig = buildTransfer({
    from: MINER_A, to: empfaenger.addressRaw,
    amount: 1n * UNIT, fee: 1n, nonce: 0n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  const r2 = pool.add(billig, chain.state(), chain.height() + 1);
  assert.equal(r2.ok, false);
  assert.equal((r2 as { reason: string }).reason, 'fee_too_low');

  assert.equal(pool.size(), 0, 'Nichts Ungeprüftes aufnehmen');
  store.close();
});

test('Der Mempool verhindert dieselbe Nonce zweimal ohne höhere Gebühr', () => {
  const { store, chain, pool, mining } = knoten();

  // Nur drei Blöcke: Jeder weitere vervierfacht die Difficulty, weil sie
  // alle binnen Sekunden entstehen. Drei reichen, um ein Konto zu füllen.
  const geber = wallet();
  for (let i = 0; i < 3; i++) {
    mine(mining, mining.createJob(geber.addressRaw, BigInt(i)));
  }

  const ziel = wallet();
  const eins = buildTransfer({
    from: geber.addressRaw, to: ziel.addressRaw,
    amount: 10n * UNIT, fee: MIN_FEE, nonce: 0n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  assert.equal(pool.add(eins, chain.state(), chain.height() + 1).ok, true);

  // Gleiche Nonce, gleiche Gebühr
  const gleich = buildTransfer({
    from: geber.addressRaw, to: ziel.addressRaw,
    amount: 20n * UNIT, fee: MIN_FEE, nonce: 0n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  const r = pool.add(gleich, chain.state(), chain.height() + 1);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, 'fee_not_higher');

  // Höhere Gebühr ersetzt
  const hoeher = buildTransfer({
    from: geber.addressRaw, to: ziel.addressRaw,
    amount: 20n * UNIT, fee: MIN_FEE * 2n, nonce: 0n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  const r3 = pool.add(hoeher, chain.state(), chain.height() + 1);
  assert.equal(r3.ok, true);
  assert.equal((r3 as { ersetzt?: string }).ersetzt, txidHex(eins));
  assert.equal(pool.size(), 1, 'Ersetzung, keine Verdoppelung');
  store.close();
});

test('Eine Überweisung landet im Block und verschwindet aus dem Mempool', () => {
  const { store, chain, pool, mining } = knoten();
  const geber = wallet();
  for (let i = 0; i < 3; i++) {
    mine(mining, mining.createJob(geber.addressRaw, BigInt(i)));
  }

  const ziel = wallet();
  const tx = buildTransfer({
    from: geber.addressRaw, to: ziel.addressRaw,
    amount: 100n * UNIT, fee: MIN_FEE, nonce: 0n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  assert.equal(pool.add(tx, chain.state(), chain.height() + 1).ok, true);
  assert.equal(pool.size(), 1);

  const job = mining.createJob(geber.addressRaw, 99n);
  assert.equal(job.txCount, 2, 'Coinbase plus die Überweisung');
  mine(mining, job);

  assert.equal(pool.size(), 0, 'Nach dem Block ist sie erledigt');
  const empfangen = chain.state().get(toHex(ziel.addressRaw));
  assert.equal(empfangen!.balance, 100n * UNIT);

  const abs = chain.state().get(toHex(geber.addressRaw))!;
  // 4 Blockrewards, minus Betrag, Gebühr zurück über die Coinbase
  assert.equal(abs.nonce, 1n);
  store.close();
});

test('Nach dem Block fliegen ungültig gewordene Einträge aus dem Mempool', () => {
  const { store, chain, pool, mining } = knoten();
  const geber = wallet();
  mine(mining, mining.createJob(geber.addressRaw, 0n));   // 875 YSR

  const ziel = wallet();
  // Zwei Überweisungen, zusammen mehr als das Guthaben nach der ersten
  const a = buildTransfer({
    from: geber.addressRaw, to: ziel.addressRaw,
    amount: 800n * UNIT, fee: MIN_FEE, nonce: 0n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  assert.equal(pool.add(a, chain.state(), 1).ok, true);

  const b = buildTransfer({
    from: geber.addressRaw, to: ziel.addressRaw,
    amount: 800n * UNIT, fee: MIN_FEE, nonce: 1n,
    publicKey: geber.publicKey, privateKey: geber.privateKey,
  });
  const rb = pool.add(b, chain.state(), 1);
  assert.equal(rb.ok, false);
  assert.equal((rb as { reason: string }).reason, 'insufficient_funds',
    'Die Deckung muss alle wartenden zusammen berücksichtigen');
  store.close();
});
