/**
 * Sammelzahlung aus der Wallet des Node Core: Liste einlesen und pruefen,
 * durchrechnen, senden -- ueber dieselbe Schnittstelle wie die Oberflaeche.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST, REGTEST_V6 } from '../../src/lib/core/networks.ts';
import { UNIT, MAX_BATCH_OUTPUTS } from '../../src/lib/core/params.ts';
import { encodeAddress, rawAddress, ADDRESS_V1 } from '../../src/lib/core/address.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { leseBetrag, leseListe, pruefeListe, zeilenAusRumpf, SAMMEL_ZEILEN_MAX } from '../src/Sammelzahlung.ts';
import { NodeCoreApp } from '../src/main.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ICH = keypairFromMnemonic(WORTE, '', 0, 0);
const PW = 'ein langes passwort';
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-sammel-'));
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const adr = (n: number) => encodeAddress(new Uint8Array(20).fill(n));
const A1 = adr(0xa1), A2 = adr(0xa2), A3 = adr(0xa3);
/** Eine Adresse der Version 1 (ysr1p…), wie sie ein gemeinsames Konto hat. */
const GEMEINSAM = encodeAddress(rawAddress(ADDRESS_V1, new Uint8Array(32).fill(0x5c)));

interface Antwort { status: number; json: any }
function ruf(port: number, pfad: string, opt: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Antwort> {
  return new Promise((auf, ab) => {
    const req = request({ host: '127.0.0.1', port, path: pfad, method: opt.method ?? 'GET', headers: { host: `127.0.0.1:${port}`, ...(opt.headers ?? {}) } }, res => {
      let text = ''; res.on('data', c => { text += c; });
      res.on('end', () => { let json: any = null; try { json = JSON.parse(text); } catch { json = text; } auf({ status: res.statusCode ?? 0, json }); });
    });
    req.on('error', ab); if (opt.body !== undefined) req.write(opt.body); req.end();
  });
}
async function bis(was: string, f: () => Promise<boolean> | boolean, ms = 30_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await f()) return; await warte(40); }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

// ---------------------------------------------------------------------------

test('Sammelzahlung: Beträge lesen -- eindeutig, uneindeutig, unlesbar', () => {
  const ok = (text: string, einheiten: bigint) => assert.deepEqual(leseBetrag(text), { art: 'ok', einheiten }, text);
  ok('1500', 1500n * UNIT);
  ok(' 1500 ', 1500n * UNIT);
  ok('1200,5', 120050000000n);
  ok('1200.5', 120050000000n);
  ok('0,125', 12500000n);                    // beginnt mit 0: kein Tausenderzeichen
  ok('0.001', 100000n);
  ok('.5', 50000000n);
  ok('5.', 5n * UNIT);
  ok('1.234,56', 123456000000n);             // beide Zeichen: das hintere ist das Dezimalzeichen
  ok('1,234.56', 123456000000n);
  ok('1.234.567', 1234567n * UNIT);          // dasselbe Zeichen mehrfach kann nur gliedern
  ok('1,234,567', 1234567n * UNIT);
  ok('1 500', 1500n * UNIT);
  ok("1'500", 1500n * UNIT);
  ok('1500 YSR', 1500n * UNIT);
  ok('12,3456', 1234560000n);                // vier Stellen hinter dem Zeichen: Dezimalzahl
  ok('1500,00000001', 1500n * UNIT + 1n);
  ok('1,50000000000', 150000000n);           // Nullen am Ende zaehlen nicht als zu viele Stellen
  ok('184467440737', 184467440737n * UNIT);    // gerade noch darstellbar

  // Ein Zeichen, genau drei Ziffern dahinter: beide Lesarten, keine Annahme.
  assert.deepEqual(leseBetrag('1.500'), { art: 'unklar', tausend: 1500n * UNIT, dezimal: 150000000n });
  assert.deepEqual(leseBetrag('1,500'), { art: 'unklar', tausend: 1500n * UNIT, dezimal: 150000000n });
  assert.deepEqual(leseBetrag('12,345'), { art: 'unklar', tausend: 12345n * UNIT, dezimal: 1234500000n });
  assert.deepEqual(leseBetrag('999.999'), { art: 'unklar', tausend: 999999n * UNIT, dezimal: 99999900000n });

  for (const leer of ['', '   ', 'YSR']) assert.deepEqual(leseBetrag(leer), { art: 'leer' }, leer);
  for (const falsch of ['abc', '12x', '-5', '1e5', '1.2.3', '12.34.567', '1,23,456', '1.234,567,8', '1,2.3,4',
    '0.123456789', '1000000000000', '184467440738', '999999999999', ',', '.', '1..5', '0.500.000', '1234.567.890']) {
    assert.deepEqual(leseBetrag(falsch), { art: 'falsch' }, falsch);
  }
});

