/**
 * Node Core als Ganzes: Schutz der lokalen Oberflaeche, Verbreitung von
 * Ueberweisungen, Statistik und die Pruefung vor dem Mining-Start.
 *
 * Es laeuft die echte Anwendungsklasse -- nur auf dem Testnetz, mit eigenen
 * Ports und Ordnern. Zwei Knoten sprechen ueber echte TCP-Verbindungen
 * miteinander, die eingebauten Miner rechnen mit der echten Engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, createServer } from 'node:http';
import { connect } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { UNIT, MIN_FEE } from '../../src/lib/core/params.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { buildTransfer, serializeTx } from '../../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { PeerManager } from '../../src/lib/node/p2p/PeerManager.ts';
import { NodeCoreApp, VERSION } from '../src/main.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Wartet, bis die Bedingung gilt -- oder scheitert mit einer klaren Ansage. */
async function bis(was: string, pruefe: () => Promise<boolean> | boolean, ms = 30_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (await pruefe()) return;
    await warte(40);
  }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

interface Antwort { status: number; kopf: Record<string, string | string[] | undefined>; text: string; json: any }

/** Eine Anfrage, bei der sich auch der Host-Kopf frei setzen laesst. */
function ruf(port: number, pfad: string, opt: {
  method?: string; headers?: Record<string, string>; body?: string;
} = {}): Promise<Antwort> {
  return new Promise((auf, ab) => {
    const req = request({
      host: '127.0.0.1', port, path: pfad, method: opt.method ?? 'GET',
      headers: { host: `127.0.0.1:${port}`, ...(opt.headers ?? {}) },
    }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
        auf({ status: res.statusCode ?? 0, kopf: res.headers, text, json });
      });
    });
    req.on('error', ab);
    if (opt.body !== undefined) req.write(opt.body);
    req.end();
  });
}

let naechsterPort = 19_700;
const port = () => naechsterPort++;
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-kern-'));

/**
 * Den Zugangsschluessel so holen, wie ihn das Fenster bekommt: aus dem
 * Programm selbst. In der Seite steht er nicht mehr (Befund S8).
 */
async function schluessel(app: NodeCoreApp): Promise<string> {
  return app.zugangFuerFenster();
}

const json = (token: string, wert: unknown) => ({
  method: 'POST',
  headers: { 'x-yskar-token': token, 'content-type': 'application/json' },
  body: JSON.stringify(wert),
});

// ---------------------------------------------------------------------------

test('Oberfläche: Die eigene Seite kommt durch, eine fremde nicht', async () => {
  const gui = port();
  const app = new NodeCoreApp({ params: REGTEST, guiPort: gui, basis: ordner() });
  await app.startGui();
  try {
    const seite = await ruf(gui, '/');
    assert.equal(seite.status, 200);
    assert.match(String(seite.kopf['content-security-policy']), /frame-ancestors 'none'/);
    assert.match(String(seite.kopf['content-security-policy']), /script-src 'self';/,
      'Eingebettete Skripte sind nicht erlaubt');
    assert.equal(seite.kopf['x-frame-options'], 'DENY');
    assert.ok(!seite.text.includes('__YSKAR_ZUGANG__'), 'Der Platzhalter muss ersetzt sein');

    const token = await schluessel(app);
    assert.ok(!seite.text.includes(token), 'Der Zugangsschlüssel steht nicht in der Seite');
    const mit = { 'x-yskar-token': token };

    // Ohne Schluessel: nichts, weder lesen noch schreiben.
    assert.equal((await ruf(gui, '/api/status')).status, 401);
    assert.equal((await ruf(gui, '/api/status', { headers: { 'x-yskar-token': 'f'.repeat(64) } })).status, 401);
    assert.equal((await ruf(gui, '/api/mining/start', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: encodeAddress(new Uint8Array(20).fill(0x66)) }),
    })).status, 401, 'Eine fremde Seite darf die Mining-Adresse nicht setzen');
    assert.equal((await ruf(gui, '/api/shutdown', { method: 'POST' })).status, 401);

    // Mit Schluessel: die Oberflaeche arbeitet.
    const stand = await ruf(gui, '/api/status', { headers: mit });
    assert.equal(stand.status, 200);
    assert.equal(stand.json.version, VERSION);
    assert.equal(stand.json.network, REGTEST.network);

    // Fremder Host -- der Weg des DNS-Rebinding. Auch mit Schluessel nicht.
    assert.equal((await ruf(gui, '/api/status', { headers: { ...mit, host: `boese.example:${gui}` } })).status, 403);
    assert.equal((await ruf(gui, '/', { headers: { host: `boese.example:${gui}` } })).status, 403,
      'Auch die Seite selbst geht an keinen fremden Namen');

    // Fremde Herkunft.
    assert.equal((await ruf(gui, '/api/status', { headers: { ...mit, origin: 'https://boese.example' } })).status, 403);
    assert.equal((await ruf(gui, '/api/status', { headers: { ...mit, origin: 'null' } })).status, 403);
    assert.equal((await ruf(gui, '/api/status', { headers: { ...mit, 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await ruf(gui, '/api/status', { headers: { ...mit, 'sec-fetch-site': 'same-site' } })).status, 403,
      'Ein anderer Port auf demselben Rechner ist eine andere Herkunft');

    // Eigene Herkunft, wie der Browser sie schickt.
    assert.equal((await ruf(gui, '/api/status', {
      headers: { ...mit, origin: `http://127.0.0.1:${gui}`, 'sec-fetch-site': 'same-origin' },
    })).status, 200);

    // Ein Rumpf, der nicht als JSON ausgewiesen ist, ist kein Befehl.
    const plain = await ruf(gui, '/api/configure', {
      method: 'POST', headers: { ...mit, 'content-type': 'text/plain' },
      body: JSON.stringify({ dataDir: ordner(), nodePort: port(), p2pPort: port(), seed: '' }),
    });
    assert.equal(plain.status, 400);
    assert.equal((await ruf(gui, '/api/status', { headers: mit })).json.configured, false);

    // Und JSON, das kein Objekt ist, auch nicht.
    assert.equal((await ruf(gui, '/api/configure', {
      method: 'POST', headers: { ...mit, 'content-type': 'application/json' }, body: '[1,2]',
    })).status, 400);
  } finally {
    await app.shutdown();
  }
});

