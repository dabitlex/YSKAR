/**
 * Signierte Nachrichten (src/lib/core/signedMessage.ts): das Format, das
 * YSKAR Wallet, Node Core, Full Node und YSKAR Lab gemeinsam haben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';

import * as N from '../src/lib/core/signedMessage.ts';
import { addressFor, addressFromPublicKey } from '../src/lib/core/address.ts';
import { toHex } from '../src/lib/core/codec.ts';
import type { Keypair } from '../src/lib/core/wallet.ts';

// Alice aus docs/CONSENSUS_V6.md: rohes Ed25519-Geheimnis 32 × 0x11.
function paar(b: number): Keypair {
  const privateKey = new Uint8Array(32).fill(b);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey, address: addressFor(publicKey), addressRaw: addressFromPublicKey(publicKey), path: '' };
}
const ALICE = paar(0x11);
const jetzt = new Date('2026-11-02T11:50:00Z');
const anmeldung = (over: Partial<N.Anmeldung> = {}) => N.baueAnmeldung({
  domain: 'lab.yskar.app', address: ALICE.address, nonce: '0123456789abcdef0123456789abcdef',
  issued: '2026-11-02T11:50:00Z', expires: '2026-11-02T12:00:00Z', ...over,
});

test('Alice-Adresse wie in der Spezifikation', () => {
  assert.equal(ALICE.address, 'ysr1zzaxsty26y6389c73dtgsx4t30ts9wuq55e0fh');
});

test('Anmeldung: genau das vereinbarte Format', () => {
  assert.equal(anmeldung(),
    'YSKAR Signed Message\npurpose: login\ndomain: lab.yskar.app\n' +
    'address: ysr1zzaxsty26y6389c73dtgsx4t30ts9wuq55e0fh\nnonce: 0123456789abcdef0123456789abcdef\n' +
    'issued: 2026-11-02T11:50:00Z\nexpires: 2026-11-02T12:00:00Z');
  const n = N.lies(anmeldung());
  assert.equal(n.art, 'login');
});

test('Lesen ist streng: Zeilenende, Reihenfolge, Leerzeichen, Zweck', () => {
  const m = anmeldung();
  assert.throws(() => N.lies(m.replace(/\n/g, '\r\n')), { code: 'zeilenende' });
  assert.throws(() => N.lies(m + '\n'), { code: 'format' });
  assert.throws(() => N.lies(m.replace('domain: lab.yskar.app', 'domain: lab.yskar.app ')), { code: 'format' });
  assert.throws(() => N.lies(m.replace('purpose: login', 'purpose: pay')), { code: 'zweck' });
  assert.throws(() => N.lies('Hallo'), { code: 'kopf' });
  const z = m.split('\n'); [z[2], z[3]] = [z[3], z[2]];
  assert.throws(() => N.lies(z.join('\n')), { code: 'format' });
  assert.throws(() => N.lies(anmeldung({ address: 'ysr1pdrxef4yzmkz4wklhfu5yqrh68nxd5natshha6t9cqhg24a06rvsq74ljqn' })), { code: 'format' });
});

test('Vorbereiten: Text bekommt die Kopfzeile, die Wallet sieht den ganzen Text', () => {
  const v = N.vorbereiten('Ich betreibe den Pool GOZERO.', ALICE.address, jetzt);
  assert.equal(v.nachricht, 'YSKAR Signed Message\npurpose: text\n\nIch betreibe den Pool GOZERO.');
  assert.throws(() => N.vorbereiten('   ', ALICE.address, jetzt), { code: 'leer' });
  assert.throws(() => N.vorbereiten('x'.repeat(5000), ALICE.address, jetzt), { code: 'zu_lang' });
});

test('Vorbereiten: Regeln für Anmeldungen', () => {
  const ok = N.vorbereiten(anmeldung(), ALICE.address, jetzt);
  assert.equal(ok.inhalt.art, 'login');
  assert.throws(() => N.vorbereiten(anmeldung({ domain: 'yskar-login.example' }), ALICE.address, jetzt), { code: 'domain' });
  assert.throws(() => N.vorbereiten(anmeldung({ domain: 'evilyskar.app' }), ALICE.address, jetzt), { code: 'domain' });
  assert.ok(N.vorbereiten(anmeldung({ domain: 'yskar.app' }), ALICE.address, jetzt));
  assert.throws(() => N.vorbereiten(anmeldung(), paar(0x22).address, jetzt), { code: 'adresse' });
  assert.throws(() => N.vorbereiten(anmeldung(), ALICE.address, new Date('2026-11-02T12:00:00Z')), { code: 'abgelaufen' });
  assert.throws(() => N.vorbereiten(anmeldung({ expires: '2026-11-02T12:10:01Z' }), ALICE.address, jetzt), { code: 'zu_lange' });
  assert.throws(() => N.vorbereiten(anmeldung({ issued: '2026-11-02T11:59:00Z' }), ALICE.address, new Date('2026-11-02T11:50:00Z')), { code: 'zeit' });
});

test('Unterschreiben und Prüfen, auch gegen unabhängiges Ed25519', () => {
  const s = N.unterschreibe(anmeldung(), ALICE);
  assert.equal(s.address, ALICE.address);
  assert.equal(s.publicKey, toHex(ALICE.publicKey));
  // Unabhaengige Gegenprobe: rohe UTF-8-Bytes, ohne weiteres Hashen.
  assert.ok(ed25519.verify(Buffer.from(s.signature, 'hex'), new TextEncoder().encode(s.message), ALICE.publicKey));
  const p = N.pruefe(s);
  assert.equal(p.gueltig, true);
  assert.deepEqual(N.pruefe({ ...s, message: s.message.replace('12:00:00Z', '12:05:00Z') }).gueltig, false);
  const fremd = N.unterschreibe(anmeldung(), paar(0x22));
  assert.equal((N.pruefe({ ...fremd, address: ALICE.address }) as { grund: string }).grund, 'schluessel');
  assert.equal((N.pruefe(fremd) as { grund: string }).grund, 'adresse');
  assert.throws(() => N.unterschreibe('Kein Kopf', ALICE), { code: 'kopf' });
});

test('Ergebnis einlesen: JSON wie aus der Wallet', () => {
  const s = N.unterschreibe(N.baueText('hallo'), ALICE);
  assert.deepEqual(N.liesErgebnis(`  ${JSON.stringify(s)}\n`), s);
  assert.equal(N.liesErgebnis('kein json'), null);
});

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

test('Link: Rückruf muss https auf genau der Domain sein', () => {
  const m = anmeldung();
  const ok = N.liesLink(`yskar:login?msg=${b64(m)}&cb=${b64('https://lab.yskar.app/api/auth/qr/abc')}`);
  assert.equal(ok.nachricht, m);
  for (const cb of ['http://lab.yskar.app/x', 'https://lab.yskar.app:8443/x', 'https://evil.example/x', 'https://user:pw@lab.yskar.app/x', 'nicht-url']) {
    assert.throws(() => N.liesLink(`yskar:login?msg=${b64(m)}&cb=${b64(cb)}`), { code: 'ruf' }, cb);
  }
  const fremd = anmeldung({ domain: 'evil.example' });
  assert.throws(() => N.liesLink(`yskar:login?msg=${b64(fremd)}&cb=${b64('https://evil.example/x')}`), { code: 'domain' });
  assert.throws(() => N.liesLink('https://lab.yskar.app'), { code: 'link' });
  assert.throws(() => N.liesLink(`yskar:login?msg=${b64(N.baueText('x'))}&cb=${b64('https://lab.yskar.app/x')}`), { code: 'link' });
});

test('Rückruf: vereinbarte Antworten', async () => {
  const s = N.unterschreibe(anmeldung(), ALICE);
  const antwort = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  assert.deepEqual(await N.sendeAnRuf('https://lab.yskar.app/x', s, antwort(200, { ok: true })), { ok: true, text: '' });
  assert.deepEqual(await N.sendeAnRuf('https://lab.yskar.app/x', s, antwort(400, { ok: false, error: 'This sign-in code was already used.' })),
    { ok: false, text: 'This sign-in code was already used.' });
  assert.equal((await N.sendeAnRuf('https://lab.yskar.app/x', s, antwort(302, {}))).ok, false);
  assert.equal((await N.sendeAnRuf('https://lab.yskar.app/x', s, antwort(200, { ok: 'yes' }))).ok, false);
  const lang = await N.sendeAnRuf('https://lab.yskar.app/x', s, antwort(400, { ok: false, error: 'x'.repeat(500) }));
  assert.equal(lang.text.length, 200);
  const weg = await N.sendeAnRuf('https://lab.yskar.app/x', s, (async () => { throw new Error('offline'); }) as typeof fetch);
  assert.equal(weg.ok, false);
});
