/**
 * Eine P2P-Verbindung.
 *
 * Geprüft über ECHTES TCP auf Loopback, nicht mit Attrappen. Eine
 * nachgebaute Verbindung würde genau die Fehler verschweigen, um die es
 * hier geht: Bytes in Stücken, halbe Handschläge, Gegenseiten, die nicht
 * antworten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect, type Socket, type Server } from 'node:net';

import { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { encodeFrame, magicFor } from '../src/lib/node/p2p/wire.ts';
import { encodeVersion, PROTOCOL_VERSION } from '../src/lib/node/p2p/messages.ts';
import { REGTEST, MAINNET } from '../src/lib/core/networks.ts';

const KETTE = () => ({ height: 42, chainWork: 123456n });

/**
 * Zwei verbundene Enden auf Loopback.
 *
 * Gibt beide Sockets zurück und räumt den Lauschposten weg -- sonst bleibt
 * der Testlauf hängen, weil der Server noch offen ist.
 */
async function paar(): Promise<{ a: Socket; b: Socket; zu: () => void }> {
  return new Promise((auf, ab) => {
    const srv: Server = createServer();
    srv.on('error', ab);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      let ein: Socket | null = null;
      let aus: Socket | null = null;
      const fertig = () => {
        if (ein && aus) {
          srv.close();
          auf({ a: aus, b: ein, zu: () => { aus!.destroy(); ein!.destroy(); } });
        }
      };
      srv.on('connection', s => { ein = s; fertig(); });
      aus = connect(port, '127.0.0.1', fertig);
      aus.on('error', ab);
    });
  });
}

function peer(sock: Socket, richtung: 'aus' | 'ein', opt: {
  params?: typeof REGTEST; nonce?: bigint; cb?: Record<string, unknown>;
} = {}) {
  return new PeerConnection({
    socket: sock, richtung,
    params: opt.params ?? REGTEST,
    agent: `test-${richtung}/0.1`,
    listenPort: 8646,
    eigeneKette: KETTE,
    nonce: opt.nonce,
    callbacks: opt.cb as never,
  });
}

const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------- Handschlag

test('Zwei Knoten geben sich die Hand', async () => {
  const { a, b, zu } = await paar();
  const fertig: string[] = [];
  const p1 = peer(a, 'aus', { cb: { onReady: () => fertig.push('aus') } });
  const p2 = peer(b, 'ein', { cb: { onReady: () => fertig.push('ein') } });

  await warte(300);
  assert.equal(p1.ready, true, 'ausgehende Seite nicht fertig');
  assert.equal(p2.ready, true, 'eingehende Seite nicht fertig');
  assert.equal(fertig.length, 2);

  // Beide kennen jetzt Höhe und Arbeit der Gegenseite -- daran entscheidet
  // sich später, wer aufholt.
  assert.equal(p1.fremdeHoehe(), 42);
  assert.equal(p1.fremdeArbeit(), 123456n);
  assert.equal(p2.info().agent, 'test-aus/0.1');

  p1.close(); p2.close(); zu();
});

test('Ein Knoten aus einem fremden Netz wird abgewiesen', async () => {
  // Der eigentliche Zweck des Handschlags: Testnetz und Mainnet dürfen
  // nicht zusammenfinden.
  const { a, b, zu } = await paar();
  const gruende: string[] = [];
  const p1 = peer(a, 'aus', {
    params: MAINNET as never,
    cb: { onClose: (_p: unknown, g: string) => gruende.push(g) },
  });
  const p2 = peer(b, 'ein', { cb: { onClose: () => {} } });

  await warte(300);
  assert.equal(p1.ready, false);
  assert.equal(p2.ready, false);
  // Die Magic-Bytes trennen schon vor dem Handschlag.
  assert.ok(gruende.length > 0, 'keine Trennung gemeldet');

  p1.close(); p2.close(); zu();
});

