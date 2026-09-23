import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'dist');
mkdirSync(out, { recursive: true });
console.log('YSKAR Node Core Desktop Build');
console.log(`Node: ${process.version}`);
console.log('');
if (!existsSync(join(here, 'node_modules', 'esbuild'))) {
  console.error('esbuild fehlt. Bitte zuerst npm install ausführen.');
  process.exit(1);
}
const { build } = await import('esbuild');
await build({
  entryPoints: [resolve(here, 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: resolve(out, 'node-core.cjs'),
  external: ['node:sqlite'],
  nodePaths: [resolve(here, 'node_modules')],
  logOverride: { 'empty-import-meta': 'silent' },
});
console.log('Node-Core-Bundle erstellt: dist/node-core.cjs');

/*
 * Die Mining-Engine neben das Bundle legen.
 *
 * LocalMiner sucht sie zuerst in dist/miner.wasm. Ohne diese Kopie fand er
 * sie nur im Entwicklungsordner (ueber ../../miner/) -- in der installierten
 * App gibt es den nicht, und CPU-Mining scheiterte mit "Miner-WASM nicht
 * gefunden".
 *
 * NUR KOPIERT, nie veraendert. Es ist dieselbe Engine wie in Mini App und
 * CLI-Miner. Der Dateiname traegt den Anfang ihres SHA-256; stimmt der
 * Inhalt nicht dazu, bricht der Bau ab, statt eine fremde Engine
 * auszuliefern.
 */
{
  const { readFileSync, copyFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const quelle = resolve(here, '..', 'miner', 'miner.57f237a2a4.wasm');
  if (!existsSync(quelle)) {
    console.error(`Mining-Engine fehlt: ${quelle}`);
    process.exit(1);
  }
  const hash = createHash('sha256').update(readFileSync(quelle)).digest('hex');
  if (!hash.startsWith('57f237a2a4')) {
    console.error(`Mining-Engine passt nicht zu ihrem Namen (sha256 ${hash.slice(0, 16)}...).`);
    process.exit(1);
  }
  copyFileSync(quelle, resolve(out, 'miner.wasm'));
  console.log(`Mining-Engine kopiert: dist/miner.wasm (sha256 ${hash.slice(0, 10)}...)`);
}

/*
 * Der GPU-Miner ist ein eigenes Programm und wird NICHT hier gebaut -- dafuer
 * braucht es CUDA, und ohne CUDA soll der Node Core trotzdem bauen. Siehe
 * gpu/build-gpu.ps1. Liegt gpu/bin/yskar-cuda.exe vor, nimmt der Installer
 * sie mit; sonst zeigt die App GPU-Mining als nicht verfuegbar an.
 */
const gpuExe = resolve(here, 'gpu', 'bin', process.platform === 'win32' ? 'yskar-cuda.exe' : 'yskar-cuda');
console.log(existsSync(gpuExe)
  ? `GPU-Miner gefunden: ${gpuExe}`
  : 'GPU-Miner nicht gebaut -- der Node Core laeuft ohne GPU-Mining.');
console.log('Die Desktop-Hülle verwendet Electron und öffnet kein Microsoft Edge.');
