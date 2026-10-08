/**
 * Kommandozeilen-Miner gegen einen Knoten, der sich falsch verhaelt.
 *
 *   Issue #2: Nimmt der Knoten die Anmeldung an, kennt die Sitzung beim
 *             naechsten /job aber nicht, meldete sich der Miner im Takt der
 *             Netzlaufzeit neu an -- ohne Pause, ohne die alte Sitzung zu
 *             schliessen.
 *   Issue #3: Antworten wurden ungeprueft uebernommen -- Ziel, Groesse,
 *             Steuerzeichen.
 *
 * Gestartet wird der ECHTE Miner (miner/src/cli.mjs) als eigener Prozess
 * gegen einen nachgestellten Knoten, der zaehlt, was ankommt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import { encodeAddress } from '../src/lib/core/address.ts';
import { MINER_A } from './helpers/regtest.ts';
// @ts-expect-error -- reines JavaScript ohne Typen
import { pruefeJob, sauber, liesRumpf, ANTWORT_MAX, shareDifficulty } from '../miner/src/pruefung.mjs';

const ADRESSE = encodeAddress(MINER_A);
const MINER = join(import.meta.dirname, '..', 'miner', 'src', 'cli.mjs');
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

const JOB = {
  jobId: 'j1', height: 5, version: 1,
  prevHash: '11'.repeat(32), merkleRoot: '22'.repeat(32), stateRoot: '33'.repeat(32),
  timestamp: '1788912000', difficulty: 4096, difficultyWert: '4096', txCount: 1,
  extranonce: '7', target: '0000' + 'ff'.repeat(30), shareDifficulty: '1',
};

// ------------------------------------------------------------ Pruefung (#3)

test('pruefeJob: ein ordentlicher Job geht durch', () => {
  assert.doesNotThrow(() => pruefeJob(JOB));
});

test('pruefeJob: Ziel leichter als Difficulty 1, Ziel 0 und kaputte Felder werden abgelehnt', () => {
  for (const kaputt of [
    { ...JOB, target: 'ff'.repeat(32) },               // jeder Hash ein Treffer
    { ...JOB, target: '0001' + '00'.repeat(29) + '01' }, // 2^240 + 1: leichter als Difficulty 1
    { ...JOB, target: '00'.repeat(32) },
    { ...JOB, target: 'zz'.repeat(32) },
    { ...JOB, prevHash: '11'.repeat(31) },
    { ...JOB, height: -1 },
    { ...JOB, difficulty: 2 ** 32 },
    { ...JOB, timestamp: '1'.repeat(21) },
    { ...JOB, jobId: 'a'.repeat(129) },
    { ...JOB, jobId: 'mit leerzeichen' },
    { ...JOB, shareDifficulty: '0' },
    { ...JOB, shareDifficulty: 0.5 },
  ]) assert.throws(() => pruefeJob(kaputt), /unlesbare Arbeit/, JSON.stringify(kaputt).slice(0, 80));
  // Genau Difficulty 1 (2^240) ist erlaubt.
  assert.doesNotThrow(() => pruefeJob({ ...JOB, target: '0001' + '00'.repeat(30) }));
});

test('shareDifficulty: nur ganze Zahlen ab 1', () => {
  assert.equal(shareDifficulty('128'), 128);
  assert.equal(shareDifficulty(512), 512);
  for (const x of ['0', 0, -1, 1.5, 'abc', null, undefined, '1e3', 2 ** 60]) assert.equal(shareDifficulty(x), null, String(x));
});

test('sauber: Escape-Sequenzen und Richtungszeichen verschwinden', () => {
  assert.equal(sauber('\x1b]0;Titel\x07Pool\x1b[31m rot‮'), ']0;TitelPool[31m rot');
  assert.equal(sauber('YSKAR Main'), 'YSKAR Main');
});

test('liesRumpf: hoechstens ANTWORT_MAX Byte; Texte gesaeubert', async () => {
  const gross = new Response('{"x":"' + 'a'.repeat(ANTWORT_MAX) + '"}');
  await assert.rejects(liesRumpf(gross), /zu groß/);
  const ok = await liesRumpf(new Response(JSON.stringify({ detail: '\x1b[2Jweg', n: { name: 'a\x07b' } })));
  assert.deepEqual(ok, { detail: '[2Jweg', n: { name: 'ab' } });
  assert.deepEqual(await liesRumpf(new Response('kein json')), {});
});

// ------------------------------------------------- Miner gegen einen Knoten

type Antwort = (pfad: string, req: IncomingMessage) => unknown;
async function knoten(antwort: Antwort) {
  const zaehler = new Map<string, number>();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pfad = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/api\/v2/, '');
    zaehler.set(pfad, (zaehler.get(pfad) ?? 0) + 1);
    req.resume();
    req.on('end', () => {
      const a = antwort(pfad, req);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(a ?? {}));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, zaehler, zu: () => new Promise(r => server.close(r)) };
}

function miner(api: string) {
  const kind = spawn(process.execPath, [MINER, '--address', ADRESSE, '--api', api, '--workers', '1', '--einfach'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let aus = '';
  kind.stdout.on('data', d => { aus += d; });
  kind.stderr.on('data', d => { aus += d; });
  return { text: () => aus, stopp: () => { kind.kill('SIGKILL'); } };
}

const SUMMARY = { height: 5, difficulty: '4096', network: 'yskar-regtest' };

test('Issue #2: Knoten vergisst die Sitzung sofort -- der Miner bremst und schliesst alte Sitzungen', async () => {
  let n = 0;
  const k = await knoten(pfad => {
    if (pfad === '/summary') return SUMMARY;
    if (pfad === '/session') return { sessionId: `s${++n}`, extranonce: '1', shareDifficulty: '128' };
    if (pfad === '/job') return { error: 'session_inactive' };
    if (pfad === '/session/stop') return { stopped: true };
    return {};
  });
  const m = miner(k.url);
  try {
    await warte(14_000);
    const anmeldungen = k.zaehler.get('/session') ?? 0;
    const stopps = k.zaehler.get('/session/stop') ?? 0;
    // Mit Pause 2, 4, 8 s: in 14 s hoechstens eine Handvoll. Vorher: hunderte.
    assert.ok(anmeldungen >= 2, `der Miner versucht es weiter: ${anmeldungen}\n${m.text().slice(-800)}`);
    assert.ok(anmeldungen <= 6, `gebremst: ${anmeldungen} Anmeldungen in 14 s`);
    assert.ok(stopps >= anmeldungen - 2, `alte Sitzungen abgemeldet: ${stopps} von ${anmeldungen}`);
    assert.match(m.text(), /gebremst/);
  } finally { m.stopp(); await k.zu(); }
});

test('Issue #3: Job mit Ziel "ff..ff" wird verworfen; Steuerzeichen des Knotens erreichen das Terminal nicht', async () => {
  const k = await knoten(pfad => {
    if (pfad === '/summary') return SUMMARY;
    if (pfad === '/session') return {
      sessionId: 's1', extranonce: '1', shareDifficulty: '128',
      pool: { name: '\x1b]0;GEKAPERT\x07Böser Pool', feeBps: 0 },
    };
    if (pfad === '/job') return { ...JOB, target: 'ff'.repeat(32), detail: 'x' };
    if (pfad === '/share') return { accepted: true };
    return {};
  });
  const m = miner(k.url);
  try {
    await warte(6_000);
    assert.match(m.text(), /Job verworfen: Der Knoten schickt unlesbare Arbeit/);
    assert.equal(k.zaehler.get('/share') ?? 0, 0, 'mit dem Ziel ff..ff haette jeder Hash einen Share ausgeloest');
    assert.ok(!m.text().includes('\x1b]0;'), 'keine Terminal-Steuerfolge aus der Antwort');
    assert.ok(!m.text().includes('\x07'));
  } finally { m.stopp(); await k.zu(); }
});

test('Issue #3: haengender Knoten -- die Anmeldung bricht nach der Frist ab', async () => {
  // Antwortet auf /session nie. Vorher galt die Frist von fetch (Minuten).
  const server = createServer((req, res) => {
    const pfad = new URL(req.url ?? '/', 'http://x').pathname;
    if (pfad.endsWith('/summary')) { res.writeHead(200).end(JSON.stringify(SUMMARY)); return; }
    // /session: liegen lassen
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const m = miner(`http://127.0.0.1:${port}`);
  try {
    const t0 = Date.now();
    while (!/Verbindung fehlgeschlagen/.test(m.text()) && Date.now() - t0 < 30_000) await warte(200);
    const dauer = Date.now() - t0;
    assert.match(m.text(), /Verbindung fehlgeschlagen/);
    assert.ok(dauer < 25_000, `nach ${dauer} ms`);
  } finally { m.stopp(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
