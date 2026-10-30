/**
 * yskar-opencl im Node Core -- AMD- und Intel-Karten.
 *
 * Diese Tests starten das ECHTE Programm gpu/bin/yskar-opencl mit seinem
 * echten OpenCL-Kernel. Ohne Grafikkarte rechnet es auf einer OpenCL-
 * Laufzeit fuer den Prozessor (etwa PoCL, `pip install pyopencl
 * pocl-binary-distribution`); YSKAR_OPENCL_CPU=1 laesst dafuer Prozessoren
 * als Geraet zu, und das Programm meldet sich dann als Nachbildung.
 *
 * Bewiesen wird damit: Der Kernel rechnet bitgenau, Erkennung, Selbsttest,
 * Protokoll und Einreichung stimmen, Bloecke aus OpenCL-Treffern besteht der
 * Knoten mit voller Pruefung, CUDA- und OpenCL-Karten laufen nebeneinander.
 *
 * NICHT bewiesen: dass eine bestimmte AMD- oder Intel-Karte richtig und
 * schnell rechnet. Das zeigt nur ein Lauf auf der Karte -- Selbsttest und
 * --bench, siehe gpu/README.md.
 *
 * Ohne gebautes Programm oder ohne OpenCL-Laufzeit werden die Tests
 * uebersprungen.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { REGTEST } from '../../src/lib/core/networks.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { GpuMiner, erkenneGpu, pruefeGpu, OPENCL_ID_BASIS, OPENCL_SELBSTTEST_MS } from '../src/GpuMiner.ts';
import { GpuGruppe } from '../src/GpuGruppe.ts';

const BIN = join(import.meta.dirname, '..', 'gpu', 'bin');
const OCL = join(BIN, process.platform === 'win32' ? 'yskar-opencl.exe' : 'yskar-opencl');
const EMU = join(BIN, 'yskar-cuda-emu');
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

before(() => { process.env.YSKAR_OPENCL_CPU = '1'; });

function laufzeit(): string | false {
  if (!existsSync(OCL)) return 'gpu/bin/yskar-opencl fehlt -- zuerst: npm run build:opencl:linux';
  const r = spawnSync(OCL, ['--probe'], { env: { ...process.env, YSKAR_OPENCL_CPU: '1' }, encoding: 'utf8' });
  return r.status === 0 ? false : 'keine OpenCL-Laufzeit auf diesem Rechner';
}
const grund = laufzeit();
const opt = { skip: grund, timeout: 240_000 };

function knoten() {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, new TxPool(), REGTEST, () => {
    const t = uhr; uhr += REGTEST.targetBlockTime; return t;
  });
  return { store, chain, mining };
}

test('Erkennung: OpenCL-Geraete mit eigener Kennung ab 32', opt, async () => {
  const e = await erkenneGpu(undefined, OCL);
  assert.equal(e.verfuegbar, true, String(e.grund));
  const g = e.geraete[0];
  assert.equal(g.api, 'opencl');
  assert.equal(g.id, OPENCL_ID_BASIS);
  assert.equal(g.nr, 0);
  assert.equal(g.programm, OCL);
  assert.equal(g.emulation, true, 'Ein Prozessor muss sich als Nachbildung zu erkennen geben');
});

test('Erkennung: CUDA und OpenCL in einer Liste, ohne doppelte Kennung', { ...opt, skip: grund || (existsSync(EMU) ? false : 'yskar-cuda-emu fehlt') }, async () => {
  const e = await erkenneGpu(EMU, OCL);
  assert.equal(e.verfuegbar, true);
  const cuda = e.geraete.filter(g => g.api === 'cuda');
  const ocl = e.geraete.filter(g => g.api === 'opencl');
  assert.ok(cuda.length >= 1 && ocl.length >= 1, JSON.stringify(e.geraete));
  const ids = e.geraete.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(e.programme, { cuda: EMU, opencl: OCL });
});

test('Ohne passende Karte: allgemeines Kuerzel, kein Absturz', opt, async () => {
  const vorher = process.env.YSKAR_OPENCL_CPU;
  delete process.env.YSKAR_OPENCL_CPU;
  try {
    const e = await erkenneGpu(undefined, OCL);
    assert.equal(e.verfuegbar, false);
    assert.equal(e.grundCode, 'gpu_keine_karte');
  } finally { process.env.YSKAR_OPENCL_CPU = vorher; }
});

test('Selbsttest auf dem OpenCL-Geraet: Genesis-Hash bitgenau', opt, async () => {
  const r = await pruefeGpu(OCL, 0, OPENCL_SELBSTTEST_MS);
  assert.equal(r.ok, true, String(r.grund));
  assert.equal(r.hash, '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66');
  assert.equal(r.pruefungen.length, 3);
});

test('Treffer aus dem OpenCL-Kernel werden Bloecke, die der Knoten voll prueft', opt, async () => {
  const k = knoten();
  const gefunden: number[] = [];
  const gpu = new GpuMiner({
    mining: k.mining,
    onBlock: h => { gefunden.push(h); k.mining.invalidate(); gpu.notifyChainChanged(); },
  });
  const geraet = (await erkenneGpu(undefined, OCL)).geraete[0];
  await gpu.start(new Uint8Array(20).fill(0x42), geraet);
  for (let i = 0; i < 240 && k.chain.height() < 3; i++) await warte(250);
  const st = gpu.status();
  await gpu.stop();

  assert.ok(k.chain.height() >= 3, `nur Hoehe ${k.chain.height()} erreicht (${st.lastError ?? 'kein Fehler'})`);
  for (const h of gefunden) assert.ok(k.store.mainAt(h), `Block ${h} fehlt in der Kette`);
  assert.equal(st.selftest?.ok, true);
  assert.ok(st.hashes > 0, 'keine Hashes gemeldet');
  k.store.close();
});

test('CUDA- und OpenCL-Karte rechnen nebeneinander in einer Gruppe', { ...opt, skip: grund || (existsSync(EMU) ? false : 'yskar-cuda-emu fehlt') }, async () => {
  const k = knoten();
  const gruppe = new GpuGruppe({
    mining: k.mining,
    onBlock: () => { k.mining.invalidate(); gruppe.notifyChainChanged(); },
  });
  const e = await erkenneGpu(EMU, OCL);
  const r = await gruppe.start(new Uint8Array(20).fill(0x24), e.geraete, async () => null);
  assert.equal(r.fehlgeschlagen.length, 0, JSON.stringify(r.fehlgeschlagen));
  // Der OpenCL-Kernel wird beim Start erst uebersetzt -- warten, bis beide melden.
  const beide = () => gruppe.status().karten.every(c => c.hashes > 0);
  for (let i = 0; i < 480 && (k.chain.height() < 4 || !beide()); i++) await warte(250);
  const st = gruppe.status();
  await gruppe.stop();

  assert.ok(k.chain.height() >= 4, `nur Hoehe ${k.chain.height()}`);
  assert.equal(st.karten.length, e.geraete.length);
  assert.ok(st.karten.some(c => c.device?.api === 'opencl'));
  assert.ok(st.karten.every(c => c.hashes > 0), JSON.stringify(st.karten.map(c => [c.id, c.hashes, c.lastError])));
  k.store.close();
});
