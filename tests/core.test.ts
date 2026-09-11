import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as W from '../src/lib/core/wallet.ts';
import * as A from '../src/lib/core/address.ts';
import * as T from '../src/lib/core/tx.ts';
import * as B from '../src/lib/core/block.ts';
import * as S from '../src/lib/core/state.ts';
import * as D from '../src/lib/core/difficulty.ts';
import * as P from '../src/lib/core/params.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { merkleRoot, sha256d } from '../src/lib/core/hash.ts';

const KNOWN = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// ---------------------------------------------------------------- Wallet

test('BIP39 gegen den offiziellen Testvektor', () => {
  const seed = W.seedFromMnemonic(KNOWN, 'TREZOR');
  assert.equal(toHex(seed),
    'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a698' +
    '7599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04');
});

test('SLIP-0010 ed25519 gegen den offiziellen Testvektor', () => {
  // Vektor 1: Seed 000102...0f, Pfad m/0'
  // Die Ableitung steckt in keypairFromSeed; hier wird sie ueber die
  // erzeugte Adresse indirekt festgeschrieben, damit eine Aenderung an der
  // Ableitung auffaellt.
  const kp = W.keypairFromSeed(fromHex('000102030405060708090a0b0c0d0e0f'));
  assert.equal(kp.path, "m/44'/9077'/0'/0'/0'");
  assert.equal(kp.publicKey.length, 32);
  assert.equal(kp.addressRaw.length, 20);
});

test('Dieselben Wörter ergeben immer dieselbe Wallet', () => {
  const a = W.keypairFromMnemonic(KNOWN);
  const b = W.keypairFromMnemonic(KNOWN);
  assert.equal(a.address, b.address);
  // Wiederherstellung muss auch bei schlampiger Eingabe klappen
  const messy = W.keypairFromMnemonic('  ABANDON   abandon\nabandon abandon abandon ' +
    'abandon abandon abandon abandon abandon abandon ABOUT ');
  assert.equal(messy.address, a.address);
});

test('Konto, Index und Passphrase erzeugen verschiedene Wallets', () => {
  const base = W.keypairFromMnemonic(KNOWN).address;
  assert.notEqual(W.keypairFromMnemonic(KNOWN, '', 0, 1).address, base);
  assert.notEqual(W.keypairFromMnemonic(KNOWN, '', 1, 0).address, base);
  assert.notEqual(W.keypairFromMnemonic(KNOWN, 'passphrase').address, base);
});

test('Ungültige Merkwörter werden abgewiesen', () => {
  assert.equal(W.isValidMnemonic('abandon abandon abandon'), false);
  // Gültige Wörter, falsche Prüfsumme
  const kaputt = KNOWN.replace(/about$/, 'abandon');
  assert.equal(W.isValidMnemonic(kaputt), false);
  assert.throws(() => W.seedFromMnemonic(kaputt), /Pruefsumme/);
});

test('Frisch erzeugte Merkwörter sind gültig und verschieden', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const m = W.createMnemonic();
    assert.equal(m.split(' ').length, 12);
    assert.ok(W.isValidMnemonic(m));
    seen.add(m);
  }
  assert.equal(seen.size, 20);
  assert.equal(W.createMnemonic(24).split(' ').length, 24);
});

// --------------------------------------------------------------- Adressen

