/**
 * Was eine unabhaengige Pruefung gefunden hat -- hier festgehalten, damit es
 * nicht wiederkommt: Start und Stopp, die sich ueberholen; tote Arbeit; die
 * Schnittstelle des Knotens und fremde Webseiten; Dateien, die von Hand
 * veraendert wurden.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGTEST } from '../../src/lib/core/networks.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { keypairFromMnemonic } from '../../src/lib/core/wallet.ts';
import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator, type MiningJob } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { NodeCoreApp, istPrivateQuelle, type Huelle } from '../src/main.ts';
import { LocalMiner } from '../src/LocalMiner.ts';
import { GpuMiner, erkenneGpu } from '../src/GpuMiner.ts';
import { WalletDienst } from '../src/Wallet.ts';
import type { Arbeitsquelle } from '../src/PoolQuelle.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const PW = 'ein langes passwort';
const ADR = encodeAddress(new Uint8Array(20).fill(0x61));
const EMU = join(import.meta.dirname, '..', 'gpu', 'bin', 'yskar-cuda-emu');
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
const ordner = () => mkdtempSync(join(tmpdir(), 'yskar-haert-'));
let naechsterPort = 19_300;
const port = () => naechsterPort++;

async function bis(was: string, pruefe: () => Promise<boolean> | boolean, ms = 30_000): Promise<void> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await pruefe()) return; await warte(40); }
  assert.fail(`Zeit abgelaufen: ${was}`);
}

function ruf(p: number, pfad: string, opt: { method?: string; headers?: Record<string, string>; body?: string } = {}):
    Promise<{ status: number; text: string; json: any }> {
  return new Promise((auf, ab) => {
    const req = request({ host: '127.0.0.1', port: p, path: pfad, method: opt.method ?? 'GET', agent: false,
      headers: { host: `127.0.0.1:${p}`, ...(opt.headers ?? {}) } }, res => {
      let text = ''; res.on('data', c => { text += c; });
      res.on('end', () => { let json: any = null; try { json = JSON.parse(text); } catch { /* kein JSON */ } auf({ status: res.statusCode ?? 0, text, json }); });
    });
    req.on('error', ab);
    if (opt.body !== undefined) req.write(opt.body);
    req.end();
  });
}

async function kern(opt: ConstructorParameters<typeof NodeCoreApp>[0] = {}) {
  const gui = port();
  const basis = opt.basis ?? ordner();
  const app = new NodeCoreApp({ params: REGTEST, guiPort: gui, ...opt, basis });
  await app.startGui();
  const token = (await ruf(gui, '/')).text.match(/content="([0-9a-f]{64})"/)![1];
  const kopf = { 'x-yskar-token': token, 'content-type': 'application/json' };
  const GET = (pfad: string) => ruf(gui, pfad, { headers: { 'x-yskar-token': token } });
  const POST = (pfad: string, wert: unknown = {}) => ruf(gui, pfad, { method: 'POST', headers: kopf, body: JSON.stringify(wert) });
  return { app, gui, basis, GET, POST, stand: async () => (await GET('/api/status')).json };
}

function kette() {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  let uhr = 1_788_912_000n;
  const mining = new MiningCoordinator(chain, store, new TxPool(), REGTEST, () => { const t = uhr; uhr += REGTEST.targetBlockTime; return t; });
  return { store, chain, mining };
}

// ------------------------------------------------------------ Schnittstelle

test('Woher eine Verbindung kommt: eigener PC und eigenes Netz, sonst nichts', () => {
  for (const ja of ['127.0.0.1', '127.9.9.9', '::1', '::ffff:127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.254',
                    '192.168.178.24', '::ffff:192.168.1.7', '169.254.10.10', 'fe80::1', 'fd12:3456::1', 'fc00::1']) {
    assert.equal(istPrivateQuelle(ja), true, ja);
  }
  for (const nein of [undefined, '', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1', '192.0.2.2', '100.64.0.1',
                      '::ffff:8.8.8.8', '2001:db8::1', '2a02:8109::5', 'ff02::1', 'unsinn', '10.0.0.5.evil']) {
    assert.equal(istPrivateQuelle(nein), false, String(nein));
  }
});

