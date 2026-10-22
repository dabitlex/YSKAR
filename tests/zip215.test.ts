/**
 * Ed25519 nach der Regel aus docs/CONSENSUS_V6.md 7.8.
 *
 * Die Konsensregel ist seit Genesis die von @noble/curves (zip215). Knoten
 * pruefen ab jetzt mit dem WASM-Modul aus ed25519-zebra -- schneller, aber
 * nur zulaessig, wenn es in JEDEM Fall genauso entscheidet. Diese Datei ist
 * der Beleg dafuer:
 *
 *   - 196 veroeffentlichte Grenzfaelle (Quelle in der Fixture-Datei)
 *   - 12 Faelle aus ed25519-speccheck ("Taming the many EdDSAs")
 *   - gezielt gebaute Grenzfaelle: kleine und gemischte Ordnung,
 *     nicht-kanonische Kodierungen, S >= L
 *   - Zufall mit festem Startwert, damit jeder Lauf dasselbe prueft
 *   - Stapel gegen Einzelpruefung, und ein Block mit und ohne Stapel
 *
 * Wer ed25519-zebra, noble, Rust oder Node aktualisiert, muss diese Datei
 * gruen sehen, bevor das Update in einen Knoten geht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ed25519, ED25519_TORSION_SUBGROUP } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';

import { NOBLE, setzePruefer, pruefer, verifySignature, mitVorpruefung, type Pruefer } from '../src/lib/core/sigcheck.ts';
import { ladeZip215Wasm, aktiviereZip215Wasm } from '../src/lib/node/zip215.ts';
import { ZIP215_WASM_BASE64, ZIP215_WASM_SHA256 } from '../src/lib/node/zip215Wasm.ts';

const WASM = ladeZip215Wasm() as Pruefer;
const h = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));
const V = JSON.parse(readFileSync(new URL('./fixtures/ed25519-vektoren.json', import.meta.url), 'utf8'));

test('Modul: geladen, Pruefsumme stimmt, Selbstprobe bestanden', () => {
  assert.ok(WASM, 'WASM-Modul liess sich nicht laden');
  assert.equal(WASM.name, 'ed25519-zebra-wasm');
  const sha = createHash('sha256').update(Buffer.from(ZIP215_WASM_BASE64, 'base64')).digest('hex');
  assert.equal(sha, ZIP215_WASM_SHA256);
  // Feste Erwartung: Ein neues Modul ist eine Entscheidung, kein Nebeneffekt.
  assert.equal(ZIP215_WASM_SHA256, '12b6e5044fd48dcd0fc4191960bc2e0a8cbc093435978cc5067d0b50fa769bd3');
});

test('Regel 7.8: alle 196 veroeffentlichten Grenzfaelle -- noble und WASM entscheiden wie erwartet', () => {
  const msg = new TextEncoder().encode('Zcash');
  assert.equal(V.zip215.faelle.length, 196);
  for (const [i, c] of V.zip215.faelle.entries()) {
    const sig = h(c.sig), pk = h(c.vk);
    assert.equal(NOBLE.einzeln(sig, msg, pk), c.zip215, `noble, Fall ${i}`);
    assert.equal(WASM.einzeln(sig, msg, pk), c.zip215, `WASM, Fall ${i}`);
  }
});

test('speccheck: alle 12 Faelle gleich, mit festgehaltener Erwartung', () => {
  for (const [i, c] of V.speccheck.faelle.entries()) {
    const sig = h(c.signature), pk = h(c.pub_key), m = h(c.message);
    assert.equal(NOBLE.einzeln(sig, m, pk), c.zip215, `noble, Fall ${i}`);
    assert.equal(WASM.einzeln(sig, m, pk), c.zip215, `WASM, Fall ${i}`);
  }
});

// -------------------------------------------------------- Grenzfaelle

const P = ed25519.Point;
const B = P.BASE;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const p = 2n ** 255n - 19n;
const le = (n: bigint) => { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) { b[i] = Number(n & 255n); n >>= 8n; } return b; };
const fromLe = (b: Uint8Array) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
const H = (...t: Uint8Array[]) => fromLe(sha512(Uint8Array.from(t.flatMap(x => [...x])))) % L;
const torsion = ED25519_TORSION_SUBGROUP.map(x => P.fromHex(x));
const sig = (R: Uint8Array, S: bigint) => Uint8Array.from([...R, ...le(S)]);

/** Deterministischer Zufall (xorshift), damit jeder Lauf dieselben Faelle prueft. */
function zufall(start: bigint) {
  let x = start;
  return (n: bigint) => {
    let v = 0n;
    for (let i = 0; i < 4; i++) { x ^= (x << 13n) & 0xffffffffffffffffn; x ^= x >> 7n; x ^= (x << 17n) & 0xffffffffffffffffn; v = (v << 64n) | x; }
    return v % n;
  };
}

