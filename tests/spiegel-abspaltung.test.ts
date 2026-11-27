/**
 * Spiegel: Abspaltungen erkennen und zuruecknehmen (Migration 00030).
 *
 * Nachgestellt ist der Vorfall vom 27.11.2026: Auf Hoehe 10991 lag im
 * Spiegel der Block von YSKAR MAIN, die Kette hatte den Solo-Block
 * genommen. Jeder Block 10992 wurde danach mit wrong_parent abgelehnt.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { entscheide, abspaltungZuruecknehmen, RUECKBAU_TIEFE, type KopfEintrag } from '../src/lib/node/spiegelAbspaltung.ts';

const h = (n: number, zweig = 'a') => (zweig + n.toString(16)).padStart(64, '0');
const kette = (von: number, bis: number, zweig = 'a', abZweig = Infinity): KopfEintrag[] => {
  const out: KopfEintrag[] = [];
  for (let i = bis; i >= von; i--) out.push({ height: i, hash: h(i, i >= abZweig ? zweig : 'a') });
  return out;
};

// ---------------------------------------------------------------- Entscheidung

test('Vorfall 10991: Spiegel auf verworfenem Block -> zurueck auf 10990', () => {
  const spiegel = kette(10892, 10991, 'b', 10991);          // 10991 ist der verworfene
  const knoten = kette(10892, 10991);                       // Hauptkette
  const e = entscheide(spiegel[0], { height: 10992, prevHash: h(10991) }, spiegel, knoten);
  assert.deepEqual(e, { art: 'zurueck', bis: 10990 });
});

test('Abspaltung ueber drei Bloecke -> zurueck auf die letzte gemeinsame Hoehe', () => {
  const spiegel = kette(10900, 10995, 'b', 10993);
  const knoten = kette(10900, 10995);
  const e = entscheide(spiegel[0], { height: 10996, prevHash: h(10995) }, spiegel, knoten);
  assert.deepEqual(e, { art: 'zurueck', bis: 10992 });
});

test('Konkurrent auf gleicher Hoehe (stale) -> zurueck, wenn der Knoten ihn bestaetigt', () => {
  const spiegel = kette(10892, 10991, 'b', 10991);
  const knoten = kette(10892, 10991);
  const e = entscheide(spiegel[0], { height: 10991, prevHash: h(10990) }, spiegel, knoten);
  assert.deepEqual(e, { art: 'zurueck', bis: 10990 });
});

test('Spiegel liegt auf der Hauptkette -> nichts zuruecknehmen (fremder Block)', () => {
  const spiegel = kette(10892, 10991);
  const knoten = kette(10892, 10991);
  const e = entscheide(spiegel[0], { height: 10992, prevHash: h(10991, 'f') }, spiegel, knoten);
  assert.deepEqual(e, { art: 'keine', grund: 'spiegel_kopf_ist_hauptkette' });
});

test('Eingereichter Block baut nicht auf der Hauptkette auf -> nichts zuruecknehmen', () => {
  // Spiegel UND Einreicher abseits: Ein Fremder darf den Spiegel nicht schieben.
  const spiegel = kette(10892, 10991, 'b', 10991);
  const knoten = kette(10892, 10991);
  const e = entscheide(spiegel[0], { height: 10992, prevHash: h(10991, 'f') }, spiegel, knoten);
  assert.deepEqual(e, { art: 'keine', grund: 'block_nicht_auf_hauptkette' });
});

test('Knoten kennt die Hoehe des Spiegels nicht (Knoten zurueck) -> nichts zuruecknehmen', () => {
  const spiegel = kette(10892, 10991, 'b', 10991);
  const knoten = kette(10892, 10989);
  const e = entscheide(spiegel[0], { height: 10992, prevHash: h(10991) }, spiegel, knoten);
  assert.deepEqual(e, { art: 'keine', grund: 'knoten_kennt_hoehe_nicht' });
});

test('Keine gemeinsame Hoehe im Fenster -> zu tief, von Hand', () => {
  const spiegel = kette(10892, 10991, 'b', 0);
  const knoten = kette(10892, 10991);
  const e = entscheide(spiegel[0], { height: 10992, prevHash: h(10991) }, spiegel, knoten);
  assert.deepEqual(e, { art: 'keine', grund: 'zu_tief' });
  assert.equal(RUECKBAU_TIEFE, 100);
});

test('Gross- und Kleinschreibung der Hashes spielt keine Rolle', () => {
  const spiegel = kette(10892, 10991, 'b', 10991);
  const knoten = kette(10892, 10991).map(k => ({ ...k, hash: k.hash.toUpperCase() }));
  const e = entscheide(spiegel[0], { height: 10992, prevHash: h(10991).toUpperCase() }, spiegel, knoten);
  assert.deepEqual(e, { art: 'zurueck', bis: 10990 });
});

// ---------------------------------------------------------------- Durchlauf mit Knoten und Datenbank

let antwort: (req: IncomingMessage, res: ServerResponse, body: string) => void = (_q, r) => { r.statusCode = 404; r.end('{}'); };
const server = createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => antwort(req, res, body));
});
const bereit = new Promise<void>(r => server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.YSKAR_FULLNODE_URL = url + '/knoten';
  r();
}));
after(() => server.close());

test('Durchlauf: fragt den Knoten, ruft spiegel_zurueck mit Kopf-Hash, meldet den Rueckbau', async () => {
  await bereit;
  const spiegel = kette(10892, 10991, 'b', 10991);
  const knoten = kette(10892, 10991);
  let aufruf: Record<string, unknown> | null = null;
  let knotenPfad = '';
  antwort = (req, res, body) => {
    const u = new URL(req.url ?? '/', 'http://x');
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/knoten/api/v2/blocks') {
      knotenPfad = u.search;
      res.end(JSON.stringify({ blocks: knoten }));
    } else if (u.pathname === '/rest/v1/blocks') {
      assert.equal(req.headers['accept-profile'], 'chain2');
      res.end(JSON.stringify(spiegel.map(s => ({ height: s.height, hash: '\\x' + s.hash }))));
    } else if (u.pathname === '/rest/v1/rpc/spiegel_zurueck') {
      assert.equal(req.headers['content-profile'], 'chain2');
      aufruf = JSON.parse(body);
      res.end(JSON.stringify({ bis: 10990, entfernt: 1 }));
    } else { res.statusCode = 404; res.end('{}'); }
  };
  const r = await abspaltungZuruecknehmen(spiegel[0], { height: 10992, prevHash: h(10991) });
  assert.deepEqual(r, { zurueckgenommen: true, bis: 10990, entfernt: 1 });
  assert.deepEqual(aufruf, { p_bis: 10990, p_kopf_hash: '\\x' + h(10991, 'b') });
  assert.equal(knotenPfad, '?before=10992&limit=100');
});

test('Durchlauf: Knoten nicht erreichbar -> nichts zuruecknehmen, kein Fehler nach aussen', async () => {
  await bereit;
  let rpc = false;
  antwort = (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname.startsWith('/knoten')) { res.statusCode = 502; res.end('kaputt'); return; }
    if (u.pathname.startsWith('/rest/v1/rpc')) rpc = true;
    res.setHeader('content-type', 'application/json');
    res.end('[]');
  };
  const r = await abspaltungZuruecknehmen({ height: 10991, hash: h(10991, 'b') }, { height: 10992, prevHash: h(10991) });
  assert.equal(r.zurueckgenommen, false);
  assert.equal(rpc, false);
});

test('Durchlauf: Datenbank lehnt ab (Kopf bewegt) -> nicht zurueckgenommen, Grund durchgereicht', async () => {
  await bereit;
  const spiegel = kette(10892, 10991, 'b', 10991);
  const knoten = kette(10892, 10991);
  antwort = (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/knoten/api/v2/blocks') res.end(JSON.stringify({ blocks: knoten }));
    else if (u.pathname === '/rest/v1/blocks') res.end(JSON.stringify(spiegel.map(s => ({ height: s.height, hash: '\\x' + s.hash }))));
    else { res.statusCode = 400; res.end(JSON.stringify({ code: 'P0001', message: 'Kopf hat sich bewegt (Hoehe 10992), nichts zurueckgenommen' })); }
  };
  const r = await abspaltungZuruecknehmen(spiegel[0], { height: 10992, prevHash: h(10991) });
  assert.equal(r.zurueckgenommen, false);
  assert.match((r as { grund: string }).grund, /Kopf hat sich bewegt/);
});
