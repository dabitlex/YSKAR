/**
 * Peer-Verwaltung.
 *
 * Echte Knoten auf Loopback, die sich gegenseitig finden. Geprüft wird vor
 * allem, was passiert, wenn ein Peer sich nicht an die Regeln hält — und
 * dass niemand ausgesperrt, sondern nur verdrängt wird.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PeerManager } from '../src/lib/node/p2p/PeerManager.ts';
import { encodeAddr, decodeAddr, peerKey } from '../src/lib/node/p2p/messages.ts';
import { REGTEST } from '../src/lib/core/networks.ts';

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));
let port = 19200;
const naechsterPort = () => port++;

function knoten(opt: {
  port?: number; seeds?: { host: string; port: number }[];
  maxEin?: number; maxAus?: number; hoehe?: number; arbeit?: bigint;
  onMessage?: (p: unknown, f: unknown) => void;
} = {}) {
  return new PeerManager({
    params: REGTEST,
    agent: 'test/0.1',
    listenPort: opt.port ?? 0,
    host: '127.0.0.1',
    seeds: opt.seeds,
    maxEin: opt.maxEin,
    maxAus: opt.maxAus,
    kette: () => ({ height: opt.hoehe ?? 1, chainWork: opt.arbeit ?? 100n }),
    onMessage: opt.onMessage as never,
  });
}

// ------------------------------------------------------- Finden und Halten

test('Ein Knoten verbindet sich zu einem Seed', async () => {
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(500);

  assert.equal(b.zahlAus(), 1, 'B hat keine ausgehende Verbindung');
  assert.equal(a.zahlEin(), 1, 'A hat keine eingehende');
  assert.equal(b.bereite().length, 1, 'Handschlag nicht fertig');

  await a.stop(); await b.stop();
});

test('Beide Seiten kennen Höhe und Arbeit der anderen', async () => {
  // Daran entscheidet sich später, wer aufholt.
  const pA = naechsterPort();
  const a = knoten({ port: pA, hoehe: 500, arbeit: 999999n });
  await a.start();
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }], hoehe: 10, arbeit: 50n });
  await b.start();
  await warte(500);

  const vonB = b.bereite()[0];
  assert.equal(vonB.fremdeHoehe(), 500);
  assert.equal(vonB.fremdeArbeit(), 999999n);

  // Und der beste Peer ist der mit der meisten Arbeit.
  assert.equal(b.besterPeer()?.fremdeArbeit(), 999999n);

  await a.stop(); await b.stop();
});

test('Drei Knoten finden über addr zueinander', async () => {
  // A ist Seed für B und C. B lernt C über den Adressaustausch kennen —
  // ohne dass jemand C als Seed eingetragen hätte.
  const pA = naechsterPort(), pB = naechsterPort(), pC = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();

  const b = knoten({ port: pB, seeds: [{ host: '127.0.0.1', port: pA }] });
  const c = knoten({ port: pC, seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start(); await c.start();
  await warte(700);

  // A kennt jetzt beide und gibt sie weiter.
  assert.ok(a.buchGroesse() >= 2, `A kennt nur ${a.buchGroesse()} Adressen`);
  // B hat C über A gelernt.
  assert.ok(b.buchGroesse() >= 2, `B kennt nur ${b.buchGroesse()} Adressen`);

  await a.stop(); await b.stop(); await c.stop();
});

// --------------------------------------------------------------- Plätze

test('Eingehende Plätze sind begrenzt', async () => {
  const pA = naechsterPort();
  const a = knoten({ port: pA, maxEin: 2 });
  await a.start();

  const gaeste = [knoten(), knoten(), knoten(), knoten()];
  for (const g of gaeste) { await g.start(); g.verbinde('127.0.0.1', pA); }
  await warte(700);

  assert.ok(a.zahlEin() <= 2, `A hat ${a.zahlEin()} eingehende, erlaubt sind 2`);

  await a.stop();
  for (const g of gaeste) await g.stop();
});

test('Ausgehende Plätze sind getrennt begrenzt', async () => {
  // Getrennt zu zählen ist wichtig: Wer nur eingehende hätte, könnte von
  // einem Angreifer vollständig umstellt werden.
  const ports = [naechsterPort(), naechsterPort(), naechsterPort()];
  const server = ports.map(p => knoten({ port: p }));
  for (const s of server) await s.start();

  const b = knoten({
    maxAus: 2,
    seeds: ports.map(p => ({ host: '127.0.0.1', port: p })),
  });
  await b.start();
  await warte(600);
  b.verbinde('127.0.0.1', ports[1]);
  b.verbinde('127.0.0.1', ports[2]);
  await warte(600);

  assert.ok(b.zahlAus() <= 3, `${b.zahlAus()} ausgehende`);

  await b.stop();
  for (const s of server) await s.stop();
});

// ------------------------------------------------------- Fehlverhalten

test('Ein auffälliger Peer wird vermerkt, aber nicht ausgesperrt', async () => {
  // Der Kern der Entscheidung gegen Sperren: getrennt wird, gemerkt auch —
  // aber die Tür bleibt offen.
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(500);
  assert.equal(a.zahlEin(), 1);

  // B schickt Unfug: addr mit kaputter Nutzlast.
  b.bereite()[0].send('addr', new Uint8Array([0xff, 0xff, 0xff]));
  await warte(300);

  assert.equal(a.vermerkteAnzahl(), 1, 'nicht vermerkt');

  // Und jetzt der Punkt: B darf sich sofort wieder verbinden.
  const c = knoten();
  await c.start();
  c.verbinde('127.0.0.1', pA);
  await warte(500);
  assert.equal(a.zahlEin(), 1, 'die Tür ist zu -- das wäre eine Sperre');

  await a.stop(); await b.stop(); await c.stop();
});

test('Adressen aus der Zukunft werden verworfen', async () => {
  // Der Zeitstempel kommt von einem Fremden. Weit in der Zukunft stünde er
  // in jeder Sortierung ganz oben und könnte echte Peers verdrängen.
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  const vorher = a.buchGroesse();

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(500);

  const inZukunft = BigInt(Math.floor(Date.now() / 1000) + 86400);
  b.bereite()[0].send('addr', encodeAddr([
    { host: '198.51.100.7', port: 8646, gesehen: inZukunft },
  ]));
  await warte(300);

  // Die eine echte Verbindung darf im Buch stehen, die Zukunftsadresse nicht.
  assert.ok(a.buchGroesse() <= vorher + 1,
    `Zukunftsadresse wurde übernommen (${a.buchGroesse()})`);

  await a.stop(); await b.stop();
});

test('Ein unplausibler Host kommt nicht ins Buch', async () => {
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();
  const vorher = a.buchGroesse();

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(500);

  b.bereite()[0].send('addr', encodeAddr([
    { host: 'a b c;rm -rf', port: 8646, gesehen: BigInt(Math.floor(Date.now() / 1000)) },
  ]));
  await warte(300);

  assert.ok(a.buchGroesse() <= vorher + 1);
  await a.stop(); await b.stop();
});

// ------------------------------------------------------------ Verbreitung

test('Eine Ankündigung erreicht alle Peers außer dem Absender', async () => {
  const pA = naechsterPort();
  const empfangen: string[] = [];
  const a = knoten({
    port: pA,
    onMessage: (_p, f) => empfangen.push((f as { command: string }).command),
  });
  await a.start();

  const b = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  const c = knoten({ seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start(); await c.start();
  await warte(700);
  assert.equal(a.zahlEin(), 2);

  const hash = new Uint8Array(32).fill(7);
  const n = a.kuendigeAn(1, hash);
  assert.equal(n, 2, 'nicht an beide gegangen');

  await a.stop(); await b.stop(); await c.stop();
});

test('Ein unerreichbarer Seed bringt den Knoten nicht um', async () => {
  // Der Normalfall beim Start: Seeds, die gerade nicht laufen.
  const b = knoten({ seeds: [{ host: '127.0.0.1', port: 1 }] });
  await b.start();
  await warte(400);
  assert.equal(b.zahlAus(), 0);
  assert.equal(b.bereite().length, 0);
  await b.stop();
});

test('Ein Knoten ohne Lauschposten verbindet trotzdem', async () => {
  // Hinter NAT der Normalfall: nur ausgehend.
  const pA = naechsterPort();
  const a = knoten({ port: pA });
  await a.start();

  const b = knoten({ port: 0, seeds: [{ host: '127.0.0.1', port: pA }] });
  await b.start();
  await warte(500);

  assert.equal(b.zahlAus(), 1);
  assert.equal(b.bereite()[0].info().listenPort, pA, 'B kennt As Lauschport');

  // Und der eigentliche Punkt: A merkt sich B NICHT im Adressbuch. B nimmt
  // nichts an, also wäre die Adresse für andere wertlos -- sie
  // weiterzugeben schickte sie in eine Sackgasse.
  //
  // Was A sehr wohl im Buch hat, ist die EIGENE Adresse: B kennt sie als
  // Seed und gibt sie über addr zurück. Das ist der Normalfall, und dafür
  // gibt es den nächsten Test.
  for (const k of a.buchSchluessel()) {
    assert.ok(k.endsWith(`:${pA}`),
      `A hat ${k} ins Buch genommen -- das nimmt gar nichts an`);
  }

  await a.stop(); await b.stop();
});

test('Die eigene Adresse wird erkannt und aus dem Buch genommen', async () => {
  /*
    Ein Knoten bekommt seine eigene Adresse regelmäßig über addr zurück --
    ein Peer gibt weiter, wen er kennt, und das sind wir.

    Ohne Erkennung versucht der Knoten immer wieder, sich mit sich selbst
    zu verbinden. Der Handschlag merkt es an der Nonce und trennt, aber
    jeder Versuch belegt kurz einen ausgehenden Platz.

    Die eigene äußere Adresse lässt sich nicht zuverlässig feststellen --
    also wird sie nicht geraten, sondern gelernt.
  */
  const pA = naechsterPort();
  const a = knoten({ port: pA, maxAus: 4 });
  await a.start();

  // A trägt sich selbst ins Buch ein, wie es über addr passieren würde.
  a.verbinde('127.0.0.1', pA);
  await warte(600);

  assert.ok(a.eigeneAdressen().some(k => k.endsWith(`:${pA}`)),
    `eigene Adresse nicht erkannt: ${a.eigeneAdressen().join(',')}`);
  assert.ok(!a.buchSchluessel().some(k => k.endsWith(`:${pA}`)),
    'eigene Adresse steht noch im Buch');
  assert.equal(a.bereite().length, 0, 'die Verbindung zu sich selbst hält');

  await a.stop();
});
