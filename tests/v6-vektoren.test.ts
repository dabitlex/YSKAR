/**
 * Prüfung der Konsensfassung 6 ohne zweiten Menschen (docs/CONSENSUS_V6.md 14).
 *
 *   1. Feste Testvektoren (tests/fixtures/v6-vektoren.json), von einer
 *      unabhaengigen Python-Umsetzung allein aus der Spezifikation
 *      nachgerechnet: 46 von 46 Werten gleich. Hier wird festgehalten, dass
 *      der Code sie weiter genau so erzeugt.
 *   2. Fremde Referenzen: die bech32m-Referenzvektoren und RFC 8032 (Ed25519) mit
 *      ihren offiziellen Vektoren.
 *   3. Eigenschaften mit festem Startwert: Hin- und Rueckweg aller Typen,
 *      jedes veraenderte Byte macht eine signierte Ausgabe ungueltig,
 *      kein Block erzeugt Geld ausser Belohnung.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bech32m } from '@scure/base';

import * as T from '../src/lib/core/tx.ts';
import * as SC from '../src/lib/core/script.ts';
import * as S from '../src/lib/core/state.ts';
import * as PA from '../src/lib/core/params.ts';
import { txMerkleRoot, type Block } from '../src/lib/core/block.ts';
import { REGTEST_V6 } from '../src/lib/core/networks.ts';
import {
  addressFromPublicKey, rawAddressFromScript, encodeAddress, decodeAddress, HRP_MAINNET, HRP_REGTEST,
} from '../src/lib/core/address.ts';
import { sign, verifySignature } from '../src/lib/core/wallet.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { MINER_A } from './helpers/regtest.ts';

const V = JSON.parse(readFileSync(new URL('./fixtures/v6-vektoren.json', import.meta.url), 'utf8'));
const E = V.erwartet, I = V.eingaben;
const NETZ = REGTEST_V6;
const enc = new TextEncoder();
const hx = toHex;

// ------------------------------------------------------ 1. Testvektoren

const sk = (n: string) => fromHex(I.schluessel[n].geheim);
const pk = (n: string) => ed25519.getPublicKey(sk(n));
const adr = (n: string) => addressFromPublicKey(pk(n));
const multisig = SC.encodeScript(SC.multisig(2, [pk('alice'), pk('bob'), pk('carol')]));
const geheimnis = fromHex(I.skripte.htlc.geheimnis);
const htlcSkript = SC.encodeScript(SC.htlc(pk('bob'), sha256(geheimnis), pk('alice'), 100));
const ziel = (an: string) => an === 'skript:multisig' ? rawAddressFromScript(multisig) : adr(an);

test('Vektoren: Netz, Schluessel, Adressen beider Versionen', () => {
  assert.equal(I.netz.chainId, hx(NETZ.chainId));
  assert.equal(hx(sha256(enc.encode(I.netz.name))), I.netz.chainId);
  assert.equal(I.forkId, PA.FORK_ID_V6);
  for (const n of Object.keys(I.schluessel)) {
    assert.equal(hx(pk(n)), E.schluessel[n].oeffentlich, n);
    assert.equal(hx(adr(n)), E.schluessel[n].rohadresse, n);
    assert.equal(encodeAddress(adr(n), HRP_MAINNET), E.schluessel[n].textMainnet, n);
    assert.equal(encodeAddress(adr(n), HRP_REGTEST), E.schluessel[n].textRegtest, n);
  }
  assert.equal(hx(multisig), E.skripte.multisig.skript);
  assert.equal(hx(rawAddressFromScript(multisig)), E.skripte.multisig.rohadresse);
  assert.equal(encodeAddress(rawAddressFromScript(multisig), HRP_MAINNET), E.skripte.multisig.textMainnet);
  assert.equal(encodeAddress(rawAddressFromScript(multisig), HRP_REGTEST), E.skripte.multisig.textRegtest);
  assert.equal(hx(htlcSkript), E.skripte.htlc.skript);
  assert.equal(hx(sha256(geheimnis)), E.skripte.htlc.hash);
  assert.equal(encodeAddress(rawAddressFromScript(htlcSkript), HRP_MAINNET), E.skripte.htlc.textMainnet);
});

/** Leitung, txid, Rueckweg und Pruefung einer Ausgabe gegen den Vektor. */
function pruefe(t: T.Spend, e: { leitung: string; txid: string; sighash: string }, hoehe: number) {
  assert.equal(hx(T.spendSighash(t, NETZ.chainId)), e.sighash);
  assert.equal(hx(T.serializeTx(t)), e.leitung);
  assert.equal(hx(T.txid(t)), e.txid);
  const zurueck = T.deserializeTx(fromHex(e.leitung));
  assert.equal(hx(T.serializeTx(zurueck)), e.leitung, 'Rueckweg');
  assert.equal(T.checkSpend(zurueck as T.Spend, hoehe, NETZ), null);
}

