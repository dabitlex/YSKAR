/**
 * Der Spiegel liest den ganzen Zustand -- auch wenn die Datenschnittstelle je
 * Abfrage nur 1.000 Zeilen liefert (Befund L3).
 *
 * Nachgestellt wird PostgREST so weit, wie loadState es braucht: Zaehlen
 * (HEAD mit Prefer: count=exact), Lesen mit order/offset/limit und die
 * stillschweigende Grenze von 1.000 Zeilen je Antwort.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
  EIN nachgebauter Server fuer die ganze Datei: Der Datenbank-Client wird
  beim ersten Aufruf mit seiner Adresse angelegt und danach behalten.
*/
let antwort: (req: IncomingMessage, res: ServerResponse) => void = (_q, r) => { r.statusCode = 404; r.end('{}'); };
const server = createServer((req, res) => antwort(req, res));
const bereit = new Promise<void>(r => server.listen(0, '127.0.0.1', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  r();
}));
after(() => server.close());

const GRENZE = 1_000;
const KONTEN = 2_537;
const zeilen = Array.from({ length: KONTEN }, (_, i) => {
  const a = Buffer.alloc(20); a.writeUInt32BE(i * 2654435761 >>> 0, 0); a.writeUInt32BE(i, 16);
  return { address: '\\x' + a.toString('hex'), balance: String(1000 + i), nonce: String(i % 7) };
}).sort((x, y) => (x.address < y.address ? -1 : 1));

test('loadState liest mehr als 1.000 Konten vollstaendig (seitenweise)', async () => {
  let abfragen = 0;
  await bereit;
  antwort = (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    res.setHeader('content-type', 'application/json');
    if (u.pathname.endsWith('/state_meta')) {
      res.end(JSON.stringify({ height: 42, state_root: '\\x00' }));
      return;
    }
    if (u.pathname.endsWith('/accounts')) {
      if (req.method === 'HEAD') {
        res.setHeader('content-range', `*/${KONTEN}`);
        res.end();
        return;
      }
      abfragen++;
      const von = Number(u.searchParams.get('offset') ?? 0);
      const wunsch = Number(u.searchParams.get('limit') ?? KONTEN);
      // Die Grenze der Schnittstelle: nie mehr als GRENZE Zeilen.
      const seite = zeilen.slice(von, von + Math.min(wunsch, GRENZE));
      res.end(JSON.stringify(seite));
      return;
    }
    res.statusCode = 404; res.end('{}');
  };
  {
    const { loadState, KONTEN_SEITE } = await import('../src/lib/node/store.ts');
    const { state, height } = await loadState();
    assert.equal(height, 42);
    assert.equal(state.size, KONTEN, 'alle Konten, nicht nur die ersten 1.000');
    assert.equal(abfragen, Math.ceil(KONTEN / KONTEN_SEITE));
    const letzte = zeilen[zeilen.length - 1];
    assert.equal(state.get(letzte.address.slice(2))?.balance, BigInt(letzte.balance));
  }
});

test('loadKonten: nur die beruehrten Konten, in Teilen, mit der Gesamtmenge aus state_meta', async () => {
  const gefragt: string[][] = [];
  await bereit;
  antwort = (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    res.setHeader('content-type', 'application/json');
    if (u.pathname.endsWith('/state_meta')) {
      assert.match(u.searchParams.get('select') ?? '', /total_supply::text/);
      res.end(JSON.stringify({ height: 7, total_supply: '123456789' }));
      return;
    }
    if (u.pathname.endsWith('/accounts')) {
      // PostgREST: address=in.("\xab..","\xcd..")
      const f = u.searchParams.get('address') ?? '';
      const m = /^in\.\((.*)\)$/.exec(f);
      assert.ok(m, f);
      const werte = m![1].split(',').map(x => x.replace(/^"|"$/g, ''));
      gefragt.push(werte);
      res.end(JSON.stringify(zeilen.filter(z => werte.includes(z.address))));
      return;
    }
    res.statusCode = 404; res.end('{}');
  };
  {
    const { loadKonten, KONTEN_JE_ABFRAGE } = await import('../src/lib/node/store.ts');
    const vorhanden = zeilen.slice(0, 230).map(z => z.address.slice(2));
    const neu = ['ff'.repeat(20), '01' + 'ee'.repeat(32)];
    const r = await loadKonten([...vorhanden, ...neu]);
    assert.equal(r.menge, 123456789n);
    assert.equal(r.height, 7);
    assert.equal(r.state.size, 230, 'neue Konten fehlen einfach');
    assert.equal(gefragt.length, Math.ceil(232 / KONTEN_JE_ABFRAGE));
    assert.ok(gefragt.every(g => g.length <= KONTEN_JE_ABFRAGE));
    assert.equal(r.state.get(vorhanden[5])?.balance, BigInt(zeilen[5].balance));
  }
});

test('beruehrteKonten: Absender, Empfaenger, Coinbase -- jede Adresse einmal', async () => {
  const { beruehrteKonten } = await import('../src/lib/node/store.ts');
  const { buildBatch, buildTransfer } = await import('../src/lib/core/tx.ts');
  const { buildCoinbase } = await import('../src/lib/core/builder.ts');
  const { keypairFromSeed } = await import('../src/lib/core/wallet.ts');
  const k = keypairFromSeed(new Uint8Array(64).fill(3), 0, 0);
  const a = new Uint8Array(20).fill(1), b = Uint8Array.from([1, ...new Array(32).fill(2)]);
  const txs = [
    buildCoinbase(10, a, 0n),
    buildTransfer({ from: k.addressRaw, to: a, amount: 1000n, fee: 2000n, nonce: 0n, publicKey: k.publicKey, privateKey: k.privateKey }),
    buildBatch({ from: k.addressRaw, outputs: [{ to: b, amount: 500n }, { to: a, amount: 600n }], fee: 3000n, nonce: 1n,
      publicKey: k.publicKey, privateKey: k.privateKey }),
  ];
  const beruehrt = beruehrteKonten({ header: {} as never, txs } as never);
  const hex = (x: Uint8Array) => Buffer.from(x).toString('hex');
  assert.deepEqual(new Set(beruehrt), new Set([hex(a), hex(b), hex(k.addressRaw)]));
  assert.equal(beruehrt.length, 3);
});
