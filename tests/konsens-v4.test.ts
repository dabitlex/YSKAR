/**
 * Konsensfassung 4: Difficulty ohne Obergrenze.
 *
 * Die wichtigste Eigenschaft zuerst: Unter 2^31 ist das Header-Feld Byte
 * fuer Byte dasselbe wie vorher -- vor und nach der Aktivierung. Daran
 * haengt, dass alte Knoten und alte Miner bis dahin unveraendert mitlaufen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DIFF_V4_HEIGHT, DIFF_KLARTEXT_GRENZE, MAX_DIFFICULTY, MIN_DIFFICULTY, TARGET_BLOCK_TIME,
  floorDifficulty, difficultyAtHeight, encodeDifficulty, decodeDifficulty, targetFromDifficulty,
} from '../src/lib/core/params.ts';
import { serializeHeader, deserializeHeader, type BlockHeader } from '../src/lib/core/block.ts';
import { checkDifficulty } from '../src/lib/core/validate.ts';
import { nextDifficulty, effectiveDifficulty, type BlockTiming } from '../src/lib/core/difficulty.ts';
import { MAINNET } from '../src/lib/core/networks.ts';
import { Writer } from '../src/lib/core/codec.ts';
import { encodeStats, decodeStats } from '../src/lib/node/p2p/messages.ts';
// Der Header-Bau des CLI-Miners, unveraendert -- so bauen ALTE Miner.
import { serializeHeader as minerHeader } from '../miner/src/header.mjs';

const V4 = DIFF_V4_HEIGHT;

// Kleiner deterministischer Zufall: Tests sollen bei jedem Lauf gleich sein.
let saat = 0x9e3779b9n;
function zufall(bits: number): bigint {
  let v = 0n;
  for (let i = 0; i < bits; i += 32) {
    saat = (saat * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    v = (v << 32n) | (saat >> 32n);
  }
  return v & ((1n << BigInt(bits)) - 1n);
}

function kopf(height: number, difficulty: bigint, timestamp = 1_800_000_000n): BlockHeader {
  return {
    version: 1, height, prevHash: new Uint8Array(32).fill(1), merkleRoot: new Uint8Array(32).fill(2),
    stateRoot: new Uint8Array(32).fill(3), timestamp, difficulty, txCount: 1, extranonce: 7n, nonce: 9n,
  };
}

/** Header genau so, wie ihn die Fassung VOR v4 geschrieben hat. */
function alterHeader(h: BlockHeader): Uint8Array {
  return new Writer()
    .u32(h.version).u32(h.height).bytes(h.prevHash, 32).bytes(h.merkleRoot, 32)
    .bytes(h.stateRoot, 32).u64(h.timestamp).u32(Number(h.difficulty)).u32(h.txCount)
    .u64(h.extranonce).u64(h.nonce).finish();
}

// ------------------------------------------------------------ Byte-Identitaet

test('Unter 2^31: Header Byte fuer Byte wie vorher -- vor und nach der Aktivierung', () => {
  const werte = [1n, 4096n, 24_576n, 895_759n, 1_831_228n, 16_777_215n, 16_777_217n,
                 2_147_483_647n];
  for (let i = 0; i < 500; i++) werte.push(1n + zufall(31) % (DIFF_KLARTEXT_GRENZE - 1n));
  for (const d of werte) {
    for (const hoehe of [1, V4 - 1, V4, V4 + 1, 1_000_000]) {
      const h = kopf(hoehe, d);
      assert.deepEqual(serializeHeader(h), alterHeader(h), `d=${d} hoehe=${hoehe}`);
      assert.equal(deserializeHeader(serializeHeader(h)).difficulty, d);
    }
    assert.equal(floorDifficulty(d), d, 'unter 2^31 wird nichts gerundet');
  }
});

test('Echte Kette: hoechste je gesehene Difficulty liegt weit unter 2^31', () => {
  // Stand Supabase-Spiegel 01.10.2026, Hoehe 2.942: max 1.831.228. Kein
  // bisheriger Block liegt im Bereich, dessen Lesart sich aendert.
  assert.ok(1_831_228n < DIFF_KLARTEXT_GRENZE);
});

// -------------------------------------------------------------- Lesart vorher

test('Vor der Aktivierung: altes Verhalten unveraendert', () => {
  // Felder mit oberstem Bit sind dort schlichte Zahlen bis 2^32-1 ...
  assert.equal(decodeDifficulty(0x80000005, V4 - 1), 0x80000005n);
  assert.equal(encodeDifficulty(0xffffffffn, V4 - 1), 0xffffffff);
  // ... und alles darueber laesst sich nicht schreiben, mit derselben Meldung.
  assert.throws(() => serializeHeader(kopf(V4 - 1, 0x100000000n)), /u32 > 0/);
});

// ----------------------------------------------------------- Gleitkomma-Teil

