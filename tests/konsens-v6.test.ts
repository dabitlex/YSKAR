/**
 * Konsensfassung 6 (docs/CONSENSUS_V6.md): der Hard Fork.
 *
 * Geprueft wird mit REGTEST_V6 (Fassung 6 ab Block 0) und, wo es um die
 * Grenze geht, mit REGTEST (Fassung 6 nie). Jede Regel in beide Richtungen:
 * was neu erlaubt ist, muss darunter abgelehnt sein; was neu verboten ist,
 * muss darunter weiter gelten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bech32m } from '@scure/base';

import * as P from '../src/lib/core/params.ts';
import * as T from '../src/lib/core/tx.ts';
import * as S from '../src/lib/core/state.ts';
import * as A from '../src/lib/core/address.ts';
import * as SC from '../src/lib/core/script.ts';
import { smtRoot, smtKey, smtLeaf, smtNode, SMT_EMPTY } from '../src/lib/core/smt.ts';
import { REGTEST, REGTEST_V6, MAINNET } from '../src/lib/core/networks.ts';
import { checkBlockStructure, checkHeaderVersion, precheckHeader, serializeBlock, deserializeBlock, txMerkleRoot, type Block } from '../src/lib/core/block.ts';
import { buildBlock, selectTransactions } from '../src/lib/core/builder.ts';
import { validateBlock } from '../src/lib/core/validate.ts';
import { keypairFromSeed, type Keypair } from '../src/lib/core/wallet.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { baueKette, mineBlock, MINER_A, zeig } from './helpers/regtest.ts';

const kp = (n: number): Keypair => keypairFromSeed(new Uint8Array(32).fill(n));
const ALICE = kp(1), BOB = kp(2), CAROL = kp(3), DAVE = kp(4);
const V6 = REGTEST_V6;

// Testvektoren -- werden einmal erzeugt und dann festgeschrieben (siehe letzter Test).
const VEKTOR_ALICE = '01f5c342bb922ef3b00bc3c78a687c3ce2cb5f269b7c39270958071cc7f2aeb6';
const VEKTOR_BOB = 'f94804a21dfa5a45eb8193d7ecc0889bf726c3400e2657664335a158a84ad048';
const VEKTOR_SIGHASH = 'd50aa0b8afee28c7fd97133ac5ef0c0bdab7ffabea0a051e3ebe98d26378f977';
const VEKTOR_TXID = '595b251ceb0a88f4f711f3b6d899f7d41203429029c1dc0ebe5ae382e44ed27f';
const VEKTOR_MULTISIG = 'ysr1pg95f6ku4e4d7us6xnf5l456uwmc8aerjd02ck72eh7szku28qjqqynpjww';
const VEKTOR_SMT = '51be0642ee68cd9f90a66f8e22ed2de2106789d5f6b40b0ce371e5052493df26';

/** Zustand mit Guthaben fuer die genannten Konten. */
function zustand(konten: [Uint8Array, bigint][]): S.State {
  const s = S.emptyState();
  for (const [raw, balance] of konten) s.set(toHex(raw), { balance, nonce: 0n });
  return s;
}

function block(height: number, txs: T.Tx[], params = V6): Block {
  return {
    header: {
      version: P.blockVersionAt(height, params.v6Height), height,
      prevHash: new Uint8Array(32), merkleRoot: txMerkleRoot(txs),
      stateRoot: new Uint8Array(32), timestamp: 1_788_912_000n + BigInt(height) * 600n,
      difficulty: 1n, txCount: txs.length, extranonce: 0n, nonce: 0n,
    },
    txs,
  };
}

function coinbase(height: number, to: Uint8Array, fees = 0n): T.Coinbase {
  return { type: T.TX_COINBASE, version: 1, height, outputs: [{ to, amount: P.rewardAt(height) + fees }], extra: new Uint8Array(0) };
}

/** Block mit einer Coinbase an MINER_A und den Ausgaben anwenden. */
function anwenden(state: S.State, height: number, spends: T.Spend[], params = V6) {
  let fees = 0n;
  for (const t of spends) fees += t.fee;
  const b = block(height, [coinbase(height, MINER_A, fees), ...spends], params);
  return S.applyBlock(state, b, params);
}

// ------------------------------------------------------------- Fundament

test('Mainnet: Fassung 6 ist noch nicht aktiviert; Regtest-V6 ab Block 0', () => {
  assert.equal(MAINNET.v6Height, P.V6_HEIGHT_UNSET);
  assert.equal(REGTEST.v6Height, P.V6_HEIGHT_UNSET);
  assert.equal(V6.v6Height, 0);
  assert.notEqual(toHex(V6.chainId), toHex(REGTEST.chainId));
});

test('Blockversion: genau 1 darunter, genau 6 ab der Hoehe, hoehere = unbekannte Fassung', () => {
  assert.equal(P.blockVersionAt(6_999, 7_000), 1);
  assert.equal(P.blockVersionAt(7_000, 7_000), 6);
  const h = block(5, [coinbase(5, MINER_A)]).header;
  assert.equal(checkHeaderVersion(h, V6), null);
  assert.equal(checkHeaderVersion({ ...h, version: 1 }, V6), 'bad_version');
  assert.equal(checkHeaderVersion({ ...h, version: 7 }, V6), 'higher_revision');
  assert.equal(checkHeaderVersion({ ...h, version: 6 }, REGTEST), 'bad_version');
  assert.equal(checkHeaderVersion({ ...h, version: 1 }, REGTEST), null);
});

test('Ueberweisung Fassung 1 ist ab V6 ungueltig, Fassung 2 davor (Replay-Schutz)', () => {
  const alt = T.buildTransfer({ from: ALICE.addressRaw, to: BOB.addressRaw, amount: 1_000n, fee: 1_000n,
    nonce: 0n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId });
  const neu = T.buildTransfer({ ...alt, version: T.TRANSFER_V2, privateKey: ALICE.privateKey, chainId: V6.chainId });
  assert.equal(T.checkTransfer(alt, 10, V6), 'bad_version');
  assert.equal(T.checkTransfer(neu, 10, V6), null);
  assert.equal(T.checkTransfer(neu, 10, REGTEST), 'bad_version');
  assert.equal(T.checkTransfer(alt, 10, { ...REGTEST, chainId: V6.chainId }), null);
  // Fassung 2 ist 174 Byte, Fassung 1 168.
  assert.equal(T.txBytes(neu), 174);
  assert.equal(T.txBytes(alt), 168);
});

