/**
 * Alte und neue Kettenverwaltung nebeneinander.
 *
 * Die Kettenverwaltung rechnet seit dieser Fassung auf kuerzerem Weg:
 *
 *   - Sie liest fuer einen Block nur die letzten Bloecke davor statt der
 *     ganzen Kette.
 *   - Haengt ein Block die aktive Kette an, uebernimmt sie den Zustand, den
 *     sie bei der Pruefung errechnet hat, statt ihn noch einmal von der
 *     letzten Marke aus zu rechnen.
 *   - Den Zustand eines Nebenzweigs rechnet sie von einer Marke aus statt
 *     von Block 0.
 *
 * Die REGELN sollen dabei dieselben bleiben. Das prueft dieser Test, indem
 * er die alte Fassung (tests/helpers/ChainManagerReferenz.ts, unveraendert
 * aus dem Stand davor) und die neue dieselben Bloecke in derselben
 * Reihenfolge annehmen laesst. Nach JEDEM Block muss alles gleich sein:
 *
 *   - die Antwort (angenommen, abgelehnt mit welchem Grund, Reorg, welche
 *     Bloecke aktiv wurden und welche verdraengt),
 *   - Hoehe und Kopf der aktiven Kette,
 *   - die Wurzel des gehaltenen Zustands,
 *   - welcher Block auf welcher Hoehe aktiv ist,
 *   - die Zustandsmarken in der Ablage.
 *
 * Gemint wird echt, im Testnetz. Die Kette reicht ueber die Markenhoehe 200
 * hinaus, damit die Marken wirklich benutzt werden, enthaelt signierte
 * Ueberweisungen und einen Abschnitt mit steigender Difficulty.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ChainStore, type StoredBlock } from '../src/lib/node/fullnode/ChainStore.ts';
import { blockWork } from '../src/lib/node/fullnode/ChainWork.ts';
import { deserializeBlock } from '../src/lib/core/block.ts';
import { ChainManager, SNAPSHOT_INTERVAL, type AcceptResult }
  from '../src/lib/node/fullnode/ChainManager.ts';
import { ChainManager as Referenz } from './helpers/ChainManagerReferenz.ts';
import { REGTEST, MAINNET, type ConsensusParams } from '../src/lib/core/networks.ts';
import { expectedDifficulty } from '../src/lib/core/validate.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { buildTransfer, type Transfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { UNIT, MIN_FEE } from '../src/lib/core/params.ts';
import { emptyState, applyBlock, cloneState, stateRoot, getAccount, type State }
  from '../src/lib/core/state.ts';
import { mineBlock, MINER_B, zeig, type Gemint } from './helpers/regtest.ts';

// ------------------------------------------------------------------ Bloecke

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
/** Bekommt die Coinbase der Hauptkette und ist Absender der Ueberweisungen. */
const KONTO = keypairFromMnemonic(WORTE, '', 0, 0);
const START = 1_788_912_000n;

/** Ein geminter Block samt dem, was man zum Weiterbauen braucht. */
interface Glied {
  g: Gemint;
  eltern: Glied | null;
  hoehe: number;
  /** Zustand NACH diesem Block. */
  state: State;
}

/** Jeder gueltige Testblock, nach Hash -- um zu einem Block der Ablage das Glied zu finden. */
const ALLE = new Map<string, Glied>();
const gliedZu = (hash: Uint8Array): Glied => {
  const k = ALLE.get(toHex(hash));
  if (!k) throw new Error(`Kein Testblock zu ${toHex(hash).slice(0, 12)}`);
  return k;
};

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

/** Die Difficulty, die der naechste Block nach `eltern` tragen muss. */
function faelligeDifficulty(eltern: Glied | null): bigint {
  if (!eltern) return REGTEST.genesisDifficulty;
  const kette: Glied[] = [];
  for (let k: Glied | null = eltern; k && kette.length < REGTEST.lwmaWindow + 2; k = k.eltern) {
    kette.push(k);
  }
  kette.reverse();
  const timings = kette.slice(1).map((k, i) => ({
    solveSeconds: k.g.block.header.timestamp - kette[i].g.block.header.timestamp,
    difficulty: k.g.block.header.difficulty,
  }));
  return expectedDifficulty(timings, REGTEST);
}

function ueberweisung(state: State, betrag: bigint, an: Uint8Array): Transfer {
  return buildTransfer({
    chainId: REGTEST.chainId, from: KONTO.addressRaw, to: an, amount: betrag,
    fee: MIN_FEE, nonce: getAccount(state, KONTO.addressRaw).nonce,
    publicKey: KONTO.publicKey, privateKey: KONTO.privateKey,
  });
}

/**
 * Ein Kind an einen Block haengen. Ohne Angaben entsteht ein gueltiger
 * Block. Jede Angabe unter `falsch` ueberschreibt einen Wert, den ein
 * ehrlicher Miner anders setzen wuerde -- so entstehen die ungueltigen.
 */
