/**
 * Aufholen über mehr als eine Header-Nachricht.
 *
 * Eine Header-Nachricht trägt höchstens 2000 Header. Liegt ein Knoten
 * weiter zurück, muss er nach der ersten Nachricht WEITERfragen -- hinter
 * dem letzten erhaltenen Header.
 *
 * Das tat er nicht. Er fragte mit dem Locator ab dem eigenen Kopf, und der
 * rückt erst vor, wenn Blockkörper ankommen. Die Gegenseite schickte also
 * dieselben 2000 Header wieder und wieder: nach jeder Antwort eine neue
 * Anfrage, solange der Rückstand größer als eine Nachricht war. Jede dieser
 * Antworten wurde gegen die ganze Warteschlange abgeglichen, einige
 * Millionen Vergleiche, in denen der Knoten nichts anderes tat. Im echten
 * Netz kam ein neuer Knoten so auf 16 Blöcke je halbe Minute und verlor
 * dabei seine Verbindungen.
 *
 * Die übrigen Tests benutzen Ketten von wenigen Blöcken und haben das nie
 * berührt. Damit dieser Test keine 2000 Blöcke minen muss, bekommt der
 * Abgleich hier eine kleinere Nachrichtengröße.
 *
 * Die ersten drei Tests laufen über echte Knoten und TCP auf Loopback. Die
 * übrigen spielen die Gegenseite selbst, Nachricht für Nachricht: Über
 * Loopback kommt alles so schnell und so geordnet an, dass sich die
 * Randfälle dort nicht gezielt herstellen lassen.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import { SyncManager, WARTESCHLANGE_NACHRICHTEN, BLOCK_FENSTER }
  from '../src/lib/node/p2p/SyncManager.ts';
import { encodeHeaders, decodeGetHeaders, encodeInv, INV_BLOCK }
  from '../src/lib/node/p2p/messages.ts';
import type { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { stateRoot } from '../src/lib/core/state.ts';
import { baueKette, zeig, type Kette, type Gemint } from './helpers/regtest.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
let port = 19500;
const naechsterPort = () => port++;

const LAENGE = 70;
/** Die Testkette -- einmal gemint, von allen Tests benutzt. */
let _kette: Kette | null = null;
const kette = (): Kette => (_kette ??= baueKette(LAENGE));
const alle: { stop(): Promise<void> }[] = [];

function knoten(opt: { port?: number; maxHeaders: number }) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  let sync: SyncManager;
  /** Was dieser Knoten an Nachrichten BEKOMMEN hat. */
  const z = { headers: 0, getdata: 0 };

  const peers = new PeerManager({
    params: REGTEST, agent: 'test/0.1', listenPort: opt.port ?? 0, host: '127.0.0.1',
    kette: () => {
      const t = chain.tip();
      return { height: t?.height ?? -1, chainWork: t?.chainWork ?? 0n };
    },
    onReady: p => sync.aufPeer(p),
    onMessage: (p, f) => {
      if (f.command === 'headers') z.headers++;
      if (f.command === 'getdata') z.getdata++;
      sync.aufNachricht(p, f);
    },
  });
  sync = new SyncManager({ chain, store, peers, params: REGTEST, maxHeaders: opt.maxHeaders });

  let gestoppt = false;
  const k = {
    store, chain, peers, sync, z,
    async start() { await peers.start(); sync.start(); },
    async stop() { if (gestoppt) return; gestoppt = true; sync.stop(); await peers.stop(); store.close(); },
  };
  alle.push(k);
  return k;
}
type Knoten = ReturnType<typeof knoten>;

function fuelle(k: Knoten, n: number) {
  for (const b of kette().bloecke.slice(0, n)) {
    const r = k.chain.accept(b.body);
    assert.ok(r.ok, `Testkette nicht annehmbar: ${zeig(r)}`);
  }
}

/** Warten, bis der Knoten die Höhe hat -- oder die Zeit um ist. */
async function bisHoehe(k: Knoten, hoehe: number, ms: number) {
  const ende = Date.now() + ms;
  while (k.chain.height() < hoehe && Date.now() < ende) await warte(25);
}

