/**
 * Die Vorgeschichte eines Blocks: nur die letzten Bloecke lesen.
 *
 * Frueher lief der Knoten fuer JEDEN Block bis zum Genesis zurueck, um die
 * Zeitstempel und Loesungszeiten der Kette zu sammeln -- und benutzte davon
 * nur die letzten 11 beziehungsweise lwmaWindow + 1. `vorgeschichte()` liest
 * nur noch so weit zurueck, wie die Regeln lesen.
 *
 * Dieser Test stellt beide Wege nebeneinander: den alten Weg (alles lesen,
 * dann abschneiden) und den neuen. Auf JEDER Hoehe, auf der aktiven Kette
 * und auf Nebenzweigen, muessen beide exakt dieselben Werte liefern. Ein
 * Fenster, das um einen Block zu kurz oder zu lang waere, faellt hier auf.
 *
 * Es wird nicht gemint: `vorgeschichte()` liest nur Zeit, Difficulty und
 * den Verweis auf den Vorgaenger. Die Bloecke stehen deshalb mit frei
 * gewaehlten Werten direkt in der Ablage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { ChainStore, type StoredBlock } from '../src/lib/node/fullnode/ChainStore.ts';
import { vorgeschichte } from '../src/lib/node/fullnode/ChainManager.ts';
import { REGTEST, MAINNET, type ConsensusParams } from '../src/lib/core/networks.ts';
import { zeig } from './helpers/regtest.ts';

/** Kleiner fester Zufallsgenerator -- die Testkette ist jedes Mal dieselbe. */
function zufall(saat: number) {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NULL32 = new Uint8Array(32);
let zaehler = 0;

function eintrag(prev: StoredBlock | null, blockTime: bigint, difficulty: bigint): StoredBlock {
  const hash = new Uint8Array(createHash('sha256').update(`block-${zaehler++}`).digest());
  return {
    hash, height: prev ? prev.height + 1 : 0, prevHash: prev ? prev.hash : NULL32,
    chainWork: (prev?.chainWork ?? 0n) + difficulty, difficulty, blockTime,
    merkleRoot: NULL32, stateRoot: NULL32, txCount: 1, body: new Uint8Array(0),
    status: 'valid', mainChain: false,
  };
}

/** Eine Kette mit unregelmaessigen Abstaenden und wechselnder Difficulty. */
function welt(saat: number) {
  const r = zufall(saat);
  const store = new ChainStore(':memory:');
  const alle: StoredBlock[] = [];
  const naechster = (prev: StoredBlock | null) => {
    // Auch gleiche und zurueckspringende Zeiten -- die Regel deckelt sie,
    // das Fenster muss sie trotzdem unveraendert liefern.
    const abstand = BigInt(Math.floor(r() * 2400) - 120);
    const zeit = prev ? prev.blockTime + abstand : 1_788_912_000n;
    const b = eintrag(prev, zeit, BigInt(1 + Math.floor(r() * 5000)));
    store.put(b);
    alle.push(b);
    return b;
  };

  // Aktive Kette, deutlich laenger als jedes Fenster
  const haupt: StoredBlock[] = [];
  let kopf: StoredBlock | null = null;
  for (let h = 0; h < 140; h++) { kopf = naechster(kopf); haupt.push(kopf); }

  // Nebenzweige: kurz nach dem Genesis, mitten im ersten Fenster, genau an
  // den Fenstergrenzen und weit dahinter; kurze und lange.
  for (const [ab, laenge] of [[0, 4], [1, 60], [9, 3], [10, 15], [11, 2], [44, 5], [45, 5],
    [46, 5], [47, 5], [48, 70], [90, 1], [120, 30]] as const) {
    let k: StoredBlock = haupt[ab];
    for (let i = 0; i < laenge; i++) k = naechster(k);
  }
  return { store, alle };
}

/** Der alte Weg, Zeile fuer Zeile: alles bis zum Genesis lesen, dann kuerzen. */
function alles(store: ChainStore, vorgaenger: StoredBlock, params: ConsensusParams) {
  const kette: StoredBlock[] = [];
  let aktuell: StoredBlock | null = vorgaenger;
  while (aktuell) {
    kette.push(aktuell);
    if (aktuell.height === 0) break;
    aktuell = store.get(aktuell.prevHash);
  }
  kette.reverse();
  const zeitstempel = kette.map(b => b.blockTime);
  const timings = kette.slice(1).map((b, i) => ({
    solveSeconds: b.blockTime - kette[i].blockTime,
    difficulty: b.difficulty,
  }));
  return {
    zeitstempel: zeitstempel.slice(-11),
    timings: timings.slice(-params.lwmaWindow - 1),
    gelesen: kette.length,
  };
}

const mitFenster = (n: number): ConsensusParams => ({ ...REGTEST, lwmaWindow: n });

test('Vorgeschichte: auf jeder Höhe und jedem Zweig dieselben Werte wie beim Lesen der ganzen Kette', () => {
  let geprueft = 0;
  for (const saat of [1, 2, 3]) {
    const { store, alle } = welt(saat);
    // Das Fenster des Netzes (45), eins kleiner als die 11 Zeitstempel,
    // ein winziges und ein groesseres -- die Grenze haengt von beiden ab.
    for (const params of [REGTEST, MAINNET, mitFenster(3), mitFenster(9), mitFenster(10),
      mitFenster(11), mitFenster(60)]) {
      for (const b of alle) {
        const neu = vorgeschichte(store, b, params);
        const alt = alles(store, b, params);
        assert.deepEqual(neu.zeitstempel, alt.zeitstempel,
          `Zeitstempel vor Höhe ${b.height + 1}, Fenster ${params.lwmaWindow}: ${zeig(neu.zeitstempel)}`);
        assert.deepEqual(neu.timings, alt.timings,
          `Lösungszeiten vor Höhe ${b.height + 1}, Fenster ${params.lwmaWindow}`);
        geprueft++;
      }
    }
    store.close();
  }
  assert.ok(geprueft > 5000, `nur ${geprueft} Vergleiche`);
});

test('Vorgeschichte: die Längen sind die, die die Regeln lesen', () => {
  const { store, alle } = welt(7);
  for (const b of alle) {
    const v = vorgeschichte(store, b, REGTEST);
    // b ist der Vorgaenger: Es gibt b.height + 1 Bloecke und b.height Loesungszeiten.
    assert.equal(v.zeitstempel.length, Math.min(11, b.height + 1));
    assert.equal(v.timings.length, Math.min(REGTEST.lwmaWindow + 1, b.height));
    assert.equal(v.zeitstempel.at(-1), b.blockTime, 'der jüngste Zeitstempel ist der des Vorgängers');
    if (b.height > 0) assert.equal(v.timings.at(-1)!.difficulty, b.difficulty);
  }
  store.close();
});

test('Vorgeschichte: die Arbeit wächst nicht mit der Länge der Kette', () => {
  const { store, alle } = welt(11);
  let gelesen = 0;
  const echt = store.get.bind(store);
  store.get = (hash: Uint8Array) => { gelesen++; return echt(hash); };

  const grenze = REGTEST.lwmaWindow + 2;           // 47 Bloecke, der Vorgaenger eingeschlossen
  for (const b of alle) {
    gelesen = 0;
    vorgeschichte(store, b, REGTEST);
    // Der Vorgaenger selbst liegt schon vor; gelesen werden nur seine Vorfahren.
    assert.ok(gelesen <= grenze - 1,
      `vor Höhe ${b.height + 1} wurden ${gelesen} Blöcke gelesen, erlaubt sind ${grenze - 1}`);
    assert.equal(gelesen, Math.min(grenze - 1, b.height),
      `vor Höhe ${b.height + 1}: ${gelesen} gelesen`);
  }
  store.close();
});