// ---------------------------------------------------------------------------

test('Mining startet erst, wenn der Knoten auf dem Stand des Netzes ist', () => {
  const app = new NodeCoreApp({ params: REGTEST, guiPort: port(), basis: ordner() }) as any;
  const JETZT = 1_000_000_000;
  const aus = (height: number) => ({ height, richtung: 'aus' });
  const ein = (height: number) => ({ height, richtung: 'ein' });
  /** `still`: so lange ist nichts mehr geschehen, das einen Rueckstand belegt. */
  const mit = (peers: { height: number; richtung: string }[], eigene: number, still = 0, fehlend = 0) => {
    app.peers = { info: () => peers };
    app.chain = { tip: () => (eigene < 0 ? null : { height: eigene }) };
    app.sync = { fehlendeBloecke: () => fehlend };
    app.fortschritt = JETZT - still;
    return app.miningBereit(JETZT) as { bereit: boolean; grund: string | null };
  };

  const ohne = mit([], 100);
  assert.equal(ohne.bereit, false);
  assert.match(String(ohne.grund), /kein Peer/i);
  assert.equal(mit([], 100, 3_600_000).bereit, false, 'Ohne Peer hilft auch Warten nicht');

  assert.equal(mit([aus(100), aus(100), aus(100)], 100).bereit, true);
  assert.equal(mit([aus(100), aus(100), aus(100)], 99).bereit, true, 'Ein Block Abstand ist erlaubt');
  assert.equal(mit([aus(-1)], -1).bereit, true, 'Ein frisches Netz ohne Blöcke ist auf dem Stand');

  const hinten = mit([aus(100), aus(100), aus(100)], 40);
  assert.equal(hinten.bereit, false);
  assert.match(String(hinten.grund), /synchronisiert noch \(Höhe 40 von 100\)/);

  // Einer luegt: Der mittlere Stand bleibt richtig.
  assert.equal(mit([aus(100), aus(100), aus(5_000_000)], 100).bereit, true);

  // Zwei eingehende Peers luegen. Eingehende Verbindungen kann jeder
  // beliebig oft oeffnen -- sie zaehlen nicht, solange es ausgehende gibt.
  assert.equal(mit([aus(100), ein(5_000_000), ein(5_000_000)], 100).bereit, true,
    'Eingehende Peers mit erfundener Höhe sperren das Mining nicht');

  // Nur eingehende Peers, und die Mehrheit luegt: Die Sperre haelt hoechstens
  // so lange, wie ein echter Rueckstand ohne einen einzigen Block braeuchte.
  const nurEin = [ein(100), ein(5_000_000), ein(5_000_000)];
  assert.equal(mit(nurEin, 100, 10_000).bereit, false);
  assert.equal(mit(nurEin, 100, 121_000).bereit, true,
    'Ein behaupteter Rückstand ohne Blöcke gilt nach zwei Minuten nicht mehr');

  // Dasselbe, wenn die Mehrheit der ausgehenden luegt.
  assert.equal(mit([aus(100), aus(9_000), aus(9_000)], 100, 119_000).bereit, false);
  assert.equal(mit([aus(100), aus(9_000), aus(9_000)], 100, 121_000).bereit, true);

  // Die Hoehe der Peers ist alt, aber der Abgleich laedt gerade nach.
  const nachSchlaf = mit([aus(100), aus(100)], 100, 2_000, 60);
  assert.equal(nachSchlaf.bereit, false);
  assert.match(String(nachSchlaf.grund), /60 Blöcke fehlen/);
  assert.equal(mit([aus(100), aus(100)], 100, 2_000, 1).bereit, true, 'Ein einzelner neuer Block sperrt nicht');

  // Angekuendigte Bloecke, die nie geliefert werden, sperren nicht fuer immer.
  assert.equal(mit([aus(100), aus(100)], 100, 121_000, 2).bereit, true);

  // Solange Bloecke kommen, haelt die Sperre -- auch ueber Stunden.
  assert.equal(mit([aus(5_000), aus(5_000)], 100, 1_000).bereit, false);

  /*
    Eine neue ausgehende Verbindung zaehlt als Fortschritt, aber nicht
    beliebig oft: Ein Peer, der die Verbindung immer wieder abreissen laesst,
    haelt die Sperre damit nicht geschlossen.
  */
  app.fortschritt = 0; app.letzterAusgehend = 0;
  app.ausgehendVerbunden(JETZT);
  assert.equal(app.fortschritt, JETZT);
  app.ausgehendVerbunden(JETZT + 30_000);
  app.ausgehendVerbunden(JETZT + 90_000);
  assert.equal(app.fortschritt, JETZT, 'Wiederholtes Verbinden schiebt die Geduld nicht hinaus');
  app.peers = { info: () => [aus(9_000), aus(9_000)] };
  assert.equal(app.miningBereit(JETZT + 121_000).bereit, true);
  app.ausgehendVerbunden(JETZT + 601_000);
  assert.equal(app.fortschritt, JETZT + 601_000, 'Nach zehn Minuten zählt eine neue Verbindung wieder');
});

