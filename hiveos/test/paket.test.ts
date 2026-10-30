/**
 * Das HiveOS-Paket, so wie HiveOS es benutzt.
 *
 * Das fertige Archiv wird nach /hive/miners/custom/ ausgepackt, h-config.sh
 * und h-stats.sh werden GELADEN (source) wie vom Agenten, h-run.sh laeuft
 * als eigener Prozess -- und mint gegen einen Pool auf dem Testnetz. Statt
 * der Karten rechnet die CPU-Nachbildung von yskar-cuda (zwei "Karten").
 *
 * Laeuft nur mit
 *   YSKAR_HIVEOS_PAKET=<.../yskar-hiveos-x.y.z.tar.gz>
 * und Schreibrecht auf /hive/miners/custom und /var/log/miner/custom.
 * Ohne das wird er uebersprungen. Ein echtes HiveOS ersetzt er nicht: Ob
 * die Werte im Dashboard ankommen, zeigt nur ein Rig.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import {
  mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, copyFileSync, statSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { NodeCoreApp } from '../../node-core/src/main.ts';

const PAKET = process.env.YSKAR_HIVEOS_PAKET ?? '';
const EMU = join(import.meta.dirname, '..', '..', 'node-core', 'gpu', 'bin', 'yskar-cuda-emu');
const HIVE = '/hive/miners/custom';
const ORDNER = join(HIVE, 'yskar-hiveos');
const LOGS = '/var/log/miner/custom';
const LOG = join(LOGS, 'yskar-hiveos');
const ADRESSE = encodeAddress(new Uint8Array(20).fill(0x5a));

const grund = !PAKET ? 'YSKAR_HIVEOS_PAKET fehlt'
  : !existsSync(EMU) ? 'GPU-Nachbildung fehlt (npm run build:gpu-emu in node-core)'
  : null;
const opt = { skip: grund ?? false };

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
async function bis(was: string, pruefe: () => Promise<boolean> | boolean, ms = 150_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await pruefe()) return; await warte(250); }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

/** Bash im Paketordner, mit Umgebung -- wie der Agent. */
function bash(skript: string, env: Record<string, string> = {}) {
  const r = spawnSync('bash', ['-c', skript], { cwd: ORDNER, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, aus: r.stdout, fehler: r.stderr };
}

/** h-stats.sh laden und $khs / $stats lesen. */
function stats(env: Record<string, string> = {}): { khs: number; stats: any } {
  const r = bash(`. ${ORDNER}/h-stats.sh; printf '%s\\n%s\\n' "$khs" "$stats"`, env);
  assert.equal(r.code, 0, r.fehler);
  const [khs, json] = r.aus.trim().split('\n');
  return { khs: Number(khs), stats: JSON.parse(json) };
}

function logsLeeren() {
  mkdirSync(LOGS, { recursive: true });
  for (const n of readdirSync(LOGS)) if (n.startsWith('yskar-hiveos')) rmSync(join(LOGS, n), { force: true });
}

before(() => {
  if (grund) return;
  // Auspacken wie HiveOS: der Ordner yskar-hiveos landet unter /hive/miners/custom.
  mkdirSync(HIVE, { recursive: true });
  rmSync(ORDNER, { recursive: true, force: true });
  const t = spawnSync('tar', ['-xzf', PAKET, '-C', HIVE], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stderr);
  logsLeeren();
});
after(() => {
  if (grund) return;
  rmSync(ORDNER, { recursive: true, force: true });
  logsLeeren();
});

test('Aufbau: Name, Version, Programme', opt, () => {
  const m = basename(PAKET).match(/^(.+)-([^-]+)\.tar\.gz$/);
  assert.ok(m, `Archivname ${basename(PAKET)}`);
  // HiveOS nimmt den Teil vor dem letzten Bindestrich als Namen.
  assert.equal(m[1], 'yskar-hiveos');
  const manifest = readFileSync(join(ORDNER, 'h-manifest.conf'), 'utf8');
  assert.match(manifest, /^CUSTOM_NAME=yskar-hiveos$/m);
  assert.match(manifest, new RegExp(`^CUSTOM_VERSION=${m[2].replace(/\./g, '\\.')}$`, 'm'));
  assert.match(manifest, /^CUSTOM_CONFIG_FILENAME=\/hive\/miners\/custom\/yskar-hiveos\/yskar\.conf$/m);

  for (const f of ['h-config.sh', 'h-run.sh', 'h-stats.sh', 'yskar-log.sh', 'miner/gpu/yskar-cuda', 'node/bin/node']) {
    assert.ok(statSync(join(ORDNER, f)).mode & 0o100, `${f} ist nicht ausfuehrbar`);
  }
  for (const f of ['LICENSE', 'README.md', 'node/LICENSE', 'miner/package.json', 'miner/src/cli.mjs']) {
    assert.ok(existsSync(join(ORDNER, f)), `${f} fehlt`);
  }
  assert.equal(readdirSync(join(ORDNER, 'miner')).filter(n => /^miner\.[0-9a-f]{10}\.wasm$/.test(n)).length, 1);

  // Das mitgelieferte Node -- nicht das des Testrechners.
  const v = spawnSync(join(ORDNER, 'node/bin/node'), ['--version'], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stderr);
  assert.ok(Number(v.stdout.trim().slice(1).split('.')[0]) >= 20, `Node ${v.stdout}`);

  // Selbsttest des CLI-Miners: Engine und Header passen zusammen.
  const s = spawnSync(join(ORDNER, 'node/bin/node'), [join(ORDNER, 'miner/src/selbsttest.mjs')],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(s.status, 0, s.stdout + s.stderr);
  // Ab Miner 0.2.0 englisch ("passed"), bis 0.1.0 deutsch ("bestanden").
  assert.match(s.stdout, /passed|bestanden/);

  const cli = spawnSync(join(ORDNER, 'node/bin/node'), [join(ORDNER, 'miner/src/cli.mjs'), '--version'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('h-config.sh schreibt yskar.conf aus dem Flight Sheet', opt, () => {
  const conf = join(ORDNER, 'yskar.conf');
  const lies = () => Object.fromEntries(readFileSync(conf, 'utf8').trim().split('\n').map(z => {
    const i = z.indexOf('='); return [z.slice(0, i), z.slice(i + 1)];
  }));

  // Geladen, nicht ausgefuehrt -- und es darf die Shell nicht beenden.
  let r = bash(`. ./h-config.sh; echo weiter`, {
    CUSTOM_TEMPLATE: `${ADRESSE}.rig7`, CUSTOM_URL: ' https://pool.example/ ',
    CUSTOM_USER_CONFIG: 'MODE=pool\nGPUS=0, 2\n',
  });
  assert.equal(r.code, 0, r.fehler);
  assert.match(r.aus, /weiter/);
  assert.doesNotMatch(r.aus, /WARNUNG/);
  assert.deepEqual(lies(), { ADDRESS: ADRESSE, API: 'https://pool.example', MODE: 'pool', GPUS: '0,2', EXTRA: '' });

  r = bash(`. ./h-config.sh`, {
    CUSTOM_TEMPLATE: ADRESSE, CUSTOM_URL: 'http://127.0.0.1:8645',
    CUSTOM_USER_CONFIG: 'MODE=solo;GPUS=all;EXTRA=--workers 1',
  });
  assert.deepEqual(lies(), { ADDRESS: ADRESSE, API: 'http://127.0.0.1:8645', MODE: 'solo', GPUS: 'all', EXTRA: '--workers 1' });

  // Unverstaendliches wird gemeldet und vernuenftig ersetzt.
  r = bash(`. ./h-config.sh`, { CUSTOM_TEMPLATE: 'bc1qfalsch', CUSTOM_URL: 'pool.example', CUSTOM_USER_CONFIG: 'MODE=irgendwas\nGPUS=eins' });
  assert.match(r.aus, /keine YSKAR-Adresse/);
  assert.match(r.aus, /muss mit https:\/\/ oder http:\/\/ beginnen/);
  assert.match(r.aus, /GPUS=eins nicht verstanden/);
  assert.equal(lies().MODE, 'pool');
  assert.equal(lies().GPUS, 'all');
});

test('Protokolle: Zaehler, Leistung, Kuerzen', opt, () => {
  const d = mkdtempSync(join(tmpdir(), 'yskar-hive-log-'));
  const f = join(d, 'gpu0.log');
  const lade = (s: string) => bash(`. ./yskar-log.sh; ${s}`);

  writeFileSync(f, [
    '### Start 2026-10-11 10:00:00 GPU 0 YSKAR 0.7.1',
    '[10:00:05] angenommen #1 · Difficulty 1.000 · 0,1 % eines Blocks',
    '[10:00:10] abgelehnt stale',
    '[10:01:00] 10s 3,52 GH/s 60s 3,51 GH/s 15m 3,50 GH/s · 1,2 TH gesamt · Laufzeit 1 min',
    '[10:01:30] angenommen #2 · Difficulty 1.000 · 0,1 % eines Blocks',
    '    Shares            2 angenommen, 1 abgelehnt',
  ].join('\n') + '\n');
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '2 1');
  assert.equal(lade(`yskar_khs ${f}`).aus.trim(), '3520000.000');
  // Ein Block ist ein angenommener Share -- mit eigener Zeile statt "angenommen #n".
  writeFileSync(f, readFileSync(f, 'utf8') + '[10:02:00] BLOCK GEFUNDEN  #812   +875 YSR\n');
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '3 1');
  writeFileSync(f, readFileSync(f, 'utf8') + '[10:02:30] angenommen #4 · y\n');
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '4 1', 'Der Block darf nicht doppelt zaehlen');

  // Ein Neustart setzt die Zaehler zurueck; vor der ersten Minutenzeile gibt es keine Leistung.
  writeFileSync(f, readFileSync(f, 'utf8') + '### Start 2026-10-11 10:05:00 GPU 0 YSKAR 0.7.1\n[10:05:09] angenommen #1 · x\n');
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '1 0');
  assert.equal(lade(`yskar_khs ${f}`).aus.trim(), '0');

  // Andere Einheiten und Schreibweisen.
  for (const [zeile, khs] of [
    ['[1] 10s 950,3 kH/s 60s', '950.300'], ['[1] 10s 1.234,56 MH/s 60s', '1234560.000'],
    ['[1] 10s 812 H/s 60s', '0.812'], ['[1] 10s 3.52 GH/s 60s', '3520000.000'],
  ]) {
    writeFileSync(f, zeile + '\n');
    assert.equal(lade(`yskar_khs ${f}`).aus.trim(), khs, zeile);
  }

  // Kuerzen: Die Zaehler springen nicht zurueck, egal ob der Start noch im Rest liegt.
  const zeilen = ['### Start s GPU 0'];
  for (let i = 1; i <= 300; i++) zeilen.push(`[x] angenommen #${i} · y`, '[x] abgelehnt stale', '[x] 10s 1,00 MH/s 60s');
  writeFileSync(f, zeilen.join('\n') + '\n');
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '300 300');
  lade(`yskar_kuerze ${f} 1000 50`);
  const kurz = readFileSync(f, 'utf8').trim().split('\n');
  assert.equal(kurz.length, 51);
  assert.match(kurz[0], /^### gekuerzt .* A=300 R=283$/);
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '300 300');
  assert.equal(lade(`yskar_khs ${f}`).aus.trim(), '1000.000');
  // Noch einmal kuerzen -- der alte Vermerk geht in den neuen ein.
  writeFileSync(f, readFileSync(f, 'utf8') + Array.from({ length: 40 }, () => '[x] abgelehnt low').join('\n') + '\n');
  lade(`yskar_kuerze ${f} 100 20`);
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '300 340');
  // Unter der Grenze bleibt alles, wie es ist.
  const vorher = readFileSync(f, 'utf8');
  lade(`yskar_kuerze ${f} 100000 5`);
  assert.equal(readFileSync(f, 'utf8'), vorher);
  // Liegt der letzte Start im Rest, zaehlt nur, was danach kam.
  writeFileSync(f, zeilen.join('\n') + '\n### Start neu\n[x] angenommen #4 · y\n');
  lade(`yskar_kuerze ${f} 1000 10`);
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '4 0');
  rmSync(d, { recursive: true, force: true });
});

