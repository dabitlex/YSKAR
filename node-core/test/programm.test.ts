/**
 * Was zum Programm gehoert: die Verbindung zur Desktop-Huelle, die Suche nach
 * einer neuen Version, das Fortsetzen des Minings, die Protokolldatei.
 *
 * Die Huelle selbst (Electron) laeuft hier nicht. An ihrer Stelle steht eine
 * Attrappe mit derselben Schnittstelle -- geprueft wird, was das Programm
 * ihr sagt und was es NICHT durchlaesst.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { NodeCoreApp, VERSION, type Huelle } from '../src/main.ts';
import { linkErlaubt, vergleiche, sucheUpdate, Protokoll, ordnerBytes, RELEASES_SEITE } from '../src/Programm.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-prog-'));
let naechsterPort = 19_400;
const port = () => naechsterPort++;

async function bis(was: string, pruefe: () => Promise<boolean> | boolean, ms = 60_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await pruefe()) return; await warte(50); }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

function ruf(p: number, pfad: string, opt: { method?: string; headers?: Record<string, string>; body?: string } = {}):
    Promise<{ status: number; text: string; json: any }> {
  return new Promise((auf, ab) => {
    const req = request({ host: '127.0.0.1', port: p, path: pfad, method: opt.method ?? 'GET', agent: false,
      headers: { host: `127.0.0.1:${p}`, ...(opt.headers ?? {}) } }, res => {
      let text = ''; res.on('data', c => { text += c; });
      res.on('end', () => { let json: any = null; try { json = JSON.parse(text); } catch { /* kein JSON */ } auf({ status: res.statusCode ?? 0, text, json }); });
    });
    req.on('error', ab);
    if (opt.body !== undefined) req.write(opt.body);
    req.end();
  });
}

async function kern(opt: ConstructorParameters<typeof NodeCoreApp>[0] = {}) {
  const gui = port();
  const basis = opt.basis ?? ordner();
  const app = new NodeCoreApp({ params: REGTEST, guiPort: gui, ...opt, basis });
  await app.startGui();
  const token = (await ruf(gui, '/')).text.match(/content="([0-9a-f]{64})"/)![1];
  const kopf = { 'x-yskar-token': token, 'content-type': 'application/json' };
  const GET = (pfad: string) => ruf(gui, pfad, { headers: { 'x-yskar-token': token } });
  const POST = (pfad: string, wert: unknown = {}) => ruf(gui, pfad, { method: 'POST', headers: kopf, body: JSON.stringify(wert) });
  return { app, gui, basis, GET, POST, stand: async () => (await GET('/api/status')).json };
}

/** Ein Server, der eine vorgegebene Antwort gibt -- als Ersatz fuer GitHub. */
async function quelle(antwort: () => { status?: number; kopf?: Record<string, string>; text: string }) {
  const p = port();
  let rufe = 0;
  const server = createServer((_req, res) => {
    rufe++;
    const a = antwort();
    res.writeHead(a.status ?? 200, { 'content-type': 'application/json', ...(a.kopf ?? {}) });
    res.end(a.text);
  });
  await new Promise<void>(auf => server.listen(p, '127.0.0.1', auf));
  return { url: `http://127.0.0.1:${p}/releases`, server, rufe: () => rufe };
}

// ---------------------------------------------------------------------------

test('Links: nur die eigenen Adressen, nur https', () => {
  for (const gut of [
    'https://github.com/dabitlex/YSKAR',
    'https://github.com/dabitlex/YSKAR/releases',
    'https://github.com/dabitlex/YSKAR/blob/main/docs/POOL.md',
    'https://www.yskar.app/',
    'https://yskar.vercel.app/explorer',
  ]) assert.equal(linkErlaubt(gut), new URL(gut).href, gut);

  for (const schlecht of [
    'http://github.com/dabitlex/YSKAR',
    'https://github.com/dabitlex/YSKAR-fake',
    'https://github.com/jemand/anders',
    'https://github.com.boese.example/dabitlex/YSKAR',
    'https://github.com@boese.example/dabitlex/YSKAR',
    'https://nutzer:pw@github.com/dabitlex/YSKAR',
    'https://github.com:8443/dabitlex/YSKAR',
    'https://yskar.app.boese.example/',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'ms-settings:',
    '\\\\server\\freigabe',
    'C:\\Windows\\System32\\calc.exe',
    '', 42, null, 'https://www.yskar.app/' + 'a'.repeat(400),
  ]) assert.equal(linkErlaubt(schlecht), null, String(schlecht));
});

