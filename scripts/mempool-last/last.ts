/**
 * Lasttest des Mempools (docs/CONSENSUS_V6.md, Abschnitt 13b).
 *
 *   node --experimental-strip-types --expose-gc scripts/mempool-last/last.ts [anzahl] [mb]
 *
 * Erzeugt `anzahl` echt signierte Ueberweisungen (Vorgabe 250.000) von
 * 10.000 Konten mit zufaelligen Gebuehren und reicht sie einem Mempool mit
 * `mb` MB Grenze (Vorgabe 32) ein -- mehr, als hineinpasst. Gemessen wird:
 *
 *   - wie viele angenommen, verdraengt und mit welchem Grund abgewiesen werden
 *     (es darf nur `pool_min_fee` und `sender_limit` geben),
 *   - dass eine Transaktion mit hoher Gebuehr bei vollem Mempool immer
 *     hineinkommt, und eine mit der gemeldeten Untergrenze auch,
 *   - Arbeitsspeicher nach einer Speicherbereinigung,
 *   - Dauer von Aufnahme, Blockauswahl, Vorschau (/fees), Aufraeumen nach
 *     einem Block.
 *
 * Laeuft vollstaendig im Speicher, ohne Netz und ohne Kette. Beruehrt
 * keinen laufenden Knoten.
 */
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { buildTransfer, senderRaw, spendTotal, type Spend } from '../../src/lib/core/tx.ts';
import { keypairFromSeed, type Keypair } from '../../src/lib/core/wallet.ts';
import { MAINNET } from '../../src/lib/core/networks.ts';
import { UNIT } from '../../src/lib/core/params.ts';
import { emptyState } from '../../src/lib/core/state.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { selectTransactions, Auswahl } from '../../src/lib/core/builder.ts';
import { marktlage } from '../../src/lib/core/feemarket.ts';

const ANZAHL = Number(process.argv[2] ?? 250_000);
const MB = Number(process.argv[3] ?? 32);
const KONTEN = 10_000;
const H = 6_000;
const PLAETZE = 4_999;   // ab Fassung 6
const ZIEL = new Uint8Array(20).fill(0xee);

const gc = (globalThis as { gc?: () => void }).gc;
const mb = () => { gc?.(); gc?.(); return (process.memoryUsage().heapUsed / 1048576).toFixed(0); };
const sek = (t: number) => ((performance.now() - t) / 1000).toFixed(2) + ' s';
const ms = (t: number) => (performance.now() - t).toFixed(0) + ' ms';

let saat = 20261023;
const zufall = (n: number) => { saat = (saat * 1103515245 + 12345) % 2 ** 31; return saat % n; };

console.log(`Lasttest: ${ANZAHL} Ueberweisungen, ${KONTEN} Konten, Grenze ${MB} MB`);
const grund = mb();

let t = performance.now();
const keys: Keypair[] = [];
const state = emptyState();
for (let i = 0; i < KONTEN + 1; i++) {
  const seed = new Uint8Array(64);
  seed[0] = i & 0xff; seed[1] = (i >> 8) & 0xff; seed[2] = i >> 16; seed[3] = 0x77;
  const k = keypairFromSeed(seed, 0, 0);
  keys.push(k);
  state.set(toHex(k.addressRaw), { balance: 1_000_000n * UNIT, nonce: 0n });
}
console.log(`Konten:           ${sek(t)}`);

// Gebuehren: 10 bis 60 Einheiten je Byte, ein paar deutlich hoeher.
t = performance.now();
const txs: Spend[] = [];
const nonce = new Array<number>(KONTEN).fill(0);
for (let n = 0; n < ANZAHL; n++) {
  const i = n % KONTEN;
  const k = keys[i];
  const jeByte = 10 + zufall(51) + (zufall(100) === 0 ? 200 : 0);
  txs.push(buildTransfer({
    from: k.addressRaw, to: ZIEL, amount: UNIT, fee: BigInt(jeByte * 168), nonce: BigInt(nonce[i]++),
    publicKey: k.publicKey, privateKey: k.privateKey,
  }));
}
console.log(`Signiert:         ${sek(t)}`);

const pool = new TxPool(MAINNET, undefined, { maxBytes: MB * 1024 * 1024 });
const gruende = new Map<string, number>();
let verdraengt = 0;
t = performance.now();
for (const x of txs) {
  const r = pool.add(x, state, H);
  const g = r.ok ? 'angenommen' : r.reason;
  gruende.set(g, (gruende.get(g) ?? 0) + 1);
  if (r.ok && r.verdraengt) verdraengt += r.verdraengt;
}
const aufnahme = performance.now() - t;
console.log(`Aufnahme:         ${(aufnahme / 1000).toFixed(2)} s (${(ANZAHL / (aufnahme / 1000)).toFixed(0)} je Sekunde)`);
console.log(`Ergebnis:        `, Object.fromEntries(gruende), `verdraengt ${verdraengt}`);
console.log(`Mempool:          ${pool.size()} Tx, ${(pool.belegt() / 1048576).toFixed(1)} MB, Untergrenze ${pool.untergrenzeJeByte().toFixed(2)} je Byte`);
console.log(`Speicher:         ${mb()} MB Heap (vorher ${grund} MB, inkl. der ${ANZAHL} erzeugten Tx und Konten)`);