test('Protokolle: englische Zeilen ab Miner 0.2.0', opt, () => {
  const d = mkdtempSync(join(tmpdir(), 'yskar-hive-log-en-'));
  const f = join(d, 'gpu0.log');
  const lade = (s: string) => bash(`. ./yskar-log.sh; ${s}`);

  writeFileSync(f, [
    '### Start 2026-10-28 10:00:00 GPU 0 YSKAR 1.0.0',
    '[10:00:03] job       new work · block 6,767 · difficulty 331,084,912',
    '[10:00:05] accepted  #1 · diff 21,904 · 0.007% of a block',
    '[10:00:10] rejected  bad_nonce',
    '[10:01:00] stats     10s 3.52 GH/s 60s 3.51 GH/s 15m 3.50 GH/s · 1.2 TH total · up 1 min',
    '[10:01:30] accepted  #2 · diff 1,000 · 0.003% of a block',
    '[10:01:40] block     ★ BLOCK FOUND  #6,792   +875 YSR',
    '[10:02:30] accepted  #4 · diff 9,876 · 0.003% of a block',
    '   Shares         4 accepted · 1 rejected (20.0%)',
  ].join('\n') + '\n');
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '4 1', 'Block und Zusammenfassung zaehlen nicht doppelt');
  assert.equal(lade(`yskar_khs ${f}`).aus.trim(), '3520000.000');
  // Ein Pool-Block ist ebenfalls ein angenommener Share.
  writeFileSync(f, readFileSync(f, 'utf8') + '[10:03:00] block     ★ BLOCK FOUND FOR POOL YSKAR MAIN  #6,793\n');
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '5 1');

  for (const [zeile, khs] of [
    ['[1] stats     10s 950.3 kH/s 60s', '950.300'], ['[1] stats     10s 41.20 MH/s 60s', '41200.000'],
    ['[1] stats     10s 812 H/s 60s', '0.812'],
  ]) {
    writeFileSync(f, zeile + '\n');
    assert.equal(lade(`yskar_khs ${f}`).aus.trim(), khs, zeile);
  }

  // Kuerzen zaehlt englische Ablehnungen genauso.
  const zeilen = ['### Start s GPU 0'];
  for (let i = 1; i <= 300; i++) zeilen.push(`[x] accepted  #${i} · y`, '[x] rejected  stale', '[x] stats     10s 1.00 MH/s 60s');
  writeFileSync(f, zeilen.join('\n') + '\n');
  lade(`yskar_kuerze ${f} 1000 50`);
  assert.match(readFileSync(f, 'utf8').split('\n')[0], /^### gekuerzt .* A=300 R=283$/);
  assert.equal(lade(`yskar_zaehle ${f}`).aus.trim(), '300 300');
  rmSync(d, { recursive: true, force: true });
});