function kind(eltern: Glied | null, opt: {
  abstand?: bigint; miner?: Uint8Array; extra?: string; mempool?: Transfer[];
  falsch?: { zeit?: bigint; difficulty?: bigint; hoehe?: number; aufZustand?: State };
} = {}): Glied {
  const hoehe = eltern ? eltern.hoehe + 1 : 0;
  const zeit = opt.falsch?.zeit
    ?? (eltern ? eltern.g.block.header.timestamp + (opt.abstand ?? 600n) : START);
  const basis = opt.falsch?.aufZustand ?? (eltern ? eltern.state : emptyState());
  const g = mineBlock({
    height: opt.falsch?.hoehe ?? hoehe,
    prevHash: eltern ? eltern.g.hash : new Uint8Array(32),
    state: basis, timestamp: zeit,
    difficulty: opt.falsch?.difficulty ?? faelligeDifficulty(eltern),
    miner: opt.miner ?? KONTO.addressRaw, extra: opt.extra ?? 'vergleich',
    mempool: opt.mempool,
  });
  const state = cloneState(basis);
  // Bei absichtlich falschen Bloecken ist der Zustand danach bedeutungslos.
  if (!opt.falsch) {
    const r = applyBlock(state, g.block, REGTEST);
    if (!r.ok) throw new Error(`Testblock ${hoehe} nicht anwendbar: ${r.error?.reason}`);
  }
  const glied: Glied = { g, eltern, hoehe, state };
  if (!opt.falsch) ALLE.set(toHex(g.hash), glied);
  return glied;
}

// ---------------------------------------------------------------- Vergleich

function knoten(params: ConsensusParams) {
  const neu = new ChainStore(':memory:', { network: params.network, chainId: params.chainId });
  const alt = new ChainStore(':memory:', { network: params.network, chainId: params.chainId });
  return {
    params,
    neu: { store: neu, chain: new ChainManager(neu, params) },
    alt: { store: alt, chain: new Referenz(alt, params) },
    schritte: 0,
  };
}
type Paar = ReturnType<typeof knoten>;

function lesbar(r: AcceptResult) {
  if (!r.ok) return { ok: false, grund: r.grund, detail: r.detail ?? null };
  if (!r.stored) return { ok: true, stored: false, grund: r.grund };
  const liste = (bs: typeof r.neu) => bs.map(b => `${b.height}:${toHex(b.hash)}:${b.mainChain}`);
  return { ok: true, stored: true, reorg: r.reorg, height: r.height, tip: toHex(r.tip),
           neu: liste(r.neu), verdraengt: liste(r.verdraengt) };
}

/** Kopf, Zustand und Marken beider Knoten vergleichen. */
function stand(p: Paar, wo: string, gruendlich: boolean) {
  const a = p.neu, b = p.alt;
  assert.equal(a.chain.height(), b.chain.height(), `${wo}: Höhe`);
  const kopfA = a.chain.tip(), kopfB = b.chain.tip();
  assert.equal(kopfA ? toHex(kopfA.hash) : null, kopfB ? toHex(kopfB.hash) : null, `${wo}: Kopf`);
  assert.equal(toHex(stateRoot(a.chain.state())), toHex(stateRoot(b.chain.state())),
    `${wo}: Zustandswurzel`);
  if (kopfA) {
    assert.equal(toHex(stateRoot(a.chain.state())), toHex(kopfA.stateRoot),
      `${wo}: Der gehaltene Zustand passt nicht zur Wurzel im Kopf`);
  }
  assert.equal(a.store.count(), b.store.count(), `${wo}: Zahl der gespeicherten Blöcke`);

  // Die juengste Marke -- von ihr aus wird nach einem Neustart gerechnet.
  const marke = (s: ChainStore) => {
    const m = s.snapshotAtOrBelow(1_000_000);
    return m ? `${m.height}:${toHex(m.hash)}:${toHex(m.stateRoot)}:${zeig(m.accounts)}` : null;
  };
  assert.equal(marke(a.store), marke(b.store), `${wo}: jüngste Marke`);

  if (!gruendlich) return;
  const hoehe = a.chain.height();
  // Auf jeder Hoehe genau ein aktiver Block, darueber keiner -- und in
  // beiden Ablagen derselbe. Ein Reorg kann die aktive Kette kuerzer
  // machen, deshalb reicht der Blick ein Stueck ueber den Kopf hinaus.
  for (let h = 0; h <= hoehe + 40; h++) {
    const aktivA = a.store.atHeight(h).filter(x => x.mainChain).map(x => toHex(x.hash));
    const aktivB = b.store.atHeight(h).filter(x => x.mainChain).map(x => toHex(x.hash));
    assert.equal(aktivA.length, h <= hoehe ? 1 : 0, `${wo}: ${aktivA.length} aktive Blöcke auf Höhe ${h}`);
    assert.deepEqual(aktivA, aktivB, `${wo}: aktiver Block auf Höhe ${h}`);
  }
  // Alle Marken, auf jedem Zweig: auf den Markenhoehen jeden Block ansehen.
  for (let h = 0; h <= hoehe + SNAPSHOT_INTERVAL; h += SNAPSHOT_INTERVAL) {
    for (const blk of a.store.atHeight(h)) {
      const ma = a.store.getSnapshot(blk.hash), mb = b.store.getSnapshot(blk.hash);
      assert.equal(ma ? `${toHex(ma.stateRoot)}:${zeig(ma.accounts)}` : null,
                   mb ? `${toHex(mb.stateRoot)}:${zeig(mb.accounts)}` : null,
                   `${wo}: Marke zu Block ${toHex(blk.hash).slice(0, 12)} auf Höhe ${h}`);
    }
  }
}

