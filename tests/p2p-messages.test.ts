/**
 * Die Nachrichten des P2P-Protokolls.
 *
 * Geprüft wird nicht nur, dass gültige Nachrichten den Weg überstehen,
 * sondern vor allem, dass ungültige abgewiesen werden — jede Grenze
 * einzeln. Eine Nachricht von einem fremden Knoten ist Eingabe eines
 * Unbekannten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as M from '../src/lib/node/p2p/messages.ts';
import { MAINNET } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';

const hash = (n: number) => { const a = new Uint8Array(32); a[0] = n; return a; };

// ------------------------------------------------------------ Handschlag

test('version überlebt Hin- und Rückweg', () => {
  const v: M.Version = {
    protocol: M.PROTOCOL_VERSION,
    network: MAINNET.network,
    chainId: MAINNET.chainId,
    agent: 'yskar-node/0.1.0',
    height: 1099,
    chainWork: '76967472',
    nonce: 0x0123456789abcdefn,
    port: 8646,
    timestamp: 1788912000n,
  };
  const zurueck = M.decodeVersion(M.encodeVersion(v));
  assert.equal(zurueck.network, v.network);
  assert.equal(toHex(zurueck.chainId), toHex(v.chainId));
  assert.equal(zurueck.agent, v.agent);
  assert.equal(zurueck.height, v.height);
  assert.equal(zurueck.chainWork, v.chainWork);
  assert.equal(zurueck.nonce, v.nonce);
  assert.equal(zurueck.port, v.port);
});

test('Chain Work muss eine Zahl sein', () => {
  // Sonst landet fremder Text in einem BigInt-Aufruf und wirft dort, wo
  // niemand damit rechnet.
  const v: M.Version = {
    protocol: 1, network: 'x', chainId: MAINNET.chainId, agent: 'a',
    height: 1, chainWork: '12; drop table', nonce: 0n, port: 1, timestamp: 0n,
  };
  // Beim Verpacken geht es noch durch -- beim Auspacken nicht.
  assert.throws(() => M.decodeVersion(M.encodeVersion(v)), /keine Zahl/);
});

test('Eine übergroße Kennung wird abgewiesen', () => {
  const v: M.Version = {
    protocol: 1, network: 'x', chainId: MAINNET.chainId,
    agent: 'a'.repeat(M.MAX_AGENT + 1),
    height: 1, chainWork: '1', nonce: 0n, port: 1, timestamp: 0n,
  };
  assert.throws(() => M.encodeVersion(v), /zu lang/);
});

test('ping und pong tragen denselben Wert zurück', () => {
  // Ohne den Wert ließe sich nicht unterscheiden, auf welches ping ein
  // pong antwortet.
  const n = 0xdeadbeefcafe1234n;
  assert.equal(M.decodePing(M.encodePing(n)), n);
});

// ------------------------------------------------------- Kettenabgleich

test('getheaders trägt den Locator', () => {
  const g: M.GetHeaders = { locator: [hash(1), hash(2), hash(3)], stop: hash(9) };
  const z = M.decodeGetHeaders(M.encodeGetHeaders(g));
  assert.equal(z.locator.length, 3);
  assert.equal(toHex(z.locator[0]), toHex(hash(1)));
  assert.equal(toHex(z.stop), toHex(hash(9)));
});

test('Ein überlanger Locator wird abgewiesen', () => {
  const zuviel = Array.from({ length: M.MAX_LOCATOR + 1 }, (_, i) => hash(i));
  assert.throws(() => M.encodeGetHeaders({ locator: zuviel, stop: hash(0) }),
    /zu lang/);
});

test('headers trägt rohe 136-Byte-Header', () => {
  const h = [new Uint8Array(136).fill(1), new Uint8Array(136).fill(2)];
  const z = M.decodeHeaders(M.encodeHeaders(h));
  assert.equal(z.length, 2);
  assert.equal(z[0].length, 136);
  assert.equal(z[1][0], 2);
});

test('Ein Header mit falscher Länge wird abgewiesen', () => {
  // Der Header ist auf 136 Byte festgenagelt. Alles andere ist kein
  // YSKAR-Header, und die Prüfung gehört an die Leitung, nicht erst in die
  // Validierung.
  assert.throws(() => M.encodeHeaders([new Uint8Array(80)]), /statt 136/);
});

test('Zu viele Header werden abgewiesen', () => {
  const zuviel = Array.from({ length: M.MAX_HEADERS + 1 }, () => new Uint8Array(136));
  assert.throws(() => M.encodeHeaders(zuviel), /Zu viele/);
});

test('2000 Header passen in eine Nachricht', () => {
  // Rechnung hinter der Obergrenze: 2000 × 136 = 272 KB, deutlich unter
  // der Rahmengrenze von zwei Megabyte.
  const voll = Array.from({ length: M.MAX_HEADERS }, () => new Uint8Array(136));
  const roh = M.encodeHeaders(voll);
  assert.equal(roh.length, 2 + M.MAX_HEADERS * 136);
  assert.ok(roh.length < 2 * 1024 * 1024);
});

// ---------------------------------------------------------- Ankündigung

test('inv trägt Typ und Hash', () => {
  const e = [
    { typ: M.INV_BLOCK, hash: hash(1) },
    { typ: M.INV_TX, hash: hash(2) },
  ];
  const z = M.decodeInv(M.encodeInv(e));
  assert.equal(z.length, 2);
  assert.equal(z[0].typ, M.INV_BLOCK);
  assert.equal(toHex(z[1].hash), toHex(hash(2)));
});

test('Ein unbekannter inv-Typ wird abgewiesen', () => {
  const roh = M.encodeInv([{ typ: M.INV_BLOCK, hash: hash(1) }]);
  roh[2] = 99;
  assert.throws(() => M.decodeInv(roh), /Unbekannter Typ/);
});

test('Zu viele inv-Einträge werden abgewiesen', () => {
  const zuviel = Array.from({ length: M.MAX_INV + 1 },
    () => ({ typ: M.INV_BLOCK, hash: hash(0) }));
  assert.throws(() => M.encodeInv(zuviel), /Zu viele/);
});

// ---------------------------------------------------------------- Peers

test('addr trägt Host, Port und Zeitpunkt', () => {
  const liste: M.PeerAdresse[] = [
    { host: '192.0.2.10', port: 8646, gesehen: 1788912000n },
    { host: '2001:db8::1', port: 8646, gesehen: 1788912100n },
    { host: 'knoten.example', port: 9000, gesehen: 1788912200n },
  ];
  const z = M.decodeAddr(M.encodeAddr(liste));
  assert.equal(z.length, 3);
  // IPv4, IPv6 und Namen in derselben Form -- Bitcoin brauchte dafür vier.
  assert.equal(z[1].host, '2001:db8::1');
  assert.equal(z[2].host, 'knoten.example');
  assert.equal(z[0].port, 8646);
});

test('Port null wird abgewiesen', () => {
  const roh = M.encodeAddr([{ host: 'a', port: 1, gesehen: 0n }]);
  // Port auf null setzen: nach u16-Länge, u8-Hostlänge und einem Byte Host
  new DataView(roh.buffer).setUint32(2 + 1 + 1, 0, true);
  assert.throws(() => M.decodeAddr(roh), /Ungueltiger Port/);
});

test('Zu viele Adressen werden abgewiesen', () => {
  const zuviel = Array.from({ length: M.MAX_ADDR + 1 },
    () => ({ host: 'a', port: 1, gesehen: 0n }));
  assert.throws(() => M.encodeAddr(zuviel), /Zu viele/);
});

test('Derselbe Peer ergibt denselben Schlüssel', () => {
  assert.equal(M.peerKey({ host: 'Example.COM', port: 8646 }),
               M.peerKey({ host: 'example.com', port: 8646 }));
  assert.notEqual(M.peerKey({ host: 'a', port: 1 }),
                  M.peerKey({ host: 'a', port: 2 }));
});

// ------------------------------------------------------ Was NICHT drin ist

test('Keine Nachricht trägt eine Aussage über Gültigkeit', () => {
  // Die wichtigste Eigenschaft des Protokolls, und sie lässt sich nur so
  // prüfen: Es gibt kein Feld, dem man glauben könnte. Ein Peer liefert
  // Daten; ob sie gelten, entscheidet der eigene Knoten.
  const quelle = readFileSync(
    new URL('../src/lib/node/p2p/messages.ts', import.meta.url), 'utf8');
  for (const verboten of ['valid:', 'accepted:', 'isValid', 'trusted']) {
    assert.ok(!quelle.includes(verboten),
      `Das Protokoll enthält ein Feld "${verboten}" — dem würde jemand glauben`);
  }
});