test('h-stats.sh liefert khs und stats wie der Agent sie erwartet', opt, () => {
  logsLeeren();
  // Ohne Kartenliste von h-run.sh: wie bisher die n-te NVIDIA-Karte.
  rmSync(join(ORDNER, '.karten'), { force: true });
  const jetzt = new Date();
  writeFileSync(`${LOG}_gpu0.log`, '### Start\n[1] angenommen #5 · y\n[1] abgelehnt stale\n[1] 10s 2,00 GH/s 60s\n');
  writeFileSync(`${LOG}_gpu2.log`, '### Start\n[1] angenommen #3 · y\n[1] 10s 500,0 MH/s 60s\n');
  // Karte 10: still seit fuenf Minuten -- zaehlt mit 0, ihre Shares bleiben.
  writeFileSync(`${LOG}_gpu10.log`, '### Start\n[1] angenommen #2 · y\n[1] 10s 9,99 GH/s 60s\n');
  const alt = new Date(jetzt.getTime() - 300_000);
  spawnSync('touch', ['-d', alt.toISOString(), `${LOG}_gpu10.log`]);
  writeFileSync(join(ORDNER, '.gestartet'), String(Math.floor(jetzt.getTime() / 1000) - 120));

  // Wie HiveOS: alle Karten, eine davon AMD -- die zaehlt fuer CUDA nicht.
  const gs = join(mkdtempSync(join(tmpdir(), 'yskar-gs-')), 'gpu-stats.json');
  const busids = ['01:00.0', '03:00.0', '05:00.0', ...Array.from({ length: 9 }, (_, i) => `${(16 + i).toString(16)}:00.0`)];
  writeFileSync(gs, JSON.stringify({
    brand: ['nvidia', 'amd', 'nvidia', ...Array(9).fill('nvidia')],
    busids, temp: [61, 50, 63, ...Array(9).fill(70)], fan: [40, 30, 45, ...Array(9).fill(80)],
  }));

  const { khs, stats: s } = stats({ GPU_STATS_JSON: gs, khs: 'alt', n: 'vom Agenten' });
  assert.equal(khs, 2_500_000);
  assert.deepEqual(s.hs, [2_000_000, 500_000, 0]);
  assert.equal(s.hs_units, 'khs');
  assert.deepEqual(s.ar, [10, 1]);
  // Karte 2 ist die dritte NVIDIA-Karte (Bus 0x10), Karte 10 die elfte (Bus 0x18).
  assert.deepEqual(s.bus_numbers, [1, 16, 24]);
  assert.deepEqual(s.temp, [61, 70, 70]);
  assert.deepEqual(s.fan, [40, 80, 80]);
  assert.ok(s.uptime >= 120 && s.uptime < 200, `uptime ${s.uptime}`);
  assert.match(s.ver, /^\d+\.\d+\.\d+$/);

  // Variablen des Agenten bleiben, Hilfsfunktionen verschwinden wieder.
  const r = bash(`n=vom-Agenten; log=x; . ${ORDNER}/h-stats.sh; echo "$n $log"; type yskar_zaehle >/dev/null 2>&1 && echo uebrig`,
    { GPU_STATS_JSON: '/gibt/es/nicht' });
  assert.equal(r.aus.trim(), 'vom-Agenten x');

  // Ohne Protokolle: null, aber gueltiges JSON.
  logsLeeren();
  const leer = stats({ GPU_STATS_JSON: '/gibt/es/nicht' });
  assert.equal(leer.khs, 0);
  assert.deepEqual(leer.stats.hs, []);
});

