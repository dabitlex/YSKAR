/**
 * Der Trie-Zustand (zustand.ts) aendert kein Ergebnis -- nur die Zeit.
 *
 * Dieselben zufaelligen Bloecke (Ueberweisungen, Sammelzahlungen, Konten,
 * die auf null fallen und verschwinden, Empfaenger der Version 1, abgelehnte
 * Bloecke) laufen auf einem Trie-Zustand und auf einer gewoehnlichen Map.
 * Nach jedem Block muessen Inhalt, Gesamtmenge und Zustandswurzel gleich
 * sein, und die Wurzel muss der Neuberechnung aus allen Konten entsprechen
 * (stateRootV6Voll / stateRoot). Dazwischen werden Wurzeln anderer Zustaende
 * gerechnet (ein Nebenzweig), damit der Baum im Speicher hin und her muss.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGTEST, REGTEST_V6 } from '../src/lib/core/networks.ts';
import {
  emptyState, cloneState, applyBlock, stateRootAt, stateRootV6Voll, stateRoot, totalSupply, type State,
} from '../src/lib/core/state.ts';
import { Zustand } from '../src/lib/core/zustand.ts';
import { zustandsbaumPruefung } from '../src/lib/core/state.ts';
import { buildBlock } from '../src/lib/core/builder.ts';
import { buildTransfer, buildBatch, transferVersionAt, type Spend } from '../src/lib/core/tx.ts';
import { keypairFromSeed, type Keypair } from '../src/lib/core/wallet.ts';
import { toHex } from '../src/lib/core/codec.ts';
import type { ConsensusParams } from '../src/lib/core/networks.ts';

function zufall(start: number) {
  let x = start >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x1_0000_0000; };
}

const KEYS: Keypair[] = [];
const PRAEFIXE: Uint8Array[] = [];
function key(i: number): Keypair {
  while (KEYS.length <= i) {
    const s = new Uint8Array(64); s[0] = KEYS.length & 0xff; s[1] = KEYS.length >> 8; s[2] = 0x77;
    KEYS.push(keypairFromSeed(s, 0, 0));
  }
  return KEYS[i];
}

function gleich(a: State, b: State, was: string) {
  assert.equal(a.size, b.size, `${was}: Anzahl`);
  for (const [k, v] of b) {
    const x = a.get(k);
    assert.ok(x, `${was}: ${k} fehlt`);
    assert.equal(x!.balance, v.balance, `${was}: Guthaben ${k}`);
    assert.equal(x!.nonce, v.nonce, `${was}: Nonce ${k}`);
  }
  assert.equal(totalSupply(a), totalSupply(b), `${was}: Gesamtmenge`);
}

function wurzelVoll(s: State, h: number, p: ConsensusParams): string {
  return toHex(h >= p.v6Height ? stateRootV6Voll(s) : stateRoot(s));
}

/** Zufaellige Ausgaben gegen den Zustand `s` an Hoehe h. */
function ausgaben(r: () => number, s: State, h: number, p: ConsensusParams, anzahlKeys: number): Spend[] {
  const out: Spend[] = [];
  const nonces = new Map<number, bigint>();
  const v6 = h >= p.v6Height;
  for (let n = 0; n < 12; n++) {
    const i = Math.floor(r() * anzahlKeys);
    const k = key(i);
    const konto = s.get(toHex(k.addressRaw));
    if (!konto) continue;
    const nonce = nonces.get(i) ?? konto.nonce;
    const fee = 5_000n;
    const ziel = (): Uint8Array => {
      const w = r();
      // Absichtlich: Rohadressen der Version 0, die mit 0x01 beginnen, und
      // solche der Version 1, die mit genau so einer anfangen.
      if (w < 0.08) { const a = Uint8Array.from([1, ...Array.from({ length: 19 }, () => Math.floor(r() * 256))]); PRAEFIXE.push(a); return a; }
      if (v6 && w < 0.16 && PRAEFIXE.length > 0) {
        const a = PRAEFIXE[Math.floor(r() * PRAEFIXE.length)];
        return Uint8Array.from([...a, ...Array.from({ length: 13 }, () => Math.floor(r() * 256))]);
      }
      if (v6 && w < 0.25) return Uint8Array.from([1, ...Array.from({ length: 32 }, () => Math.floor(r() * 256))]);
      if (w < 0.5) return key(Math.floor(r() * anzahlKeys)).addressRaw;
      return Uint8Array.from(Array.from({ length: 20 }, () => Math.floor(r() * 256)));
    };
    const w = r();
    let t: Spend;
    if (v6 && w < 0.25) {
      const outs = Array.from({ length: 1 + Math.floor(r() * 6) }, () => ({ to: ziel(), amount: 1_000n + BigInt(Math.floor(r() * 1e6)) }));
      const seen = new Set<string>();
      const eindeutig = outs.filter(o => { const x = toHex(o.to); if (seen.has(x) || x === toHex(k.addressRaw)) return false; seen.add(x); return true; });
      if (eindeutig.length === 0) continue;
      t = buildBatch({ from: k.addressRaw, outputs: eindeutig, fee: 20_000n, nonce,
        publicKey: k.publicKey, privateKey: k.privateKey, chainId: p.chainId });
    } else {
      const to = ziel();
      if (toHex(to) === toHex(k.addressRaw)) continue;
      // Manchmal alles: Das Konto faellt auf null Guthaben (bleibt wegen der Nonce bestehen).
      const alles = r() < 0.1 && konto.balance > fee + 100n && !nonces.has(i);
      const amount = alles ? konto.balance - fee : 1_000n + BigInt(Math.floor(r() * 5e6));
      t = buildTransfer({ from: k.addressRaw, to, amount, fee, nonce,
        publicKey: k.publicKey, privateKey: k.privateKey, chainId: p.chainId,
        version: transferVersionAt(h, p.v6Height) });
    }
    out.push(t);
    nonces.set(i, nonce + 1n);
  }
  return out;
}

