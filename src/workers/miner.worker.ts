/// <reference lib="webworker" />

/**
 * Mining-Worker.
 *
 * Baut denselben 116-Byte-Header wie src/lib/chain/header.ts und uebergibt
 * ihn an die WASM-Engine. Die Nonce-Schleife laeuft vollstaendig in WASM --
 * ein mine()-Aufruf deckt Zehntausende Nonces ab, damit nicht pro Hash die
 * Grenze zwischen JS und WASM ueberquert wird.
 *
 * Der Worker meldet ausschliesslich gefundene Nonces und seinen tatsaech-
 * lichen Fortschritt. Er behauptet keine Hashrate: was zaehlt, entscheidet
 * der Server anhand der validierten Shares.
 */

const MEM = { HEADER: 0, BLOCK2_NONCE: 204, HASH: 320, TARGET: 352, FOUND: 384 };

interface Job {
  jobId: string;
  height: number;
  prevHash: string;
  merkleRoot: string;
  jobSeed: string;
  timestamp: string;
  difficulty: number;
  target: string;
}

let mem: Uint8Array;
let view: DataView;
let initJob: () => void;
let mine: (start: number, iters: number) => number;

let running = false;
let job: Job | null = null;
let extranonce = 0n;
let nonceHigh = 0;
let nonceLow = 0;
let duty = 50;
let chunk = 8000;

function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

/** Muss byteweise identisch zu serializeHeader() in src/lib/chain/header.ts sein. */
function buildHeader(j: Job, high: number): Uint8Array {
  const b = new Uint8Array(116);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 1, true);                       // version
  dv.setUint32(4, j.height, true);                // height
  b.set(unhex(j.prevHash), 8);
  b.set(unhex(j.merkleRoot), 40);
  b.set(unhex(j.jobSeed), 72);
  dv.setBigUint64(88, BigInt(j.timestamp), true);
  dv.setUint32(96, j.difficulty, true);
  dv.setBigUint64(100, extranonce, true);
  dv.setBigUint64(108, BigInt(high) << 32n, true); // Nonce, obere Haelfte
  return b;
}

function loadJob(j: Job) {
  job = j;
  nonceHigh = 0;
  nonceLow = 0;
  mem.set(buildHeader(j, 0), MEM.HEADER);
  mem.set(unhex(j.target), MEM.TARGET);
  initJob();
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function loop() {
  let done = 0;
  let lastReport = performance.now();

  while (running && job) {
    const t0 = performance.now();
    const hit = mine(nonceLow | 0, chunk);
    const t1 = performance.now();
    const dt = t1 - t0;

    if (hit === 1) {
      const low = view.getUint32(MEM.FOUND, true) >>> 0;
      const nonce = (BigInt(nonceHigh) << 32n) | BigInt(low);
      self.postMessage({
        t: 'share',
        jobId: job.jobId,
        nonce: nonce.toString(),
        hash: [...mem.slice(MEM.HASH, MEM.HASH + 32)]
          .map(x => x.toString(16).padStart(2, '0')).join(''),
      });
      // Direkt hinter dem Treffer weitersuchen
      nonceLow = (low + 1) >>> 0;
      if (nonceLow === 0) { nonceHigh++; loadHigh(); }
      done += 1;
      continue;
    }

    done += chunk;
    const before = nonceLow;
    nonceLow = (nonceLow + chunk) >>> 0;
    if (nonceLow < before) { nonceHigh++; loadHigh(); }

    // Chunkgroesse auf etwa 35 ms einregeln
    if (dt > 0) chunk = Math.max(1000, Math.min(8_000_000, Math.round(chunk * 35 / dt)));

    if (t1 - lastReport >= 1000) {
      self.postMessage({ t: 'progress', hashes: done });
      done = 0;
      lastReport = t1;
    }

    // Duty-Cycle: die ehrliche Umsetzung des Leistungsreglers. Weniger
    // Prozent heisst weniger gerechnete Hashes, nicht eine kleinere Anzeige.
    if (duty < 100) await sleep((dt * (100 - duty)) / duty);
    else await sleep(0);
  }
}

function loadHigh() {
  if (!job) return;
  mem.set(buildHeader(job, nonceHigh), MEM.HEADER);
  initJob();
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;

  if (m.t === 'init') {
    const res = await WebAssembly.instantiateStreaming(fetch(m.wasmUrl), {})
      .catch(async () => {
        const bytes = await fetch(m.wasmUrl).then(r => r.arrayBuffer());
        return WebAssembly.instantiate(bytes, {});
      });
    const ex = (res as WebAssembly.WebAssemblyInstantiatedSource).instance.exports;
    mem = new Uint8Array((ex.memory as WebAssembly.Memory).buffer);
    view = new DataView((ex.memory as WebAssembly.Memory).buffer);
    initJob = ex.init_job as () => void;
    mine = ex.mine as (s: number, i: number) => number;
    extranonce = BigInt(m.extranonce);
    self.postMessage({ t: 'ready' });
    return;
  }

  if (m.t === 'job') {
    loadJob(m.job);
    if (running) return;
    running = true;
    loop();
    return;
  }

  if (m.t === 'duty') { duty = m.value; return; }
  if (m.t === 'stop') { running = false; return; }
};