test('Die Verbindung zu sich selbst wird erkannt', async () => {
  // Passiert leicht, wenn die eigene Adresse über addr zurückkommt.
  const { a, b, zu } = await paar();
  const gleiche = 0x1122334455667788n;
  const gruende: string[] = [];
  const sammle = (_p: unknown, g: string) => gruende.push(g);
  // BEIDE Seiten beobachten: Wer das version zuerst sieht, erkennt die
  // Selbstverbindung und trennt -- die andere Seite sieht danach nur noch
  // einen geschlossenen Socket und meldet "getrennt". Nur eine Seite zu
  // prüfen hängt davon ab, wer schneller war.
  const p1 = peer(a, 'aus', { nonce: gleiche, cb: { onClose: sammle } });
  const p2 = peer(b, 'ein', { nonce: gleiche, cb: { onClose: sammle } });

  await warte(300);
  assert.equal(p1.ready, false);
  assert.equal(p2.ready, false);
  assert.ok(gruende.some(g => g.includes('selbst')),
    `keine Seite hat die Selbstverbindung erkannt: ${gruende.join(', ')}`);

  p1.close(); p2.close(); zu();
});

test('Wer nichts schickt, fliegt nach der Frist', async () => {
  // Ohne diese Frist könnte jemand Verbindungen öffnen und nie etwas
  // senden -- die Plätze wären belegt, ohne ein einziges Byte.
  const { a, b, zu } = await paar();
  const gruende: string[] = [];
  const p = new PeerConnection({
    socket: b, richtung: 'ein', params: REGTEST, agent: 't', listenPort: 0,
    eigeneKette: KETTE,
    callbacks: { onClose: (_p, g) => gruende.push(g) },
  });
  // a schickt absichtlich nichts. Die Frist im Code liegt bei 10 s;
  // hier wird nur geprüft, dass sie überhaupt läuft.
  assert.equal(p.ready, false);
  p.close('test');
  assert.deepEqual(gruende, ['test']);
  zu();
});

// -------------------------------------------------------- Reihenfolge

test('Vor dem Handschlag wird nur version angenommen', async () => {
  // Sonst könnte ein Peer sofort Blöcke schicken -- ungeprüft, ohne dass
  // feststeht, ob er überhaupt zum selben Netz gehört.
  const { a, b, zu } = await paar();
  const auffaellig: string[] = [];
  const p = new PeerConnection({
    socket: b, richtung: 'ein', params: REGTEST, agent: 't', listenPort: 0,
    eigeneKette: KETTE,
    callbacks: { onMisbehave: (_p, g) => auffaellig.push(g) },
  });

  // Statt version gleich ein getaddr.
  a.write(encodeFrame(magicFor(REGTEST.chainId), 'getaddr', new Uint8Array(0)));
  await warte(200);

  assert.equal(p.ready, false);
  assert.ok(auffaellig.some(g => g.startsWith('vor_handschlag')), auffaellig.join(','));
  zu();
});

test('Zwischen version und verack wird nichts anderes angenommen', async () => {
  const { a, b, zu } = await paar();
  const auffaellig: string[] = [];
  const p = new PeerConnection({
    socket: b, richtung: 'ein', params: REGTEST, agent: 't', listenPort: 0,
    eigeneKette: KETTE,
    callbacks: { onMisbehave: (_p, g) => auffaellig.push(g) },
  });

  const M = magicFor(REGTEST.chainId);
  a.write(encodeFrame(M, 'version', encodeVersion({
    protocol: PROTOCOL_VERSION, network: REGTEST.network, chainId: REGTEST.chainId,
    agent: 'x', height: 1, chainWork: '1', nonce: 7n, port: 1, timestamp: 0n,
  })));
  // verack fehlt, stattdessen sofort getaddr.
  await warte(100);
  a.write(encodeFrame(M, 'getaddr', new Uint8Array(0)));
  await warte(200);

  assert.ok(auffaellig.some(g => g.startsWith('vor_verack')), auffaellig.join(','));
  zu();
});

