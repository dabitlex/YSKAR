/**
 * Issue #7: Der Kommandozeilen-Knoten sichert das PPLNS-Fenster seines Pools.
 *
 * Bisher konnte das nur Node Core. Der oeffentliche Pool laeuft aber auf dem
 * Kommandozeilen-Knoten (deploy/yskar-node.service) und begann nach jedem
 * Neustart mit leerem Fenster.
 *
 * Geprueft am echten Programm: Knoten starten (Testnetz, ohne Netz, ohne
 * Gegenstelle), Pool-Stand ueber /api/v2/pool lesen, mit SIGTERM beenden
 * wie systemd, Datei pruefen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../src/lib/node/fullnode/cli.ts', import.meta.url).pathname;
const ADRESSE = 'ysr1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg338lnuu';
let port = 18850 + Math.floor(Math.random() * 100);

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

async function knoten(daten: string, extra: string[]) {
  const p = port++;
  const kind = spawn(process.execPath, ['--experimental-strip-types', CLI, 'mine', '--regtest',
    '--data', daten, '--port', String(p), '--no-upstream', '--no-p2p', ...extra],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  let ausgabe = '';
  kind.stdout.on('data', d => { ausgabe += d; });
  kind.stderr.on('data', d => { ausgabe += d; });
  const ende = new Promise<number | null>(r => kind.on('exit', c => r(c)));
  let pool: Record<string, unknown> | null = null;
  for (let i = 0; i < 100 && !pool; i++) {
    await warte(150);
    try { pool = await (await fetch(`http://127.0.0.1:${p}/api/v2/pool`)).json() as Record<string, unknown>; }
    catch { /* noch nicht bereit */ }
  }
  return {
    pool: pool!,
    ausgabe: () => ausgabe,
    async stopp() { kind.kill('SIGTERM'); return ende; },
  };
}

function fensterDatei(daten: string, inhalt: unknown) {
  writeFileSync(join(daten, 'pool-fenster.json'), typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt));
}
const A = '11'.repeat(20), B = '22'.repeat(20);

test('Gesichertes Fenster wird beim Start geladen und beim Beenden wieder geschrieben', async () => {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-fenster-'));
  try {
    fensterDatei(daten, { fassung: 1, netz: 'yskar-regtest', feeBps: 0, eintraege: [[A, ['500', '700']], [B, ['300']]] });
    const k = await knoten(daten, ['--pool', 'TESTPOOL']);
    assert.equal(k.pool.eintraege, 3);
    assert.equal(k.pool.arbeitGesamt, '1500');
    assert.match(k.ausgabe(), /3 Shares aus dem letzten Lauf/);

    // Datei weg -- beim Beenden muss sie neu entstehen, mit derselben Arbeit.
    rmSync(join(daten, 'pool-fenster.json'));
    assert.equal(await k.stopp(), 0);
    const d = JSON.parse(readFileSync(join(daten, 'pool-fenster.json'), 'utf8'));
    assert.equal(d.fassung, 1);
    assert.equal(d.netz, 'yskar-regtest');
    assert.deepEqual(d.eintraege, [[A, ['500', '700']], [B, ['300']]]);
  } finally { rmSync(daten, { recursive: true, force: true }); }
});

test('Geaenderte Gebuehr gilt erst ab dem naechsten Block, nicht fuer gesicherte Arbeit', async () => {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-fenster-'));
  try {
    fensterDatei(daten, { fassung: 1, netz: 'yskar-regtest', feeBps: 0, eintraege: [[A, ['500']]] });
    const k = await knoten(daten, ['--pool', 'TESTPOOL', '--pool-fee', '100', '--pool-payout', ADRESSE]);
    assert.equal(k.pool.feeBps, 0, 'die Arbeit im Fenster wurde ohne Gebuehr geleistet');
    assert.equal(k.pool.feeBpsNext, 100);
    assert.equal(k.pool.plaetze, 63, 'die angekuendigte Gebuehr belegt schon einen Platz');
    assert.match(k.ausgabe(), /Gebühr 0\.00 % \(ab dem nächsten Block 1\.00 %\)/);
    assert.equal(await k.stopp(), 0);
  } finally { rmSync(daten, { recursive: true, force: true }); }
});

test('Ohne Datei: leeres Fenster; unlesbare Datei: beiseitegelegt, Knoten startet trotzdem', async () => {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-fenster-'));
  try {
    const k1 = await knoten(daten, ['--pool', 'TESTPOOL']);
    assert.equal(k1.pool.eintraege, 0);
    assert.equal(await k1.stopp(), 0);
    assert.ok(existsSync(join(daten, 'pool-fenster.json')), 'beim Beenden gesichert');

    fensterDatei(daten, '{kaputt');
    const k2 = await knoten(daten, ['--pool', 'TESTPOOL']);
    assert.equal(k2.pool.eintraege, 0);
    assert.match(k2.ausgabe(), /pool-fenster\.json\.unlesbar/);
    assert.ok(existsSync(join(daten, 'pool-fenster.json.unlesbar')));
    assert.equal(await k2.stopp(), 0);
  } finally { rmSync(daten, { recursive: true, force: true }); }
});

test('Fenster aus einem anderen Netz zaehlt nicht', async () => {
  const daten = mkdtempSync(join(tmpdir(), 'yskar-fenster-'));
  try {
    fensterDatei(daten, { fassung: 1, netz: 'yskar-mainnet', feeBps: 0, eintraege: [[A, ['500']]] });
    const k = await knoten(daten, ['--pool', 'TESTPOOL']);
    assert.equal(k.pool.eintraege, 0);
    assert.equal(await k.stopp(), 0);
  } finally { rmSync(daten, { recursive: true, force: true }); }
});