function grenzfaelle(): { name: string; s: Uint8Array; m: Uint8Array; pk: Uint8Array }[] {
  const out: { name: string; s: Uint8Array; m: Uint8Array; pk: Uint8Array }[] = [];
  const m = new TextEncoder().encode('YSKAR');
  const a = 123456789n, A = B.multiply(a), r0 = 987654321n, R0 = B.multiply(r0);
  const k0 = H(R0.toBytes(), A.toBytes(), m), S0 = (r0 + k0 * a) % L;
  out.push({ name: 'gueltig', s: sig(R0.toBytes(), S0), m, pk: A.toBytes() });
  out.push({ name: 'S + L', s: sig(R0.toBytes(), S0 + L), m, pk: A.toBytes() });
  torsion.forEach((T, i) => out.push({ name: `klein ${i}`, s: sig(torsion[(i + 3) % 8].toBytes(), 0n), m, pk: T.toBytes() }));
  for (let i = 1; i < 8; i++) for (let j = 0; j < 4; j++) {
    const A2 = A.add(torsion[i]), r = 1000n + BigInt(j), R = B.multiply(r);
    const k = H(R.toBytes(), A2.toBytes(), m);
    out.push({ name: `gemischt A ${i}/${j}`, s: sig(R.toBytes(), (r + k * a) % L), m, pk: A2.toBytes() });
  }
  for (let i = 1; i < 8; i++) {
    const R = R0.add(torsion[i]), k = H(R.toBytes(), A.toBytes(), m);
    out.push({ name: `gemischt R ${i}`, s: sig(R.toBytes(), (r0 + k * a) % L), m, pk: A.toBytes() });
  }
  // nicht-kanonische Kodierungen y + p (nur gueltige Punkte) und x = 0 mit Vorzeichenbit
  const enc: Uint8Array[] = [];
  for (let y = 0n; y < 19n; y++) for (const v of [0, 1]) { const e = le(y + p); if (v) e[31] |= 0x80; try { P.fromBytes(e, true); enc.push(e); } catch { /* kein Punkt */ } }
  for (const y of [1n, p - 1n]) { const e = le(y); e[31] |= 0x80; try { P.fromBytes(e, true); enc.push(e); } catch { /* */ } }
  enc.forEach((e, i) => {
    out.push({ name: `A nicht-kanonisch ${i}`, s: sig(P.ZERO.toBytes(), 0n), m, pk: e });
    out.push({ name: `R nicht-kanonisch ${i}`, s: sig(e, (H(e, A.toBytes(), m) * a) % L), m, pk: A.toBytes() });
  });
  return out;
}

