/**
 * Mehrere Grafikkarten zugleich (GpuGruppe).
 *
 * Wie gpu.test.ts gegen die CPU-NACHBILDUNG: Mit YSKAR_EMU_GERAETE=n gibt
 * sie n Karten vor. Geprueft wird, was die Gruppe selbst leistet -- jede
 * Karte ein eigener Prozess mit eigenem Selbsttest und eigener Extranonce,
 * Ausfall einer Karte ohne Folgen fuer die anderen, Summen im Status. Ob
 * echte Karten rechnen, zeigt nur ein Rechner mit mehreren NVIDIA-Karten.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator, type MiningJob } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { REGTEST } from '../../src/lib/core/networks.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { erkenneGpu, type GpuGeraet } from '../src/GpuMiner.ts';
import { GpuGruppe } from '../src/GpuGruppe.ts';
import type { Arbeitsquelle, Einreichung } from '../src/PoolQuelle.ts';
import { kartenAus } from '../src/main.ts';

const EMU = join(import.meta.dirname, '..', 'gpu', 'bin', 'yskar-cuda-emu');
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const ADRESSE = new Uint8Array(20).fill(0x42);

let vorher: string | undefined;
before(() => { vorher = process.env.YSKAR_EMU_GERAETE; process.env.YSKAR_EMU_GERAETE = '3'; });
after(() => {
  if (vorher === undefined) delete process.env.YSKAR_EMU_GERAETE;
  else process.env.YSKAR_EMU_GERAETE = vorher;
});

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

/** Ein Skript, das die Nachbildung aufruft -- ausser in den Faellen, die es verfaelscht. */
function huelle(name: string, inhalt: string): string {
  const pfad = join(tmpdir(), `yskar-${name}-${process.pid}`);
  writeFileSync(pfad, `#!/bin/sh\n${inhalt}\nexec "${EMU}" "$@"\n`);
  chmodSync(pfad, 0o755);
  return pfad;
}

/**
 * Eine Arbeitsquelle, die sich merkt, mit welcher Extranonce gefragt wurde,
 * und die Arbeit beim echten MiningCoordinator holt -- so wie ein Pool.
 */
class ZaehlQuelle implements Arbeitsquelle {
  extranonces = new Set<bigint>();
  treffer = 0;
  private mining: MiningCoordinator;
  constructor(mining: MiningCoordinator) { this.mining = mining; }
  createJob(adresse: Uint8Array, extranonce: bigint, extra?: Uint8Array): MiningJob {
    this.extranonces.add(extranonce);
    return this.mining.createJob(adresse, extranonce, extra);
  }
  submitNonce(jobId: string, nonce: bigint): Einreichung {
    this.treffer++;
    return this.mining.submitNonce(jobId, nonce);
  }
}

test('Die Nachbildung gibt drei Karten vor', async () => {
  const e = await erkenneGpu(EMU);
  assert.equal(e.verfuegbar, true, String(e.grund));
  assert.deepEqual(e.geraete.map(g => g.id), [0, 1, 2]);
  assert.equal(new Set(e.geraete.map(g => g.name)).size, 3, 'Die Karten muessen unterscheidbar heissen');
});

test('Drei Karten minen zugleich, jede mit eigener Quelle und eigener Extranonce', async () => {
  const k = knoten();
  const gefunden: number[] = [];
  const gruppe = new GpuGruppe({
    mining: k.mining, programm: EMU,
    onBlock: h => { gefunden.push(h); k.mining.invalidate(); gruppe.notifyChainChanged(); },
  });
  const geraete = (await erkenneGpu(EMU)).geraete;
  const quellen = new Map<number, ZaehlQuelle>();

  const r = await gruppe.start(ADRESSE, geraete, async g => {
    const q = new ZaehlQuelle(k.mining);
    quellen.set(g.id, q);
    return q;
  });
  assert.deepEqual(r.gestartet.map(g => g.id), [0, 1, 2]);
  assert.deepEqual(r.fehlgeschlagen, []);

  // Bis ein paar Bloecke gefunden sind UND jede Karte schon gezaehlte Hashes gemeldet hat.
  const allePaar = () => gruppe.status().karten.every(c => c.hashes > 0);
  for (let i = 0; i < 80 && (k.chain.height() < 4 || !allePaar()); i++) await warte(250);
  const s = gruppe.status();
  await gruppe.stop();

  // Jede Karte hat ihre eigene Quelle bekommen -- im Pool ist das je eine Sitzung.
  assert.equal(quellen.size, 3);
  // Keine Extranonce kommt bei zwei Karten vor: getrennte Header, getrennter Suchraum.
  const alle = [...quellen.values()].flatMap(q => [...q.extranonces]);
  assert.equal(new Set(alle).size, alle.length, 'Zwei Karten haben dieselbe Extranonce benutzt');

  assert.equal(s.karten.length, 3);
  assert.ok(s.karten.every(c => c.running), 'Nicht alle Karten liefen');
  // Die Summe im Status ist die Summe der Karten.
  const summe = s.karten.reduce((n, c) => n + c.hashrate, 0);
  assert.ok(Math.abs(s.hashrate - summe) < 1e-6, `Summe ${s.hashrate} statt ${summe}`);
  assert.equal(s.hashes, s.karten.reduce((n, c) => n + c.hashes, 0));
  assert.ok(s.karten.every(c => c.hashes > 0), 'Eine Karte hat nichts gerechnet');

  assert.ok(k.chain.height() >= 4, `nur Hoehe ${k.chain.height()} erreicht`);
  for (const h of gefunden) assert.ok(k.store.mainAt(h), `Block ${h} fehlt in der Kette`);
  assert.equal(gruppe.status().running, false);
  k.store.close();
});