test('Vektor Ueberweisung Fassung 2', () => {
  const f = I.ueberweisung;
  const t = T.buildTransfer({ chainId: NETZ.chainId, version: 2, from: adr(f.von), to: adr(f.an), amount: BigInt(f.betrag),
    fee: BigInt(f.gebuehr), nonce: BigInt(f.nonce), validFrom: f.validFrom, validUntil: f.validUntil, memo: enc.encode(f.notiz),
    publicKey: pk(f.von), privateKey: sk(f.von) });
  assert.equal(hx(t.signature), E.ueberweisung.signatur);
  pruefe(t, E.ueberweisung, 10);
});

test('Vektor Sammelzahlung: Reihenfolge nach Leitungsform, Version-0- und Version-1-Empfaenger', () => {
  const f = I.sammelzahlung;
  const t = T.buildBatch({ chainId: NETZ.chainId, from: adr(f.von),
    outputs: f.ausgaenge.map((o: { an: string; betrag: string }) => ({ to: ziel(o.an), amount: BigInt(o.betrag) })),
    fee: BigInt(f.gebuehr), nonce: BigInt(f.nonce), validFrom: f.validFrom, validUntil: f.validUntil, memo: enc.encode(f.notiz),
    publicKey: pk(f.von), privateKey: sk(f.von) });
  assert.deepEqual(t.outputs.map(o => hx(o.to)), E.sammelzahlung.reihenfolge);
  assert.equal(hx(t.signature), E.sammelzahlung.signatur);
  pruefe(t, E.sammelzahlung, 10);
  // Nach Rohform sortiert (die falsche Lesart) waere die Transaktion ungueltig.
  const roh = { ...t, outputs: [...t.outputs].sort((a, b) => (hx(a.to) < hx(b.to) ? -1 : 1)) };
  assert.notDeepEqual(roh.outputs.map(o => hx(o.to)), E.sammelzahlung.reihenfolge);
  assert.equal(T.checkBatch(roh, 10, NETZ), 'outputs_unsorted');
});

function skriptAusgabe(script: Uint8Array, f: { an: string; betrag: string; gebuehr: string; nonce: string; validFrom: number; validUntil: number; notiz: string },
  belegung: (b: SC.ScriptNode, h: Uint8Array) => SC.WitnessSlot): T.ScriptSpend {
  const u = T.unsignedScriptSpend({ script, to: ziel(f.an), amount: BigInt(f.betrag), fee: BigInt(f.gebuehr), nonce: BigInt(f.nonce),
    validFrom: f.validFrom, validUntil: f.validUntil, memo: enc.encode(f.notiz) });
  const h = T.scriptSpendSighash(u, NETZ.chainId);
  return { ...u, witness: SC.encodeWitness(SC.leaves(SC.decodeScript(script)!).map(b => belegung(b, h))) };
}
const signiere = (n: string, h: Uint8Array): SC.WitnessSlot => ({ kind: 'sig', signature: ed25519.sign(h, sk(n)) });
const pkIst = (b: SC.ScriptNode, n: string) => b.op === SC.OP_PK && hx(b.pubkey) === hx(pk(n));

test('Vektor 2-von-3: Alice und Carol unterschreiben', () => {
  const t = skriptAusgabe(multisig, I.zweiVonDrei, (b, h) => pkIst(b, 'alice') ? signiere('alice', h) : pkIst(b, 'carol') ? signiere('carol', h) : { kind: 'absent' });
  assert.equal(hx(t.witness), E.zweiVonDrei.witness);
  pruefe(t, E.zweiVonDrei, 10);
});

