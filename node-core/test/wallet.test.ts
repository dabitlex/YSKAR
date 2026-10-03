/**
 * Wallet des Node Core: Verwahrung des Schluessels, Sperre, Senden ueber den
 * eigenen Knoten, Verlauf aus der Kette.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { UNIT } from '../../src/lib/core/params.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { zahlungAusCode } from '../../src/lib/wallet/qr.ts';
import { WalletDienst, WalletFehler } from '../src/Wallet.ts';
import { NodeCoreApp } from '../src/main.ts';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const ERWARTET = keypairFromMnemonic(WORTE, '', 0, 0);
const PW = 'ein langes passwort';
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-wallet-'));
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

async function wirft(f: () => Promise<unknown> | unknown, code: string): Promise<void> {
  try { await f(); } catch (e) {
    assert.ok(e instanceof WalletFehler, `kein WalletFehler: ${(e as Error).message}`);
    assert.equal((e as WalletFehler).code, code, (e as Error).message);
    return;
  }
  assert.fail(`erwartet: ${code}`);
}

// ---------------------------------------------------------------------------

test('Wallet: anlegen, sperren, entsperren -- der Schlüssel steht nie im Klartext', async () => {
  const dir = ordner();
  let jetzt = 1_000_000;
  const w = new WalletDienst(dir, () => jetzt);
  assert.deepEqual(w.stand(), { vorhanden: false, gesperrt: false, adresse: null, sperrtIn: null, angelegt: null });

  // Frische Woerter: zwoelf, und jedes Mal andere.
  const a = w.neueWoerter(), b = w.neueWoerter();
  assert.equal(a.split(' ').length, 12); assert.notEqual(a, b);
  assert.equal(w.stand().vorhanden, false, 'neueWoerter speichert nichts');

  await wirft(() => w.anlegen(WORTE, 'kurz'), 'passwort_kurz');
  await wirft(() => w.anlegen('zwölf wörter die es nicht gibt eins zwei drei vier fünf sechs sieben', PW), 'woerter_falsch');
  await wirft(() => w.anlegen(WORTE.replace('about', 'abandon'), PW), 'woerter_falsch');

  const s = await w.anlegen('  ' + WORTE.toUpperCase().replace(/ /g, '  ') + ' ', PW);
  assert.equal(s.adresse, ERWARTET.address, 'Dieselbe Adresse wie in der App mit denselben Wörtern');
  assert.equal(s.gesperrt, false);
  assert.equal(s.sperrtIn, 600);

  // Die Datei: verschluesselt, die Adresse im Klartext, kein einziges der Woerter.
  const datei = readFileSync(join(dir, 'wallet.json'), 'utf8');
  assert.ok(datei.includes(ERWARTET.address));
  assert.ok(!datei.includes('abandon') && !datei.includes('about'));
  assert.ok(!datei.includes(PW));
  assert.ok(!existsSync(join(dir, 'wallet.json.neu')));

  await wirft(() => w.anlegen(WORTE, PW), 'wallet_vorhanden');

  // Sperren und entsperren
  w.sperren();
  assert.equal(w.stand().gesperrt, true);
  assert.equal(w.stand().adresse, ERWARTET.address, 'Die Adresse ist öffentlich und bleibt sichtbar');
  await wirft(() => w.verlangeOffen(), 'gesperrt');
  await wirft(() => w.woerter(PW), 'gesperrt');
  await wirft(() => w.schluessel(PW), 'gesperrt');
  await wirft(() => w.setzeKontakt('Mara', ERWARTET.address), 'gesperrt');
  await wirft(() => w.entsperren('falsches passwort'), 'passwort_falsch');
  await wirft(() => w.entsperren(''), 'passwort_falsch');
  assert.equal(w.stand().gesperrt, true);
  assert.equal((await w.entsperren(PW)).gesperrt, false);

  // Die Woerter und der Schluessel: nur mit Passwort.
  await wirft(() => w.woerter('falsch falsch'), 'passwort_falsch');
  assert.equal(await w.woerter(PW), WORTE);
  const paar = await w.schluessel(PW);
  assert.deepEqual(paar.publicKey, ERWARTET.publicKey);

  // Ein zweites Programm liest dieselbe Datei -- und ist gesperrt.
  const w2 = new WalletDienst(dir, () => jetzt);
  assert.equal(w2.stand().vorhanden, true); assert.equal(w2.stand().gesperrt, true);
  assert.equal((await w2.entsperren(PW)).adresse, ERWARTET.address);

  // Automatische Sperre nach zehn Minuten ohne Regung.
  jetzt += 9 * 60_000; assert.equal(w.stand().gesperrt, false);
  w.regung();
  jetzt += 9 * 60_000; assert.equal(w.stand().gesperrt, false, 'Eine Regung verlängert die Frist');
  jetzt += 2 * 60_000; assert.equal(w.stand().gesperrt, true);
  w.regung(); assert.equal(w.stand().gesperrt, true, 'Eine Regung entsperrt nicht');
  await w.entsperren(PW);
  w.sperreMinuten = 0; jetzt += 24 * 3_600_000;
  assert.equal(w.stand().gesperrt, false, '"nie" sperrt nie'); assert.equal(w.stand().sperrtIn, null);
});

test('Wallet: falsche Versuche führen zu einer Pause', async () => {
  let jetzt = 5_000_000;
  const w = new WalletDienst(ordner(), () => jetzt);
  await w.anlegen(WORTE, PW);
  w.sperren();
  for (let i = 0; i < 5; i++) await wirft(() => w.entsperren('falsch nummer ' + i), 'passwort_falsch');
  await wirft(() => w.entsperren(PW), 'pause');
  jetzt += 29_000; await wirft(() => w.entsperren(PW), 'pause');
  jetzt += 2_000; assert.equal((await w.entsperren(PW)).gesperrt, false);
});

test('Wallet: Passwort ändern, neu setzen mit den Wörtern, entfernen', async () => {
  const dir = ordner();
  const w = new WalletDienst(dir);
  await w.anlegen(WORTE, PW);

  await wirft(() => w.passwortAendern('falsches altes', 'neues langes passwort'), 'passwort_falsch');
  await wirft(() => w.passwortAendern(PW, 'kurz'), 'passwort_kurz');
  await w.passwortAendern(PW, 'neues langes passwort');
  w.sperren();
  await wirft(() => w.entsperren(PW), 'passwort_falsch');
  await w.entsperren('neues langes passwort');
  assert.equal(await w.woerter('neues langes passwort'), WORTE);

  // Passwort vergessen: nur mit den Woertern DIESER Wallet.
  w.sperren();
  const fremd = w.neueWoerter();
  await wirft(() => w.neuesPasswortMitWoertern(fremd, 'drittes langes passwort'), 'woerter_fremd');
  await wirft(() => w.neuesPasswortMitWoertern('unsinn', 'drittes langes passwort'), 'woerter_falsch');
  assert.equal(w.stand().gesperrt, true);
  const s = await w.neuesPasswortMitWoertern(WORTE, 'drittes langes passwort');
  assert.equal(s.gesperrt, false); assert.equal(s.adresse, ERWARTET.address);
  assert.equal(await w.woerter('drittes langes passwort'), WORTE);

  // Entfernen verlangt das Passwort.
  await wirft(() => w.entfernen('falsch falsch'), 'passwort_falsch');
  assert.equal(w.stand().vorhanden, true);
  await w.entfernen('drittes langes passwort');
  assert.equal(w.stand().vorhanden, false);
  assert.ok(!existsSync(join(dir, 'wallet.json')));
});

test('Wallet: eine beschädigte Datei wird nicht überschrieben', async () => {
  const dir = ordner();
  writeFileSync(join(dir, 'wallet.json'), '{"version":1,"salt":"x"');
  const w = new WalletDienst(dir);
  assert.equal(w.stand().vorhanden, false);
  await wirft(() => w.anlegen(WORTE, PW), 'datei_beschaedigt');
  assert.equal(readFileSync(join(dir, 'wallet.json'), 'utf8'), '{"version":1,"salt":"x"');
});

test('Wallet: Kontakte', async () => {
  const dir = ordner();
  const w = new WalletDienst(dir);
  await w.anlegen(WORTE, PW);
  const A = encodeAddress(new Uint8Array(20).fill(1)), B = encodeAddress(new Uint8Array(20).fill(2));
  await wirft(() => w.setzeKontakt('', A), 'kontakt_name');
  await wirft(() => w.setzeKontakt('x'.repeat(25), A), 'kontakt_name');
  await wirft(() => w.setzeKontakt('Mara', 'ysr1unsinn'), 'adresse_falsch');
  w.setzeKontakt('  Mara ', A.toUpperCase());
  w.setzeKontakt('Jonas', B);
  assert.deepEqual(w.kontakte(), [{ name: 'Jonas', adresse: B }, { name: 'Mara', adresse: A }]);
  w.setzeKontakt('Mara M.', A);
  assert.equal(w.kontaktName(A), 'Mara M.'); assert.equal(w.kontakte().length, 2, 'Dieselbe Adresse wird umbenannt, nicht verdoppelt');
  assert.deepEqual(new WalletDienst(dir).kontakte().map(k => k.name), ['Jonas', 'Mara M.'], 'Kontakte überleben einen Neustart');
  w.entferneKontakt(A);
  assert.deepEqual(w.kontakte().map(k => k.name), ['Jonas']);
});

// ---------------------------------------------------------------------------

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

test('Wallet am Knoten: minen in die Wallet, senden, Verlauf, QR-Code', async () => {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 200_000n;
  const uhr = () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
  const A = { gui: 19_750, api: 19_751, p2p: 19_752 }, B = { gui: 19_753, api: 19_754, p2p: 19_755 };
  const a = new NodeCoreApp({ params: REGTEST, guiPort: A.gui, basis: ordner(), uhr });
  const b = new NodeCoreApp({ params: REGTEST, guiPort: B.gui, basis: ordner(), uhr });
  await a.startGui(); await b.startGui();

  const zugang = async (gui: number) => String((await ruf(gui, '/')).json).match(/name="yskar-zugang" content="([0-9a-f]{64})"/)![1];
  const tA = await zugang(A.gui), tB = await zugang(B.gui);
  const GET = (k: typeof A, t: string, pfad: string) => ruf(k.gui, pfad, { headers: { 'x-yskar-token': t } });
  const POST = (k: typeof A, t: string, pfad: string, wert: unknown = {}) => ruf(k.gui, pfad, {
    method: 'POST', headers: { 'x-yskar-token': t, 'content-type': 'application/json' }, body: JSON.stringify(wert) });
  const stand = async (k: typeof A, t: string) => (await GET(k, t, '/api/status')).json;
  const EMPF = encodeAddress(new Uint8Array(20).fill(0xee));
  const ZWEITER = encodeAddress(new Uint8Array(20).fill(0x44));

  try {
    // Ohne Schluessel geht auch an der Wallet nichts.
    assert.equal((await ruf(A.gui, '/api/wallet')).status, 401);
    assert.equal((await ruf(A.gui, '/api/wallet/woerter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);

    // Wallet anlegen -- ueber die Schnittstelle, wie die Oberflaeche es tut.
    const neu = await POST(A, tA, '/api/wallet/neu');
    assert.equal(neu.json.woerter.split(' ').length, 12);
    assert.equal((await GET(A, tA, '/api/wallet')).json.vorhanden, false);
    const angelegt = await POST(A, tA, '/api/wallet/anlegen', { woerter: WORTE, passwort: PW });
    assert.equal(angelegt.status, 200, JSON.stringify(angelegt.json));
    assert.equal(angelegt.json.adresse, ERWARTET.address);
    assert.equal((await stand(A, tA)).wallet.adresse, ERWARTET.address);

    // Knoten starten, verbinden
    await POST(A, tA, '/api/configure', { dataDir: ordner(), nodePort: A.api, p2pPort: A.p2p, seed: '' });
    await POST(A, tA, '/api/start');
    await POST(B, tB, '/api/configure', { dataDir: ordner(), nodePort: B.api, p2pPort: B.p2p, seed: `127.0.0.1:${A.p2p}` });
    await POST(B, tB, '/api/start');
    await bis('verbunden', async () => (await stand(A, tA)).peerCount === 1);

    // Leere Wallet: nichts da, senden geht nicht.
    let u = (await GET(A, tA, '/api/wallet/uebersicht')).json;
    assert.equal(u.guthaben, '0'); assert.equal(u.ueberweisungen.length, 0); assert.equal(u.sieben.length, 7);
    const leer = await POST(A, tA, '/api/wallet/pruefen', { an: EMPF, betrag: '1' });
    assert.equal(leer.json.code, 'guthaben_reicht_nicht');

    // In die Wallet minen.
    assert.equal((await POST(A, tA, '/api/mining/start', { address: ERWARTET.address, mode: 'cpu', cpuWorkers: 1 })).status, 200);
    await bis('A findet Blöcke', async () => ((await stand(A, tA)).height ?? -1) >= 2);
    await POST(A, tA, '/api/mining/stop');
    const hoehe = (await stand(A, tA)).height as number;
    await bis('B holt auf', async () => (await stand(B, tB)).height === hoehe);

    u = (await GET(A, tA, '/api/wallet/uebersicht')).json;
    const erwartet = BigInt(hoehe + 1) * 875n * UNIT;
    assert.equal(u.guthaben, erwartet.toString());
    assert.equal(u.verfuegbar, erwartet.toString());
    assert.equal(u.mining.reduce((s: number, m: any) => s + m.solo, 0), hoehe + 1, 'Jeder Block steht als Solo-Fund im Verlauf');
    assert.equal(u.mining.reduce((s: bigint, m: any) => s + BigInt(m.summe), 0n), erwartet);
    assert.ok(u.datei.endsWith('wallet.json'));

    // Pruefen: Fehler in der Sprache der Oberflaeche erkennbar.
    for (const [rumpf, code] of [
      [{ an: 'ysr1unsinn', betrag: '1' }, 'adresse_falsch'],
      [{ an: ERWARTET.address, betrag: '1' }, 'eigene_adresse'],
      [{ an: EMPF, betrag: '' }, 'betrag_falsch'],
      [{ an: EMPF, betrag: '-5' }, 'betrag_falsch'],
      [{ an: EMPF, betrag: '0,0000001' }, 'betrag_staub'],
      [{ an: EMPF, betrag: '99999999' }, 'guthaben_reicht_nicht'],
    ] as const) {
      const r = await POST(A, tA, '/api/wallet/pruefen', rumpf);
      assert.equal(r.status, 400); assert.equal(r.json.code, code, JSON.stringify(rumpf));
    }

    const v = (await POST(A, tA, '/api/wallet/pruefen', { an: EMPF.toUpperCase(), betrag: '25,5', notiz: 'Grüße ' })).json;
    assert.equal(v.an, EMPF); assert.equal(v.betrag, (255n * UNIT / 10n).toString());
    assert.equal(v.neu, true, 'An diese Adresse ging noch nie etwas');
    assert.equal(v.notiz, 'Grüße');
    assert.ok(BigInt(v.gebuehr) > 0n);
    assert.equal(BigInt(v.gesamt), BigInt(v.betrag) + BigInt(v.gebuehr));
    assert.equal(BigInt(v.danach), erwartet - BigInt(v.gesamt));
    // Eine laengere Notiz kostet mehr -- die Gebuehr gilt je Byte.
    const ohne = (await POST(A, tA, '/api/wallet/pruefen', { an: EMPF, betrag: '25,5' })).json;
    assert.ok(BigInt(v.gebuehr) > BigInt(ohne.gebuehr), 'Die Notiz macht die Überweisung länger');

    // Senden: nur mit Passwort.
    const falsch = await POST(A, tA, '/api/wallet/senden', { an: EMPF, betrag: '25,5', notiz: 'Grüße', passwort: 'falsch falsch' });
    assert.equal(falsch.json.code, 'passwort_falsch');
    assert.equal((await stand(A, tA)).mempool, 0, 'Ohne Passwort geht nichts hinaus');
    const ohnePw = await POST(A, tA, '/api/wallet/senden', { an: EMPF, betrag: '25,5' });
    assert.equal(ohnePw.json.code, 'passwort_falsch');

    const gesendet = await POST(A, tA, '/api/wallet/senden', { an: EMPF, betrag: '25,5', notiz: 'Grüße', passwort: PW });
    assert.equal(gesendet.status, 200, JSON.stringify(gesendet.json));
    assert.match(gesendet.json.txid, /^[0-9a-f]{64}$/);
    assert.equal(gesendet.json.peers, 1);
    await bis('B kennt die Überweisung', async () => (await stand(B, tB)).mempool === 1);

    // Unterwegs: zaehlt schon vom Verfuegbaren ab, das Guthaben aendert sich erst mit dem Block.
    u = (await GET(A, tA, '/api/wallet/uebersicht')).json;
    assert.equal(u.guthaben, erwartet.toString());
    assert.equal(BigInt(u.unterwegs), BigInt(v.gesamt));
    assert.equal(BigInt(u.verfuegbar), erwartet - BigInt(v.gesamt));
    assert.equal(u.wartend.length, 1);
    assert.equal(u.wartend[0].art, 'aus'); assert.equal(u.wartend[0].gegen, EMPF); assert.equal(u.wartend[0].notiz, 'Grüße');

    // Eine zweite Zahlung, waehrend die erste wartet: eigene Nonce, kein Ersatz der ersten.
    await POST(A, tA, '/api/wallet/kontakt', { name: 'Mara', adresse: EMPF });
    const zweite = await POST(A, tA, '/api/wallet/senden', { an: EMPF, betrag: '1', passwort: PW });
    assert.equal(zweite.status, 200, JSON.stringify(zweite.json));
    assert.equal(zweite.json.name, 'Mara');
    assert.equal((await stand(A, tA)).mempool, 2);
    const nochmal = (await POST(A, tA, '/api/wallet/pruefen', { an: EMPF, betrag: '1' })).json;
    assert.equal(nochmal.neu, false, 'Mit einer wartenden Zahlung und als Kontakt ist die Adresse bekannt');

    // "Alles": genau das Verfuegbare, die Gebuehr schon abgezogen.
    const alles = (await POST(A, tA, '/api/wallet/pruefen', { an: EMPF, alles: true })).json;
    assert.equal(alles.danach, '0');
    assert.equal(BigInt(alles.betrag) + BigInt(alles.gebuehr), BigInt(alles.verfuegbar));

    // B baut beide in einen Block.
    await POST(B, tB, '/api/mining/start', { address: ZWEITER, mode: 'cpu', cpuWorkers: 1 });
    await bis('B findet einen Block', async () => (await stand(B, tB)).height > hoehe);
    await POST(B, tB, '/api/mining/stop');
    const neuHoehe = (await stand(B, tB)).height as number;
    await bis('A hat den Block', async () => (await stand(A, tA)).height === neuHoehe);

    u = (await GET(A, tA, '/api/wallet/uebersicht')).json;
    assert.equal(u.wartend.length, 0);
    assert.equal(u.unterwegs, '0');
    const aus = u.ueberweisungen.filter((x: any) => x.art === 'aus');
    assert.equal(aus.length, 2);
    assert.ok(aus.every((x: any) => x.gegen === EMPF && x.name === 'Mara'));
    assert.ok(aus.some((x: any) => x.notiz === 'Grüße' && x.betrag === v.betrag));
    const kosten = aus.reduce((s: bigint, x: any) => s + BigInt(x.betrag) + BigInt(x.gebuehr), 0n);
    assert.equal(BigInt(u.guthaben), erwartet - kosten);
    assert.equal((await ruf(A.api, `/account/${EMPF}`)).json.balance, (BigInt(v.betrag) + UNIT).toString(), 'Beim Empfänger ist es angekommen');

    // QR-Code: laesst sich lesen und enthaelt, was die App erwartet.
    const lies = (q: { groesse: number; zeilen: string[] }) => {
      const m = 6, rand = 4, g = (q.groesse + rand * 2) * m;
      const pix = new Uint8ClampedArray(g * g * 4).fill(255);
      for (let y = 0; y < q.groesse; y++) for (let x = 0; x < q.groesse; x++) {
        if (q.zeilen[y][x] !== '1') continue;
        for (let dy = 0; dy < m; dy++) for (let dx = 0; dx < m; dx++) {
          const i = (((y + rand) * m + dy) * g + (x + rand) * m + dx) * 4;
          pix[i] = pix[i + 1] = pix[i + 2] = 0;
        }
      }
      return jsQR(pix, g, g)?.data ?? null;
    };
    const q1 = (await GET(A, tA, '/api/wallet/qr')).json;
    assert.equal(q1.code, ERWARTET.address);
    assert.equal(lies(q1), ERWARTET.address, 'Der Code ohne Betrag ist die blanke Adresse');
    const q2 = (await GET(A, tA, '/api/wallet/qr?betrag=12%2C5')).json;
    assert.equal(lies(q2), q2.code);
    const z = zahlungAusCode(q2.code);
    assert.equal(z?.adresse, ERWARTET.address); assert.equal(z?.betrag, 125n * UNIT / 10n, 'Die App liest Adresse und Betrag heraus');

    // Gesperrt: die Oberflaeche bekommt nichts mehr, das Mining laeuft trotzdem.
    await POST(A, tA, '/api/wallet/sperren');
    for (const pfad of ['/api/wallet/uebersicht', '/api/wallet/qr']) {
      const r = await GET(A, tA, pfad); assert.equal(r.status, 400); assert.equal(r.json.code, 'gesperrt');
    }
    assert.equal((await POST(A, tA, '/api/wallet/senden', { an: EMPF, betrag: '1', passwort: PW })).json.code, 'gesperrt');
    assert.equal((await POST(A, tA, '/api/wallet/kontakt', { name: 'X', adresse: EMPF })).json.code, 'gesperrt');
    assert.equal((await stand(A, tA)).wallet.gesperrt, true);
    assert.equal((await POST(A, tA, '/api/mining/start', { address: ERWARTET.address, mode: 'cpu', cpuWorkers: 1 })).status, 200,
      'Minen in die eigene Wallet braucht nur die Adresse');
    await POST(A, tA, '/api/mining/stop');
    assert.equal((await POST(A, tA, '/api/wallet/entsperren', { passwort: PW })).json.gesperrt, false);
  } finally {
    await a.shutdown(); await b.shutdown();
  }
});
