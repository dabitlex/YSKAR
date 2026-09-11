/**
 * Baut aus der gebuendelten Datei eine eigenstaendige Binaerdatei.
 *
 * Node kann seit Fassung 20 ein Skript in seine eigene Binaerdatei einbetten
 * (Single Executable Application). Der Ablauf:
 *
 *   1. Skript zu einem Datenblock verpacken   (node --experimental-sea-config)
 *   2. Node-Binaerdatei kopieren
 *   3. Datenblock hineinschreiben              (postject)
 *
 * WICHTIG: Es entsteht immer eine Binaerdatei fuer DAS System, auf dem
 * gebaut wird. Eine .exe fuer Windows kann nur auf Windows entstehen, weil
 * dafuer Windows' eigene node.exe als Grundlage gebraucht wird. Ein
 * Ueberkreuz-Bau waere nur moeglich, wenn man die fremde Binaerdatei
 * herunterlaedt -- und das macht dieses Skript bewusst nicht.
 *
 *   node build/exe.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, existsSync, mkdirSync, statSync, writeFileSync,
  readFileSync, rmSync, renameSync } from 'node:fs';
import { inject } from 'postject';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..');
const DIST = join(WURZEL, 'dist');

const istWindows = process.platform === 'win32';
const ZIEL = join(DIST, istWindows ? 'yskar-miner.exe' : 'yskar-miner');
/*
  Gebaut wird auf einem Zwischennamen, erst zum Schluss umbenannt.

  Unter Windows sperrt jede laufende .exe ihre eigene Datei, und
  Virenscanner halten frisch geschriebene Dateien oft noch Sekunden offen.
  Direkt ueber das Ziel zu kopieren scheitert dann mitten im Bau mit EBUSY
  -- und hinterlaesst eine halb ueberschriebene Datei, die niemand mehr
  einordnen kann.
*/
const ROH = join(DIST, istWindows ? '.yskar-miner.bau.exe' : '.yskar-miner.bau');
const BUNDLE = join(DIST, 'yskar-miner.cjs');
const BLOB = join(DIST, 'yskar-miner.blob');
const KONFIG = join(DIST, 'sea-config.json');

const mb = p => (statSync(p).size / 1024 / 1024).toFixed(1);

function schritt(n, text) { console.log(`\n[${n}] ${text}`); }

// ---------------------------------------------------------------- Vorpruefung

const [haupt] = process.versions.node.split('.').map(Number);
if (haupt < 20) {
  console.error(`Node ${process.versions.node} ist zu alt. Gebraucht wird ab 20.`);
  process.exit(1);
}

if (!existsSync(BUNDLE)) {
  console.error('dist/yskar-miner.cjs fehlt. Zuerst: node build/bundle.mjs');
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });

console.log(`\nYSKAR Miner — Binaerdatei bauen`);
console.log(`  System   ${process.platform} ${process.arch}`);
console.log(`  Node     ${process.versions.node}`);
console.log(`  Ziel     ${ZIEL.replace(WURZEL + '/', '').replace(WURZEL + '\\\\', '')}`);

// ------------------------------------------------------------------- 1. Blob

schritt(1, 'Skript zu einem Datenblock verpacken');
writeFileSync(KONFIG, JSON.stringify({
  main: BUNDLE,
  output: BLOB,
  // Ohne das warnt jeder Start, es handle sich um eine experimentelle
  // Funktion. Fuer den Nutzer waere das nur Rauschen.
  disableExperimentalSEAWarning: true,
  // Kein Snapshot: Der Miner startet Threads, und die vertragen sich mit
  // dem Startabbild nicht.
  useSnapshot: false,
  useCodeCache: true,
}, null, 2));

execFileSync(process.execPath, ['--experimental-sea-config', KONFIG],
  { stdio: 'inherit' });
console.log(`    ${mb(BLOB)} MB`);

// -------------------------------------------------------- 2. Node kopieren

schritt(2, 'Node-Binaerdatei als Grundlage kopieren');
rmSync(ROH, { force: true });
copyFileSync(process.execPath, ROH);
if (!istWindows) chmodSync(ROH, 0o755);
console.log(`    ${mb(ROH)} MB`);

// Auf macOS muss eine vorhandene Signatur weg, sonst verweigert das System
// die veraenderte Datei.
if (process.platform === 'darwin') {
  try {
    execFileSync('codesign', ['--remove-signature', ROH], { stdio: 'ignore' });
    console.log('    Signatur entfernt');
  } catch { console.log('    codesign nicht gefunden — weiter ohne'); }
}

// --------------------------------------------------------- 3. Blob einfuegen

schritt(3, 'Datenblock in die Binaerdatei schreiben');

/*
  postject wird DIREKT aufgerufen, nicht ueber npx.
  
  Node verweigert seit einer Sicherheitskorrektur das Starten von .cmd- und
  .bat-Dateien ohne Shell -- der Aufruf von npx.cmd scheitert dort mit
  EINVAL. Der Umweg ueber die Shell waere moeglich, aber unnoetig: postject
  bringt eine Programmierschnittstelle mit. Kein Unterprozess heisst auch:
  keine Abhaengigkeit davon, ob npx im Pfad liegt.
*/
await inject(ROH, 'NODE_SEA_BLOB', readFileSync(BLOB), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
});
console.log('    eingefuegt');

if (process.platform === 'darwin') {
  try {
    execFileSync('codesign', ['--sign', '-', ROH], { stdio: 'ignore' });
    console.log('    neu signiert');
  } catch { /* ohne Signatur weiter */ }
}

// ------------------------------------------------------------------ 4. Probe

schritt(4, 'Probe');
const ausgabe = execFileSync(ROH, ['--version'], { encoding: 'utf8' }).trim();
console.log(`    --version meldet ${ausgabe}`);

schritt(5, 'An den endgueltigen Platz legen');
try {
  rmSync(ZIEL, { force: true });
  renameSync(ROH, ZIEL);
} catch (err) {
  // Erst hier kann es scheitern, und dann ist der Bau fertig -- die Datei
  // liegt nur unter dem Zwischennamen. Das ist eine brauchbare Lage, also
  // wird sie erklaert statt mit einem Stapelabzug abgebrochen.
  const ist = err.code === 'EBUSY' || err.code === 'EPERM';
  console.error(`\n  ${ist ? 'Die alte Datei ist gesperrt.' : err.message}`);
  console.error(`  Die neue Fassung liegt fertig unter:`);
  console.error(`    ${ROH}\n`);
  console.error('  Meist laeuft der Miner noch, oder ein Virenscanner haelt die');
  console.error('  Datei offen. Miner beenden, kurz warten, dann:');
  console.error(`    ${istWindows ? 'del dist\\yskar-miner.exe' : 'rm dist/yskar-miner'}`);
  console.error('    npm run build:exe\n');
  process.exit(1);
}

console.log(`\nFertig: ${ZIEL}  (${mb(ZIEL)} MB)`);
console.log('\nDiese Datei laeuft ohne Node und ohne Installation.');
console.log('Naechster Schritt:');
console.log(`  ${istWindows ? 'yskar-miner.exe' : './yskar-miner'} --address ysr1…\n`);
