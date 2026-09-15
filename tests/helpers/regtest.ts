/**
 * Testketten bauen.
 *
 * Nur fuer Tests. Im Testnetz ist die Difficulty 1, ein Block kostet also
 * rund 65.536 Hashes statt 1,6 Milliarden -- Millisekunden statt einer
 * Viertelstunde. Erst dadurch lassen sich Gabelungen und Reorgs durch die
 * VOLLE Validierung pruefen und nicht nur die Mechanik darunter.
 *
 * Gemint wird echt: derselbe Header, dieselbe Hashfunktion, dieselbe
 * Pruefung. Nur das Ziel ist niedriger.
 */
import { buildBlock, finalizeBlock } from '../../src/lib/core/builder.ts';
import { serializeHeader, headerHash, serializeBlock, type Block }
  from '../../src/lib/core/block.ts';
import { emptyState, applyBlock, cloneState, type State }
  from '../../src/lib/core/state.ts';
import { targetFromDifficulty } from '../../src/lib/core/params.ts';
import { REGTEST } from '../../src/lib/core/networks.ts';
import { decodeAddress } from '../../src/lib/core/address.ts';
import { sha256 } from '@noble/hashes/sha2.js';

/** Zwei Adressen, damit sich Zweige an der Coinbase unterscheiden lassen. */
export const MINER_A = decodeAddress(
  'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw');
export const MINER_B = (() => {
  const a = new Uint8Array(20); a[0] = 0xbb; return a;
})();

const sha256d = (b: Uint8Array) => sha256(sha256(b));

export interface Gemint {
  block: Block;
  hash: Uint8Array;
  body: Uint8Array;
}

/**
 * Einen Block auf einen gegebenen Zustand minen.
 *
 * `timestamp` wird vorgegeben, damit Testketten reproduzierbar sind und die
 * Difficulty-Regel stabile Loesungszeiten sieht.
 */
export function mineBlock(opts: {
  height: number;
  prevHash: Uint8Array;
  state: State;
  timestamp: bigint;
  difficulty?: bigint;
  miner?: Uint8Array;
  extranonce?: bigint;
  extra?: string;
}): Gemint {
  const difficulty = opts.difficulty ?? REGTEST.genesisDifficulty;
  const gebaut = buildBlock({
    height: opts.height,
    prevHash: opts.prevHash,
    state: opts.state,
    mempool: [],
    minerAddress: opts.miner ?? MINER_A,
    timestamp: opts.timestamp,
    difficulty,
    extranonce: opts.extranonce ?? 0n,
    coinbaseExtra: new TextEncoder().encode(opts.extra ?? 'regtest'),
  });

  const ziel = targetFromDifficulty(difficulty);
  for (let nonce = 0n; nonce < 10_000_000n; nonce++) {
    const block = finalizeBlock(gebaut, nonce);
    const h = sha256d(serializeHeader(block.header));
    let wert = 0n;
    for (const b of h) wert = (wert << 8n) | BigInt(b);
    if (wert <= ziel) {
      return { block, hash: h, body: serializeBlock(block) };
    }
  }
  throw new Error('kein Treffer -- Testnetz-Difficulty zu hoch?');
}

export interface Kette {
  bloecke: Gemint[];
  state: State;
  zeit: bigint;
}

/**
 * Eine Kette aus n Bloecken, beginnend beim Genesis.
 *
 * Abstand 600 Sekunden: Damit sieht die Difficulty-Regel genau die
 * Zielzeit und bleibt bei 1 stehen. Andernfalls wuerde sie klettern, und
 * die Tests haetten einen Nebeneffekt, der nichts mit ihnen zu tun hat.
 */
export function baueKette(n: number, opts: {
  start?: bigint; miner?: Uint8Array; extra?: string;
} = {}): Kette {
  const start = opts.start ?? 1_788_912_000n;
  const state = emptyState();
  const bloecke: Gemint[] = [];
  let prev: Uint8Array = new Uint8Array(32);

  for (let h = 0; h < n; h++) {
    const g = mineBlock({
      height: h, prevHash: prev, state,
      timestamp: start + BigInt(h) * REGTEST.targetBlockTime,
      miner: opts.miner, extra: opts.extra,
    });
    const r = applyBlock(state, g.block);
    if (!r.ok) throw new Error(`Testkette: Block ${h} nicht anwendbar: ${r.error?.reason}`);
    bloecke.push(g);
    prev = g.hash;
  }
  return { bloecke, state, zeit: start + BigInt(n) * REGTEST.targetBlockTime };
}

/**
 * Einen Zweig an eine bestehende Kette haengen.
 *
 * Fuer Gabelungen: Man nimmt den Zustand nach Block k und baut von dort aus
 * eine zweite Folge. Die Coinbase-Adresse unterscheidet die Zweige, damit
 * ihre Bloecke verschiedene Hashes bekommen.
 */
export function zweig(basis: Kette, abHoehe: number, n: number, opts: {
  miner?: Uint8Array; extra?: string; versatz?: bigint;
} = {}): Gemint[] {
  const state = emptyState();
  for (let i = 0; i < abHoehe; i++) {
    const r = applyBlock(state, basis.bloecke[i].block);
    if (!r.ok) throw new Error('Zweig: Basis nicht anwendbar');
  }

  const prevStart: Uint8Array = abHoehe === 0
    ? new Uint8Array(32) : basis.bloecke[abHoehe - 1].hash;
  const startZeit = basis.bloecke[0].block.header.timestamp
    + BigInt(abHoehe) * REGTEST.targetBlockTime + (opts.versatz ?? 0n);

  const out: Gemint[] = [];
  let prev: Uint8Array = prevStart;
  for (let i = 0; i < n; i++) {
    const g = mineBlock({
      height: abHoehe + i, prevHash: prev, state,
      timestamp: startZeit + BigInt(i) * REGTEST.targetBlockTime,
      miner: opts.miner ?? MINER_B,
      extra: opts.extra ?? 'zweig',
    });
    const r = applyBlock(state, g.block);
    if (!r.ok) throw new Error(`Zweig: Block ${abHoehe + i} nicht anwendbar`);
    out.push(g);
    prev = g.hash;
  }
  return out;
}

export { REGTEST };
