import { Worker } from 'node:worker_threads';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { decodeAddress, isValidAddress } from '../../src/lib/core/address.ts';
import type { MiningCoordinator, MiningJob } from '../../src/lib/node/fullnode/MiningCoordinator.ts';

const WORKER_COUNT = Math.max(1, Number(process.env.YSKAR_MINER_WORKERS || 0));
const STRIDE = 4096;
const DEFAULT_INTENSITY = 100;

export interface LocalMinerStatus {
  running: boolean;
  address: string;
  workers: number;
  readyWorkers: number;
  intensity: number;
  hashrate: number;
  hashes: number;
  shares: number;
  blocks: number;
  errors: number;
  jobId: string | null;
  height: number | null;
}

export interface LocalMinerOptions {
  mining: MiningCoordinator;
  defaultAddress?: string;
  onBlock?: (height: number, hash: string, address: string) => void;
  onLog?: (text: string) => void;
}

interface WorkerState {
  worker: Worker;
  slot: number;
  ready: boolean;
  hashes: number;
  lastAt: number;
  lastHashes: number;
}

/**
 * Lokaler YSKAR-Miner fuer den Node Core.
 *
 * Die eigentliche SHA-256d-Engine ist dieselbe WASM-Datei, die der
 * eigenstaendige YSKAR-Miner verwendet. Der Node erzeugt den Job selbst
 * ueber MiningCoordinator; der Miner muss deshalb keine Internet-API und
 * keinen Pool kennen.
 */
export class LocalMiner {
  private readonly mining: MiningCoordinator;
  private readonly onBlock?: LocalMinerOptions['onBlock'];
  private readonly onLog?: LocalMinerOptions['onLog'];
  private workers: WorkerState[] = [];
  private running = false;
  private address = '';
  private addressBytes: Uint8Array | null = null;
  private intensity = DEFAULT_INTENSITY;
  private job: MiningJob | null = null;
  private extranonce = randomNonce();
  private hashes = 0;
  private shares = 0;
  private blocks = 0;
  private errors = 0;
  private rateTimer: NodeJS.Timeout | null = null;
  private hashrate = 0;

  constructor(opt: LocalMinerOptions) {
    this.mining = opt.mining;
    this.address = opt.defaultAddress ?? '';
    this.onBlock = opt.onBlock;
    this.onLog = opt.onLog;
  }

  status(): LocalMinerStatus {
    return {
      running: this.running,
      address: this.address,
      workers: this.workers.length,
      readyWorkers: this.workers.filter(w => w.ready).length,
      intensity: this.intensity,
      hashrate: this.hashrate,
      hashes: this.hashes,
      shares: this.shares,
      blocks: this.blocks,
      errors: this.errors,
      jobId: this.job?.jobId ?? null,
      height: this.job?.height ?? null,
    };
  }

  setAddress(address: string): void {
    const clean = String(address || '').trim();
    if (!isValidAddress(clean)) throw new Error('Ungueltige YSKAR-Adresse.');
    this.address = clean;
    this.addressBytes = decodeAddress(clean);
    if (this.running) this.neuerJob();
  }

  setIntensity(value: number): void {
    if (!Number.isFinite(value) || value < 1 || value > 100) {
      throw new Error('Mining-Intensitaet muss zwischen 1 und 100 liegen.');
    }
    this.intensity = Math.round(value);
    for (const w of this.workers) w.worker.postMessage({ t: 'duty', value: this.intensity });
  }