test('Versionen vergleichen', () => {
  assert.ok(vergleiche('0.5.0', '0.4.0') > 0);
  assert.ok(vergleiche('0.10.0', '0.9.9') > 0, 'Zahlen, nicht Zeichen');
  assert.ok(vergleiche('1.0.0', '0.99.99') > 0);
  assert.equal(vergleiche('0.4.0', '0.4.0'), 0);
  assert.ok(vergleiche('0.3.9', '0.4.0') < 0);
  assert.equal(vergleiche('unsinn', '0.4.0'), 0);
});

test('Neue Version: nur veröffentlichte Fassungen des Node Core zählen', async () => {
  const liste = [
    { tag_name: 'app-v9.9.9', html_url: RELEASES_SEITE + '/tag/app-v9.9.9' },              // die App, nicht der Node Core
    { tag_name: 'node-core-v0.4.0', html_url: RELEASES_SEITE + '/tag/node-core-v0.4.0' },
    { tag_name: 'node-core-v0.6.0', html_url: RELEASES_SEITE + '/tag/node-core-v0.6.0' },
    { tag_name: 'node-core-v0.10.2', html_url: RELEASES_SEITE + '/tag/node-core-v0.10.2' },
    { tag_name: 'node-core-v7.0.0', draft: true, html_url: RELEASES_SEITE + '/tag/node-core-v7.0.0' },
    { tag_name: 'node-core-v8.0.0', prerelease: true, html_url: RELEASES_SEITE + '/tag/node-core-v8.0.0' },
    { tag_name: 'node-core-v9.0.0-beta', html_url: 'x' },
    null, 'unsinn', { tag_name: 17 },
  ];
  const q = await quelle(() => ({ text: JSON.stringify(liste) }));
  try {
    const r = await sucheUpdate('0.4.0', q.url, 'test/1');
    assert.equal(r.fehler, null);
    assert.equal(r.neueste, '0.10.2');
    assert.equal(r.neuer, true);
    assert.equal(r.url, RELEASES_SEITE + '/tag/node-core-v0.10.2');
    const gleich = await sucheUpdate('0.10.2', q.url, 'test/1');
    assert.equal(gleich.neuer, false);
    assert.equal(gleich.url, RELEASES_SEITE);
    assert.equal((await sucheUpdate('1.0.0', q.url, 'test/1')).neuer, false, 'Eine ältere Veröffentlichung ist kein Update');
  } finally { q.server.close(); }

  // Eine fremde Adresse in der Antwort wird nicht uebernommen.
  const fremd = await quelle(() => ({ text: JSON.stringify([{ tag_name: 'node-core-v5.0.0', html_url: 'https://boese.example/setup.exe' }]) }));
  try {
    const r = await sucheUpdate('0.4.0', fremd.url, 'test/1');
    assert.equal(r.neuer, true);
    assert.equal(r.url, RELEASES_SEITE);
  } finally { fremd.server.close(); }

  for (const kaputt of [
    () => ({ status: 500, text: '{}' }),
    () => ({ text: '{"message":"rate limit"}' }),
    () => ({ text: 'kein json' }),
    () => ({ text: '[' + '"x",'.repeat(400_000) + '"x"]' }),
    () => ({ status: 302, kopf: { location: 'https://boese.example/' }, text: '' }),
  ]) {
    const q2 = await quelle(kaputt);
    try {
      const r = await sucheUpdate('0.4.0', q2.url, 'test/1');
      assert.ok(r.fehler, 'Fehler steht im Ergebnis');
      assert.equal(r.neuer, false);
      assert.equal(r.url, RELEASES_SEITE);
    } finally { q2.server.close(); }
  }
  const tot = await sucheUpdate('0.4.0', `http://127.0.0.1:${port()}/x`, 'test/1');
  assert.ok(tot.fehler);
});

