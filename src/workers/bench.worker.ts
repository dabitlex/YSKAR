/// <reference lib="webworker" />

/**
 * Benchmark-Worker.
 *
 * Misst, wie viele Hashes dieses Geraet tatsaechlich schafft -- mit
 * GENAU DERSELBEN Engine und derselben Schleife wie beim echten Mining.
 * Eine Messung, die etwas anderes rechnet als der Produktivbetrieb, ist
 * wertlos.
 *
 * Der Known-Answer-Test aus dem Mining-Worker laeuft auch hier: Passt der
 * Genesis-Hash nicht, bricht der Benchmark ab, statt eine Zahl anzuzeigen.
 * Eine Hashrate von einer falschen Engine waere schlimmer als keine.
 *
 * Es wird NICHTS eingereicht und keine Session geoeffnet. Der Benchmark
 * beruehrt die Kette nicht.
 */

// Speicherlayout aus wasm/gen_wat.py -- identisch zum Mining-Worker.
const MEM = { HEADER: 0, MIDSTATE: 144, NONCE: 176, HASH: 304, TARGET: 336, FOUND: 368 };

let mem: Uint8Array;
let view: DataView;
let initJob: () => void;
let mine: (start: number, iters: number) => number;

let running = false;
let chunk = 8000;
let duty = 100;
let slotId = 0;

const SELFTEST_HEADER = '010000000000000000000000000000000000000000000000000000000000000000000000000000001007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca5780a1a06a000000000010000001000000000000000000000024bf060300000000';
const SELFTEST_NONCE = 50773796;
const SELFTEST_HASH =
  '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66';

function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function ladeEngine(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Engine nicht ladbar: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports as Record<string, unknown>;
  const speicher = ex.memory as WebAssembly.Memory;
  mem = new Uint8Array(speicher.buffer);
  view = new DataView(speicher.buffer);
  initJob = ex.init_job as () => void;
  mine = ex.mine as (start: number, iters: number) => number;
}

/**
 * Known-Answer-Test.
 *
 * Bekannter Header, bekannte Nonce, bekannter Hash. Stimmt er nicht, ist
 * die geladene Engine nicht die, fuer die dieser Code geschrieben wurde --
 * und jede gemessene Zahl waere Unsinn.
 */
function selfTest() {
  mem.fill(0xff, MEM.TARGET, MEM.TARGET + 32);
  mem.set(unhex(SELFTEST_HEADER), MEM.HEADER);
  initJob();

  const hit = mine(SELFTEST_NONCE | 0, 1);
  const got = Array.from(mem.slice(MEM.HASH, MEM.HASH + 32),
    x => x.toString(16).padStart(2, '0')).join('');

  if (hit !== 1 || got !== SELFTEST_HASH) {
    throw new Error(
      'Die geladene Mining-Engine passt nicht zu dieser App. ' +
      `(erwartet ${SELFTEST_HASH.slice(0, 12)}…, erhalten ${got.slice(0, 12)}…)`);
  }
}

/**
 * Messschleife.
 *
 * Bewusst Zeile fuer Zeile dieselbe Struktur wie hashLoop() im
 * Mining-Worker: dieselbe Chunkregelung auf 35 ms, derselbe Duty-Cycle,
 * dieselbe Meldung je Sekunde. Waere sie anders, wuerde der Benchmark eine
 * Leistung messen, die es im Betrieb nicht gibt.
 *
 * Das Ziel steht auf lauter Nullen: So trifft nie ein Hash, und die
 * Schleife laeuft ungestoert durch. Beim echten Mining unterbricht ein
 * Treffer den Takt -- das kommt aber so selten vor, dass es die Messung
 * nicht verfaelscht.
 */
async function messen() {
  // Kopf mit einem beliebigen, aber festen Inhalt fuellen. Der Inhalt ist
  // gleichgueltig; die Arbeit je Hash haengt nicht davon ab.
  mem.set(unhex(SELFTEST_HEADER), MEM.HEADER);
  mem.fill(0, MEM.TARGET, MEM.TARGET + 32);      // nichts trifft
  initJob();

  let nonce = 0;
  let done = 0;
  let lastReport = performance.now();

  while (running) {
    const t0 = performance.now();
    mine(nonce | 0, chunk);
    const t1 = performance.now();
    const dt = t1 - t0;

    done += chunk;
    nonce = (nonce + chunk) >>> 0;

    if (dt > 0) chunk = Math.max(1000, Math.min(8_000_000, Math.round(chunk * 35 / dt)));

    if (t1 - lastReport >= 500) {
      self.postMessage({ t: 'progress', slot: slotId, hashes: done, ms: t1 - lastReport });
      done = 0;
      lastReport = t1;
    }

    if (duty < 100) await sleep((dt * (100 - duty)) / duty);
    else await sleep(0);
  }

  // Rest melden, damit am Ende einer Stufe nichts unter den Tisch faellt.
  const t = performance.now();
  if (done > 0) {
    self.postMessage({ t: 'progress', slot: slotId, hashes: done, ms: t - lastReport });
  }
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.t === 'init') {
      slotId = m.slot ?? 0;
      await ladeEngine(m.wasmUrl);
      selfTest();
      self.postMessage({ t: 'ready', slot: slotId });
      return;
    }
    if (m.t === 'start') {
      duty = m.duty ?? 100;
      chunk = 8000;
      running = true;
      void messen();
      return;
    }
    if (m.t === 'stop') { running = false; return; }
  } catch (err) {
    running = false;
    self.postMessage({
      t: 'error', slot: slotId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

export {};