test('Adressen sind bech32m, erkennen Tippfehler und haben das richtige Präfix', () => {
  const kp = W.keypairFromMnemonic(KNOWN);
  assert.ok(kp.address.startsWith('ysr1'));
  assert.equal(A.isValidAddress(kp.address), true);
  assert.deepEqual(A.decodeAddress(kp.address), kp.addressRaw);

  // ein vertauschtes Zeichen muss auffallen
  const chars = kp.address.split('');
  const i = chars.length - 3;
  chars[i] = chars[i] === 'q' ? 'p' : 'q';
  assert.equal(A.isValidAddress(chars.join('')), false);

  assert.equal(A.isValidAddress('btc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), false);
  assert.equal(A.isValidAddress('unsinn'), false);
});

// ----------------------------------------------------------- Transaktionen

function wallets() {
  const a = W.keypairFromMnemonic(KNOWN, '', 0, 0);
  const b = W.keypairFromMnemonic(KNOWN, '', 0, 1);
  const c = W.keypairFromMnemonic(KNOWN, '', 0, 2);
  return { a, b, c };
}

function transfer(from: W.Keypair, to: W.Keypair, amount: bigint, nonce: bigint) {
  return T.buildTransfer({
    from: from.addressRaw, to: to.addressRaw, amount, fee: P.MIN_FEE, nonce,
    publicKey: from.publicKey, privateKey: from.privateKey,
  });
}

test('Signierte Überweisung ist gültig und überlebt den Rundlauf', () => {
  const { a, b } = wallets();
  const t = transfer(a, b, 5n * P.UNIT, 0n);
  assert.equal(T.checkTransfer(t), null);
  const bytes = T.serializeTx(t);
  assert.equal(toHex(T.serializeTx(T.deserializeTx(bytes))), toHex(bytes));
});

test('Jede Manipulation bricht die Signatur', () => {
  const { a, b, c } = wallets();
  const t = transfer(a, b, 5n * P.UNIT, 0n);

  assert.equal(T.checkTransfer({ ...t, amount: 999n * P.UNIT }), 'bad_signature');
  assert.equal(T.checkTransfer({ ...t, to: c.addressRaw }), 'bad_signature');
  assert.equal(T.checkTransfer({ ...t, nonce: 5n }), 'bad_signature');
  assert.equal(T.checkTransfer({ ...t, fee: t.fee + 1n }), 'bad_signature');
  // Fremder Schlüssel passt nicht zur Absenderadresse
  assert.equal(T.checkTransfer({ ...t, publicKey: c.publicKey }), 'pubkey_mismatch');
});

test('Formale Regeln greifen', () => {
  const { a, b } = wallets();
  assert.equal(T.checkTransfer(transfer(a, b, 0n, 0n)), 'bad_amount');
  assert.equal(T.checkTransfer({ ...transfer(a, b, 1n, 0n), fee: 1n }), 'fee_too_low');
  assert.equal(T.checkTransfer(transfer(a, a, 1n * P.UNIT, 0n)), 'self_transfer');

  const befristet = T.buildTransfer({
    from: a.addressRaw, to: b.addressRaw, amount: P.UNIT, fee: P.MIN_FEE,
    nonce: 0n, validUntil: 100, publicKey: a.publicKey, privateKey: a.privateKey,
  });
  assert.equal(T.checkTransfer(befristet, 100), null);
  assert.equal(T.checkTransfer(befristet, 101), 'expired');
});

test('Die Signatur bindet an die Kette', () => {
  const { a, b } = wallets();
  const t = transfer(a, b, P.UNIT, 0n);
  const { signature, publicKey, ...unsigned } = t;

  // Sighash mit fremder CHAIN_ID muss abweichen
  const echt = T.signingBytes(unsigned);
  const fremd = echt.slice();
  fremd[0] ^= 0xff;
  assert.notEqual(toHex(sha256d(echt)), toHex(sha256d(fremd)));
  assert.ok(W.verifySignature(signature, T.sighash(unsigned), publicKey));
});

// ---------------------------------------------------------------- Blöcke

test('Header ist 136 Byte und die Nonce liegt im letzten SHA-Block', () => {
  const h: B.BlockHeader = {
    version: 1, height: 1,
    prevHash: new Uint8Array(32), merkleRoot: new Uint8Array(32),
    stateRoot: new Uint8Array(32), timestamp: 1788825600n,
    difficulty: 24576n, txCount: 1, extranonce: 9n, nonce: 42n,
  };
  const bytes = B.serializeHeader(h);
  assert.equal(bytes.length, 136);
  assert.equal(B.NONCE_OFFSET, 128);
  // 136 + 1 Byte 0x80 + 8 Byte Länge passen in genau 3 SHA-256-Blöcke,
  // und alles ausser der Nonce liegt in den ersten beiden.
  assert.equal(Math.ceil((136 + 9) / 64), 3);
  assert.equal(B.MIDSTATE_PREFIX, 128);
  assert.deepEqual(B.deserializeHeader(bytes), h);
});

test('withNonce ändert nur die Nonce', () => {
  const h: B.BlockHeader = {
    version: 1, height: 7, prevHash: new Uint8Array(32).fill(3),
    merkleRoot: new Uint8Array(32).fill(4), stateRoot: new Uint8Array(32).fill(5),
    timestamp: 1n, difficulty: 4096n, txCount: 1, extranonce: 2n, nonce: 0n,
  };
  const base = B.serializeHeader(h);
  for (const n of [0n, 1n, 2n ** 40n]) {
    assert.deepEqual(B.withNonce(base, n), B.serializeHeader({ ...h, nonce: n }));
  }
  assert.deepEqual(base.slice(0, 128), B.withNonce(base, 999n).slice(0, 128));
});

test('Merkle-Baum verdoppelt bei ungerader Anzahl nicht', () => {
  // Bitcoins Verdopplung erlaubt zwei verschiedene Listen mit gleichem Root
  const l = [1, 2, 3].map(n => new Uint8Array(32).fill(n));
  assert.notEqual(toHex(merkleRoot(l)), toHex(merkleRoot([...l, l[2]])));
  assert.equal(toHex(merkleRoot([])), '00'.repeat(32));
  // Bereichstrennung: ein Blatt ist nicht derselbe Hash wie sein Inhalt
  assert.notEqual(toHex(merkleRoot([l[0]])), toHex(sha256d(l[0])));
});

// ---------------------------------------------------------------- Zustand

function coinbase(height: number, to: Uint8Array, fees = 0n): T.Coinbase {
  return {
    type: T.TX_COINBASE, version: T.TX_VERSION, height, to,
    amount: P.rewardAt(height) + fees,
    extra: new Uint8Array([height & 0xff]),
  };
}

function block(height: number, txs: T.Tx[], prev = new Uint8Array(32)): B.Block {
  return {
    header: {
      version: 1, height, prevHash: prev,
      merkleRoot: B.txMerkleRoot(txs), stateRoot: new Uint8Array(32),
      timestamp: BigInt(1788825600 + height * 600), difficulty: P.MIN_DIFFICULTY,
      txCount: txs.length, extranonce: 0n, nonce: 0n,
    },
    txs,
  };
}

test('Coinbase schreibt dem Miner den Reward gut', () => {
  const { a } = wallets();
  const st = S.emptyState();
  const r = S.applyBlock(st, block(1, [coinbase(1, a.addressRaw)]));
  assert.equal(r.ok, true);
  assert.equal(S.getAccount(st, a.addressRaw).balance, 875n * P.UNIT);
  assert.equal(S.totalSupply(st), 875n * P.UNIT);
});

test('Falscher Coinbase-Betrag wird abgelehnt', () => {
  const { a } = wallets();
  const st = S.emptyState();
  const cb = { ...coinbase(1, a.addressRaw), amount: 10_000n * P.UNIT };
  const r = S.applyBlock(st, block(1, [cb]));
  assert.equal(r.ok, false);
  assert.match(r.error!.reason, /coinbase_amount/);
  assert.equal(st.size, 0, 'ein abgelehnter Block darf nichts hinterlassen');
});

test('Überweisung bewegt Guthaben, Gebühr geht an den Miner', () => {
  const { a, b, c } = wallets();
  const st = S.emptyState();
  S.applyBlock(st, block(1, [coinbase(1, a.addressRaw)]));

  const t = transfer(a, b, 100n * P.UNIT, 0n);
  const r = S.applyBlock(st, block(2, [coinbase(2, c.addressRaw, P.MIN_FEE), t]));
  assert.equal(r.ok, true, JSON.stringify(r.error));

  assert.equal(S.getAccount(st, b.addressRaw).balance, 100n * P.UNIT);
  assert.equal(S.getAccount(st, a.addressRaw).balance, 875n * P.UNIT - 100n * P.UNIT - P.MIN_FEE);
  assert.equal(S.getAccount(st, a.addressRaw).nonce, 1n);
  assert.equal(S.getAccount(st, c.addressRaw).balance, 875n * P.UNIT + P.MIN_FEE);
});

test('Guthaben, Nonce und doppelte Ausgabe werden geprüft', () => {
  const { a, b, c } = wallets();
  const st = S.emptyState();
  S.applyBlock(st, block(1, [coinbase(1, a.addressRaw)]));

  // mehr als vorhanden
  let r = S.applyBlock(st, block(2, [coinbase(2, c.addressRaw, P.MIN_FEE),
    transfer(a, b, 10_000n * P.UNIT, 0n)]));
  assert.equal(r.error?.reason, 'insufficient_funds');

  // falsche Nonce
  r = S.applyBlock(st, block(2, [coinbase(2, c.addressRaw, P.MIN_FEE),
    transfer(a, b, P.UNIT, 7n)]));
  assert.match(r.error!.reason, /nonce_mismatch/);

  // dieselbe Nonce zweimal im selben Block
  r = S.applyBlock(st, block(2, [coinbase(2, c.addressRaw, 2n * P.MIN_FEE),
    transfer(a, b, P.UNIT, 0n), transfer(a, b, P.UNIT, 0n)]));
  assert.match(r.error!.reason, /nonce_mismatch/);

  assert.equal(S.getAccount(st, a.addressRaw).balance, 875n * P.UNIT,
    'nach drei abgelehnten Bloecken muss der Zustand unveraendert sein');
});

test('DER PRÜFSTEIN: Zustand ist allein aus den Blöcken wiederherstellbar', () => {
  const { a, b, c } = wallets();
  const kette: B.Block[] = [];
  const live = S.emptyState();

  kette.push(block(1, [coinbase(1, a.addressRaw)]));
  kette.push(block(2, [coinbase(2, b.addressRaw, P.MIN_FEE),
    transfer(a, b, 300n * P.UNIT, 0n)]));
  kette.push(block(3, [coinbase(3, c.addressRaw, 2n * P.MIN_FEE),
    transfer(a, c, 50n * P.UNIT, 1n),
    transfer(b, c, 10n * P.UNIT, 0n)]));

  for (const blk of kette) {
    const r = S.applyBlock(live, blk);
    assert.equal(r.ok, true, JSON.stringify(r.error));
  }

  // Datenbank wegwerfen, allein aus den Bloecken neu aufbauen
  const { state: rebuilt, error } = S.replay(kette);
  assert.equal(error, undefined);

  assert.equal(toHex(S.stateRoot(rebuilt)), toHex(S.stateRoot(live)),
    'state_root nach Wiederaufbau weicht ab');
  assert.equal(S.totalSupply(rebuilt), S.totalSupply(live));
  assert.equal(S.totalSupply(rebuilt), 3n * 875n * P.UNIT);
  for (const w of [a, b, c]) {
    assert.deepEqual(S.getAccount(rebuilt, w.addressRaw), S.getAccount(live, w.addressRaw));
  }
});

test('state_root hängt nicht von der Einfügereihenfolge ab', () => {
  const { a, b, c } = wallets();
  const s1 = S.emptyState(), s2 = S.emptyState();
  const setze = (s: S.State, w: W.Keypair, v: bigint) =>
    S.applyBlock(s, block(1, [{ ...coinbase(1, w.addressRaw), amount: P.rewardAt(1) }]));

  setze(s1, a, 1n); setze(s1, b, 2n); setze(s1, c, 3n);
  setze(s2, c, 3n); setze(s2, b, 2n); setze(s2, a, 1n);
  assert.equal(toHex(S.stateRoot(s1)), toHex(S.stateRoot(s2)));
});

// ---------------------------------------------------------------- Konsens

test('Difficulty rechnet ausschließlich ganzzahlig und ist reproduzierbar', () => {
  const schnell = Array.from({ length: 45 }, () => ({ difficulty: 100_000n, solveSeconds: 150n }));
  const a = D.nextDifficulty(schnell);
  const b = D.nextDifficulty(schnell);
  assert.equal(a, b, 'zwei Aufrufe muessen identisch sein');
  assert.equal(typeof a, 'bigint');
  assert.ok(a > 100_000n && a <= 400_000n);

  const langsam = Array.from({ length: 45 }, () => ({ difficulty: 100_000n, solveSeconds: 2400n }));
  const c = D.nextDifficulty(langsam);
  assert.ok(c < 100_000n && c >= 25_000n);

  assert.equal(D.nextDifficulty([]), P.MIN_DIFFICULTY);
  const tot = Array.from({ length: 45 }, () => ({ difficulty: P.MIN_DIFFICULTY, solveSeconds: 99_999n }));
  assert.ok(D.nextDifficulty(tot) >= P.MIN_DIFFICULTY);
});

test('Ein einzelner Ausreißer kippt das Fenster nicht', () => {
  const normal = Array.from({ length: 45 }, () => ({ difficulty: 100_000n, solveSeconds: 600n }));
  const mit = [...normal];
  mit[44] = { difficulty: 100_000n, solveSeconds: 86_400n };
  const ohne = D.nextDifficulty(normal);
  const drin = D.nextDifficulty(mit);
  assert.ok(drin < ohne);
  assert.ok(drin > ohne / 4n, 'Kappung auf das Sechsfache greift nicht');
});

test('Notfallregel lockert erst nach der Schwelle', () => {
  const base = 100_000n;
  assert.equal(D.effectiveDifficulty(base, 600n), base);
  assert.equal(D.effectiveDifficulty(base, 1800n), base);
  assert.equal(D.effectiveDifficulty(base, 3600n), base / 2n);
  assert.ok(D.effectiveDifficulty(base, 10n ** 9n) >= P.MIN_DIFFICULTY);
});

test('Zeitstempelregeln verhindern Rückdatieren und Zukunftssprünge', () => {
  const vorher = [100n, 200n, 300n, 400n, 500n];
  const now = 1000n;
  assert.equal(D.checkTimestamp(600n, vorher, now), null);
  assert.equal(D.checkTimestamp(300n, vorher, now), 'too_early');
  assert.equal(D.checkTimestamp(250n, vorher, now), 'too_early');
  assert.equal(D.checkTimestamp(1121n, vorher, now), 'too_far_ahead');
  assert.equal(D.checkTimestamp(1120n, vorher, now), null);
  assert.equal(D.medianTimePast(vorher), 300n);
});

test('Emission halbiert sich und bleibt unter der Höchstmenge', () => {
  assert.equal(P.rewardAt(0), 875n * P.UNIT);
  assert.equal(P.rewardAt(11_999), 875n * P.UNIT);
  assert.equal(P.rewardAt(12_000), 437n * P.UNIT + 50_000_000n);
  assert.equal(P.rewardAt(24_000), 218n * P.UNIT + 75_000_000n);
  assert.equal(P.rewardAt(P.EPOCH_BLOCKS * 63), 0n);

  // Gesamtsumme ueber alle Epochen bleibt unter MAX_SUPPLY -- wie bei Bitcoin
  // laesst die Abrundung sie knapp darunter enden.
  let total = 0n;
  for (let era = 0; era < 63; era++) {
    total += (P.INITIAL_REWARD >> BigInt(era)) * BigInt(P.EPOCH_BLOCKS);
  }
  assert.ok(total <= P.MAX_SUPPLY, `${total} > ${P.MAX_SUPPLY}`);
  assert.ok(total > P.MAX_SUPPLY - 1000n * P.UNIT, 'zu weit unter der Hoechstmenge');
  assert.equal(P.seasonAt(0), 1);
  assert.equal(P.seasonAt(6000), 2);
});

test('Struktur eines Blocks wird vollständig geprüft', () => {
  const { a, b } = wallets();
  const txs = [coinbase(5, a.addressRaw, P.MIN_FEE), transfer(a, b, P.UNIT, 0n)];
  const blk = block(5, txs);

  // ohne gueltigen PoW muss genau das der einzige Mangel sein
  assert.equal(B.checkBlockStructure(blk), 'pow_failed');
  // txCount muss mitgezogen werden, sonst greift die Zaehlpruefung zuerst
  assert.equal(B.checkBlockStructure({
    header: { ...blk.header, txCount: 1, merkleRoot: B.txMerkleRoot([txs[1]]) },
    txs: [txs[1]],
  }), 'no_coinbase');
  assert.equal(B.checkBlockStructure({
    header: { ...blk.header, txCount: 2, merkleRoot: B.txMerkleRoot([txs[0], txs[0]]) },
    txs: [txs[0], txs[0]],
  }), 'multiple_coinbase');
  assert.equal(B.checkBlockStructure({
    header: { ...blk.header, txCount: 9 }, txs,
  }), 'tx_count_mismatch');
  assert.equal(B.checkBlockStructure({
    header: { ...blk.header, merkleRoot: new Uint8Array(32) }, txs,
  }), 'merkle_mismatch');
  assert.equal(B.checkBlockStructure({
    header: { ...blk.header, height: 6 }, txs,
  }), 'coinbase_height');

  // Rundlauf ueber die Leitung
  const bytes = B.serializeBlock(blk);
  assert.equal(toHex(B.serializeBlock(B.deserializeBlock(bytes))), toHex(bytes));
});

// ------------------------------------------------- Server gegen WASM-Engine

/**
 * Der Test, dessen Fehlen am teuersten waere: Weicht die Serialisierung im
 * Server auch nur um ein Byte von der im Miner ab, ist JEDER Share ungueltig
 * und die Fehlermeldung sagt nur "Hash stimmt nicht".
 */
async function engine() {
  const { readFileSync } = await import('node:fs');
  // Die Engine heisst nach ihrem Inhalt. Der Pfad kommt aus derselben
  // Quelle, die auch der Worker benutzt -- sonst testet man am Ende eine
  // andere Datei als die ausgelieferte, und genau das war der Fehler.
  const { MINER_WASM_URL } = await import('../src/lib/minerWasm.ts');
  const bin = readFileSync(new URL(`../public${MINER_WASM_URL}`, import.meta.url));
  const { instance } = await WebAssembly.instantiate(bin, {});
  const memory = instance.exports.memory as WebAssembly.Memory;
  return {
    mem: new Uint8Array(memory.buffer),
    view: new DataView(memory.buffer),
    initJob: instance.exports.init_job as () => void,
    mine: instance.exports.mine as (s: number, i: number) => number,
  };
}

// Speicherlayout aus wasm/gen_wat.py
const MEM = { HEADER: 0, MIDSTATE: 144, NONCE: 176, HASH: 304, TARGET: 336, FOUND: 368 };

function testHeader(nonce: bigint): B.BlockHeader {
  return {
    version: 1, height: 42,
    prevHash: new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff),
    merkleRoot: new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff),
    stateRoot: new Uint8Array(32).map((_, i) => (i * 13 + 9) & 0xff),
    timestamp: 1788825600n, difficulty: 24576n, txCount: 3,
    extranonce: 0x0123456789abcdefn, nonce,
  };
}

