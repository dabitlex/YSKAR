/**
 * Gemeinsame Konten im Node Core: anlegen, Guthaben, Ausgabe vorschlagen,
 * mitzeichnen, einreichen -- ueber dieselbe Schnittstelle wie die Oberflaeche.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST_V6 as REGTEST } from '../../src/lib/core/networks.ts';
import { UNIT } from '../../src/lib/core/params.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { mitzeichnen, mitzeichnungAusText, mitzeichnungText } from '../../src/lib/wallet/mehrfach.ts';
import { GemeinsameKonten } from '../src/GemeinsameKonten.ts';
import { WalletFehler } from '../src/Wallet.ts';
import { NodeCoreApp } from '../src/main.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ICH = keypairFromMnemonic(WORTE, '', 0, 0);
const MARA = keypairFromMnemonic('legal winner thank year wave sausage worth useful legal winner thank yellow', '', 0, 0);
const ALEX = keypairFromMnemonic('letter advice cage absurd amount doctor acoustic avoid letter advice cage above', '', 0, 0);
const PW = 'ein langes passwort';
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-gemeinsam-'));
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

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

test('Gemeinsame Konten: Datei -- nur Oeffentliches, Adresse aus den Schluesseln gerechnet', () => {
  const dir = ordner();
  const g = new GemeinsameKonten(dir);
  const eigen = toHex(ICH.publicKey), mara = toHex(MARA.publicKey), alex = toHex(ALEX.publicKey);
  const fehler = (f: () => unknown, code: string) => {
    try { f(); } catch (e) { assert.ok(e instanceof WalletFehler); assert.equal((e as WalletFehler).code, code); return; }
    assert.fail('erwartet: ' + code);
  };
  fehler(() => g.anlegen('Kasse', 2, [eigen, mara]), 'gemeinsam_eigener_fehlt');
  g.setzeEigenen(eigen);
  fehler(() => g.anlegen('Kasse', 2, [mara, alex]), 'gemeinsam_ohne_dich');
  fehler(() => g.anlegen('Kasse', 3, [eigen, mara]), 'gemeinsam_k');
  fehler(() => g.anlegen('Kasse', 2, [eigen, eigen]), 'gemeinsam_doppelt');
  fehler(() => g.anlegen('Kasse', 2, [eigen]), 'gemeinsam_anzahl');
  fehler(() => g.anlegen('', 2, [eigen, mara]), 'gemeinsam_name');
  fehler(() => g.anlegen('Kasse', 2, [eigen, 'zz']), 'gemeinsam_schluessel_falsch');

  const a = g.anlegen('Vereinskasse', 2, [alex, eigen, mara]);
  assert.match(a.adresse, /^ysr1p/);
  // Dieselben Schluessel in anderer Reihenfolge: dasselbe Konto -- jeder rechnet es selbst nach.
  const b = g.anlegen('Kasse neu', 2, [mara, eigen, alex]);
  assert.equal(b.adresse, a.adresse);
  assert.equal(g.konten().length, 1, 'Beitreten ist dasselbe wie Anlegen');
  assert.equal(g.konten()[0].name, 'Kasse neu');

  // Neu geladen: dasselbe.
  const g2 = new GemeinsameKonten(dir);
  assert.equal(g2.eigenerSchluessel(), eigen);
  assert.equal(g2.konten()[0].adresse, a.adresse);
  g2.entfernen(a.adresse);
  assert.equal(new GemeinsameKonten(dir).konten().length, 0);
});

test('Gemeinsame Konten am Knoten: 2 von 3 -- vorschlagen, mitzeichnen, einreichen', async () => {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 200_000n;
  const uhr = () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
  const A = { gui: 19_850, api: 19_851, p2p: 19_852 }, B = { gui: 19_853, api: 19_854, p2p: 19_855 };
  const a = new NodeCoreApp({ params: REGTEST, guiPort: A.gui, basis: ordner(), uhr });
  const b = new NodeCoreApp({ params: REGTEST, guiPort: B.gui, basis: ordner(), uhr });
  await a.startGui(); await b.startGui();
  const tA = a.zugangFuerFenster(), tB = b.zugangFuerFenster();
  const GET = (k: typeof A, t: string, pfad: string) => ruf(k.gui, pfad, { headers: { 'x-yskar-token': t } });
  const POST = (k: typeof A, t: string, pfad: string, wert: unknown = {}) => ruf(k.gui, pfad, {
    method: 'POST', headers: { 'x-yskar-token': t, 'content-type': 'application/json' }, body: JSON.stringify(wert) });
  const stand = async (k: typeof A, t: string) => (await GET(k, t, '/api/status')).json;
  const EMPF = encodeAddress(new Uint8Array(20).fill(0xee));

  /** Einen Block weiter minen. */
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

    // Eigener Schluessel: nur mit Passwort.
    assert.equal((await POST(A, tA, '/api/gemeinsam/schluessel', { passwort: 'falsch falsch' })).json.code, 'passwort_falsch');
    const s = await POST(A, tA, '/api/gemeinsam/schluessel', { passwort: PW });
    assert.equal(s.json.schluessel, toHex(ICH.publicKey));

    const angelegt = await POST(A, tA, '/api/gemeinsam/anlegen', { name: 'Vereinskasse', k: 2, schluessel: [toHex(MARA.publicKey), s.json.schluessel, toHex(ALEX.publicKey)] });
    assert.equal(angelegt.status, 200, JSON.stringify(angelegt.json));
    assert.equal(angelegt.json.aktiv, true);
    const konto = angelegt.json.konten[0];
    assert.equal(konto.k, 2); assert.equal(konto.n, 3); assert.match(konto.adresse, /^ysr1p/);
    assert.equal(konto.guthaben, '0');

    // Geld aufs gemeinsame Konto: aus der eigenen Wallet.
    await einBlock(); await einBlock();
    const v = (await POST(A, tA, '/api/wallet/pruefen', { an: konto.adresse, betrag: '100' })).json;
    const gesendet = await POST(A, tA, '/api/wallet/senden', { an: konto.adresse, betrag: '100', passwort: PW, gebuehr: v.gebuehr });
    assert.equal(gesendet.status, 200, JSON.stringify(gesendet.json));
    await einBlock();
    let g = (await GET(A, tA, '/api/gemeinsam')).json;
    assert.equal(g.konten[0].guthaben, (100n * UNIT).toString());

    // Vorschlagen: unterschreibt gleich mit dem eigenen Schluessel.
    const fehlt = await POST(A, tA, '/api/gemeinsam/vorschlagen', { konto: konto.adresse, an: EMPF, betrag: '10', notiz: 'Miete', passwort: 'falsch falsch' });
    assert.equal(fehlt.json.code, 'passwort_falsch');
    const zuViel = await POST(A, tA, '/api/gemeinsam/vorschlagen', { konto: konto.adresse, an: EMPF, betrag: '1000', passwort: PW });
    assert.equal(zuViel.json.code, 'guthaben_reicht_nicht');
    const vor = await POST(A, tA, '/api/gemeinsam/vorschlagen', { konto: konto.adresse, an: EMPF, betrag: '10', notiz: 'Miete', passwort: PW });
    assert.equal(vor.status, 200, JSON.stringify(vor.json));
    assert.equal(vor.json.unterschrieben, 1); assert.equal(vor.json.fehlen, 1);
    assert.equal(vor.json.vonMir, true); assert.equal(vor.json.binBeteiligt, true);
    assert.equal(vor.json.kontoName, 'Vereinskasse'); assert.equal(vor.json.notiz, 'Miete');

    // Mit einer Unterschrift geht es noch nicht hinaus.
    assert.equal((await POST(A, tA, '/api/gemeinsam/einreichen', { text: vor.json.text })).json.code, 'mitzeichnung_fehlt');

    // Eine veraenderte Datei faellt auf.
    const m = mitzeichnungAusText(vor.json.text);
    const kaputt = { ...m, tx: m.tx.slice(0, -2) + (m.tx.endsWith('00') ? '01' : '00') };
    assert.equal((await POST(A, tA, '/api/gemeinsam/lesen', { text: mitzeichnungText(kaputt) })).json.code, 'mitzeichnung_ungueltig');
    assert.equal((await POST(A, tA, '/api/gemeinsam/lesen', { text: 'hallo' })).json.code, 'mitzeichnung_kaputt');

    // Mara zeichnet mit -- in ihrer eigenen Wallet.
    const vonMara = mitzeichnen(m, MARA.privateKey, MARA.publicKey, REGTEST.network, REGTEST.chainId);
    const gelesen = await POST(A, tA, '/api/gemeinsam/lesen', { text: mitzeichnungText(vonMara) });
    assert.equal(gelesen.json.fehlen, 0); assert.equal(gelesen.json.unterschrieben, 2);
    const ein = await POST(A, tA, '/api/gemeinsam/einreichen', { text: gelesen.json.text });
    assert.equal(ein.status, 200, JSON.stringify(ein.json));
    assert.match(ein.json.txid, /^[0-9a-f]{64}$/);
    await bis('B kennt die Ausgabe', async () => (await ruf(B.api, `/tx/${ein.json.txid}`)).status === 200);
    await einBlock();
    g = (await GET(A, tA, '/api/gemeinsam')).json;
    assert.equal(BigInt(g.konten[0].guthaben), 90n * UNIT - BigInt(vor.json.gebuehr));
    assert.equal(g.konten[0].verlauf[0].art, 'aus');
    assert.equal(g.konten[0].verlauf[0].gegen, EMPF);
  } finally {
    await a.shutdown(); await b.shutdown();
  }
});