test('h-stats.sh: AMD- und NVIDIA-Karten ueber die Kartenliste, nach Bus', opt, () => {
  logsLeeren();
  writeFileSync(`${LOG}_gpu0.log`, '### Start\n[1] angenommen #1 · y\n[1] 10s 1,00 GH/s 60s\n');
  writeFileSync(`${LOG}_gpu1.log`, '### Start\n[1] angenommen #1 · y\n[1] 10s 2,00 GH/s 60s\n');
  writeFileSync(`${LOG}_gpu2.log`, '### Start\n[1] angenommen #1 · y\n[1] 10s 3,00 GH/s 60s\n');
  // Wie h-run.sh sie schreibt: Nummer, Programm, Nummer im Programm, Bus.
  writeFileSync(join(ORDNER, '.karten'), '0 cuda 0 01:00.0\n1 opencl 0 03:00.0\n2 opencl 1 -\n');
  const gs = join(mkdtempSync(join(tmpdir(), 'yskar-gs-')), 'gpu-stats.json');
  writeFileSync(gs, JSON.stringify({
    brand: ['nvidia', 'amd', 'amd'], busids: ['01:00.0', '03:00.0', '06:00.0'],
    temp: [61, 55, 57], fan: [40, 33, 35],
  }));
  try {
    const { stats: s } = stats({ GPU_STATS_JSON: gs });
    assert.deepEqual(s.hs, [1_000_000, 2_000_000, 3_000_000]);
    // Karte 1 ist die AMD-Karte auf Bus 03; Karte 2 ohne bekannten Bus bleibt bei 0.
    assert.deepEqual(s.bus_numbers, [1, 3, 0]);
    assert.deepEqual(s.temp, [61, 55, 0]);
    assert.deepEqual(s.fan, [40, 33, 0]);
  } finally {
    rmSync(join(ORDNER, '.karten'), { force: true });
    logsLeeren();
  }
});