/** Eine Gegenseite, die der Test selbst spielt. Merkt sich, was sie bekommt. */
function gegenseite(name: string) {
  const g = {
    host: name, port: 8646, ready: true,
    bekommen: [] as { befehl: string; payload: Uint8Array }[],
    getrennt: [] as string[],
    arbeit: 1_000_000n,                     // mehr, als die ganze Testkette hat
    send(befehl: string, payload: Uint8Array) {
      if (!g.ready) return false;
      g.bekommen.push({ befehl, payload });
      return true;
    },
    close(grund: string) { g.getrennt.push(grund); g.ready = false; },
    fremdeArbeit: () => g.arbeit,
    zahl: (befehl: string) => g.bekommen.filter(x => x.befehl === befehl).length,
    letzterLocator: () => {
      const f = g.bekommen.filter(x => x.befehl === 'getheaders');
      return decodeGetHeaders(f[f.length - 1].payload).locator;
    },
  };
  return g;
}
type Gegenseite = ReturnType<typeof gegenseite>;
const alsPeer = (g: Gegenseite) => g as unknown as PeerConnection;

const headerVon = (bs: Gemint[]) => encodeHeaders(bs.map(g => g.body.slice(0, 136)));
const sendeHeader = (k: Knoten, g: Gegenseite, von: number, bis: number) =>
  k.sync.aufNachricht(alsPeer(g), { command: 'headers', payload: headerVon(kette().bloecke.slice(von, bis)) });
const sendeBlock = (k: Knoten, g: Gegenseite, h: number) =>
  k.sync.aufNachricht(alsPeer(g), { command: 'block', payload: kette().bloecke[h].body });

after(async () => { for (const k of alle) await k.stop(); });

// ------------------------------------------------------------ echte Knoten

test('Ein Rückstand von mehreren Header-Nachrichten wird mit einer Anfrage je Nachricht aufgeholt', async () => {
  const pA = naechsterPort();
  const a = knoten({ port: pA, maxHeaders: 20 });
  await a.start();
  fuelle(a, LAENGE);

  const b = knoten({ maxHeaders: 20 });
  await b.start();
  b.peers.verbinde('127.0.0.1', pA);
  await bisHoehe(b, LAENGE - 1, 10_000);
  // Noch einen Moment: Eine Schleife aus Header-Anfragen liefe jetzt weiter.
  await warte(300);

  assert.equal(b.chain.height(), LAENGE - 1, 'B hat nicht aufgeholt');
  assert.equal(toHex(b.chain.tip()!.hash), toHex(a.chain.tip()!.hash));
  assert.equal(toHex(stateRoot(b.chain.state())), toHex(stateRoot(a.chain.state())));
  assert.equal(b.sync.fehlendeBloecke(), 0);

  // 70 Header in Nachrichten zu 20: vier Nachrichten (20, 20, 20, 10).
  // Vorher kam nach jedem Paket Blöcke eine weitere, immer wieder dieselbe.
  assert.equal(b.z.headers, 4, `B hat ${b.z.headers} Header-Nachrichten bekommen`);

  await a.stop(); await b.stop();
});

