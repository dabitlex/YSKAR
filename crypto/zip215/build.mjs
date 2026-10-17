/**
 * Baut das ZIP-215-Modul und bettet es ein (docs/CONSENSUS_V6.md 7.8).
 *
 *   node crypto/zip215/build.mjs            bauen und src/lib/node/zip215Wasm.ts schreiben
 *   node crypto/zip215/build.mjs --pruefen  bauen und nur vergleichen (Nachbau-Probe)
 *
 * Voraussetzung: rustup. Die Compiler-Fassung legt rust-toolchain.toml fest,
 * die Abhaengigkeiten Cargo.lock (--locked). Pfade werden aus der Datei
 * entfernt (--remap-path-prefix), damit der Ort des Checkouts das Ergebnis
 * nicht veraendert: Wer an anderer Stelle nachbaut, muss byteweise dieselbe
 * Datei und damit denselben SHA-256 erhalten.
 *
 * Die WASM-Datei wird als Base64 in eine TypeScript-Datei geschrieben, damit
 * Kommandozeilen-Knoten, Node Core (Electron) und Server sie ohne Dateipfad
 * laden. Sie ist ein Bauergebnis und steht trotzdem im Repository -- wie der
 * Miner unter public/miner.<hash>.wasm --, damit niemand Rust braucht, um
 * einen Knoten zu bauen. Die Probe oben zeigt, dass sie zur Quelle passt.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const hier = dirname(fileURLToPath(import.meta.url));
const ziel = join(hier, '..', '..', 'src', 'lib', 'node', 'zip215Wasm.ts');
const cargoHome = process.env.CARGO_HOME ?? join(homedir(), '.cargo');
const rustup = process.env.RUSTUP_HOME ?? join(homedir(), '.rustup');

execFileSync('cargo', ['build', '--release', '--locked'], {
  cwd: hier, stdio: 'inherit',
  env: {
    ...process.env,
    RUSTFLAGS: [
      `--remap-path-prefix=${hier}=/yskar-zip215`,
      `--remap-path-prefix=${cargoHome}=/cargo`,
      `--remap-path-prefix=${rustup}=/rustup`,
    ].join(' '),
  },
});

const wasm = readFileSync(join(hier, 'target', 'wasm32-unknown-unknown', 'release', 'yskar_zip215.wasm'));
const sha = createHash('sha256').update(wasm).digest('hex');
console.log(`yskar_zip215.wasm: ${wasm.length} Byte, SHA-256 ${sha}`);

if (process.argv.includes('--pruefen')) {
  const vorhanden = readFileSync(ziel, 'utf8').match(/ZIP215_WASM_SHA256 = '([0-9a-f]{64})'/)?.[1];
  if (vorhanden !== sha) {
    console.error(`ABWEICHUNG: eingebettet ${vorhanden}, nachgebaut ${sha}`);
    process.exit(1);
  }
  console.log('Nachbau stimmt mit der eingebetteten Datei ueberein.');
  process.exit(0);
}

writeFileSync(ziel, `/**
 * ERZEUGT von crypto/zip215/build.mjs -- nicht von Hand aendern.
 *
 * ed25519-zebra 5.0.0 (Zcash Foundation) als WebAssembly, Quelle in
 * crypto/zip215. Nachbau-Probe: node crypto/zip215/build.mjs --pruefen
 */
export const ZIP215_WASM_SHA256 = '${sha}';
export const ZIP215_WASM_BASE64 =
  '${wasm.toString('base64')}';
`);
console.log(`geschrieben: ${ziel}`);
