/**
 * Phase 1 "Knotennetz": gespeichertes Adressbuch, gehoert/geprueft mit
 * Erreichbarkeitsprobe, getaddr im Takt, Streuung der ausgehenden
 * Verbindungen, Lauschen auf IPv4 und IPv6 mit Rueckfall.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

import { PeerManager, MAX_BUCH, BUCH_FORMAT, type NetzOptionen } from '../src/lib/node/p2p/PeerManager.ts';
import { normalisiereHost } from '../src/lib/node/fassung.ts';
import { HAUPTNETZ_SEEDS } from '../src/lib/node/p2p/seeds.ts';
import { REGTEST } from '../src/lib/core/networks.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
let port = 19600;
const naechsterPort = () => port++;
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-p1-'));

/** Hat dieses System IPv6? (Die Testumgebung der Entwicklung hatte keins.) */
const mitIpv6 = await new Promise<boolean>(auf => {
  const s = createServer();
  s.once('error', () => auf(false));
  s.listen({ port: 0, host: '::1' }, () => { s.close(); auf(true); });
});

function knoten(opt: Partial<NetzOptionen> & { port?: number } = {}) {
  const { port: p, ...rest } = opt;
  return new PeerManager({
    params: REGTEST, agent: 'test/1',
    listenPort: p ?? 0, host: '127.0.0.1',
    kette: () => ({ height: 1, chainWork: 100n }),
    takte: { verbindeMs: 150, getaddrMs: 60_000, probeAbstandMs: 60_000 },
    ...rest,
  });
}

// ------------------------------------------------------------ Adressbuch

