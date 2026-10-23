/**
 * Der Spiegel liest den ganzen Zustand -- auch wenn die Datenschnittstelle je
 * Abfrage nur 1.000 Zeilen liefert (Befund L3).
 *
 * Nachgestellt wird PostgREST so weit, wie loadState es braucht: Zaehlen
 * (HEAD mit Prefer: count=exact), Lesen mit order/offset/limit und die
 * stillschweigende Grenze von 1.000 Zeilen je Antwort.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const GRENZE = 1_000;
const KONTEN = 2_537;
const zeilen = Array.from({ length: KONTEN }, (_, i) => {
  const a = Buffer.alloc(20); a.writeUInt32BE(i * 2654435761 >>> 0, 0); a.writeUInt32BE(i, 16);
  return { address: '\\x' + a.toString('hex'), balance: String(1000 + i), nonce: String(i % 7) };
}).sort((x, y) => (x.address < y.address ? -1 : 1));

test('loadState liest mehr als 1.000 Konten vollstaendig (seitenweise)', async () => {
  let abfragen = 0;
  const server = createServer((req, res) => {
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
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  try {
    const { loadState, KONTEN_SEITE } = await import('../src/lib/node/store.ts');
    const { state, height } = await loadState();
    assert.equal(height, 42);
    assert.equal(state.size, KONTEN, 'alle Konten, nicht nur die ersten 1.000');
    assert.equal(abfragen, Math.ceil(KONTEN / KONTEN_SEITE));
    const letzte = zeilen[zeilen.length - 1];
    assert.equal(state.get(letzte.address.slice(2))?.balance, BigInt(letzte.balance));
  } finally {
    server.close();
  }
});