test('Ab der Aktivierung: jeder Wert bis MAX darstellbar, Rundung < 2^-23', () => {
  const proben = [DIFF_KLARTEXT_GRENZE, 0xffffffffn, 0x100000000n, 5_000_000_000_000n,
                  1n << 100n, (1n << 239n) + 12345n, MAX_DIFFICULTY];
  for (let i = 0; i < 2000; i++) {
    const bits = 32 + Number(zufall(8) % 209n);           // 32 .. 240 Bit
    proben.push((1n << BigInt(bits - 1)) | zufall(bits - 1));
  }
  for (const v of proben) {
    const f = floorDifficulty(v);
    assert.ok(f <= v && f >= DIFF_KLARTEXT_GRENZE);
    if (v <= MAX_DIFFICULTY) assert.ok((v - f) * (1n << 23n) < v, `Rundung zu gross bei ${v}`);
    const feld = encodeDifficulty(f, V4);
    assert.ok(feld >= 0x80000000 && feld <= 0xffffffff);
    assert.equal(decodeDifficulty(feld, V4), f);
    // Ueber Header und zurueck
    const h = kopf(V4, f);
    assert.equal(deserializeHeader(serializeHeader(h)).difficulty, f);
  }
  assert.ok(MAX_DIFFICULTY < (1n << 240n) && MAX_DIFFICULTY > (1n << 239n));
  assert.ok(targetFromDifficulty(MAX_DIFFICULTY) >= 1n, 'Target bleibt mindestens 1');
  assert.equal(floorDifficulty(1n << 250n), MAX_DIFFICULTY);
});

test('Abrundung ist monoton -- der zulaessige Bereich wird nie leer', () => {
  for (let i = 0; i < 3000; i++) {
    const a = zufall(1 + Number(zufall(8) % 241n));
    const b = a + zufall(Number(zufall(6)) + 1);
    if (a === 0n) continue;
    assert.ok(floorDifficulty(a) <= floorDifficulty(b), `${a} / ${b}`);
  }
});

test('Eindeutig: jedes gueltige Feld ergibt beim Zurueckschreiben dasselbe Feld', () => {
  let gueltig = 0, abgelehnt = 0;
  for (let i = 0; i < 20000; i++) {
    const feld = Number(zufall(32)) || 1;
    let wert: bigint;
    try { wert = decodeDifficulty(feld, V4); } catch { abgelehnt++; continue; }
    gueltig++;
    assert.equal(encodeDifficulty(wert, V4), feld);
  }
  assert.ok(gueltig > 0 && abgelehnt > 0);
  // Exponent unter 8 (Wert laege unter 2^31) und ueber 216 sind unzulaessig.
  assert.throws(() => decodeDifficulty((0x80000000 | (7 << 23)) >>> 0, V4), /Exponent/);
  assert.throws(() => decodeDifficulty((0x80000000 | (217 << 23)) >>> 0, V4), /Exponent/);
  // Ein nicht abgerundeter Wert laesst sich nicht schreiben.
  assert.throws(() => encodeDifficulty((1n << 40n) + 1n, V4), /nicht darstellbar/);
});

test('Header mit unzulaessiger Schreibweise wird beim Lesen abgelehnt', () => {
  const bytes = serializeHeader(kopf(V4, 1n << 40n));
  new DataView(bytes.buffer).setUint32(112, (0x80000000 | (3 << 23)) >>> 0, true);
  assert.throws(() => deserializeHeader(bytes), /Exponent/);
});

// ------------------------------------------------------------------- Regel

function gleichmaessig(d: bigint, n = 45): BlockTiming[] {
  return Array.from({ length: n }, () => ({ difficulty: d, solveSeconds: TARGET_BLOCK_TIME }));
}

test('Regel: Difficulty ueber u32 wird ab Hoehe 6.000 angenommen', () => {
  const d = 5_000_000_000_000n;                 // ca. 546 TH/s Netz-Hashrate
  const timings = gleichmaessig(d);
  const vor = kopf(V4 - 1, d, 1_800_000_000n);
  const regulaer = floorDifficulty(nextDifficulty(timings, MAINNET));
  assert.ok(regulaer > 0xffffffffn);

  // Genau der abgerundete regulaere Wert: gueltig.
  const h = kopf(V4, regulaer, vor.timestamp + 600n);
  assert.equal(checkDifficulty(h, vor, timings, MAINNET), null);

  // Eine Stufe darueber: zu schwer.
  const e = BigInt(regulaer.toString(2).length) - 24n;
  const drueber = kopf(V4, regulaer + (1n << e), vor.timestamp + 600n);
  assert.match(checkDifficulty(drueber, vor, timings, MAINNET) ?? '', /nicht zwischen/);

  // Deutlich darunter ohne lange Pause: zu leicht.
  const drunter = kopf(V4, floorDifficulty(regulaer / 2n), vor.timestamp + 600n);
  assert.match(checkDifficulty(drunter, vor, timings, MAINNET) ?? '', /nicht zwischen/);

  // Nach langer Pause greift die Notfallregel auch oberhalb von u32.
  const spaet = vor.timestamp + 7200n;
  const gelockert = floorDifficulty(effectiveDifficulty(nextDifficulty(timings, MAINNET), 7200n, MAINNET));
  assert.equal(checkDifficulty(kopf(V4, gelockert, spaet), vor, timings, MAINNET), null);
});

