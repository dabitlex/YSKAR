/**
 * Selbsttest ohne Netz.
 *
 * Prueft in einem Durchgang, ob Engine und Serialisierung zueinander passen
 * und wie schnell dieser Rechner ist. Nuetzlich, bevor man sich fragt, warum
 * keine Shares ankommen.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { serializeHeader, targetBytes, toHex, MEM, selfTest, GENESIS }
  from './header.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const ort = [join(HIER, '..'), join(HIER, '..', '..', 'public')]
  .filter(existsSync)
  .map(o => { const t = readdirSync(o).find(n => /^miner\.[0-9a-f]{10}\.wasm$/.test(n));
              return t ? join(o, t) : null; })
  .find(Boolean);

if (!ort) { console.error('miner.<hash>.wasm nicht gefunden.'); process.exit(1); }

const { instance } = await WebAssembly.instantiate(readFileSync(ort), {});
const mem = new Uint8Array(instance.exports.memory.buffer);
const { init_job: initJob, mine } = instance.exports;

console.log(`Engine      ${ort.split('/').pop()}`);
selfTest(mem, initJob, mine);
console.log(`Selbsttest  bestanden (Genesis-Hash stimmt)`);

// Durchsatz eines Kerns messen
mem.fill(0, MEM.TARGET, MEM.TARGET + 32);            // unerreichbar -> reine Messung
mem.set(serializeHeader(GENESIS, 0n), MEM.HEADER);
initJob();
const N = 4_000_000;
const t0 = process.hrtime.bigint();
mine(0, N);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const proKern = N / ms / 1000;

console.log(`Ein Kern    ${proKern.toFixed(2)} MH/s`);
console.log(`Kerne       ${os.cpus().length}`);
console.log(`Erwartet    ${(proKern * Math.max(1, os.cpus().length - 1)).toFixed(2)} MH/s` +
            ` mit ${Math.max(1, os.cpus().length - 1)} Threads`);
