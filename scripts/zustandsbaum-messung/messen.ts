/**
 * Leistungsmessung des Zustandsbaums (docs/CONSENSUS_V6.md 14, "Performance").
 *
 *   node --experimental-strip-types scripts/zustandsbaum-messung/messen.ts [--gross]
 *
 * Teil A -- der schlimmste Block nach 5.2: so viele Sammelzahlungen mit je
 * 1.000 Ausgaben an NEUE Adressen, wie in 1 MiB passen. Gemessen werden
 * applyBlock (Stapelpruefung der Signaturen, Pruefung jeder Transaktion,
 * Zustand aendern) und die neue Zustandswurzel danach -- die beiden Schritte,
 * die ein Knoten fuer einen solchen Block mehr tut als fuer einen leeren. Das
 * fuer verschieden viele Konten, die schon VOR dem Block im Zustand stehen.
 *
 * Teil B -- die Zustandswurzel allein, alt (flacher Baum) und neu (5.2), bei
 * wachsender Kontenzahl. smt.ts rechnet die Wurzel bei jedem Block aus ALLEN
 * Konten neu; die Zeit waechst deshalb mit der Kontenzahl, nicht mit der
 * Zahl der Aenderungen.
 *
 * Je Wert der Median aus drei Laeufen. Ohne --gross bis 200.000 Konten, mit
 * --gross bis 1.000.000.
 */
import { cpus, totalmem } from 'node:os';

import { REGTEST_V6 } from '../../src/lib/core/networks.ts';
import * as T from '../../src/lib/core/tx.ts';
import { emptyState, cloneState, applyBlock, stateRoot, stateRootV6, type State } from '../../src/lib/core/state.ts';
import { buildBlock } from '../../src/lib/core/builder.ts';
import { serializeBlock } from '../../src/lib/core/block.ts';
import { keypairFromSeed } from '../../src/lib/core/wallet.ts';
import { MAX_BLOCK_BYTES } from '../../src/lib/core/params.ts';

const V6 = REGTEST_V6;
const gross = process.argv.includes('--gross');
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (f: () => void) => { const t = performance.now(); f(); return performance.now() - t; };

/** Eine Adresse aus einer laufenden Nummer und einem Bereich, damit sich nichts ueberschneidet. */
function adresse(bereich: number, i: number): Uint8Array {
  const a = new Uint8Array(20);
  a[0] = bereich; a[1] = (i >>> 24) & 0xff; a[2] = (i >>> 16) & 0xff; a[3] = (i >>> 8) & 0xff; a[4] = i & 0xff;
  return a;
}

/** Zustand mit n Hintergrundkonten. */
function hintergrund(n: number): State {
  const s = emptyState();
  for (let i = 0; i < n; i++) s.set(Buffer.from(adresse(0x10, i)).toString('hex'), { balance: 1_000n + BigInt(i), nonce: BigInt(i % 7) });
  return s;
}

console.log(`Rechner: ${cpus().length} Kerne (${cpus()[0]?.model ?? '?'}), ${Math.round(totalmem() / 2 ** 30)} GB, Node ${process.version}`);

// ------------------------------------------------------------------ Teil A
console.log('\nTeil A: schlimmster Block (1 MiB Sammelzahlungen an neue Adressen)');
const absender = Array.from({ length: 40 }, (_, i) => keypairFromSeed(new Uint8Array(32).fill(100 + i)));
const mempool = absender.map((k, j) => T.buildBatch({
  from: k.addressRaw,
  outputs: Array.from({ length: 1_000 }, (_, i) => ({ to: adresse(0x60 + j, i), amount: 1_000n })),
  fee: 100_000n, nonce: 0n, publicKey: k.publicKey, privateKey: k.privateKey, chainId: V6.chainId,
}));

const groessenA = gross ? [0, 100_000, 1_000_000] : [0, 100_000];
const ergebnisA: Record<string, unknown>[] = [];
for (const n of groessenA) {
  const basis = hintergrund(n);
  for (const k of absender) basis.set(Buffer.from(k.addressRaw).toString('hex'), { balance: 10n ** 12n, nonce: 0n });
  const gebaut = buildBlock({ height: 10, prevHash: new Uint8Array(32), state: basis, mempool,
    minerAddress: adresse(0x01, 1), timestamp: 1n, difficulty: 1n, extranonce: 0n, params: V6 });
  const bytes = serializeBlock(gebaut.block).length;
  const ausgaben = gebaut.included.reduce((s, t) => s + ((t as T.Batch).outputs?.length ?? 0), 0);
  const anwenden: number[] = [], wurzel: number[] = [];
  let nachher = 0;
  for (let lauf = 0; lauf < 3; lauf++) {
    const s = cloneState(basis);
    anwenden.push(ms(() => { const r = applyBlock(s, gebaut.block, V6); if (!r.ok) throw new Error(JSON.stringify(r.error)); }));
    wurzel.push(ms(() => stateRootV6(s)));
    nachher = s.size;
  }
  const z = {
    konten_vorher: basis.size, konten_nachher: nachher, sammelzahlungen: gebaut.included.length,
    neue_konten: ausgaben, blockgroesse: bytes, grenze: MAX_BLOCK_BYTES,
    anwenden_ms: Math.round(median(anwenden)), neue_wurzel_ms: Math.round(median(wurzel)),
    zusammen_ms: Math.round(median(anwenden) + median(wurzel)),
  };
  ergebnisA.push(z);
  console.log(`  ${String(z.konten_vorher).padStart(9)} Konten vorher: ${z.sammelzahlungen} Sammelzahlungen, ` +
    `${z.neue_konten} neue Konten, ${z.blockgroesse} Byte | anwenden ${z.anwenden_ms} ms, ` +
    `neue Wurzel ${z.neue_wurzel_ms} ms, zusammen ${z.zusammen_ms} ms`);
}

// ------------------------------------------------------------------ Teil B
console.log('\nTeil B: Zustandswurzel allein');
const groessenB = gross ? [1_000, 10_000, 100_000, 500_000, 1_000_000] : [1_000, 10_000, 100_000, 200_000];
const ergebnisB: Record<string, unknown>[] = [];
for (const n of groessenB) {
  const s = hintergrund(n);
  const alt = [0, 1, 2].map(() => ms(() => stateRoot(s)));
  const neu = [0, 1, 2].map(() => ms(() => stateRootV6(s)));
  const z = { konten: n, alte_wurzel_ms: Math.round(median(alt)), neue_wurzel_ms: Math.round(median(neu)) };
  ergebnisB.push(z);
  console.log(`  ${String(n).padStart(9)} Konten: alt ${z.alte_wurzel_ms} ms, neu ${z.neue_wurzel_ms} ms`);
}

console.log('\n' + JSON.stringify({ rechner: { kerne: cpus().length, modell: cpus()[0]?.model, gb: Math.round(totalmem() / 2 ** 30), node: process.version }, teilA: ergebnisA, teilB: ergebnisB }));
