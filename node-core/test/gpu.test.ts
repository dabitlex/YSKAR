/**
 * GPU-Miner im Node Core.
 *
 * WICHTIG ZUR EINORDNUNG: Diese Tests laufen gegen die CPU-NACHBILDUNG des
 * CUDA-Programms (gleicher Quelltext, mit -DYSKAR_CPU_EMULATION uebersetzt).
 * Sie beweisen, dass Erkennung, Protokoll, Jobwechsel, Einreichung und
 * Fehlerbehandlung stimmen -- und dass die Rechnung dieselbe ist wie im
 * Knoten.
 *
 * Sie beweisen NICHT, dass eine Grafikkarte arbeitet. Das kann nur ein
 * Lauf auf einem Rechner mit NVIDIA-GPU zeigen; siehe gpu/README.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { REGTEST } from '../../src/lib/core/networks.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { GpuMiner, erkenneGpu, pruefeGpu } from '../src/GpuMiner.ts';

/** Die Zeilen, mit denen ein korrekt rechnendes Programm den Selbsttest besteht. */
const SELBSTTEST_OK = [
  '{"t":"selftest","hash":"000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66"}',
  '{"t":"selftest","ok":true,"check":"Genesis-Hash bitgenau"}',
  '{"t":"selftest","ok":true,"check":"Genesis-Nonce als Treffer erkannt"}',
  '{"t":"selftest","ok":true,"check":"Nonce daneben ist kein Treffer"}',
  '{"t":"selftest","result":"PASSED"}',
].map(z => `echo '${z}'`).join('\n');

const EMU = join(import.meta.dirname, '..', 'gpu', 'bin', 'yskar-cuda-emu');
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

function knoten() {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  // Gesetzte Uhr: Difficulty bleibt bei 1, unabhaengig von der Maschine.
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, new TxPool(), REGTEST, () => {
    const t = uhr; uhr += REGTEST.targetBlockTime; return t;
  });
  return { store, chain, mining };
}

test('Nachbildung vorhanden', () => {
  assert.ok(existsSync(EMU),
    'gpu/bin/yskar-cuda-emu fehlt -- zuerst: npm run build:gpu-emu');
});

// ------------------------------------------------------------- Erkennung

test('Die Erkennung findet das Geraet', async () => {
  const e = await erkenneGpu(EMU);
  assert.equal(e.verfuegbar, true, String(e.grund));
  assert.equal(e.geraete.length, 1);
  assert.equal(e.geraete[0].emulation, true,
    'Die Nachbildung muss sich als solche zu erkennen geben');
});

test('Ohne Programm: nicht verfuegbar, aber kein Absturz', async () => {
  const e = await erkenneGpu('/gibt/es/nicht/yskar-cuda');
  // findeProgramm faellt auf die ueblichen Orte zurueck -- im Testbaum
  // liegt dort nichts unter dem echten Namen.
  if (e.programm === null) {
    assert.equal(e.verfuegbar, false);
    assert.match(String(e.grund), /nicht installiert/);
  }
});

test('Ein Programm, das sofort abbricht, wird sauber gemeldet', async () => {
  // Stellt einen kaputten Treiber nach: Das Programm startet und stirbt.
  const kaputt = join(tmpdir(), `yskar-kaputt-${process.pid}`);
  writeFileSync(kaputt, '#!/bin/sh\necho \'{"t":"error","message":"CUDA-Treiber fehlt"}\'\nexit 2\n');
  chmodSync(kaputt, 0o755);

  const e = await erkenneGpu(kaputt);
  assert.equal(e.verfuegbar, false);
  assert.match(String(e.grund), /CUDA-Treiber fehlt/);
});

// --------------------------------------------------------------- Mining

test('Der GPU-Weg findet Bloecke, die der Knoten selbst prueft', async () => {
  const k = knoten();
  const gefunden: number[] = [];
  const gpu = new GpuMiner({
    mining: k.mining, programm: EMU,
    onBlock: h => { gefunden.push(h); k.mining.invalidate(); gpu.notifyChainChanged(); },
  });
  const geraet = (await erkenneGpu(EMU)).geraete[0];

  await gpu.start(new Uint8Array(20).fill(0x42), geraet);
  for (let i = 0; i < 60 && k.chain.height() < 2; i++) await warte(250);
  await gpu.stop();

  assert.ok(k.chain.height() >= 2, `nur Hoehe ${k.chain.height()} erreicht`);
  assert.ok(gefunden.length >= 3, `nur ${gefunden.length} Bloecke gemeldet`);

  // Jeder Block steht in der Kette -- also hat accept() ihn vollstaendig
  // geprueft: Header, PoW, Merkle, Zustandswurzel.
  for (const h of gefunden) assert.ok(k.store.mainAt(h), `Block ${h} fehlt in der Kette`);
  assert.equal(gpu.status().running, false);
  k.store.close();
});

test('Die gemeldete Hashrate ist plausibel', async () => {
  const k = knoten();
  const gpu = new GpuMiner({ mining: k.mining, programm: EMU });
  // Unerreichbares Ziel gibt es nicht -- also Difficulty hoch genug, dass
  // in drei Sekunden kein Treffer die Zaehlung stoert. Dafuer reicht hier
  // schlicht: die Rate lesen, solange noch kein Block gefunden wurde.
  await gpu.start(new Uint8Array(20).fill(0x11), (await erkenneGpu(EMU)).geraete[0]);
  await warte(3500);
  const s = gpu.status();
  await gpu.stop();

  assert.ok(s.hashes > 0, 'keine Hashes gezaehlt');
  assert.ok(s.hashrate > 0, 'keine Hashrate');
  // Ein CPU-Faden schafft keine 50 MH/s -- vorher meldete die Nachbildung
  // 82 MH/s, weil abgebrochene Stapel voll gezaehlt wurden.
  assert.ok(s.hashrate < 50e6, `unplausible Hashrate ${s.hashrate}`);
  k.store.close();
});