test('Zwei volle Knoten: weitergefragt wird bei einem, und nur einer liefert die Blöcke', async () => {
  const p1 = naechsterPort(), p2 = naechsterPort();
  const a1 = knoten({ port: p1, maxHeaders: 20 });
  const a2 = knoten({ port: p2, maxHeaders: 20 });
  await a1.start(); await a2.start();
  fuelle(a1, LAENGE); fuelle(a2, LAENGE);

  const b = knoten({ maxHeaders: 20 });
  await b.start();
  // Der Knoten wählt je Takt (15 s) nur einen Seed an. Hier beide sofort.
  b.peers.verbinde('127.0.0.1', p1); b.peers.verbinde('127.0.0.1', p2);
  await bisHoehe(b, LAENGE - 1, 10_000);
  await warte(300);

  assert.equal(b.chain.height(), LAENGE - 1, 'B hat nicht aufgeholt');
  assert.equal(toHex(b.chain.tip()!.hash), toHex(a1.chain.tip()!.hash));
  // Vier Nachrichten decken die Kette, dazu die erste Antwort des zweiten
  // Knotens. Seine Header sind schon bekannt; weitergefragt wird bei ihm
  // nicht. Vorher waren es mit zwei Knoten über hundert.
  assert.equal(b.z.headers, 5, `B hat ${b.z.headers} Header-Nachrichten bekommen`);
  // Die Blöcke bestellt B bei genau einem der beiden: Über zwei verteilt
  // kämen sie durcheinander an.
  assert.ok(a1.z.getdata === 0 || a2.z.getdata === 0,
    `Bestellungen bei beiden: ${a1.z.getdata} und ${a2.z.getdata}`);
  assert.ok(a1.z.getdata + a2.z.getdata > 0);

  await a1.stop(); await a2.stop(); await b.stop();
});

test('Ein Knoten mit kürzerer Kette hält das Aufholen vom längeren nicht auf', async () => {
  /*
    Der kurze Knoten kennt 40 Blöcke, der lange alle 70. Kommen die ersten
    Header vom kurzen, bringen die des langen zunächst nichts Neues, und
    hinter Block 39 hat der kurze nichts mehr. Ist die Warteschlange dann
    abgearbeitet, muss beim langen neu gefragt werden -- sonst bleibt der
    neue Knoten bei 39 stehen.

    Beide Reihenfolgen: Welche Antwort zuerst ankommt, soll keine Rolle
    spielen.
  */
  for (const kurzZuerst of [true, false]) {
    const pK = naechsterPort(), pL = naechsterPort();
    const kurz = knoten({ port: pK, maxHeaders: 20 });
    const lang = knoten({ port: pL, maxHeaders: 20 });
    await kurz.start(); await lang.start();
    fuelle(kurz, 40); fuelle(lang, LAENGE);

    const b = knoten({ maxHeaders: 20 });
    await b.start();
    for (const p of kurzZuerst ? [pK, pL] : [pL, pK]) b.peers.verbinde('127.0.0.1', p);
    await bisHoehe(b, LAENGE - 1, 10_000);
    await warte(200);

    assert.equal(b.chain.height(), LAENGE - 1,
      `B steht bei ${b.chain.height()} (kurzer Knoten ${kurzZuerst ? 'zuerst' : 'zuletzt'})`);
    assert.equal(toHex(b.chain.tip()!.hash), toHex(lang.chain.tip()!.hash));
    // Der kurze Knoten erfährt die fehlenden Blöcke über B.
    await bisHoehe(kurz, LAENGE - 1, 5_000);
    assert.equal(kurz.chain.height(), LAENGE - 1, 'Der kurze Knoten hat nicht nachgezogen');

    await kurz.stop(); await lang.stop(); await b.stop();
  }
});

// ------------------------------------------- der Test spielt die Gegenseite

