/**
 * Zustandsbaum gegen die echte Kette (docs/CONSENSUS_V6.md 14, "State tree").
 *
 *   node --experimental-strip-types scripts/zustandsbaum-abgleich/nachspielen.ts \
 *        --data <knoten-ordner> --out <ausgabe-ordner>
 *
 * Spielt die Hauptkette einer lokalen Ablage (chain.db, z. B. von
 * `yskar-node sync`) ab Genesis Block fuer Block nach und rechnet nach JEDEM
 * Block beide Zustandswurzeln:
 *
 *   alt  -- der flache Baum von heute (PROTOCOL.md). Muss gleich der
 *           Wurzel im Blockkopf sein; sonst ist schon das Nachspielen falsch.
 *   neu  -- der Sparse-Merkle-Baum der Fassung 6 (5.2) ueber denselben
 *           Zustand: die Wurzel, die an dieser Stelle im Kopf stuende, laege
 *           die Aktivierungshoehe bei 0.
 *
 * Ausgabe (fuer die Gegenrechnung in gegenrechnung.py):
 *   aenderungen.jsonl  je Block: Hoehe, geaenderte und entfernte Konten
 *                      (Rohadresse hex, Guthaben, Nonce), beide Wurzeln
 *   zusammenfassung.json
 *
 * Liest nur. Die Ablage wird nicht veraendert.
 */
import { writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { MAINNET } from '../../src/lib/core/networks.ts';
import { deserializeBlock } from '../../src/lib/core/block.ts';
import { emptyState, applyBlock, stateRoot, stateRootV6, type State } from '../../src/lib/core/state.ts';
import { toHex } from '../../src/lib/core/codec.ts';

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`${name} fehlt`);
  return process.argv[i + 1];
}

const daten = arg('--data');
const aus = arg('--out');
mkdirSync(aus, { recursive: true });

const store = new ChainStore(join(daten, 'chain.db'), { network: MAINNET.network, chainId: MAINNET.chainId });
const spitze = store.height();
if (spitze < 0) throw new Error('Die Ablage ist leer');

const zeilen = createWriteStream(join(aus, 'aenderungen.jsonl'));
const zustand: State = emptyState();
let vorher = new Map<string, string>();     // adresse -> "guthaben/nonce"
let altGleich = 0, altUngleich: number[] = [];
let zeitNeuMs = 0, zeitAltMs = 0, maxKonten = 0;
const beginn = Date.now();

for (let h = 0; h <= spitze; h++) {
  const gespeichert = store.mainAt(h);
  if (!gespeichert) throw new Error(`Block ${h} fehlt in der Hauptkette`);
  const block = deserializeBlock(gespeichert.body);
  const r = applyBlock(zustand, block, MAINNET);
  if (!r.ok) throw new Error(`Block ${h} laesst sich nicht anwenden: ${JSON.stringify(r.error)}`);

  let t = performance.now();
  const alt = toHex(stateRoot(zustand));
  zeitAltMs += performance.now() - t;
  t = performance.now();
  const neu = toHex(stateRootV6(zustand));
  zeitNeuMs += performance.now() - t;

  if (alt === toHex(block.header.stateRoot)) altGleich++;
  else altUngleich.push(h);

  // Was hat sich gegenueber dem vorigen Block geaendert?
  const jetzt = new Map<string, string>();
  for (const [a, k] of zustand) jetzt.set(a, `${k.balance}/${k.nonce}`);
  const geaendert: [string, string, string][] = [];
  for (const [a, v] of jetzt) if (vorher.get(a) !== v) {
    const [b, n] = v.split('/');
    geaendert.push([a, b, n]);
  }
  const entfernt = [...vorher.keys()].filter(a => !jetzt.has(a));
  vorher = jetzt;
  maxKonten = Math.max(maxKonten, jetzt.size);

  zeilen.write(JSON.stringify({ h, hash: toHex(gespeichert.hash), alt, neu, geaendert, entfernt }) + '\n');
}
await new Promise<void>(r => zeilen.end(r));

const nullAdresse = toHex(new Uint8Array(20));
const zusammenfassung = {
  bloecke: spitze + 1,
  spitze: { hoehe: spitze, hash: toHex(store.mainAt(spitze)!.hash) },
  konten_am_ende: zustand.size,
  konten_hoechstens: maxKonten,
  alte_wurzel_gleich_blockkopf: altGleich,
  alte_wurzel_ungleich_bei: altUngleich,
  neue_wurzel_am_ende: toHex(stateRootV6(zustand)),
  nulladresse_im_zustand: zustand.has(nullAdresse),
  rechenzeit_ms: { alte_wurzel: Math.round(zeitAltMs), neue_wurzel: Math.round(zeitNeuMs), gesamt: Date.now() - beginn },
};
writeFileSync(join(aus, 'zusammenfassung.json'), JSON.stringify(zusammenfassung, null, 2) + '\n');
console.log(JSON.stringify(zusammenfassung, null, 2));
store.close();