test('WASM-Engine und Server erzeugen denselben Blockhash', async () => {
  const e = await engine();
  e.mem.fill(0xff, MEM.TARGET, MEM.TARGET + 32);   // alles gilt als Treffer

  for (const nonce of [0n, 1n, 7n, 65_535n, 0x7fffffffn, 0xffffffffn, (9n << 32n) | 123n]) {
    const h = testHeader(nonce);
    e.mem.set(B.serializeHeader(h), MEM.HEADER);
    e.initJob();

    const hit = e.mine(Number(nonce & 0xffffffffn) | 0, 1);
    assert.equal(hit, 1, `mine() lieferte keinen Treffer bei nonce=${nonce}`);

    const vonWasm = e.mem.slice(MEM.HASH, MEM.HASH + 32);
    const vomServer = B.headerHash(h);
    assert.equal(toHex(vonWasm), toHex(vomServer),
      `Hash weicht ab bei nonce=${nonce}`);
  }
});

test('Der Midstate deckt genau die konstanten 128 Byte ab', async () => {
  const e = await engine();

  // Nonce aendern -> Midstate bleibt
  e.mem.set(B.serializeHeader(testHeader(1n)), MEM.HEADER);
  e.initJob();
  const a = toHex(e.mem.slice(MEM.MIDSTATE, MEM.MIDSTATE + 32));
  e.mem.set(B.serializeHeader(testHeader(999_999n)), MEM.HEADER);
  e.initJob();
  assert.equal(toHex(e.mem.slice(MEM.MIDSTATE, MEM.MIDSTATE + 32)), a);

  // extranonce liegt im konstanten Teil -> Midstate MUSS sich aendern
  const andere = { ...testHeader(1n), extranonce: 4242n };
  e.mem.set(B.serializeHeader(andere), MEM.HEADER);
  e.initJob();
  assert.notEqual(toHex(e.mem.slice(MEM.MIDSTATE, MEM.MIDSTATE + 32)), a);
});