test('Sighash der Fassung 6 beginnt mit Typ, Fork-Kennung, Chain-ID', () => {
  const t = T.buildTransfer({ from: ALICE.addressRaw, to: BOB.addressRaw, amount: 1_000n, fee: 1_000n,
    nonce: 0n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId, version: 2 });
  const { signature, publicKey, ...u } = t;
  const bytes = T.signingBytes(u, V6.chainId);
  assert.equal(bytes[0], T.TX_TRANSFER);
  assert.equal(new DataView(bytes.buffer).getUint32(1, true), P.FORK_ID_V6);
  assert.equal(toHex(bytes.slice(5, 37)), toHex(V6.chainId));
  // Andere Chain-ID oder anderer Typ: andere Signaturgrundlage.
  assert.notEqual(toHex(bytes), toHex(T.signingBytes(u, REGTEST.chainId)));
});

test('Fassung-2-Ueberweisung: flags, Fenster, versionierter Empfaenger', () => {
  const basis = { from: ALICE.addressRaw, to: BOB.addressRaw, amount: 1_000n, fee: 1_000n, nonce: 0n,
    publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId, version: 2 };
  const t = T.buildTransfer(basis);
  const roundtrip = T.deserializeTx(T.serializeTx(t)) as T.Transfer;
  assert.equal(toHex(T.txid(roundtrip)), toHex(T.txid(t)));
  assert.equal(T.checkTransfer({ ...t, flags: 1 }, 10, V6), 'bad_flags');
  const spaet = T.buildTransfer({ ...basis, validFrom: 20 });
  assert.equal(T.checkTransfer(spaet, 10, V6), 'not_yet_valid');
  assert.equal(T.checkTransfer(spaet, 20, V6), null);
  const kaputt = T.buildTransfer({ ...basis, validFrom: 30, validUntil: 20 });
  assert.equal(T.checkTransfer(kaputt, 25, V6), 'bad_validity_window');
  // Empfaenger der Version 1 ist erlaubt -- Empfangen braucht kein Skript.
  const script = SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey, CAROL.publicKey]));
  const anSkript = T.buildTransfer({ ...basis, to: A.rawAddressFromScript(script) });
  assert.equal(T.checkTransfer(anSkript, 10, V6), null);
  assert.equal(T.txBytes(anSkript), 174 + 12);
  // Unbekannte Adressversion laesst sich nicht einmal lesen.
  const bytes = T.serializeTx(anSkript);
  bytes[2 + 1 + 1 + 20] = 2;   // Versionsbyte des Empfaengers
  assert.throws(() => T.deserializeTx(bytes), /unknown_address_version/);
});

test('Typ 2 und 3 sind unter V6 unbekannt; ab V6 zulaessig', () => {
  const batch = T.buildBatch({ from: ALICE.addressRaw, outputs: [{ to: BOB.addressRaw, amount: 500n }],
    fee: 1_000n, nonce: 0n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId });
  assert.equal(T.checkBatch(batch, 10, V6), null);
  assert.equal(T.checkBatch(batch, 10, { ...REGTEST, chainId: V6.chainId }), 'unknown_tx_type');
  const s = zustand([[ALICE.addressRaw, 10_000n]]);
  const r = anwenden(S.cloneState(s), 10, [batch], { ...REGTEST, chainId: V6.chainId });
  assert.equal(r.ok, false);
  assert.equal(r.error!.reason, 'unknown_tx_type');
});

// ------------------------------------------------------------- Adressen

test('Adressen: Version 0 unveraendert, Version 1 ueber die Laenge erkennbar', () => {
  const alt = 'ysr1pcy6c8vw2fpp49qh4pg3w348qz6nn6vw2fg7f0';   // beginnt mit p, ist Version 0
  assert.equal(A.decodeAddressAny(alt).version, 0);
  assert.equal(A.encodeAddress(A.decodeAddress(alt)), alt);
  const script = SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey, CAROL.publicKey]));
  const text = A.addressForScript(script);
  assert.equal(text.length, 63);
  assert.equal(text.slice(0, 5), 'ysr1p');
  const raw = A.decodeAddress(text);
  assert.equal(raw.length, 33);
  assert.equal(raw[0], 1);
  assert.equal(toHex(raw.slice(1)), toHex(sha256(script)));
  assert.equal(A.encodeAddress(raw, A.HRP_TESTNET).slice(0, 5), 'tysr1');
  assert.throws(() => A.decodeAddress(A.encodeAddress(raw, A.HRP_TESTNET)), /Praefix/);
  // Version 2 liest decodeAddressAny, decodeAddress lehnt ab.
  const v2 = bech32m.encode('ysr', [2, ...bech32m.toWords(new Uint8Array(32).fill(9))]);
  assert.equal(A.decodeAddressAny(v2).version, 2);
  assert.throws(() => A.decodeAddress(v2), /unbekannte Adressversion/);
});

// -------------------------------------------------------------- Skripte

