/**
 * Eine erreichte Aktivierungshoehe laesst sich nicht verschieben
 * (docs/CONSENSUS_V6.md, Abschnitt 14).
 *
 * Hat eine Ablage die Hoehe von Fassung 6 erreicht, startet der Knoten mit
 * einer anderen Hoehe -- oder ganz ohne -- nicht mehr. Ohne diese Sperre
 * wuerde er die gueltige Kette still verwerfen oder Bloecke annehmen, die
 * nach seinen Regeln ungueltig sind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST, regtestMitV6 } from '../src/lib/core/networks.ts';
import { deserializeBlock } from '../src/lib/core/block.ts';
import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { baueKette, zeig } from './helpers/regtest.ts';

function ablage(): { pfad: string; weg: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'yskar-akt-'));
  return { pfad: join(dir, 'chain.db'), weg: () => rmSync(dir, { recursive: true, force: true }) };
}

function oeffne(pfad: string, params = REGTEST) {
  return new ChainStore(pfad, { network: params.network, chainId: params.chainId });
}

const P = regtestMitV6(3);

function mitV6Kette(pfad: string, n = 6) {
  const store = oeffne(pfad, P);
  const chain = new ChainManager(store, P);
  for (const b of baueKette(n, { params: P }).bloecke) {
    const r = chain.accept(b.body);
    assert.ok(r.ok, zeig(r));
  }
  return { store, chain };
}

test('Kette ueber die Hoehe: Hoehe steht in meta, Kopf traegt Fassung 6', () => {
  const a = ablage();
  try {
    const { store, chain } = mitV6Kette(a.pfad);
    assert.equal(store.meta(ChainManager.V6_ERREICHT), '3');
    assert.equal(deserializeBlock(store.mainTip()!.body).header.version, 6);
    assert.equal(chain.height(), 5);
    store.close();
  } finally { a.weg(); }
});

test('Vor der Hoehe wird nichts festgeschrieben', () => {
  const a = ablage();
  try {
    const { store } = mitV6Kette(a.pfad, 3);    // Hoehen 0..2
    assert.equal(store.meta(ChainManager.V6_ERREICHT), null);
    store.close();
    // Eine Verschiebung VOR dem Erreichen ist moeglich (Abstimmung, Vorbereitung).
    const s2 = oeffne(a.pfad, P);
    const c2 = new ChainManager(s2, regtestMitV6(10));
    assert.equal(c2.height(), 2);
    s2.close();
  } finally { a.weg(); }
});

test('Spaetere Hoehe nach dem Erreichen: Start verweigert', () => {
  const a = ablage();
  try {
    mitV6Kette(a.pfad).store.close();
    const s = oeffne(a.pfad, P);
    assert.throws(() => new ChainManager(s, regtestMitV6(4)), /at height 3; this program uses 4.*cannot be moved/s);
    // Die Ablage bleibt unangetastet.
    assert.equal(s.mainTip()!.height, 5);
    s.close();
  } finally { a.weg(); }
});

test('Fruehere Hoehe nach dem Erreichen: Start verweigert, nichts abgeschnitten', () => {
  const a = ablage();
  try {
    mitV6Kette(a.pfad).store.close();
    const s = oeffne(a.pfad, P);
    assert.throws(() => new ChainManager(s, regtestMitV6(2)), /cannot be moved/);
    assert.equal(s.mainTip()!.height, 5);
    s.close();
  } finally { a.weg(); }
});

test('Programm ohne Hoehe auf einer Ablage, die sie erreicht hat: Start verweigert', () => {
  const a = ablage();
  try {
    mitV6Kette(a.pfad).store.close();
    const s = oeffne(a.pfad, P);
    assert.throws(() => new ChainManager(s, REGTEST), /this program uses none/);
    assert.equal(s.mainTip()!.height, 5);
    s.close();
  } finally { a.weg(); }
});

test('Ablage ohne Eintrag, aber mit Bloecken der Fassung 6: Start verweigert', () => {
  const a = ablage();
  try {
    const { store } = mitV6Kette(a.pfad);
    store.close();
    // Ablage aus der Zeit vor der Sperre: Der Eintrag fehlt.
    const roh = oeffne(a.pfad, P);
    (roh as any).db.prepare('delete from meta where key = ?').run(ChainManager.V6_ERREICHT);
    assert.equal(roh.meta(ChainManager.V6_ERREICHT), null);
    roh.close();
    const s = oeffne(a.pfad, P);
    assert.throws(() => new ChainManager(s, REGTEST), /revision 6 block.*does not activate.*another chain/s);
    s.close();
  } finally { a.weg(); }
});

test('Gleiche Hoehe: Neustart laeuft normal weiter', () => {
  const a = ablage();
  try {
    mitV6Kette(a.pfad).store.close();
    const s = oeffne(a.pfad, P);
    const c = new ChainManager(s, P);
    assert.equal(c.height(), 5);
    s.close();
  } finally { a.weg(); }
});

test('Eine unlesbare Marke (kaputter Schluessel) haelt den Start nicht auf -- es wird von vorn gerechnet', () => {
  const a = ablage();
  try {
    const { store, chain } = mitV6Kette(a.pfad);
    const b3 = store.mainAt(3)!;
    store.putSnapshot({ hash: b3.hash, height: 3, stateRoot: b3.stateRoot,
      accounts: [['NICHT-HEX', { balance: 1n, nonce: 0n }]] });
    const hoehe = chain.height();
    store.close();
    const s = oeffne(a.pfad, P);
    const c = new ChainManager(s, P);
    assert.equal(c.height(), hoehe);
    s.close();
  } finally { a.weg(); }
});