function lauf(start: number, p: ConsensusParams, bloecke: number) {
  const r = zufall(start);
  const trie = emptyState();
  assert.ok(trie instanceof Zustand);
  const map: State = new Map();
  let prev = new Uint8Array(32);
  let seite: State | null = null;
  const KEYS_N = 24;
  let ausgabenImBlock = 0;
  for (let h = 0; h < bloecke; h++) {
    const miner = key(Math.floor(r() * KEYS_N)).addressRaw;
    const mempool = h < 3 ? [] : ausgaben(r, trie, h, p, KEYS_N);
    const gebaut = buildBlock({
      params: p, height: h, prevHash: prev, state: trie, mempool, minerAddress: miner,
      timestamp: 1_788_912_000n + BigInt(h) * 600n, difficulty: 1n, extranonce: BigInt(h),
    });
    const block = gebaut.block;
    ausgabenImBlock += block.txs.length - 1;

    // Ab und zu ein Nebenzweig: eigene Kopie, anderer Block, eigene Wurzel.
    if (r() < 0.3) {
      seite = cloneState(trie);
      const anders = buildBlock({
        params: p, height: h, prevHash: prev, state: seite, mempool: mempool.slice(0, 2),
        minerAddress: key(0).addressRaw, timestamp: 1_788_912_000n + BigInt(h) * 600n + 1n,
        difficulty: 1n, extranonce: 99n,
      }).block;
      assert.ok(applyBlock(seite, anders, p).ok);
      assert.equal(toHex(stateRootAt(seite, h, p)), wurzelVoll(seite, h, p), `Hoehe ${h}: Nebenzweig`);
    }

    // Ein ungueltiger Block (zu hohe Coinbase) aendert nichts.
    const kaputt = { header: block.header, txs: [{ ...block.txs[0], outputs: [{ to: miner, amount: 10n ** 15n }] }, ...block.txs.slice(1)] };
    const vorher = cloneState(trie);
    assert.equal(applyBlock(trie, kaputt as typeof block, p).ok, false);
    gleich(trie, vorher, `Hoehe ${h}: nach Ablehnung`);

    const a = applyBlock(trie, block, p);
    const b = applyBlock(map, block, p);
    assert.ok(a.ok && b.ok, `Hoehe ${h}: ${a.error?.reason ?? b.error?.reason}`);
    gleich(trie, map, `Hoehe ${h}`);
    const wTrie = toHex(stateRootAt(trie, h, p));
    const wMap = toHex(stateRootAt(map, h, p));
    assert.equal(wTrie, toHex(block.header.stateRoot), `Hoehe ${h}: Wurzel wie im Block`);
    assert.equal(wMap, wTrie, `Hoehe ${h}: Map und Trie`);
    assert.equal(wTrie, wurzelVoll(trie, h, p), `Hoehe ${h}: Neuberechnung`);
    if (seite) assert.equal(toHex(stateRootAt(seite, h, p)), wurzelVoll(seite, h, p), `Hoehe ${h}: Nebenzweig danach`);
    prev = new Uint8Array(32).fill(h & 0xff);
  }
  assert.ok(ausgabenImBlock > bloecke, `genug Ausgaben in den Bloecken (${ausgabenImBlock})`);
  return { trie, map };
}

test('Trie und Map: gleiche Zustaende und Wurzeln -- Fassung 6 (Sparse-Merkle-Baum)', () => {
  const vorher = zustandsbaumPruefung();
  for (const start of [1, 2, 3, 4, 5]) lauf(start * 31337, REGTEST_V6, 40);
  const nachher = zustandsbaumPruefung();
  assert.ok(nachher.nurUnterschiede - vorher.nurUnterschiede > 100, 'der Weg ueber die Unterschiede wurde benutzt');
  assert.equal(nachher.abweichungen, vorher.abweichungen, 'keine Abweichung zur Neuberechnung');
  assert.ok(nachher.pruefungen > vorher.pruefungen);
});

test('Trie und Map: gleiche Zustaende und Wurzeln -- vor Fassung 6 (flacher Baum)', () => {
  for (const start of [11, 12]) lauf(start * 31337, REGTEST, 25);
});

test('Ueber die Aktivierungshoehe hinweg', () => {
  lauf(777, { ...REGTEST, v6Height: 15 }, 35);
});
