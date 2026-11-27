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

test('--version meldet 1.1.0', () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--version'], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '1.1.0');
});

test('/status nennt Version und die Pruefsumme der laufenden Programmdatei', async () => {
  const k = await knoten([]);
  try {
    assert.equal(k.status.version, '1.1.0');
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



test('Verbindungsgrenzen: Vorgaben wie bisher, sichtbar in /status', async () => {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-phase0-'));
  const p = port++, p2p = port++;
  const kind = spawn(process.execPath, ['--experimental-strip-types', CLI, 'mine', '--regtest',
    '--data', daten, '--port', String(p), '--p2p-port', String(p2p), '--no-upstream'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  const ende = new Promise<number | null>(r => kind.on('exit', c => r(c)));
  try {
    let status: Record<string, any> | null = null;
    for (let i = 0; i < 100 && !status; i++) {
      await warte(150);
      try { status = await (await fetch(`http://127.0.0.1:${p}/api/v2/status`)).json() as Record<string, any>; }
      catch { /* noch nicht bereit */ }
    }
    assert.deepEqual(status!.p2p, { inbound: 0, outbound: 0, maxInbound: 32, maxOutbound: 8, maxInboundPerIp: 0, rejectedPerIp: 0 });
  } finally { kind.kill('SIGTERM'); await ende; rmSync(daten, { recursive: true, force: true }); }
});

test('Verbindungsgrenzen: gesetzte Werte werden uebernommen', async () => {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-phase0-'));
  const p = port++, p2p = port++;
  const kind = spawn(process.execPath, ['--experimental-strip-types', CLI, 'mine', '--regtest',
    '--data', daten, '--port', String(p), '--p2p-port', String(p2p), '--no-upstream',
    '--max-inbound', '125', '--max-outbound', '10', '--max-inbound-per-ip=8'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  let ausgabe = '';
  kind.stdout.on('data', d => { ausgabe += d; });
  const ende = new Promise<number | null>(r => kind.on('exit', c => r(c)));
  try {
    let status: Record<string, any> | null = null;
    for (let i = 0; i < 100 && !status; i++) {
      await warte(150);
      try { status = await (await fetch(`http://127.0.0.1:${p}/api/v2/status`)).json() as Record<string, any>; }
      catch { /* noch nicht bereit */ }
    }
    assert.equal(status!.p2p.maxInbound, 125);
    assert.equal(status!.p2p.maxOutbound, 10);
    assert.equal(status!.p2p.maxInboundPerIp, 8);
    assert.match(ausgabe, /up to 125 in, 10 out, 8 per IP/);
  } finally { kind.kill('SIGTERM'); await ende; rmSync(daten, { recursive: true, force: true }); }
});

test('Verbindungsgrenzen: ungueltige Werte beenden den Start mit einer Meldung', () => {
  for (const [args, text] of [
    [['--max-inbound', '0'], /--max-inbound needs a whole number from 1 to 1000/],
    [['--max-inbound', 'viele'], /--max-inbound needs a whole number/],
    [['--max-outbound', '65'], /--max-outbound needs a whole number from 1 to 64/],
    [['--max-inbound-per-ip', '-1'], /--max-inbound-per-ip needs a whole number from 0 to 1000/],
    [['--max-inbound', '10', '--max-inbound-per-ip', '20'], /cannot be larger than --max-inbound/],
  ] as [string[], RegExp][]) {
    const r = abbruch(args);
    assert.notEqual(r.code, 0, `${args.join(' ')} haette abbrechen muessen`);
    assert.match(r.ausgabe, text);
  }
});

test('Mining-Begrenzung: Vorgabe an, --mining-limits off schaltet sie ab', async () => {
  const an = await knoten([]);
  try {
    assert.deepEqual(an.status.miningLimits, {
      enabled: true, perSender: false, rejected: { job: 0, share: 0, sessionsPerIp: 0, totalPerIp: 0 } });
    assert.match(an.ausgabe(), /request limits per session on/);
  } finally { assert.equal(await an.stopp(), 0); }
  const aus = await knoten(['--mining-limits', 'off']);
  try {
    assert.deepEqual(aus.status.miningLimits, { enabled: false });
    assert.match(aus.ausgabe(), /request limits off/);
  } finally { assert.equal(await aus.stopp(), 0); }
  const proxy = await knoten(['--mining-limits=on', '--sender-ip', 'proxy']);
  try {
    assert.equal((proxy.status.miningLimits as { perSender: boolean }).perSender, true);
  } finally { assert.equal(await proxy.stopp(), 0); }
});

test('Mining-Begrenzung: andere Werte als on und off beenden den Start', () => {
  const r = abbruch(['--mining-limits', 'vielleicht']);
  assert.notEqual(r.code, 0);
  assert.match(r.ausgabe, /--mining-limits takes "on" or "off"/);
});
