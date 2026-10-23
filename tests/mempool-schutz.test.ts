/**
 * Mempool: Reorg, Blockade und Speicher (docs/CONSENSUS_V6.md, Abschnitt 13b).
 *
 *   - Ein Reorg nimmt die Transaktionen verdraengter Bloecke zurueck, ohne
 *     dass dabei die spaeteren Nonces desselben Absenders verloren gehen --
 *     auch nicht bei vollem Mempool, gestiegener Untergrenze oder 32
 *     wartenden.
 *   - Verdraengt wird nach dem Satz, zu dem eine Kette tatsaechlich in einen
 *     Block kaeme: dem niedrigsten Satz ihrer Transaktionen. Eine teure
 *     letzte Nonce hinter billigen schuetzt die Kette nicht.
 *   - Abgelehnte Transaktionen hinterlassen nichts im Speicher.
 *   - `pool_min_fee` nennt einen Betrag, der wirklich reicht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TxPool, MAX_PER_SENDER } from '../src/lib/node/fullnode/TxPool.ts';
import { buildTransfer, txidHex, senderRaw, type Spend } from '../src/lib/core/tx.ts';
import { keypairFromSeed, type Keypair } from '../src/lib/core/wallet.ts';
import { MAINNET } from '../src/lib/core/networks.ts';
import { UNIT } from '../src/lib/core/params.ts';
import { emptyState, type State } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { selectTransactions, spendBytes } from '../src/lib/core/builder.ts';

const H = 6_000;
const GROESSE = 168;
const MINDEST = 1_680n;            // 10 je Byte
const ZIEL = new Uint8Array(20).fill(0xee);

const KEYS: Keypair[] = [];
function key(i: number): Keypair {
  while (KEYS.length <= i) {
    const seed = new Uint8Array(64);
    seed[0] = KEYS.length & 0xff; seed[1] = KEYS.length >> 8; seed[2] = 0x6b;
    KEYS.push(keypairFromSeed(seed, 0, 0));
  }
  return KEYS[i];
}
function zustand(n: number, nonce0 = 0n): State {
  const s = emptyState();
  for (let i = 0; i < n; i++) s.set(toHex(key(i).addressRaw), { balance: 1_000n * UNIT, nonce: i === 0 ? nonce0 : 0n });
  return s;
}
function tx(i: number, fee: bigint, nonce = 0n, memo?: Uint8Array): Spend {
  const k = key(i);
  return buildTransfer({ from: k.addressRaw, to: ZIEL, amount: UNIT, fee, nonce, memo,
    publicKey: k.publicKey, privateKey: k.privateKey });
}
function lueckenlos(pool: TxPool, s: State) {
  const je = new Map<string, bigint[]>();
  let bytes = 0;
  for (const t of pool.alle()) {
    bytes += spendBytes(t);
    const k = toHex(senderRaw(t));
    je.set(k, [...(je.get(k) ?? []), t.nonce]);
  }
  assert.equal(pool.belegt(), bytes);
  for (const [k, n] of je) {
    n.sort((a, b) => (a < b ? -1 : 1));
    const start = s.get(k)?.nonce ?? 0n;
    n.forEach((x, i) => assert.equal(x, start + BigInt(i), `lueckenlos ${k.slice(0, 8)}`));
  }
}

// ------------------------------------------------------------ Reorg

test('Reorg: Absender mit 32 wartenden -- die zurueckgenommene kommt dazu, nichts faellt weg', () => {
  const pool = new TxPool(MAINNET);
  const t0 = tx(0, MINDEST, 0n);
  const nachBlock = zustand(1, 1n);
  for (let n = 1n; n <= BigInt(MAX_PER_SENDER); n++) assert.ok(pool.add(tx(0, MINDEST, n), nachBlock, H).ok);
  const ohne = zustand(1, 0n);                 // neuer Zweig ohne t0
  assert.equal(pool.zurueck([t0], ohne, H + 1), 1);
  pool.nachBlock([], ohne, H + 1);
  assert.equal(pool.size(), MAX_PER_SENDER + 1);
  assert.ok(pool.has(txidHex(t0)));
  lueckenlos(pool, ohne);
});

test('Reorg: gestiegene Untergrenze haelt die zurueckgenommene nicht auf', () => {
  let jetzt = 1_000_000;
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 10 * GROESSE, jetzt: () => jetzt });
  const s = zustand(20, 1n);
  const t0 = tx(0, MINDEST, 0n);
  assert.ok(pool.add(tx(0, MINDEST * 5n, 1n), s, H, { lokal: true }).ok);
  for (let i = 1; i < 10; i++) assert.ok(pool.add(tx(i, MINDEST), s, H).ok);
  assert.ok(pool.add(tx(15, MINDEST * 3n), s, H).ok);       // verdraengt, Untergrenze steigt
  assert.ok(pool.untergrenzeJeByte() > 10);
  const ohne = zustand(20, 0n);
  assert.equal(pool.zurueck([t0], ohne, H + 1), 1);
  pool.nachBlock([], ohne, H + 1);
  assert.ok(pool.has(txidHex(t0)));
  const eins = pool.alle().find(t => toHex(senderRaw(t)) === toHex(key(0).addressRaw) && t.nonce === 1n)!;
  assert.ok(eins && pool.istLokal(txidHex(eins)), 'die eigene Nonce 1 bleibt, und bleibt eigen');
  assert.ok(pool.belegt() <= 10 * GROESSE, 'Grenze wieder eingehalten');
  lueckenlos(pool, ohne);
});

test('Reorg: voller Mempool -- Platz machen die billigsten fremden Enden, nicht die Kette des Absenders', () => {
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 6 * GROESSE });
  const nach = zustand(10, 1n);
  for (let n = 1n; n <= 3n; n++) assert.ok(pool.add(tx(0, MINDEST * 4n, n), nach, H).ok);
  for (let i = 1; i <= 3; i++) assert.ok(pool.add(tx(i, MINDEST * BigInt(i + 1)), nach, H).ok);
  const t0 = tx(0, MINDEST * 4n, 0n);
  const ohne = zustand(10, 0n);
  assert.equal(pool.zurueck([t0], ohne, H + 1), 1);
  pool.nachBlock([], ohne, H + 1);
  assert.ok(pool.belegt() <= 6 * GROESSE);
  assert.ok(pool.has(txidHex(t0)));
  for (let n = 1n; n <= 3n; n++) assert.ok(pool.has(txidHex(tx(0, MINDEST * 4n, n))), `Nonce ${n} bleibt`);
  assert.ok(!pool.has(txidHex(tx(1, MINDEST * 2n))), 'das billigste fremde Ende weicht');
  lueckenlos(pool, ohne);
});

test('Reorg: eine bestaetigte eigene Transaktion kommt als eigene zurueck', () => {
  const pool = new TxPool(MAINNET);
  const s0 = zustand(1, 0n);
  const t0 = tx(0, MINDEST, 0n);
  assert.ok(pool.add(t0, s0, H, { lokal: true }).ok);
  const s1 = zustand(1, 1n);
  pool.nachBlock([t0], s1, H + 1);
  assert.equal(pool.size(), 0);
  assert.equal(pool.zurueck([t0], s0, H + 1), 1);
  assert.ok(pool.istLokal(txidHex(t0)));
});

test('Reorg: mehrere zurueckgenommene in beliebiger Reihenfolge -- nach Nonce aufgenommen', () => {
  const pool = new TxPool(MAINNET);
  const ts = [0n, 1n, 2n].map(n => tx(0, MINDEST, n));
  const ohne = zustand(1, 0n);
  assert.equal(pool.zurueck([ts[2], ts[0], ts[1]], ohne, H + 1), 3);
  lueckenlos(pool, ohne);
});

// ------------------------------------------------------------ Blockade

test('Blockade: eine teure letzte Nonce hinter billigen schuetzt die Kette nicht', () => {
  const s = zustand(20);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 5 * 32 * GROESSE });
  for (let a = 0; a < 5; a++) {
    for (let n = 0n; n < 32n; n++) {
      assert.ok(pool.add(tx(a, n === 31n ? 1000n * 168n : MINDEST, n), s, H).ok);
    }
  }
  const ehrlich = tx(10, 500n * 168n, 0n);
  const r = pool.add(ehrlich, s, H);
  assert.ok(r.ok, JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? String(v) : v)));
  // Die ehrliche kommt in den naechsten Block.
  const blk = selectTransactions(s, pool.fuerBlock(H), H, 10, MAINNET, { vorgeprueft: true });
  assert.ok(blk.included.some(t => txidHex(t) === txidHex(ehrlich)));
  lueckenlos(pool, s);
});

test('Blockade: eine teure Transaktion hinter eigener billiger Kette verdraengt keine besseren', () => {
  const s = zustand(20);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 4 * GROESSE });
  assert.ok(pool.add(tx(0, MINDEST, 0n), s, H).ok);          // 10 je Byte
  for (let i = 1; i <= 3; i++) assert.ok(pool.add(tx(i, MINDEST * 3n), s, H).ok);   // 30 je Byte
  // Nonce 1 von Absender 0 bietet 100 je Byte, kaeme aber erst mit Nonce 0 (10 je Byte) in einen Block.
  const r = pool.add(tx(0, MINDEST * 10n, 1n), s, H);
  assert.equal(!r.ok && r.reason, 'pool_min_fee');
  for (let i = 1; i <= 3; i++) assert.ok(pool.has(txidHex(tx(i, MINDEST * 3n))));
});

test('Verdraengung: die Kette mit dem niedrigsten wirksamen Satz weicht zuerst, von hinten', () => {
  const s = zustand(20);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 4 * GROESSE });
  assert.ok(pool.add(tx(0, MINDEST, 0n), s, H).ok);                // 10
  assert.ok(pool.add(tx(0, MINDEST * 9n, 1n), s, H).ok);           // 90, wirksam 10
  assert.ok(pool.add(tx(1, MINDEST * 2n), s, H).ok);               // 20
  assert.ok(pool.add(tx(2, MINDEST * 3n), s, H).ok);               // 30
  assert.ok(pool.add(tx(3, MINDEST * 4n), s, H).ok);               // 40
  assert.ok(!pool.has(txidHex(tx(0, MINDEST * 9n, 1n))), 'das Ende der Kette mit wirksam 10 weicht');
  assert.ok(pool.has(txidHex(tx(0, MINDEST, 0n))));
  lueckenlos(pool, s);
});

// ------------------------------------------------------------ Speicher

test('Ungueltige Signaturen hinterlassen nichts in der Verdraengungsliste', () => {
  const s = zustand(60);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 200 * GROESSE });
  for (let i = 1; i <= 40; i++) for (let n = 0n; n < 5n; n++) assert.ok(pool.add(tx(i, MINDEST, n), s, H).ok);
  const vorher = (pool as unknown as { haufen: unknown[] }).haufen.length;
  const gut = tx(50, MINDEST * 10n, 0n);
  for (let k = 0; k < 5_000; k++) {
    const schlecht = { ...gut, fee: gut.fee + BigInt(k + 1) } as Spend;   // Signatur passt nicht mehr
    const r = pool.add(schlecht, s, H);
    assert.equal(!r.ok && r.reason, 'bad_signature');
  }
  const nachher = (pool as unknown as { haufen: unknown[] }).haufen.length;
  assert.ok(nachher <= vorher, `${vorher} -> ${nachher}`);
  assert.equal(pool.size(), 200);
});

test('Auch Ablehnungen wegen zu wenig Gebuehr lassen die Liste nicht wachsen', () => {
  const s = zustand(60);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 50 * GROESSE });
  for (let i = 1; i <= 10; i++) for (let n = 0n; n < 5n; n++) assert.ok(pool.add(tx(i, MINDEST * 2n, n), s, H).ok);
  const vorher = (pool as unknown as { haufen: unknown[] }).haufen.length;
  for (let k = 0; k < 2_000; k++) pool.add(tx(50, MINDEST + BigInt(k % 100), 0n), s, H);
  assert.ok((pool as unknown as { haufen: unknown[] }).haufen.length <= vorher);
});

// ------------------------------------------------------------ required

test('pool_min_fee: der genannte Betrag reicht auch, wenn mehrere weichen muessen', () => {
  const s = zustand(20);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 4 * GROESSE });
  assert.ok(pool.add(tx(1, MINDEST), s, H).ok);            // 10
  assert.ok(pool.add(tx(2, MINDEST * 2n), s, H).ok);       // 20
  assert.ok(pool.add(tx(3, MINDEST * 5n), s, H).ok);       // 50
  assert.ok(pool.add(tx(4, MINDEST * 5n), s, H).ok);       // 50
  const memo = new Uint8Array(32).fill(1);                  // 200 Byte: zwei muessen weichen
  const erst = pool.add(tx(9, 2_000n, 0n, memo), s, H);
  assert.equal(!erst.ok && erst.reason, 'pool_min_fee');
  const noetig = !erst.ok ? erst.noetig : undefined;
  assert.ok(typeof noetig === 'bigint');
  const zweit = pool.add(tx(9, noetig!, 0n, memo), s, H);
  assert.ok(zweit.ok, `mit ${noetig} angenommen`);
  lueckenlos(pool, s);
});

test('Blockbau: eine schon verbrauchte Nonce sperrt die folgenden desselben Absenders nicht', () => {
  const s = zustand(2);
  s.set(toHex(key(0).addressRaw), { balance: 1_000n * UNIT, nonce: 5n });
  const t4 = tx(0, MINDEST, 4n), t5 = tx(0, MINDEST, 5n), t6 = tx(0, MINDEST, 6n);
  const r = selectTransactions(s, [t4, t5, t6], H, 10, MAINNET, { vorgeprueft: true });
  assert.deepEqual(r.included.map(t => t.nonce), [5n, 6n]);
});

test('Reorg: Platz, den der neue Zweig gleich freigibt, verdraengt niemanden und hebt die Untergrenze nicht', () => {
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 10 * GROESSE });
  const s = zustand(20);
  for (let i = 1; i <= 10; i++) assert.ok(pool.add(tx(i, MINDEST * BigInt(i)), s, H).ok);
  // Alter Zweig hatte die Ueberweisungen von 11 und 12; der neue bestaetigt 1 und 2.
  const nachNeu = zustand(20);
  nachNeu.set(toHex(key(1).addressRaw), { balance: 1_000n * UNIT, nonce: 1n });
  nachNeu.set(toHex(key(2).addressRaw), { balance: 1_000n * UNIT, nonce: 1n });
  const alt = [tx(11, MINDEST * 20n), tx(12, MINDEST * 20n)];
  const vorherGrenze = pool.untergrenzeJeByte();
  assert.equal(pool.zurueck(alt, nachNeu, H + 1), 2);
  pool.nachBlock([tx(1, MINDEST), tx(2, MINDEST * 2n)], nachNeu, H + 1);
  assert.equal(pool.size(), 10, 'alle uebrigen bleiben');
  for (let i = 3; i <= 10; i++) assert.ok(pool.has(txidHex(tx(i, MINDEST * BigInt(i)))), `Absender ${i} bleibt`);
  assert.equal(pool.untergrenzeJeByte(), vorherGrenze);
  lueckenlos(pool, nachNeu);
});
