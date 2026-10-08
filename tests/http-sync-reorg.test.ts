/**
 * Issue #11: Der HTTP-Abgleich folgt einer Gegenstelle, die einem anderen
 * Zweig folgt -- auch wenn der an oder unter dem eigenen Kopf abzweigt.
 *
 * Vorher fragte sync() nur ab der eigenen Hoehe + 1. Der Block der
 * Gegenstelle passte an nichts ("vorgaenger_fehlt"), der Befehl `sync`
 * endete mit Code 2, und `mine` blieb auf seinem Zweig.
 *
 * Geprueft am echten Programm: lokale Ablage mit Zweig A, eine Gegenstelle,
 * die Zweig B liefert (wie /api/v2/sync), dann `sync --once`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { baueKette, zweig, type Gemint } from './helpers/regtest.ts';

const CLI = new URL('../src/lib/node/fullnode/cli.ts', import.meta.url).pathname;

/** Eine Gegenstelle, die eine feste Kette ueber /api/v2/sync ausliefert. */
async function quelle(kette: Gemint[]) {
  const anfragen: number[] = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname !== '/api/v2/sync') { res.writeHead(404).end('{}'); return; }
    const von = Number(u.searchParams.get('from')), n = Number(u.searchParams.get('count'));
    anfragen.push(von);
    const blocks = kette.filter(g => g.block.header.height >= von).slice(0, n).map(g => ({
      height: g.block.header.height, hash: toHex(g.hash), body: toHex(g.body),
    }));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ blocks }));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, anfragen, zu: () => new Promise(r => server.close(r)) };
}

function ablage(daten: string, bloecke: Gemint[]) {
  const store = new ChainStore(join(daten, 'chain.db'), { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  for (const b of bloecke) assert.ok(chain.accept(b.body).ok);
  store.close();
}
function kopf(daten: string) {
  const store = new ChainStore(join(daten, 'chain.db'), { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const t = chain.tip()!;
  const r = { height: t.height, hash: toHex(t.hash) };
  store.close();
  return r;
}
function syncLauf(daten: string, api: string): Promise<{ code: number | null; aus: string }> {
  const kind = spawn(process.execPath, ['--experimental-strip-types', CLI, 'sync', '--regtest', '--once',
    '--data', daten, '--api', api], { stdio: ['ignore', 'pipe', 'pipe'] });
  let aus = '';
  kind.stdout.on('data', d => { aus += d; });
  kind.stderr.on('data', d => { aus += d; });
  return new Promise(r => kind.on('exit', code => r({ code, aus })));
}

const basis = baueKette(12);

test('Abzweigung unter dem eigenen Kopf: sync geht zurueck und wechselt auf den Zweig mit mehr Arbeit', async () => {
  // Lokal: Hoehe 0..11 (Zweig A). Gegenstelle: gleich bis 6, ab 7 eigener Zweig bis Hoehe 14.
  const b = zweig(basis, 7, 8);
  const daten = mkdtempSync(join(tmpdir(), 'yskar-reorg-'));
  const q = await quelle([...basis.bloecke.slice(0, 7), ...b]);
  try {
    ablage(daten, basis.bloecke);
    assert.equal(kopf(daten).height, 11);

    const r = await syncLauf(daten, q.url);
    assert.equal(r.code, 0, r.aus);
    assert.match(r.aus, /Abzweigung/);
    assert.match(r.aus, /Reorg/);
    const k = kopf(daten);
    assert.equal(k.height, 14);
    assert.equal(k.hash, toHex(b[b.length - 1].hash));
    // Zurueck ging es schrittweise: 12, dann 11, 10, 8, 4 ... bis ein Vorgaenger passt.
    assert.equal(q.anfragen[0], 12);
    assert.ok(Math.min(...q.anfragen) <= 7, `zurueck bis zur Abzweigung: ${q.anfragen.join(',')}`);
  } finally { await q.zu(); rmSync(daten, { recursive: true, force: true }); }
});

test('Abzweigung genau am eigenen Kopf (gleiche Hoehe, anderer Block)', async () => {
  // Lokal bis 11. Gegenstelle: gleich bis 10, ab 11 anderer Block, laenger.
  const b = zweig(basis, 11, 3);
  const daten = mkdtempSync(join(tmpdir(), 'yskar-reorg-'));
  const q = await quelle([...basis.bloecke.slice(0, 11), ...b]);
  try {
    ablage(daten, basis.bloecke);
    const r = await syncLauf(daten, q.url);
    assert.equal(r.code, 0, r.aus);
    assert.equal(kopf(daten).hash, toHex(b[b.length - 1].hash));
  } finally { await q.zu(); rmSync(daten, { recursive: true, force: true }); }
});

test('Gegenstelle hinter dem eigenen Kopf auf einem Seitenzweig: kein Wechsel, kein Fehler', async () => {
  // Lokal bis 11. Gegenstelle zweigt bei 9 ab und ist nur bis 10 gekommen.
  const b = zweig(basis, 9, 2);
  const daten = mkdtempSync(join(tmpdir(), 'yskar-reorg-'));
  const q = await quelle([...basis.bloecke.slice(0, 9), ...b]);
  try {
    ablage(daten, basis.bloecke);
    const r = await syncLauf(daten, q.url);
    assert.equal(r.code, 0, r.aus);
    assert.equal(kopf(daten).hash, toHex(basis.bloecke[11].hash), 'eigener Zweig hat mehr Arbeit');
  } finally { await q.zu(); rmSync(daten, { recursive: true, force: true }); }
});

test('Andere Kette (anderer Genesis): wird weiter abgelehnt', async () => {
  const fremd = baueKette(5, { start: 1_800_000_000n, extra: 'fremd' });
  const daten = mkdtempSync(join(tmpdir(), 'yskar-reorg-'));
  const q = await quelle(fremd.bloecke);
  try {
    ablage(daten, basis.bloecke.slice(0, 3));
    // Die Gegenstelle liefert ab Hoehe 3 -- ihr Block 3 passt nicht. Zurueck bis 0:
    // ihr Genesis ist ein anderer, und den nimmt die Kette nicht an.
    const r = await syncLauf(daten, q.url);
    assert.notEqual(r.code, 0, 'eine fremde Kette darf nicht durchgehen');
    assert.equal(kopf(daten).hash, toHex(basis.bloecke[2].hash));
  } finally { await q.zu(); rmSync(daten, { recursive: true, force: true }); }
});
