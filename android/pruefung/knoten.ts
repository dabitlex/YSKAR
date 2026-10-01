/**
 * Lokaler Testknoten fuer android/pruefung/MinerPruefung.java.
 *
 * Derselbe MiningServer wie auf dem Raspberry, auf dem Testnetz (REGTEST)
 * im Speicher. Aufruf: node --experimental-strip-types android/pruefung/knoten.ts 18655
 */
import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../../src/lib/node/fullnode/MiningServer.ts';
import { REGTEST } from '../../src/lib/core/networks.ts';
import { toHex } from '../../src/lib/core/codec.ts';

const port = Number(process.argv[2] ?? 18655);
const store = new ChainStore(':memory:');
store.setMeta('network', REGTEST.network);
store.setMeta('chain_id', toHex(REGTEST.chainId));
const chain = new ChainManager(store, REGTEST);
const pool = new TxPool();
let uhr = 1_788_912_000n;
const mining = new MiningCoordinator(chain, store, pool, REGTEST, () => { const t = uhr; uhr += REGTEST.targetBlockTime; return t; });
const server = new MiningServer({ chain, store, pool, mining }, { params: REGTEST });
await server.listen('127.0.0.1', port);
console.log(`knoten bereit ${port}`);
setInterval(() => console.log(`hoehe ${chain.height()}`), 5000);
