/**
 * Buendelt den Miner zu EINER Datei.
 *
 * Node kann aus einem einzelnen Skript eine Binaerdatei bauen (Single
 * Executable Application). Das bedeutet drei Dinge, die hier geloest werden:
 *
 *  1. Alles muss in einer Datei liegen -- also CommonJS, gebuendelt.
 *  2. Eine Binaerdatei hat kein Dateisystem daneben. Die WASM-Engine wird
 *     deshalb als base64 eingebettet.
 *  3. Rechen-Threads koennen keine Datei nachladen. Ihr Quelltext wird
 *     mitgebuendelt und als Zeichenkette uebergeben; der Worker wird mit
 *     eval:true gestartet.
 *
 * Der Quelltext bleibt derselbe wie im Ordnerbetrieb -- cli.mjs erkennt
 * beide Faelle. Zwei getrennte Fassungen waeren die Verdopplung, die uns in
 * diesem Projekt schon zweimal getroffen hat.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..');
const DIST = join(WURZEL, 'dist');

mkdirSync(DIST, { recursive: true });

// ---- Engine finden. Der Name traegt den Inhalts-Hash. ----
const wasmName = readdirSync(WURZEL).find(n => /^miner\.[0-9a-f]{10}\.wasm$/.test(n));
if (!wasmName) {
  console.error('miner.<hash>.wasm nicht gefunden. Erst "npm run wasm" im Projekt.');
  process.exit(1);
}
const wasmB64 = readFileSync(join(WURZEL, wasmName)).toString('base64');

// ---- Rechen-Thread buendeln ----
// Als CommonJS, weil worker_threads mit eval:true CJS ausfuehrt.
const hasher = await build({
  entryPoints: [join(WURZEL, 'src', 'hasher.mjs')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  write: false, minify: false,
});
const hasherSrc = hasher.outputFiles[0].text;

// ---- Hauptprogramm buendeln, beides eingebettet ----
const banner = [
  '// YSKAR Miner — eingepackte Fassung. Erzeugt von build/bundle.mjs.',
  `globalThis.__YSKAR_WASM_B64 = ${JSON.stringify(wasmB64)};`,
  `globalThis.__YSKAR_HASHER_SRC = ${JSON.stringify(hasherSrc)};`,
].join('\n');

await build({
  entryPoints: [join(WURZEL, 'src', 'cli.mjs')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outfile: join(DIST, 'yskar-miner.cjs'),
  banner: { js: banner },
  minify: false,
  // import.meta gibt es in CommonJS nicht. cli.mjs faengt das mit einer
  // Pruefung auf __dirname ab, also ist die Warnung hier erwartet.
  logOverride: { 'empty-import-meta': 'silent' },
});

const groesse = readFileSync(join(DIST, 'yskar-miner.cjs')).length;
console.log(`dist/yskar-miner.cjs  ${(groesse / 1024).toFixed(0)} KB`);
console.log(`  Engine eingebettet: ${wasmName}`);
console.log(`  Rechen-Thread:      ${(hasherSrc.length / 1024).toFixed(0)} KB`);
