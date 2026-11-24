/**
 * Phase 0 am laufenden Kommandozeilen-Knoten: Version und Pruefsumme in
 * /status, Startoptionen fuer Verbindungsgrenzen und Mining-Begrenzung.
 *
 * Gestartet wird der Knoten aus dem Quelltext, wie in pool-fenster-cli.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../src/lib/node/fullnode/cli.ts', import.meta.url).pathname;
let port = 19150 + Math.floor(Math.random() * 100);

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

async function knoten(extra: string[]) {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-phase0-'));
  const p = port++;
  const kind = spawn(process.execPath, ['--experimental-strip-types', CLI, 'mine', '--regtest',
    '--data', daten, '--port', String(p), '--no-upstream', '--no-p2p', ...extra],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  let ausgabe = '';
  kind.stdout.on('data', d => { ausgabe += d; });
  kind.stderr.on('data', d => { ausgabe += d; });
  const ende = new Promise<number | null>(r => kind.on('exit', c => r(c)));
  let status: Record<string, unknown> | null = null;
  for (let i = 0; i < 100 && !status; i++) {
    await warte(150);
    try { status = await (await fetch(`http://127.0.0.1:${p}/api/v2/status`)).json() as Record<string, unknown>; }
    catch { /* noch nicht bereit */ }
  }
  return {
    status: status!, url: `http://127.0.0.1:${p}/api/v2`,
    ausgabe: () => ausgabe,
    async stopp() {
      kind.kill('SIGTERM');
      const c = await ende;
      rmSync(daten, { recursive: true, force: true });
      return c;
    },
  };
}

/** Startet den Knoten und erwartet, dass er mit einer Meldung abbricht. */
function abbruch(extra: string[]): { code: number | null; ausgabe: string } {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-phase0-'));
  try {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', CLI, 'mine', '--regtest',
      '--data', daten, '--port', String(port++), '--no-upstream', '--no-p2p', ...extra],
    { encoding: 'utf8', timeout: 20_000 });
    return { code: r.status, ausgabe: `${r.stdout}${r.stderr}` };
  } finally { rmSync(daten, { recursive: true, force: true }); }
}

test('--version meldet 1.0.1', () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--version'], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '1.0.1');
});

test('/status nennt Version und die Pruefsumme der laufenden Programmdatei', async () => {
  const k = await knoten([]);
  try {
    assert.equal(k.status.version, '1.0.1');
    const erwartet = createHash('sha256').update(readFileSync(CLI)).digest('hex');
    assert.equal(k.status.build, erwartet);
    assert.match(k.ausgabe(), new RegExp(`build ${erwartet.slice(0, 16)}`));
    // Reorg- und Nebenzweig-Zaehler seit dem Start, beim Start bei null.
    const reorgs = k.status.reorgs as { count: number; deepest: number; last: unknown };
    const forks = k.status.forks as { count: number };
    assert.equal(reorgs.count, 0);
    assert.equal(reorgs.deepest, 0);
    assert.equal(reorgs.last, null);
    assert.equal(forks.count, 0);
    // Die bisherigen Felder bleiben unveraendert da.
    for (const feld of ['network', 'height', 'bestBlock', 'chainWork', 'tips', 'mempool', 'sessions', 'openJobs']) {
      assert.ok(feld in k.status, `Feld ${feld} fehlt`);
    }
  } finally { assert.equal(await k.stopp(), 0); }
});