test('Skript: Kodierung, Wohlgeformtheit, needsKey', () => {
  const ok = SC.decodeScript(SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey, CAROL.publicKey])));
  assert.ok(ok);
  assert.equal(SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey, CAROL.publicKey])).length, 102);
  assert.equal(SC.encodeScript(SC.htlc(BOB.publicKey, new Uint8Array(32), ALICE.publicKey, 100)).length, 113);
  assert.equal(SC.encodeScript(SC.timelocked(ALICE.publicKey, 100)).length, 41);
  // Jeder Pfad braucht eine Signatur: THRESH(1,[PK, AFTER]) ist verboten.
  const offen: SC.ScriptNode = { op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_PK, pubkey: ALICE.publicKey }, { op: SC.OP_AFTER, height: 5 }] };
  assert.equal(SC.decodeScript(SC.encodeScript(offen)), null);
  assert.equal(SC.needsKey(offen), false);
  assert.equal(SC.needsKey(SC.timelocked(ALICE.publicKey, 5)), true);
  // Doppelter Schluessel, AFTER(0), Tiefe 4, 17 Schluessel, k > n, Restbytes.
  assert.equal(SC.decodeScript(SC.encodeScript(SC.multisig(1, [ALICE.publicKey, ALICE.publicKey]))), null);
  assert.equal(SC.decodeScript(SC.encodeScript({ op: SC.OP_THRESH, k: 2, children: [{ op: SC.OP_PK, pubkey: ALICE.publicKey }, { op: SC.OP_AFTER, height: 0 }] })), null);
  const tief: SC.ScriptNode = { op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_PK, pubkey: ALICE.publicKey }] }] }] }] };
  assert.equal(SC.decodeScript(SC.encodeScript(tief)), null);
  const dreiTief: SC.ScriptNode = { op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_THRESH, k: 1, children: [{ op: SC.OP_PK, pubkey: ALICE.publicKey }] }] }] };
  assert.ok(SC.decodeScript(SC.encodeScript(dreiTief)));
  const viele = Array.from({ length: 17 }, (_, i) => kp(10 + i).publicKey);
  assert.equal(SC.decodeScript(SC.encodeScript(SC.multisig(1, viele))), null);
  assert.ok(SC.decodeScript(SC.encodeScript(SC.multisig(1, viele.slice(0, 16)))));
  const kn = SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey])); kn[1] = 3;
  assert.equal(SC.decodeScript(kn), null);
  assert.equal(SC.decodeScript(new Uint8Array([...SC.encodeScript(SC.timelocked(ALICE.publicKey, 5)), 0])), null);
  // Ein einzelnes PK ist ein wohlgeformtes Skript (33 Byte).
  assert.ok(SC.decodeScript(SC.encodeScript({ op: SC.OP_PK, pubkey: ALICE.publicKey })));
});

/** Skript-Konto fuellen und eine Ausgabe daraus bauen. */
function skriptAusgabe(script: Uint8Array, witness: (sighash: Uint8Array) => SC.WitnessSlot[], opts: {
  amount?: bigint; fee?: bigint; validFrom?: number; validUntil?: number; nonce?: bigint;
} = {}): T.ScriptSpend {
  const unsigned = T.unsignedScriptSpend({ script, to: DAVE.addressRaw, amount: opts.amount ?? 1_000n,
    fee: opts.fee ?? 2_000n, nonce: opts.nonce ?? 0n, validFrom: opts.validFrom, validUntil: opts.validUntil });
  const sig = T.scriptSpendSighash(unsigned, V6.chainId);
  return { ...unsigned, witness: SC.encodeWitness(witness(sig)) };
}
const sig = (k: Keypair, h: Uint8Array): SC.WitnessSlot => ({ kind: 'sig', signature: ed25519.sign(h, k.privateKey) });
const absent: SC.WitnessSlot = { kind: 'absent' };

test('2-von-3: zwei richtige Signaturen gelten, eine nicht, drei sind zu viel, eine falsche ist ein Fehler', () => {
  const script = SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey, CAROL.publicKey]));
  const konto = A.rawAddressFromScript(script);
  const [k1, k2, k3] = SC.sortKeys([ALICE.publicKey, BOB.publicKey, CAROL.publicKey]).map(pk =>
    [ALICE, BOB, CAROL].find(k => toHex(k.publicKey) === toHex(pk))!);
  const s = zustand([[konto, 1_000_000n]]);

  const gut = skriptAusgabe(script, h => [sig(k1, h), sig(k2, h), absent]);
  assert.equal(T.checkScriptSpend(gut, 10, V6), null);
  assert.equal(T.txBytes(gut), 325);
  const r = anwenden(S.cloneState(s), 10, [gut]);
  assert.equal(r.ok, true, r.error?.reason);

  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(k1, h), absent, absent]), 10, V6), 'script_unsatisfied');
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(k1, h), sig(k2, h), sig(k3, h)]), 10, V6), 'witness_excess');
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(k1, h), sig(DAVE, h), absent]), 10, V6), 'script_unsatisfied');
  // Signatur ueber einen anderen Sighash (anderer Betrag) gilt nicht.
  const fremd = skriptAusgabe(script, h => [sig(k1, h), sig(k2, h), absent], { amount: 999n });
  const manipuliert = { ...gut, witness: fremd.witness };
  assert.equal(T.checkScriptSpend(manipuliert, 10, V6), 'script_unsatisfied');
  // Falsches Skript zum Konto.
  const anderes = SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey]));
  assert.equal(T.checkScriptSpend({ ...gut, script: anderes }, 10, V6), 'script_mismatch');
  // Witness mit Restbytes.
  assert.equal(T.checkScriptSpend({ ...gut, witness: new Uint8Array([...gut.witness, 0]) }, 10, V6), 'bad_witness');
  // Roundtrip ueber die Leitung.
  const wieder = T.deserializeTx(T.serializeTx(gut)) as T.ScriptSpend;
  assert.equal(toHex(T.txid(wieder)), toHex(T.txid(gut)));
  assert.equal(T.checkScriptSpend(wieder, 10, V6), null);
  // Unter V6 unbekannt.
  assert.equal(T.checkScriptSpend(gut, 10, { ...REGTEST, chainId: V6.chainId }), 'unknown_tx_type');
});