test('Normalisieren: IPv4 in IPv6 wird IPv4, alles andere bleibt (klein)', () => {
  assert.equal(normalisiereHost('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(normalisiereHost('::FFFF:198.51.100.1'), '198.51.100.1');
  assert.equal(normalisiereHost('2003:D4::1'), '2003:d4::1');
  assert.equal(normalisiereHost('pool.yskar.app'), 'pool.yskar.app');
  assert.equal(normalisiereHost('::ffff:kaputt'), '::ffff:kaputt');
});

test('Die eingebaute Seed-Liste: zwei verschiedene Rechner, Form host:port', () => {
  assert.deepEqual([...HAUPTNETZ_SEEDS], ['pool.yskar.app:8646', 'yskar-seed2.dynv6.net:8646']);
});

test('Das Adressbuch wird beim Beenden gesichert und beim Start geladen', async () => {
  const d = ordner();
  const datei = join(d, 'peers.json');
  try {
    const pA = naechsterPort();
    const a = knoten({ port: pA });
    await a.start();
    const b = knoten({ port: naechsterPort(), buchDatei: datei, seeds: [{ host: '127.0.0.1', port: pA }] });
    await b.start();
    await warte(400);
    await b.stop();
    await a.stop();
    assert.ok(existsSync(datei));
    const inhalt = JSON.parse(readFileSync(datei, 'utf8'));
    assert.equal(inhalt.format, BUCH_FORMAT);
    assert.equal(inhalt.network, REGTEST.network);
    const eintrag = inhalt.eintraege.find((e: { port: number }) => e.port === pA);
    assert.ok(eintrag, 'A steht im gesicherten Buch');
    assert.equal(eintrag.geprueft, true, 'A wurde ausgehend erreicht -- also geprueft');

    const neu = knoten({ buchDatei: datei });
    assert.ok(neu.buchGroesse() >= 1);
    assert.equal(neu.netzStand().verified >= 1, true);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('Messziel Phase 1: Neustart ohne erreichbaren Seed fuehrt trotzdem zu Peers', async () => {
  const d = ordner();
  const datei = join(d, 'peers.json');
  try {
    const pA = naechsterPort(), pB = naechsterPort(), pC = naechsterPort();
    const a = knoten({ port: pA });
    const c = knoten({ port: pC, seeds: [{ host: '127.0.0.1', port: pA }] });
    await a.start(); await c.start();
    await warte(300);
    const b = knoten({ port: pB, buchDatei: datei, seeds: [{ host: '127.0.0.1', port: pA }] });
    await b.start();
    await warte(800);
    assert.ok(b.buchSchluessel().includes(`127.0.0.1:${pC}`), `B kennt C nicht: ${b.buchSchluessel().join(', ')}`);
    await b.stop();

    // Der Seed A ist weg. B startet neu -- mit demselben Buch.
    await a.stop();
    const b2 = knoten({ port: pB, buchDatei: datei, seeds: [{ host: '127.0.0.1', port: pA }] });
    await b2.start();
    for (let i = 0; i < 40 && b2.zahlAus() === 0; i++) await warte(100);
    assert.equal(b2.zahlAus(), 1, 'B hat ohne Seed zu C gefunden');
    assert.equal(b2.alle()[0].info().listenPort, pC);
    await b2.stop(); await c.stop();
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('Eine kaputte Datei blockiert den Start nicht und wird beiseitegelegt', async () => {
  const d = ordner();
  const datei = join(d, 'peers.json');
  try {
    writeFileSync(datei, '{kaputt');
    const meldungen: string[] = [];
    const b = knoten({ buchDatei: datei, seeds: [{ host: '127.0.0.1', port: 1 }], onLog: t => meldungen.push(t) });
    assert.equal(b.buchGroesse(), 1, 'nur der Seed');
    assert.ok(existsSync(`${datei}.unlesbar`));
    assert.ok(meldungen.some(m => m.includes('address book not loaded')));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('Beim Laden wird geprueft wie bei addr: Alter, Zukunft, Host, Netz, Obergrenze', () => {
  const d = ordner();
  const datei = join(d, 'peers.json');
  try {
    const jetzt = Date.now();
    const eintraege = [
      { host: '203.0.113.1', port: 8646, gesehen: jetzt - 1000, fehlversuche: 9, geprueft: true },
      { host: '203.0.113.2', port: 8646, gesehen: jetzt - 8 * 24 * 3600_000, fehlversuche: 0, geprueft: true },
      { host: '203.0.113.3', port: 8646, gesehen: jetzt + 3600_000, fehlversuche: 0, geprueft: false },
      { host: 'boese host!', port: 8646, gesehen: jetzt, fehlversuche: 0, geprueft: false },
      { host: '203.0.113.4', port: 0, gesehen: jetzt, fehlversuche: 0, geprueft: false },
      { host: '203.0.113.5', port: 8646, gesehen: jetzt, fehlversuche: 0, geprueft: false },
    ];
    writeFileSync(datei, JSON.stringify({ format: BUCH_FORMAT, network: REGTEST.network, gesichert: jetzt,
      eintraege, selbst: ['203.0.113.5:8646'] }));
    const b = knoten({ buchDatei: datei });
    assert.deepEqual(b.buchSchluessel().sort(), ['203.0.113.1:8646']);
    assert.deepEqual(b.eigeneAdressen(), ['203.0.113.5:8646']);

    // Anderes Netz: nichts wird uebernommen.
    writeFileSync(datei, JSON.stringify({ format: BUCH_FORMAT, network: 'yskar-main-1', gesichert: jetzt,
      eintraege: [eintraege[0]], selbst: [] }));
    assert.equal(knoten({ buchDatei: datei }).buchGroesse(), 0);

    // Obergrenze: die juengsten MAX_BUCH.
    const viele = Array.from({ length: MAX_BUCH + 200 }, (_, i) => ({
      host: `10.${(i >> 8) & 255}.${i & 255}.1`, port: 8646, gesehen: jetzt - i * 1000, fehlversuche: 0, geprueft: false }));
    writeFileSync(datei, JSON.stringify({ format: BUCH_FORMAT, network: REGTEST.network, gesichert: jetzt, eintraege: viele, selbst: [] }));
    const voll = knoten({ buchDatei: datei });
    assert.equal(voll.buchGroesse(), MAX_BUCH);
    assert.ok(voll.buchSchluessel().includes('10.0.0.1:8646'), 'der juengste ist dabei');
    assert.ok(!voll.buchSchluessel().includes(`10.${(MAX_BUCH + 199) >> 8 & 255}.${(MAX_BUCH + 199) & 255}.1:8646`), 'der aelteste nicht');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ------------------------------------------------------ gehoert / geprueft

/** Ein Knoten, der einen Lauschport NENNT, dort aber nicht erreichbar ist -- wie ein Heimrechner hinter einem Router. */
class OhneLauschen extends PeerManager {
  protected override lausche(): Promise<void> { return Promise.resolve(); }
}

test('Weitergegeben wird nur, was der Knoten selbst erreicht hat', async () => {
  const pA = naechsterPort(), pHeim = naechsterPort(), pD = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  // "Heim" nennt Port pHeim, lauscht dort aber nicht.
  const heim = new OhneLauschen({
    params: REGTEST, agent: 'heim/1', listenPort: pHeim, host: '127.0.0.1',
    kette: () => ({ height: 1, chainWork: 100n }), seeds: [{ host: '127.0.0.1', port: pA }],
    takte: { verbindeMs: 150, getaddrMs: 60_000, probeAbstandMs: 60_000 },
  });
  await heim.start();
  // D ist erreichbar.
  const dd = knoten({ port: pD, seeds: [{ host: '127.0.0.1', port: pA }] });
  await dd.start();
  await warte(600);

  const stand = a.netzStand();
  assert.ok(a.buchSchluessel().includes(`127.0.0.1:${pHeim}`), 'A hat Heim gehoert');
  assert.ok(stand.verified >= 1, 'D wurde geprueft');

  // Ein neuer Knoten fragt A -- und lernt D, aber nicht Heim.
  const neu = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await neu.start();
  await warte(500);
  assert.ok(neu.buchSchluessel().includes(`127.0.0.1:${pD}`), `D fehlt: ${neu.buchSchluessel().join(', ')}`);
  assert.ok(!neu.buchSchluessel().includes(`127.0.0.1:${pHeim}`), 'Heim haette nicht weitergegeben werden duerfen');

  await neu.stop(); await dd.stop(); await heim.stop(); await a.stop();
});

test('getaddr im Takt, nicht nur beim Handschlag', async () => {
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  let fragen = 0;
  const original = (a as unknown as { aufGetAddr: (p: unknown) => void }).aufGetAddr.bind(a);
  (a as unknown as { aufGetAddr: (p: unknown) => void }).aufGetAddr = (p: unknown) => { fragen++; original(p); };
  await a.start();
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }], takte: { verbindeMs: 100, getaddrMs: 200, probeAbstandMs: 60_000 } });
  await b.start();
  await warte(1000);
  assert.ok(fragen >= 3, `nur ${fragen} getaddr angekommen`);
  await b.stop(); await a.stop();
});

test('Streuung: ein noch nicht belegter Netzbereich wird zuerst gewaehlt', async () => {
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }], maxAus: 8 });
  await b.start();
  for (let i = 0; i < 20 && b.zahlAus() === 0; i++) await warte(50);
  // Ausgehend belegt: 127.0.x. Im Buch: ein juengerer im selben Bereich, ein aelterer in einem anderen.
  const intern = b as unknown as { merke: (h: string, p: number, g?: number) => void; naechstesZiel: () => { host: string } | null };
  intern.merke('127.0.0.99', 1, Date.now());
  intern.merke('198.51.100.7', 1, Date.now() - 60_000);
  assert.equal(intern.naechstesZiel()?.host, '198.51.100.7');
  await b.stop(); await a.stop();
});

// --------------------------------------------------------------- Lauschen

test('Ohne feste Adresse: IPv4 und IPv6, und ohne IPv6 Rueckfall auf IPv4', async () => {
  class OhneIpv6 extends PeerManager {
    protected override lausche(p: number, host: string): Promise<void> {
      if (host === '::') return Promise.reject(Object.assign(new Error('no ipv6'), { code: 'EAFNOSUPPORT' }));
      return super.lausche(p, host);
    }
  }
  const meldungen: string[] = [];
  const m = new OhneIpv6({ params: REGTEST, agent: 't', listenPort: naechsterPort(),
    kette: () => ({ height: 1, chainWork: 1n }), onLog: t => meldungen.push(t) });
  await m.start();
  assert.equal(m.lauschAdresse, '0.0.0.0');
  assert.ok(meldungen.some(t => t.includes('IPv6 is not available here')));
  await m.stop();

  // Mit fester Adresse kein Rueckfall: Der Fehler kommt durch.
  const fest = new OhneIpv6({ params: REGTEST, agent: 't', listenPort: naechsterPort(), host: '::',
    kette: () => ({ height: 1, chainWork: 1n }) });
  await assert.rejects(() => fest.start());
  await fest.stop();
});

test('IPv4 und IPv6 auf einem Port: ein IPv4-Peer heisst 127.0.0.1, nicht ::ffff:127.0.0.1',
  { skip: mitIpv6 ? false : 'dieses System hat kein IPv6' }, async () => {
    const pA = naechsterPort();
    const a = new PeerManager({ params: REGTEST, agent: 'a', listenPort: pA,
      kette: () => ({ height: 1, chainWork: 1n }) });
    await a.start();
    assert.equal(a.lauschAdresse, '::');
    const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
    const c = knoten({ seeds: [{ host: '::1', port: pA }] });
    await b.start(); await c.start();
    await warte(500);
    const hosts = a.alle().map(p => p.host).sort();
    assert.deepEqual(hosts, ['127.0.0.1', '::1']);
    await b.stop(); await c.stop(); await a.stop();
  });
