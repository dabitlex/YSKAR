/**
 * Einen Pool betreiben.
 *
 * Zwei Node-Core-Knoten auf dem Testnetz, per P2P verbunden. Der eine
 * betreibt einen Pool, der andere mint darin -- und der Betreiber selbst
 * auch, ueber denselben Weg wie jeder andere Miner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { NodeCoreApp } from '../src/main.ts';
import {
  pruefeBetrieb, VORGABE_BETRIEB, kuerze, leseFenster, schreibeFenster, schreibeFensterSofort, platzGrenze,
} from '../src/PoolBetrieb.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const BETREIBER = keypairFromMnemonic(WORTE, '', 0, 0);
const GAST = encodeAddress(new Uint8Array(20).fill(0x42));
const PW = 'ein langes passwort';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-betrieb-'));
let naechsterPort = 19_600;
const port = () => naechsterPort++;

async function bis(was: string, pruefe: () => Promise<boolean> | boolean, ms = 90_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await pruefe()) return; await warte(60); }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

function ruf(p: number, pfad: string, opt: { method?: string; headers?: Record<string, string>; body?: string } = {}):
    Promise<{ status: number; text: string; json: any }> {
  return new Promise((auf, ab) => {
    // Ohne gehaltene Verbindung: Die Schnittstelle des Knotens wechselt in
    // diesen Tests ihren Anschluss, und eine gehaltene Verbindung waere danach tot.
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

async function kern(uhr: () => bigint, seed: string, basis = ordner(), daten = ordner()) {
  const k = { gui: port(), api: port(), p2p: port() };
  const app = new NodeCoreApp({ params: REGTEST, guiPort: k.gui, basis, uhr });
  await app.startGui();
  const token = app.zugangFuerFenster();
  const kopf = { 'x-yskar-token': token, 'content-type': 'application/json' };
  const GET = (pfad: string) => ruf(k.gui, pfad, { headers: { 'x-yskar-token': token } });
  const POST = (pfad: string, wert: unknown) => ruf(k.gui, pfad, { method: 'POST', headers: kopf, body: JSON.stringify(wert) });
  assert.equal((await POST('/api/configure', { dataDir: daten, nodePort: k.api, p2pPort: k.p2p, seed })).status, 200);
  const stand = async () => (await GET('/api/status')).json;
  return { ...k, app, basis, daten, GET, POST, stand, eigen: `http://127.0.0.1:${k.api}` };
}

function uhrNeu(): () => bigint {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 1_000_000n;
  return () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
}

// ---------------------------------------------------------------------------

test('Einstellungen: Feld für Feld geprüft', () => {
  const v = VORGABE_BETRIEB;
  assert.deepEqual(pruefeBetrieb({ name: ' Nordlicht ', feeBps: 125, plaetze: 10, heimnetz: true, aktiv: true }, v, true),
    { aktiv: true, name: 'Nordlicht', feeBps: 125, plaetze: 10, heimnetz: true });
  // Streng: Unzulaessiges wird abgelehnt.
  assert.throws(() => pruefeBetrieb({ feeBps: 501 }, v, true), /Gebühr/);
  assert.throws(() => pruefeBetrieb({ feeBps: 110 }, v, true), /Schritten/);
  assert.throws(() => pruefeBetrieb({ feeBps: -25 }, v, true));
  assert.throws(() => pruefeBetrieb({ plaetze: 0 }, v, true), /Plätze/);
  assert.throws(() => pruefeBetrieb({ plaetze: 65 }, v, true));
  assert.throws(() => pruefeBetrieb({ plaetze: 2.5 }, v, true));
  assert.throws(() => pruefeBetrieb({ name: 'Zürich Pool' }, v, true), /Name des Pools/);
  assert.throws(() => pruefeBetrieb({ name: 'ab' }, v, true));
  assert.throws(() => pruefeBetrieb({ name: 'x'.repeat(33) }, v, true));
  // Aus einer Datei: Unzulaessiges faellt still auf den bisherigen Wert.
  assert.deepEqual(pruefeBetrieb({ name: 'Zürich', feeBps: 9999, plaetze: 'viele', heimnetz: 'ja', aktiv: 1 }, v, false), v);
  assert.deepEqual(pruefeBetrieb('unsinn', v, false), v);
  assert.equal(platzGrenze(0), 64);
  assert.equal(platzGrenze(25), 63);
});

test('Fenster: sichern, lesen, kürzen -- und nichts Erfundenes annehmen', async () => {
  const pfad = join(ordner(), 'pool-fenster.json');
  const a = new Uint8Array(20).fill(1), b = new Uint8Array(20).fill(2);
  const e = [{ to: a, work: 128n }, { to: a, work: 128n }, { to: b, work: 512n }, { to: a, work: 2000n }];
  schreibeFensterSofort(pfad, 'yskar-regtest', 100, e);
  const g = leseFenster(pfad, 'yskar-regtest');
  assert.equal(g.feeBps, 100);
  assert.deepEqual(g.eintraege.map(x => [Buffer.from(x.to).toString('hex').slice(0, 2), x.work]),
    [['01', 128n], ['01', 128n], ['02', 512n], ['01', 2000n]], 'Reihenfolge und Arbeit bleiben');
  assert.deepEqual(leseFenster(pfad, 'yskar-main-1').eintraege, [], 'Ein Fenster aus einem anderen Netz gilt nicht');
  assert.equal(existsSync(pfad), true, 'Es bleibt liegen -- es gehört nur nicht hierher');

  // Von hinten so viel, bis genug Arbeit beisammen ist.
  assert.deepEqual(kuerze(e, 2000n).map(x => x.work), [2000n]);
  assert.deepEqual(kuerze(e, 2001n).map(x => x.work), [512n, 2000n]);
  assert.equal(kuerze(e, 10n ** 9n).length, 4);

  for (const kaputt of [
    '{"fassung":1,"netz":"yskar-regtest","eintraege":[["zz",["1"]]]}',
    '{"fassung":1,"netz":"yskar-regtest","eintraege":[["' + '01'.repeat(20) + '",["-5"]]]}',
    '{"fassung":1,"netz":"yskar-regtest","eintraege":[["' + '01'.repeat(20) + '",[5]]]}',
    '{"fassung":1,"netz":"yskar-regtest","eintraege":[["' + '01'.repeat(20) + '",["0"]]]}',
    '{"fassung":2,"netz":"yskar-regtest","eintraege":[]}',
    'kein json',
  ]) {
    writeFileSync(pfad, kaputt);
    const r = leseFenster(pfad, 'yskar-regtest');
    assert.deepEqual([r.eintraege, r.feeBps], [[], null], kaputt.slice(0, 60));
    // Nicht still: Der Grund steht da, und die Datei liegt beiseite statt ueberschrieben zu werden.
    assert.match(String(r.hinweis), /nicht übernommen/);
    assert.equal(existsSync(pfad), false);
    assert.equal(readFileSync(pfad + '.unlesbar', 'utf8'), kaputt);
  }

  // Mehr Eintraege als die Grenze: die juengsten bleiben, nichts geht still verloren.
  const viele = Array.from({ length: 500_010 }, (_, i) => ({ to: i < 10 ? a : b, work: 1n }));
  schreibeFensterSofort(pfad, 'yskar-regtest', 0, viele);
  const gekuerzt = leseFenster(pfad, 'yskar-regtest');
  assert.equal(gekuerzt.eintraege.length, 500_000);
  assert.ok(gekuerzt.eintraege.every(e => e.to[0] === 2), 'Die ältesten fallen weg, nicht die jüngsten');

  // Zwei Sicherungen zugleich: Die ältere überschreibt die neuere nicht.
  let gilt = true;
  const langsam = schreibeFenster(pfad, 'yskar-regtest', 100, [{ to: a, work: 1n }], () => gilt);
  schreibeFensterSofort(pfad, 'yskar-regtest', 250, [{ to: b, work: 7n }]);
  gilt = false;
  assert.equal(await langsam, false);
  const danach = leseFenster(pfad, 'yskar-regtest');
  assert.equal(danach.feeBps, 250);
  assert.deepEqual(danach.eintraege.map(e => e.work), [7n]);
});

test('Pool betreiben: einschalten, Miner aufnehmen, Gebühr, abschalten -- und das Fenster bleibt', async () => {
  const uhr = uhrNeu();
  const P = await kern(uhr, '');
  const G = await kern(uhr, `127.0.0.1:${P.p2p}`);
  try {
    // Ohne Namen laesst sich der Pool nicht einschalten.
    const ohne = await P.POST('/api/pool/betrieb', { aktiv: true });
    assert.equal(ohne.status, 400);
    assert.match(ohne.json.error, /Namen/);
    // Mit Gebuehr, aber ohne Wallet: wohin sollte sie gehen?
    const ohneWallet = await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Nordlicht Pool', feeBps: 100 });
    assert.equal(ohneWallet.status, 400);
    assert.equal(ohneWallet.json.code, 'wallet_fehlt');
    assert.equal((await P.stand()).betrieb.config.aktiv, false, 'Abgelehntes wird nicht gespeichert');

    assert.equal((await P.POST('/api/wallet/anlegen', { woerter: WORTE, passwort: PW })).status, 200);
    // Vor dem Knotenstart eingeschaltet: Der Pool startet mit dem Knoten.
    const an = await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Nordlicht Pool', feeBps: 100, plaetze: 64 });
    assert.equal(an.status, 200, JSON.stringify(an.json));
    assert.equal(an.json.laeuft, false);
    assert.equal(JSON.parse(readFileSync(join(P.basis, 'pool.json'), 'utf8')).name, 'Nordlicht Pool');

    assert.equal((await P.POST('/api/start', {})).status, 200);
    assert.equal((await G.POST('/api/start', {})).status, 200);
    await bis('verbunden', async () => (await P.stand()).peerCount === 1 && (await G.stand()).peerCount === 1);

    let b = (await P.stand()).betrieb;
    assert.equal(b.laeuft, true);
    assert.equal(b.angewandt.name, 'Nordlicht Pool');
    assert.equal(b.auskunft.plaetze, 63, 'Mit Gebühr gehört ein Platz dem Betreiber');
    assert.equal(b.auszahlung, BETREIBER.address);
    assert.equal(b.heimnetz.offen, false);
    // Von aussen: derselbe Pool unter /api/v2/pool.
    const aussen = (await ruf(P.api, '/api/v2/pool')).json;
    assert.equal(aussen.name, 'Nordlicht Pool');
    assert.equal(aussen.feeBps, 100);

    // Der eigene Pool steht in der eigenen Liste zuerst.
    const liste = (await P.GET('/api/pool/liste')).json.pools;
    assert.equal(liste[0].hier, true);
    assert.equal(liste[0].host, P.eigen);
    assert.equal(liste[0].anzeige, 'Nordlicht Pool');
    assert.equal(liste[0].status, 'offen');

    // Ein Gast mint im Pool -- von einem anderen Node Core aus.
    const gast = await G.POST('/api/mining/start', { address: GAST, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: P.eigen });
    assert.equal(gast.status, 200, JSON.stringify(gast.json));
    assert.equal(gast.json.status.pool.name, 'Nordlicht Pool');
    // Und der Betreiber selbst, ueber denselben Weg.
    const selbst = await P.POST('/api/mining/start', { address: BETREIBER.address, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: P.eigen });
    assert.equal(selbst.status, 200, JSON.stringify(selbst.json));

    /*
      Im Testnetz ist die Difficulty 1 und das Fenster damit nur zwei
      Einheiten gross: Ein einziger Share fuellt es. Darin steht also immer
      nur, wer zuletzt geliefert hat -- die Liste zeigt trotzdem beide, weil
      beide verbunden sind.
    */
    await bis('Beide stehen in der Liste, und beide haben geliefert', async () => {
      const m = (await P.stand()).betrieb.miner;
      return m.length === 2 && m.every((x: any) => x.verbunden && x.letzterShare !== null);
    });
    b = (await P.stand()).betrieb;
    assert.equal(b.eigenerMiner, true);
    assert.equal(b.auskunft.belegt, 2);
    assert.equal(b.auskunft.frei, 61);
    const ich = b.miner.find((x: any) => x.du);
    assert.equal(ich.adresse, BETREIBER.address);
    assert.equal(b.miner.find((x: any) => !x.du).adresse, GAST);
    assert.ok(Math.abs(b.miner.reduce((n: number, x: any) => n + x.anteil, 0) - 1) < 0.001, 'Die Anteile ergeben zusammen das Ganze');
    assert.equal((await ruf(P.api, '/summary')).json.miningSessions, 2, 'Zwei Sitzungen, keine doppelt gezählt');

    // Die Blöcke des Pools: Gebühr an den Betreiber, der Rest nach Arbeit.
    await bis('Der Pool hat Blöcke gefunden', async () => ((await P.stand()).betrieb.bloecke ?? 0) >= 2);
    b = (await P.stand()).betrieb;
    assert.equal((await P.GET('/api/lesen/blocks/' + b.letzterBlock)).json.finder, 'Nordlicht Pool');
    // Ein Block, an dem der Gast beteiligt war: zwei Empfaenger -- er und der Betreiber mit der Gebuehr.
    await bis('Der Gast sieht seine Auszahlung', async () => (await G.stand()).mining.pool?.auszahlung?.name === 'Nordlicht Pool');
    const zahlung = (await G.stand()).mining.pool.auszahlung;
    const block = (await P.GET('/api/lesen/blocks/' + zahlung.hoehe)).json;
    assert.equal(block.finder, 'Nordlicht Pool');
    assert.equal(block.recipients, 2);
    // 1 % Gebuehr: Der Gast bekommt 99 % der Belohnung.
    assert.equal(BigInt(zahlung.betrag), (87_500_000_000n * 99n) / 100n);

    // Gebühr ändern: gilt ab dem nächsten Block, nicht sofort.
    const neu = await P.POST('/api/pool/betrieb', { feeBps: 250 });
    assert.equal(neu.status, 200);
    assert.ok([100, 250].includes(neu.json.angewandt.feeBps));
    await bis('Die neue Gebühr gilt', async () => (await P.stand()).betrieb.angewandt.feeBps === 250);
    assert.equal((await ruf(P.api, '/api/v2/pool')).json.feeBps, 250);

    // Name und Plätze: gespeichert, aber erst nach einem Neustart des Pools wirksam.
    const umbenannt = await P.POST('/api/pool/betrieb', { name: 'Polarlicht', plaetze: 5 });
    assert.equal(umbenannt.json.neustartNoetig, true);
    assert.equal(umbenannt.json.angewandt.name, 'Nordlicht Pool');
    assert.equal((await ruf(P.api, '/api/v2/pool')).json.name, 'Nordlicht Pool');

    // Abschalten: Die Sitzungen enden, die Miner halten an -- niemand mint still solo.
    const arbeit = (await ruf(P.api, '/api/v2/pool')).json.arbeitGesamt;
    assert.ok(BigInt(arbeit) > 0n);
    const aus = await P.POST('/api/pool/betrieb', { aktiv: false });
    assert.equal(aus.json.laeuft, false);
    assert.equal((await ruf(P.api, '/api/v2/pool')).status, 404);
    await bis('Der Gast hält an', async () => (await G.stand()).mining.running === false);
    await bis('Der eigene Miner hält an', async () => (await P.stand()).mining.running === false);
    assert.equal((await G.stand()).mining.poolEnde.code, 'pool_unavailable');
    assert.equal((await ruf(P.api, '/summary')).json.miningSessions, 0);

    // Das Fenster ist gesichert -- mit der Gebühr, die zuletzt galt.
    const datei = join(P.basis, 'pool-fenster.json');
    assert.ok(existsSync(datei));
    const gesichert = leseFenster(datei, REGTEST.network);
    assert.equal(gesichert.feeBps, 250);
    assert.ok(gesichert.eintraege.length >= 1);
    assert.equal(gesichert.eintraege.reduce((n, e) => n + e.work, 0n), BigInt(arbeit));

    // Wieder einschalten: neuer Name, neue Plätze -- und die Arbeit von vorhin zählt weiter.
    const wieder = await P.POST('/api/pool/betrieb', { aktiv: true });
    assert.equal(wieder.json.laeuft, true);
    assert.equal(wieder.json.angewandt.name, 'Polarlicht');
    assert.equal(wieder.json.neustartNoetig, false);
    const danach = (await ruf(P.api, '/api/v2/pool')).json;
    assert.equal(danach.name, 'Polarlicht');
    assert.equal(danach.plaetze, 5);
    assert.equal(danach.arbeitGesamt, arbeit);
    assert.ok(wieder.json.miner.length >= 1, 'Wer zuletzt geliefert hat, steht noch im Fenster -- auch ohne Verbindung');
    assert.ok(wieder.json.miner.every((x: any) => x.verbunden === false));
    assert.ok(Math.abs(wieder.json.miner.reduce((n: number, x: any) => n + x.anteil, 0) - 1) < 0.001);
  } finally {
    await G.app.shutdown();
    await P.app.shutdown();
  }
});

