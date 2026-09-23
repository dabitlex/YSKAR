/**
 * CPU-Mining im Node Core.
 *
 * Laeuft mit derselben WASM-Engine wie Mini App und CLI-Miner. Jeder Block
 * geht durch MiningCoordinator.submitNonce() und damit durch die volle
 * Validierung.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { REGTEST } from '../../src/lib/core/networks.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { LocalMiner, JOB_REFRESH_MS } from '../src/LocalMiner.ts';
import { JOB_TTL_MS } from '../../src/lib/node/fullnode/MiningCoordinator.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const ADRESSE = encodeAddress(new Uint8Array(20).fill(0x33));

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

test('Die Erneuerung liegt sicher unter der Lebensdauer eines Jobs', () => {
  /*
    Der Kern des Fehlers, der behoben wurde: Der Worker rechnet gegen das
    Blockziel, meldet sich also erst bei einem ganzen Block. Auf dem Mainnet
    dauert der eine halbe Stunde, ein Job lebt 90 Sekunden. Ohne Erneuerung
    waere fast jeder gefundene Block auf einem abgelaufenen Job gelandet --
    und verloren gewesen.
  */
  assert.ok(JOB_REFRESH_MS < JOB_TTL_MS,
    `Erneuerung ${JOB_REFRESH_MS} ms, Lebensdauer ${JOB_TTL_MS} ms`);
  // Mit Luft fuer einen verspaeteten Takt.
  assert.ok(JOB_REFRESH_MS * 2 < JOB_TTL_MS);
});

test('Der Miner erneuert seinen Job im Takt', async () => {
  const k = knoten();
  let gebaut = 0;
  const echt = k.mining.createJob.bind(k.mining);
  k.mining.createJob = (a, e) => { gebaut++; return echt(a, e); };

  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const m = new LocalMiner({ mining: k.mining });
    await m.start(ADRESSE, 1, 100);
    const nachStart = gebaut;

    // Drei Takte vorspulen -- ohne 90 Sekunden zu warten.
    mock.timers.tick(JOB_REFRESH_MS * 3);
    assert.ok(gebaut >= nachStart + 3,
      `nach drei Takten nur ${gebaut - nachStart} neue Jobs`);

    await m.stop();
  } finally {
    mock.timers.reset();
    k.store.close();
  }
});

test('Der CPU-Miner findet Bloecke, die der Knoten selbst prueft', async () => {
  const k = knoten();
  const gefunden: number[] = [];
  const m = new LocalMiner({
    mining: k.mining,
    onBlock: h => { gefunden.push(h); k.mining.invalidate(); m.notifyChainChanged(); },
  });

  await m.start(ADRESSE, 2, 100);
  // Auf BEIDES warten: Bloecke UND die erste Fortschrittsmeldung. Die
  // Worker melden ihre Hashes im Sekundentakt, die Bloecke kommen bei
  // Difficulty 1 oft schneller -- wer nur auf die Hoehe wartet, liest
  // manchmal einen Zaehler, der noch nicht gemeldet wurde.
  for (let i = 0; i < 80 && (k.chain.height() < 2 || m.status().hashes === 0); i++) {
    await warte(250);
  }
  const s = m.status();
  await m.stop();

  assert.ok(k.chain.height() >= 2, `nur Hoehe ${k.chain.height()}`);
  for (const h of gefunden) assert.ok(k.store.mainAt(h), `Block ${h} fehlt`);
  assert.equal(s.workers, 2);
  assert.ok(s.hashes > 0);
  k.store.close();
});

test('Stoppen beendet alle Worker', async () => {
  const k = knoten();
  const m = new LocalMiner({ mining: k.mining });
  await m.start(ADRESSE, 2, 100);
  await warte(600);
  await m.stop();
  const s = m.status();
  assert.equal(s.running, false);
  assert.equal(s.workers, 0);
  assert.equal(s.hashrate, 0);
  k.store.close();
});

test('Eine ungueltige Adresse wird abgewiesen', async () => {
  const k = knoten();
  const m = new LocalMiner({ mining: k.mining });
  await assert.rejects(() => m.start('ysr1kaputt', 1, 100), /Ungueltige/);
  assert.equal(m.status().running, false);
  k.store.close();
});