test('HTLC: Einloesen mit Geheimnis, Rueckzahlung nach Ablauf, beides sonst nicht', () => {
  const geheimnis = randomBytes(32);
  const hash = sha256(geheimnis);
  const script = SC.encodeScript(SC.htlc(BOB.publicKey, hash, ALICE.publicKey, 100));
  const konto = A.rawAddressFromScript(script);
  const s = zustand([[konto, 1_000_000n]]);
  // Slots: [PK Bob, HASH, PK Alice, AFTER]
  const einloesen = skriptAusgabe(script, h => [sig(BOB, h), { kind: 'preimage', preimage: geheimnis }, absent, absent]);
  assert.equal(T.checkScriptSpend(einloesen, 10, V6), null);
  assert.equal(T.txBytes(einloesen), 305);
  assert.equal(anwenden(S.cloneState(s), 10, [einloesen]).ok, true);
  // Falsches Geheimnis.
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(BOB, h), { kind: 'preimage', preimage: randomBytes(32) }, absent, absent]), 10, V6), 'script_unsatisfied');
  // Bob ohne Geheimnis: Zweig nur halb beruehrt.
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(BOB, h), absent, absent, absent]), 10, V6), 'script_unsatisfied');
  // Rueckzahlung: validFrom >= 100 und Block >= validFrom.
  const zurueck = skriptAusgabe(script, h => [absent, absent, sig(ALICE, h), { kind: 'claim' }], { validFrom: 100 });
  assert.equal(T.txBytes(zurueck), 273);
  assert.equal(T.checkScriptSpend(zurueck, 99, V6), 'not_yet_valid');
  assert.equal(T.checkScriptSpend(zurueck, 100, V6), null);
  assert.equal(anwenden(S.cloneState(s), 100, [zurueck]).ok, true);
  // Rueckzahlung zu frueh (validFrom 50 < AFTER 100): AFTER nicht erfuellt.
  const zuFrueh = skriptAusgabe(script, h => [absent, absent, sig(ALICE, h), { kind: 'claim' }], { validFrom: 50 });
  assert.equal(T.checkScriptSpend(zuFrueh, 60, V6), 'script_unsatisfied');
  // Alice ohne AFTER-Anspruch: zu wenig beruehrt.
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [absent, absent, sig(ALICE, h), absent], { validFrom: 100 }), 100, V6), 'script_unsatisfied');
  // Beide Zweige beruehrt: zu viel.
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(BOB, h), { kind: 'preimage', preimage: geheimnis }, sig(ALICE, h), { kind: 'claim' }], { validFrom: 100 }), 100, V6), 'witness_excess');
});

test('BEFORE: nur bis zur Hoehe, und nur mit gesetztem validUntil', () => {
  const script = SC.encodeScript({ op: SC.OP_THRESH, k: 2, children: [{ op: SC.OP_PK, pubkey: ALICE.publicKey }, { op: SC.OP_BEFORE, height: 50 }] });
  const s = zustand([[A.rawAddressFromScript(script), 1_000_000n]]);
  const bis = skriptAusgabe(script, h => [sig(ALICE, h), { kind: 'claim' }], { validUntil: 50 });
  assert.equal(T.checkScriptSpend(bis, 40, V6), null);
  assert.equal(anwenden(S.cloneState(s), 40, [bis]).ok, true);
  assert.equal(T.checkScriptSpend(bis, 51, V6), 'expired');
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(ALICE, h), { kind: 'claim' }], { validUntil: 60 }), 40, V6), 'script_unsatisfied');
  assert.equal(T.checkScriptSpend(skriptAusgabe(script, h => [sig(ALICE, h), { kind: 'claim' }]), 40, V6), 'script_unsatisfied');
});

test('Zufallsskripte: Kodierung ist bijektiv, Auswertung wirft nie', () => {
  const keys = Array.from({ length: 8 }, (_, i) => kp(20 + i).publicKey);
  let gueltig = 0;
  for (let i = 0; i < 300; i++) {
    const node = zufallsBaum(keys, 0);
    const bytes = SC.encodeScript(node);
    const gelesen = SC.decodeScript(bytes);
    if (!gelesen) continue;
    gueltig++;
    assert.equal(toHex(SC.encodeScript(gelesen)), toHex(bytes));
    assert.equal(SC.needsKey(gelesen), true);
    // Zufaelliger Witness in passender Form: nie eine Ausnahme.
    const slots = SC.leaves(gelesen).map((l): SC.WitnessSlot => {
      if (Math.random() < 0.5) return absent;
      if (l.op === SC.OP_PK) return { kind: 'sig', signature: randomBytes(64) };
      if (l.op === SC.OP_HASH) return { kind: 'preimage', preimage: randomBytes(32) };
      return { kind: 'claim' };
    });
    const w = SC.encodeWitness(slots);
    assert.deepEqual(SC.decodeWitness(gelesen, w)?.length, slots.length);
    const r = SC.evaluateScript(gelesen, slots, { sighash: randomBytes(32), validFrom: 0, validUntil: 0 });
    assert.ok(r === null || typeof r === 'string');
  }
  assert.ok(gueltig > 50, `nur ${gueltig} wohlgeformte Zufallsskripte`);
});

function zufallsBaum(keys: Uint8Array[], depth: number): SC.ScriptNode {
  const r = Math.random();
  if (depth >= 3 || r < 0.45) {
    const w = Math.random();
    if (w < 0.55) return { op: SC.OP_PK, pubkey: keys[Math.floor(Math.random() * keys.length)] };
    if (w < 0.7) return { op: SC.OP_HASH, hash: randomBytes(32) };
    if (w < 0.85) return { op: SC.OP_AFTER, height: 1 + Math.floor(Math.random() * 100) };
    return { op: SC.OP_BEFORE, height: 1 + Math.floor(Math.random() * 100) };
  }
  const n = 1 + Math.floor(Math.random() * 4);
  const k = 1 + Math.floor(Math.random() * n);
  return { op: SC.OP_THRESH, k, children: Array.from({ length: n }, () => zufallsBaum(keys, depth + 1)) };
}

// ------------------------------------------------------------- Sammelzahlung

