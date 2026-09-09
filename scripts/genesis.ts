/**
 * Genesis-Block bauen, echt minen und pruefen.
 *
 * Laeuft mit Fortsetzungspunkt: BUDGET_MS begrenzt die Laufzeit, der Stand
 * wird gesichert. Erwartet werden rund 268 Mio Hashes (Difficulty 4096).
 *
 *   node --experimental-strip-types scripts/genesis.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { buildBlock, finalizeBlock } from '../src/lib/core/builder.ts';
import { validateBlock } from '../src/lib/core/validate.ts';
import { headerHash, serializeBlock, serializeHeader, checkBlockStructure } from '../src/lib/core/block.ts';
import { emptyState, applyBlock, stateRoot, totalSupply, cloneState } from '../src/lib/core/state.ts';
import { ZERO_ADDRESS, encodeAddress } from '../src/lib/core/address.ts';
import { MIN_DIFFICULTY, rewardAt, targetFromDifficulty, NETWORK, CHAIN_ID } from '../src/lib/core/params.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { txid, serializeTx } from '../src/lib/core/tx.ts';

// 2026-09-09T00:00:00Z
const TIMESTAMP = 1_788_912_000n;
const DIFFICULTY = MIN_DIFFICULTY;
const INSCRIPTION = 'proof, not promise';   // muss <= 32 Byte sein

const STATE_FILE = new URL('./genesis.state.json', import.meta.url);
const OUT_FILE = new URL('./genesis.json', import.meta.url);
const MEM = { HEADER: 0, HASH: 304, TARGET: 336, FOUND: 368 };

const extra = new TextEncoder().encode(INSCRIPTION);
if (extra.length > 32) throw new Error(`Inschrift zu lang: ${extra.length} Byte`);

// Zustand vor dem Genesis ist leer -- die Kette faengt bei null an.
const before = emptyState();

const built = buildBlock({
  height: 0,
  prevHash: new Uint8Array(32),
  state: before,
  mempool: [],
  // Nullardesse: der Reward entsteht und ist sofort unausgebbar. Es gibt
  // keinen Schluessel, der auf 20 Nullbytes fuehrt. So bleibt die
  // Reward-Funktion ohne Sonderfall und es gibt keinen Premine.
  minerAddress: ZERO_ADDRESS,
  timestamp: TIMESTAMP,
  difficulty: DIFFICULTY,
  extranonce: 0n,
  coinbaseExtra: extra,
});

console.log(`Netz          ${NETWORK}`);
console.log(`chain_id      ${toHex(CHAIN_ID)}`);
console.log(`Inschrift     "${INSCRIPTION}" (${extra.length} Byte)`);
console.log(`Empfaenger    ${encodeAddress(ZERO_ADDRESS)}  (unausgebbar)`);
console.log(`Reward        ${rewardAt(0)} Einheiten`);
console.log(`Difficulty    ${DIFFICULTY}`);
console.log(`merkle_root   ${toHex(built.block.header.merkleRoot)}`);
console.log(`state_root    ${toHex(built.stateRoot)}`);
console.log(`erwartet      ~${Number(DIFFICULTY * 65536n / 1_000_000n)} Mio Hashes\n`);

const wasm = readFileSync(new URL('../public/miner.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasm, {});
const mem = new Uint8Array((instance.exports.memory as WebAssembly.Memory).buffer);
const view = new DataView((instance.exports.memory as WebAssembly.Memory).buffer);
const initJob = instance.exports.init_job as () => void;
const mine = instance.exports.mine as (s: number, i: number) => number;

// Target als 32 Byte Big-Endian
const target = new Uint8Array(32);
{
  let x = targetFromDifficulty(DIFFICULTY);
  for (let i = 31; i >= 0; i--) { target[i] = Number(x & 0xffn); x >>= 8n; }
}
mem.set(target, MEM.TARGET);

const BUDGET_MS = Number(process.env.BUDGET_MS ?? 200_000);
const CHUNK = 2_000_000;
let start = { hi: 0, lo: 0 };
if (existsSync(STATE_FILE)) start = JSON.parse(readFileSync(STATE_FILE, 'utf8'));

const t0 = Date.now();
for (let hi = start.hi; hi < 1024; hi++) {
  mem.set(serializeHeader({ ...built.block.header, nonce: BigInt(hi) << 32n }), MEM.HEADER);
  initJob();

  for (let lo = (hi === start.hi ? start.lo : 0); lo < 0x100000000; lo += CHUNK) {
    if (Date.now() - t0 > BUDGET_MS) {
      writeFileSync(STATE_FILE, JSON.stringify({ hi, lo }));
      const n = hi * 0x100000000 + lo;
      console.log(`\nPause bei ${(n / 1e6).toFixed(0)} Mio Hashes, Zustand gesichert.`);
      process.exit(2);
    }

    if (mine(lo | 0, CHUNK) === 1) {
      const low = view.getUint32(MEM.FOUND, true) >>> 0;
      const nonce = (BigInt(hi) << 32n) | BigInt(low);
      const block = finalizeBlock(built, nonce);

      // --- Nachpruefen, statt zu vertrauen ---
      const structural = checkBlockStructure(block);
      if (structural) throw new Error(`Struktur: ${structural}`);

      const error = validateBlock(block, {
        previous: null, state: before, recentTimestamps: [], recentTimings: [],
        now: BigInt(Math.floor(Date.now() / 1000)),
      });
      if (error) throw new Error(`Pruefung: ${error.code} ${error.detail}`);

      const after = cloneState(before);
      const applied = applyBlock(after, block);
      if (!applied.ok) throw new Error(`Anwenden: ${applied.error?.reason}`);

      const hash = headerHash(block.header);
      const h = block.header;
      const body = serializeBlock(block);
      const cb = block.txs[0];

      const out = {
        network: NETWORK,
        chain_id: toHex(CHAIN_ID),
        block: {
          height: 0, hash: toHex(hash), version: h.version,
          prev_hash: toHex(h.prevHash), merkle_root: toHex(h.merkleRoot),
          state_root: toHex(h.stateRoot), block_time: h.timestamp.toString(),
          difficulty: h.difficulty.toString(), tx_count: h.txCount,
          extranonce: h.extranonce.toString(), nonce: h.nonce.toString(),
          header: toHex(serializeHeader(h)), size_bytes: body.length,
        },
        txs: [{
          txid: toHex(txid(cb)), idx: 0, type: 0, version: cb.version,
          from: null, to: toHex((cb as any).to),
          amount: (cb as any).amount.toString(), fee: '0',
          nonce: null, valid_until: null, memo: toHex((cb as any).extra),
          public_key: null, signature: null, raw: toHex(serializeTx(cb)),
        }],
        accounts: [...after].map(([addr, acc]) => ({
          address: addr, balance: acc.balance.toString(), nonce: acc.nonce.toString(),
        })),
        supply: totalSupply(after).toString(),
        stats: {
          hashes: hi * 0x100000000 + lo,
          seconds: (Date.now() - t0) / 1000,
          inscription: INSCRIPTION,
        },
      };
      writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

      console.log('\nGENESIS GEFUNDEN UND GEPRUEFT');
      console.log(`  nonce       ${nonce}`);
      console.log(`  hash        ${toHex(hash)}`);
      console.log(`  state_root  ${toHex(stateRoot(after))}`);
      console.log(`  supply      ${totalSupply(after)}`);
      console.log(`  Hashes      ${(out.stats.hashes / 1e6).toFixed(0)} Mio`);
      process.exit(0);
    }

    if ((lo / CHUNK) % 20 === 0) {
      const n = hi * 0x100000000 + lo;
      const run = n - (start.hi * 0x100000000 + start.lo);
      process.stdout.write(`\r${(n / 1e6).toFixed(0)} Mio  ` +
        `${((Date.now() - t0) / 1000).toFixed(0)}s  ` +
        `${(run / (Date.now() - t0) / 1000).toFixed(2)} MH/s   `);
    }
  }
}
