/**
 * Legt die gebaute Engine unter einem Namen ab, der ihren Inhalt enthaelt,
 * und schreibt die Adresse nach src/lib/minerWasm.ts.
 *
 * Notwendig, weil die Datei mit Cache-Control: immutable ausgeliefert wird.
 * Ein gleichbleibender Name plus Jahres-Cache heisst: Geraete, die einmal
 * eine Fassung geladen haben, bekommen nie wieder eine neue -- und eine
 * alte Engine mit anderem Speicherlayout rechnet dann endlos ins Leere.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = path.join(__dirname, 'sha256d_miner.wasm');
const buf = fs.readFileSync(src);
const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const name = `miner.${hash}.wasm`;

const publicDir = path.join(__dirname, '..', 'public');
for (const alt of fs.readdirSync(publicDir)) {
  if (/^miner\.[0-9a-f]{10}\.wasm$/.test(alt) && alt !== name) {
    fs.unlinkSync(path.join(publicDir, alt));
    console.log('alte Fassung entfernt:', alt);
  }
}
fs.writeFileSync(path.join(publicDir, name), buf);

// Auch neben den eigenstaendigen Miner legen. Ohne das liefe er nach einem
// Neubau mit einer veralteten Engine -- und faende nie einen Share.
const minerDir = path.join(__dirname, '..', 'miner');
if (fs.existsSync(minerDir)) {
  for (const alt of fs.readdirSync(minerDir)) {
    if (/^miner\.[0-9a-f]{10}\.wasm$/.test(alt) && alt !== name) {
      fs.unlinkSync(path.join(minerDir, alt));
    }
  }
  fs.writeFileSync(path.join(minerDir, name), buf);
  console.log(`miner/${name}`);
}

fs.writeFileSync(path.join(__dirname, '..', 'src', 'lib', 'minerWasm.ts'),
`// Von wasm/publish.js erzeugt. Nicht von Hand aendern.
export const MINER_WASM_URL = '/${name}';
export const MINER_WASM_SHA256_PREFIX = '${hash}';
`);
console.log(`public/${name} (${buf.length} B)`);
