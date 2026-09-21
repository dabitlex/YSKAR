import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const out = resolve(here, 'dist');
mkdirSync(out, { recursive: true });

if (!existsSync(join(here, 'node_modules', 'esbuild'))) {
  console.error('esbuild fehlt. Bitte zuerst: npm install');
  process.exit(1);
}

const wasmSource = resolve(repo, 'miner', 'miner.57f237a2a4.wasm');
if (!existsSync(wasmSource)) {
  console.error(`Miner-WASM fehlt: ${wasmSource}`);
  process.exit(1);
}
copyFileSync(wasmSource, resolve(out, 'miner.wasm'));

const { build } = await import('esbuild');
const bundled = resolve(out, 'yskar-node-core.bundle.cjs');

await build({
  entryPoints: [resolve(here, 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node25',
  outfile: bundled,
  external: ['node:sqlite'],
  nodePaths: [resolve(here, 'node_modules')],
  logOverride: { 'empty-import-meta': 'silent' },
});

const seaConfig = {
  main: bundled,
  mainFormat: 'commonjs',
  output: resolve(out, 'YSKAR-Node-Core.exe'),
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
};
const configPath = resolve(out, 'sea-config.json');
writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));

try {
  execFileSync(process.execPath, ['--build-sea', configPath], { stdio: 'inherit' });
} catch {
  console.error('\nDer SEA-Build ist fehlgeschlagen.');
  console.error('Dieses Build-Skript benötigt Node.js >= 25.5.0.');
  console.error(`Gefunden: ${process.version}`);
  process.exit(1);
}

console.log('\nYSKAR Node Core erstellt:');
console.log(resolve(out, 'YSKAR-Node-Core.exe'));
console.log(`Miner-WASM: ${resolve(out, 'miner.wasm')}`);