// ------------------------------------------------------------- im Betrieb

function ruf(p: number, pfad: string, o: { method?: string; headers?: Record<string, string>; body?: string } = {}):
    Promise<{ status: number; json: any }> {
  return new Promise((auf, ab) => {
    const req = request({ host: '127.0.0.1', port: p, path: pfad, method: o.method ?? 'GET', agent: false,
      headers: { host: `127.0.0.1:${p}`, ...(o.headers ?? {}) } }, res => {
      let t = ''; res.on('data', c => { t += c; });
      res.on('end', () => { let json: any = null; try { json = JSON.parse(t); } catch { /* */ } auf({ status: res.statusCode ?? 0, json }); });
    });
    req.on('error', ab);
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}

/** Prozesse einer Prozessgruppe, mit Kommandozeile. */
function gruppe(pgid: number): { pid: number; args: string }[] {
  const r = spawnSync('ps', ['-e', '-o', 'pid=,pgid=,args='], { encoding: 'utf8' });
  return r.stdout.split('\n').map(z => z.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .filter(m => Number(m![2]) === pgid).map(m => ({ pid: Number(m![1]), args: m![3] }));
}

test('Im Betrieb: zwei Karten minen im Pool, Ausfall und Stopp', { ...opt, timeout: 300_000 }, async () => {
  logsLeeren();
  // Statt yskar-cuda die Nachbildung, die zwei Karten vorgibt.
  copyFileSync(EMU, join(ORDNER, 'miner/gpu/yskar-cuda'));

  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 1_000_000n;
  const uhr = () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
  const ports = { gui: 19_960, api: 19_961, p2p: 19_962 };
  const app = new NodeCoreApp({ params: REGTEST, guiPort: ports.gui, basis: mkdtempSync(join(tmpdir(), 'yskar-hive-p-')), uhr });
  await app.startGui();
  const kopf = { 'x-yskar-token': app.zugangFuerFenster(), 'content-type': 'application/json' };
  const POST = (pfad: string, w: unknown) => ruf(ports.gui, pfad, { method: 'POST', headers: kopf, body: JSON.stringify(w) });
  let lauf: ChildProcess | null = null;
  try {
    assert.equal((await POST('/api/configure', { dataDir: mkdtempSync(join(tmpdir(), 'yskar-hive-d-')), nodePort: ports.api, p2pPort: ports.p2p, seed: '' })).status, 200);
    assert.equal((await POST('/api/pool/betrieb', { aktiv: true, name: 'Hivepool', feeBps: 0 })).status, 200);
    assert.equal((await POST('/api/start', {})).status, 200);
    const pool = `http://127.0.0.1:${ports.api}`;

    const c = bash(`. ./h-config.sh`, { CUSTOM_TEMPLATE: `${ADRESSE}.%WORKER_NAME%`, CUSTOM_URL: pool, CUSTOM_USER_CONFIG: 'MODE=pool' });
    assert.equal(c.code, 0, c.fehler);

    // Eigene Prozessgruppe -- so laesst sich am Ende pruefen, dass nichts uebrig bleibt.
    let ausgabe = '';
    lauf = spawn('bash', [join(ORDNER, 'h-run.sh')], {
      cwd: '/', detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, YSKAR_EMU_GERAETE: '2' },
    });
    lauf.stdout!.on('data', d => { ausgabe += d; });
    lauf.stderr!.on('data', d => { ausgabe += d; });
    const pgid = lauf.pid!;

    const log = (n: number) => { try { return readFileSync(`${LOG}_gpu${n}.log`, 'utf8'); } catch { return ''; } };
    // Angenommene Shares seit dem letzten Start -- auf dem Testnetz ist fast jeder ein Block.
    const shares = (n: number) => Number(bash(`. ./yskar-log.sh; yskar_zaehle ${LOG}_gpu${n}.log`).aus.split(' ')[0]);
    try {
      await bis('Beide Karten haben Shares geliefert', () => [0, 1].every(n => shares(n) > 0));
    } catch (e) {
      console.log(ausgabe.slice(-3000));
      throw e;
    }
    assert.match(ausgabe, /\[GPU 0\] /);
    assert.match(ausgabe, /\[GPU 1\] /);
    assert.equal((await ruf(ports.api, '/summary')).json.miningSessions, 2);
    assert.equal((await ruf(ports.api, '/api/v2/pool')).json.belegt, 1, 'Zwei Karten derselben Adresse belegen einen Platz');

    // Die Minutenzeile kommt nach 60 s.
    // Ab Miner 0.2.0 "] stats     10s …", bis 0.1.0 "] 10s …" -- wie yskar_khs in yskar-log.sh.
    await bis('Leistung je Karte', () => [0, 1].every(n => /\] (stats +)?10s /.test(log(n))));
    const s = stats();
    assert.equal(s.stats.hs.length, 2);
    assert.ok(s.stats.hs.every((h: number) => h > 0), JSON.stringify(s.stats));
    assert.ok(Math.abs(s.khs - s.stats.hs[0] - s.stats.hs[1]) < 0.01);
    assert.ok(s.stats.ar[0] >= 2, JSON.stringify(s.stats.ar));

    // Karte 1 faellt aus: nur sie startet neu, Karte 0 rechnet weiter.
    const miner1 = gruppe(pgid).find(p => /cli\.mjs .*--device 1$/.test(p.args));
    assert.ok(miner1, JSON.stringify(gruppe(pgid)));
    process.kill(miner1.pid, 'SIGKILL');
    await bis('Karte 1 startet neu', () => (log(1).match(/^### Start/gm) ?? []).length === 2, 40_000);
    assert.match(log(1), /Miner beendet \(Code 137\) -- Neustart in 15 s/);
    assert.equal((log(0).match(/^### Start/gm) ?? []).length, 1, 'Karte 0 wurde mit neu gestartet');
    await bis('Karte 1 liefert wieder', () => shares(1) > 0);

    // Stoppen wie HiveOS: alles endet, nichts rechnet weiter.
    process.kill(pgid, 'SIGTERM');
    await bis('Alles beendet', () => gruppe(pgid).length === 0, 20_000);
    lauf = null;
  } finally {
    if (lauf?.pid) { try { process.kill(-lauf.pid, 'SIGKILL'); } catch { /* schon weg */ } }
    await app.shutdown();
  }
});
