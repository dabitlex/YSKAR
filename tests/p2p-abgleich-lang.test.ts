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
import { encodeHeaders, decodeGetHeaders, decodeGetData, encodeInv, encodeNotFound, INV_BLOCK, INV_TX }
  from '../src/lib/node/p2p/messages.ts';
import type { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { stateRoot, emptyState, applyBlock } from '../src/lib/core/state.ts';
import { baueKette, mineBlock, MINER_B, zeig, type Kette, type Gemint } from './helpers/regtest.ts';

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

/**
 * Dem Knoten gespielte Gegenseiten als seine Peers unterschieben -- fuer
 * die Stellen, an denen er selbst einen Peer auswaehlt.
 */
function mitPeers(k: Knoten, gs: Gegenseite[]) {
  const bereite = () => gs.filter(g => g.ready).map(alsPeer);
  k.peers.bereite = bereite;
  k.peers.besterPeer = () => {
    let best: PeerConnection | null = null;
    for (const q of bereite()) if (!best || q.fremdeArbeit() > best.fremdeArbeit()) best = q;
    return best;
  };
}

/** Was eine Gegenseite an Bloecken bestellt bekam, als Hex-Hashes. */
const bestelltBei = (g: Gegenseite) => g.bekommen.filter(x => x.befehl === 'getdata')
  .flatMap(x => decodeGetData(x.payload));
/** Die Gegenseite antwortet auf alles Bestellte: nicht gefunden. */
const hatNichts = (k: Knoten, g: Gegenseite) => k.sync.aufNachricht(alsPeer(g),
  { command: 'notfound', payload: encodeNotFound(bestelltBei(g)) });

/** Der Abgleich von innen: offene Bestellungen und der Takt. */
const innen = (k: Knoten) => k.sync as unknown as {
  offen: Map<string, { seit: number; peer: PeerConnection }>; pruefeOffene(): void };
const lasseVerfallen = (k: Knoten) => { for (const a of innen(k).offen.values()) a.seit -= 60_000; };

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
  assert.ok(innen(b).offen.size > 0);
  lasseVerfallen(b);
  innen(b).pruefeOffene();
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

  // Ein Block, den wir schon haben, löst danach keine Header-Anfrage aus --
  // auch nicht bei einem Peer, der mehr Arbeit gemeldet hat als wir.
  const amEnde = g.zahl('getheaders');
  sendeBlock(b, g, 7);
  sendeBlock(b, g, 11);
  assert.equal(g.zahl('getheaders'), amEnde);
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

test('Ein Lieferant, der nur tropfenweise liefert, wird abgelöst', () => {
  /*
    Der erste Peer liefert, aber so langsam, dass Bestellungen verfallen.
    Jeder seiner Blöcke bestellt bei ihm nach -- mit frischer Uhr. Ohne
    Gegenmaßnahme hätte er immer eine nicht verfallene Bestellung offen und
    behielte das Aufholen für sich, während ein schneller Peer daneben
    steht.
  */
  const b = knoten({ maxHeaders: 40 });
  const langsam = gegenseite('203.0.113.1'), schnell = gegenseite('203.0.113.2');
  schnell.arbeit = 2_000_000n;
  mitPeers(b, [langsam, schnell]);

  sendeHeader(b, langsam, 0, 40);
  sendeHeader(b, schnell, 0, 40);
  assert.equal(schnell.zahl('getdata'), 0);

  // Die ersten Bestellungen altern; dann kommt ein einzelner Block, und
  // der bestellt beim langsamen nach.
  lasseVerfallen(b);
  sendeBlock(b, langsam, 0);
  const frisch = [...innen(b).offen.values()].filter(a => Date.now() - a.seit < 5_000).length;
  assert.ok(frisch > 0, 'Der langsame hat eine frische Bestellung offen');
  assert.equal(schnell.zahl('getdata'), 0);

  // Der Takt: Eine verfallene Bestellung genügt, und er verliert alle.
  const beimLangsamen = langsam.zahl('getdata');
  innen(b).pruefeOffene();
  assert.ok(schnell.zahl('getdata') >= 1, 'Der schnelle Peer übernimmt');
  assert.equal(langsam.zahl('getdata'), beimLangsamen, 'Beim langsamen wird nicht nachbestellt');
  for (const a of innen(b).offen.values()) assert.equal(a.peer, alsPeer(schnell));

  for (let h = 1; h < 40; h++) sendeBlock(b, schnell, h);
  assert.equal(b.chain.height(), 39);
});

test('Bleibt die Warteschlange liegen, stößt der Takt die Bestellung wieder an', () => {
  const b = knoten({ maxHeaders: 20 });
  const eins = gegenseite('203.0.113.1'), zwei = gegenseite('203.0.113.2');
  mitPeers(b, [eins]);

  sendeHeader(b, eins, 0, 12);
  assert.ok(b.sync.offeneAnfragen() > 0);
  // Der einzige Peer hat die Blöcke nicht. Einen anderen gibt es nicht.
  const bestellt = eins.bekommen.filter(x => x.befehl === 'getdata')
    .flatMap(x => decodeGetData(x.payload));
  b.sync.aufNachricht(alsPeer(eins), { command: 'notfound', payload: encodeNotFound(bestellt) });
  assert.equal(b.sync.offeneAnfragen(), 0);
  assert.equal(b.sync.fehlendeBloecke(), 12, 'Die Blöcke stehen noch an');

  // Später ist ein zweiter Peer da. Er schickt von sich aus nichts -- ohne
  // den Takt bliebe die Warteschlange liegen, denn verfallen ist nichts.
  mitPeers(b, [eins, zwei]);
  zwei.arbeit = 2_000_000n;
  innen(b).pruefeOffene();
  assert.equal(zwei.zahl('getdata'), 1, 'Der Takt bestellt beim zweiten');
  for (let h = 0; h < 12; h++) sendeBlock(b, zwei, h);
  assert.equal(b.chain.height(), 11);
});

test('Ein angekündigter Block wird sofort geholt, wenn sein Vorgänger da ist -- auch aus der Warteschlange', () => {
  /*
    Vorn in der Warteschlange stehen Header, deren Blöcke nie kommen
    (zwanzig Geschwister auf Höhe 3, die es bei niemandem gibt). Dahinter
    steht der echte Block 3, dessen Vorgänger wir haben. Wird er
    angekündigt, muss er sofort geholt werden: Ein neuer Kopf darf nicht
    hinter einer verstopften Warteschlange warten.
  */
  const b = knoten({ maxHeaders: 40 });
  const g = gegenseite('203.0.113.9');
  mitPeers(b, [g]);
  for (let h = 0; h < 3; h++) assert.ok(b.chain.accept(kette().bloecke[h].body).ok);

  const state = emptyState();
  for (const k of kette().bloecke.slice(0, 3)) assert.ok(applyBlock(state, k.block, REGTEST).ok);
  const nieGeliefert = Array.from({ length: 20 }, (_, i) => mineBlock({
    height: 3, prevHash: kette().bloecke[2].hash, state,
    timestamp: kette().bloecke[2].block.header.timestamp + 600n + BigInt(i),
    miner: MINER_B, extra: `nie-${i}` }));
  b.sync.aufNachricht(alsPeer(g), { command: 'headers', payload: headerVon(nieGeliefert) });
  // Die echten Header 3, 4 und 5 dahinter. (Bis Teil B fehlte 4 hier
  // absichtlich; seit Teil B wird ein Header, der an nichts Bekanntes
  // anschliesst, gar nicht erst eingereiht. 5 wartet jetzt auf 4.)
  b.sync.aufNachricht(alsPeer(g), { command: 'headers',
    payload: headerVon([kette().bloecke[3], kette().bloecke[4], kette().bloecke[5]]) });
  const key = (h: number) => toHex(kette().bloecke[h].hash);
  assert.ok(!innen(b).offen.has(key(3)), 'Block 3 ist eingereiht, aber nicht bestellt');
  assert.ok(!innen(b).offen.has(key(5)));

  const bestellungen = g.zahl('getdata');
  const kuendigeAn = (h: number) => b.sync.aufNachricht(alsPeer(g), { command: 'inv',
    payload: encodeInv([{ typ: INV_BLOCK, hash: kette().bloecke[h].hash }]) });

  // Block 5: Sein Vorgänger (4) fehlt uns noch. Er ließe sich nicht annehmen.
  kuendigeAn(5);
  assert.equal(g.zahl('getdata'), bestellungen, 'Ohne Vorgänger wird ein eingereihter Block nicht geholt');

  // Block 3: Sein Vorgänger ist unser Kopf.
  kuendigeAn(3);
  assert.equal(g.zahl('getdata'), bestellungen + 1, 'Mit Vorgänger wird er sofort geholt');
  sendeBlock(b, g, 3);
  assert.equal(b.chain.height(), 3);
});

test('Zwei Knoten mit kurzer Kette vor dem langen: bestellt wird am Ende beim langen', async () => {
  /*
    Die Header kommen vom langen Knoten, geliefert wird zuerst von einem
    kurzen. Hinter Block 29 hat der nichts mehr und antwortet "nicht
    gefunden". Vorher ging die Bestellung dann an den ersten anderen Peer
    der Liste -- den zweiten kurzen --, und die beiden reichten sie endlos
    hin und her.
  */
  const pK1 = naechsterPort(), pK2 = naechsterPort(), pL = naechsterPort();
  const k1 = knoten({ port: pK1, maxHeaders: 20 });
  const k2 = knoten({ port: pK2, maxHeaders: 20 });
  const lang = knoten({ port: pL, maxHeaders: 20 });
  await k1.start(); await k2.start(); await lang.start();
  fuelle(k1, 30); fuelle(k2, 30); fuelle(lang, LAENGE);

  const b = knoten({ maxHeaders: 20 });
  await b.start();
  for (const p of [pK1, pK2, pL]) b.peers.verbinde('127.0.0.1', p);
  await bisHoehe(b, LAENGE - 1, 10_000);

  assert.equal(b.chain.height(), LAENGE - 1, `B steht bei ${b.chain.height()}`);
  assert.equal(toHex(b.chain.tip()!.hash), toHex(lang.chain.tip()!.hash));
  assert.ok(lang.z.getdata > 0, 'Beim langen Knoten wurde bestellt');

  await k1.stop(); await k2.stop(); await lang.stop(); await b.stop();
});

test('Hat ein Peer einen Block nicht, wird der mit der meisten Arbeit gefragt', () => {
  // Dieselbe Lage wie eben, Nachricht für Nachricht: zwei kurze Peers stehen
  // in der Liste vor dem langen.
  const b = knoten({ maxHeaders: 20 });
  const kurz1 = gegenseite('203.0.113.1'), kurz2 = gegenseite('203.0.113.2');
  const lang = gegenseite('203.0.113.3');
  kurz1.arbeit = 30n; kurz2.arbeit = 30n; lang.arbeit = 70n;
  mitPeers(b, [kurz1, kurz2, lang]);

  // Bestellt wird beim ersten kurzen -- der hat die Blöcke nicht.
  sendeHeader(b, kurz1, 0, 12);
  assert.equal(kurz1.zahl('getdata'), 1);
  const bestellt = kurz1.bekommen.filter(x => x.befehl === 'getdata')
    .flatMap(x => decodeGetData(x.payload));
  b.sync.aufNachricht(alsPeer(kurz1), { command: 'notfound', payload: encodeNotFound(bestellt) });

  assert.equal(kurz2.zahl('getdata'), 0, 'Nicht der nächste in der Liste');
  assert.equal(lang.zahl('getdata'), 1, 'Sondern der mit der meisten Arbeit');
  for (let h = 0; h < 12; h++) sendeBlock(b, lang, h);
  assert.equal(b.chain.height(), 11);
  assert.equal(kurz1.zahl('getdata'), 1, 'Beim ersten wird nicht nachbestellt');
});

test('Das Fenster: sechzehn Blöcke auf einmal, nicht mehr und nicht weniger', () => {
  const b = knoten({ maxHeaders: 40 });
  const g = gegenseite('203.0.113.9');
  sendeHeader(b, g, 0, 40);
  assert.equal(BLOCK_FENSTER, 16);
  assert.equal(b.sync.offeneAnfragen(), 16, 'Die erste Bestellung füllt das Fenster');
  assert.equal(bestelltBei(g).length, 16);
  // Mit jedem Block rückt genau einer nach.
  for (let h = 0; h < 10; h++) {
    sendeBlock(b, g, h);
    assert.equal(b.sync.offeneAnfragen(), 16);
  }
  for (let h = 10; h < 40; h++) sendeBlock(b, g, h);
  assert.equal(b.chain.height(), 39);
  assert.equal(bestelltBei(g).length, 40, 'Kein Block wurde doppelt bestellt');
});

test('"Nicht gefunden" für etwas anderes als einen Block der Warteschlange ändert am Aufholen nichts', () => {
  const b = knoten({ maxHeaders: 40 });
  const eins = gegenseite('203.0.113.1'), zwei = gegenseite('203.0.113.2');
  mitPeers(b, [eins, zwei]);
  // Fünf Blöcke beim ersten bestellt; die Header der nächsten zwanzig kommen
  // vom zweiten. Im Fenster ist Platz -- ein Wechsel des Lieferanten fiele
  // sofort auf.
  sendeHeader(b, eins, 0, 5);
  sendeHeader(b, zwei, 5, 25);
  assert.equal(bestelltBei(zwei).length, 0);

  // Der Lieferant meldet eine Überweisung als nicht (mehr) vorhanden, und
  // einen Block, den wir nie bei ihm bestellt haben.
  b.sync.aufNachricht(alsPeer(eins), { command: 'notfound', payload: encodeNotFound([
    { typ: INV_TX, hash: new Uint8Array(32).fill(7) },
    { typ: INV_BLOCK, hash: kette().bloecke[60].hash },
  ]) });
  assert.equal(bestelltBei(zwei).length, 0, 'Der Lieferant bleibt derselbe');
  assert.equal(b.sync.offeneAnfragen(), 5);
  innen(b).pruefeOffene();
  assert.equal(bestelltBei(zwei).length, 0, 'Auch der Takt bestellt nicht beim zweiten');

  for (let h = 0; h < 25; h++) sendeBlock(b, eins, h);
  assert.equal(b.chain.height(), 24);
  assert.equal(bestelltBei(eins).length, 25);
  assert.equal(bestelltBei(zwei).length, 0);
});

test('Säumig, nicht vorhanden, vorhanden: Es wird der Reihe nach bei jedem versucht', () => {
  /*
    Drei Peers. Der mit der meisten Arbeit liefert nicht, der zweite hat die
    Blöcke nicht, der dritte hat sie. Wer in dieser Runde schon versagt hat,
    wird nicht noch einmal gefragt, solange ein anderer übrig ist.
  */
  const b = knoten({ maxHeaders: 20 });
  const traege = gegenseite('203.0.113.1'), leer = gegenseite('203.0.113.2');
  const voll = gegenseite('203.0.113.3');
  traege.arbeit = 90n; leer.arbeit = 80n; voll.arbeit = 70n;
  mitPeers(b, [traege, leer, voll]);

  sendeHeader(b, traege, 0, 20);
  assert.equal(bestelltBei(traege).length, 16);

  // Der träge lässt alles verfallen: Der Takt bestellt beim nächsten.
  lasseVerfallen(b);
  innen(b).pruefeOffene();
  assert.equal(bestelltBei(leer).length, 16, 'Der zweite wird gefragt');
  assert.equal(bestelltBei(voll).length, 0);

  // Der zweite hat sie nicht: weiter zum dritten, NICHT zurück zum trägen.
  const beimTraegen = bestelltBei(traege).length;
  hatNichts(b, leer);
  assert.equal(bestelltBei(voll).length, 16, 'Der dritte wird gefragt');
  assert.equal(bestelltBei(traege).length, beimTraegen, 'Der träge wird nicht noch einmal gefragt');

  for (let h = 0; h < 20; h++) sendeBlock(b, voll, h);
  assert.equal(b.chain.height(), 19);
});

test('Hat kein Peer den Block, wird nicht im Kreis bestellt, sondern im Takt neu versucht', () => {
  const b = knoten({ maxHeaders: 20 });
  const a = gegenseite('203.0.113.1'), c = gegenseite('203.0.113.2'), d = gegenseite('203.0.113.3');
  a.arbeit = 90n; c.arbeit = 80n; d.arbeit = 70n;
  mitPeers(b, [a, c, d]);

  sendeHeader(b, a, 0, 12);
  hatNichts(b, a);
  hatNichts(b, c);
  hatNichts(b, d);
  const gesamt = () => a.zahl('getdata') + c.zahl('getdata') + d.zahl('getdata');
  // Jeder wurde genau einmal gefragt -- und danach keiner mehr.
  assert.deepEqual([a.zahl('getdata'), c.zahl('getdata'), d.zahl('getdata')], [1, 1, 1]);
  assert.equal(b.sync.offeneAnfragen(), 0);
  assert.equal(b.sync.fehlendeBloecke(), 12);

  // Der Takt beginnt eine neue Runde: eine Bestellung, beim besten.
  innen(b).pruefeOffene();
  assert.equal(gesamt(), 4);
  assert.equal(a.zahl('getdata'), 2);
  // Solange die offen ist, tut ein weiterer Takt nichts.
  innen(b).pruefeOffene();
  assert.equal(gesamt(), 4);
});

test('Ist die Warteschlange leer und mehr vermerkt, wird der liefernde Peer gefragt -- auch neben einem, der mehr Arbeit behauptet', () => {
  const b = knoten({ maxHeaders: 5 });
  const ehrlich = gegenseite('203.0.113.1'), prahler = gegenseite('203.0.113.2');
  // Der ehrliche hat beim Handschlag wenig gemeldet (die Verbindung ist
  // alt), der andere behauptet sehr viel.
  ehrlich.arbeit = 1n; prahler.arbeit = 10n ** 30n;
  mitPeers(b, [ehrlich, prahler]);

  // Eine volle Nachricht vom ehrlichen; fortgesetzt wird hinter Block 4.
  sendeHeader(b, ehrlich, 0, 5);
  // Ein Block ohne Vorgänger vermerkt: Hinter der Warteschlange geht es weiter.
  sendeBlock(b, ehrlich, 30);
  const vorher = [ehrlich.zahl('getheaders'), prahler.zahl('getheaders')];

  for (let h = 0; h < 5; h++) sendeBlock(b, ehrlich, h);
  assert.equal(b.chain.height(), 4);
  assert.equal(b.sync.fehlendeBloecke(), 0);
  assert.equal(ehrlich.zahl('getheaders'), vorher[0] + 1, 'Der liefernde Peer wird gefragt');
  assert.ok(prahler.zahl('getheaders') <= vorher[1] + 1, 'Der andere bekommt höchstens eine Anfrage');
  assert.equal(toHex(ehrlich.letzterLocator()[0]), toHex(kette().bloecke[4].hash));
});

test('Zwei angekündigte Blöcke in einer Nachricht: Der zweite wird mitgeholt, wenn der erste geholt wird', () => {
  const b = knoten({ maxHeaders: 40 });
  const g = gegenseite('203.0.113.9');
  mitPeers(b, [g]);
  for (let h = 0; h < 3; h++) assert.ok(b.chain.accept(kette().bloecke[h].body).ok);

  // Wieder zwanzig Header vorn, deren Blöcke nie kommen; dahinter 3 und 4.
  const state = emptyState();
  for (const k of kette().bloecke.slice(0, 3)) assert.ok(applyBlock(state, k.block, REGTEST).ok);
  const nieGeliefert = Array.from({ length: 20 }, (_, i) => mineBlock({
    height: 3, prevHash: kette().bloecke[2].hash, state,
    timestamp: kette().bloecke[2].block.header.timestamp + 700n + BigInt(i),
    miner: MINER_B, extra: `nie2-${i}` }));
  b.sync.aufNachricht(alsPeer(g), { command: 'headers', payload: headerVon(nieGeliefert) });
  b.sync.aufNachricht(alsPeer(g), { command: 'headers',
    payload: headerVon([kette().bloecke[3], kette().bloecke[4]]) });

  const vorher = bestelltBei(g).length;
  b.sync.aufNachricht(alsPeer(g), { command: 'inv', payload: encodeInv([
    { typ: INV_BLOCK, hash: kette().bloecke[3].hash },
    { typ: INV_BLOCK, hash: kette().bloecke[4].hash },
  ]) });
  const neu = bestelltBei(g).slice(vorher).map(e => toHex(e.hash));
  assert.deepEqual(neu, [toHex(kette().bloecke[3].hash), toHex(kette().bloecke[4].hash)]);
  sendeBlock(b, g, 3); sendeBlock(b, g, 4);
  assert.equal(b.chain.height(), 4);
});

test('Neue Header von einem zweiten Peer: bestellt wird weiter beim ersten, solange bei ihm etwas offen ist', () => {
  /*
    Das Fenster ist nicht voll -- beim ersten Peer sind nur fünf Blöcke
    bestellt. Bringt jetzt ein zweiter Peer weitere Header, wäre Platz, bei
    ihm zu bestellen. Dann kämen seine Blöcke vor denen des ersten an und
    würden verworfen.
  */
  const b = knoten({ maxHeaders: 40 });
  const eins = gegenseite('203.0.113.1'), zwei = gegenseite('203.0.113.2');
  mitPeers(b, [eins, zwei]);

  sendeHeader(b, eins, 0, 5);
  assert.equal(bestelltBei(eins).length, 5);
  sendeHeader(b, zwei, 5, 25);
  assert.equal(b.sync.fehlendeBloecke(), 25);
  assert.equal(bestelltBei(zwei).length, 0, 'Beim zweiten wird noch nicht bestellt');

  // Der erste liefert: Nachbestellt wird bei ihm, in der Reihenfolge der Kette.
  for (let h = 0; h < 5; h++) sendeBlock(b, eins, h);
  assert.equal(b.chain.height(), 4);
  assert.ok(bestelltBei(eins).length > 5);
  assert.equal(bestelltBei(zwei).length, 0);
  for (let h = 5; h < 25; h++) sendeBlock(b, eins, h);
  assert.equal(b.chain.height(), 24);
});