/** Einen Block beiden Knoten geben und alles vergleichen. */
function gib(p: Paar, body: Uint8Array, wo: string): AcceptResult {
  // Wer sich den Zustand vor dem Block geholt hat (Mempool, Mining-Server),
  // haelt ein Objekt in der Hand, das sich danach nicht aendern darf.
  const gehalten = p.neu.chain.state();
  const gehalteneWurzel = toHex(stateRoot(gehalten));
  const rNeu = p.neu.chain.accept(body);
  const rAlt = p.alt.chain.accept(body);
  assert.deepEqual(lesbar(rNeu), lesbar(rAlt), `${wo}: Die Antworten weichen ab`);
  assert.equal(toHex(stateRoot(gehalten)), gehalteneWurzel,
    `${wo}: Ein vorher geholter Zustand wurde verändert`);
  p.schritte++;
  const reorg = rNeu.ok && rNeu.stored && rNeu.reorg;
  stand(p, wo, reorg || p.schritte % 40 === 0);
  return rNeu;
}

function erwarteGrund(r: AcceptResult, grund: string, wo: string) {
  assert.ok(!r.ok, `${wo}: hätte abgelehnt werden müssen`);
  assert.equal((r as { grund: string }).grund, grund, `${wo}: ${zeig(lesbar(r))}`);
}

// --------------------------------------------------------------------- Welt

/*
  Die Hauptkette wird einmal gemint und von allen Tests benutzt -- sie ist
  der teure Teil. Die Tests laufen in der Reihenfolge der Datei und bauen
  aufeinander auf: Jeder fuehrt dieselben zwei Knoten weiter.
*/
const HAUPT_HOEHE = 212;
const EMPF = [0xe1, 0xe2, 0xe3].map(x => new Uint8Array(20).fill(x));
let haupt: Glied[] = [];
let paar: Paar;

function baueHauptkette(): Glied[] {
  const r = zufall(20261004);
  const kette: Glied[] = [];
  let kopf: Glied | null = null;
  for (let h = 0; h <= HAUPT_HOEHE; h++) {
    /*
      Abstaende: meist unregelmaessig um die Zielzeit. Zwischen Hoehe 60 und
      90 kommen die Bloecke fuenfmal zu schnell -- dort steigt die
      Difficulty von 1 bis 4, und danach faellt sie ueber viele Bloecke
      wieder. So prueft die Kette die Difficulty-Regel an wechselnden Werten
      und nicht nur am Minimum.
    */
    const abstand = h >= 60 && h < 90 ? 120n : BigInt(540 + Math.floor(r() * 420));
    // Ab und zu eine oder zwei signierte Ueberweisungen.
    const mempool: Transfer[] = [];
    if (kopf && h > 2 && h % 7 === 3) {
      mempool.push(ueberweisung(kopf.state, UNIT * BigInt(1 + h % 5), EMPF[h % 3]));
    }
    kopf = kind(kopf, { abstand, mempool });
    kette.push(kopf);
  }
  return kette;
}

after(() => {
  for (const k of [paar?.neu, paar?.alt]) { try { k?.store.close(); } catch { /* egal */ } }
});

// -------------------------------------------------------------------- Tests

test('Vergleich: eine gerade Kette über die Markenhöhe 200 hinaus', () => {
  haupt = baueHauptkette();
  const diffs = new Set(haupt.map(k => k.g.block.header.difficulty));
  assert.ok(diffs.size >= 3, `Die Difficulty soll sich bewegen, gesehen: ${[...diffs]}`);
  assert.ok(haupt.some(k => k.g.block.txs.length > 1), 'Die Kette soll Überweisungen enthalten');

  paar = knoten(REGTEST);
  for (const k of haupt) {
    const antw = gib(paar, k.g.body, `Hauptkette ${k.hoehe}`);
    assert.ok(antw.ok, `Block ${k.hoehe}: ${zeig(lesbar(antw))}`);
    // Der gehaltene Zustand ist der, den der Test selbst errechnet hat.
    assert.equal(toHex(stateRoot(paar.neu.chain.state())), toHex(stateRoot(k.state)));
  }
  assert.equal(paar.neu.chain.height(), HAUPT_HOEHE);
  assert.ok(paar.neu.store.getSnapshot(haupt[200].g.hash), 'Marke auf Höhe 200 fehlt');
  stand(paar, 'nach der Hauptkette', true);
});

