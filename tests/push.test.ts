/**
 * Push: Ereignisse aus Bloecken und Mempool, und das Dienstkonto-JWT.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';

import { ausBlock, ausMempool, ausNews, type Geraet } from '../src/lib/push/ereignisse.ts';
import { dienstJwt, Fcm } from '../src/lib/push/fcm.ts';

const A = 'ysr1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'ysr1qbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const GERAETE: Geraet[] = [
  { token: 'tok-a1', address: A },
  { token: 'tok-a2', address: A },
  { token: 'tok-b', address: B },
];

test('Block: Eingang meldet nur den Empfänger, je Gerät einmal', () => {
  const e = ausBlock({ height: 2188, txs: [
    { txid: 'aa', type: 'transfer', from: B, to: A, amount: '2500000000', recipients: null },
    { txid: 'bb', type: 'transfer', from: A, to: 'ysr1qcccc', amount: '100', recipients: null },
  ] }, GERAETE);
  assert.equal(e.length, 2, 'zwei Geräte von A, keins von B (B hat gesendet)');
  assert.deepEqual(e.map(x => x.token).sort(), ['tok-a1', 'tok-a2']);
  assert.equal(e[0].schluessel, 'ok:aa');
  assert.match(e[0].nachricht.titel, /25,0000 YSR erhalten/);
  assert.match(e[0].nachricht.text, /#2\.188/);
});

test('Block: Solo-Fund und Pool-Anteil', () => {
  const solo = ausBlock({ height: 5, txs: [
    { txid: 'cb', type: 'coinbase', from: null, to: B, amount: '87500000000', recipients: null },
  ] }, GERAETE);
  assert.equal(solo.length, 1);
  assert.equal(solo[0].token, 'tok-b');
  assert.match(solo[0].nachricht.titel, /Block #5 gefunden/);

  const pool = ausBlock({ height: 6, txs: [
    { txid: 'cb', type: 'coinbase', from: null, to: null, amount: '87500000000',
      recipients: [{ address: A, amount: '60000000000' }, { address: 'ysr1qzzz', amount: '27500000000' }] },
  ] }, GERAETE);
  assert.equal(pool.length, 2);
  assert.match(pool[0].nachricht.titel, /Pool-Anteil/);
  assert.match(pool[0].nachricht.text, /600,0000 YSR/);
  assert.equal(pool[0].schluessel, 'block:6');
});

test('Mempool: nur eingehende, nur für die Adresse', () => {
  const e = ausMempool(A, [
    { txid: 'x1', kind: 'in', from: B, amount: '100000000' },
    { txid: 'x2', kind: 'out', from: A, amount: '100000000' },
  ], GERAETE);
  assert.equal(e.length, 2);
  assert.equal(e[0].schluessel, 'in:x1');
  assert.match(e[0].nachricht.titel, /1,0000 YSR unterwegs/);
  assert.equal(ausMempool('ysr1qniemand', [{ txid: 'x', kind: 'in', from: B, amount: '1' }], GERAETE).length, 0);
});

test('News: an jedes Gerät einmal, Text gekürzt', () => {
  const e = ausNews({ id: 7, titel: 'T', text: 'x'.repeat(200) }, [...GERAETE, GERAETE[0]]);
  assert.equal(e.length, 3);
  assert.equal(e[0].schluessel, 'news:7');
  assert.equal(e[0].nachricht.text.length, 158);  // 157 Zeichen + Auslassungspunkt
  assert.equal(e[0].nachricht.kanal, 'news');
});

test('FCM: das Dienstkonto-JWT ist mit dem Schlüssel verifizierbar', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const jwt = dienstJwt({ project_id: 'p', client_email: 'w@p.iam', private_key: pem }, 1_700_000_000);
  const [k, r, s] = jwt.split('.');
  const v = createVerify('RSA-SHA256'); v.update(`${k}.${r}`);
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  assert.ok(v.verify(publicKey, sig));
  const rumpf = JSON.parse(Buffer.from(r, 'base64').toString());
  assert.equal(rumpf.iss, 'w@p.iam');
  assert.equal(rumpf.exp - rumpf.iat, 3600);
  assert.match(rumpf.scope, /firebase\.messaging/);
});

test('FCM: totes Token wird als ungültig erkannt', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const antworten: Response[] = [
    new Response(JSON.stringify({ access_token: 'zz', expires_in: 3600 }), { status: 200 }),
    new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'Requested entity was not found.' } }), { status: 404 }),
  ];
  const f = new Fcm({ project_id: 'p', client_email: 'w@p.iam', private_key: pem },
                    (async () => antworten.shift()!) as unknown as typeof fetch);
  const r = await f.senden('tot', { titel: 't', text: 'x' });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 404); assert.equal(r.ungueltig, true); }
});