test('Sammelzahlung: sortiert, ohne Duplikate, 1.000 ja, 1.001 nein, Wirkung auf den Zustand', () => {
  const s = zustand([[ALICE.addressRaw, 100_000_000n]]);
  const an = (i: number) => { const a = new Uint8Array(20); a[0] = 0x50; a[1] = i >> 8; a[2] = i & 0xff; return a; };
  const bauen = (n: number) => T.buildBatch({ from: ALICE.addressRaw,
    outputs: Array.from({ length: n }, (_, i) => ({ to: an(i), amount: 100n })),
    fee: 50_000n, nonce: 0n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId });
  const tausend = bauen(1_000);
  assert.equal(T.checkBatch(tausend, 10, V6), null);
  assert.equal(T.txBytes(tausend), 29_147);
  const r = anwenden(S.cloneState(s), 10, [tausend]);
  assert.equal(r.ok, true, r.error?.reason);
  assert.equal(S.getAccount(s, ALICE.addressRaw).balance, 100_000_000n);   // Original unberuehrt
  const nach = S.cloneState(s); anwenden(nach, 10, [tausend]);
  assert.equal(S.getAccount(nach, an(999)).balance, 100n);
  assert.equal(S.getAccount(nach, ALICE.addressRaw).balance, 100_000_000n - 100_000n - 50_000n);
  assert.equal(S.getAccount(nach, ALICE.addressRaw).nonce, 1n);
  assert.equal(T.checkBatch(bauen(1_001), 10, V6), 'bad_output_count');
  // Der Leser liest 1.001 noch (6.1); die Pruefung lehnt ab.
  assert.equal(T.checkBatch(T.deserializeTx(T.serializeTx(bauen(1_001))) as T.Batch, 10, V6), 'bad_output_count');
  // Unsortiert oder doppelt: ungueltig.
  const zwei = bauen(2);
  const vertauscht = { ...zwei, outputs: [zwei.outputs[1], zwei.outputs[0]] };
  assert.equal(T.checkBatch(vertauscht, 10, V6), 'outputs_unsorted');
  const doppelt = { ...zwei, outputs: [zwei.outputs[0], zwei.outputs[0]] };
  assert.equal(T.checkBatch(doppelt, 10, V6), 'outputs_unsorted');
  // Gebuehr je Byte: 29.147 Einheiten Minimum.
  const billig = T.buildBatch({ from: ALICE.addressRaw, outputs: tausend.outputs, fee: 29_146n, nonce: 0n,
    publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId });
  assert.equal(T.checkBatch(billig, 10, V6), 'fee_too_low');
});

// ------------------------------------------------------------- Zustandsbaum

test('Sparse-Merkle-Baum: Konstruktion nach Spezifikation, Kompaktierung, Reihenfolge egal', () => {
  const k = (n: number) => { const b = new Uint8Array(32); b[0] = n; return b; };
  const v = new Uint8Array([7]);
  assert.equal(toHex(smtRoot([])), toHex(SMT_EMPTY));
  assert.equal(toHex(smtRoot([{ key: k(0x80), value: v }])), toHex(smtLeaf(k(0x80), v)));
  // Zwei Schluessel, die sich im ersten Bit unterscheiden: node(leaf0, leaf1).
  const zwei = smtRoot([{ key: k(0x80), value: v }, { key: k(0x00), value: v }]);
  assert.equal(toHex(zwei), toHex(smtNode(smtLeaf(k(0x00), v), smtLeaf(k(0x80), v))));
  // Zwei Schluessel, die sich erst im zweiten Bit unterscheiden: rechts leer.
  const tief = smtRoot([{ key: k(0x40), value: v }, { key: k(0x00), value: v }]);
  assert.equal(toHex(tief), toHex(smtNode(smtNode(smtLeaf(k(0x00), v), smtLeaf(k(0x40), v)), SMT_EMPTY)));
  assert.throws(() => smtRoot([{ key: k(1), value: v }, { key: k(1), value: v }]), /doppelter/);
});

test('Zustandswurzel: flach unter V6, Sparse-Merkle ab V6; Kontoeintrag 81 Byte', () => {
  const s = zustand([[ALICE.addressRaw, 5n], [BOB.addressRaw, 7n]]);
  assert.equal(S.serializeAccount({ balance: 5n, nonce: 1n }).length, 81);
  assert.equal(toHex(S.stateRootAt(s, 10, REGTEST)), toHex(S.stateRoot(s)));
  assert.equal(toHex(S.stateRootAt(s, 10, V6)), toHex(S.stateRootV6(s)));
  assert.notEqual(toHex(S.stateRoot(s)), toHex(S.stateRootV6(s)));
  const erwartet = smtRoot([
    { key: smtKey(ALICE.addressRaw), value: S.serializeAccount({ balance: 5n, nonce: 0n }) },
    { key: smtKey(BOB.addressRaw), value: S.serializeAccount({ balance: 7n, nonce: 0n }) },
  ]);
  assert.equal(toHex(S.stateRootV6(s)), toHex(erwartet));
  // Mit einem Skript-Konto (33-Byte-Schluessel) daneben.
  const script = SC.encodeScript(SC.timelocked(ALICE.publicKey, 5));
  s.set(toHex(A.rawAddressFromScript(script)), { balance: 1n, nonce: 0n });
  assert.equal(S.stateRootV6(s).length, 32);
});

// ------------------------------------------------------- Grenzen und Budget

test('Grenzen je Hoehe: 5.000 Transaktionen und 255 Coinbase-Empfaenger ab V6', () => {
  assert.equal(P.maxTxsAt(10, 0), 5_000);
  assert.equal(P.maxTxsAt(10, P.V6_HEIGHT_UNSET), 2_000);
  assert.equal(P.maxCoinbaseOutputsAt(10, 0), 255);
  const an = (i: number) => { const a = new Uint8Array(20); a[1] = i >> 8; a[2] = i & 0xff; return a; };
  const outputs255 = Array.from({ length: 255 }, (_, i) => ({ to: an(i), amount: 1n }));
  const rest = P.rewardAt(10) - 254n;
  outputs255[254].amount = rest;
  const cb: T.Coinbase = { type: T.TX_COINBASE, version: P.COINBASE_V2, height: 10,
    outputs: outputs255.sort((a, b) => (toHex(a.to) < toHex(b.to) ? -1 : 1)), extra: new Uint8Array(0) };
  // Unter V6 1 Einheit je Ausgabe = Staub (Fassung 5) -- deshalb hier 100.
  for (const o of cb.outputs) o.amount = 100n;
  cb.outputs[cb.outputs.length - 1].amount = P.rewardAt(10) - 254n * 100n;
  assert.equal(S.applyBlock(S.emptyState(), block(10, [cb]), V6).ok, true);
  const r = S.applyBlock(S.emptyState(), block(10, [cb], REGTEST), REGTEST);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /^coinbase_outputs:255/);
  // too_many_txs richtet sich nach der Hoehe.
  const b = block(10, [coinbase(10, MINER_A)]);
  b.txs = [b.txs[0], ...Array.from({ length: 2_500 }, () => b.txs[0])];
  b.header.txCount = b.txs.length;
  assert.equal(checkBlockStructure({ ...b, header: { ...b.header, version: 1 } }, REGTEST), 'too_many_txs');
  assert.notEqual(checkBlockStructure(b, V6), 'too_many_txs');
});

