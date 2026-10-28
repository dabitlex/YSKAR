/**
 * Regtest mit frei waehlbarer Aktivierungshoehe fuer Fassung 6
 * (--v6-height, CONSENSUS_V6.md 14 "Fork behaviour").
 *
 * Wofuer: Alte und neue Knoten sollen auf EINEM Rechner nebeneinander
 * laufen, bis zur Hoehe dieselbe Kette teilen und sich ab der Hoehe
 * trennen. Dafuer muss der neue Knoten dieselbe Netzkennung und Chain-ID
 * haben wie ein alter Regtest-Knoten -- nur die Hoehe unterscheidet sich.
 *
 * Und was nicht passieren darf: Die Option wirkt auf das Mainnet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST, MAINNET, regtestMitV6 } from '../src/lib/core/networks.ts';
import { V6_HEIGHT_UNSET } from '../src/lib/core/params.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { emptyState, applyBlock } from '../src/lib/core/state.ts';
import { mineBlock } from './helpers/regtest.ts';

const CLI = new URL('../src/lib/node/fullnode/cli.ts', import.meta.url).pathname;

function knoten(args: string[]) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args],
    { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
}

test('regtestMitV6: Netz und Chain-ID wie REGTEST, nur die Hoehe ist anders', () => {
  const p = regtestMitV6(10);
  assert.equal(p.v6Height, 10);
  assert.equal(p.network, REGTEST.network);
  assert.equal(toHex(p.chainId), toHex(REGTEST.chainId));
  assert.notEqual(toHex(p.chainId), toHex(MAINNET.chainId));
  // REGTEST selbst bleibt ohne Fassung 6.
  assert.equal(REGTEST.v6Height, V6_HEIGHT_UNSET);
  for (const falsch of [0, -1, 1.5, Number.NaN, V6_HEIGHT_UNSET]) {
    assert.throws(() => regtestMitV6(falsch), /ganze Zahl ab 1/, String(falsch));
  }
});

test('regtestMitV6: Kette ueber die gewaehlte Hoehe -- alte Regeln davor, Fassung 6 ab da', () => {
  const P = regtestMitV6(3);
  const store = new ChainStore(':memory:', { network: P.network, chainId: P.chainId });
  const chain = new ChainManager(store, P);
  const zustand = emptyState();
  let prev = new Uint8Array(32);
  const start = 1_788_912_000n;
  for (let h = 0; h < 6; h++) {
    const g = mineBlock({ height: h, prevHash: prev, state: zustand, params: P,
      timestamp: start + BigInt(h) * P.targetBlockTime });
    assert.equal(g.block.header.version >= 6, h >= 3, `Version bei Hoehe ${h}`);
    assert.ok(applyBlock(zustand, g.block, P).ok);
    assert.equal(chain.accept(g.body).ok, true, `Hoehe ${h}`);
    prev = g.hash;
  }
  assert.equal(chain.height(), 5);
  store.close();
});

test('--v6-height: nur mit --regtest, nur ganze Zahlen ab 1, Mainnet unberuehrt', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'yskar-v6-hoehe-'));
  try {
    const ohneRegtest = knoten(['status', '--v6-height', '10', '--data', join(ordner, 'a')]);
    assert.equal(ohneRegtest.code, 1);
    assert.match(ohneRegtest.text, /--v6-height only works with --regtest/);

    for (const falsch of ['0', 'abc', '1.5', '-3']) {
      const r = knoten(['status', '--regtest', '--v6-height', falsch, '--data', join(ordner, 'b')]);
      assert.equal(r.code, 1, `--v6-height ${falsch}`);
      assert.match(r.text, /whole number from 1/, `--v6-height ${falsch}`);
    }

    const gut = knoten(['status', '--regtest', '--v6-height', '10', '--data', join(ordner, 'c')]);
    assert.equal(gut.code, 0, gut.text);
    assert.match(gut.text, /revision 6 from block 10/);

    // Derselbe Ordner ohne die Option: ein gewoehnlicher Regtest-Knoten. Die
    // Ablage gehoert zum selben Netz, nur die Hoehe ist nicht gesetzt.
    const ohne = knoten(['status', '--regtest', '--data', join(ordner, 'c')]);
    assert.equal(ohne.code, 0, ohne.text);
    assert.match(ohne.text, /no activation height for revision 6 is set/);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('Erreichte Hoehe, anderes Programm: Start verweigert -- und kein Rat, die Ablage zu loeschen', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'yskar-v6-fest-'));
  try {
    const P = regtestMitV6(3);
    const store = new ChainStore(join(ordner, 'd', 'chain.db'), { network: P.network, chainId: P.chainId });
    const chain = new ChainManager(store, P);
    const zustand = emptyState();
    let prev = new Uint8Array(32);
    for (let h = 0; h < 5; h++) {
      const g = mineBlock({ height: h, prevHash: prev, state: zustand, params: P,
        timestamp: 1_788_912_000n + BigInt(h) * P.targetBlockTime });
      assert.ok(applyBlock(zustand, g.block, P).ok);
      assert.ok(chain.accept(g.body).ok);
      prev = g.hash;
    }
    store.close();
    const r = knoten(['status', '--regtest', '--v6-height', '4', '--data', join(ordner, 'd')]);
    assert.equal(r.code, 1, r.text);
    assert.match(r.text, /cannot be moved/);
    assert.match(r.text, /Do NOT delete the folder/);
    assert.doesNotMatch(r.text, /entfernen und neu synchronisieren/);
    // Mit der passenden Hoehe laeuft er.
    const gut = knoten(['status', '--regtest', '--v6-height', '3', '--data', join(ordner, 'd')]);
    assert.equal(gut.code, 0, gut.text);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});
