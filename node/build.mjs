/**
 * Buendelt den Full Node zu einer CommonJS-Datei.
 *
 * Ohne das braucht der Start --experimental-strip-types, und Node muss bei
 * jedem Start die Typen aus dem Quelltext und der ganzen Chain-Bibliothek
 * entfernen. Auf einem Raspberry kostet das spuerbar Zeit.
 */
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));

/*
  Vorpruefung.

  Der Knoten buendelt Quelltext aus ../src/lib/core, und der braucht die
  Kryptobibliotheken. Fehlen sie, wirft esbuild zehn Aufloesungsfehler --
  aus denen niemand die eigentliche Ursache liest. Ein Satz ist
  hilfreicher.
*/
const { existsSync } = await import('node:fs');

/*
  esbuild wird DYNAMISCH geladen, nach der Pruefung.

  Ein statischer Import scheitert, bevor eine einzige eigene Zeile laeuft.
  Der Nutzer sieht dann ERR_MODULE_NOT_FOUND mit zehn Zeilen
  Node-Interna -- und nicht den einen Satz, der ihm weiterhilft.
*/
if (!existsSync(join(HIER, 'node_modules', 'esbuild'))) {
  console.error('\nesbuild is missing in this folder.');
  console.error(`An installation in the project root is not enough --`);
  console.error(`this folder needs its own:\n`);
  console.error(`  cd ${HIER.split(/[\\/]/).pop()}`);
  console.error('  npm install\n');
  process.exit(1);
}
const { build } = await import('esbuild');
const noetig = ['@noble/hashes', '@noble/curves', '@scure/base', '@scure/bip39'];
const fehlend = noetig.filter(m => !existsSync(join(HIER, 'node_modules', m)));
if (fehlend.length > 0) {
  console.error(`\nMissing: ${fehlend.join(', ')}`);
  console.error('Run "npm install" in this folder first.\n');
  process.exit(1);
}

mkdirSync(join(HIER, 'dist'), { recursive: true });

await build({
  entryPoints: [join(HIER, '..', 'src', 'lib', 'node', 'fullnode', 'cli.ts')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outfile: join(HIER, 'dist', 'yskar-node.cjs'),
  // node:sqlite ist eingebaut und darf nicht mitgebuendelt werden.
  external: ['node:sqlite'],

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

console.log(`dist/yskar-node.cjs  ${(statSync(join(HIER,'dist','yskar-node.cjs')).size/1024).toFixed(0)} KB`);
console.log('Start:  node dist/yskar-node.cjs sync --data ./knoten');
