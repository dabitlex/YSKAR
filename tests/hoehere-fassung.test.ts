/**
 * Ein Header einer HOEHEREN, unbekannten Fassung (CONSENSUS_V6.md 11.1).
 *
 * Der Knoten merkt sich "veraltet" nur, wenn der Header echt sein kann:
 * bekannter, gueltiger Vorgaenger, passende Hoehe, gueltiger Zeitstempel und
 * die Difficulty, die die Kette an dieser Stelle verlangt.
 *
 * Regression zu Befund A-1 (Audit 20.10.2026): Vorher wurde der Zeitstempel
 * in diesem Pfad nicht geprueft. Ein Header mit Version 7 und Zeitstempel vor
 * dem Vorgaenger, unter dem Median, zu weit in der Zukunft oder gleich 0 galt
 * als plausibel -- und ein Zeitstempel weit in der Zukunft senkte ueber die
 * Notfallregel die verlangte Difficulty bis auf minDifficulty. So liess sich
 * mit fast keiner Arbeit jeder Knoten als veraltet melden.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2.js';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { REGTEST, type ConsensusParams } from '../src/lib/core/networks.ts';
import { precheckHeader } from '../src/lib/core/block.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { mineBlock, type Gemint } from './helpers/regtest.ts';

const START = 1_788_912_000n;
const JETZT = BigInt(Math.floor(Date.now() / 1000));

function kette(params: ConsensusParams, n: number, difficulty?: bigint): Gemint[] {
  const zustand = emptyState();
  const out: Gemint[] = [];
  let prev = new Uint8Array(32);
  for (let h = 0; h < n; h++) {
    const g = mineBlock({ height: h, prevHash: prev, state: zustand, params, difficulty,
      timestamp: START + BigInt(h) * params.targetBlockTime });
    assert.ok(applyBlock(zustand, g.block, params).ok);
    out.push(g);
    prev = g.hash;
  }
  return out;
}

function knoten(params: ConsensusParams, bloecke: Gemint[]): ChainManager {
  const store = new ChainStore(':memory:');
  store.setMeta('network', params.network);
  store.setMeta('chain_id', toHex(params.chainId));
  const chain = new ChainManager(store, params);
  for (const b of bloecke) assert.equal(chain.accept(b.body).ok, true);
  return chain;
}

/**
 * Kopie eines Blocks mit geaenderten Headerfeldern, Proof of Work neu geloest.
 * Header-Layout: version u32 @0, timestamp u64 @104, difficulty-Feld u32 @112,
 * nonce u64 @128.
 */
function geaendert(vorlage: Uint8Array, params: ConsensusParams,
  f: { version?: number; zeit?: bigint; difficulty?: number }): Uint8Array {
  const roh = vorlage.slice();
  const dv = new DataView(roh.buffer, roh.byteOffset);
  if (f.version !== undefined) dv.setUint32(0, f.version, true);
  if (f.zeit !== undefined) dv.setBigUint64(104, f.zeit, true);
  if (f.difficulty !== undefined) dv.setUint32(112, f.difficulty, true);
  for (let n = 0; n < 50_000_000; n++) {
    dv.setBigUint64(128, BigInt(n), true);
    if (precheckHeader(roh, params).error !== 'pow_failed') return roh;
  }
  throw new Error('kein Proof of Work gefunden');
}

const kurz = (r: { ok: boolean; grund?: string; detail?: string }) => `${r.ok}/${r.grund}/${r.detail ?? ''}`;

