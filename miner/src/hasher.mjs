/**
 * Rechen-Thread.
 *
 * Ein Thread je Worker. Die Nonce-Schleife laeuft vollstaendig in WASM --
 * ein mine()-Aufruf deckt Zehntausende Nonces ab, damit nicht pro Hash die
 * Grenze zwischen JS und WASM ueberquert wird.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { serializeHeader, targetBytes, fromHex, toHex, MEM, selfTest }
  from './header.mjs';

const { wasm, extranonce, slot, stride } = workerData;

let mem, view, initJob, mine;
let job = null, running = false, duty = 100;
let chunk = 200_000;
let nonceHigh = slot * stride, nonceLow = 0;

const schlafen = ms => new Promise(r => setTimeout(r, ms));

async function start() {
  const { instance } = await WebAssembly.instantiate(wasm, {});
  mem = new Uint8Array(instance.exports.memory.buffer);
  view = new DataView(instance.exports.memory.buffer);
  initJob = instance.exports.init_job;
  mine = instance.exports.mine;

  selfTest(mem, initJob, mine);
  parentPort.postMessage({ t: 'bereit', slot });
}

function ladeJob(j) {
  // Nur bei einem WIRKLICH neuen Job von vorn suchen. Sonst durchsucht der
  // Thread nach jedem Abruf denselben Bereich erneut, und alles Gefundene
  // ist ein Duplikat.
  const gleich = job !== null && job.jobId === j.jobId;
  // Die Extranonce gehoert zur SESSION, nicht zum Job -- sie trennt die
  // Suchraeume der Miner. Der Server erwartet sie an Byte 120 des Headers.
  job = { ...j, extranonce };
  if (!gleich) { nonceHigh = slot * stride; nonceLow = 0; }
  mem.set(serializeHeader(job, BigInt(nonceHigh) << 32n), MEM.HEADER);
  mem.set(fromHex(job.target), MEM.TARGET);
  initJob();
}

function neuerBereich() {
  mem.set(serializeHeader(job, BigInt(nonceHigh) << 32n), MEM.HEADER);
  initJob();
}

async function schleife() {
  let getan = 0, letzteMeldung = Date.now();

  while (running && job) {
    const t0 = performance.now();
    const treffer = mine(nonceLow | 0, chunk);
    const t1 = performance.now();
    const dt = t1 - t0;

    if (treffer === 1) {
      const low = view.getUint32(MEM.FOUND, true) >>> 0;
      parentPort.postMessage({
        t: 'share', slot,
        jobId: job.jobId,
        nonce: ((BigInt(nonceHigh) << 32n) | BigInt(low)).toString(),
        hash: toHex(mem.slice(MEM.HASH, MEM.HASH + 32)),
      });
      nonceLow = (low + 1) >>> 0;
      if (nonceLow === 0) { nonceHigh++; neuerBereich(); }
      getan += 1;
      continue;
    }

    getan += chunk;
    const vorher = nonceLow;
    nonceLow = (nonceLow + chunk) >>> 0;
    if (nonceLow < vorher) { nonceHigh++; neuerBereich(); }

    // Chunkgroesse auf etwa 50 ms einregeln
    if (dt > 0) chunk = Math.max(20_000, Math.min(20_000_000, Math.round(chunk * 50 / dt)));

    const jetzt = Date.now();
    if (jetzt - letzteMeldung >= 1000) {
      parentPort.postMessage({ t: 'fortschritt', slot, hashes: getan, ms: jetzt - letzteMeldung });
      getan = 0; letzteMeldung = jetzt;
    }

    // Intensitaet: rechnen und anteilig schlafen. Weniger Prozent heisst
    // weniger gerechnete Hashes, nicht eine kleinere Anzeige.
    if (duty < 100) await schlafen((dt * (100 - duty)) / duty);
    else await schlafen(0);
  }
}

parentPort.on('message', async m => {
  try {
    if (m.t === 'job') {
      ladeJob(m.job);
      if (!running) { running = true; schleife(); }
    } else if (m.t === 'target') {
      mem.set(fromHex(m.target), MEM.TARGET);
    } else if (m.t === 'duty') {
      duty = m.value;
    } else if (m.t === 'stop') {
      running = false;
    }
  } catch (err) {
    parentPort.postMessage({ t: 'fehler', slot, message: String(err.message ?? err) });
  }
});

start().catch(err =>
  parentPort.postMessage({ t: 'fehler', slot, message: String(err.message ?? err) }));