test('Nur die gewaehlten Karten rechnen', async () => {
  const k = knoten();
  const gruppe = new GpuGruppe({ mining: k.mining, programm: EMU });
  const geraete = (await erkenneGpu(EMU)).geraete;
  const r = await gruppe.start(ADRESSE, [geraete[2], geraete[0]], async () => null);
  assert.deepEqual(r.gestartet.map(g => g.id), [2, 0]);
  await warte(1500);
  const s = gruppe.status();
  await gruppe.stop();
  assert.deepEqual(s.karten.map(c => c.id), [2, 0]);
  assert.ok(s.karten.every(c => c.running));
  k.store.close();
});

test('Besteht eine Karte den Selbsttest nicht, rechnen die anderen -- und ihre Quelle wird zurueckgegeben', async () => {
  const k = knoten();
  // Karte 1 rechnet "falsch": Ihr Selbsttest faellt durch.
  const programm = huelle('falsch1', `case "$*" in *--selftest*--device\\ 1*)
  echo '{"t":"selftest","hash":"00"}'
  echo '{"t":"selftest","ok":false,"check":"Genesis-Hash bitgenau"}'
  echo '{"t":"selftest","result":"FAILED"}'
  exit 1;;
esac`);
  const gruppe = new GpuGruppe({ mining: k.mining, programm });
  const geraete = (await erkenneGpu(programm)).geraete;
  const zurueck: number[] = [];
  const r = await gruppe.start(ADRESSE, geraete, async g => new ZaehlQuelle(k.mining) as Arbeitsquelle & { id?: number },
    async (g, q) => { assert.ok(q, 'Die Quelle der gescheiterten Karte fehlt'); zurueck.push(g.id); });

  assert.deepEqual(r.gestartet.map(g => g.id), [0, 2]);
  assert.deepEqual(r.fehlgeschlagen.map(f => f.geraet.id), [1]);
  assert.match(r.fehlgeschlagen[0].grund, /rechnet nicht korrekt/);
  assert.deepEqual(zurueck, [1], 'Die Pool-Sitzung der gescheiterten Karte muss abgemeldet werden koennen');

  await warte(1000);
  const s = gruppe.status();
  await gruppe.stop();
  assert.equal(s.running, true);
  assert.deepEqual(s.karten.filter(c => c.running).map(c => c.id), [0, 2]);
  assert.equal(s.karten.find(c => c.id === 1)?.running, false);
  k.store.close();
});

test('Stuerzt eine Karte beim Minen ab, rechnen die anderen weiter', async () => {
  const k = knoten();
  // Karte 2 startet normal und stirbt nach einer Sekunde -- wie ein abgestuerzter Treiber.
  const programm = huelle('absturz2', `case "$*" in --device\\ 2)
  "${EMU}" "$@" & p=$!
  sleep 1; kill -9 $p; exit 3;;
esac`);
  const gruppe = new GpuGruppe({ mining: k.mining, programm });
  const geraete = (await erkenneGpu(programm)).geraete;
  const r = await gruppe.start(ADRESSE, geraete, async () => null);
  assert.equal(r.gestartet.length, 3);

  await warte(2500);
  const s = gruppe.status();
  await gruppe.stop();
  assert.equal(s.karten.find(c => c.id === 2)?.running, false, 'Die abgestuerzte Karte gilt noch als laufend');
  assert.match(String(s.karten.find(c => c.id === 2)?.lastError), /beendet/);
  assert.deepEqual(s.karten.filter(c => c.running).map(c => c.id), [0, 1]);
  assert.equal(s.running, true);
  k.store.close();
});

test('Stoppen beendet alle Karten', async () => {
  const k = knoten();
  const gruppe = new GpuGruppe({ mining: k.mining, programm: EMU });
  await gruppe.start(ADRESSE, (await erkenneGpu(EMU)).geraete, async () => null);
  assert.equal(gruppe.laufend(), 3);
  await gruppe.stop();
  assert.equal(gruppe.laufend(), 0);
  assert.equal(gruppe.status().running, false);
  assert.equal(gruppe.status().hashrate, 0);
  k.store.close();
});

test('Dieselbe Karte zweimal gewaehlt rechnet nur einmal', async () => {
  const k = knoten();
  const gruppe = new GpuGruppe({ mining: k.mining, programm: EMU });
  const g: GpuGeraet = (await erkenneGpu(EMU)).geraete[1];
  const r = await gruppe.start(ADRESSE, [g, g, g], async () => null);
  assert.equal(r.gestartet.length, 1);
  assert.equal(gruppe.laufend(), 1);
  await gruppe.stop();
  k.store.close();
});

test('Gewaehlte Karten aus Datei oder Anfrage werden geprueft', () => {
  assert.deepEqual(kartenAus([0, 2, 1]), [0, 2, 1]);
  assert.deepEqual(kartenAus([1, 1, '2', 2]), [1, 2]);
  assert.deepEqual(kartenAus([-1, 1.5, 'x', null, 3]), [3]);
  assert.equal(kartenAus([]), null);
  assert.equal(kartenAus('0,1'), null);
  assert.equal(kartenAus(undefined), null);
  assert.equal(kartenAus(Array.from({ length: 40 }, (_, i) => i))?.length, 16);
});