test('Regel: unter 2^31 exakt wie vorher (keine Rundung, gleiche Grenzen)', () => {
  const d = 895_759n;
  const timings = gleichmaessig(d);
  const vor = kopf(V4, d);
  const roh = nextDifficulty(timings, MAINNET);
  assert.equal(difficultyAtHeight(roh, V4 + 1), roh);
  assert.equal(checkDifficulty(kopf(V4 + 1, roh, vor.timestamp + 600n), vor, timings, MAINNET), null);
  assert.match(checkDifficulty(kopf(V4 + 1, roh + 1n, vor.timestamp + 600n), vor, timings, MAINNET) ?? '',
    /nicht zwischen/);
});

// ------------------------------------------------------------ Alte Miner

test('Alter Miner (CLI header.mjs) baut mit dem rohen Feld exakt den Knoten-Header', () => {
  for (const d of [895_759n, 2_147_483_647n, floorDifficulty(5_000_000_000_000n),
                   floorDifficulty(1n << 70n), MAX_DIFFICULTY]) {
    const h = kopf(V4 + 10, d);
    const job = {
      version: 1, height: h.height,
      prevHash: Buffer.from(h.prevHash).toString('hex'),
      merkleRoot: Buffer.from(h.merkleRoot).toString('hex'),
      stateRoot: Buffer.from(h.stateRoot).toString('hex'),
      timestamp: String(h.timestamp),
      difficulty: encodeDifficulty(d, h.height),     // so schickt es der Knoten
      txCount: h.txCount, extranonce: String(h.extranonce),
    };
    assert.deepEqual(minerHeader(job, h.nonce), serializeHeader(h), `d=${d}`);
  }
});

test('Explorer rechnet die Schreibweise identisch nach', () => {
  const html = readFileSync(new URL('../public/explorer.html', import.meta.url), 'utf8');
  const quelle = html.slice(html.indexOf('const DIFF_V4='), html.indexOf('function serializeHeader('));
  const diffFeld = new Function(`${quelle}; return diffFeld;`)() as (v: bigint, h: number) => number;
  for (let i = 0; i < 2000; i++) {
    const bits = 1 + Number(zufall(8) % 240n);
    const v = floorDifficulty(1n + zufall(bits));
    for (const hoehe of [V4 - 1, V4]) {
      if (hoehe < V4 && v > 0xffffffffn) continue;
      assert.equal(diffFeld(v, hoehe), encodeDifficulty(v, hoehe));
    }
  }
});

// ------------------------------------------------------- Ausserhalb Konsens

test('P2P-Statistik: riesige Hashrate wird gedeckelt statt zu werfen', () => {
  const s = decodeStats(encodeStats({ knoten: 1n, hashrate: 1n << 80n, sessions: 1, adressen: [] }));
  assert.equal(s.hashrate, 0xffffffffffffffffn);
});

// --------------------------------------------------------------- Simulation

/**
 * Das eigentliche Abnahmekriterium: Mit beliebig viel Rechenleistung laeuft
 * die Kette gleichmaessig weiter -- ohne die Stoesse und Pausen der alten
 * Fassung.
 */
function simuliere(hashrate: number, bloecke = 3000) {
  const t: BlockTiming[] = gleichmaessig(1_000_000n);
  const zeiten: number[] = [];
  let hoehe = V4;
  let r = 12345;
  const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return (r + 0.5) / 2147483648; };
  for (let b = 0; b < bloecke; b++, hoehe++) {
    const d = difficultyAtHeight(nextDifficulty(t.slice(-45), MAINNET), hoehe);
    encodeDifficulty(d, hoehe);                       // muss sich IMMER schreiben lassen
    const mittel = Number(d * 65536n) / hashrate;
    const s = Math.max(1, Math.round(-Math.log(rnd()) * mittel));
    t.push({ difficulty: d, solveSeconds: BigInt(s) });
    if (b >= 1000) zeiten.push(s);
  }
  const schnitt = zeiten.reduce((a, b) => a + b, 0) / zeiten.length;
  const langePausen = zeiten.filter(s => s > 1800).length / zeiten.length;
  return { schnitt, langePausen };
}

for (const [name, hashrate] of [['5 TH/s', 5e12], ['200 TH/s', 200e12], ['10^21 H/s', 1e21]] as const) {
  test(`Simulation ${name}: ca. 10 Minuten je Block, keine Pausen-Stoesse`, () => {
    const { schnitt, langePausen } = simuliere(hashrate);
    assert.ok(schnitt > 540 && schnitt < 660, `Ø ${schnitt.toFixed(0)} s`);
    // Exponentialverteilt sind > 30 min bei Ø 10 min etwa e^-3 = 5 %.
    // Die alte Fassung hatte bei 200 TH/s eine solche Pause nach JEDEM
    // dritten Block (33 %).
    assert.ok(langePausen < 0.08, `${(langePausen * 100).toFixed(1)} % lange Pausen`);
  });
}

test('MIN_DIFFICULTY bleibt unter der Klartextgrenze (Untergrenze unveraendert)', () => {
  assert.ok(MIN_DIFFICULTY < DIFF_KLARTEXT_GRENZE);
});
