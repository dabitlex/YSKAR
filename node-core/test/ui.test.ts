/**
 * Die Dateien der Oberflaeche: Texte in beiden Sprachen vollstaendig, und der
 * Server gibt nur heraus, was zur Oberflaeche gehoert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { NodeCoreApp } from '../src/main.ts';
// @ts-ignore -- reines JavaScript der Oberflaeche
import { de } from '../ui/js/de.js';
// @ts-ignore
import { en } from '../ui/js/en.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const JS = join(HIER, '..', 'ui', 'js');

test('Texte: Englisch hat genau die Schlüssel des Deutschen', () => {
  const d = Object.keys(de).sort(), e = Object.keys(en).sort();
  assert.deepEqual(e.filter(k => !d.includes(k)), [], 'Schlüssel nur im Englischen');
  assert.deepEqual(d.filter(k => !e.includes(k)), [], 'Schlüssel fehlen im Englischen');
  for (const k of d) {
    assert.equal(typeof (en as any)[k], typeof (de as any)[k], `${k}: Text hier, Funktion dort`);
    if (typeof (de as any)[k] === 'string') {
      const platz = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join();
      assert.equal(platz((en as any)[k]), platz((de as any)[k]), `${k}: andere Platzhalter`);
      assert.ok((en as any)[k].trim().length > 0, `${k}: leer`);
    }
  }
});

test('Texte: Jeder verwendete Schlüssel ist vorhanden', () => {
  const fehlend: string[] = [];
  const vorsilben: string[] = [];
  for (const f of readdirSync(JS).filter(x => x.endsWith('.js') && x !== 'de.js' && x !== 'en.js')) {
    const text = readFileSync(join(JS, f), 'utf8');
    for (const m of text.matchAll(/\bt\('([a-zA-Z0-9_.]+)'\s*([,)+])/g)) {
      if (m[2] === '+') { vorsilben.push(m[1]); continue; }
      if (!(m[1] in de)) fehlend.push(`${f}: ${m[1]}`);
    }
    // Schluessel, die als Text in einer Liste stehen: ['einr.s1', ...]
    for (const m of text.matchAll(/(?<!el\()'((?:allg|fehler|zeit|nav|leiste|ueb|kette|peers|min|einst|einr|wal|pool|betr|srv)\.[a-zA-Z0-9_.]+)'/g)) {
      if (!m[1].endsWith('.') && !(m[1] in de)) fehlend.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(fehlend)], []);
  // Zusammengesetzte Schluessel: Zu jeder Vorsilbe muss es Eintraege geben.
  for (const v of new Set(vorsilben)) {
    assert.ok(Object.keys(de).some(k => k.startsWith(v)), `Kein Text beginnt mit ${v}`);
  }
});

test('Texte: Zu jedem Kürzel des Knotens gibt es einen Text in beiden Sprachen', () => {
  const SRC = join(HIER, '..', 'src');
  const kuerzel = new Set<string>();
  for (const f of readdirSync(SRC).filter(x => x.endsWith('.ts'))) {
    const text = readFileSync(join(SRC, f), 'utf8');
    for (const m of text.matchAll(/new (?:KernFehler|WalletFehler|PoolEndgueltig)\('([a-z0-9_]+)'/g)) kuerzel.add(m[1]);
    for (const m of text.matchAll(/\bnein\('([a-z_]+)'/g)) kuerzel.add(m[1]);
    for (const m of text.matchAll(/\b(?:code|grundCode)(?:\s*=|:)\s*'([a-z_]+)'/g)) kuerzel.add(m[1]);
    for (const m of text.matchAll(/fertig\([^\n]*,\s*'(gpu_[a-z_]+)'\)/g)) kuerzel.add(m[1]);
    // Gruende, aus denen der Knoten eine Ueberweisung ablehnt.
    const abgelehnt = text.match(/const text: Record<string, string> = \{([\s\S]*?)\};/);
    if (abgelehnt) for (const m of abgelehnt[1].matchAll(/^\s*([a-z_]+):/gm)) kuerzel.add('abgelehnt_' + m[1]);
  }
  kuerzel.delete('abgelehnt_');     // der Anfang des zusammengesetzten Kuerzels
  assert.ok(kuerzel.size > 40, `Nur ${kuerzel.size} Kürzel gefunden -- sucht der Test noch richtig?`);
  const ohne = [...kuerzel].filter(k => !(('srv.' + k) in de) || !(('srv.' + k) in en)).sort();
  assert.deepEqual(ohne, [], 'Kürzel ohne Text');
  // Und umgekehrt: kein Text fuer ein Kuerzel, das es nicht mehr gibt.
  const quellen = readdirSync(SRC).filter(x => x.endsWith('.ts')).map(f => readFileSync(join(SRC, f), 'utf8')).join('\n');
  const verwaist = Object.keys(de)
    .filter(k => k.startsWith('srv.') && !kuerzel.has(k.slice(4)) && !quellen.includes(`'${k.slice(4)}'`)).sort();
  assert.deepEqual(verwaist, [], 'Texte ohne Kürzel');
});

function ruf(port: number, pfad: string, kopf: Record<string, string> = {}):
    Promise<{ status: number; typ: string; text: string; csp: string }> {
  return new Promise((auf, ab) => {
    const req = request({ host: '127.0.0.1', port, path: pfad, headers: { host: `127.0.0.1:${port}`, ...kopf } }, res => {
      let text = ''; res.on('data', c => { text += c; });
      res.on('end', () => auf({ status: res.statusCode ?? 0, typ: String(res.headers['content-type']), text,
        csp: String(res.headers['content-security-policy'] ?? '') }));
    });
    req.on('error', ab); req.end();
  });
}

test('Dateien: Nur die Oberfläche, nichts daneben', async () => {
  const port = 19_790;
  const app = new NodeCoreApp({ params: REGTEST, guiPort: port, basis: mkdtempSync(join(tmpdir(), 'yskar-ui-')) });
  await app.startGui();
  try {
    const css = await ruf(port, '/ui/app.css');
    assert.equal(css.status, 200); assert.match(css.typ, /^text\/css/);
    assert.match(css.csp, /default-src 'none'/, 'Auch Dateien tragen die Schutzköpfe');

    const js = await ruf(port, '/ui/js/main.js');
    assert.equal(js.status, 200); assert.match(js.typ, /^text\/javascript/);

    const schrift = await ruf(port, '/ui/fonts/manrope-latin-wght-normal.woff2');
    assert.equal(schrift.status, 200); assert.equal(schrift.typ, 'font/woff2');

    // Das Zeichen der Marke: ein PNG mit durchsichtigem Grund.
    const zeichen = await new Promise<{ status: number; typ: string; inhalt: Buffer }>((auf, ab) => {
      const req = request({ host: '127.0.0.1', port, path: '/ui/kristall.png', headers: { host: `127.0.0.1:${port}` } }, res => {
        const teile: Buffer[] = []; res.on('data', c => teile.push(c));
        res.on('end', () => auf({ status: res.statusCode ?? 0, typ: String(res.headers['content-type']), inhalt: Buffer.concat(teile) }));
      });
      req.on('error', ab); req.end();
    });
    assert.equal(zeichen.status, 200); assert.equal(zeichen.typ, 'image/png');
    assert.equal(zeichen.inhalt.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(zeichen.inhalt[25], 6, 'Farbe mit Deckkraft (RGBA) -- sonst hätte das Zeichen einen Hintergrund');
    assert.match(readFileSync(join(JS, 'kern.js'), 'utf8'), /'\/ui\/kristall\.png'/);

    // Jede Datei, die die Seite laedt, gibt es auch.
    const geladen = [...css.text.matchAll(/url\((\/ui\/[^)]+)\)/g)].map(m => m[1]);
    assert.ok(geladen.length >= 4);
    for (const g of geladen) assert.equal((await ruf(port, g)).status, 200, g);
    for (const m of readFileSync(join(JS, 'main.js'), 'utf8').matchAll(/from '\.\/([a-z0-9]+\.js)'/g)) {
      assert.equal((await ruf(port, '/ui/js/' + m[1])).status, 200, m[1]);
    }

    // Nichts ausserhalb, auf keinem Weg.
    for (const pfad of [
      '/ui/../src/main.ts', '/ui/..%2fsrc%2fmain.ts', '/ui/%2e%2e/package.json', '/ui/js/../../package.json',
      '/ui/fonts/../../../README.md', '/ui/fonts/..%2f..%2f..%2fpackage.json', '/ui//etc/passwd',
      '/ui/js/%00.js', '/ui/gibt-es-nicht.js', '/ui/app.css.map', '/ui/', '/ui/js/',
    ]) {
      const r = await ruf(port, pfad);
      assert.ok(r.status === 404 || r.status === 400, `${pfad} -> ${r.status}`);
      assert.ok(!r.text.includes('"name"') && !r.text.includes('NodeCoreApp'), `${pfad} gibt Inhalt heraus`);
    }

    // Die Seite mit dem Schluessel gibt es nur unter "/", nicht als Datei.
    assert.equal((await ruf(port, '/ui/index.html')).status, 404);

    // Und auch Dateien gehen an keinen fremden Namen.
    assert.equal((await ruf(port, '/ui/app.css', { host: `boese.example:${port}` })).status, 403);
  } finally {
    await app.shutdown();
  }
});