test('Sammelzahlung: Liste aus Text -- Komma, Semikolon, Tabulator, Überschrift, Name davor', () => {
  const text = [
    'Adresse;Betrag',
    `${A1}, 1500`,
    `${A2}; 1200,5`,
    `${A3}\t800`,
    '',
    `Kai;${GEMEINSAM};12,5;Miete`,
    `"${A1.toUpperCase()}","7"`,
    `"${A3}","1,5","Miete, Mai"`,
    `${A2}`,
    'das ist keine adresse, 5',
  ].join('\r\n');
  const { zeilen, abgeschnitten } = leseListe('﻿' + text);
  assert.equal(abgeschnitten, false);
  assert.deepEqual(zeilen, [
    { adresse: A1, betrag: '1500' },
    { adresse: A2, betrag: '1200,5' },
    { adresse: A3, betrag: '800' },
    { adresse: GEMEINSAM, betrag: '12,5' },
    { adresse: A1, betrag: '7' },
    { adresse: A3, betrag: '1,5' },
    { adresse: A2, betrag: '' },
    { adresse: 'das', betrag: 'ist keine adresse 5' },
  ]);
  // Eine Zeile ohne Adresse ist nur ganz oben eine Ueberschrift.
  assert.deepEqual(leseListe('address,amount').zeilen, []);
  assert.equal(leseListe(`${A1} 5\nBetrag`).zeilen.length, 2);
  // Mehr als die Grenze: abgeschnitten, und das wird gesagt.
  const viele = leseListe(Array.from({ length: 12 }, (_, i) => `${adr(i + 1)},1`).join('\n'), 10);
  assert.equal(viele.zeilen.length, 10); assert.equal(viele.abgeschnitten, true);
});