test('Die Warteschlange hat eine Grenze, und dahinter geht es trotzdem weiter', () => {
  const NACHRICHT = 5;
  const grenze = WARTESCHLANGE_NACHRICHTEN * NACHRICHT;     // 50 von 70
  assert.ok(grenze < LAENGE);

  const b = knoten({ maxHeaders: NACHRICHT });
  const g = gegenseite('203.0.113.9');

  // Header-Nachrichten, bis die Grenze erreicht ist.
  let von = 0;
  while (von < grenze) {
    const vorher = g.zahl('getheaders');
    sendeHeader(b, g, von, von + NACHRICHT);
    von += NACHRICHT;
    assert.equal(b.sync.fehlendeBloecke(), von);
    if (von < grenze) {
      assert.equal(g.zahl('getheaders'), vorher + 1, `nach ${von} Headern wird weitergefragt`);
      // ... und zwar hinter dem letzten erhaltenen Header.
      assert.equal(toHex(g.letzterLocator()[0]), toHex(kette().bloecke[von - 1].hash));
    } else {
      assert.equal(g.zahl('getheaders'), vorher, 'An der Grenze wird nicht weitergefragt');
    }
  }
  // Eine weitere Nachricht wird nicht mehr eingereiht.
  sendeHeader(b, g, grenze, grenze + NACHRICHT);
  assert.equal(b.sync.fehlendeBloecke(), grenze, 'Die Warteschlange wächst nicht über die Grenze');

  // Dieselbe Nachricht noch einmal: nichts Neues, also auch keine neue Anfrage.
  const fragenVorher = g.zahl('getheaders');
  sendeHeader(b, g, 0, NACHRICHT);
  assert.equal(g.zahl('getheaders'), fragenVorher, 'Eine Nachricht ohne neue Header löst keine Anfrage aus');

  /*
    Jetzt die Körper. Mit dem letzten ist die Warteschlange leer, und es
    wird ab dem eigenen Kopf neu gefragt. Die Gegenseite meldet dabei eine
    Arbeit, die wir längst überholt haben: So alt ist die Angabe aus dem
    Handschlag bei einer Verbindung, die schon lange steht. Gefragt wird
    trotzdem -- vermerkt ist, dass die letzte volle Nachricht nicht
    fortgesetzt wurde.
  */
  g.arbeit = 1n;
  for (let h = 0; h < grenze; h++) sendeBlock(b, g, h);
  assert.equal(b.chain.height(), grenze - 1);
  assert.equal(b.sync.fehlendeBloecke(), 0);
  assert.equal(g.zahl('getheaders'), fragenVorher + 1, 'Nach dem letzten Körper wird neu gefragt');
  assert.equal(toHex(g.letzterLocator()[0]), toHex(kette().bloecke[grenze - 1].hash),
    'Der Locator beginnt am eigenen Kopf');

  // Der Rest der Kette auf demselben Weg.
  for (von = grenze; von < LAENGE; von += NACHRICHT) sendeHeader(b, g, von, von + NACHRICHT);
  for (let h = grenze; h < LAENGE; h++) sendeBlock(b, g, h);
  assert.equal(b.chain.height(), LAENGE - 1);
  assert.equal(toHex(b.chain.tip()!.hash), toHex(kette().bloecke[LAENGE - 1].hash));
  // Am Ende ist nichts mehr vermerkt: Es wird nicht endlos weitergefragt.
  const amEnde = g.zahl('getheaders');
  sendeBlock(b, g, LAENGE - 1);                    // schon bekannt
  assert.equal(g.zahl('getheaders'), amEnde);
});

test('Bestellt wird bei einem Peer; fällt er aus, übernimmt der andere', () => {
  const b = knoten({ maxHeaders: 20 });
  const eins = gegenseite('203.0.113.1'), zwei = gegenseite('203.0.113.2');

  sendeHeader(b, eins, 0, 20);
  assert.equal(eins.zahl('getdata'), 1);
  assert.ok(b.sync.offeneAnfragen() > 0);

  // Der zweite kennt dieselben Header. Bestellt wird bei ihm nichts, solange
  // beim ersten etwas offen ist.
  sendeHeader(b, zwei, 0, 20);
  assert.equal(zwei.zahl('getdata'), 0, 'Solange der erste liefert, wird beim zweiten nicht bestellt');

  // Der erste liefert ein paar Blöcke: Nachbestellt wird bei ihm.
  for (let h = 0; h < 5; h++) sendeBlock(b, eins, h);
  assert.equal(b.chain.height(), 4);
  assert.ok(eins.zahl('getdata') > 1);
  assert.equal(zwei.zahl('getdata'), 0);

  // Dann fällt er aus. Seine offenen Bestellungen laufen ab ...
  eins.close('weg');
  const innen = b.sync as unknown as {
    offen: Map<string, { seit: number }>; pruefeOffene(): void };
  assert.ok(innen.offen.size > 0);
  for (const a of innen.offen.values()) a.seit -= 60_000;
  innen.pruefeOffene();
  assert.equal(b.sync.offeneAnfragen(), 0);

  // ... und die nächste Nachricht des zweiten holt die Blöcke bei ihm.
  const beimErsten = eins.zahl('getdata');
  sendeHeader(b, zwei, 0, 20);
  assert.equal(zwei.zahl('getdata'), 1, 'Der zweite übernimmt');
  assert.equal(eins.zahl('getdata'), beimErsten, 'Beim ausgefallenen wird nichts mehr bestellt');
  for (let h = 5; h < 20; h++) sendeBlock(b, zwei, h);
  assert.equal(b.chain.height(), 19);
});