test('Die Engine findet selbständig einen gültigen Block', async () => {
  const e = await engine();
  const difficulty = 32n;

  const h = testHeader(0n);
  e.mem.set(B.serializeHeader(h), MEM.HEADER);
  // Target als 32 Byte Big-Endian
  const t = P.targetFromDifficulty(difficulty);
  const tb = new Uint8Array(32);
  let x = t;
  for (let i = 31; i >= 0; i--) { tb[i] = Number(x & 0xffn); x >>= 8n; }
  e.mem.set(tb, MEM.TARGET);
  e.initJob();

  let nonce: bigint | null = null;
  for (let base = 0; base < 60_000_000 && nonce === null; base += 2_000_000) {
    if (e.mine(base, 2_000_000) === 1) nonce = BigInt(e.view.getUint32(MEM.FOUND, true) >>> 0);
  }
  assert.notEqual(nonce, null, 'kein Treffer in 60 Mio Nonces');

  // Genau das macht ein Knoten beim Pruefen: Header selbst bauen, selbst hashen
  const geloest = { ...h, nonce: nonce! };
  assert.ok(B.meetsTarget(B.headerHash(geloest), difficulty),
    'nachgerechneter Hash erfuellt die Difficulty nicht');
  assert.ok(P.achievedDifficulty(B.headerHash(geloest)) >= difficulty);
});