test('Grenzfaelle: WASM entscheidet in jedem Fall wie noble', () => {
  const faelle = grenzfaelle();
  assert.ok(faelle.length >= 90, `nur ${faelle.length} Faelle`);
  let gueltig = 0;
  for (const f of faelle) {
    const n = NOBLE.einzeln(f.s, f.m, f.pk);
    assert.equal(WASM.einzeln(f.s, f.m, f.pk), n, f.name);
    if (n) gueltig++;
  }
  // Beide Seiten der Regel sind abgedeckt.
  assert.ok(gueltig > 10 && gueltig < faelle.length - 10, `${gueltig} von ${faelle.length} gueltig`);
});

test('Zufall mit festem Startwert: 3.000 Grenzfaelle und 1.000 echte/verfaelschte Signaturen', () => {
  const z = zufall(0x9e3779b97f4a7c15n);
  for (let i = 0; i < 3000; i++) {
    const m = le(z(2n ** 128n)).slice(0, 16);
    const a = z(L - 1n) + 1n, r = z(L - 1n) + 1n, mode = i % 6;
    let A = B.multiply(a), R = B.multiply(r);
    if (mode === 1 || mode === 3) A = A.add(torsion[Number(z(8n))]);
    if (mode === 2 || mode === 3) R = R.add(torsion[Number(z(8n))]);
    if (mode >= 4) A = torsion[Number(z(8n))];
    if (mode === 5) R = torsion[Number(z(8n))];
    let S = mode >= 4 ? (z(2n) === 0n ? 0n : z(L)) : (r + H(R.toBytes(), A.toBytes(), m) * a) % L;
    if (z(20n) === 0n) S += L;
    const s = sig(R.toBytes(), S);
    assert.equal(WASM.einzeln(s, m, A.toBytes()), NOBLE.einzeln(s, m, A.toBytes()), `Fall ${i}`);
  }
  for (let i = 0; i < 500; i++) {
    const sk = le(z(2n ** 256n)), m = le(z(2n ** 256n));
    const pk = ed25519.getPublicKey(sk), s = ed25519.sign(m, sk);
    assert.equal(WASM.einzeln(s, m, pk), true);
    const f = Uint8Array.from(s); f[i % 64] ^= 1 << (i % 8);
    assert.equal(WASM.einzeln(f, m, pk), NOBLE.einzeln(f, m, pk));
  }
});

test('Stapel: gueltig nur, wenn jede einzelne gueltig ist -- auch bei Grenzfaellen', () => {
  const echt = Array.from({ length: 50 }, (_, i) => {
    const sk = new Uint8Array(32).fill(i + 1), m = new Uint8Array(32).fill(i);
    return { signature: ed25519.sign(m, sk), message: m, publicKey: ed25519.getPublicKey(sk) };
  });
  assert.equal(WASM.stapel!(echt), true);
  for (const stelle of [0, 17, 49]) {
    const kaputt = echt.map(e => ({ ...e }));
    const s = Uint8Array.from(kaputt[stelle].signature); s[40] ^= 4;
    kaputt[stelle].signature = s;
    assert.equal(WASM.stapel!(kaputt), false, `verfaelscht an ${stelle}`);
  }
  // Grenzfaelle mit 32-Byte-Nachricht: Stapel == alle einzeln gueltig.
  const m32 = new Uint8Array(32).fill(9);
  const klein = torsion.map((T, i) => ({ signature: sig(torsion[(i + 1) % 8].toBytes(), 0n), message: m32, publicKey: T.toBytes() }));
  assert.equal(WASM.stapel!([...echt, ...klein]), klein.every(k => NOBLE.einzeln(k.signature, k.message, k.publicKey)));
  // Nachrichten anderer Laenge gehen einzeln -- dasselbe Ergebnis.
  const lang = { signature: ed25519.sign(new Uint8Array(100), new Uint8Array(32).fill(99)), message: new Uint8Array(100), publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(99)) };
  assert.equal(WASM.stapel!([...echt, lang]), true);
  // Mehr als ein Stapel voll (8.192): wird in Teilen geprueft.
  const viele = Array.from({ length: 8300 }, (_, i) => echt[i % echt.length]);
  assert.equal(WASM.stapel!(viele), true);
});

