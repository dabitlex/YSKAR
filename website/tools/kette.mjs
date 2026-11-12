#!/usr/bin/env node
/*
 * Schreibt assets/data/kette.js: den Stand der Kette, mit dem jede Seite startet, bevor die erste Antwort
 * der API da ist, und den Verlauf aller Blöcke seit Block 0 (Zeit, Finder, Überweisungen) in knapper Form.
 * Liest ausschließlich per GET von der öffentlichen YSKAR-API.
 *
 *   node website/tools/kette.mjs           ergänzt die vorhandene Datei um die Blöcke, die seither dazukamen
 *   node website/tools/kette.mjs --full    liest die ganze Kette neu (rund 180 Abrufe)
 *
 * Die Seiten verweisen ohne Prüfsumme auf die Datei; ein neuer Bau ist danach nicht nötig.
 *
 * Was die Seite seit diesem Stand an Blöcken braucht, liest sie selbst nach (src/js/12-chain.js). Je älter
 * die Datei, desto mehr muss jeder Besucher beim ersten Aufruf nachladen. Der Workflow
 * .github/workflows/kettenverlauf.yml frischt sie deshalb einmal am Tag auf.
 *
 * Aufbau von history (alles bis drei Blöcke unter der Spitze; die jüngsten können noch ersetzt werden):
 *   t0, t1      Zeit von Block 0 und Block 1 (Unix-Sekunden)
 *   n           Zahl der Blöcke
 *   dt          je Block der Abstand zum Vorgänger in Sekunden, 16 Bit mit Vorzeichen, Base64
 *   fl          je Block ein Byte: Bit 0-1 Finder (0 allein, 1 YSKAR MAIN, 2 Gozero, 3 anderer Pool), 4 trägt Überweisungen
 *   work        je abgeschlossenem Tag (Tage seit 1970, UTC) die Summe der Difficulty seiner Blöcke
 *   series      Mittel der Difficulty je 24 Blöcke: [letzte Höhe des Abschnitts, Mittel]
 *   tail        Difficulty jedes Blocks ab `from`, dem ersten Block des jüngsten noch offenen Tages oder Abschnitts
 *   transfers   Zahl aller Überweisungen
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'assets', 'data', 'kette.js');
const API = process.env.YSKAR_API || 'https://www.yskar.app/api/v2';
const FULL = process.argv.includes('--full');
const PAGE = 50, STEP = 24, RECENT = 3, LATEST = 50;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  let last;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(API + path, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw new Error(`API nicht lesbar: ${path}: ${last.message}`);
}
/** Die Blöcke from … to (einschließlich) mit allen Angaben, aufsteigend. */
async function range(from, to) {
  const rows = new Map();
  for (let top = to; top >= from; top -= PAGE) {
    const d = await get(`/blocks?limit=${PAGE}&before=${top + 1}`);
    for (const b of d.blocks || []) if (b.height >= from && b.height <= to) rows.set(b.height, b);
    process.stdout.write(`\r  Blöcke ${Math.max(from, top - PAGE + 1)}–${to} gelesen   `);
    await sleep(120);
  }
  process.stdout.write('\n');
  const list = [];
  for (let h = from; h <= to; h++) { if (!rows.has(h)) throw new Error('Lücke in der Blockliste bei ' + h); list.push(rows.get(h)); }
  return list;
}
const cls = b => (b.finder === 'Gozero' ? 2 : b.finder === 'YSKAR MAIN' ? 1 : ((b.recipients || 1) === 1 ? 0 : 3));
const b64 = buf => Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64');

/** Die vorhandene Datei lesen: Zeit und Merkmale jedes Blocks und die Summen bis dahin. */
function previous() {
  if (FULL || !existsSync(OUT)) return null;
  const src = readFileSync(OUT, 'utf8'), H = JSON.parse(src.slice(src.indexOf('=') + 1, src.lastIndexOf(';'))).history;
  const dt = Buffer.from(H.dt, 'base64'), fl = Buffer.from(H.fl, 'base64'), T = [], F = [];
  let t = 0;
  for (let i = 0; i < H.n; i++) { t = i === 1 ? H.t1 - H.t0 : t + dt.readInt16LE(2 * i); T.push(t); F.push(fl[i]); }
  const D = new Map(H.tail.d.map((v, k) => [H.tail.from + k, v]));
  return { H, T, F, D };
}

const tipList = await get(`/blocks?limit=${LATEST}`);
const tip = tipList.blocks[0].height, N = tip + 1 - RECENT;
const old = previous();
if (old && old.H.n > N) throw new Error(`Die vorhandene Datei reicht weiter (${old.H.n} Blöcke) als die Kette (${N}). Mit --full neu lesen.`);