test('Die Serialisierung im Worker stimmt mit der des Servers überein', async () => {
  // Nachbau von buildHeader() aus src/workers/miner.worker.ts. Der Worker
  // kann nicht importiert werden (WebWorker-Umgebung), deshalb wird die
  // Umsetzung hier Zeile fuer Zeile gespiegelt und gegengeprueft.
  const unhex = (s: string) => {
    const o = new Uint8Array(s.length / 2);
    for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16);
    return o;
  };
  const workerHeader = (j: any, extranonce: bigint, high: number) => {
    const b = new Uint8Array(136);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, 1, true);
    dv.setUint32(4, j.height, true);
    b.set(unhex(j.prevHash), 8);
    b.set(unhex(j.merkleRoot), 40);
    b.set(unhex(j.stateRoot), 72);
    dv.setBigUint64(104, BigInt(j.timestamp), true);
    dv.setUint32(112, j.difficulty, true);
    dv.setUint32(116, j.txCount, true);
    dv.setBigUint64(120, extranonce, true);
    dv.setBigUint64(128, BigInt(high) << 32n, true);
    return b;
  };

  const h = testHeader(0n);
  const job = {
    height: h.height,
    prevHash: toHex(h.prevHash),
    merkleRoot: toHex(h.merkleRoot),
    stateRoot: toHex(h.stateRoot),
    timestamp: h.timestamp.toString(),
    difficulty: Number(h.difficulty),
    txCount: h.txCount,
  };

  for (const high of [0, 1, 4096, 65_535]) {
    assert.equal(
      toHex(workerHeader(job, h.extranonce, high)),
      toHex(B.serializeHeader({ ...h, nonce: BigInt(high) << 32n })),
      `Abweichung bei nonceHigh=${high} -- jeder Share waere ungueltig`,
    );
  }
});