// ---------------------------------------------------------------------------

test('Zwei Knoten: Überweisung wandert, landet im Block, Miner zählen mit', async () => {
  const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
    + 'abandon abandon abandon about';
  const MINER = keypairFromMnemonic(WORTE, '', 0, 0);
  const EMPFAENGER = new Uint8Array(20).fill(0xee);
  const ZWEITER = encodeAddress(new Uint8Array(20).fill(0x44));

  // Gesetzte Uhr, von beiden Knoten geteilt: Difficulty bleibt bei 1, und
  // die Zeitstempel steigen ueber beide hinweg.
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 1_000_000n;
  const uhr = () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };

  const A = { gui: port(), api: port(), p2p: port() };
  const B = { gui: port(), api: port(), p2p: port() };
  const a = new NodeCoreApp({ params: REGTEST, guiPort: A.gui, basis: ordner(), uhr, statsTaktMs: 150 });
  const b = new NodeCoreApp({ params: REGTEST, guiPort: B.gui, basis: ordner(), uhr, statsTaktMs: 150 });
  await a.startGui();
  await b.startGui();

  try {
    const tA = await schluessel(a);
    const tB = await schluessel(b);
    assert.notEqual(tA, tB, 'Jeder Start hat seinen eigenen Schlüssel');

    const stand = async (k: typeof A, t: string) =>
      (await ruf(k.gui, '/api/status', { headers: { 'x-yskar-token': t } })).json;

    // Knoten A, ohne Seed.
    assert.equal((await ruf(A.gui, '/api/configure',
      json(tA, { dataDir: ordner(), nodePort: A.api, p2pPort: A.p2p, seed: '' }))).status, 200);
    assert.equal((await ruf(A.gui, '/api/start', json(tA, {}))).status, 200);

    // Allein darf er nicht minen.
    const allein = await ruf(A.gui, '/api/mining/start',
      json(tA, { address: MINER.address, mode: 'cpu', cpuWorkers: 1 }));
    assert.equal(allein.status, 400);
    assert.match(allein.json.error, /kein Peer/i);

    // Knoten B, mit A als Seed.
    assert.equal((await ruf(B.gui, '/api/configure',
      json(tB, { dataDir: ordner(), nodePort: B.api, p2pPort: B.p2p, seed: `127.0.0.1:${A.p2p}` }))).status, 200);
    assert.equal((await ruf(B.gui, '/api/start', json(tB, {}))).status, 200);
    await bis('A und B sind verbunden',
      async () => (await stand(A, tA)).peerCount === 1 && (await stand(B, tB)).peerCount === 1);

    // A mint -- mit dem eingebauten Miner, ueber den eigenen Knoten.
    const los = await ruf(A.gui, '/api/mining/start',
      json(tA, { address: MINER.address, mode: 'cpu', cpuWorkers: 1 }));
    assert.equal(los.status, 200, JSON.stringify(los.json));
    await bis('A findet einen Block', async () => ((await stand(A, tA)).height ?? -1) >= 0);

    // Solange A rechnet, weiss B davon: ein Miner, zwei Knoten. Die Meldung
    // kommt ueber den Takt -- niemand stoesst sie hier von Hand an.
    await bis('B zählt den Miner von A mit', async () => {
      const s = (await ruf(B.api, '/summary')).json;
      return s.activeMiners === 1 && s.knoten === 2 && s.miningSessions === 1;
    });
    // Und A zaehlt seinen eingebauten Miner selbst.
    assert.equal((await ruf(A.api, '/summary')).json.activeMiners, 1);

    assert.equal((await ruf(A.gui, '/api/mining/stop', json(tA, {}))).status, 200);

    /*
      Zwei Fremde verbinden sich mit B und behaupten eine Hoehe von fuenf
      Millionen. Echte Verbindungen, echter Handshake. B hat A als
      ausgehenden Peer und laesst sich davon nicht sperren.
    */
    const fremde: PeerManager[] = [];
    for (let i = 0; i < 2; i++) {
      const pm = new PeerManager({
        params: REGTEST, agent: 'fremd/1', listenPort: 0,
        seeds: [{ host: '127.0.0.1', port: B.p2p }],
        kette: () => ({ height: 5_000_000, chainWork: 0n }),
      });
      await pm.start();
      fremde.push(pm);
    }
    await bis('Die Fremden sind mit B verbunden', async () => (await stand(B, tB)).peerCount === 3);
    const sB = await stand(B, tB);
    assert.deepEqual(sB.peers.map((p: any) => p.hoehe).sort((x: number, y: number) => x - y).slice(-2),
      [5_000_000, 5_000_000]);
    assert.equal(sB.mining.startklar.bereit, true, JSON.stringify(sB.mining.startklar));
    for (const pm of fremde) await pm.stop();
    await bis('Die Fremden sind wieder weg', async () => (await stand(B, tB)).peerCount === 1);

    const hoeheA = (await stand(A, tA)).height as number;
    await bis('B holt die Blöcke von A', async () => (await stand(B, tB)).height === hoeheA);

    // Eine Ueberweisung, eingereicht bei A ...
    const tx = buildTransfer({
      chainId: REGTEST.chainId, from: MINER.addressRaw, to: EMPFAENGER,
      amount: 5n * UNIT, fee: MIN_FEE, nonce: 0n,
      publicKey: MINER.publicKey, privateKey: MINER.privateKey,
    });
    const ein = await ruf(A.api, '/tx', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: toHex(serializeTx(tx)) }),
    });
    assert.equal(ein.json.accepted, true, JSON.stringify(ein.json));

    // ... kommt bei B an.
    await bis('B kennt die Überweisung', async () => (await stand(B, tB)).mempool === 1);

    // B baut sie in seinen naechsten Block ein.
    assert.equal((await ruf(B.gui, '/api/mining/start',
      json(tB, { address: ZWEITER, mode: 'cpu', cpuWorkers: 1 }))).status, 200);
    await bis('B findet einen Block', async () => ((await stand(B, tB)).height as number) > hoeheA);
    assert.equal((await ruf(B.gui, '/api/mining/stop', json(tB, {}))).status, 200);

    // Und A nimmt den Block an: Das Geld ist beim Empfaenger.
    const hoeheB = (await stand(B, tB)).height as number;
    await bis('A holt den Block von B', async () => (await stand(A, tA)).height === hoeheB);
    const konto = (await ruf(A.api, `/account/${encodeAddress(EMPFAENGER)}`)).json;
    assert.equal(konto.balance, (5n * UNIT).toString());
    assert.equal((await stand(A, tA)).mempool, 0, 'Bestätigt heißt: nicht mehr in der Warteschlange');
    assert.equal((await stand(B, tB)).mempool, 0);
  } finally {
    await a.shutdown();
    await b.shutdown();
  }
});