test('Ein Block vor seinem Vorgänger: Header werden nachgefordert, und der Block kommt wieder in die Reihe', () => {
  const b = knoten({ maxHeaders: 20 });
  const g = gegenseite('203.0.113.9');

  sendeHeader(b, g, 0, 12);
  assert.equal(b.sync.fehlendeBloecke(), 12);
  const fragen = g.zahl('getheaders');

  // Block 5 trifft vor Block 0..4 ein: Er lässt sich nicht annehmen.
  sendeBlock(b, g, 5);
  assert.equal(b.chain.height(), -1);
  assert.equal(g.getrennt.length, 0, 'Das ist kein Fehlverhalten');
  assert.equal(g.zahl('getheaders'), fragen + 1, 'Die Header werden nachgefordert');
  assert.equal(b.sync.fehlendeBloecke(), 11, 'Der Block steht nicht mehr in der Warteschlange');

  // Die Antwort bringt ihn zurück -- und nur ihn: Die anderen stehen schon.
  sendeHeader(b, g, 0, 12);
  assert.equal(b.sync.fehlendeBloecke(), 12);

  for (let h = 0; h < 12; h++) sendeBlock(b, g, h);
  assert.equal(b.chain.height(), 11);
  assert.equal(b.sync.fehlendeBloecke(), 0);
});

test('Ein angekündigter Block, der schon in der Warteschlange steht, wird nicht eigens geholt', () => {
  const b = knoten({ maxHeaders: 20 });
  const g = gegenseite('203.0.113.9');
  const kuendigeAn = (h: number) => b.sync.aufNachricht(alsPeer(g), { command: 'inv',
    payload: encodeInv([{ typ: INV_BLOCK, hash: kette().bloecke[h].hash }]) });

  sendeHeader(b, g, 0, 20);
  sendeHeader(b, g, 20, 40);
  assert.equal(b.sync.fehlendeBloecke(), 40);
  const offen = b.sync.offeneAnfragen();
  assert.ok(offen > 0 && offen <= BLOCK_FENSTER);
  const bestellungen = g.zahl('getdata');

  // Block 30 steht in der Warteschlange, ist aber noch nicht bestellt.
  // Vorher wurde er auf die Ankündigung hin sofort geholt, kam vor seinem
  // Vorgänger an und wurde verworfen.
  kuendigeAn(30);
  assert.equal(g.zahl('getdata'), bestellungen, 'Ein eingereihter Block wird nicht eigens bestellt');
  assert.equal(b.sync.offeneAnfragen(), offen);

  // Block 60 ist ganz neu für uns: Der wird bestellt, wie bisher.
  kuendigeAn(60);
  assert.equal(g.zahl('getdata'), bestellungen + 1);

  // Er kommt, bevor wir so weit sind. Nach dem Aufholen der 40 wird deshalb
  // noch einmal gefragt -- hinter der Warteschlange geht es weiter.
  sendeBlock(b, g, 60);
  const fragen = g.zahl('getheaders');
  for (let h = 0; h < 40; h++) sendeBlock(b, g, h);
  assert.equal(b.chain.height(), 39);
  assert.equal(g.zahl('getheaders'), fragen + 1, 'Nach dem Aufholen wird neu gefragt');
  assert.equal(toHex(g.letzterLocator()[0]), toHex(kette().bloecke[39].hash));
});
