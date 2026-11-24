/**
 * Header der Mini App (src/workers/miner.worker.ts) gegen den Kern.
 *
 * Diagnose 24.11.2026: Der Worker schrieb die Blockversion fest als 1. Ab
 * Block 10.000 (Fassung 6) verlangt die Kette Version 6 -- der Knoten
 * rechnete beim Pruefen einen anderen Header, und JEDER Share der Mini App
 * fiel als "low_difficulty" durch.
 *
 * Der Worker laeuft im Browser und baut den Header in einer inneren
 * Funktion. Damit genau DIESER Code geprueft wird und keine Nachbildung,
 * schneidet der Test unhex() und buildHeader() aus der Quelldatei, entfernt
 * die Typangaben und fuehrt sie aus.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

import { serializeHeader, type BlockHeader } from '../src/lib/core/block.ts';
import { fromHex, toHex } from '../src/lib/core/codec.ts';
import { blockVersionAt, encodeDifficulty, V6_HEIGHT } from '../src/lib/core/params.ts';

const QUELLE = readFileSync(join(import.meta.dirname, '..', 'src', 'workers', 'miner.worker.ts'), 'utf8');

/** Eine Funktion samt Rumpf aus der Quelle schneiden (bis zur schliessenden Klammer in Spalte 0). */
function schneide(name: string): string {
  const ab = QUELLE.indexOf(`function ${name}(`);
  assert.ok(ab >= 0, `function ${name} nicht gefunden`);
  const bis = QUELLE.indexOf('\n}\n', ab);
  assert.ok(bis > ab, `Ende von ${name} nicht gefunden`);
  return QUELLE.slice(ab, bis + 2);
}

type Bauer = (j: Record<string, unknown>, high: number, extranonce: bigint) => Uint8Array;

/** buildHeader() des Workers; die globale Extranonce wird als Parameter hereingereicht. */
const baueHeader: Bauer = (() => {
  const js = stripTypeScriptTypes(`${schneide('unhex')}\n${schneide('buildHeader')}`);
  // eslint-disable-next-line no-new-func
  const f = new Function('HEADER_SIZE', 'j', 'high', 'extranonce',
    `${js}\nreturn buildHeader(j, high);`);
  return (j, high, extranonce) => f(136, j, high, extranonce) as Uint8Array;
})();

const hex = (b: number) => b.toString(16).padStart(2, '0').repeat(32);

function vergleiche(height: number, version: number | undefined, erwartet: number) {
  const difficulty = 666_133_311n;
  const extranonce = 45n;
  const high = 4096 * 3 + 17;
  const job: Record<string, unknown> = {
    jobId: 'j', height, prevHash: hex(0xab), merkleRoot: hex(0x5c), stateRoot: hex(0xe7),
    timestamp: '1795521045', difficulty: encodeDifficulty(difficulty, height), txCount: 1,
    target: '00'.repeat(32), extranonce: extranonce.toString(),
  };
  if (version !== undefined) job.version = version;

  const kern: BlockHeader = {
    version: erwartet, height, prevHash: fromHex(hex(0xab)), merkleRoot: fromHex(hex(0x5c)),
    stateRoot: fromHex(hex(0xe7)), timestamp: 1_795_521_045n, difficulty, txCount: 1,
    extranonce, nonce: BigInt(high) << 32n,
  };
  assert.equal(toHex(baueHeader(job, high, extranonce)), toHex(serializeHeader(kern)));
}

test('Fassung 6: Version 6 aus dem Job landet im Header (wie der Knoten prueft)', () => {
  const h = V6_HEIGHT + 623;
  assert.equal(blockVersionAt(h), 6);
  vergleiche(h, 6, 6);
});

test('Vor Fassung 6: Version 1 aus dem Job', () => {
  vergleiche(V6_HEIGHT - 1, 1, 1);
});

test('Sehr alter Knoten ohne version im Job: 1 wie bisher', () => {
  vergleiche(5_000, undefined, 1);
});

test('Keine fest eingetragene Version mehr im Worker', () => {
  assert.doesNotMatch(schneide('buildHeader'), /setUint32\(0,\s*1,/);
});
