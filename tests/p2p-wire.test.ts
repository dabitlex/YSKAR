/**
 * P2P-Rahmung.
 *
 * Aufgebaut wie Bitcoins Nachrichtenkopf. Geprüft wird vor allem, was
 * passiert, wenn die Gegenseite sich NICHT an das Protokoll hält — denn
 * genau dafür ist die Rahmung da.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeFrame, decodeFrame, FrameReader, magicFor,
  HEADER_SIZE, MAX_PAYLOAD, COMMANDS,
} from '../src/lib/node/p2p/wire.ts';
import { MAINNET, REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { sha256d } from '../src/lib/core/hash.ts';

const M = magicFor(MAINNET.chainId);
const text = (s: string) => new TextEncoder().encode(s);

// ------------------------------------------------------------- Grundlagen

test('Eine Nachricht überlebt Hin- und Rückweg', () => {
  const nutzlast = text('hallo');
  const roh = encodeFrame(M, 'ping', nutzlast);
  assert.equal(roh.length, HEADER_SIZE + 5);

  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'frame');
  if (r.t !== 'frame') return;
  assert.equal(r.frame.command, 'ping');
  assert.equal(toHex(r.frame.payload), toHex(nutzlast));
  assert.equal(r.verbraucht, roh.length);
});

test('Der Kopf hat genau den Aufbau von Bitcoin', () => {
  const nutzlast = text('xy');
  const roh = encodeFrame(M, 'verack', nutzlast);

  // magic(4) | command(12) | length(4) | checksum(4)
  assert.equal(toHex(roh.slice(0, 4)), toHex(M));
  assert.equal(String.fromCharCode(...roh.slice(4, 10)), 'verack');
  // Hinter dem Befehl nur Nullbytes.
  for (let i = 10; i < 16; i++) assert.equal(roh[i], 0, `Byte ${i} nicht gefüllt`);
  const dv = new DataView(roh.buffer);
  assert.equal(dv.getUint32(16, true), 2, 'Länge little-endian');
  assert.equal(toHex(roh.slice(20, 24)), toHex(sha256d(nutzlast).slice(0, 4)));
});

test('Eine leere Nutzlast ist zulässig', () => {
  // verack und getaddr tragen nichts.
  const roh = encodeFrame(M, 'verack', new Uint8Array(0));
  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'frame');
  if (r.t === 'frame') assert.equal(r.frame.payload.length, 0);
});

// ------------------------------------------------- Netztrennung

test('Ein fremdes Netz kommt nicht durch', () => {
  // Das ist der Zweck der Magic-Bytes: Testnetz und Mainnet können gar
  // nicht erst miteinander reden.
  const roh = encodeFrame(magicFor(REGTEST.chainId), 'ping', new Uint8Array(0));
  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'fehler');
  if (r.t === 'fehler') assert.equal(r.grund, 'falsches_netz');
});

test('Die Magic-Bytes der Netze unterscheiden sich', () => {
  assert.notEqual(toHex(magicFor(MAINNET.chainId)), toHex(magicFor(REGTEST.chainId)));
});

// --------------------------------------------------- Fehlverhalten

test('Eine angekündigte Riesenlänge wird abgewiesen, bevor gelesen wird', () => {
  // Der wichtigste Test: Hier würde ein Angreifer sonst beliebig viel
  // Speicher binden — eine riesige Länge angeben und die Daten nie
  // schicken.
  const roh = new Uint8Array(HEADER_SIZE);
  roh.set(M, 0);
  roh.set(text('block'), 4);
  new DataView(roh.buffer).setUint32(16, 0xffffffff, true);

  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'fehler');
  if (r.t === 'fehler') assert.match(r.grund, /zu_gross/);
});

test('Eine verfälschte Nutzlast fällt auf', () => {
  const roh = encodeFrame(M, 'ping', text('acht_byt'));
  roh[HEADER_SIZE] ^= 0x01;
  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'fehler');
  if (r.t === 'fehler') assert.equal(r.grund, 'pruefsumme');
});

test('Ein unbekannter Befehl wird abgewiesen', () => {
  const roh = encodeFrame(M, 'ping', new Uint8Array(0));
  // "ping" durch "pong2" ersetzen -- steht nicht auf der Positivliste.
  roh.set(text('pong2'), 4);
  roh[9] = 0;
  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'fehler');
  if (r.t === 'fehler') assert.match(r.grund, /befehl_unbekannt/);
});

test('Ein Befehl mit Müll hinter dem Nullbyte wird abgewiesen', () => {
  // Sonst ließen sich zwei verschiedene Bytefolgen als derselbe Befehl
  // lesen -- und Daten unbemerkt durchschmuggeln.
  const roh = encodeFrame(M, 'ping', new Uint8Array(0));
  roh[4 + 8] = 0x41;
  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'fehler');
  if (r.t === 'fehler') assert.equal(r.grund, 'befehl_nicht_gefuellt');
});

test('Nicht druckbare Zeichen im Befehl werden abgewiesen', () => {
  const roh = encodeFrame(M, 'ping', new Uint8Array(0));
  roh[4] = 0x01;
  const r = decodeFrame(roh, M);
  assert.equal(r.t, 'fehler');
  if (r.t === 'fehler') assert.equal(r.grund, 'befehl_unlesbar');
});

test('Zu große Nutzlast lässt sich gar nicht erst verpacken', () => {
  assert.throws(() => encodeFrame(M, 'block', new Uint8Array(MAX_PAYLOAD + 1)),
    /ueberschreitet/);
});

// ------------------------------------------------- TCP kennt keine Grenzen

test('Eine Nachricht in Stücken wird zusammengesetzt', () => {
  // TCP liefert Bytes, keine Nachrichten. Was als eine gesendet wurde,
  // kommt womöglich in drei Stücken an.
  const roh = encodeFrame(M, 'ping', text('ein langer text zum stueckeln'));
  const leser = new FrameReader(M);

  let gesamt = 0;
  for (let i = 0; i < roh.length; i += 7) {
    const r = leser.push(roh.slice(i, i + 7));
    assert.equal(r.fehler, undefined);
    gesamt += r.frames.length;
  }
  assert.equal(gesamt, 1, 'genau eine Nachricht, am Ende');
  assert.equal(leser.size(), 0, 'nichts bleibt liegen');
});

test('Mehrere Nachrichten in einem Stück werden alle gelesen', () => {
  const a = encodeFrame(M, 'ping', text('a'));
  const b = encodeFrame(M, 'pong', text('b'));
  const c = encodeFrame(M, 'getaddr', new Uint8Array(0));
  const zusammen = new Uint8Array(a.length + b.length + c.length);
  zusammen.set(a, 0); zusammen.set(b, a.length); zusammen.set(c, a.length + b.length);

  const leser = new FrameReader(M);
  const r = leser.push(zusammen);
  assert.equal(r.frames.length, 3);
  assert.deepEqual(r.frames.map(f => f.command), ['ping', 'pong', 'getaddr']);
  assert.equal(leser.size(), 0);
});

test('Ein Byte nach dem anderen funktioniert auch', () => {
  const roh = encodeFrame(M, 'verack', new Uint8Array(0));
  const leser = new FrameReader(M);
  let n = 0;
  for (const byte of roh) n += leser.push(new Uint8Array([byte])).frames.length;
  assert.equal(n, 1);
});

test('Nach einem Fehler wird der Puffer verworfen', () => {
  // Was nach einem Versatz im Strom kommt, ist nicht mehr einzuordnen.
  // Weiterzulesen hieße raten.
  const gut = encodeFrame(M, 'ping', text('gut'));
  const kaputt = encodeFrame(M, 'ping', text('kaputt'));
  kaputt[HEADER_SIZE] ^= 0xff;

  const zusammen = new Uint8Array(gut.length + kaputt.length);
  zusammen.set(gut, 0); zusammen.set(kaputt, gut.length);

  const leser = new FrameReader(M);
  const r = leser.push(zusammen);
  assert.equal(r.frames.length, 1, 'die gute kam noch durch');
  assert.equal(r.fehler, 'pruefsumme');
  assert.equal(leser.size(), 0);
});

test('Der Puffer wächst nicht über eine angekündigte Riesenlänge', () => {
  const kopf = new Uint8Array(HEADER_SIZE);
  kopf.set(M, 0);
  kopf.set(text('block'), 4);
  new DataView(kopf.buffer).setUint32(16, MAX_PAYLOAD + 1, true);

  const leser = new FrameReader(M);
  const r = leser.push(kopf);
  assert.match(String(r.fehler), /zu_gross/);
  assert.equal(leser.size(), 0, 'nichts wurde gepuffert');
});

test('Alle Befehle passen in zwölf Byte', () => {
  for (const c of COMMANDS) {
    assert.ok(c.length <= 12, `${c} ist zu lang`);
    assert.match(c, /^[a-z]+$/, `${c} enthält ungewöhnliche Zeichen`);
  }
});
