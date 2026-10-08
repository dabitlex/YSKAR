/**
 * Issue #14: Der Beobachter vergleicht den Kopf des Spiegels mit einer
 * zweiten Quelle (einem Full Node). Gegen eine nachgestellte Quelle ueber
 * echtes HTTP, mit derselben Abfragefunktion wie im Beobachter.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { vergleiche, beschreibe } from '../observer/src/vergleich.ts';

const H = (n: number) => n.toString(16).padStart(64, '0');

/** Eine Quelle mit Kette 0..kopf; Block h hat Hash H(h) -- ausser in `anders`. */
async function quelle(kopf: number, anders: Record<number, string> = {}) {
  const hash = (h: number) => anders[h] ?? H(h);
  const s = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const j = (o: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (u.pathname === '/api/v2/summary') return j({ height: kopf, tipHash: hash(kopf) });
    if (u.pathname === '/api/v2/sync') {
      const von = Number(u.searchParams.get('from'));
      return j({ blocks: von <= kopf ? [{ height: von, hash: hash(von), body: '' }] : [] });
    }
    res.writeHead(404).end('{}');
  });
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r));
  servers.push(s);
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}
const servers: ReturnType<typeof createServer>[] = [];
after(() => { for (const s of servers) s.close(); });

async function hole(api: string, pfad: string) {
  const res = await fetch(`${api}/api/v2${pfad}`, { signal: AbortSignal.timeout(5000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
  return body;
}

test('Gleicher Kopf: gleich', async () => {
  const q = await quelle(100);
  const v = await vergleiche(hole, q, 100, H(100));
  assert.equal(v.art, 'gleich');
});

test('Spiegel liegt zurueck, bis dahin gleich', async () => {
  const q = await quelle(103);
  const v = await vergleiche(hole, q, 100, H(100));
  assert.deepEqual(v, { art: 'spiegel_hinten', hoehe: 100, quelleHoehe: 103 });
  assert.match(beschreibe(v, q), /3 Block\/Blöcke hinter/);
});

test('Anderer Block auf gleicher Hoehe: anderer Zweig', async () => {
  const q = await quelle(100, { 100: 'ab'.repeat(32) });
  const v = await vergleiche(hole, q, 100, H(100));
  assert.equal(v.art, 'anderer_block');
});

test('Anderer Block auf der Hoehe des Spiegels, Quelle weiter: anderer Zweig', async () => {
  const q = await quelle(105, { 100: 'cd'.repeat(32) });
  const v = await vergleiche(hole, q, 100, H(100));
  assert.equal(v.art, 'anderer_block');
});

test('Quelle liegt zurueck: kein Vergleich, keine Warnung', async () => {
  const q = await quelle(90);
  const v = await vergleiche(hole, q, 100, H(100));
  assert.equal(v.art, 'quelle_hinten');
});

test('Quelle nicht erreichbar: Fehler, kein Absturz', async () => {
  const v = await vergleiche(hole, 'http://127.0.0.1:1', 100, H(100));
  assert.equal(v.art, 'fehler');
});
