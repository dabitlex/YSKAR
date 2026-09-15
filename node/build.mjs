/**
 * Buendelt den Full Node zu einer CommonJS-Datei.
 *
 * Ohne das braucht der Start --experimental-strip-types, und Node muss bei
 * jedem Start die Typen aus dem Quelltext und der ganzen Chain-Bibliothek
 * entfernen. Auf einem Raspberry kostet das spuerbar Zeit.
 */
import { build } from 'esbuild';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(HIER, 'dist'), { recursive: true });

await build({
  entryPoints: [join(HIER, '..', 'src', 'lib', 'node', 'fullnode', 'cli.ts')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outfile: join(HIER, 'dist', 'yskar-node.cjs'),
  // node:sqlite ist eingebaut und darf nicht mitgebuendelt werden.
  external: ['node:sqlite'],
  logOverride: { 'empty-import-meta': 'silent' },
});

console.log(`dist/yskar-node.cjs  ${(statSync(join(HIER,'dist','yskar-node.cjs')).size/1024).toFixed(0)} KB`);
console.log('Start:  node dist/yskar-node.cjs sync --data ./knoten');