test('Signaturbudget: 8.000 je Block, gezaehlt vor jeder Pruefung', () => {
  // Ein Skript mit 16 Schluesseln, voll signiert, braucht 16 Operationen.
  const keys = Array.from({ length: 16 }, (_, i) => kp(40 + i));
  const script = SC.encodeScript(SC.multisig(16, keys.map(k => k.publicKey)));
  const sortiert = SC.sortKeys(keys.map(k => k.publicKey)).map(pk => keys.find(k => toHex(k.publicKey) === toHex(pk))!);
  const konto = A.rawAddressFromScript(script);
  const s = zustand([[konto, 10n ** 15n]]);
  const eine = (nonce: bigint) => skriptAusgabe(script, h => sortiert.map(k => sig(k, h)), { nonce, fee: 5_000n });
  assert.equal(T.spendSigops(eine(0n)), 16);
  // 501 Ausgaben = 8.016 Operationen: ueber dem Budget, abgelehnt ohne Signaturpruefung.
  const viele = Array.from({ length: 501 }, (_, i) => eine(BigInt(i)));
  const r = anwenden(S.cloneState(s), 10, viele);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /^too_many_sigops/);
  // Der Blockbau haelt sich an das Budget.
  const { included } = selectTransactions(s, viele, 10, undefined, V6);
  assert.equal(included.length, 500);
});

// ---------------------------------------------------- Ketten und Knoten

test('Regtest-V6-Kette: Bloecke mit Version 6, Fassung-2-Ueberweisung, Skript-Konto von Anfang bis Ende', () => {
  const k = baueKette(3, { params: V6, miner: ALICE.addressRaw });
  assert.equal(k.bloecke[0].block.header.version, 6);
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store, V6);
  for (const b of k.bloecke) assert.equal(chain.accept(b.body).ok, true);

  const script = SC.encodeScript(SC.multisig(2, [BOB.publicKey, CAROL.publicKey]));
  const konto = A.rawAddressFromScript(script);
  const einzahlung = T.buildTransfer({ from: ALICE.addressRaw, to: konto, amount: 50_000n, fee: 1_000n, nonce: 0n,
    publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId, version: 2 });
  const b3 = mineBlock({ height: 3, prevHash: k.bloecke[2].hash, state: k.state, timestamp: k.zeit,
    miner: ALICE.addressRaw, mempool: [einzahlung], params: V6 });
  const r3 = chain.accept(b3.body);
  assert.equal(r3.ok, true, zeig(r3));
  assert.equal(S.applyBlock(k.state, b3.block, V6).ok, true);
  assert.equal(S.getAccount(k.state, konto).balance, 50_000n);

  const [k1, k2] = SC.sortKeys([BOB.publicKey, CAROL.publicKey]).map(pk => [BOB, CAROL].find(x => toHex(x.publicKey) === toHex(pk))!);
  const ausgabe = skriptAusgabe(script, h => [sig(k1, h), sig(k2, h)], { amount: 10_000n, fee: 1_000n });
  const b4 = mineBlock({ height: 4, prevHash: b3.hash, state: k.state, timestamp: k.zeit + 600n,
    miner: ALICE.addressRaw, mempool: [ausgabe], params: V6 });
  assert.equal(b4.block.txs.length, 2);
  const r4 = chain.accept(b4.body);
  assert.equal(r4.ok, true, zeig(r4));
  assert.equal(S.applyBlock(k.state, b4.block, V6).ok, true);
  assert.equal(S.getAccount(k.state, konto).balance, 39_000n);
  assert.equal(S.getAccount(k.state, DAVE.addressRaw).balance, 10_000n);
  // Der Knoten hat denselben Zustand gerechnet.
  assert.equal(chain.state().get(toHex(konto))!.balance, 39_000n);
  store.close();
});

test('Mempool nimmt alle drei Ausgabetypen und schluesselt nach (Absender, Nonce)', () => {
  const script = SC.encodeScript(SC.multisig(1, [BOB.publicKey]));
  const konto = A.rawAddressFromScript(script);
  const s = zustand([[ALICE.addressRaw, 10_000_000n], [konto, 10_000_000n]]);
  const pool = new TxPool(V6);
  const t1 = T.buildTransfer({ from: ALICE.addressRaw, to: BOB.addressRaw, amount: 1_000n, fee: 2_000n, nonce: 0n,
    publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId, version: 2 });
  const t3 = T.buildBatch({ from: ALICE.addressRaw, outputs: [{ to: BOB.addressRaw, amount: 100n }, { to: CAROL.addressRaw, amount: 100n }],
    fee: 3_000n, nonce: 1n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId });
  const t2 = skriptAusgabe(script, h => [sig(BOB, h)], { fee: 3_000n });
  assert.equal(pool.add(t1, s, 10).ok, true);
  assert.equal(pool.add(t3, s, 10).ok, true);
  assert.equal(pool.add(t2, s, 10).ok, true);
  assert.equal(pool.size(), 3);
  // Dieselbe (Absender, Nonce) mit anderem Witness ist eine Ersetzung, kein Neuzugang.
  const t2b = skriptAusgabe(script, h => [sig(BOB, h)], { fee: 3_000n + 2_000n });
  const r = pool.add(t2b, s, 10);
  assert.equal(r.ok, true);
  assert.ok((r as { ersetzt?: string }).ersetzt);
  assert.equal(pool.size(), 3);
  // Fassung 1 lehnt der V6-Mempool ab.
  const alt = T.buildTransfer({ ...t1, version: 1, nonce: 2n, privateKey: ALICE.privateKey, chainId: V6.chainId });
  assert.equal(pool.add(alt, s, 10).ok, false);
});