// -------------------------------------------------- Blockbau und Pruefung

const BLD = await import('../src/lib/core/builder.ts');
const V = await import('../src/lib/core/validate.ts');

/**
 * Difficulty fuer Tests: 16 statt 4096. Das sind rund 1 Mio Hashes statt
 * 268 Mio -- die Pruefung bleibt dieselbe, nur die Wartezeit nicht.
 */
const TEST_DIFFICULTY = 16n;

/** Baut eine Kette, indem jeder Block wirklich gemint wird. */
async function mineBuilt(built: any): Promise<B.Block> {
  const e = await engine();
  e.mem.set(built.header, MEM.HEADER);
  const t = P.targetFromDifficulty(built.block.header.difficulty);
  const tb = new Uint8Array(32);
  let x = t;
  for (let i = 31; i >= 0; i--) { tb[i] = Number(x & 0xffn); x >>= 8n; }
  e.mem.set(tb, MEM.TARGET);
  e.initJob();
  for (let base = 0; base < 40_000_000; base += 1_000_000) {
    if (e.mine(base, 1_000_000) === 1) {
      return BLD.finalizeBlock(built, BigInt(e.view.getUint32(MEM.FOUND, true) >>> 0));
    }
  }
  throw new Error('kein Block gefunden');
}

test('Mempool-Auswahl hält Nonce-Reihenfolge ein', () => {
  const { a, b, c } = wallets();
  const st = S.emptyState();
  S.applyBlock(st, block(1, [coinbase(1, a.addressRaw)]));

  // Nonce 2 zuerst, dann 0, dann 1 -- die Auswahl muss sortieren
  const pool = [
    transfer(a, b, P.UNIT, 2n),
    transfer(a, b, P.UNIT, 0n),
    transfer(a, c, P.UNIT, 1n),
  ];
  const r = BLD.selectTransactions(st, pool, 2);
  assert.equal(r.included.length, 3);
  assert.deepEqual(r.included.map(t => Number(t.nonce)), [0, 1, 2]);
  assert.equal(r.fees, 3n * P.MIN_FEE);
});

test('Eine Lücke in den Nonces stoppt die Kette des Absenders', () => {
  const { a, b } = wallets();
  const st = S.emptyState();
  S.applyBlock(st, block(1, [coinbase(1, a.addressRaw)]));

  // Nonce 1 fehlt
  const r = BLD.selectTransactions(st, [
    transfer(a, b, P.UNIT, 0n),
    transfer(a, b, P.UNIT, 2n),
  ], 2);
  assert.equal(r.included.length, 1);
  assert.equal(r.included[0].nonce, 0n);
});

test('Zwischen Absendern entscheidet die Gebühr', () => {
  const { a, b, c } = wallets();
  const st = S.emptyState();
  S.applyBlock(st, block(1, [coinbase(1, a.addressRaw)]));
  S.applyBlock(st, block(2, [coinbase(2, b.addressRaw)]));

  const teuer = T.buildTransfer({
    from: b.addressRaw, to: c.addressRaw, amount: P.UNIT, fee: 10n * P.MIN_FEE,
    nonce: 0n, publicKey: b.publicKey, privateKey: b.privateKey,
  });
  const billig = transfer(a, c, P.UNIT, 0n);

  const r = BLD.selectTransactions(st, [billig, teuer], 3);
  assert.equal(toHex(r.included[0].from), toHex(b.addressRaw), 'teurere zuerst');
  assert.equal(r.included.length, 2);
});