test('Schnittstelle des Knotens: ohne Pool nur dieser PC, keine fremde Webseite', async () => {
  const K = await kern();
  const api = port();
  try {
    await K.POST('/api/configure', { dataDir: ordner(), nodePort: api, p2pPort: port(), seed: '' });
    assert.equal((await K.POST('/api/start')).status, 200);

    // Ein Miner auf diesem PC: geht.
    assert.equal((await ruf(api, '/summary')).status, 200);
    assert.equal((await ruf(api, '/summary', { headers: { host: `localhost:${api}` } })).status, 200);

    // Eine Webseite im Browser: nicht.
    const sitzung = (kopf: Record<string, string>) => ruf(api, '/api/v2/session', {
      method: 'POST', headers: { 'content-type': 'text/plain', ...kopf }, body: JSON.stringify({ address: ADR }) });
    assert.equal((await sitzung({ origin: 'https://boese.example' })).status, 403);
    assert.equal((await sitzung({ 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await sitzung({ host: 'boese.example' })).status, 403, 'Ein umgebogener Name zählt nicht als dieser PC');
    assert.equal((await sitzung({ host: `boese.example:${api}` })).status, 403);
    assert.equal((await ruf(api, '/summary')).json.miningSessions, 0, 'Keine davon hat eine Sitzung bekommen');
    // "GET //" beendet den Knoten nicht.
    assert.ok([400, 403, 404].includes((await ruf(api, '//')).status));
    assert.equal((await K.stand()).running, true);

    // Mit Pool ist die Schnittstelle ein Angebot an andere -- auch an die Mini App im Browser.
    assert.equal((await K.POST('/api/pool/betrieb', { aktiv: true, name: 'Offen' })).status, 200);
    const mit = await sitzung({ origin: 'https://yskar.vercel.app', 'content-type': 'application/json' });
    assert.equal(mit.status, 200);
    assert.ok(mit.json.sessionId);
    // Abgeschaltet: wieder zu.
    await K.POST('/api/pool/betrieb', { aktiv: false });
    assert.equal((await sitzung({ origin: 'https://yskar.vercel.app' })).status, 403);
  } finally { await K.app.shutdown(); }
});

// -------------------------------------------------------------- Dateien

test('Datenordner: Ein Dateipfad wird nicht übernommen und nie "geöffnet"', async () => {
  const gerufen: string[] = [];
  const huelle: Huelle = {
    async waehleOrdner() { return null; }, async oeffneOrdner(p) { gerufen.push(p); }, async oeffneLink() {},
    autostart: () => false, setzeAutostart() {}, infobereich: () => false, beenden() {},
  };
  const K = await kern();
  try {
    K.app.setzeHuelle(huelle);
    const gut = ordner();
    assert.equal((await K.POST('/api/configure', { dataDir: gut, nodePort: port(), p2pPort: port(), seed: '' })).status, 200);

    const datei = join(ordner(), 'boese.exe');
    writeFileSync(datei, 'MZ');
    const r = await K.POST('/api/configure', { dataDir: datei, nodePort: port(), p2pPort: port(), seed: '' });
    assert.equal(r.status, 400);
    assert.equal((await K.stand()).dataDir, gut, 'Die bisherige Einstellung bleibt stehen');

    assert.equal((await K.POST('/api/huelle/ordner-oeffnen', { welcher: 'daten' })).status, 200);
    assert.deepEqual(gerufen, [gut]);
  } finally { await K.app.shutdown(); }
});

test('config.json von Hand verändert: nichts Unzulässiges wird übernommen', async () => {
  for (const [inhalt, erwartet] of [
    ['null', { configured: false }],
    ['[1,2,3]', { configured: false }],
    ['{kaputt', { configured: false }],
    [JSON.stringify({ dataDir: {}, nodePort: 80, p2pPort: 'abc', seed: 'ohne-port' }),
      { configured: true, nodePort: 8645, p2pPort: 8646, seed: 'yskar-main.dynv6.net:8646' }],
    [JSON.stringify({ dataDir: '/tmp/x', nodePort: 9000, p2pPort: 9000, seed: '' }),
      { configured: true, nodePort: 8645, p2pPort: 8646, seed: '' }],
    [JSON.stringify({ dataDir: '/tmp/y', nodePort: -7.5, p2pPort: 70000 }),
      { configured: true, nodePort: 8645, p2pPort: 8646 }],
    [JSON.stringify({ dataDir: '/tmp/z', nodePort: 19001, p2pPort: 19002, seed: '127.0.0.1:19003' }),
      { configured: true, dataDir: '/tmp/z', nodePort: 19001, p2pPort: 19002, seed: '127.0.0.1:19003' }],
  ] as [string, Record<string, unknown>][]) {
    const basis = ordner();
    writeFileSync(join(basis, 'config.json'), inhalt);
    const K = await kern({ basis });
    try {
      const s = await K.stand();
      for (const [k, v] of Object.entries(erwartet)) assert.deepEqual(s[k], v, `${inhalt.slice(0, 50)} -> ${k}`);
      assert.equal(typeof s.dataDir, 'string');
      assert.ok(!String(s.dataDir).includes('[object'));
    } finally { await K.app.shutdown(); }
  }
});

// --------------------------------------------------------------- Wallet

test('Wallet: Viele Versuche auf einmal sind nicht mehr Versuche', async () => {
  const w = new WalletDienst(ordner());
  await w.anlegen(WORTE, PW);
  w.sperren();
  // 60 falsche Passwoerter gleichzeitig -- und mittendrin das richtige.
  const versuche = Array.from({ length: 60 }, (_, i) => w.entsperren(i === 40 ? PW : 'falsch ' + i).then(() => 'offen', (e: any) => e.code));
  const ergebnis = await Promise.all(versuche);
  assert.equal(ergebnis.filter(x => x === 'passwort_falsch').length, 5, 'Fünf Versuche, dann ist Pause');
  assert.equal(ergebnis.filter(x => x === 'pause').length, 55);
  assert.equal(ergebnis.includes('offen'), false, 'Das richtige Passwort an Stelle 41 kam gar nicht mehr dran');
  assert.equal(w.stand().gesperrt, true);
});

test('Wallet: Eine fremde Adresse in der Datei fällt beim Entsperren auf', async () => {
  const basis = ordner();
  const w = new WalletDienst(basis);
  await w.anlegen(WORTE, PW);
  const pfad = join(basis, 'wallet.json');
  const datei = JSON.parse(readFileSync(pfad, 'utf8'));
  assert.equal(datei.address, keypairFromMnemonic(WORTE, '', 0, 0).address);
  writeFileSync(pfad, JSON.stringify({ ...datei, address: ADR }));

  const w2 = new WalletDienst(basis);
  assert.equal(w2.stand().adresse, ADR, 'Gesperrt lässt sich das nicht prüfen');
  await assert.rejects(() => w2.entsperren(PW), (e: any) => e.code === 'datei_beschaedigt');
  assert.equal(w2.stand().gesperrt, true);

  // Kontakte: dieselben Regeln wie beim Speichern.
  writeFileSync(join(basis, 'kontakte.json'), JSON.stringify([
    { name: 'x'.repeat(5000), adresse: ADR }, { name: 'Mara\n\u0000', adresse: ADR.toUpperCase() }, { name: '', adresse: ADR }, 'unsinn',
  ]));
  writeFileSync(pfad, JSON.stringify(datei));
  const w3 = new WalletDienst(basis);
  await w3.entsperren(PW);
  // Uebrig bleibt nur der eine, der nach dem Saeubern den Regeln genuegt.
  assert.deepEqual(w3.kontakte(), [{ name: 'Mara', adresse: ADR }]);
});

// ---------------------------------------------------------------- Miner

test('CPU: Gibt der Pool keine Arbeit mehr, pausiert der Miner -- und rechnet weiter, sobald sie wiederkommt', async () => {
  const k = kette();
  let geht = true;
  let geholt = 0;
  // Ein "Pool", der Arbeit des eigenen Knotens ausgibt -- nur eben ueber einen Umweg mit Wartezeit.
  const quelle: Arbeitsquelle = {
    async createJob(adresse, extranonce, extra) {
      await warte(5);
      geholt++;
      if (!geht) throw new Error('Pool antwortet nicht');
      const job: MiningJob = k.mining.createJob(adresse, extranonce, extra);
      // Unerreichbares Ziel: Es soll gerechnet, aber nichts gefunden werden.
      return { ...job, target: '00'.repeat(31) + '01' };
    },
    async submitNonce() { return { ok: false, grund: 'job_ersetzt' }; },
  };
  const meldungen: string[] = [];
  const m = new LocalMiner({ mining: k.mining, onLog: t => meldungen.push(t), jobTotMs: 600, jobNochmalMs: 100 });
  m.setzeQuelle(quelle);
  try {
    await m.start(ADR, 1, 100);
    await bis('der Miner rechnet', () => m.status().hashes > 0);
    assert.throws(() => m.setzeQuelle(null), /Stillstand/, 'Die Quelle wechselt nur im Stillstand');

    geht = false;
    m.notifyChainChanged();
    await bis('der Miner pausiert', () => meldungen.some(t => /pausiert/.test(t)), 8000);
    assert.equal(m.status().jobId, null);
    await warte(1300);
    const still = m.status().hashes;
    await warte(1300);
    assert.equal(m.status().hashes, still, 'In der Pause wird nicht gerechnet');
    assert.equal(meldungen.filter(t => /konnte nicht geholt werden/.test(t)).length, 1, 'Dieselbe Meldung steht nur einmal im Protokoll');

    geht = true;
    await bis('der Miner rechnet wieder', () => m.status().hashes > still && m.status().jobId !== null, 8000);
    assert.ok(meldungen.some(t => /rechnet weiter/.test(t)));
  } finally { await m.stop(); }
  // Nach dem Stopp kommt keine verspaetete Anfrage mehr.
  const danach = geholt;
  await warte(400);
  assert.equal(geholt, danach);
});

test('CPU: Stopp und neuer Start, während der Pool noch antwortet -- nichts bleibt hängen', async () => {
  const k = kette();
  let warteMs = 1500;
  const quelle: Arbeitsquelle = {
    async createJob(adresse, extranonce, extra) { await warte(warteMs); return k.mining.createJob(adresse, extranonce, extra); },
    async submitNonce(jobId, nonce) { await warte(warteMs); return k.mining.submitNonce(jobId, nonce); },
  };
  const m = new LocalMiner({ mining: k.mining });
  m.setzeQuelle(quelle);
  await m.start(ADR, 1, 100);          // die Anfrage nach Arbeit haengt jetzt beim "Pool"
  await warte(100);
  await m.stop();
  m.setzeQuelle(null);                 // zurueck zum eigenen Knoten
  const t0 = Date.now();
  await m.start(ADR, 1, 100);
  try {
    assert.ok(m.status().jobId !== null, 'Solo steht die Arbeit sofort bereit -- sie wartet nicht auf die alte Anfrage');
    assert.ok(Date.now() - t0 < 1000);
    const erste = m.status().jobId;
    await warte(1800);                 // die alte Antwort trifft ein
    assert.equal(k.chain.tip() !== null, true, 'Solo findet der Miner Blöcke');
    assert.notEqual(m.status().jobId, null);
    assert.ok(erste);
  } finally { await m.stop(); }
});

test('GPU: Ein Stopp während des Selbsttests gilt -- die Karte läuft danach nicht doch noch an', async () => {
  if (!existsSync(EMU)) return;
  const k = kette();
  // Das echte Programm, nur mit einem Selbsttest, der eine Weile dauert.
  const langsam = join(ordner(), 'yskar-cuda-langsam');
  writeFileSync(langsam, `#!/bin/sh\ncase "$*" in *--selftest*) sleep 1.2;; esac\nexec "${EMU}" "$@"\n`);
  chmodSync(langsam, 0o755);
  const geraet = (await erkenneGpu(langsam)).geraete[0];
  assert.ok(geraet);

  const g = new GpuMiner({ mining: k.mining, programm: langsam });
  const start = g.start(new Uint8Array(20).fill(0x61), geraet).then(() => 'gestartet', (e: Error) => e.message);
  await warte(200);
  await g.stop();
  assert.match(await start, /gestoppt/);
  await warte(600);
  assert.equal(g.status().running, false);
  assert.equal(g.status().hashes, 0, 'Es wurde nichts gerechnet');
  assert.equal(k.chain.tip(), null, 'Und kein Block gefunden');

  // Ein gewoehnlicher Start danach geht.
  await g.start(new Uint8Array(20).fill(0x61), geraet);
  try {
    await bis('die Karte findet einen Block', () => k.chain.tip() !== null, 20_000);
  } finally { await g.stop(); }
});

test('Mining: Start und Stopp laufen nacheinander -- zwei Starts ergeben eine Sitzung, Start plus Stopp ergibt Stillstand', async () => {
  let zeit = BigInt(Math.floor(Date.now() / 1000)) - 1_000_000n;
  const uhr = () => { const t = zeit; zeit += REGTEST.targetBlockTime; return t; };
  const P = await kern({ uhr });
  const pApi = port();
  await P.POST('/api/configure', { dataDir: ordner(), nodePort: pApi, p2pPort: port(), seed: '' });
  await P.POST('/api/pool/betrieb', { aktiv: true, name: 'Reihenpool' });
  await P.POST('/api/start');
  const A = await kern({ uhr });
  try {
    await A.POST('/api/configure', { dataDir: ordner(), nodePort: port(), p2pPort: port(), seed: '' });
    await A.POST('/api/start');
    const start = () => A.POST('/api/mining/start', { address: ADR, mode: 'cpu', cpuWorkers: 1, ziel: 'pool', poolHost: `http://127.0.0.1:${pApi}` });

    const [a, b] = await Promise.all([start(), start()]);
    assert.deepEqual([a.status, b.status], [200, 200], JSON.stringify([a.json, b.json]));
    assert.equal((await A.stand()).mining.running, true);
    await bis('genau eine Sitzung beim Pool', async () => (await ruf(pApi, '/summary')).json.miningSessions === 1);

    const [c, d] = await Promise.all([start(), A.POST('/api/mining/stop')]);
    assert.deepEqual([c.status, d.status], [200, 200]);
    assert.equal((await A.stand()).mining.running, false, 'Der Stopp kam nach dem Start an die Reihe und gilt');
    await bis('keine Sitzung bleibt zurück', async () => (await ruf(pApi, '/summary')).json.miningSessions === 0);
    assert.equal((await ruf(pApi, '/api/v2/pool')).json.miner, 0);
  } finally {
    await A.app.shutdown();
    await P.app.shutdown();
  }
});