test('Prueffolge: hoehere Fassung mit gueltiger Arbeit = veraltet, ohne Arbeit = Struktur', () => {
  const k = baueKette(2, { params: V6, miner: ALICE.addressRaw });
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store, V6);
  for (const b of k.bloecke) assert.equal(chain.accept(b.body).ok, true);
  // Denselben Block mit Version 7 neu minen: gueltige Arbeit, unbekannte Fassung.
  const roh = k.bloecke[1].body.slice();
  const dv = new DataView(roh.buffer, roh.byteOffset);
  dv.setUint32(0, 7, true);
  // Nonce suchen, bis die Arbeit stimmt (Difficulty 1 -> schnell).
  for (let n = 0; ; n++) {
    dv.setBigUint64(128, BigInt(n), true);
    if (precheckHeader(roh, V6).error !== 'pow_failed') break;
  }
  const r = chain.accept(roh);
  assert.equal(r.ok, false);
  assert.equal((r as { grund: string }).grund, 'fassung_unbekannt');
  assert.deepEqual(chain.hoehereFassungGesehen, { version: 7, height: 1 });
  // Ohne Arbeit: gewoehnlicher Strukturfehler, kein Veraltet-Signal.
  const chain2 = new ChainManager(new ChainStore(':memory:'), V6);
  dv.setBigUint64(128, 0xffff_ffff_ffff_ffffn, true);
  const r2 = chain2.accept(roh);
  assert.equal((r2 as { grund: string }).grund, 'struktur');
  assert.equal(chain2.hoehereFassungGesehen, null);
  // Version 1 an einer V6-Hoehe mit gueltiger Arbeit: schlicht falsch, kein Veraltet-Signal.
  dv.setUint32(0, 1, true);
  for (let n = 0; ; n++) {
    dv.setBigUint64(128, BigInt(n), true);
    if (precheckHeader(roh, V6).error !== 'pow_failed') break;
  }
  const r3 = chain2.accept(roh);
  assert.deepEqual(r3, { ok: false, grund: 'struktur', detail: 'bad_version' });
  assert.equal(chain2.hoehereFassungGesehen, null);
  store.close();
});

test('Hoehere Fassung ohne bekannten Vorgaenger oder mit falscher Difficulty macht niemanden veraltet', () => {
  const k = baueKette(2, { params: V6, miner: ALICE.addressRaw });
  const chain = new ChainManager(new ChainStore(':memory:'), V6);
  for (const b of k.bloecke) assert.equal(chain.accept(b.body).ok, true);
  // Version 7, Arbeit gegen Difficulty 1 gueltig, aber prevHash unbekannt.
  const roh = k.bloecke[1].body.slice();
  const dv = new DataView(roh.buffer, roh.byteOffset);
  dv.setUint32(0, 7, true);
  roh[8] ^= 0xff;   // prevHash verfaelscht
  for (let n = 0; ; n++) {
    dv.setBigUint64(128, BigInt(n), true);
    if (precheckHeader(roh, V6).error !== 'pow_failed') break;
  }
  assert.equal((chain.accept(roh) as { grund: string }).grund, 'struktur');
  assert.equal(chain.hoehereFassungGesehen, null);
});

test('Mainnet-Parameter: Fassung 6 ist nirgends aktiv', () => {
  const b = block(100, [coinbase(100, MINER_A)], MAINNET);
  assert.equal(b.header.version, 1);
  assert.equal(checkHeaderVersion({ ...b.header, version: 6 }, MAINNET), 'bad_version');
  const pool = new TxPool(MAINNET);
  const s = zustand([[ALICE.addressRaw, 10_000_000n]]);
  const batch = T.buildBatch({ from: ALICE.addressRaw, outputs: [{ to: BOB.addressRaw, amount: 500n }],
    fee: 100_000n, nonce: 0n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey });
  const r = pool.add(batch, s, 5_000);
  assert.equal(r.ok, false);
  assert.equal((r as { detail?: string }).detail, 'unknown_tx_type');
});

test('Sammelzahlung mit gemischten Adressversionen sortiert nach der Leitungsform', () => {
  // Rohform: v0 = 20 Byte ohne Versionsbyte, v1 = 0x01 | 32 Byte. In der
  // Leitungsform traegt v0 das Byte 0x00 voran und steht deshalb VOR jeder
  // v1-Adresse -- auch wenn ihr erstes Rohbyte groesser als 0x01 ist.
  const script = SC.encodeScript(SC.multisig(1, [BOB.publicKey]));
  const v1 = A.rawAddressFromScript(script);
  const v0 = new Uint8Array(20).fill(0x05);
  const batch = T.buildBatch({ from: ALICE.addressRaw, outputs: [{ to: v1, amount: 100n }, { to: v0, amount: 100n }],
    fee: 1_000n, nonce: 0n, publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId });
  assert.equal(toHex(batch.outputs[0].to), toHex(v0));
  assert.equal(T.checkBatch(batch, 10, V6), null);
  const falsch = { ...batch, outputs: [batch.outputs[1], batch.outputs[0]] };
  assert.equal(T.checkBatch(falsch, 10, V6), 'outputs_unsorted');
  const s = zustand([[ALICE.addressRaw, 10_000_000n]]);
  assert.equal(anwenden(S.cloneState(s), 10, [batch]).ok, true);
});

test('Blockbau haelt die Blockgroesse ein: 40 Sammelzahlungen passen nicht alle in 1 MiB', () => {
  const an = (b: number, i: number) => { const a = new Uint8Array(20); a[0] = b; a[1] = i >> 8; a[2] = i & 0xff; return a; };
  const absender = Array.from({ length: 40 }, (_, i) => kp(100 + i));
  const s = zustand(absender.map(k => [k.addressRaw, 10n ** 12n]));
  const mempool = absender.map((k, j) => T.buildBatch({ from: k.addressRaw,
    outputs: Array.from({ length: 1_000 }, (_, i) => ({ to: an(0x60 + j, i), amount: 100n })),
    fee: 50_000n, nonce: 0n, publicKey: k.publicKey, privateKey: k.privateKey, chainId: V6.chainId }));
  const gebaut = buildBlock({ height: 10, prevHash: new Uint8Array(32), state: s, mempool, minerAddress: MINER_A,
    timestamp: 1n, difficulty: 1n, extranonce: 0n, params: V6 });
  const bytes = serializeBlock(gebaut.block).length;
  assert.ok(bytes <= P.MAX_BLOCK_BYTES, `${bytes} Byte`);
  assert.ok(gebaut.included.length >= 30 && gebaut.included.length < 40, `${gebaut.included.length} aufgenommen`);
});