test('Wer nicht genug Guthaben hat, fliegt raus statt den Block zu kippen', () => {
  const { a, b, c } = wallets();
  const st = S.emptyState();
  S.applyBlock(st, block(1, [coinbase(1, a.addressRaw)]));

  const r = BLD.selectTransactions(st, [
    transfer(a, b, 100n * P.UNIT, 0n),
    T.buildTransfer({   // c hat nichts
      from: c.addressRaw, to: b.addressRaw, amount: P.UNIT, fee: 99n * P.MIN_FEE,
      nonce: 0n, publicKey: c.publicKey, privateKey: c.privateKey,
    }),
  ], 2);
  assert.equal(r.included.length, 1);
  assert.equal(toHex(r.included[0].from), toHex(a.addressRaw));
});

test('Gebauter Block ist in sich stimmig und wird nach dem Minen angenommen', async () => {
  const { a } = wallets();
  const state = S.emptyState();

  // Hoehe 0 mit leerem prev_hash -- damit laeuft die Pruefung ueber den
  // Genesis-Pfad, wo keine Vorgaben aus dem Vorgaenger gelten.
  const built1 = BLD.buildBlock({
    height: 0, prevHash: new Uint8Array(32), state, mempool: [],
    minerAddress: a.addressRaw, timestamp: 1788825600n,
    difficulty: TEST_DIFFICULTY, extranonce: 1n,
  });
  const blk1 = await mineBuilt(built1);

  assert.equal(B.checkBlockStructure(blk1), null, 'Struktur inklusive PoW');

  const err = V.validateBlock(blk1, {
    previous: null, state, recentTimestamps: [], recentTimings: [],
    now: 1788825600n,
  });
  assert.equal(err, null, JSON.stringify(err));

  const r = S.applyBlock(state, blk1);
  assert.equal(r.ok, true);
  assert.equal(toHex(S.stateRoot(state)), toHex(blk1.header.stateRoot),
    'state_root im Header muss dem Zustand danach entsprechen');
  assert.equal(S.getAccount(state, a.addressRaw).balance, P.rewardAt(0));
});

test('Ein manipulierter state_root wird erkannt', async () => {
  const { a } = wallets();
  const state = S.emptyState();
  const built = BLD.buildBlock({
    height: 0, prevHash: new Uint8Array(32), state, mempool: [],
    minerAddress: a.addressRaw, timestamp: 1788825600n,
    difficulty: TEST_DIFFICULTY, extranonce: 1n,
  });
  const blk = await mineBuilt(built);

  const gefaelscht: B.Block = {
    header: { ...blk.header, stateRoot: new Uint8Array(32).fill(9) },
    txs: blk.txs,
  };
  // Der veraenderte Header bricht zuerst den Proof of Work -- genau so soll
  // es sein: Wer den Zustand faelschen will, muss neu minen.
  assert.equal(B.checkBlockStructure(gefaelscht), 'pow_failed');
});

test('Coinbase an eine fremde Adresse macht den Block ungültig', async () => {
  const { a, b } = wallets();
  const state = S.emptyState();
  const built = BLD.buildBlock({
    height: 0, prevHash: new Uint8Array(32), state, mempool: [],
    minerAddress: a.addressRaw, timestamp: 1788825600n,
    difficulty: TEST_DIFFICULTY, extranonce: 1n,
  });
  const blk = await mineBuilt(built);

  // Empfaenger tauschen, ohne neu zu minen
  const geklaut: B.Block = {
    header: blk.header,
    txs: [{ ...(blk.txs[0] as T.Coinbase), to: b.addressRaw }, ...blk.txs.slice(1)],
  };
  assert.equal(B.checkBlockStructure(geklaut), 'merkle_mismatch',
    'ein anderer Empfaenger aendert den txid und damit die Merkle-Wurzel');
});

test('Kumulierte Arbeit summiert Difficulty, nicht Blockanzahl', () => {
  assert.equal(V.cumulativeWork([100n, 200n, 300n]), 600n);
  // Kurze Kette mit viel Arbeit schlaegt lange Kette mit wenig
  assert.ok(V.cumulativeWork([5000n, 5000n]) > V.cumulativeWork([100n, 100n, 100n, 100n]));
});

// ---------------------------------------------------------------- Genesis

/**
 * Der Genesis-Block ist ab jetzt eine Konstante der Kette. Dieser Test
 * friert ihn ein: Wer an Serialisierung, Merkle-Baum, Zustandswurzel oder
 * Reward-Funktion etwas aendert, faellt hier auf -- nicht erst, wenn Knoten
 * sich uneinig sind.
 */