test('Vektor HTLC einloesen und zurueckholen -- zurueck erst ab Hoehe 100', () => {
  const ein = skriptAusgabe(htlcSkript, I.htlcEinloesen, (b, h) => pkIst(b, 'bob') ? signiere('bob', h) : b.op === SC.OP_HASH ? { kind: 'preimage', preimage: geheimnis } : { kind: 'absent' });
  assert.equal(hx(ein.witness), E.htlcEinloesen.witness);
  pruefe(ein, E.htlcEinloesen, 10);
  const zur = skriptAusgabe(htlcSkript, I.htlcZurueck, (b, h) => pkIst(b, 'alice') ? signiere('alice', h) : b.op === SC.OP_AFTER ? { kind: 'claim' } : { kind: 'absent' });
  assert.equal(hx(zur.witness), E.htlcZurueck.witness);
  pruefe(zur, E.htlcZurueck, 100);
  assert.equal(T.checkScriptSpend(zur, 99, NETZ), 'not_yet_valid');
});

test('Vektor Zustandswurzel mit Konten beider Versionen', () => {
  const st = S.emptyState();
  for (const k of I.zustand.konten) st.set(hx(ziel(k.konto)), { balance: BigInt(k.guthaben), nonce: BigInt(k.nonce) });
  assert.equal(hx(S.stateRootV6(st)), E.zustand.wurzel);
});

// --------------------------------------------------- 2. Fremde Referenzen

test('bech32m-Referenzvektoren: alle gueltigen bech32m-Zeichenketten werden gelesen, alle ungueltigen abgelehnt', () => {
  const gueltig = [
    'A1LQFN3A', 'a1lqfn3a',
    'an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6',
    'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx',
    '11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8',
    'split1checkupstagehandshakeupstreamerranterredcaperredlc445v',
    '?1v759aa',
  ];
  for (const s of gueltig) assert.doesNotThrow(() => bech32m.decode(s as `${string}1${string}`, 90), s);
  const ungueltig = [
    '\x201xj0phk', '\x7f1g6xzxy', '\x801vctc34',
    'an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4',
    'qyrz8wqd2c9m', '1qyrz8wqd2c9m', 'y1b0jsk6g', 'lt1igcx5c0', 'in1muywd', 'mm1crxm3i', 'au1s5cgom',
    'M1VUXWEZ', '16plkw9', '1p2gdwpf',
  ];
  for (const s of ungueltig) assert.throws(() => bech32m.decode(s as `${string}1${string}`, 90), undefined, JSON.stringify(s));
  // Und YSKAR-Adressen sind gewoehnliches bech32m: Die Bibliothek liest sie, ein Zeichen anders nicht.
  const a = E.skripte.multisig.textMainnet;
  assert.equal(hx(decodeAddress(a)), E.skripte.multisig.rohadresse);
  const kaputt = a.slice(0, -1) + (a.endsWith('q') ? 'p' : 'q');
  assert.throws(() => decodeAddress(kaputt));
});

