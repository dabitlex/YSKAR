#!/usr/bin/env node
/*
 * Die Website lokal ansehen, so wie Vercel sie ausliefert (website/vercel.json):
 * Adressen ohne ".html", 404.html für Unbekanntes, /api/v2 durchgereicht an die öffentliche API (nur GET).
 *
 *   node website/tools/server.mjs                 http://127.0.0.1:8080
 *   node website/tools/server.mjs --port 9000
 *   node website/tools/server.mjs --no-api        die API antwortet nicht (503): so verhält sich die Seite bei einem Ausfall
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => { const i = process.argv.indexOf('--' + name); return i < 0 ? null : (process.argv[i + 1] || ''); };
const PORT = Number(arg('port')) || 8080;
const NO_API = process.argv.includes('--no-api');
const API = process.env.YSKAR_API || 'https://www.yskar.app/api/v2';
const HIDDEN = /^\/(src|tools)(\/|$)|^\/(README\.md|vercel\.json|\.vercelignore)$/;      // liegt im Ordner, wird aber nicht ausgeliefert
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

async function file(p) {
  try { const s = await stat(p); return s.isFile() ? p : null; } catch { return null; }
}
async function send(res, status, path) {
  const body = await readFile(path), type = TYPES[extname(path)] || 'application/octet-stream';
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.startsWith('/api/v2/') || path === '/api/v2') {
      if (req.method !== 'GET') { res.writeHead(405); return void res.end(); }
      if (NO_API) { res.writeHead(503, { 'content-type': 'application/json' }); return void res.end('{"error":"unavailable"}'); }
      const r = await fetch(API + path.slice('/api/v2'.length) + url.search, { headers: { accept: 'application/json' } });
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
      return void res.end(Buffer.from(await r.arrayBuffer()));
    }
    path = normalize(path);
    if (path.includes('..') || HIDDEN.test(path)) return void await send(res, 404, join(ROOT, '404.html'));
    if (path.length > 1 && path.endsWith('/')) { res.writeHead(308, { location: path.slice(0, -1) + url.search }); return void res.end(); }
    if (path.endsWith('.html')) {                           // wie cleanUrls: /mining.html führt nach /mining
      res.writeHead(308, { location: (path === '/index.html' ? '/' : path.slice(0, -5)) + url.search }); return void res.end();
    }
    const hit = await file(join(ROOT, path === '/' ? 'index.html' : path)) || (extname(path) ? null : await file(join(ROOT, path + '.html')));
    if (hit) return void await send(res, 200, hit);
    await send(res, 404, join(ROOT, '404.html'));
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Fehler: ' + e.message);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`YSKAR Website: http://127.0.0.1:${PORT}${NO_API ? '  (API antwortet nicht)' : ''}`));