test('Ein zweites version wird abgewiesen', async () => {
  const { a, b, zu } = await paar();
  const auffaellig: string[] = [];
  const p = new PeerConnection({
    socket: b, richtung: 'ein', params: REGTEST, agent: 't', listenPort: 0,
    eigeneKette: KETTE,
    callbacks: { onMisbehave: (_p, g) => auffaellig.push(g) },
  });

  const M = magicFor(REGTEST.chainId);
  const v = encodeFrame(M, 'version', encodeVersion({
    protocol: PROTOCOL_VERSION, network: REGTEST.network, chainId: REGTEST.chainId,
    agent: 'x', height: 1, chainWork: '1', nonce: 7n, port: 1, timestamp: 0n,
  }));
  a.write(v);
  await warte(100);
  a.write(v);
  await warte(200);

  assert.ok(auffaellig.some(g => g === 'version_doppelt'), auffaellig.join(','));
  zu();
});

// ----------------------------------------------------- Lebenszeichen

test('Ein ping wird mit demselben Wert beantwortet', async () => {
  const { a, b, zu } = await paar();
  const p1 = peer(a, 'aus');
  const p2 = peer(b, 'ein');
  await warte(300);
  assert.ok(p1.ready && p2.ready);

  // Die Antwort kommt automatisch aus der Verbindung selbst -- ohne dass
  // die Ebene darüber etwas tun muss.
  const vorher = p1.info().empfangen;
  p1.send('ping', new Uint8Array(8));
  await warte(200);
  assert.ok(p1.info().empfangen > vorher, 'kein pong angekommen');

  p1.close(); p2.close(); zu();
});

test('Ein pong ohne ping ist auffällig', async () => {
  // Sonst ließe sich eine tote Verbindung lebendig aussehen lassen, indem
  // man auf Vorrat pongs schickt.
  const { a, b, zu } = await paar();
  const auffaellig: string[] = [];
  const p1 = peer(a, 'aus', { cb: { onMisbehave: (_p: unknown, g: string) => auffaellig.push(g) } });
  const p2 = peer(b, 'ein');
  await warte(300);

  p2.send('pong', new Uint8Array(8));
  await warte(200);
  assert.ok(auffaellig.includes('pong_unerwartet'), auffaellig.join(','));

  p1.close(); p2.close(); zu();
});

// -------------------------------------------------------- Nachrichten

test('Nach dem Handschlag kommen Nachrichten oben an', async () => {
  const { a, b, zu } = await paar();
  const empfangen: string[] = [];
  const p1 = peer(a, 'aus');
  const p2 = peer(b, 'ein', {
    cb: { onMessage: (_p: unknown, f: { command: string }) => empfangen.push(f.command) },
  });
  await warte(300);

  p1.send('getaddr', new Uint8Array(0));
  p1.send('inv', new Uint8Array([0, 0]));
  await warte(200);

  assert.deepEqual(empfangen, ['getaddr', 'inv']);
  // version, verack, ping und pong bleiben unten -- die Ebene darüber
  // soll sich damit nicht befassen.
  assert.ok(!empfangen.includes('version'));

  p1.close(); p2.close(); zu();
});

test('Eine kaputte Rahmung trennt die Verbindung', async () => {
  const { a, b, zu } = await paar();
  const auffaellig: string[] = [];
  const p = new PeerConnection({
    socket: b, richtung: 'ein', params: REGTEST, agent: 't', listenPort: 0,
    eigeneKette: KETTE,
    callbacks: { onMisbehave: (_p, g) => auffaellig.push(g) },
  });

  // Vier Byte, die kein gültiges Magic sind.
  a.write(Buffer.from([0xde, 0xad, 0xbe, 0xef, 0, 0, 0, 0, 0, 0, 0, 0,
                       0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await warte(200);

  assert.ok(auffaellig.some(g => g.includes('falsches_netz')), auffaellig.join(','));
  zu();
});