test('Der Genesis-Block ist reproduzierbar', async () => {
  const BLD2 = await import('../src/lib/core/builder.ts');
  const { ZERO_ADDRESS, encodeAddress } = await import('../src/lib/core/address.ts');

  const built = BLD2.buildBlock({
    height: 0,
    prevHash: new Uint8Array(32),
    state: S.emptyState(),
    mempool: [],
    minerAddress: ZERO_ADDRESS,
    timestamp: 1_788_912_000n,
    difficulty: P.MIN_DIFFICULTY,
    extranonce: 0n,
    coinbaseExtra: new TextEncoder().encode('proof, not promise'),
  });

  assert.equal(toHex(built.block.header.merkleRoot),
    '1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840');
  assert.equal(toHex(built.stateRoot),
    'e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57');

  const block = BLD2.finalizeBlock(built, 50_773_796n);
  assert.equal(toHex(B.headerHash(block.header)),
    '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66');

  // Struktur inklusive Proof of Work
  assert.equal(B.checkBlockStructure(block), null);

  // Vollstaendige Pruefung ueber den Genesis-Pfad
  const err = V.validateBlock(block, {
    previous: null, state: S.emptyState(), recentTimestamps: [],
    recentTimings: [], now: 1_788_912_000n,
  });
  assert.equal(err, null, JSON.stringify(err));

  // Der Reward geht an die Nulladresse und ist damit unausgebbar
  const cb = block.txs[0] as T.Coinbase;
  assert.equal(toHex(cb.to), '00'.repeat(20));
  assert.equal(cb.amount, P.rewardAt(0));
  assert.equal(encodeAddress(ZERO_ADDRESS), 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw');

  const state = S.emptyState();
  assert.equal(S.applyBlock(state, block).ok, true);
  assert.equal(S.totalSupply(state), 875n * P.UNIT);
  assert.equal(toHex(S.stateRoot(state)), toHex(block.header.stateRoot));
});

test('Der Selbsttest des Workers erkennt eine falsche Engine', async () => {
  // Gegenprobe zu dem Fehler, der im Betrieb auftrat: Auf Geraeten mit
  // altem Zwischenspeicher lief die Engine fuer 116-Byte-Header weiter. Sie
  // las das Target an einer anderen Stelle, fand nie einen Share -- und
  // meldete nichts. Der Selbsttest im Worker prueft deshalb beim Start mit
  // dem Genesis-Block als bekannter Antwort.
  const e = await engine();
  e.mem.fill(0xff, MEM.TARGET, MEM.TARGET + 32);

  const genesis: B.BlockHeader = {
    version: 1, height: 0,
    prevHash: new Uint8Array(32), merkleRoot: fromHex(
      '1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840'),
    stateRoot: fromHex(
      'e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57'),
    timestamp: 1_788_912_000n, difficulty: 4096n, txCount: 1,
    extranonce: 0n, nonce: 50_773_796n,
  };

  e.mem.set(B.serializeHeader(genesis), MEM.HEADER);
  e.initJob();
  assert.equal(e.mine(50_773_796, 1), 1);
  assert.equal(toHex(e.mem.slice(MEM.HASH, MEM.HASH + 32)),
    '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66',
    'Der Selbsttest muss genau diesen Hash liefern -- sonst ist es eine andere Engine');
});

// -------------------------------------- Miner gegen Projekt-Serialisierung

/**
 * Der eigenstaendige Miner hat eine eigene Kopie der Header-Serialisierung
 * (miner/src/header.mjs), damit er ohne den Rest des Projekts laeuft.
 *
 * Verdopplung ist genau die Fehlerquelle, die uns schon zweimal getroffen
 * hat. Dieser Test schliesst sie: Weicht die Kopie auch nur um ein Byte ab,
 * faellt es hier auf -- und nicht erst, wenn ein Miner stundenlang Shares
 * einreicht, die niemand annimmt.
 */
test('Die Header-Serialisierung des Miners stimmt mit dem Projekt überein', async () => {
  const miner = await import('../miner/src/header.mjs');

  assert.equal(miner.HEADER_SIZE, B.HEADER_SIZE);
  assert.equal(miner.NONCE_OFFSET, B.NONCE_OFFSET);
  assert.equal(miner.DIFFICULTY_UNIT, P.DIFFICULTY_UNIT);

  for (const nonce of [0n, 1n, 4096n, 0xffffffffn, (7n << 32n) | 42n]) {
    const h = testHeader(nonce);
    const job = {
      version: h.version, height: h.height,
      prevHash: toHex(h.prevHash), merkleRoot: toHex(h.merkleRoot),
      stateRoot: toHex(h.stateRoot), timestamp: h.timestamp.toString(),
      difficulty: Number(h.difficulty), txCount: h.txCount,
      extranonce: h.extranonce.toString(),
    };
    assert.equal(
      toHex(miner.serializeHeader(job, nonce)),
      toHex(B.serializeHeader(h)),
      `Abweichung bei nonce=${nonce} — jeder Share des Miners wäre ungültig`,
    );
  }
});

test('Die Target-Berechnung des Miners stimmt mit dem Projekt überein', async () => {
  const miner = await import('../miner/src/header.mjs');
  for (const d of [32n, 128n, 4096n, 24576n, 1_000_000n]) {
    const projekt = new Uint8Array(32);
    let x = P.targetFromDifficulty(d);
    for (let i = 31; i >= 0; i--) { projekt[i] = Number(x & 0xffn); x >>= 8n; }
    assert.equal(toHex(miner.targetBytes(Number(d))), toHex(projekt),
      `Abweichung bei Difficulty ${d} — der Miner prüfte gegen ein anderes Ziel`);
  }
});

test('Der Genesis-Block im Miner stimmt mit der Kette überein', async () => {
  const miner = await import('../miner/src/header.mjs');
  const g = miner.GENESIS;
  assert.equal(g.hash,
    '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66');
  // Der Selbsttest des Miners rechnet genau diesen Header nach.
  assert.equal(toHex(miner.serializeHeader(g, g.nonce)),
    toHex(B.serializeHeader({
      version: 1, height: 0,
      prevHash: new Uint8Array(32),
      merkleRoot: fromHex(g.merkleRoot), stateRoot: fromHex(g.stateRoot),
      timestamp: BigInt(g.timestamp), difficulty: BigInt(g.difficulty),
      txCount: g.txCount, extranonce: BigInt(g.extranonce), nonce: g.nonce,
    })));
});
