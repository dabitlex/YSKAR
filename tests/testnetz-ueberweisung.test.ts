/**
 * Testnetz-Ueberweisungen (cli: testkonto, ueberweisen) fuer den
 * Uebergangstest von CONSENSUS_V6.md 14.
 *
 * Geprueft wird, was das Werkzeug verspricht: nur im Testnetz, ein
 * vorhandener Schluessel wird nie ueberschrieben, die Fassung richtet sich
 * nach der Hoehe des naechsten Blocks (oder wird erzwungen), signiert wird
 * mit der Chain-ID des Testnetzes, und die Nonce kommt vom Knoten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import {
  testkonto, ueberweise, ysrInEinheiten, einheitenInYsr, TEST_GEBUEHR,
} from '../src/lib/node/fullnode/testnetzUeberweisung.ts';
import { REGTEST, regtestMitV6 } from '../src/lib/core/networks.ts';
import { deserializeTx, sighash, type Transfer } from '../src/lib/core/tx.ts';
import { verifySignature } from '../src/lib/core/wallet.ts';
import { fromHex, toHex } from '../src/lib/core/codec.ts';
import { UNIT } from '../src/lib/core/params.ts';

const CLI = new URL('../src/lib/node/fullnode/cli.ts', import.meta.url).pathname;
const EMPF = 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw';

test('Betraege: YSR <-> Einheiten', () => {
  assert.equal(ysrInEinheiten('1'), UNIT);
  assert.equal(ysrInEinheiten('0.5'), UNIT / 2n);
  assert.equal(ysrInEinheiten('0,001'), 100_000n);
  assert.equal(ysrInEinheiten('12.00000001'), 12n * UNIT + 1n);
  for (const falsch of ['', '-1', '1.123456789', 'abc', '1e3']) {
    assert.throws(() => ysrInEinheiten(falsch), /kein Betrag/, falsch);
  }
  assert.equal(einheitenInYsr(150_000_000n), '1.5');
  assert.equal(einheitenInYsr(4375n * UNIT), '4375');
});

test('testkonto: legt an, liest wieder, ueberschreibt nie', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'yskar-testkonto-'));
  try {
    const datei = join(ordner, 'k.json');
    const a = testkonto(datei);
    assert.equal(a.neu, true);
    assert.match(a.schluessel.address, /^ysr1/);
    const inhalt = readFileSync(datei, 'utf8');
    const b = testkonto(datei);
    assert.equal(b.neu, false);
    assert.equal(b.schluessel.address, a.schluessel.address);
    assert.equal(readFileSync(datei, 'utf8'), inhalt, 'Datei unveraendert');
  } finally { rmSync(ordner, { recursive: true, force: true }); }
});

/** Ein Knoten zum Schein: /status, /account, /tx. Merkt sich, was gesendet wurde. */
async function scheinknoten(hoehe: number, nextNonce: string) {
  const gesendet: string[] = [];
  const srv = createServer((req, res) => {
    const url = req.url ?? '';
    const antwort = (o: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (url === '/api/v2/status') return antwort({ network: REGTEST.network, height: hoehe });
    if (url.startsWith('/api/v2/account/')) return antwort({ balance: String(100n * UNIT), nonce: '0', nextNonce });
    if (url === '/api/v2/tx' && req.method === 'POST') {
      let roh = '';
      req.on('data', c => { roh += c; });
      req.on('end', () => { gesendet.push(JSON.parse(roh).raw); antwort({ accepted: true }); });
      return;
    }
    res.statusCode = 404; antwort({ error: 'not_found' });
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  return { api: `http://127.0.0.1:${port}`, gesendet, zu: () => new Promise(r => srv.close(r)) };
}

test('ueberweisen: Fassung nach Hoehe des naechsten Blocks, Testnetz-Chain-ID, Nonce vom Knoten', async () => {
  const ordner = mkdtempSync(join(tmpdir(), 'yskar-ueberw-'));
  try {
    const { schluessel } = testkonto(join(ordner, 'k.json'));
    const P = regtestMitV6(12);
    const faelle: [number, number | undefined, number][] = [
      [10, undefined, 1],   // naechster Block 11: alte Regeln
      [11, undefined, 2],   // naechster Block 12: Fassung 6
      [10, 2, 2],           // erzwungen
      [11, 1, 1],           // erzwungen
    ];
    for (const [hoehe, erzwungen, erwartet] of faelle) {
      const k = await scheinknoten(hoehe, '7');
      const r = await ueberweise({ api: k.api, schluessel, an: EMPF, betrag: 5n * UNIT, fassung: erzwungen, params: P });
      await k.zu();
      assert.equal(r.fassung, erwartet, `Hoehe ${hoehe}, erzwungen ${erzwungen}`);
      assert.equal(k.gesendet.length, 1);
      const tx = deserializeTx(fromHex(k.gesendet[0])) as Transfer;
      assert.equal(tx.version, erwartet);
      assert.equal(tx.nonce, 7n, 'Nonce vom Knoten (nextNonce)');
      assert.equal(tx.amount, 5n * UNIT);
      assert.equal(tx.fee, TEST_GEBUEHR);
      assert.equal(toHex(tx.from), toHex(schluessel.addressRaw));
      // Signiert mit der Chain-ID des Testnetzes -- nicht mit der des Mainnets.
      assert.ok(verifySignature(tx.signature, sighash(tx, REGTEST.chainId), tx.publicKey));
      assert.equal(verifySignature(tx.signature, sighash(tx), tx.publicKey), false);
    }
    // Ohne --v6-height (gewoehnliches Testnetz): immer Fassung 1.
    const k = await scheinknoten(500, '0');
    const r = await ueberweise({ api: k.api, schluessel, an: EMPF, betrag: 1n, params: REGTEST });
    await k.zu();
    assert.equal(r.fassung, 1);
  } finally { rmSync(ordner, { recursive: true, force: true }); }
});

test('ueberweisen: ein Knoten eines anderen Netzes bekommt nichts', async () => {
  const ordner = mkdtempSync(join(tmpdir(), 'yskar-ueberw-'));
  const gesendet: string[] = [];
  const srv = createServer((req, res) => {
    if (req.url === '/api/v2/tx') gesendet.push('x');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ network: 'yskar-main-1', height: 5 }));
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  try {
    const { schluessel } = testkonto(join(ordner, 'k.json'));
    const api = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    await assert.rejects(
      ueberweise({ api, schluessel, an: EMPF, betrag: 1n, params: REGTEST }),
      /gehoert zu "yskar-main-1"/);
    assert.deepEqual(gesendet, []);
  } finally {
    await new Promise(r => srv.close(r));
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('cli: testkonto und ueberweisen nur mit --regtest', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'yskar-ueberw-cli-'));
  try {
    for (const befehl of ['testkonto', 'ueberweisen']) {
      const r = spawnSync(process.execPath,
        ['--experimental-strip-types', CLI, befehl, '--key', join(ordner, 'k.json'), '--to', EMPF, '--amount', '1'],
        { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NO_COLOR: '1' } });
      assert.equal(r.status, 1, befehl);
      assert.match(`${r.stdout}${r.stderr}`, /nur zusammen mit --regtest/, befehl);
    }
    // Und es wurde kein Schluessel angelegt.
    assert.throws(() => readFileSync(join(ordner, 'k.json')));
  } finally { rmSync(ordner, { recursive: true, force: true }); }
});
