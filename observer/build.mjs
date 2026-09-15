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
const { existsSync } = await import('node:fs');
const noetig = ['@noble/hashes', '@noble/curves', '@scure/base', '@scure/bip39'];
const fehlend = noetig.filter(m => !existsSync(join(HIER, 'node_modules', m)));
if (fehlend.length > 0) {
  console.error(`\nEs fehlen: ${fehlend.join(', ')}`);
  console.error('Erst "npm install" in diesem Ordner ausfuehren.\n');
  process.exit(1);
}

mkdirSync(join(HIER, 'dist'), { recursive: true });

await build({
  entryPoints: [join(HIER, 'src', 'main.ts')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outfile: join(HIER, 'dist', 'yskar-observer.cjs'),

  /*
    nodePaths: esbuild sucht node_modules ausgehend vom Verzeichnis der
    IMPORTIERTEN Datei. Fuer ../src/lib/core/hash.ts schaut es also in
    src/lib/node_modules, src/node_modules und im Projektwurzelverzeichnis
    -- niemals hier. Ohne diese Zeile laesst sich der Ordner nur bauen,
    wenn zusaetzlich im Wurzelverzeichnis installiert wurde, und
    "eigenstaendig" waere eine Behauptung.
  */
  nodePaths: [join(HIER, 'node_modules')],
  logOverride: { 'empty-import-meta': 'silent' },
});

const groesse = statSync(join(HIER, 'dist', 'yskar-observer.cjs')).size;
console.log(`dist/yskar-observer.cjs  ${(groesse / 1024).toFixed(0)} KB`);
console.log('Start:  node dist/yskar-observer.cjs --data ./daten');