test('Vergleich: Nebenzweige unter, auf und über der Marke', () => {
  // Der Vorgaenger liegt jeweils auf der aktiven Kette, aber nicht an ihrem
  // Kopf -- der Zustand muss von einer Marke aus gerechnet werden.
  // Drei Bloecke je Zweig; der hoechste Zweig endet eine Hoehe unter dem
  // Kopf, damit keiner die Hauptkette ueberholt.
  for (const ab of [0, 1, 57, 88, 199, 200, 201, 206, HAUPT_HOEHE - 4]) {
    let k: Glied = haupt[ab];
    for (let i = 0; i < 3; i++) {
      // Auf dem Zweig auch eine Ueberweisung: Sie ist nur gegen den Zustand
      // DIESES Zweigs gueltig.
      const mempool = i === 1 && getAccount(k.state, KONTO.addressRaw).balance > 10n * UNIT
        ? [ueberweisung(k.state, 3n * UNIT, EMPF[0])] : [];
      k = kind(k, { miner: MINER_B, extra: `zweig-${ab}`, abstand: 700n, mempool });
      const antw = gib(paar, k.g.body, `Zweig ab ${ab}, Block ${k.hoehe}`);
      assert.ok(antw.ok, `Zweig ab ${ab}, Block ${k.hoehe}: ${zeig(lesbar(antw))}`);
    }
  }
  assert.equal(toHex(paar.neu.chain.tip()!.hash), toHex(haupt[HAUPT_HOEHE].g.hash),
    'Kein Nebenzweig hat mehr Arbeit als die Hauptkette');
  stand(paar, 'nach den Nebenzweigen', true);
});

test('Vergleich: ungültige Blöcke werden von beiden mit demselben Grund abgelehnt', () => {
  const kopf = haupt[HAUPT_HOEHE];
  const seite = haupt[203];                      // Vorgaenger mitten in der Kette
  const jetzt = BigInt(Math.floor(Date.now() / 1000));
  const vorher = toHex(paar.neu.chain.tip()!.hash);

  for (const [wo, eltern] of [['am Kopf', kopf], ['auf einem Nebenzweig', seite]] as const) {
    // Zeit nicht nach dem Median der letzten elf Bloecke
    erwarteGrund(gib(paar, kind(eltern, { extra: 'frueh',
      falsch: { zeit: eltern.g.block.header.timestamp - 4000n } }).g.body, `zu früh ${wo}`),
      'timestamp', `zu früh ${wo}`);
    // Zeit weit in der Zukunft
    erwarteGrund(gib(paar, kind(eltern, { extra: 'spaet',
      falsch: { zeit: jetzt + 100_000n } }).g.body, `zu spät ${wo}`), 'timestamp', `zu spät ${wo}`);
    // Mehr Difficulty im Header, als die Regel vorgibt
    erwarteGrund(gib(paar, kind(eltern, { extra: 'schwer',
      falsch: { difficulty: faelligeDifficulty(eltern) + 1n } }).g.body, `Difficulty ${wo}`),
      'difficulty', `Difficulty ${wo}`);
    // Hoehe passt nicht zum Vorgaenger
    erwarteGrund(gib(paar, kind(eltern, { extra: 'hoch',
      falsch: { hoehe: eltern.hoehe + 2 } }).g.body, `Höhe ${wo}`), 'hoehe_passt_nicht', `Höhe ${wo}`);
    // Auf einem fremden Zustand gebaut: Die Wurzel im Block stimmt nicht.
    erwarteGrund(gib(paar, kind(eltern, { extra: 'wurzel',
      falsch: { aufZustand: haupt[150].state } }).g.body, `Wurzel ${wo}`), 'state_root', `Wurzel ${wo}`);
  }

  /*
    Eine Ueberweisung, die nur auf einem ANDEREN Zweig gueltig ist: gebaut
    gegen den Zustand am Kopf (dort stimmt die Nonce), angehaengt an Block
    150 (dort ist das Konto noch nicht so weit). Wer den Block gegen den
    falschen Zustand prueft, nimmt ihn an.
  */
  const fremd = kind(haupt[150], { extra: 'nonce', miner: MINER_B,
    mempool: [ueberweisung(kopf.state, UNIT, EMPF[1])],
    falsch: { aufZustand: kopf.state } });
  erwarteGrund(gib(paar, fremd.g.body, 'Überweisung vom anderen Zweig'), 'state',
    'Überweisung vom anderen Zweig');

  /*
    Dasselbe unter einem Block, der selbst auf einem Nebenzweig liegt. Der
    Zustand dieses Zweigs kommt aus dem Merker des zuletzt angenommenen
    Zweig-Blocks -- er muss nach jedem abgelehnten Kind unveraendert
    weiter gelten.
  */
  const ast = kind(haupt[205], { miner: MINER_B, extra: 'ast', abstand: 610n });
  assert.ok(gib(paar, ast.g.body, 'Ast').ok);
  erwarteGrund(gib(paar, kind(ast, { extra: 'ast-wurzel',
    falsch: { aufZustand: haupt[205].state } }).g.body, 'Wurzel unter dem Ast'), 'state_root', 'Ast');
  erwarteGrund(gib(paar, kind(ast, { extra: 'ast-frueh',
    falsch: { zeit: ast.g.block.header.timestamp - 4000n } }).g.body, 'zu früh unter dem Ast'),
    'timestamp', 'Ast');
  const astKind = kind(ast, { miner: MINER_B, extra: 'ast-kind', abstand: 620n });
  assert.ok(gib(paar, astKind.g.body, 'gültiges Kind des Asts').ok);
  erwarteGrund(gib(paar, kind(astKind, { extra: 'ast-schwer',
    falsch: { difficulty: faelligeDifficulty(astKind) + 1n } }).g.body, 'Difficulty unter dem Ast'),
    'difficulty', 'Ast');
  // Ein zweites Kind des ASTS, nachdem der Merker schon beim Kind steht:
  // Jetzt muss gerechnet werden.
  assert.ok(gib(paar, kind(ast, { miner: MINER_B, extra: 'ast-kind-2', abstand: 630n }).g.body,
    'zweites Kind des Asts').ok);

  // Unlesbar, beschaedigt, ohne Vorgaenger, doppelt
  erwarteGrund(gib(paar, new Uint8Array([1, 2, 3]), 'Müll'), 'unlesbar', 'Müll');
  const kaputt = kind(kopf, { extra: 'kaputt' }).g.body.slice();
  kaputt[kaputt.length - 1] ^= 0xff;
  erwarteGrund(gib(paar, kaputt, 'beschädigt'), 'struktur', 'beschädigt');
  const waise = kind(kind(kopf, { extra: 'nie-gesendet' }), { extra: 'waise' });
  erwarteGrund(gib(paar, waise.g.body, 'ohne Vorgänger'), 'vorgaenger_fehlt', 'ohne Vorgänger');
  const doppelt = gib(paar, haupt[100].g.body, 'doppelt');
  assert.deepEqual(lesbar(doppelt), { ok: true, stored: false, grund: 'bekannt' });

  assert.equal(toHex(paar.neu.chain.tip()!.hash), vorher, 'Kein ungültiger Block bewegt die Kette');
  stand(paar, 'nach den ungültigen Blöcken', true);
});