  async start(address?: string, workers?: number, intensity?: number): Promise<void> {
    if (address !== undefined) this.setAddress(address);
    if (!this.addressBytes) {
      if (!this.address || !isValidAddress(this.address)) throw new Error('Zum Mining wird eine YSKAR-Adresse benoetigt.');
      this.addressBytes = decodeAddress(this.address);
    }
    if (intensity !== undefined) this.setIntensity(intensity);
    if (this.running) return;

    const count = Number.isInteger(workers) && (workers as number) > 0
      ? Math.min(256, workers as number)
      : Math.max(1, (WORKER_COUNT || requireCpuCount()) - 1);

    const wasm = loadMinerWasm();
    this.running = true;
    this.extranonce = randomNonce();
    this.hashes = 0;
    this.shares = 0;
    this.blocks = 0;
    this.errors = 0;
    this.hashrate = 0;

    for (let slot = 0; slot < count; slot++) this.spawnWorker(wasm, slot, count);
    this.rateTimer = setInterval(() => this.updateRate(), 1000);
    this.rateTimer.unref?.();
    this.log(`Lokaler Miner gestartet · ${count} Worker · ${this.intensity}%`);
    this.neuerJob();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.rateTimer) clearInterval(this.rateTimer);
    this.rateTimer = null;
    this.job = null;
    const workers = this.workers.splice(0);
    await Promise.all(workers.map(async state => {
      try { state.worker.postMessage({ t: 'stop' }); } catch {}
      try { await state.worker.terminate(); } catch {}
    }));
    this.hashrate = 0;
    this.log('Lokaler Miner gestoppt.');
  }

  /** Nach einem neuen Chain-Tip sofort auf einen neuen Job wechseln. */
  notifyChainChanged(): void {
    if (this.running) this.neuerJob();
  }

  private spawnWorker(wasm: Uint8Array, slot: number, count: number): void {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { wasm, slot, stride: STRIDE, workers: count, intensity: this.intensity },
    });
    const state: WorkerState = { worker, slot, ready: false, hashes: 0, lastAt: Date.now(), lastHashes: 0 };
    this.workers.push(state);
    worker.on('message', m => this.workerMessage(state, m));
    worker.on('error', e => {
      this.errors++;
      this.log(`Miner-Worker ${slot}: ${e.message}`);
    });
    worker.on('exit', code => {
      if (this.running && code !== 0) {
        this.errors++;
        this.log(`Miner-Worker ${slot} beendet (${code}).`);
      }
    });
  }

  private workerMessage(state: WorkerState, m: any): void {
    if (m.t === 'ready') {
      state.ready = true;
      if (this.job) state.worker.postMessage({ t: 'job', job: this.job });
      return;
    }
    if (m.t === 'progress') {
      state.hashes += Number(m.hashes) || 0;
      this.hashes += Number(m.hashes) || 0;
      return;
    }
    if (m.t === 'found') {
      this.shares++;
      void this.submit(m);
      return;
    }
    if (m.t === 'error') {
      this.errors++;
      this.log(`Miner-Worker ${state.slot}: ${m.message}`);
    }
  }

  private async submit(m: { jobId: string; nonce: string }): Promise<void> {
    if (!this.running) return;
    const result = this.mining.submitNonce(m.jobId, BigInt(m.nonce));
    if (!result.ok) {
      if (result.grund === 'stale_job' || result.grund === 'job_unknown' || result.grund === 'job_expired') this.neuerJob();
      else this.log(`Mining-Share abgelehnt: ${result.grund}`);
      return;
    }
    if (!result.block) return;

    this.blocks++;
    this.log(`BLOCK GEFUNDEN #${result.height} · ${result.hash.slice(0, 32)}... · Reward ${result.reward}`);
    this.onBlock?.(result.height, result.hash, this.address);
    this.neuerJob();
  }

  private neuerJob(): void {
    if (!this.running || !this.addressBytes) return;
    try {
      this.job = this.mining.createJob(this.addressBytes, this.extranonce);
      for (const w of this.workers) {
        if (w.ready) w.worker.postMessage({ t: 'job', job: this.job });
      }
    } catch (e) {
      this.errors++;
      this.log(`Mining-Job konnte nicht gebaut werden: ${(e as Error).message}`);
    }
  }

  private updateRate(): void {
    let total = 0;
    const now = Date.now();
    for (const w of this.workers) {
      const dt = Math.max(1, now - w.lastAt);
      total += ((w.hashes - w.lastHashes) * 1000) / dt;
      w.lastAt = now;
      w.lastHashes = w.hashes;
    }
    this.hashrate = total;
  }

  private log(text: string): void { this.onLog?.(text); }
}