test('Sammelzahlung: Liste prüfen -- jeder Grund einzeln, nichts wird still repariert', () => {
  const kaputt = A3.slice(0, 20) + (A3[20] === 'q' ? 'p' : 'q') + A3.slice(21);
  const p = pruefeListe([
    { adresse: A1, betrag: '1500' },          // 1 bereit
    { adresse: A2, betrag: '1.500' },         // 2 unklar
    { adresse: kaputt, betrag: '5' },         // 3 Pruefsumme
    { adresse: ICH.address, betrag: '5' },    // 4 eigene
    { adresse: A1, betrag: '300' },           // 5 doppelt (wie 1)
    { adresse: A3, betrag: '' },              // 6 Betrag fehlt
    { adresse: A3, betrag: 'viel' },          // 7 Betrag falsch (und doppelt -- der Betrag geht vor)
    { adresse: GEMEINSAM, betrag: '0,0000005' },   // 8 unter dem Mindestbetrag
    { adresse: adr(0xb1), einheiten: '12345' },     // 9 bereit, Betrag schon in Einheiten
    { adresse: adr(0xb2), betrag: '0' },      // 10 Betrag fehlt
    { adresse: A2, betrag: '2' },             // 11 doppelt (wie 2, obwohl 2 noch unklar ist)
  ], { eigene: ICH.address });
  assert.deepEqual(p.zeilen.map(z => z.stand), ['bereit', 'betrag_unklar', 'adresse_falsch', 'eigene', 'doppelt',
    'betrag_fehlt', 'betrag_falsch', 'betrag_staub', 'bereit', 'betrag_fehlt', 'doppelt']);
  assert.deepEqual(p.zeilen[1].deutungen, [(1500n * UNIT).toString(), '150000000']);
  assert.equal(p.zeilen[4].doppeltVon, 1);
  assert.equal(p.zeilen[10].doppeltVon, 2);
  assert.equal(p.zeilen[0].einheiten, (1500n * UNIT).toString());
  assert.equal(p.zeilen[1].einheiten, null);
  assert.equal(p.bereit, 2); assert.equal(p.offen, 9);
  assert.equal(p.summe, 1500n * UNIT + 12345n, 'Nur bereite Zeilen zählen zur Summe');
  assert.equal(p.gleichStand, null);

  // Gleicher Betrag für alle: Die Betraege der Zeilen zaehlen nicht.
  const g = pruefeListe([{ adresse: A1, betrag: 'unsinn' }, { adresse: A2 }, { adresse: A1 }], { eigene: ICH.address, gleich: { adresse: '', betrag: '2,5' } });
  assert.deepEqual(g.zeilen.map(z => z.stand), ['bereit', 'bereit', 'doppelt']);
  assert.equal(g.summe, 500000000n);
  // Ist der gemeinsame Betrag nicht eindeutig, ist keine Zeile bereit.
  const u = pruefeListe([{ adresse: A1 }], { eigene: ICH.address, gleich: { adresse: '', betrag: '1.500' } });
  assert.equal(u.gleichStand, 'betrag_unklar'); assert.equal(u.bereit, 0);
  assert.deepEqual(u.gleichDeutungen, [(1500n * UNIT).toString(), '150000000']);

  // Was von aussen kommt, wird auf Form und Groesse geprueft.
  assert.deepEqual(zeilenAusRumpf(undefined), []);
  assert.equal(zeilenAusRumpf('text'), null);
  assert.equal(zeilenAusRumpf([{ adresse: 5 }]), null);
  assert.equal(zeilenAusRumpf([{ adresse: A1, einheiten: '12a' }]), null);
  assert.equal(zeilenAusRumpf([{ adresse: A1, betrag: 'x'.repeat(61) }]), null);
  assert.equal(zeilenAusRumpf(Array.from({ length: SAMMEL_ZEILEN_MAX + 1 }, () => ({ adresse: A1 }))), null);
  assert.deepEqual(zeilenAusRumpf([{ adresse: ' ' + A1.toUpperCase() + ' ', betrag: '5', fremd: 1 }]), [{ adresse: A1, betrag: '5' }]);
});

// ---------------------------------------------------------------------------