test('Hoehere Fassung: nur ein Header mit gueltiger Zeit und Difficulty meldet "veraltet"', () => {
  const P = REGTEST;
  const bl = kette(P, 13);                 // Bloecke 0..12; Block 12 ist die Vorlage
  const vorlage = bl[12].body;
  const elternZeit = bl[11].block.header.timestamp;
  const medianZeit = bl[6].block.header.timestamp;   // Median der letzten 11 (1..11)

  const faelle: [string, { version?: number; zeit?: bigint; difficulty?: number }, RegExp, boolean][] = [
    // Bekannte Fassung: die Regeln, an denen sich der Pfad fuer hoehere Fassungen misst.
    ['v1 gueltig', {}, /^true\//, false],
    ['v1 vor Vorgaenger', { zeit: elternZeit - 1n }, /timestamp\/before_parent/, false],
    ['v1 nicht nach Median', { zeit: medianZeit }, /timestamp\/too_early/, false],
    ['v1 zu weit in der Zukunft', { zeit: JETZT + 10_000n }, /timestamp\/too_far_ahead/, false],
    ['v1 Difficulty falsch', { difficulty: 2 }, /difficulty/, false],
    // Hoehere Fassung.
    ['v7 gueltig', { version: 7 }, /fassung_unbekannt/, true],
    ['v7 vor Vorgaenger', { version: 7, zeit: elternZeit - 1n }, /struktur\/bad_version/, false],
    ['v7 nicht nach Median', { version: 7, zeit: medianZeit }, /struktur\/bad_version/, false],
    ['v7 zu weit in der Zukunft', { version: 7, zeit: JETZT + 10_000n }, /struktur\/bad_version/, false],
    ['v7 Zeitstempel 0', { version: 7, zeit: 0n }, /struktur\/bad_version/, false],
    ['v7 Difficulty falsch', { version: 7, difficulty: 2 }, /struktur\/bad_version/, false],
    ['v7 Zeit und Difficulty falsch', { version: 7, difficulty: 2, zeit: medianZeit }, /struktur\/bad_version/, false],
  ];
  for (const [name, f, erwartet, flag] of faelle) {
    const chain = knoten(P, bl.slice(0, 12));
    const r = chain.accept(geaendert(vorlage, P, f));
    assert.match(kurz(r), erwartet, name);
    assert.equal(chain.hoehereFassungGesehen !== null, flag, `${name}: Flag`);
    if (!r.ok) assert.equal(chain.height(), 11, `${name}: Kette unveraendert`);
  }
});

test('Hoehere Fassung: Zeitstempel in der Zukunft senkt die verlangte Difficulty nicht mehr', () => {
  // Kette mit Difficulty 16, Mindest-Difficulty 1: Die Notfallregel koennte die
  // verlangte Difficulty bei einem Zeitstempel weit in der Zukunft auf 1 senken.
  const P: ConsensusParams = {
    ...REGTEST, network: 'yskar-regtest-hoehere-fassung',
    chainId: sha256(new TextEncoder().encode('yskar-regtest-hoehere-fassung')),
    minDifficulty: 1n, genesisDifficulty: 16n,
  };
  const bl = kette(P, 13, 16n);
  const vorlage = bl[12].body;
  const inDreissigTagen = JETZT + 30n * 86_400n;

  const faelle: [string, { version?: number; zeit?: bigint; difficulty?: number }, RegExp, boolean][] = [
    ['v7 Difficulty 16, normale Zeit', { version: 7 }, /fassung_unbekannt/, true],
    ['v7 Difficulty 1, normale Zeit', { version: 7, difficulty: 1 }, /struktur\/bad_version/, false],
    ['v7 Difficulty 1, +30 Tage', { version: 7, difficulty: 1, zeit: inDreissigTagen }, /struktur\/bad_version/, false],
    ['v1 Difficulty 1, +30 Tage', { version: 1, difficulty: 1, zeit: inDreissigTagen }, /timestamp\/too_far_ahead/, false],
  ];
  for (const [name, f, erwartet, flag] of faelle) {
    const chain = knoten(P, bl.slice(0, 12));
    const r = chain.accept(geaendert(vorlage, P, f));
    assert.match(kurz(r), erwartet, name);
    assert.equal(chain.hoehereFassungGesehen !== null, flag, `${name}: Flag`);
  }
});
