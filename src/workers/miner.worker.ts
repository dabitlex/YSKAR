/// <reference lib="webworker" />

/**
 * Mining-Worker fuer die YSKAR-Kette.
 *
 * Baut denselben 136-Byte-Header wie src/lib/core/block.ts und uebergibt ihn
 * an die WASM-Engine. Die Nonce-Schleife laeuft vollstaendig in WASM -- ein
 * mine()-Aufruf deckt Zehntausende Nonces ab, damit nicht pro Hash die Grenze
 * zwischen JS und WASM ueberquert wird.
 *
 * Der Worker meldet gefundene Nonces und seinen tatsaechlichen Fortschritt.
 * Er behauptet keine Hashrate: was zaehlt, entscheidet der Server anhand der
 * validierten Shares.
 *
 * ACHTUNG: Diese Serialisierung muss byteweise mit serializeHeader() in
 * src/lib/core/block.ts uebereinstimmen. tests/core.test.ts prueft beide
 * gegen die echte WASM-Engine -- bei einer Abweichung waere JEDER Share
 * ungueltig, und die Fehlermeldung sagt nur "Hash stimmt nicht".
 */

// Speicherlayout aus wasm/gen_wat.py
const MEM = { HEADER: 0, MIDSTATE: 144, NONCE: 176, HASH: 304, TARGET: 336, FOUND: 368 };
const HEADER_SIZE = 136;

interface Job {
  jobId: string;
  height: number;
  prevHash: string;
  merkleRoot: string;
  stateRoot: string;
  timestamp: string;
  difficulty: number;
  txCount: number;
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

// Jeder Worker durchsucht einen eigenen Abschnitt des Nonce-Raums. Ohne das
// rechnen zwei Worker exakt dieselben Nonces -- doppelte Arbeit, und der
// zweite Share faellt als Duplikat durch.
let slot = 0;
const SLOT_STRIDE = 4096;

function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

/** Muss byteweise identisch zu serializeHeader() in src/lib/core/block.ts sein. */
function buildHeader(j: Job, high: number): Uint8Array {
  const b = new Uint8Array(HEADER_SIZE);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 1, true);                        // version
  dv.setUint32(4, j.height, true);
  b.set(unhex(j.prevHash), 8);
  b.set(unhex(j.merkleRoot), 40);
  b.set(unhex(j.stateRoot), 72);
  dv.setBigUint64(104, BigInt(j.timestamp), true);
  dv.setUint32(112, j.difficulty, true);
  dv.setUint32(116, j.txCount, true);
  dv.setBigUint64(120, extranonce, true);
  dv.setBigUint64(128, BigInt(high) << 32n, true); // Nonce, obere Haelfte
  return b;
}

function loadJob(j: Job) {
  // Nur bei einem WIRKLICH neuen Job von vorn suchen. Der Client holt den Job
  // regelmaessig neu und bekommt dabei oft denselben zurueck; ein Ruecksetzen
  // der Nonce liesse den Worker denselben Bereich erneut durchsuchen, und
  // alles Gefundene waere ein Duplikat.
  const sameJob = job !== null && job.jobId === j.jobId;
  job = j;
  if (!sameJob) {
    nonceHigh = slot * SLOT_STRIDE;
    nonceLow = 0;
  }
  mem.set(buildHeader(j, nonceHigh), MEM.HEADER);
  mem.set(unhex(j.target), MEM.TARGET);
  initJob();
}

function reloadHigh() {
  if (!job) return;
  mem.set(buildHeader(job, nonceHigh), MEM.HEADER);
  initJob();
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function loop() {
  try { await hashLoop(); }
  catch (err) { running = false; melde('loop', err); }
}

async function hashLoop() {
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
      nonceLow = (low + 1) >>> 0;
      if (nonceLow === 0) { nonceHigh++; reloadHigh(); }
      done += 1;
      continue;
    }

    done += chunk;
    const before = nonceLow;
    nonceLow = (nonceLow + chunk) >>> 0;
    if (nonceLow < before) { nonceHigh++; reloadHigh(); }

    // Chunkgroesse auf etwa 35 ms einregeln
    if (dt > 0) chunk = Math.max(1000, Math.min(8_000_000, Math.round(chunk * 35 / dt)));

    if (t1 - lastReport >= 1000) {
      self.postMessage({ t: 'progress', hashes: done });
      done = 0;
      lastReport = t1;
    }

    // Duty-Cycle: die ehrliche Umsetzung des Leistungsreglers. Weniger Prozent
    // heisst weniger gerechnete Hashes, nicht eine kleinere Anzeige.
    if (duty < 100) await sleep((dt * (100 - duty)) / duty);
    else await sleep(0);
  }
}

/**
 * Ein Worker, der stillschweigend stirbt, sieht von aussen aus wie ein
 * Worker, der arbeitet und nichts findet. Genau das hat uns schon Stunden
 * gekostet -- deshalb meldet er jeden Fehler nach oben, und zusaetzlich
 * einmal je Sekunde seinen Fortschritt, damit der Hauptthread merkt, wenn
 * er verstummt.
 */
function melde(kontext: string, err: unknown) {
  self.postMessage({
    t: 'error',
    where: kontext,
    message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  });
}

self.onmessage = async (e: MessageEvent) => {
  try {
    await handle(e.data);
  } catch (err) {
    melde(`onmessage:${e.data?.t ?? '?'}`, err);
  }
};

async function handle(m: any) {
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
    slot = m.slot ?? 0;
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

  // VarDiff: Nach jedem Share kann der Server das Share-Target anpassen. Der
  // Header bleibt dabei unveraendert, nur der Vergleichswert wechselt.
  if (m.t === 'target') { mem.set(unhex(m.target), MEM.TARGET); return; }
  if (m.t === 'duty') { duty = m.value; return; }
  if (m.t === 'stop') { running = false; return; }
}