test('Huelle: Dialoge, Ordner, Links, Autostart -- und was nicht durchkommt', async () => {
  const gerufen: string[] = [];
  let autostart = false;
  const huelle: Huelle = {
    async waehleOrdner(start) { gerufen.push('waehle:' + start); return 'D:\\YSKAR\\Daten'; },
    async oeffneOrdner(pfad) { gerufen.push('ordner:' + pfad); },
    async oeffneLink(url) { gerufen.push('link:' + url); },
    autostart: () => autostart,
    setzeAutostart(an) { autostart = an; gerufen.push('autostart:' + an); },
    infobereich: () => true,
    beenden() { gerufen.push('beenden'); },
  };
  const K = await kern();
  try {
    // Ohne Huelle: Die Oberflaeche erfaehrt es, und nichts davon geht.
    let s = await K.stand();
    assert.deepEqual(s.huelle, { vorhanden: false, autostart: null, infobereich: false });
    const ohne = await K.POST('/api/huelle/ordner-waehlen', {});
    assert.equal(ohne.status, 400);
    assert.equal(ohne.json.code, 'ohne_huelle');

    K.app.setzeHuelle(huelle);
    s = await K.stand();
    assert.deepEqual(s.huelle, { vorhanden: true, autostart: false, infobereich: true });

    assert.equal((await K.POST('/api/huelle/ordner-waehlen', { start: 'C:\\x' })).json.pfad, 'D:\\YSKAR\\Daten');
    assert.equal(gerufen.pop(), 'waehle:C:\\x');

    // Geoeffnet werden nur die beiden eigenen Ordner -- ein Pfad aus der Anfrage zaehlt nicht.
    assert.equal((await K.POST('/api/huelle/ordner-oeffnen', { welcher: 'programm', pfad: 'C:\\Windows' })).status, 200);
    assert.equal(gerufen.pop(), 'ordner:' + K.basis);
    assert.equal((await K.POST('/api/huelle/ordner-oeffnen', { welcher: '../../etc' })).status, 200);
    assert.equal(gerufen.pop(), 'ordner:' + K.basis);

    assert.equal((await K.POST('/api/huelle/link', { url: 'https://github.com/dabitlex/YSKAR/releases' })).status, 200);
    assert.equal(gerufen.pop(), 'link:https://github.com/dabitlex/YSKAR/releases');
    const vorher = gerufen.length;
    for (const boese of ['file:///C:/Windows/System32/calc.exe', 'https://boese.example/', 'javascript:alert(1)']) {
      assert.equal((await K.POST('/api/huelle/link', { url: boese })).status, 400, boese);
    }
    assert.equal(gerufen.length, vorher, 'Für eine fremde Adresse wird die Huelle gar nicht gerufen');

    assert.equal((await K.POST('/api/huelle/autostart', { an: true })).json.autostart, true);
    assert.equal((await K.stand()).huelle.autostart, true);
    assert.equal((await K.POST('/api/huelle/autostart', { an: 'ja' })).status, 400);
    assert.equal((await K.POST('/api/huelle/unbekannt', {})).status, 404);
    // Ohne Zugangsschluessel geht nichts davon.
    assert.equal((await ruf(K.gui, '/api/huelle/autostart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"an":false}' })).status, 401);
    assert.equal(autostart, true);

    // Einstellungen: nur Ja/Nein.
    let e = (await K.POST('/api/einstellungen', { imHintergrund: true, miningFortsetzen: true, updatesSuchen: false })).json;
    assert.deepEqual([e.imHintergrund, e.miningFortsetzen, e.updatesSuchen], [true, true, false]);
    e = (await K.POST('/api/einstellungen', { imHintergrund: 'ja', miningFortsetzen: 1, updatesSuchen: null })).json;
    assert.deepEqual([e.imHintergrund, e.miningFortsetzen, e.updatesSuchen], [true, true, false], 'Unzulässiges ändert nichts');
    assert.equal(K.app.imHintergrund(), true);

    // Beenden laeuft ueber die Huelle -- sie schliesst Fenster und Infobereich mit.
    assert.equal((await K.POST('/api/shutdown', {})).status, 200);
    await bis('Huelle wurde zum Beenden gerufen', () => gerufen.includes('beenden'), 3000);
  } finally {
    await K.app.shutdown();
  }
});

test('Programm sucht nach einer neuen Version -- und zeigt sie nur an', async () => {
  const q = await quelle(() => ({ text: JSON.stringify([{ tag_name: 'node-core-v99.1.0', html_url: RELEASES_SEITE + '/tag/node-core-v99.1.0' }]) }));
  const K = await kern({ updateQuelle: q.url });
  try {
    let u = (await K.stand()).update;
    assert.equal(u.geprueft, null, 'Vor der ersten Suche steht nichts da');
    u = (await K.POST('/api/update/suchen')).json;
    assert.equal(u.neueste, '99.1.0');
    assert.equal(u.neuer, true);
    assert.equal(u.fehler, null);
    assert.equal((await K.stand()).update.url, RELEASES_SEITE + '/tag/node-core-v99.1.0');
    assert.equal((await K.stand()).version, VERSION, 'Installiert wird nichts');
  } finally { await K.app.shutdown(); q.server.close(); }

  // Ohne eingerichtete Quelle (Tests, Quellbaum): Es wird gar nicht gefragt.
  const ohne = await kern();
  try {
    const r = (await ohne.POST('/api/update/suchen')).json;
    assert.ok(r.fehler);
    assert.equal(r.neuer, false);
  } finally { await ohne.app.shutdown(); }
});