test('Vergleich: ein Reorg über die Marke hinweg und wieder zurück', () => {
  // Zweig ab Hoehe 196: Er schneidet die Marke auf 200 ab.
  let z: Glied = haupt[195];
  let gewechselt = -1;
  while (z.hoehe < HAUPT_HOEHE + 3) {
    z = kind(z, { miner: MINER_B, extra: 'reorg', abstand: 590n });
    const antw = gib(paar, z.g.body, `Reorg-Zweig ${z.hoehe}`);
    assert.ok(antw.ok, `Reorg-Zweig ${z.hoehe}: ${zeig(lesbar(antw))}`);
    if (antw.ok && antw.stored && antw.reorg && gewechselt < 0) {
      gewechselt = z.hoehe;
      assert.ok(antw.verdraengt.length >= HAUPT_HOEHE - 195, 'Die alte Kette ab 196 wird verdrängt');
    }
  }
  assert.ok(gewechselt > 0, 'Der Zweig muss die Kette übernehmen');
  assert.equal(toHex(paar.neu.chain.tip()!.hash), toHex(z.g.hash));
  assert.equal(toHex(stateRoot(paar.neu.chain.state())), toHex(stateRoot(z.state)));
  stand(paar, 'nach dem Reorg', true);

  // Die alte Kette waechst weiter und holt sich die Fuehrung zurueck.
  let k: Glied = haupt[HAUPT_HOEHE];
  let zurueck = false;
  for (let i = 0; i < 6; i++) {
    k = kind(k, { extra: 'zurueck', abstand: 600n });
    haupt.push(k);
    const antw = gib(paar, k.g.body, `Alte Kette ${k.hoehe}`);
    assert.ok(antw.ok, `Alte Kette ${k.hoehe}: ${zeig(lesbar(antw))}`);
    if (antw.ok && antw.stored && antw.reorg) zurueck = true;
  }
  assert.ok(zurueck, 'Die alte Kette muss wieder übernehmen');
  assert.equal(toHex(paar.neu.chain.tip()!.hash), toHex(k.g.hash));
  assert.equal(toHex(stateRoot(paar.neu.chain.state())), toHex(stateRoot(k.state)));
  stand(paar, 'nach dem Reorg zurück', true);
});