test('Sammelzahlung am Knoten: prüfen, senden, ein Eintrag im Verlauf, alle Empfänger bezahlt', async () => {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 200_000n;
  const uhr = () => { const t = zeit; zeit += REGTEST_V6.targetBlockTime; return t; };
  const A = { gui: 19_860, api: 19_861, p2p: 19_862 }, B = { gui: 19_863, api: 19_864, p2p: 19_865 };
  const a = new NodeCoreApp({ params: REGTEST_V6, guiPort: A.gui, basis: ordner(), uhr });
  const b = new NodeCoreApp({ params: REGTEST_V6, guiPort: B.gui, basis: ordner(), uhr });
  await a.startGui(); await b.startGui();
  const tA = a.zugangFuerFenster(), tB = b.zugangFuerFenster();
  const GET = (k: typeof A, t: string, pfad: string) => ruf(k.gui, pfad, { headers: { 'x-yskar-token': t } });
  const POST = (k: typeof A, t: string, pfad: string, wert: unknown = {}) => ruf(k.gui, pfad, {
    method: 'POST', headers: { 'x-yskar-token': t, 'content-type': 'application/json' }, body: JSON.stringify(wert) });
  const stand = async (k: typeof A, t: string) => (await GET(k, t, '/api/status')).json;
  const guthaben = async (adresse: string) => BigInt((await GET(A, tA, '/api/lesen/account/' + adresse)).json.balance ?? '0');
  const uebersicht = async () => (await GET(A, tA, '/api/wallet/uebersicht')).json;

  async function einBlock() {
    const h = (await stand(A, tA)).height as number;
    assert.equal((await POST(A, tA, '/api/mining/start', { address: ICH.address, mode: 'cpu', cpuWorkers: 1 })).status, 200);
    await bis('ein Block mehr', async () => ((await stand(A, tA)).height ?? -1) > h);
    await POST(A, tA, '/api/mining/stop');
  }

  try {
    assert.equal((await POST(A, tA, '/api/wallet/anlegen', { woerter: WORTE, passwort: PW })).status, 200);
    await POST(A, tA, '/api/configure', { dataDir: ordner(), nodePort: A.api, p2pPort: A.p2p, seed: '' });
    await POST(A, tA, '/api/start');
    await POST(B, tB, '/api/configure', { dataDir: ordner(), nodePort: B.api, p2pPort: B.p2p, seed: `127.0.0.1:${A.p2p}` });
    await POST(B, tB, '/api/start');
    await bis('verbunden', async () => (await stand(A, tA)).peerCount === 1);
    await einBlock(); await einBlock();
    assert.equal((await uebersicht()).sammelAktiv, true);
    await POST(A, tA, '/api/wallet/kontakt', { name: 'Kai', adresse: A1 });

    // Schritt 1: Text einlesen. Jede Zeile nennt ihren Stand; Kontakte tragen ihren Namen.
    const text = `Adresse;Betrag\n${A1};10\n${A2};2,5\n${A1};1\n${GEMEINSAM};7\n${A3};1.500\n`;
    const l = await POST(A, tA, '/api/wallet/sammel/liste', { text });
    assert.equal(l.status, 200, JSON.stringify(l.json));
    assert.deepEqual(l.json.zeilen.map((z: any) => z.stand), ['bereit', 'bereit', 'doppelt', 'bereit', 'betrag_unklar']);
    assert.equal(l.json.zeilen[0].name, 'Kai'); assert.equal(l.json.zeilen[0].neu, false);
    assert.equal(l.json.zeilen[1].name, null); assert.equal(l.json.zeilen[1].neu, true);
    assert.equal(l.json.zeilen[2].doppeltVon, 1);
    assert.equal(l.json.bereit, 3); assert.equal(l.json.offen, 2);
    assert.equal(l.json.summe, (195n * UNIT / 10n).toString());
    assert.equal(l.json.aktiv, true); assert.equal(l.json.hoechstens, MAX_BATCH_OUTPUTS); assert.equal(l.json.zuViele, false);
    assert.ok(BigInt(l.json.verfuegbar) > 0n);

    // Solange eine Zeile offen ist, wird nichts durchgerechnet.
    const zeilenAus = (zz: any[]) => zz.map((z: any) => (z.einheiten ? { adresse: z.adresse, einheiten: z.einheiten } : { adresse: z.adresse, betrag: z.betrag }));
    const offen = await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen: zeilenAus(l.json.zeilen) });
    assert.equal(offen.json.code, 'sammel_offen'); assert.deepEqual(offen.json.werte, [2]);
    assert.equal((await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen: [] })).json.code, 'sammel_leer');
    assert.equal((await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen: 'x' })).json.code, 'sammel_liste_falsch');

    // Der Nutzer zaehlt die doppelte Zeile zusammen und waehlt bei "1.500" die Lesart 1,5.
    const zeilen = [
      { adresse: A1, einheiten: (11n * UNIT).toString() },
      { adresse: A2, einheiten: '250000000' },
      { adresse: GEMEINSAM, einheiten: (7n * UNIT).toString() },
      { adresse: A3, einheiten: l.json.zeilen[4].deutungen[1] },
    ];
    const summe = 11n * UNIT + 250000000n + 7n * UNIT + 150000000n;
    const notiz = 'Danke fürs Mithelfen';
    const v = await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen, notiz });
    assert.equal(v.status, 200, JSON.stringify(v.json));
    assert.equal(v.json.anzahl, 4); assert.equal(v.json.kontakte, 1); assert.equal(v.json.neue, 3);
    assert.equal(v.json.summe, summe.toString());
    // 147 Byte, 29 je Empfaenger der Version 0, 41 fuer die Adresse der Version 1, dazu die Notiz.
    assert.equal(v.json.groesse, 147 + 3 * 29 + 41 + new TextEncoder().encode(notiz).length);
    assert.ok(BigInt(v.json.gebuehr) >= BigInt(v.json.groesse), 'mindestens eine Einheit je Byte');
    assert.equal(v.json.gesamt, (summe + BigInt(v.json.gebuehr)).toString());
    assert.equal(v.json.danach, (BigInt(v.json.verfuegbar) - summe - BigInt(v.json.gebuehr)).toString());
    assert.equal(v.json.notiz, notiz);
    assert.deepEqual(v.json.empfaenger.map((e: any) => [e.adresse, e.name, e.neu, e.betrag]), [
      [A1, 'Kai', false, (11n * UNIT).toString()], [A2, null, true, '250000000'],
      [GEMEINSAM, null, true, (7n * UNIT).toString()], [A3, null, true, '150000000']]);

    // Gleicher Betrag fuer alle rechnet mit einem Betrag je Zeile.
    const gl = await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen: [{ adresse: A1 }, { adresse: A2 }], gleich: { betrag: '3' } });
    assert.equal(gl.json.summe, (6n * UNIT).toString());

    // Mehr als das Guthaben; mehr als 1.000 Empfaenger (und ein Rumpf ueber 64 KB kommt an).
    assert.equal((await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen: [{ adresse: A1, betrag: '999999999' }] })).json.code, 'guthaben_reicht_nicht');
    const viele = Array.from({ length: MAX_BATCH_OUTPUTS + 1 }, (_, i) => ({ adresse: encodeAddress(new Uint8Array(20).fill(1).map((x, j) => (j === 0 ? i >> 8 : j === 1 ? i & 255 : x))), einheiten: '1000' }));
    assert.ok(JSON.stringify({ zeilen: viele }).length > 65_536);
    const zuViele = await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen: viele });
    assert.equal(zuViele.json.code, 'sammel_zu_viele'); assert.deepEqual(zuViele.json.werte, [MAX_BATCH_OUTPUTS, MAX_BATCH_OUTPUTS + 1]);
    assert.equal((await POST(A, tA, '/api/wallet/sammel/liste', { zeilen: viele })).json.zuViele, true);

    // Senden: nur mit Passwort und mit genau dem, was im Pruefschritt stand.
    const senden = (mehr: Record<string, unknown>) => POST(A, tA, '/api/wallet/sammel/senden', { zeilen, notiz, summe: v.json.summe, anzahl: 4, gebuehr: v.json.gebuehr, passwort: PW, ...mehr });
    assert.equal((await senden({ passwort: 'falsch falsch' })).json.code, 'passwort_falsch');
    assert.equal((await senden({ gebuehr: undefined })).json.code, 'gebuehr_fehlt');
    assert.equal((await senden({ gebuehr: '1' })).json.code, 'gebuehr_gestiegen');
    assert.equal((await senden({ summe: (summe + 1n).toString() })).json.code, 'sammel_geaendert');
    assert.equal((await senden({ anzahl: 3 })).json.code, 'sammel_geaendert');
    assert.equal((await uebersicht()).wartend.length, 0, 'Bis hierher ist nichts hinausgegangen');

    const vorher = BigInt((await uebersicht()).verfuegbar);
    const s = await senden({});
    assert.equal(s.status, 200, JSON.stringify(s.json));
    assert.match(s.json.txid, /^[0-9a-f]{64}$/);
    assert.equal(s.json.anzahl, 4); assert.equal(s.json.summe, summe.toString()); assert.equal(s.json.gebuehr, v.json.gebuehr);
    assert.equal(s.json.von, ICH.address); assert.equal(s.json.notiz, notiz);

    // Wartend: EINE Zeile mit der Summe, die Empfaenger haengen daran; das Guthaben ist gebunden.
    let u = await uebersicht();
    assert.equal(u.wartend.length, 1);
    const w = u.wartend[0];
    assert.equal(w.sammel, true); assert.equal(w.art, 'aus'); assert.equal(w.gegen, '');
    assert.equal(w.betrag, summe.toString()); assert.equal(w.anzahl, 4); assert.equal(w.notiz, notiz);
    assert.equal(w.empfaenger.length, 4);
    assert.equal(w.empfaenger.find((e: any) => e.adresse === A1).name, 'Kai');
    assert.equal(BigInt(u.verfuegbar), vorher - summe - BigInt(v.json.gebuehr));

    // Eine zweite Zahlung gleich danach bekommt die naechste Nonce.
    const v2 = (await POST(A, tA, '/api/wallet/pruefen', { an: A2, betrag: '1' })).json;
    const z2 = await POST(A, tA, '/api/wallet/senden', { an: A2, betrag: '1', passwort: PW, gebuehr: v2.gebuehr });
    assert.equal(z2.status, 200, JSON.stringify(z2.json));
    assert.equal(v2.neu, false, 'An A2 geht schon etwas -- die Adresse ist nicht mehr neu');

    await bis('B kennt die Sammelzahlung', async () => (await ruf(B.api, `/tx/${s.json.txid}`)).status === 200);
    await einBlock();

    // Alle Empfaenger sind bezahlt -- in einem Block, auch die Adresse der Version 1.
    assert.equal(await guthaben(A1), 11n * UNIT);
    assert.equal(await guthaben(A2), 250000000n + 1n * UNIT);
    assert.equal(await guthaben(GEMEINSAM), 7n * UNIT);
    assert.equal(await guthaben(A3), 150000000n);

    // Verlauf: die Sammelzahlung als EIN Eintrag mit Summe, Notiz und Empfaengern.
    u = await uebersicht();
    assert.equal(u.wartend.length, 0);
    const eintraege = u.ueberweisungen.filter((x: any) => x.txid === s.json.txid);
    assert.equal(eintraege.length, 1, 'Ein Eintrag, nicht einer je Empfänger');
    const e = eintraege[0];
    assert.equal(e.sammel, true); assert.equal(e.art, 'aus'); assert.equal(e.gegen, ''); assert.equal(e.name, null);
    assert.equal(e.betrag, summe.toString()); assert.equal(e.gebuehr, v.json.gebuehr);
    assert.equal(e.anzahl, 4); assert.equal(e.notiz, notiz);
    assert.deepEqual(e.empfaenger.map((x: any) => x.adresse).sort(), [A1, A2, A3, GEMEINSAM].sort());
    assert.equal(e.empfaenger.find((x: any) => x.adresse === A1).name, 'Kai');
    assert.equal(e.empfaenger.reduce((n: bigint, x: any) => n + BigInt(x.betrag), 0n), summe);

    // Nach dem Senden gelten die Empfaenger als bekannt.
    const wieder = await POST(A, tA, '/api/wallet/sammel/pruefen', { zeilen: [{ adresse: A3, betrag: '1' }] });
    assert.equal(wieder.json.neue, 0);
  } finally {
    await a.shutdown(); await b.shutdown();
  }
});

