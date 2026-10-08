/**
 * Issue #5: Der Blockheader wird an mehreren Stellen gebaut. Ein gemeinsamer
 * Testvektor prueft jede erreichbare Kopie gegen serializeHeader() aus dem
 * Kern -- Byte fuer Byte.
 *
 *   - src/lib/core/block.ts            (Massstab)
 *   - miner/src/header.mjs             (Kommandozeilen-Miner, auch GPU)
 *   - node-core/src/PoolQuelle.ts      (Node Core als Pool-Miner)
 *   - public/explorer.html             (Explorer, prueft jeden Block nach)
 *
 * Nicht hier: src/workers/miner.worker.ts (Mini App; die Datei bleibt
 * unveraendert und baut den Header in einer inneren Funktion) und
 * NativMiner.java (Android, eigenes Repository).
 *
 * Der Vektor deckt die Stellen ab, an denen Kopien typischerweise
 * auseinanderlaufen: grosse Zahlen in u64-Feldern, das obere Bit in u32,
 * und das Difficulty-Feld in Gleitkomma-Schreibweise (Konsensfassung 4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { serializeHeader, type BlockHeader } from '../src/lib/core/block.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { difficultyAtHeight, encodeDifficulty } from '../src/lib/core/params.ts';
// @ts-expect-error -- reines JavaScript ohne Typen
import * as minerKopf from '../miner/src/header.mjs';
import { baueJob } from '../node-core/src/PoolQuelle.ts';

const hex = (b: number, n = 32) => b.toString(16).padStart(2, '0').repeat(n);

/** Testvektor: Feldwerte; difficulty ist der WERT, das Header-Feld folgt der Regel der Kette. */
const VEKTOR = [
  { version: 1, height: 0, prev: 0x00, merkle: 0x11, state: 0x22, timestamp: 1_788_912_000n, difficulty: 1n, txCount: 1, extranonce: 0n, nonce: 0n },
  { version: 1, height: 2061, prev: 0xab, merkle: 0x5c, state: 0xe7, timestamp: 1_790_274_835n, difficulty: 183_140n, txCount: 3, extranonce: 13_111_268_702_705_097_209n, nonce: 0xffff_ffffn },
  { version: 2, height: 0x7fff_ffff, prev: 0xff, merkle: 0x80, state: 0x01, timestamp: 0xffff_ffff_ffff_ffffn, difficulty: 0x7fff_ffffn, txCount: 2000, extranonce: 0xffff_ffff_ffff_ffffn, nonce: (7n << 32n) | 42n },
  // Ab Hoehe 6.000 und ueber 2^31: Gleitkomma-Schreibweise im Feld.
  { version: 1, height: 12_345, prev: 0x3d, merkle: 0x4e, state: 0x5f, timestamp: 1_800_000_000n, difficulty: 5_000_000_000n, txCount: 7, extranonce: 99n, nonce: 1n << 63n },
];

/** Der Header des Kerns, das rohe Feld an Stelle 112 und der darstellbare Wert. */
function kern(v: typeof VEKTOR[number]): { kopf: BlockHeader; feld: number; wert: bigint } {
  const wert = difficultyAtHeight(v.difficulty, v.height);
  const feld = encodeDifficulty(wert, v.height);
  const kopf: BlockHeader = {
    version: v.version, height: v.height, prevHash: fromHex(hex(v.prev)), merkleRoot: fromHex(hex(v.merkle)),
    stateRoot: fromHex(hex(v.state)), timestamp: v.timestamp, difficulty: wert, txCount: v.txCount,
    extranonce: v.extranonce, nonce: v.nonce,
  };
  return { kopf, feld, wert };
}

test('Miner (header.mjs): gleicher Header wie der Kern', () => {
  for (const v of VEKTOR) {
    const { kopf, feld } = kern(v);
    const job = {
      version: v.version, height: v.height, prevHash: hex(v.prev), merkleRoot: hex(v.merkle), stateRoot: hex(v.state),
      timestamp: v.timestamp.toString(), difficulty: feld, txCount: v.txCount, extranonce: v.extranonce.toString(),
    };
    assert.equal(toHex(minerKopf.serializeHeader(job, v.nonce)), toHex(serializeHeader(kopf)), `Hoehe ${v.height}`);
  }
});

test('Node Core (PoolQuelle.baueJob): gleicher Header wie der Kern', () => {
  for (const v of VEKTOR) {
    const { kopf, feld, wert } = kern(v);
    const j = baueJob({
      jobId: 'k' + v.height, version: v.version, height: v.height,
      prevHash: hex(v.prev), merkleRoot: hex(v.merkle), stateRoot: hex(v.state),
      timestamp: v.timestamp.toString(), difficulty: feld, difficultyWert: wert.toString(),
      txCount: v.txCount, extranonce: v.extranonce.toString(), target: '0000' + 'ff'.repeat(30),
    });
    // baueJob liefert den Header mit Nonce 0; der Miner setzt sie ab Byte 128 ein.
    const ohneNonce = serializeHeader({ ...kopf, nonce: 0n });
    assert.equal(j.header, toHex(ohneNonce), `Hoehe ${v.height}`);
  }
});

test('Explorer (explorer.html): gleicher Header wie der Kern', () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'public', 'explorer.html'), 'utf8');
  // Die drei Funktionen, die der Explorer fuer den Header braucht, aus der Seite lesen.
  const stueck = (anfang: string, ende: string) => {
    const a = html.indexOf(anfang); const b = html.indexOf(ende, a);
    assert.ok(a >= 0 && b > a, `nicht gefunden: ${anfang}`);
    return html.slice(a, b);
  };
  const code = [
    stueck('function fromHex(s){', 'const toHex='),
    stueck('const DIFF_V4=', 'function serializeHeader(b){'),
    stueck('function serializeHeader(b){', 'const SHIFT='),
  ].join('\n') + '\nreturn serializeHeader;';
  const explorerKopf = new Function(code)() as (b: Record<string, unknown>) => Uint8Array;

  for (const v of VEKTOR) {
    const { kopf, wert } = kern(v);
    // Der Explorer bekommt die Bloecke wie aus /api/v2/blocks: difficultyWert ist der WERT.
    const b = {
      version: v.version, height: v.height, prevHash: hex(v.prev), merkleRoot: hex(v.merkle), stateRoot: hex(v.state),
      timestamp: v.timestamp.toString(), difficultyWert: wert.toString(), txCount: v.txCount,
      extranonce: v.extranonce.toString(), nonce: v.nonce.toString(),
    };
    assert.equal(toHex(explorerKopf(b)), toHex(serializeHeader(kopf)), `Hoehe ${v.height}`);
  }
});
