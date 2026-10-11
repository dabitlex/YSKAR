/**
 * Mehrere Grafikkarten ueber die Schnittstelle des Node Core.
 *
 * Zwei Knoten auf dem Testnetz: Der eine betreibt einen Pool, der andere
 * mint darin mit drei (nachgebildeten) Karten. Geprueft wird, was der
 * Nutzer davon sieht und was der Pool davon sieht: jede Karte eine eigene
 * Sitzung, aber nur EIN Platz, weil Plaetze je Adresse zaehlen.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { NodeCoreApp } from '../src/main.ts';

const EMU = join(import.meta.dirname, '..', 'gpu', 'bin', 'yskar-cuda-emu');
const GAST = encodeAddress(new Uint8Array(20).fill(0x37));

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-gpu-api-'));
let naechsterPort = 19_900;
const port = () => naechsterPort++;

const umgebung: Record<string, string | undefined> = {};
before(() => {
  for (const k of ['YSKAR_CUDA_EXE', 'YSKAR_EMU_GERAETE']) umgebung[k] = process.env[k];
  process.env.YSKAR_CUDA_EXE = EMU;
  process.env.YSKAR_EMU_GERAETE = '3';
});
after(() => {
  for (const [k, v] of Object.entries(umgebung)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

async function bis(was: string, pruefe: () => Promise<boolean> | boolean, ms = 90_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await pruefe()) return; await warte(60); }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

function ruf(p: number, pfad: string, opt: { method?: string; headers?: Record<string, string>; body?: string } = {}):
    Promise<{ status: number; json: any }> {
  return new Promise((auf, ab) => {
    const req = request({ host: '127.0.0.1', port: p, path: pfad, method: opt.method ?? 'GET', agent: false,
      headers: { host: `127.0.0.1:${p}`, ...(opt.headers ?? {}) } }, res => {
      let text = ''; res.on('data', c => { text += c; });
      res.on('end', () => { let json: any = null; try { json = JSON.parse(text); } catch { /* kein JSON */ } auf({ status: res.statusCode ?? 0, json }); });
    });
    req.on('error', ab);
    if (opt.body !== undefined) req.write(opt.body);
    req.end();
  });
}

async function kern(uhr: () => bigint, seed: string) {
  const k = { gui: port(), api: port(), p2p: port() };
  const basis = ordner();
  const app = new NodeCoreApp({ params: REGTEST, guiPort: k.gui, basis, uhr });
  await app.startGui();
  const token = app.zugangFuerFenster();
  const kopf = { 'x-yskar-token': token, 'content-type': 'application/json' };
  const GET = (pfad: string) => ruf(k.gui, pfad, { headers: { 'x-yskar-token': token } });
  const POST = (pfad: string, wert: unknown) => ruf(k.gui, pfad, { method: 'POST', headers: kopf, body: JSON.stringify(wert) });
  assert.equal((await POST('/api/configure', { dataDir: ordner(), nodePort: k.api, p2pPort: k.p2p, seed })).status, 200);
  const stand = async () => (await GET('/api/status')).json;
  return { ...k, app, basis, GET, POST, stand, eigen: `http://127.0.0.1:${k.api}` };
}

function uhrNeu(): () => bigint {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 1_000_000n;
  return () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
}