const erlaubt = new Set(['angenommen', 'pool_min_fee', 'sender_limit', 'nonce_gap']);
for (const g of gruende.keys()) if (!erlaubt.has(g)) throw new Error(`unerwarteter Grund ${g}`);
if (gruende.has('pool_full')) throw new Error('pool_full darf es nicht geben');

// Eine teure kommt immer hinein, eine mit genau der Untergrenze auch.
const frei = keys[KONTEN];
const teuer = buildTransfer({ from: frei.addressRaw, to: ZIEL, amount: UNIT, fee: 500n * 168n, nonce: 0n,
  publicKey: frei.publicKey, privateKey: frei.privateKey });
const rt = pool.add(teuer, state, H);
console.log(`Hohe Gebuehr:     ${rt.ok ? 'angenommen' : 'ABGELEHNT ' + rt.reason}`);
if (!rt.ok) throw new Error('hohe Gebuehr abgelehnt');
const genau = pool.mindestGebuehr(H);
const k2 = keys[KONTEN];
const mitUntergrenze = buildTransfer({ from: k2.addressRaw, to: ZIEL, amount: UNIT, fee: genau, nonce: 1n,
  publicKey: k2.publicKey, privateKey: k2.privateKey });
const ru = pool.add(mitUntergrenze, state, H);
console.log(`Mit Untergrenze:  ${genau} -> ${ru.ok ? 'angenommen' : 'abgelehnt ' + ru.reason + ' (noetig ' + ru.noetig + ')'}`);
if (!ru.ok) {
  // Bei vollem Mempool reicht die Untergrenze genau dann, wenn sie ueber der
  // billigsten wartenden liegt; sonst nennt die Ablehnung den naechsten Betrag.
  const r2 = pool.add(buildTransfer({ from: k2.addressRaw, to: ZIEL, amount: UNIT, fee: ru.noetig!, nonce: 1n,
    publicKey: k2.publicKey, privateKey: k2.privateKey }), state, H);
  console.log(`Mit "noetig":     ${r2.ok ? 'angenommen' : 'ABGELEHNT ' + r2.reason}`);
  if (!r2.ok) throw new Error('die gemeldete Gebuehr reichte nicht');
}

// Blockbau, Vorschau, Aufraeumen.
t = performance.now();
const liste = pool.fuerBlock(H);
console.log(`fuerBlock:        ${ms(t)} (${liste.length})`);
t = performance.now();
const { included } = selectTransactions(state, liste, H, PLAETZE, MAINNET, { vorgeprueft: true });
console.log(`Blockauswahl:     ${ms(t)} (${included.length} Tx)`);
t = performance.now();
const m = marktlage(state, liste, H, PLAETZE, pool.mindestGebuehr(H), { basisBytes: 168, bloecke: 64, vorgeprueft: true });
console.log(`Vorschau 64 Bl.:  ${ms(t)} (${m.bloecke.length} Bloecke, ${m.vorschau.plaetze.size} Tx; schnell ${m.schnell.jeByte.toFixed(1)}, normal ${m.normal.jeByte.toFixed(1)}, langsam ${m.langsam.jeByte.toFixed(1)} je Byte)`);
t = performance.now();
const a = new Auswahl(state, liste, H, MAINNET, { vorgeprueft: true });
let bloecke = 0;
while (!a.leer() && a.naechsterBlock(PLAETZE, H + bloecke).included.length > 0) bloecke++;
console.log(`Ganze Warteschl.: ${ms(t)} (${bloecke} Bloecke)`);

const nachher = new Map(state);
for (const x of included) {
  const key = toHex(senderRaw(x)); const alt = nachher.get(key)!;
  nachher.set(key, { balance: alt.balance - spendTotal(x), nonce: alt.nonce + 1n });
}
t = performance.now();
const nb = pool.nachBlock(included, nachher, H + 1);
console.log(`nachBlock:        ${ms(t)} (entfernt ${nb.entfernt}, ungueltig ${nb.ungueltig})`);
t = performance.now();
const konto = pool.zuKonto(toHex(keys[17].addressRaw));
console.log(`Kontoabfrage:     ${ms(t)} (${konto.length} wartend)`);
console.log('OK');