test('RFC 8032: die vier Ed25519-Vektoren -- Schluessel und Signatur exakt, Pruefung gueltig', () => {
  const v = [
    ['9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', '',
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'],
    ['4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', '72',
      '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'],
    ['c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7', 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025', 'af82',
      '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a'],
    ['833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42', 'ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf',
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
      'dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b58909351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704'],
  ];
  for (const [geheim, oeff, nachricht, signatur] of v) {
    const s = fromHex(geheim), m = nachricht ? fromHex(nachricht) : new Uint8Array(0);
    assert.equal(hx(ed25519.getPublicKey(s)), oeff);
    assert.equal(hx(sign(m, s)), signatur);
    assert.equal(verifySignature(fromHex(signatur), m, fromHex(oeff)), true);
  }
});

// ---------------------------------------------------- 3. Eigenschaften

/** xorshift64, fester Startwert: jeder Lauf prueft dieselben Faelle. */
function zufall(start = 0x2545f4914f6cdd1dn) {
  let x = start;
  const next = () => { x ^= (x << 13n) & 0xffffffffffffffffn; x ^= x >> 7n; x ^= (x << 17n) & 0xffffffffffffffffn; return x; };
  return {
    zahl: (n: number) => Number(next() % BigInt(n)),
    bytes: (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Number(next() & 255n); return b; },
  };
}

test('Hin- und Rueckweg: 600 zufaellige Ausgaben aller drei Typen ergeben byteweise dieselbe Leitung', () => {
  const z = zufall();
  const schluessel = Array.from({ length: 6 }, () => { const s = z.bytes(32); return { s, p: ed25519.getPublicKey(s) }; });
  for (let i = 0; i < 600; i++) {
    const k = schluessel[z.zahl(6)];
    const memo = z.bytes(z.zahl(33));
    const an = z.zahl(2) === 0 ? z.bytes(20) : rawAddressFromScript(z.bytes(40));
    let t: T.Spend;
    if (i % 3 === 0) {
      t = T.buildTransfer({ chainId: NETZ.chainId, version: 2, from: addressFromPublicKey(k.p), to: an, amount: BigInt(1 + z.zahl(1e9)),
        fee: BigInt(z.zahl(1e6)), nonce: BigInt(z.zahl(1e6)), validFrom: z.zahl(100), validUntil: 0, memo, publicKey: k.p, privateKey: k.s });
    } else if (i % 3 === 1) {
      const n = 1 + z.zahl(20);
      const outs = new Map<string, T.BatchOutput>();
      for (let j = 0; j < n; j++) { const to = z.zahl(2) ? z.bytes(20) : rawAddressFromScript(z.bytes(10)); outs.set(hx(to), { to, amount: BigInt(100 + z.zahl(1e6)) }); }
      t = T.buildBatch({ chainId: NETZ.chainId, from: addressFromPublicKey(k.p), outputs: [...outs.values()], fee: BigInt(z.zahl(1e6)),
        nonce: BigInt(z.zahl(1e6)), memo, publicKey: k.p, privateKey: k.s });
    } else {
      const keys = schluessel.slice(0, 2 + z.zahl(4)).map(x => x.p);
      const script = SC.encodeScript(SC.multisig(1 + z.zahl(keys.length), keys));
      const u = T.unsignedScriptSpend({ script, to: an, amount: BigInt(1 + z.zahl(1e9)), fee: BigInt(z.zahl(1e6)), nonce: BigInt(z.zahl(1e6)), memo });
      const slots = SC.leaves(SC.decodeScript(script)!).map((): SC.WitnessSlot => z.zahl(2) ? { kind: 'sig', signature: z.bytes(64) } : { kind: 'absent' });
      t = { ...u, witness: SC.encodeWitness(slots) };
    }
    const roh = T.serializeTx(t);
    const zurueck = T.deserializeTx(roh);
    assert.equal(hx(T.serializeTx(zurueck)), hx(roh), `Fall ${i}`);
    assert.equal(hx(T.txid(zurueck)), hx(T.txid(t)), `Fall ${i}`);
  }
});

test('Jedes veraenderte Byte macht eine signierte Ausgabe ungueltig oder unlesbar -- nie gueltig', () => {
  const z = zufall(0x9e3779b97f4a7c15n);
  const faelle: T.Spend[] = [];
  const f = I.ueberweisung;
  faelle.push(T.buildTransfer({ chainId: NETZ.chainId, version: 2, from: adr('alice'), to: adr('bob'), amount: BigInt(f.betrag), fee: BigInt(f.gebuehr),
    nonce: BigInt(f.nonce), validFrom: 0, validUntil: 0, memo: enc.encode('x'), publicKey: pk('alice'), privateKey: sk('alice') }));
  faelle.push(T.buildBatch({ chainId: NETZ.chainId, from: adr('alice'), outputs: [{ to: adr('bob'), amount: 5000n }, { to: adr('carol'), amount: 7000n }],
    fee: 3000n, nonce: 1n, publicKey: pk('alice'), privateKey: sk('alice') }));
  faelle.push(skriptAusgabe(multisig, { ...I.zweiVonDrei, validFrom: 0, validUntil: 0 }, (b, h) => pkIst(b, 'alice') ? signiere('alice', h) : pkIst(b, 'carol') ? signiere('carol', h) : { kind: 'absent' }));
  for (const t of faelle) {
    assert.equal(T.checkSpend(t, 10, NETZ), null, 'Ausgangsfall gueltig');
    const roh = T.serializeTx(t);
    let geprueft = 0;
    for (let stelle = 0; stelle < roh.length; stelle++) {
      const b = Uint8Array.from(roh);
      b[stelle] ^= 1 << z.zahl(8);
      let neu: T.Tx;
      try { neu = T.deserializeTx(b); } catch { continue; }
      if (neu.type === T.TX_COINBASE) continue;
      // Gleiche Leitung heisst: das Bit lag in einem Bereich ohne Bedeutung -- den darf es nicht geben.
      assert.notEqual(hx(T.serializeTx(neu)), hx(roh), `Stelle ${stelle}: Aenderung ohne Wirkung`);
      assert.notEqual(T.checkSpend(neu as T.Spend, 10, NETZ), null, `Stelle ${stelle} von ${roh.length}, Typ ${t.type}: veraendert und trotzdem gueltig`);
      geprueft++;
    }
    assert.ok(geprueft > roh.length / 2, `nur ${geprueft} von ${roh.length} Stellen lesbar`);
  }
});

test('Kein Block erzeugt Geld: 30 zufaellige Bloecke -- Geldmenge waechst genau um die Belohnung', () => {
  const z = zufall(0x1234567887654321n);
  const konten = Array.from({ length: 12 }, () => { const s = z.bytes(32); const p = ed25519.getPublicKey(s); return { s, p, a: addressFromPublicKey(p), nonce: 0n }; });
  const state = S.emptyState();
  for (const k of konten) state.set(hx(k.a), { balance: 1_000_000n, nonce: 0n });
  for (let h = 1; h <= 30; h++) {
    const vorher = S.totalSupply(state);
    const spends: T.Spend[] = [];
    let fees = 0n;
    for (const k of konten) {
      if (z.zahl(3) === 0) continue;
      const an = konten[(konten.indexOf(k) + 1 + z.zahl(konten.length - 1)) % konten.length];
      const fee = BigInt(1000 + z.zahl(1000));
      const t = z.zahl(2)
        ? T.buildTransfer({ chainId: NETZ.chainId, version: 2, from: k.a, to: an.a, amount: BigInt(100 + z.zahl(5000)), fee, nonce: k.nonce, publicKey: k.p, privateKey: k.s })
        : T.buildBatch({ chainId: NETZ.chainId, from: k.a, outputs: [{ to: an.a, amount: BigInt(100 + z.zahl(3000)) }, { to: z.bytes(20), amount: BigInt(100 + z.zahl(3000)) }], fee, nonce: k.nonce, publicKey: k.p, privateKey: k.s });
      spends.push(t); fees += fee; k.nonce++;
    }
    const txs: T.Tx[] = [{ type: T.TX_COINBASE, version: 1, height: h, outputs: [{ to: MINER_A, amount: PA.rewardAt(h) + fees }], extra: new Uint8Array(0) }, ...spends];
    const b: Block = { header: { version: PA.blockVersionAt(h, NETZ.v6Height), height: h, prevHash: new Uint8Array(32), merkleRoot: txMerkleRoot(txs),
      stateRoot: new Uint8Array(32), timestamp: 1n, difficulty: 1n, txCount: txs.length, extranonce: 0n, nonce: 0n }, txs };
    const r = S.applyBlock(state, b, NETZ);
    assert.equal(r.ok, true, `Block ${h}: ${r.error?.reason}`);
    assert.equal(S.totalSupply(state), vorher + PA.rewardAt(h), `Block ${h}`);
    // Ein Coinbase-Betrag eine Einheit zu hoch: abgelehnt, Zustand unveraendert.
    const st2 = S.cloneState(state);
    const gierig = { ...b, txs: [{ ...(txs[0] as T.Coinbase), outputs: [{ to: MINER_A, amount: PA.rewardAt(h) + 1n }] }] as T.Tx[] };
    gierig.header = { ...b.header, txCount: 1, merkleRoot: txMerkleRoot(gierig.txs) };
    assert.equal(S.applyBlock(st2, gierig, NETZ).ok, false);
    assert.equal(S.totalSupply(st2), S.totalSupply(state));
  }
});