test('Sammelzahlung vor Fassung 6: die Liste lässt sich prüfen, gesendet wird nichts', async () => {
  const K = { gui: 19_866, api: 19_867, p2p: 19_868 };
  const app = new NodeCoreApp({ params: REGTEST, guiPort: K.gui, basis: ordner() });
  await app.startGui();
  const t = app.zugangFuerFenster();
  const POST = (pfad: string, wert: unknown = {}) => ruf(K.gui, pfad, {
    method: 'POST', headers: { 'x-yskar-token': t, 'content-type': 'application/json' }, body: JSON.stringify(wert) });
  try {
    // Ohne Wallet: nichts.
    assert.equal((await POST('/api/wallet/sammel/liste', { text: `${A1},1` })).status, 400);
    assert.equal((await POST('/api/wallet/anlegen', { woerter: WORTE, passwort: PW })).status, 200);
    // Knoten aus: Die Liste laesst sich trotzdem pruefen.
    const l = await POST('/api/wallet/sammel/liste', { text: `${A1},1` });
    assert.equal(l.status, 200); assert.equal(l.json.bereit, 1); assert.equal(l.json.aktiv, false);
    assert.equal((await POST('/api/wallet/sammel/pruefen', { zeilen: [{ adresse: A1, betrag: '1' }] })).json.code, 'senden_knoten_aus');

    await POST('/api/configure', { dataDir: ordner(), nodePort: K.api, p2pPort: K.p2p, seed: '' });
    await POST('/api/start');
    await bis('Knoten läuft', async () => (await ruf(K.gui, '/api/status', { headers: { 'x-yskar-token': t } })).json.running === true);
    const v = await POST('/api/wallet/sammel/pruefen', { zeilen: [{ adresse: A1, betrag: '1' }] });
    assert.equal(v.json.code, 'sammel_ab_v6');
    const s = await POST('/api/wallet/sammel/senden', { zeilen: [{ adresse: A1, betrag: '1' }], summe: UNIT.toString(), anzahl: 1, gebuehr: '10000', passwort: PW });
    assert.equal(s.json.code, 'sammel_ab_v6');
    const u = await ruf(K.gui, '/api/wallet/uebersicht', { headers: { 'x-yskar-token': t } });
    assert.equal(u.json.sammelAktiv, false);
  } finally {
    await app.shutdown();
  }
});