test('mitVorpruefung: ohne Stapel-Pruefer kein Unterschied; mit Stapel werden Tripel vorgemerkt, nur innerhalb', () => {
  const sk = new Uint8Array(32).fill(5), m = new Uint8Array(32).fill(6);
  const t = { signature: ed25519.sign(m, sk), message: m, publicKey: ed25519.getPublicKey(sk) };
  const falsch = { ...t, signature: Uint8Array.from(t.signature).map((b, i) => (i === 3 ? b ^ 1 : b)) };
  let aufrufe = 0;
  const zaehler: Pruefer = { name: 'zaehler', einzeln: (s, mm, pk) => { aufrufe++; return WASM.einzeln(s, mm, pk); }, stapel: WASM.stapel };
  const vorher = pruefer();
  setzePruefer(zaehler);
  try {
    mitVorpruefung([t, t], () => { assert.equal(verifySignature(t.signature, t.message, t.publicKey), true); });
    assert.equal(aufrufe, 0, 'vorgemerkte Signatur wurde erneut gerechnet');
    // Ausserhalb wieder einzeln.
    assert.equal(verifySignature(t.signature, t.message, t.publicKey), true);
    assert.equal(aufrufe, 1);
    // Faellt der Stapel durch, wird nichts vorgemerkt -- die Falsche bleibt falsch.
    mitVorpruefung([t, falsch], () => {
      assert.equal(verifySignature(falsch.signature, falsch.message, falsch.publicKey), false);
      assert.equal(verifySignature(t.signature, t.message, t.publicKey), true);
    });
    assert.equal(aufrufe, 3);
  } finally { setzePruefer(vorher); }
});

test('aktiviereZip215Wasm: YSKAR_SIGCHECK=noble erzwingt noble', () => {
  const vorher = pruefer();
  try {
    process.env.YSKAR_SIGCHECK = 'noble';
    assert.equal(aktiviereZip215Wasm(), 'noble');
    delete process.env.YSKAR_SIGCHECK;
    assert.equal(aktiviereZip215Wasm(), 'ed25519-zebra-wasm');
  } finally { delete process.env.YSKAR_SIGCHECK; setzePruefer(vorher); }
});

// ------------------------------------------------- im Block (applyBlock)

import * as T from '../src/lib/core/tx.ts';
import * as S from '../src/lib/core/state.ts';
import * as SC from '../src/lib/core/script.ts';
import * as PA from '../src/lib/core/params.ts';
import { txMerkleRoot, type Block } from '../src/lib/core/block.ts';
import { REGTEST_V6 } from '../src/lib/core/networks.ts';
import { keypairFromSeed } from '../src/lib/core/wallet.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { rawAddressFromScript } from '../src/lib/core/address.ts';
import { MINER_A } from './helpers/regtest.ts';

const V6 = REGTEST_V6;
const kp = (n: number) => keypairFromSeed(new Uint8Array(32).fill(n));

function blockMit(height: number, spends: T.Spend[]): Block {
  let fees = 0n;
  for (const t of spends) fees += t.fee;
  const txs: T.Tx[] = [
    { type: T.TX_COINBASE, version: 1, height, outputs: [{ to: MINER_A, amount: PA.rewardAt(height) + fees }], extra: new Uint8Array(0) },
    ...spends,
  ];
  return {
    header: {
      version: PA.blockVersionAt(height, V6.v6Height), height, prevHash: new Uint8Array(32),
      merkleRoot: txMerkleRoot(txs), stateRoot: new Uint8Array(32),
      timestamp: 1_788_912_000n + BigInt(height) * 600n, difficulty: 1n, txCount: txs.length, extranonce: 0n, nonce: 0n,
    },
    txs,
  };
}