test('Vergleich: ein zufälliger Baum in zufälliger Reihenfolge', () => {
  const r = zufall(8646);
  const bekannt: Glied[] = haupt.slice(-10);     // woran angebaut werden kann
  const wartend: Glied[] = [];                   // gemint, aber noch nicht gesendet
  let angenommen = 0, zurueckgestellt = 0, reorgs = 0;

  const sende = (k: Glied) => {
    const antw = gib(paar, k.g.body, `Baum ${k.hoehe} ${toHex(k.g.hash).slice(0, 8)}`);
    if (antw.ok) {
      angenommen++;
      if (antw.stored && antw.reorg) reorgs++;
      return true;
    }
    assert.equal((antw as { grund: string }).grund, 'vorgaenger_fehlt', zeig(lesbar(antw)));
    zurueckgestellt++;
    return false;
  };

  for (let i = 0; i < 44; i++) {
    // Meist an einen der juengsten Bloecke anbauen, manchmal weiter hinten.
    const eltern = bekannt[Math.max(0, bekannt.length - 1 - Math.floor(r() * r() * bekannt.length))];
    const k = kind(eltern, {
      miner: r() < 0.5 ? MINER_B : KONTO.addressRaw, extra: `baum-${i}`,
      abstand: BigInt(350 + Math.floor(r() * 900)),
      mempool: r() < 0.3 && getAccount(eltern.state, KONTO.addressRaw).balance > 10n * UNIT
        ? [ueberweisung(eltern.state, UNIT, EMPF[i % 3])] : [],
    });
    bekannt.push(k);
    // Jeder vierte Block wird zurueckgehalten -- sein Kind kommt dann vor ihm an.
    if (r() < 0.25) wartend.push(k);
    else sende(k);
    // Zurueckgehaltene irgendwann nachliefern, auch ausser der Reihe.
    if (wartend.length > 0 && r() < 0.35) {
      sende(wartend.splice(Math.floor(r() * wartend.length), 1)[0]);
    }
  }
  // Alles nachliefern, bis nichts mehr wartet: erst die Zurueckgehaltenen,
  // dann jeden Block, der wegen eines fehlenden Vorgaengers liegen blieb.
  for (let runde = 0; runde < 6; runde++) {
    for (const k of [...wartend.splice(0), ...bekannt]) {
      if (!paar.neu.store.has(k.g.hash)) sende(k);
    }
  }
  for (const k of bekannt) assert.ok(paar.neu.store.has(k.g.hash), `Block ${k.hoehe} fehlt am Ende`);

  assert.ok(angenommen >= 44, `${angenommen} angenommen`);
  assert.ok(zurueckgestellt >= 1, 'Mindestens ein Block soll vor seinem Vorgänger ankommen');
  assert.ok(reorgs >= 1, 'Mindestens ein Zweigwechsel soll vorkommen');
  stand(paar, 'nach dem Baum', true);
});

test('Vergleich: bei gleicher Arbeit gewinnt der kleinere Hash, in beiden Fassungen', () => {
  // Vier Geschwister auf dem Kopf: gleiche Hoehe, gleiche Difficulty, also
  // gleiche Arbeit. Es entscheidet allein der Hash.
  const kopf = gliedZu(paar.neu.chain.tip()!.hash);
  let kleinster: string | null = null;
  let wechsel = 0, geblieben = 0;
  for (let i = 0; i < 4; i++) {
    const g = kind(kopf, { miner: MINER_B, extra: `gleich-${i}`, abstand: 600n });
    const vorher = toHex(paar.neu.chain.tip()!.hash);
    const antw = gib(paar, g.g.body, `Geschwister ${i}`);
    assert.ok(antw.ok, zeig(lesbar(antw)));
    const h = toHex(g.g.hash);
    if (kleinster === null || h < kleinster) kleinster = h;
    assert.equal(toHex(paar.neu.chain.tip()!.hash), kleinster, `nach Geschwister ${i}`);
    if (i > 0) { if (toHex(paar.neu.chain.tip()!.hash) !== vorher) wechsel++; else geblieben++; }
  }
  // Mit dieser festen Kette kommt beides vor: ein Wechsel und ein Bleiben.
  assert.ok(wechsel + geblieben === 3);
  stand(paar, 'nach den Geschwistern', true);
});

test('Vergleich: ein zweiter Genesis-Block und seine Nachfolger', () => {
  // Ein Zweig ohne jeden gemeinsamen Block mit der aktiven Kette. Sein
  // Zustand beginnt leer, nicht bei einer Marke.
  const g2 = kind(null, { miner: MINER_B, extra: 'zweiter-genesis' });
  assert.ok(gib(paar, g2.g.body, 'zweiter Genesis').ok);
  // Ein anderer Zweig-Block dazwischen -- danach steht der Merker nicht
  // mehr beim zweiten Genesis, und dessen Zustand muss gerechnet werden.
  const kopf = gliedZu(paar.neu.chain.tip()!.hash);
  assert.ok(gib(paar, kind(kopf.eltern!, { miner: MINER_B, extra: 'dazwischen-1', abstand: 640n }).g.body,
    'dazwischen').ok);
  const g2a = kind(g2, { miner: MINER_B, extra: 'g2-kind', abstand: 600n });
  assert.ok(gib(paar, g2a.g.body, 'Kind des zweiten Genesis').ok);
  assert.ok(gib(paar, kind(kopf.eltern!, { miner: MINER_B, extra: 'dazwischen-2', abstand: 650n }).g.body,
    'dazwischen').ok);
  assert.ok(gib(paar, kind(g2a, { miner: MINER_B, extra: 'g2-enkel', abstand: 600n }).g.body,
    'Enkel des zweiten Genesis').ok);
  erwarteGrund(gib(paar, kind(g2a, { extra: 'g2-falsch',
    falsch: { aufZustand: kopf.state } }).g.body, 'falsche Wurzel am zweiten Genesis'),
    'state_root', 'zweiter Genesis');
  assert.equal(toHex(paar.neu.chain.tip()!.hash), toHex(kopf.g.hash), 'Die aktive Kette bleibt');
  stand(paar, 'nach dem zweiten Genesis', true);
});

