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
console.log('Die Desktop-Hülle verwendet Electron und öffnet kein Microsoft Edge.');