// ---------------------------------------------------------------------------

test('Ein gescheiterter Start räumt auf, der nächste gelingt', async () => {
  const K = { gui: port(), api: port(), p2p: port() };
  const app = new NodeCoreApp({ params: REGTEST, guiPort: K.gui, basis: ordner() });
  await app.startGui();

  // Jemand anderes haelt den API-Port.
  const besetzer = createServer(() => { /* antwortet nie */ });
  await new Promise<void>(auf => besetzer.listen(K.api, '127.0.0.1', auf));

  const offen = (p: number) => new Promise<boolean>(auf => {
    const s = connect(p, '127.0.0.1');
    s.once('connect', () => { s.destroy(); auf(true); });
    s.once('error', () => auf(false));
  });

  try {
    const t = await schluessel(app);
    assert.equal((await ruf(K.gui, '/api/configure',
      json(t, { dataDir: ordner(), nodePort: K.api, p2pPort: K.p2p, seed: '' }))).status, 200);

    const erster = await ruf(K.gui, '/api/start', json(t, {}));
    assert.equal(erster.status, 400);
    assert.match(erster.json.error, /EADDRINUSE/);

    const danach = (await ruf(K.gui, '/api/status', { headers: { 'x-yskar-token': t } })).json;
    assert.equal(danach.running, false);
    assert.equal(await offen(K.p2p), false, 'Der P2P-Port darf nach dem gescheiterten Start nicht gebunden bleiben');
    assert.equal((app as any).statsTakt, null);

    // Der Port wird frei -- jetzt muss der Start gelingen.
    await new Promise<void>(auf => besetzer.close(() => auf()));
    const zweiter = await ruf(K.gui, '/api/start', json(t, {}));
    assert.equal(zweiter.status, 200, JSON.stringify(zweiter.json));
    assert.equal((await ruf(K.gui, '/api/status', { headers: { 'x-yskar-token': t } })).json.running, true);
    assert.equal(await offen(K.p2p), true);

    // Und Stoppen gibt beide Ports wieder frei.
    assert.equal((await ruf(K.gui, '/api/stop', json(t, {}))).status, 200);
    assert.equal(await offen(K.p2p), false);
    assert.equal(await offen(K.api), false);
  } finally {
    if (besetzer.listening) await new Promise<void>(auf => besetzer.close(() => auf()));
    await app.shutdown();
  }
});


