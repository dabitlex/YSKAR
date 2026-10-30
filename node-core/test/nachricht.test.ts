/**
 * Nachricht signieren und pruefen, Anmelden per Link (src/Nachrichten.ts):
 * der Schluessel kommt fuer EINEN Vorgang aus der Wallet, das Passwort wird
 * jedes Mal verlangt, und ein Link wird erst nach Zustimmung unterschrieben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { baueAnmeldung, pruefe } from '../../src/lib/core/signedMessage.ts';
import { WalletDienst, WalletFehler } from '../src/Wallet.ts';
import { Nachrichten } from '../src/Nachrichten.ts';
import { NodeCoreApp } from '../src/main.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ADR = keypairFromMnemonic(WORTE).address;
const PW = 'ein langes passwort';
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-nachricht-'));
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const anmeldung = (domain = 'lab.yskar.app', adresse = ADR, jetzt = Date.now()) => baueAnmeldung({
  domain, address: adresse, nonce: 'ab'.repeat(16), issued: iso(jetzt), expires: iso(jetzt + 600_000),
});
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const link = (m: string, cb = 'https://lab.yskar.app/api/auth/qr/1') => `yskar:login?msg=${b64(m)}&cb=${b64(cb)}`;

async function wirft(f: () => Promise<unknown> | unknown, code: string): Promise<void> {
  try { await f(); } catch (e) {
    assert.ok(e instanceof WalletFehler, `kein WalletFehler: ${(e as Error).message}`);
    assert.equal((e as WalletFehler).code, code, (e as Error).message);
    return;
  }
  assert.fail(`erwartet: ${code}`);
}

async function wallet(): Promise<WalletDienst> {
  const w = new WalletDienst(ordner());
  await w.anlegen(WORTE, PW);
  return w;
}

test('Signieren: Passwort jedes Mal, Ergebnis prüfbar, Regeln aus dem Kern', async () => {
  const w = await wallet();
  const n = new Nachrichten(w);
  const v = n.vorschau('Ich betreibe den Pool GOZERO.');
  assert.equal(v.art, 'text');
  assert.equal(v.nachricht, 'YSKAR Signed Message\npurpose: text\n\nIch betreibe den Pool GOZERO.');

  await wirft(() => n.signieren('hallo', 'falsches passwort'), 'passwort_falsch');
  const s = await n.signieren('hallo', PW);
  assert.equal(s.address, ADR);
  assert.equal(pruefe(s).gueltig, true);
  assert.equal(n.pruefen({ ergebnis: JSON.stringify(s) }).gueltig, true);
  assert.equal(n.pruefen({ ...s, message: s.message + '!' }).gueltig, false);
  await wirft(() => n.pruefen({ ergebnis: 'kein json' }), 'nachricht_ergebnis');

  const a = n.vorschau(anmeldung());
  assert.equal(a.art, 'login');
  assert.equal(a.anmeldung?.domain, 'lab.yskar.app');
  await wirft(() => n.vorschau(anmeldung('evil.example')), 'nachricht_domain');
  await wirft(() => n.vorschau(anmeldung('lab.yskar.app', keypairFromMnemonic(WORTE, '', 0, 1).address)), 'nachricht_adresse');
  await wirft(() => n.vorschau(anmeldung('lab.yskar.app', ADR, Date.now() - 700_000)), 'nachricht_abgelaufen');
  await wirft(() => n.vorschau('YSKAR Signed Message\npurpose: pay\n\n1000'), 'nachricht_zweck');

  w.sperren();
  await wirft(() => n.vorschau('hallo'), 'gesperrt');
});

test('Link: erst Zustimmung mit Passwort, dann genau ein POST an die Website', async () => {
  const w = await wallet();
  const gesendet: { url: string; body: any; redirect?: string }[] = [];
  let antwort: { status: number; body: unknown } = { status: 200, body: { ok: true } };
  const holen = (async (url: string, opt: RequestInit) => {
    gesendet.push({ url, body: JSON.parse(String(opt.body)), redirect: opt.redirect });
    return new Response(JSON.stringify(antwort.body), { status: antwort.status });
  }) as unknown as typeof fetch;
  const n = new Nachrichten(w, Date.now, holen);

  assert.equal(n.linkStand(), null);
  n.oeffneLink(link(anmeldung()));
  const l1 = n.link() as any;
  assert.equal(l1.passt, true);
  assert.equal(l1.anmeldung.domain, 'lab.yskar.app');
  assert.equal(gesendet.length, 0, 'Vor der Zustimmung wird nichts gesendet');

  // Gesperrte Wallet: dasselbe Passwort entsperrt sie.
  w.sperren();
  antwort = { status: 400, body: { ok: false, error: 'This sign-in code was already used.' } };
  const nein = await n.anmelden(PW);
  assert.deepEqual(nein, { ok: false, text: 'This sign-in code was already used.', domain: 'lab.yskar.app' });
  assert.ok(n.linkStand(), 'Nach einer Ablehnung bleibt der Link für einen zweiten Versuch');

  antwort = { status: 200, body: { ok: true } };
  const ja = await n.anmelden(PW);
  assert.equal(ja.ok, true);
  assert.equal(gesendet.length, 2);
  assert.equal(gesendet[1].url, 'https://lab.yskar.app/api/auth/qr/1');
  assert.equal(gesendet[1].redirect, 'manual');
  assert.equal(pruefe(gesendet[1].body).gueltig, true);
  assert.equal(n.linkStand(), null, 'Nach dem Erfolg ist der Link verbraucht');
  await wirft(() => n.anmelden(PW), 'nachricht_kein_link');
});

test('Link: fremde Domain, falscher Rückruf und kaputte Links werden nie unterschrieben', async () => {
  const w = await wallet();
  const holen = (async () => { throw new Error('darf nicht senden'); }) as unknown as typeof fetch;
  const n = new Nachrichten(w, Date.now, holen);
  n.oeffneLink(link(anmeldung('evil.example'), 'https://evil.example/x'));
  assert.deepEqual((n.link() as any).code, 'nachricht_domain');
  await wirft(() => n.anmelden(PW), 'nachricht_kein_link');
  n.oeffneLink(link(anmeldung(), 'https://evil.example/x'));
  assert.equal((n.link() as any).code, 'nachricht_ruf');
  n.oeffneLink('yskar:login?msg=%%%');
  assert.equal((n.link() as any).code, 'nachricht_link');
  n.verwerfen();
  assert.equal(n.link(), null);
});

function ruf(port: number, pfad: string, opt: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; json: any }> {
  return new Promise((auf, ab) => {
    const req = request({ host: '127.0.0.1', port, path: pfad, method: opt.method ?? 'GET', headers: { host: `127.0.0.1:${port}`, ...(opt.headers ?? {}) } }, res => {
      let text = ''; res.on('data', c => { text += c; });
      res.on('end', () => { let json: any = null; try { json = JSON.parse(text); } catch { json = text; } auf({ status: res.statusCode ?? 0, json }); });
    });
    req.on('error', ab); if (opt.body !== undefined) req.write(opt.body); req.end();
  });
}

test('Schnittstelle: nur mit Zugangsschlüssel, Link erscheint im Status', async () => {
  const port = 19_820;
  const app = new NodeCoreApp({ params: REGTEST, guiPort: port, basis: ordner() });
  await app.startGui();
  const t = app.zugangFuerFenster();
  const POST = (pfad: string, wert: unknown = {}) => ruf(port, pfad, { method: 'POST', headers: { 'x-yskar-token': t, 'content-type': 'application/json' }, body: JSON.stringify(wert) });
  const GET = (pfad: string) => ruf(port, pfad, { headers: { 'x-yskar-token': t } });
  try {
    assert.equal((await ruf(port, '/api/wallet/nachricht/vorschau', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"x"}' })).status, 401);
    await POST('/api/wallet/anlegen', { woerter: WORTE, passwort: PW });
    const v = await POST('/api/wallet/nachricht/vorschau', { text: 'hallo' });
    assert.equal(v.json.art, 'text');
    const s = await POST('/api/wallet/nachricht/signieren', { text: 'hallo', passwort: PW });
    assert.equal(s.json.address, ADR);
    assert.equal((await POST('/api/wallet/nachricht/pruefen', { ergebnis: JSON.stringify(s.json) })).json.gueltig, true);
    const fremd = await POST('/api/wallet/nachricht/vorschau', { text: anmeldung('evil.example') });
    assert.equal(fremd.status, 400);
    assert.equal(fremd.json.code, 'nachricht_domain');
    assert.deepEqual(fremd.json.werte, ['evil.example']);

    assert.equal((await GET('/api/status')).json.link, null);
    app.oeffneYskarLink(link(anmeldung()));
    const st = (await GET('/api/status')).json;
    assert.equal(st.link.nr, 1);
    assert.equal((await GET('/api/wallet/link')).json.link.anmeldung.domain, 'lab.yskar.app');
    await POST('/api/wallet/link/verwerfen');
    assert.equal((await GET('/api/status')).json.link, null);
  } finally {
    await app.shutdown();
  }
});