test('Stoppen beendet das Programm', async () => {
  const k = knoten();
  const gpu = new GpuMiner({ mining: k.mining, programm: EMU });
  await gpu.start(new Uint8Array(20), (await erkenneGpu(EMU)).geraete[0]);
  await warte(500);
  const t0 = Date.now();
  await gpu.stop();
  assert.ok(Date.now() - t0 < 3500, 'Stoppen hat zu lange gedauert');
  assert.equal(gpu.status().running, false);
  assert.equal(gpu.status().hashrate, 0);
  k.store.close();
});

test('Ein Absturz waehrend des Minings haelt den Knoten nicht auf', async () => {
  const k = knoten();
  // Meldet "ready" und stirbt dann -- wie ein Treiber, der mitten im
  // Rechnen abstuerzt.
  // Besteht den Selbsttest -- sonst testete dies den Selbsttest, nicht den
  // Absturz.
  const stirbt = join(tmpdir(), `yskar-stirbt-${process.pid}`);
  writeFileSync(stirbt, `#!/bin/sh
case "$1" in --selftest) ${SELBSTTEST_OK}
  exit 0;; esac
echo '{"t":"ready"}'
sleep 0.3
exit 139
`);
  chmodSync(stirbt, 0o755);

  const gpu = new GpuMiner({ mining: k.mining, programm: stirbt });
  await gpu.start(new Uint8Array(20), { id: 0, name: 'Test', cc: '0.0', vram: 0, sm: 0 });
  await warte(1000);

  const s = gpu.status();
  assert.equal(s.running, false, 'nach dem Absturz noch als laufend gemeldet');
  assert.match(String(s.lastError), /beendet/);
  // Und der Knoten arbeitet weiter.
  assert.doesNotThrow(() => k.mining.createJob(new Uint8Array(20), 1n));
  k.store.close();
});

// ------------------------------------------------------ CPU und GPU zusammen

test('CPU und GPU pruefen nie dieselben Nonces', () => {
  // Getrennte Extranonce -> getrennter Header -> getrennter Suchraum.
  const k = knoten();
  const adr = new Uint8Array(20).fill(7);
  const cpu = k.mining.createJob(adr, 111n);
  const gpu = k.mining.createJob(adr, 222n);
  assert.notEqual(cpu.jobId, gpu.jobId);
  assert.notEqual(cpu.extranonce, gpu.extranonce);
  // Byte 120..127 ist die Extranonce -- dort unterscheiden sich die Header.
  assert.notEqual(cpu.header.slice(240, 256), gpu.header.slice(240, 256));

  // Derselbe Block: gleicher Vorgaenger, gleiche Transaktionen, gleicher
  // Zustand. (Der Zeitstempel darf abweichen -- beide Jobs entstehen zu
  // verschiedenen Zeitpunkten, und die gesetzte Uhr rueckt je Aufruf vor.)
  assert.equal(cpu.height, gpu.height);
  assert.equal(cpu.prevHash, gpu.prevHash);
  assert.equal(cpu.merkleRoot, gpu.merkleRoot);
  assert.equal(cpu.stateRoot, gpu.stateRoot);
  k.store.close();
});

// ------------------------------------------------------------ Selbsttest

test('Der Selbsttest besteht mit korrekt rechnendem Programm', async () => {
  const r = await pruefeGpu(EMU, 0);
  assert.equal(r.ok, true, String(r.grund));
  assert.equal(r.hash, '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66');
  assert.equal(r.pruefungen.length, 3);
});

test('Eine falsch rechnende GPU wird nicht zum Minen zugelassen', async () => {
  /*
    Stellt eine Karte nach, deren Kernel falsch uebersetzt wurde: Sie
    antwortet, aber mit dem falschen Hash. Damit zu minen hiesse, Treffer zu
    melden, die keine sind, und echte zu uebersehen.
  */
  const falsch = join(tmpdir(), `yskar-falsch-${process.pid}`);
  writeFileSync(falsch, `#!/bin/sh
case "$1" in
  --selftest)
    echo '{"t":"selftest","hash":"ffff0000000000000000000000000000000000000000000000000000000000ff"}'
    echo '{"t":"selftest","ok":false,"check":"Genesis-Hash bitgenau"}'
    echo '{"t":"selftest","ok":true,"check":"Genesis-Nonce als Treffer erkannt"}'
    echo '{"t":"selftest","ok":true,"check":"Nonce daneben ist kein Treffer"}'
    echo '{"t":"selftest","result":"FAILED"}'
    exit 1;;
esac
echo '{"t":"ready"}'
sleep 5
`);
  chmodSync(falsch, 0o755);

  const k = knoten();
  const gpu = new GpuMiner({ mining: k.mining, programm: falsch });
  await assert.rejects(
    () => gpu.start(new Uint8Array(20), { id: 0, name: 'Falsch', cc: '5.0', vram: 0, sm: 0 }),
    /rechnet nicht korrekt/);
  assert.equal(gpu.status().running, false, 'trotz falschem Hash gestartet');
  assert.equal(gpu.status().selftest?.ok, false);
  k.store.close();
});

test('Ein Programm ohne Selbsttest-Antwort wird ebenfalls abgelehnt', async () => {
  // Schweigen ist kein Bestehen.
  const stumm = join(tmpdir(), `yskar-stumm-${process.pid}`);
  writeFileSync(stumm, '#!/bin/sh\nexit 0\n');
  chmodSync(stumm, 0o755);
  const r = await pruefeGpu(stumm, 0);
  assert.equal(r.ok, false);
});