test('Mining nach dem Start fortsetzen: nur wenn es lief, und nur wenn gewollt', async () => {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 1_000_000n;
  const uhr = () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
  const ADR = encodeAddress(new Uint8Array(20).fill(0x31));

  // Ein Knoten, der einen Pool betreibt -- der andere mint darin.
  const P = await kern({ uhr });
  const pApi = port(), pP2p = port();
  await P.POST('/api/configure', { dataDir: ordner(), nodePort: pApi, p2pPort: pP2p, seed: '' });
  await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Dauerpool' });
  assert.equal((await P.POST('/api/start')).status, 200);
  const pool = `http://127.0.0.1:${pApi}`;

  const A = await kern({ uhr, fortsetzenTaktMs: 150 });
  try {
    await A.POST('/api/configure', { dataDir: ordner(), nodePort: port(), p2pPort: port(), seed: `127.0.0.1:${pP2p}` });
    await A.POST('/api/start');
    const start = () => A.POST('/api/mining/start', { address: ADR, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: pool });
    const lief = () => JSON.parse(readFileSync(join(A.basis, 'mining.json'), 'utf8')).lief;

    // Einstellung aus: Nach dem Neustart des Knotens bleibt das Mining aus.
    assert.equal((await start()).status, 200);
    assert.equal(lief(), true);
    await A.POST('/api/stop'); await A.POST('/api/start');
    await warte(900);
    assert.equal((await A.stand()).mining.running, false, 'Ohne die Einstellung setzt nichts fort');

    // Einstellung an: Es geht von selbst weiter.
    await A.POST('/api/einstellungen', { miningFortsetzen: true });
    await A.POST('/api/stop'); await A.POST('/api/start');
    await bis('Mining läuft wieder', async () => (await A.stand()).mining.running === true, 15_000);
    assert.equal((await A.stand()).mining.pool.name, 'Dauerpool');
    assert.equal((await A.stand()).mining.config.address, ADR);

    // Von Hand gestoppt: Dann faengt es nach dem naechsten Start NICHT wieder an.
    assert.equal((await A.POST('/api/mining/stop')).status, 200);
    assert.equal(lief(), false);
    await A.POST('/api/stop'); await A.POST('/api/start');
    await warte(900);
    assert.equal((await A.stand()).mining.running, false, 'Wer selbst stoppt, bleibt gestoppt');

    // Der Pool ist beim Start nicht da: Es wird weiter versucht, bis er wieder antwortet.
    assert.equal((await start()).status, 200);
    await A.POST('/api/stop');
    await P.POST('/api/stop');
    await A.POST('/api/start');
    await warte(900);
    assert.equal((await A.stand()).mining.running, false);
    assert.match((await A.GET('/api/logs')).json.logs.join('\n'), /Mining noch nicht fortgesetzt/);
    await P.POST('/api/start');
    await bis('Mining läuft, sobald der Pool wieder da ist', async () => (await A.stand()).mining.running === true, 15_000);
  } finally {
    await A.app.shutdown();
    await P.app.shutdown();
  }
});

test('Protokoll als Datei, mit Wechsel bei Übergröße; belegter Platz', async () => {
  const K = await kern();
  await K.app.shutdown();
  await warte(200);
  const datei = join(K.basis, 'protokoll.log');
  assert.ok(existsSync(datei));
  const text = readFileSync(datei, 'utf8');
  assert.match(text, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z GUI-Server gestartet/m);

  // Zu gross: Die alte Datei bleibt als .alt liegen, eine neue beginnt.
  const pfad = join(ordner(), 'p.log');
  writeFileSync(pfad, 'x'.repeat(2 * 1024 * 1024 + 10));
  const p = new Protokoll(pfad);
  p.schreibe('erste Zeile\nmit Umbruch');
  await p.fertig();
  assert.ok(statSync(pfad + '.alt').size > 2 * 1024 * 1024);
  const neu = readFileSync(pfad, 'utf8');
  assert.equal(neu.split('\n').length, 2, 'Eine Meldung ist eine Zeile');
  assert.match(neu, /erste Zeile mit Umbruch/);

  // Ein Ordner, in den sich nicht schreiben laesst, haelt nichts auf.
  const weg = new Protokoll(join(ordner(), 'gibt', 'es', 'nicht', 'p.log'));
  weg.schreibe('geht verloren');
  await weg.fertig();

  const d = ordner();
  writeFileSync(join(d, 'a'), 'x'.repeat(1000)); writeFileSync(join(d, 'b'), 'y'.repeat(234));
  assert.equal(ordnerBytes(d), 1234);
  assert.equal(ordnerBytes(join(d, 'fehlt')), null);
});