/** Ein Neustart ist ein neuer Verwalter auf derselben Ablage. */
function neustart(p: Paar) {
  p.neu.chain = new ChainManager(p.neu.store, p.params);
  p.alt.chain = new Referenz(p.alt.store, p.params);
}

test('Vergleich: nach einem Neustart stehen beide am selben Punkt und laufen gleich weiter', () => {
  // Vor dem Neustart ist ein Nebenzweig halb angekommen.
  const kopf = gliedZu(paar.neu.chain.tip()!.hash);
  const fuss = kopf.eltern!.eltern!.eltern!;
  const z1 = kind(fuss, { miner: MINER_B, extra: 'halb-1', abstand: 660n });
  const z2 = kind(z1, { miner: MINER_B, extra: 'halb-2', abstand: 600n });
  assert.ok(gib(paar, z1.g.body, 'halber Zweig 1').ok);
  assert.ok(gib(paar, z2.g.body, 'halber Zweig 2').ok);

  const vorher = toHex(paar.neu.chain.tip()!.hash);
  const wurzel = toHex(stateRoot(paar.neu.chain.state()));
  neustart(paar);
  assert.equal(toHex(paar.neu.chain.tip()!.hash), vorher);
  assert.equal(toHex(stateRoot(paar.neu.chain.state())), wurzel);
  stand(paar, 'nach dem Neustart', true);

  // Die neue Fassung auf der Ablage der alten: Sie liest, was die alte
  // geschrieben hat, und kommt auf denselben Stand.
  const gekreuzt = new ChainManager(paar.alt.store, REGTEST);
  assert.equal(toHex(gekreuzt.tip()!.hash), vorher);
  assert.equal(toHex(stateRoot(gekreuzt.state())), wurzel);

  // Der Nebenzweig geht weiter. Der Merker ist mit dem Neustart weg: Der
  // Zustand unter dem dritten Block wird von der Marke aus gerechnet.
  let z: Glied = z2;
  for (let i = 3; i <= 5; i++) {
    z = kind(z, { miner: MINER_B, extra: `halb-${i}`, abstand: 600n });
    const antw = gib(paar, z.g.body, `halber Zweig ${i} nach Neustart`);
    assert.ok(antw.ok, zeig(lesbar(antw)));
  }
  assert.equal(toHex(paar.neu.chain.tip()!.hash), toHex(z.g.hash), 'Der Zweig hat übernommen');

  // Und am neuen Kopf weiter.
  for (let i = 0; i < 2; i++) {
    z = kind(z, { extra: `nach-neustart-${i}`, abstand: 650n });
    assert.ok(gib(paar, z.g.body, `am Kopf nach Neustart ${i}`).ok);
  }
  stand(paar, 'nach dem Weiterlaufen', true);
});

test('Vergleich: ein Block, der gespeichert, aber noch nicht aktiv ist (Absturz mittendrin)', () => {
  /*
    accept() speichert einen Block und waehlt danach die beste Kette. Faellt
    der Knoten dazwischen aus, liegt ein gueltiger Block in der Ablage, der
    die meiste Arbeit hat, aber nicht aktiv ist. Das wird hier nachgestellt:
    Der Block kommt direkt in beide Ablagen, dann der Neustart.

    Der naechste angenommene Block ist dann NICHT der beste -- die
    Abkuerzung fuer die blosse Verlaengerung darf nicht greifen.
  */
  const kopf = gliedZu(paar.neu.chain.tip()!.hash);
  const liegen = kind(kopf, { extra: 'liegengeblieben', abstand: 600n });
  const enkel = kind(liegen, { extra: 'liegengeblieben-kind', abstand: 600n });
  for (const s of [paar.neu.store, paar.alt.store]) {
    let arbeit = s.get(kopf.g.hash)!.chainWork;
    for (const k of [liegen, enkel]) {
      const h = k.g.block.header;
      arbeit += blockWork(h.difficulty);
      const eintrag: StoredBlock = {
        hash: k.g.hash, height: h.height, prevHash: h.prevHash, chainWork: arbeit,
        difficulty: h.difficulty, blockTime: h.timestamp, merkleRoot: h.merkleRoot,
        stateRoot: h.stateRoot, txCount: k.g.block.txs.length, body: k.g.body,
        status: 'valid', mainChain: false,
      };
      s.put(eintrag);
    }
  }
  neustart(paar);
  assert.equal(toHex(paar.neu.chain.tip()!.hash), toHex(kopf.g.hash), 'Der Neustart aktiviert nichts');

  // Irgendein anderer Block: Danach muessen die liegengebliebenen aktiv sein.
  const seite = kind(kopf.eltern!, { miner: MINER_B, extra: 'nach-absturz', abstand: 670n });
  const antw = gib(paar, seite.g.body, 'erster Block nach dem Absturz');
  assert.ok(antw.ok && antw.stored, zeig(lesbar(antw)));
  assert.deepEqual(antw.ok && antw.stored ? antw.neu.map(b => toHex(b.hash)) : [],
    [toHex(liegen.g.hash), toHex(enkel.g.hash)]);
  assert.equal(toHex(paar.neu.chain.tip()!.hash), toHex(enkel.g.hash));
  assert.equal(toHex(stateRoot(paar.neu.chain.state())), toHex(stateRoot(enkel.state)));
  stand(paar, 'nach dem Absturz', true);

  // Und normal weiter.
  const weiter = kind(enkel, { extra: 'nach-absturz-weiter', abstand: 600n });
  assert.ok(gib(paar, weiter.g.body, 'weiter nach dem Absturz').ok);
  stand(paar, 'am Ende', true);
});

