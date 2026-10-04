/**
 * Der Kommandozeilen-Miner meldet sich neu an, wenn der Knoten seine Sitzung
 * nicht mehr kennt.
 *
 * Gestartet wird der ECHTE Miner (miner/src/cli.mjs) als eigener Prozess
 * gegen einen echten Knoten im Testnetz. Nachgestellt wird, was am
 * 4. Oktober 2026 zweimal passiert ist: Der Knoten verliert die Sitzung
 * (Neustart, oder der Name zeigt auf einen anderen Rechner), und der Miner
 * rechnet weiter, ohne dass etwas gutgeschrieben wird.
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
const ANGENOMMEN = 'BLOCK GEFUNDEN';
const MINER = join(import.meta.dirname, '..', 'miner', 'src', 'cli.mjs');

async function knoten(port: number) {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool();
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => {
    const t = uhr;
    uhr += REGTEST.targetBlockTime;
    return t;
  });
  const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
  await server.listen('127.0.0.1', port);
  return { server, store, async zu() { await server.close(); store.close(); } };
}

/** Den Miner starten und seine Ausgabe mitlesen. */
function starteMiner(port: number, mehr: string[] = []) {
  const kind: ChildProcess = spawn(process.execPath, [
    MINER, '--address', ADRESSE, '--api', `http://127.0.0.1:${port}`,
    '--workers', '1', '--einfach', ...mehr,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let ausgabe = '';
  kind.stdout!.on('data', d => { ausgabe += String(d); });
  kind.stderr!.on('data', d => { ausgabe += String(d); });
  const ende = new Promise<number | null>(auf => kind.on('exit', code => auf(code)));
  return {
    kind, ende,
    text: () => ausgabe,
    /** Warten, bis `muster` ab der Stelle `ab` in der Ausgabe steht. */
    async warte(muster: string, ab = 0, fristMs = 120_000): Promise<number> {
      const bis = Date.now() + fristMs;
      for (;;) {
        const i = ausgabe.indexOf(muster, ab);
        if (i >= 0) return i + muster.length;
        if (Date.now() > bis) {
          throw new Error(`"${muster}" kam nicht. Ausgabe:\n${ausgabe.slice(-1500)}`);
        }
        await new Promise(r => setTimeout(r, 100));
      }
    },
  };
}

test('Miner: meldet sich neu an, wenn der Knoten die Sitzung nicht mehr kennt', async () => {
  const k = await knoten(18731);
  const m = starteMiner(18731);
  try {
    // 1. Er rechnet, und der Knoten nimmt seine Arbeit an. Im Testnetz ist
    //    die Difficulty so niedrig, dass jeder angenommene Share ein Block
    //    ist -- die Meldung dafuer ist "BLOCK GEFUNDEN".
    const nachErstem = await m.warte(ANGENOMMEN);

    // 2. Der Knoten vergisst alle Sitzungen -- wie nach einem Neustart.
    const sitzungen = (k.server as unknown as { sessions: Map<string, unknown> }).sessions;
    const alte = [...sitzungen.keys()];
    assert.equal(alte.length, 1, 'genau eine Sitzung vor dem Verlust');
    sitzungen.clear();

    // 3. Der Miner merkt es, meldet sich neu an und sagt das auch.
    const nachMeldung = await m.warte('Sitzung beim Knoten beendet', nachErstem);
    const nachAnmeldung = await m.warte('neu angemeldet', nachMeldung);

    // 4. Beim Knoten steht eine NEUE Sitzung, nicht die alte.
    const neue = [...sitzungen.keys()];
    assert.equal(neue.length, 1, 'genau eine Sitzung nach der Neuanmeldung');
    assert.notEqual(neue[0], alte[0], 'es ist eine andere Sitzung als vorher');

    // 5. Und es wird wieder gutgeschrieben -- der Beleg, dass die Threads mit
    //    der Extranonce der neuen Sitzung rechnen. Mit der alten wiese der
    //    Knoten jeden Treffer ab.
    await m.warte(ANGENOMMEN, nachAnmeldung);
    assert.ok(!m.text().includes('abgelehnt'), 'kein Share wurde abgelehnt');
  } finally {
    m.kind.kill('SIGKILL');
    await m.ende;
    await k.zu();
  }
});

test('Miner: ein Knoten ohne Pool beendet den Start, statt solo zu rechnen', async () => {
  const k = await knoten(18732);
  const m = starteMiner(18732, ['--mode', 'pool']);
  try {
    const code = await Promise.race([
      m.ende,
      new Promise<'frist'>(auf => setTimeout(() => auf('frist'), 30_000)),
    ]);
    assert.equal(code, 1, `der Miner endet mit Fehlercode 1. Ausgabe:\n${m.text().slice(-800)}`);
    assert.match(m.text(), /betreibt keinen Pool/);
    assert.ok(!m.text().includes(ANGENOMMEN), 'es wurde nichts gerechnet');
    const sitzungen = (k.server as unknown as { sessions: Map<string, unknown> }).sessions;
    assert.equal(sitzungen.size, 0, 'beim Knoten steht keine Sitzung');
  } finally {
    m.kind.kill('SIGKILL');
    await m.ende;
    await k.zu();
  }
});
