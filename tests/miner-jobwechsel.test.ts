/**
 * Der Kommandozeilen-Miner holt sofort neue Arbeit, wenn der Knoten seinen
 * Job nicht mehr kennt.
 *
 * Nach jedem neuen Block im Netz verwirft der Knoten alle offenen Jobs
 * (MiningCoordinator.invalidate). Der naechste Treffer auf einen alten Job
 * bekommt "job_unknown". Bis Oktober 2026 zaehlte der Miner das als Ablehnung und
 * rechnete bis zur naechsten Abfrage -- alle 45 Sekunden -- an der alten
 * Arbeit weiter: nach jedem Block bis zu 45 Sekunden umsonst.
 *
 * Gestartet wird der ECHTE Miner als eigener Prozess gegen einen echten
 * Knoten im Testnetz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { MINER_A } from './helpers/regtest.ts';

const ADRESSE = encodeAddress(MINER_A);
const MINER = join(import.meta.dirname, '..', 'miner', 'src', 'cli.mjs');

test('Miner: kennt der Knoten den Job nicht mehr, holt er sofort neue Arbeit', async () => {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => {
    const t = uhr; uhr += REGTEST.targetBlockTime; return t;
  });
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  await server.listen('127.0.0.1', 18733);

  // Jeder Abruf von Arbeit wird mitgezaehlt.
  let abrufe = 0;
  const vorher = mining.createJob.bind(mining);
  mining.createJob = ((...a: Parameters<typeof vorher>) => { abrufe++; return vorher(...a); }) as typeof mining.createJob;

  const kind: ChildProcess = spawn(process.execPath, [
    MINER, '--address', ADRESSE, '--api', 'http://127.0.0.1:18733', '--workers', '1', '--einfach',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let ausgabe = '';
  kind.stdout!.on('data', d => { ausgabe += String(d); });
  kind.stderr!.on('data', d => { ausgabe += String(d); });
  const ende = new Promise(auf => kind.on('exit', auf));
  const warte = async (pruefe: () => boolean, was: string, ms: number) => {
    const bis = Date.now() + ms;
    while (!pruefe()) {
      if (Date.now() > bis) throw new Error(`${was}. Ausgabe:\n${ausgabe.slice(-1500)}`);
      await new Promise(r => setTimeout(r, 50));
    }
  };

  try {
    // Er rechnet; im Testnetz ist jeder angenommene Share ein Block.
    await warte(() => ausgabe.includes('BLOCK GEFUNDEN'), 'Kein erster Block', 60_000);

    // Fremde Bloecke nachstellen: Der Knoten verwirft alle offenen Jobs --
    // mehrmals hintereinander, wie bei Bloecken kurz nacheinander.
    for (let runde = 0; runde < 3; runde++) {
      const ab = ausgabe.length;
      const abrufeVorher = abrufe;
      mining.invalidate();
      // Der naechste Treffer trifft einen unbekannten Job. Danach muss die
      // Arbeit neu geholt werden und wieder ein Block entstehen -- lange
      // vor der naechsten regulaeren Abfrage nach 45 Sekunden.
      const t0 = Date.now();
      await warte(() => abrufe > abrufeVorher && ausgabe.indexOf('BLOCK GEFUNDEN', ab) >= 0,
        `Runde ${runde + 1}: keine neue Arbeit und kein Block`, 30_000);
      assert.ok(Date.now() - t0 < 30_000);
    }
    assert.ok(!/abgelehnt/.test(ausgabe), `Ein unbekannter Job zaehlt nicht als Ablehnung:\n${ausgabe.slice(-800)}`);
  } finally {
    kind.kill('SIGKILL');
    await ende;
    await server.close();
    store.close();
  }
});