test('Neustart des Programms: Der Pool kommt wieder, mit Fenster; die alte Gebühr gilt bis zum nächsten Block', async () => {
  const uhr = uhrNeu();
  const basis = ordner(), daten = ordner();
  let P = await kern(uhr, '', basis, daten);
  const G = await kern(uhr, `127.0.0.1:${P.p2p}`);
  try {
    await P.POST('/api/wallet/anlegen', { woerter: WORTE, passwort: PW });
    await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Dauerlauf', feeBps: 100 });
    await P.POST('/api/start', {}); await G.POST('/api/start', {});
    await bis('verbunden', async () => (await G.stand()).peerCount === 1);
    assert.equal((await G.POST('/api/mining/start', { address: GAST, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: P.eigen })).status, 200);
    await bis('Arbeit im Fenster', async () => (await P.stand()).betrieb.miner[0]?.anteil > 0);
    await G.POST('/api/mining/stop', {});
    const arbeit = (await ruf(P.api, '/api/v2/pool')).json.arbeitGesamt;
    const p2p = P.p2p, api = P.api;
    await P.app.shutdown();

    // Zwischen den Läufen stellt der Betreiber die Gebühr hoch.
    const pfad = join(basis, 'pool.json');
    writeFileSync(pfad, JSON.stringify({ ...JSON.parse(readFileSync(pfad, 'utf8')), feeBps: 500 }));

    naechsterPort = Math.max(naechsterPort, 19_680);
    const gui = port();
    const app = new NodeCoreApp({ params: REGTEST, guiPort: gui, basis, uhr });
    await app.startGui();
    const token = app.zugangFuerFenster();
    const POST = (pfadApi: string, wert: unknown) => ruf(gui, pfadApi, { method: 'POST', headers: { 'x-yskar-token': token, 'content-type': 'application/json' }, body: JSON.stringify(wert) });
    const stand = async () => (await ruf(gui, '/api/status', { headers: { 'x-yskar-token': token } })).json;
    P = { ...P, app, POST, stand } as typeof P;
    assert.equal((await POST('/api/start', {})).status, 200);

    const b = (await stand()).betrieb;
    assert.equal(b.laeuft, true, 'Der Pool startet mit dem Knoten');
    assert.equal(b.angewandt.name, 'Dauerlauf');
    assert.equal(b.miner.length, 1, 'Die Arbeit des Gasts ist noch da: ' + readFileSync(join(basis, 'pool-fenster.json'), 'utf8').slice(0, 300));
    assert.equal(b.miner[0].adresse, GAST);
    assert.equal((await ruf(api, '/api/v2/pool')).json.arbeitGesamt, arbeit);
    // Die Arbeit im Fenster lief unter 1 %: Sie gilt weiter, 5 % sind nur angekündigt.
    assert.equal(b.angewandt.feeBps, 100);
    assert.equal(b.angewandt.feeBpsNaechster, 500);
    const aussen = (await ruf(api, '/api/v2/pool')).json;
    assert.equal(aussen.feeBps, 100);
    assert.equal(aussen.feeBpsNext, 500);
    assert.equal(p2p > 0, true);
  } finally {
    await G.app.shutdown();
    await P.app.shutdown();
  }
});