test('Im Pool: drei Karten, drei Sitzungen, ein Platz -- und die Wahl bleibt gespeichert', async () => {
  const uhr = uhrNeu();
  const P = await kern(uhr, '');
  const G = await kern(uhr, `127.0.0.1:${P.p2p}`);
  try {
    assert.equal((await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Kartenpool', feeBps: 0 })).status, 200);
    assert.equal((await P.POST('/api/start', {})).status, 200);
    assert.equal((await G.POST('/api/start', {})).status, 200);
    await bis('verbunden', async () => (await G.stand()).peerCount === 1);
    await bis('drei Karten erkannt', async () => (await G.GET('/api/mining/status')).json?.gpuErkennung?.geraete?.length === 3);

    const start = await G.POST('/api/mining/start', {
      address: GAST, mode: 'gpu', ziel: 'pool', poolHost: P.eigen, gpuDevices: [0, 1, 2],
    });
    assert.equal(start.status, 200, JSON.stringify(start.json));
    assert.deepEqual(start.json.hinweise, []);

    await bis('Jede Karte hat geliefert', async () => {
      const g = (await G.GET('/api/mining/status')).json.gpu;
      return g.karten.length === 3 && g.karten.every((k: any) => k.running && k.hashes > 0);
    });
    const m = (await G.GET('/api/mining/status')).json;
    assert.equal(m.running, true);
    assert.deepEqual(m.config.gpuDevices, [0, 1, 2]);
    assert.equal(m.config.gpuDevice, 0, 'Die erste Karte steht weiter im alten Feld');
    const summe = m.gpu.karten.reduce((n: number, k: any) => n + k.hashrate, 0);
    assert.ok(Math.abs(m.gpu.hashrate - summe) < 1e-6);

    // Beim Pool: je Karte eine Sitzung, aber nur ein Platz -- Plaetze zaehlen Adressen.
    await bis('Drei Sitzungen beim Pool', async () => (await ruf(P.api, '/summary')).json.miningSessions === 3);
    const pool = (await ruf(P.api, '/api/v2/pool')).json;
    assert.equal(pool.belegt, 1, 'Drei Karten derselben Adresse belegen einen Platz');
    await bis('Der Pool hat Shares angenommen', async () => ((await G.GET('/api/mining/status')).json.pool?.angenommen ?? 0) > 0);

    // Gespeichert fuer den naechsten Start.
    const datei = JSON.parse(readFileSync(join(G.basis, 'mining.json'), 'utf8'));
    assert.deepEqual(datei.gpuDevices, [0, 1, 2]);

    // Stoppen: alle Karten halten an, alle Sitzungen enden.
    assert.equal((await G.POST('/api/mining/stop', {})).status, 200);
    const nach = (await G.GET('/api/mining/status')).json;
    assert.equal(nach.running, false);
    assert.ok(nach.gpu.karten.every((k: any) => !k.running));
    await bis('Keine Sitzung mehr beim Pool', async () => (await ruf(P.api, '/summary')).json.miningSessions === 0);
  } finally {
    await G.app.shutdown();
    await P.app.shutdown();
  }
});

test('Eine aeltere Oberflaeche mit nur gpuDevice funktioniert weiter', async () => {
  const uhr = uhrNeu();
  const P = await kern(uhr, '');
  const G = await kern(uhr, `127.0.0.1:${P.p2p}`);
  try {
    assert.equal((await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Altpool', feeBps: 0 })).status, 200);
    assert.equal((await P.POST('/api/start', {})).status, 200);
    assert.equal((await G.POST('/api/start', {})).status, 200);
    await bis('verbunden', async () => (await G.stand()).peerCount === 1);
    await bis('drei Karten erkannt', async () => (await G.GET('/api/mining/status')).json?.gpuErkennung?.geraete?.length === 3);

    const start = await G.POST('/api/mining/start', { address: GAST, mode: 'gpu', ziel: 'pool', poolHost: P.eigen, gpuDevice: 2 });
    assert.equal(start.status, 200, JSON.stringify(start.json));
    await bis('Karte 2 rechnet', async () => (await G.GET('/api/mining/status')).json.gpu.karten.some((k: any) => k.id === 2 && k.running));
    const m = (await G.GET('/api/mining/status')).json;
    assert.deepEqual(m.gpu.karten.map((k: any) => k.id), [2]);
    assert.deepEqual(m.config.gpuDevices, [2]);
    await G.POST('/api/mining/stop', {});
  } finally {
    await G.app.shutdown();
    await P.app.shutdown();
  }
});
