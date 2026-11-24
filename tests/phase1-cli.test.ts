/**
 * Phase 1 am laufenden Kommandozeilen-Knoten: Seeds, --p2p-bind,
 * peers.json, Knotennetz-Zahlen in /status, /health.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../src/lib/node/fullnode/cli.ts', import.meta.url).pathname;
let port = 19350 + Math.floor(Math.random() * 100);
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

async function starte(extra: string[], netz: string[] = ['--regtest']) {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-p1cli-'));
  const p = port++, p2p = port++;
  const kind = spawn(process.execPath, ['--experimental-strip-types', CLI, 'mine', ...netz,
    '--data', daten, '--port', String(p), '--p2p-port', String(p2p), '--no-upstream', ...extra],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
  let ausgabe = '';
  kind.stdout.on('data', d => { ausgabe += d; });
  kind.stderr.on('data', d => { ausgabe += d; });
  const ende = new Promise<number | null>(r => kind.on('exit', c => r(c)));
  let status: Record<string, any> | null = null;
  for (let i = 0; i < 120 && !status; i++) {
    await warte(150);
    try { status = await (await fetch(`http://127.0.0.1:${p}/api/v2/status`)).json() as Record<string, any>; }
    catch { /* noch nicht bereit */ }
  }
  return {
    status: status!, daten, url: `http://127.0.0.1:${p}/api/v2`, ausgabe: () => ausgabe,
    async stopp() { kind.kill('SIGTERM'); const c = await ende; return c; },
    weg() { rmSync(daten, { recursive: true, force: true }); },
  };
}

function abbruch(extra: string[]) {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-p1cli-'));
  try {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', CLI, 'mine', '--regtest',
      '--data', daten, '--port', String(port++), '--no-upstream', ...extra], { encoding: 'utf8', timeout: 20_000 });
    return { code: r.status, ausgabe: `${r.stdout}${r.stderr}` };
  } finally { rmSync(daten, { recursive: true, force: true }); }
}

test('--version meldet 1.0.2', () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--version'], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '1.0.2');
});

test('Regtest: keine eingebauten Seeds, Netzzahlen in /status, peers.json nach dem Beenden', async () => {
  const k = await starte([]);
  try {
    assert.match(k.ausgabe(), /no seeds/);
    const p2p = k.status.p2p;
    for (const feld of ['addressBook', 'verified', 'dialable', 'self', 'outboundGroups', 'listen']) {
      assert.ok(feld in p2p, `p2p.${feld} fehlt`);
    }
    assert.ok(p2p.listen === '::' || p2p.listen === '0.0.0.0', `listen ist ${p2p.listen}`);
    assert.equal(k.status.version, '1.0.2');
    assert.equal(await k.stopp(), 0);
    assert.ok(existsSync(join(k.daten, 'peers.json')), 'peers.json wurde geschrieben');
    assert.equal(JSON.parse(readFileSync(join(k.daten, 'peers.json'), 'utf8')).network, 'yskar-regtest');
  } finally { k.weg(); }
});

test('--p2p-bind 0.0.0.0: nur IPv4, sichtbar in /status und im Banner', async () => {
  const k = await starte(['--p2p-bind', '0.0.0.0']);
  try {
    assert.equal(k.status.p2p.listen, '0.0.0.0');
    assert.match(k.ausgabe(), /listening on 0\.0\.0\.0:/);
    assert.equal(await k.stopp(), 0);
  } finally { k.weg(); }
});

test('/health antwortet mit Urteil, Version und Pruefungen', async () => {
  const k = await starte(['--seed', '127.0.0.1:1']);
  try {
    const r = await fetch(`${k.url}/health`);
    const g = await r.json() as Record<string, any>;
    assert.ok(['ok', 'degraded', 'down'].includes(g.status));
    assert.equal(r.status, g.status === 'down' ? 503 : 200);
    assert.equal(g.version, '1.0.2');
    assert.ok(g.checks.chain && g.checks.sync && g.checks.peers && g.checks.mining);
    assert.match(k.ausgabe(), /1 seed(?! \(built in\))/);
    assert.equal(await k.stopp(), 0);
  } finally { k.weg(); }
});

test('Ungueltige Kombinationen beenden den Start mit einer Meldung', () => {
  for (const [args, text] of [
    [['--p2p-bind', 'irgendwo'], /--p2p-bind needs an IP address/],
    [['--no-seeds', '--seed', '127.0.0.1:1'], /--no-seeds and --seed cannot be used together/],
  ] as [string[], RegExp][]) {
    const r = abbruch(args);
    assert.notEqual(r.code, 0, args.join(' '));
    assert.match(r.ausgabe, text);
  }
});

test('Hauptnetz ohne --seed: die eingebauten Seeds; mit --no-seeds: keine', async () => {
  const k = await starte([], []);
  try {
    assert.match(k.ausgabe(), /2 seeds \(built in\)/);
    assert.equal(k.status.network, 'yskar-main-1');
    await k.stopp();
  } finally { k.weg(); }
  const ohne = await starte(['--no-seeds'], []);
  try {
    assert.match(ohne.ausgabe(), /no seeds/);
    await ohne.stopp();
  } finally { ohne.weg(); }
});
