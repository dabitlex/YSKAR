/**
 * Baut signatur-messung.html: eine einzige Datei, die ohne Installation im
 * Browser laeuft (Chrome oder Edge). Braucht beim Bauen Internet fuer
 * esbuild (npx), beim Ausfuehren nichts.
 *
 *   node scripts/signatur-messung/bauen.mjs [Zieldatei]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const ziel = resolve(process.argv[2] ?? join(hier, 'signatur-messung.html'));
const js = execFileSync('npx', ['--yes', 'esbuild@0.25.10', join(hier, 'seite.ts'),
  '--bundle', '--format=iife', '--minify', '--target=es2020', '--loader:.json=json'],
  { cwd: join(hier, '..', '..'), maxBuffer: 64 * 1024 * 1024 }).toString();

writeFileSync(ziel, `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YSKAR Signatur-Messung</title>
<style>
:root{--bg:#0f1115;--fg:#e8e8ea;--dim:#9aa0a6;--akzent:#f2b632}
@media (prefers-color-scheme: light){:root{--bg:#fafafa;--fg:#16181c;--dim:#5f6368;--akzent:#a86f00}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;max-width:760px;margin-inline:auto}
h1{font-size:20px;margin:0 0 8px}p{color:var(--dim);margin:0 0 16px}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:10px;border:0;background:var(--akzent);color:#111;cursor:pointer;margin-right:8px}
button:disabled{opacity:.5;cursor:wait}
pre{white-space:pre-wrap;word-break:break-word;background:rgba(127,127,127,.12);padding:14px;border-radius:10px;font:13px/1.5 ui-monospace,Consolas,monospace;min-height:120px}
</style></head><body>
<h1>YSKAR Signatur-Messung</h1>
<p>Misst, wie schnell dieser Rechner die Signaturen eines vollen Blocks prüft. Läuft nur hier im Browser, sendet nichts und verändert nichts. Bitte in <b>Chrome oder Edge</b> öffnen, andere Programme schließen, Laptop ans Netzteil. Dauer: etwa eine bis drei Minuten.</p>
<button id="start">Messung starten</button><button id="kopieren" hidden>Ergebnis kopieren</button>
<pre id="aus"></pre>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body></html>
`);
console.log('geschrieben:', ziel);