/** 40 Ueberweisungen von 40 Konten und eine 2-von-3-Skriptausgabe. */
function testblock() {
  const state = S.emptyState();
  const spends: T.Spend[] = [];
  for (let i = 0; i < 40; i++) {
    const k = kp(10 + i);
    state.set(toHex(k.addressRaw), { balance: 10n * PA.UNIT, nonce: 0n });
    spends.push(T.buildTransfer({ chainId: V6.chainId, version: 2, from: k.addressRaw, to: kp(1).addressRaw,
      amount: PA.UNIT, fee: 100_000n, nonce: 0n, publicKey: k.publicKey, privateKey: k.privateKey }));
  }
  const [a, b, c] = [kp(2), kp(3), kp(4)];
  const script = SC.encodeScript(SC.multisig(2, [a.publicKey, b.publicKey, c.publicKey]));
  state.set(toHex(rawAddressFromScript(script)), { balance: 10n * PA.UNIT, nonce: 0n });
  const u = T.unsignedScriptSpend({ script, to: kp(1).addressRaw, amount: PA.UNIT, fee: 100_000n, nonce: 0n });
  const hsh = T.scriptSpendSighash(u, V6.chainId);
  const node = SC.decodeScript(script)!;
  const sigs = new Map([a, b].map(k => [toHex(k.publicKey), ed25519.sign(hsh, k.privateKey)]));
  const slots = SC.leaves(node).map((l): SC.WitnessSlot => {
    const s = sigs.get(toHex((l as { pubkey: Uint8Array }).pubkey));
    return s ? { kind: 'sig', signature: s } : { kind: 'absent' };
  });
  spends.push({ ...u, witness: SC.encodeWitness(slots) });
  return { state, spends };
}

function mitPruefer<T>(p: Pruefer, fn: () => T): T {
  const vorher = pruefer();
  setzePruefer(p);
  try { return fn(); } finally { setzePruefer(vorher); }
}

function ergebnis(state: S.State, b: Block): string {
  const st = S.cloneState(state);
  const r = S.applyBlock(st, b, V6);
  return r.ok ? `ok:${r.fees}:${toHex(S.stateRootAt(st, 5, V6))}` : `fehler:${r.error!.tx}:${r.error!.reason}`;
}

test('Block: noble, WASM einzeln und WASM im Stapel ergeben exakt dasselbe -- gueltig und ungueltig', () => {
  const { state, spends } = testblock();
  const nurEinzeln: Pruefer = { name: 'einzeln', einzeln: WASM.einzeln };
  const varianten = (b: Block) => [NOBLE, nurEinzeln, WASM].map(p => mitPruefer(p, () => ergebnis(state, b)));

  const gut = blockMit(5, spends);
  const g = varianten(gut);
  assert.ok(g[0].startsWith('ok:'), g[0]);
  assert.deepEqual(new Set(g).size, 1, g.join(' | '));

  // Eine verfaelschte Ueberweisung an Stelle 23: alle melden denselben Fehler an derselben Stelle.
  const kaputt = spends.map(t => ({ ...t })) as T.Spend[];
  const t23 = kaputt[22] as T.Transfer;
  const s = Uint8Array.from(t23.signature); s[10] ^= 1; kaputt[22] = { ...t23, signature: s };
  const k = varianten(blockMit(5, kaputt));
  assert.equal(k[0], 'fehler:23:bad_signature');
  assert.deepEqual(new Set(k).size, 1, k.join(' | '));

  // Verfaelschte Mitzeichnung in der Skriptausgabe (letzte Transaktion).
  const kaputt2 = spends.map(t => ({ ...t })) as T.Spend[];
  const ss = kaputt2[40] as T.ScriptSpend;
  const w = Uint8Array.from(ss.witness); w[5] ^= 1; kaputt2[40] = { ...ss, witness: w };
  const k2 = varianten(blockMit(5, kaputt2));
  assert.ok(k2[0].startsWith('fehler:41:'), k2[0]);
  assert.deepEqual(new Set(k2).size, 1, k2.join(' | '));
});
