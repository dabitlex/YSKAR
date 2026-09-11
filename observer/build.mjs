/**
 * Buendelt den Beobachter zu einer einzelnen CommonJS-Datei.
 *
 * Ohne das braucht der Start --experimental-strip-types, und Node muss bei
 * jedem Start die TypeScript-Typen aus dem Quelltext und der gesamten
 * Chain-Bibliothek entfernen. Auf einem Raspberry kostet das spuerbar Zeit.
 *
 * Gebuendelt laeuft er mit schlichtem `node yskar-observer.cjs`.
 */
import { build } from 'esbuild';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(HIER, 'dist'), { recursive: true });

await build({
  entryPoints: [join(HIER, 'src', 'main.ts')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outfile: join(HIER, 'dist', 'yskar-observer.cjs'),
  logOverride: { 'empty-import-meta': 'silent' },
});

const groesse = statSync(join(HIER, 'dist', 'yskar-observer.cjs')).size;
console.log(`dist/yskar-observer.cjs  ${(groesse / 1024).toFixed(0)} KB`);
console.log('Start:  node dist/yskar-observer.cjs --data ./daten');