test('Oberfläche: Der Zugangsschlüssel kommt als Cookie des Fensters -- in der Seite steht er nicht (Befund S8)', async () => {
  const gui = port();
  const app = new NodeCoreApp({ params: REGTEST, guiPort: gui, basis: ordner() });
  await app.startGui();
  try {
    const token = app.zugangFuerFenster();
    const seite = await ruf(gui, '/');
    assert.equal(seite.status, 200);
    assert.ok(!seite.text.includes(token), 'nicht in der Seite');
    assert.match(seite.text, /<meta name="yskar-zugang" content="">/, 'das Feld bleibt, aber leer');

    // Wie das Fenster: nur das Cookie, kein Kopffeld.
    assert.equal((await ruf(gui, '/api/status', { headers: { cookie: `yskar_zugang=${token}` } })).status, 200);
    assert.equal((await ruf(gui, '/api/status', { headers: { cookie: `andere=1; yskar_zugang=${token}; noch=2` } })).status, 200);
    // Falsch, leer oder fehlend: abgewiesen.
    assert.equal((await ruf(gui, '/api/status', { headers: { cookie: `yskar_zugang=${'f'.repeat(64)}` } })).status, 401);
    assert.equal((await ruf(gui, '/api/status', { headers: { cookie: 'yskar_zugang=' } })).status, 401);
    assert.equal((await ruf(gui, '/api/status')).status, 401);
    // Die Pruefung von Host und Herkunft gilt auch mit gueltigem Cookie.
    assert.equal((await ruf(gui, '/api/status', { headers: { cookie: `yskar_zugang=${token}`, origin: 'https://boese.example' } })).status, 403);
  } finally { await app.shutdown(); }
});