test('Signaturbudget genau: 8.000 ja, 8.016 nein, und die ueberzaehlige Transaktion wird nie geprueft', () => {
  const keys = Array.from({ length: 16 }, (_, i) => kp(60 + i));
  const script = SC.encodeScript(SC.multisig(16, keys.map(k => k.publicKey)));
  const sortiert = SC.sortKeys(keys.map(k => k.publicKey)).map(pk => keys.find(k => toHex(k.publicKey) === toHex(pk))!);
  const konto = A.rawAddressFromScript(script);
  const s = zustand([[konto, 10n ** 15n]]);
  const eine = (nonce: bigint) => skriptAusgabe(script, h => sortiert.map(k => sig(k, h)), { nonce, fee: 5_000n });
  const fuenfhundert = Array.from({ length: 500 }, (_, i) => eine(BigInt(i)));
  assert.equal(anwenden(S.cloneState(s), 10, fuenfhundert).ok, true);
  // Nummer 501 traegt 16 UNGUELTIGE Signaturen: Waere sie geprueft, hiesse
  // der Fehler script_unsatisfied. Das Budget greift vorher.
  const kaputt = skriptAusgabe(script, () => sortiert.map(() => ({ kind: 'sig', signature: randomBytes(64) } as SC.WitnessSlot)), { nonce: 500n, fee: 5_000n });
  const r = anwenden(S.cloneState(s), 10, [...fuenfhundert, kaputt]);
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /^too_many_sigops:8016/);
  assert.equal(r.error!.tx, 501);
});

test('Witness-Form wird vor der Kryptografie geprueft: 16 gueltige Signaturen an THRESH(1) sind ein Formfehler', () => {
  const keys = Array.from({ length: 16 }, (_, i) => kp(80 + i));
  const script = SC.encodeScript(SC.multisig(1, keys.map(k => k.publicKey)));
  const sortiert = SC.sortKeys(keys.map(k => k.publicKey)).map(pk => keys.find(k => toHex(k.publicKey) === toHex(pk))!);
  // Alle 16 belegt, aber mit Zufallsbytes: Bei Pruefung vor der Form hiesse
  // das script_unsatisfied; die Form sagt witness_excess.
  const t = skriptAusgabe(script, () => sortiert.map(() => ({ kind: 'sig', signature: randomBytes(64) } as SC.WitnessSlot)));
  assert.equal(T.checkScriptSpend(t, 10, V6), 'witness_excess');
  // Slotbyte 0x02 und abgeschnittener Slot: bad_witness.
  const gut = skriptAusgabe(script, h => [sig(sortiert[0], h), ...Array(15).fill(absent)]);
  const w2 = gut.witness.slice(); w2[0] = 2;
  assert.equal(T.checkScriptSpend({ ...gut, witness: w2 }, 10, V6), 'bad_witness');
  assert.equal(T.checkScriptSpend({ ...gut, witness: gut.witness.slice(0, 30) }, 10, V6), 'bad_witness');
});

test('Mempool: eine Rueckzahlung mit validFrom in der Zukunft wartet draussen', () => {
  const script = SC.encodeScript(SC.timelocked(ALICE.publicKey, 50));
  const s = zustand([[A.rawAddressFromScript(script), 1_000_000n]]);
  const pool = new TxPool(V6);
  const t = skriptAusgabe(script, h => [sig(ALICE, h), { kind: 'claim' }], { validFrom: 50, fee: 3_000n });
  assert.equal(pool.add(t, s, 40).ok, false);
  assert.equal(pool.add(t, s, 50).ok, true);
});

test('Feste Vektoren: Sighash und txid der Fassung 6 aendern sich nicht', () => {
  // Diese Werte sind die Testvektoren der Spezifikation (Abschnitt 14).
  // Wer sie aendert, aendert den Konsens.
  const t = T.buildTransfer({ from: ALICE.addressRaw, to: BOB.addressRaw, amount: 1_000n, fee: 1_000n,
    nonce: 7n, validFrom: 5, validUntil: 50, memo: new TextEncoder().encode('v6'),
    publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, chainId: V6.chainId, version: 2 });
  const { signature: _s, publicKey: _p, ...u } = t;
  const vektoren = {
    alice: toHex(ALICE.publicKey), bob: toHex(BOB.publicKey),
    transferV2Sighash: toHex(T.sighash(u, V6.chainId)),
    transferV2Txid: toHex(T.txid(t)),
    multisig23Address: A.addressForScript(SC.encodeScript(SC.multisig(2, [ALICE.publicKey, BOB.publicKey, CAROL.publicKey]))),
    smtRootZweiKonten: toHex(S.stateRootV6(zustand([[ALICE.addressRaw, 5n], [BOB.addressRaw, 7n]]))),
  };
  assert.deepEqual(vektoren, {
    alice: VEKTOR_ALICE, bob: VEKTOR_BOB,
    transferV2Sighash: VEKTOR_SIGHASH, transferV2Txid: VEKTOR_TXID,
    multisig23Address: VEKTOR_MULTISIG, smtRootZweiKonten: VEKTOR_SMT,
  });
});

test('Alte Bloecke unter V6 bleiben byteweise gueltig: REGTEST-Kette unveraendert', () => {
  const k = baueKette(3);
  for (const b of k.bloecke) {
    assert.equal(b.block.header.version, 1);
    assert.equal(toHex(serializeBlock(deserializeBlock(b.body))), toHex(b.body));
  }
  const ctx = { previous: k.bloecke[1].block.header, state: (() => { const s = S.emptyState();
    S.applyBlock(s, k.bloecke[0].block, REGTEST); S.applyBlock(s, k.bloecke[1].block, REGTEST); return s; })(),
    recentTimestamps: k.bloecke.slice(0, 2).map(b => b.block.header.timestamp),
    recentTimings: [{ solveSeconds: 600n, difficulty: 1n }], now: k.zeit, params: REGTEST };
  assert.equal(validateBlock(k.bloecke[2].block, ctx), null);
});

test('4.2: keine Adressversion darf 19 Byte Programm haben -- 32 Datenzeichen sind immer Version 0', async () => {
  const { programLength, decodeAddressAny } = await import('../src/lib/core/address.ts');
  for (let v = 1; v <= 15; v++) assert.notEqual(programLength(v), 19, `Version ${v}`);
  const { bech32m } = await import('@scure/base');
  const text = bech32m.encode('ysr', [2, ...bech32m.toWords(new Uint8Array(19).fill(0xab))]);
  assert.equal(decodeAddressAny(text).version, 0, 'genau deshalb verboten: so gelesen ist es Version 0');
});