// Zeit und Merkmale je Block; Difficulty ab dem Anfang des offenen Teils; Summen
const T = old ? old.T.slice() : [], F = old ? old.F.slice() : [], D = old ? new Map(old.D) : new Map();
const work = old ? { ...old.H.work } : {}, series = old ? old.H.series.slice() : [];
let transfers = old ? old.H.transfers : 0, t0 = old ? old.H.t0 : 0;
const first = old ? old.H.n : 0;
console.log(old ? `Vorhanden: ${first} Blöcke. Neu: ${first}–${N - 1}.` : `Lese die ganze Kette: 0–${N - 1}.`);
if (N > first) {
  for (const b of await range(first, N - 1)) {
    const h = b.height, ts = Number(b.timestamp), x = (b.txCount || 1) - 1, c = cls(b);
    if (h === 0) t0 = ts;
    T[h] = ts - t0; F[h] = c | (x > 0 ? 4 : 0);
    D.set(h, Number(b.difficultyWert));
    transfers += x;
  }
}

// Tage (UTC). Ein Block darf eine frühere Zeit tragen als sein Vorgänger; er zählt dann zum laufenden Tag.
const days = [];
for (let i = 1, cur = null; i < N; i++) {
  const day = Math.max(cur ? cur.day : 0, Math.floor((t0 + T[i]) / 86400));
  if (!cur || cur.day !== day) { cur = { day, h0: i, h1: i }; days.push(cur); }
  cur.h1 = i;
}
// Der offene Teil beginnt am ersten Block des Tages, in dem der jüngste Tag oder der jüngste unvollständige Abschnitt anfängt.
const lastFull = Math.floor((N - 1) / STEP) * STEP;                       // letzte Höhe des letzten vollständigen Abschnitts (Abschnitte ab Block 1)
const open = Math.min(days.length ? days[days.length - 1].h0 : 1, lastFull + 1);
const tailFrom = days.length ? days.filter(d => d.h0 <= open).pop().h0 : 1;
for (const d of days) {
  if (d.h0 >= tailFrom || work[d.day] !== undefined) continue;
  let sum = 0;
  for (let j = d.h0; j <= d.h1; j++) { if (!D.has(j)) throw new Error('Difficulty fehlt für Block ' + j); sum += D.get(j); }
  work[d.day] = sum;
}
for (const k of Object.keys(work)) if (!days.some(d => String(d.day) === k && d.h0 < tailFrom)) delete work[k];
for (let k = series.length ? series[series.length - 1][0] + 1 : 1; k + STEP - 1 <= lastFull; k += STEP) {
  let sum = 0;
  for (let j = k; j < k + STEP; j++) { if (!D.has(j)) throw new Error('Difficulty fehlt für Block ' + j); sum += D.get(j); }
  series.push([k + STEP - 1, Math.round(sum / STEP)]);
}
const tail = [];
for (let j = tailFrom; j < N; j++) { if (!D.has(j)) throw new Error('Difficulty fehlt für Block ' + j); tail.push(D.get(j)); }

const dt = new Int16Array(N);
for (let i = 2; i < N; i++) dt[i] = Math.max(-32768, Math.min(32767, T[i] - T[i - 1]));
const history = {
  t0, t1: t0 + T[1], n: N, dt: b64(dt), fl: b64(Uint8Array.from(F.slice(0, N))),
  work, series, tail: { from: tailFrom, d: tail }, transfers,
};

// Der Stand von jetzt: dieselben Antworten, die die Seite später selbst holt
const [summary, supply, pools, fees, genesis, latest] = await Promise.all([
  get('/summary'), get('/supply'), get('/pools'), get('/fees'), get('/blocks/0'), get(`/blocks?limit=${LATEST}`)]);
if (latest.blocks[0].height < N - 1) throw new Error('Die Spitze liegt unter dem gelesenen Verlauf. Noch einmal ausführen.');
const snapshot = {
  takenAt: Math.floor(Date.now() / 1000),
  summary, supply, pools, fees,
  blocks: latest.blocks,
  genesis: { header: genesis.header, hash: genesis.hash },
  history,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, 'window.YSKAR_SNAPSHOT=' + JSON.stringify(snapshot) + ';\n');
console.log(`ok: ${OUT}\n  Spitze ${latest.blocks[0].height}, Verlauf bis Block ${N - 1}, ${days.length} Tage, ${series.length} Abschnitte, ` +
  `${transfers} Überweisungen, offener Teil ab Block ${tailFrom} (${tail.length} Werte), ` +
  `${(readFileSync(OUT).length / 1024).toFixed(0)} KB`);