test('Heimnetz: Die Schnittstelle öffnet sich nur mit laufendem Pool und Freigabe', async () => {
  const uhr = uhrNeu();
  const P = await kern(uhr, '');
  try {
    await P.POST('/api/start', {});
    // Freigabe ohne Pool: gespeichert, aber nichts oeffnet sich.
    let r = (await P.POST('/api/pool/betrieb', { heimnetz: true })).json;
    assert.equal(r.config.heimnetz, true);
    assert.equal(r.heimnetz.offen, false);

    r = (await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Hauspool' })).json;
    assert.equal(r.laeuft, true);
    assert.equal(r.heimnetz.offen, true);
    assert.ok(r.heimnetz.adressen.every((a: string) => /^http:\/\/(10|172|192)\.\d+\.\d+\.\d+:\d+$/.test(a)));
    // Die Schnittstelle antwortet weiter -- auch dem eigenen PC.
    assert.equal((await ruf(P.api, '/api/v2/pool')).json.name, 'Hauspool');
    // Die Oberflaeche bleibt, wo sie ist: nur dieser PC, nur mit Schluessel.
    assert.equal((await ruf(P.gui, '/api/status')).status, 401);

    r = (await P.POST('/api/pool/betrieb', { heimnetz: false })).json;
    assert.equal(r.heimnetz.offen, false);
    assert.equal((await ruf(P.api, '/api/v2/pool')).json.name, 'Hauspool');

    r = (await P.POST('/api/pool/betrieb', { heimnetz: true })).json;
    assert.equal(r.heimnetz.offen, true);
    r = (await P.POST('/api/pool/betrieb', { aktiv: false })).json;
    assert.equal(r.heimnetz.offen, false, 'Ohne Pool gibt es nichts freizugeben');
    assert.equal((await ruf(P.api, '/summary')).status, 200);
  } finally {
    await P.app.shutdown();
  }
});