function requireCpuCount(): number {
  // Import bewusst spaet: Der Node Core bleibt beim Start leichtgewichtig.
  const cpus = Number(process.env.NUMBER_OF_PROCESSORS || process.env.NPROC || 2);
  return Number.isFinite(cpus) && cpus > 0 ? cpus : 2;
}

function randomNonce(): bigint {
  let n = 0n;
  for (const b of randomBytes(8)) n = (n << 8n) | BigInt(b);
  return n;
}

function loadMinerWasm(): Uint8Array {
  const here = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'miner.wasm'),
    join(here, '..', '..', 'miner', 'miner.57f237a2a4.wasm'),
    resolve(process.cwd(), 'miner', 'miner.57f237a2a4.wasm'),
  ];
  const path = candidates.find(existsSync);
  if (!path) throw new Error('Miner-WASM nicht gefunden. Bitte zuerst den Node-Core-Build ausfuehren.');
  return new Uint8Array(readFileSync(path));
}

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');

const MEM = { HEADER: 0, MIDSTATE: 144, NONCE: 176, HASH: 304, TARGET: 336, FOUND: 368 };
let memory, view, initJob, mine;
let job = null, running = false, duty = workerData.intensity || 100;
let chunk = 200000;
let nonceHigh = workerData.slot * workerData.stride;
let nonceLow = 0;

function fromHex(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function setNonce(n) {
  const dv = new DataView(memory.buffer);
  dv.setBigUint64(128, BigInt(n), true);
}

function loadJob(j) {
  const same = job && job.jobId === j.jobId;
  job = j;
  if (!same) { nonceHigh = workerData.slot * workerData.stride; nonceLow = 0; }
  memory.set(fromHex(job.header), MEM.HEADER);
  setNonce((BigInt(nonceHigh) << 32n) | BigInt(nonceLow));
  memory.set(fromHex(job.target), MEM.TARGET);
  initJob();
}

function resetRange() {
  memory.set(fromHex(job.header), MEM.HEADER);
  setNonce(BigInt(nonceHigh) << 32n);
  initJob();
}

async function loop() {
  let done = 0, last = Date.now();
  while (running && job) {
    const t0 = performance.now();
    const found = mine(nonceLow | 0, chunk);
    const dt = Math.max(0.1, performance.now() - t0);
    if (found === 1) {
      const low = view.getUint32(MEM.FOUND, true) >>> 0;
      const nonce = ((BigInt(nonceHigh) << 32n) | BigInt(low)).toString();
      parentPort.postMessage({ t: 'found', jobId: job.jobId, nonce });
      nonceLow = (low + 1) >>> 0;
      if (nonceLow === 0) { nonceHigh++; resetRange(); }
      continue;
    }
    done += chunk;
    const before = nonceLow;
    nonceLow = (nonceLow + chunk) >>> 0;
    if (nonceLow < before) { nonceHigh++; resetRange(); }
    chunk = Math.max(20000, Math.min(20000000, Math.round(chunk * 50 / dt)));
    const now = Date.now();
    if (now - last >= 1000) {
      parentPort.postMessage({ t: 'progress', hashes: done, ms: now - last });
      done = 0; last = now;
    }
    if (duty < 100) await new Promise(r => setTimeout(r, (dt * (100 - duty)) / duty));
    else await new Promise(r => setTimeout(r, 0));
  }
}

(async () => {
  try {
    const instance = await WebAssembly.instantiate(workerData.wasm, {});
    memory = new Uint8Array(instance.instance.exports.memory.buffer);
    view = new DataView(instance.instance.exports.memory.buffer);
    initJob = instance.instance.exports.init_job;
    mine = instance.instance.exports.mine;
    parentPort.postMessage({ t: 'ready' });
  } catch (e) {
    parentPort.postMessage({ t: 'error', message: String(e && e.message || e) });
  }
})();

parentPort.on('message', m => {
  try {
    if (m.t === 'job') {
      loadJob(m.job);
      if (!running) { running = true; loop(); }
    } else if (m.t === 'duty') {
      duty = Number(m.value);
    } else if (m.t === 'stop') {
      running = false;
    }
  } catch (e) {
    parentPort.postMessage({ t: 'error', message: String(e && e.message || e) });
  }
});
`;