test('Eine beschädigte Marke wird nicht benutzt', () => {
  /*
    Nur die neue Fassung: Sie rechnet den Zustand eines Nebenzweigs von
    einer Marke aus. Die Marke muss zur Wurzel passen, die im Block ihrer
    Hoehe steht -- sonst wird von Block 0 an gerechnet.

    Hier bekommt ein fremdes Konto in der Marke ein Guthaben, das es nie
    gab -- und die Marke traegt die dazu passende Wurzel, ist also in sich
    stimmig. Auffallen kann sie nur am Vergleich mit der Wurzel im Block.
    Zwei Bloecke werden daran gemessen:

      - ein ehrlicher Block auf dem wahren Zustand: muss angenommen werden;
      - ein Block, der genau zur gefaelschten Marke passt: muss abgelehnt
        werden. Wuerde der Knoten der Marke glauben, naehme er ihn an.
  */
  const store = paar.neu.store;
  const chain = paar.neu.chain;
  const marke = store.snapshotAtOrBelow(chain.height())!;
  assert.equal(marke.height, 200, 'Die jüngste Marke der aktiven Kette liegt auf Höhe 200');
  const fremd = toHex(new Uint8Array(20).fill(0x66));
  const gefaelscht: typeof marke.accounts = [...marke.accounts,
    [fremd, { balance: 1_000_000n * UNIT, nonce: 0n }]];
  const gefaelschteWurzel = stateRoot(new Map(gefaelscht.map(([a, k]) => [a, { ...k }])));
  store.dropSnapshotsAbove(marke.height - 1);
  store.putSnapshot({ ...marke, stateRoot: gefaelschteWurzel, accounts: gefaelscht });
  const liegt = store.snapshotAtOrBelow(chain.height())!;
  assert.equal(liegt.height, 200);
  assert.equal(toHex(liegt.stateRoot), toHex(gefaelschteWurzel), 'Die gefälschte Marke liegt in der Ablage');

  // Vorgaenger: ein Block der aktiven Kette ueber der Marke, nicht der Kopf.
  const anker = gliedZu(store.mainAt(203)!.hash);
  assert.notEqual(toHex(anker.g.hash), toHex(chain.tip()!.hash));

  // Der Zustand, den ein Knoten errechnete, der der Marke glaubte.
  const falscherZustand: State = new Map(gefaelscht.map(([a, k]) => [a, { ...k }]));
  for (let h = 201; h <= 203; h++) {
    const r = applyBlock(falscherZustand, deserializeBlock(store.mainAt(h)!.body), REGTEST);
    assert.ok(r.ok);
  }
  assert.notEqual(toHex(stateRoot(falscherZustand)), toHex(stateRoot(anker.state)));

  const vorher = toHex(chain.tip()!.hash);
  const passend = kind(anker, { miner: MINER_B, extra: 'zur-falschen-marke',
    falsch: { aufZustand: falscherZustand } });
  const r1 = chain.accept(passend.g.body);
  assert.ok(!r1.ok, 'Ein Block, der zur gefälschten Marke passt, darf nicht angenommen werden');
  assert.equal((r1 as { grund: string }).grund, 'state_root');

  const ehrlich = kind(anker, { miner: MINER_B, extra: 'ehrlich', abstand: 680n });
  const r2 = chain.accept(ehrlich.g.body);
  assert.ok(r2.ok, `Der ehrliche Block muss angenommen werden: ${zeig(lesbar(r2))}`);
  assert.equal(toHex(chain.tip()!.hash), vorher, 'Die aktive Kette bleibt');
});

test('Vergleich: die ersten Blöcke der echten Kette', () => {
  const kette = JSON.parse(readFileSync(
    new URL('./fixtures/kette-0-14.json', import.meta.url), 'utf8')) as
    { height: number; hash: string; body: string }[];
  const echt = knoten(MAINNET);
  // Auch ausser der Reihe: erst die zweite Haelfte (wird zurueckgestellt),
  // dann alles von vorn.
  for (const b of kette.slice(8)) {
    erwarteGrund(gib(echt, fromHex(b.body), `echt ${b.height} zu früh`), 'vorgaenger_fehlt',
      `echt ${b.height}`);
  }
  for (const b of kette) {
    const antw = gib(echt, fromHex(b.body), `echt ${b.height}`);
    assert.ok(antw.ok, `Block ${b.height}: ${zeig(lesbar(antw))}`);
  }
  assert.equal(toHex(echt.neu.chain.tip()!.hash), kette[14].hash);
  stand(echt, 'echte Kette', true);
  echt.neu.store.close(); echt.alt.store.close();
});
