/**
 * Das Verzeichnis der Kette (kettenIndex.ts) darf an den Antworten von
 * /account, /tx und /search nichts aendern -- nur daran, wie schnell sie
 * kommen.
 *
 * Verglichen wird mit der Leseschnittstelle, wie sie VOR dem Verzeichnis
 * war (tests/helpers/ReadApiVorher.ts, unveraendert uebernommen). Beide
 * lesen dieselbe Ablage, dieselbe Kette und denselben Mempool; jede Antwort
 * muss Zeichen fuer Zeichen gleich sein.
 *
 * Die Kette ist echt gemint und laeuft durch die volle Pruefung: Solo- und
 * Pool-Bloecke, Ueberweisungen, und zwei Reorgs -- einer auf einen
 * laengeren Zweig, einer wieder zurueck. Gerade beim Reorg muss das
 * Verzeichnis Bloecke wieder austragen, die nicht mehr gelten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { ReadApi } from '../src/lib/node/fullnode/ReadApi.ts';
import { ReadApiVorher } from './helpers/ReadApiVorher.ts';
import { buildBlock, finalizeBlock } from '../src/lib/core/builder.ts';
import { serializeHeader, serializeBlock, headerHash, deserializeBlock } from '../src/lib/core/block.ts';
import { applyBlock, cloneState, emptyState, type State } from '../src/lib/core/state.ts';
import { targetFromDifficulty, rewardAt, UNIT } from '../src/lib/core/params.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { buildTransfer, txid, type Transfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const K = [0, 1, 2, 3].map(i => keypairFromMnemonic(WORTE, '', 0, i));
const fremd = (n: number) => new Uint8Array(20).fill(n);
/** Wie JSON.stringify, aber bigint wird lesbar statt eines Fehlers. */
const js = (x: unknown) => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? `${v}n` : v);

interface Stand { state: State; prev: Uint8Array; hoehe: number; zeit: bigint }

/** Einen Block bauen und echt minen (Testnetz-Difficulty 1). */
function mine(st: Stand, opt: { miner?: Uint8Array; empfaenger?: Uint8Array[]; txs?: Transfer[]; extranonce?: bigint }) {
  const anteile = opt.empfaenger
    ? (brutto: bigint) => {
        const n = BigInt(opt.empfaenger!.length);
        const je = brutto / n;
        return opt.empfaenger!.map((to, i) => ({ to, amount: i === 0 ? brutto - je * (n - 1n) : je }));
      }
    : undefined;
  const gebaut = buildBlock({
    height: st.hoehe, prevHash: st.prev, state: st.state, mempool: opt.txs ?? [],
    minerAddress: opt.miner ?? K[0].addressRaw, timestamp: st.zeit, difficulty: 1n,
    extranonce: opt.extranonce ?? 0n, coinbaseExtra: new Uint8Array(0), anteile, params: REGTEST,
  });
  assert.equal(gebaut.included.length, (opt.txs ?? []).length, 'alle Ueberweisungen muessen in den Block');
  const ziel = Buffer.from(targetFromDifficulty(1n).toString(16).padStart(64, '0'), 'hex');
  const kopf = Buffer.from(serializeHeader(finalizeBlock(gebaut, 0n).header));
  const h = (b: Uint8Array) => createHash('sha256').update(b).digest();
  for (let nonce = 0; ; nonce++) {
    kopf.writeUInt32LE(nonce, 128);
    if (Buffer.compare(h(h(kopf)), ziel) <= 0) {
      const block = finalizeBlock(gebaut, BigInt(nonce));
      const naechster = cloneState(st.state);
      const r = applyBlock(naechster, block, REGTEST);
      assert.ok(r.ok, r.error?.reason);
      return {
        body: serializeBlock(block),
        txids: block.txs.map(t => toHex(txid(t))),
        weiter: { state: naechster, prev: headerHash(block.header), hoehe: st.hoehe + 1, zeit: st.zeit + 600n } as Stand,
      };
    }
  }
}

function ueberweisung(st: Stand, von: number, an: Uint8Array, betrag: bigint, nonceDazu = 0n): Transfer {
  const k = K[von];
  const nonce = (st.state.get(toHex(k.addressRaw))?.nonce ?? 0n) + nonceDazu;
  return buildTransfer({ chainId: REGTEST.chainId, from: k.addressRaw, to: an, amount: betrag,
    fee: 5000n, nonce, publicKey: k.publicKey, privateKey: k.privateKey });
}

test('Verzeichnis: /account, /tx und /search antworten genau wie vorher -- auch ueber zwei Reorgs', () => {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  const pool = new TxPool(REGTEST);
  const neu = new ReadApi({ chain, store, pool });
  const alt = new ReadApiVorher({ chain, store, pool });
  // Kleine Suchtiefe: prueft die Grenze von blocksFound, historyDepth und /tx.
  const neuFlach = new ReadApi({ chain, store, pool, verlaufTiefe: 7 });
  const altFlach = new ReadApiVorher({ chain, store, pool, verlaufTiefe: 7 });

  const adressen = new Set<string>([...K.map(k => encodeAddress(k.addressRaw)),
    encodeAddress(fremd(0x55)), encodeAddress(fremd(0x66))]);
  const txids = new Set<string>(['00'.repeat(32), 'ab'.repeat(32)]);
  const hashes: string[] = [];
  let vergleiche = 0;

  const pruefe = (wo: string) => {
    for (const [n, a] of [[neu, alt], [neuFlach, altFlach]] as const) {
      for (const adr of adressen) {
        assert.equal(js(n.account(adr)), js(a.account(adr)), `${wo}: /account ${adr}`);
        vergleiche++;
      }
      for (const id of txids) {
        assert.equal(js(n.tx(id)), js(a.tx(id)), `${wo}: /tx ${id}`);
        const q = new URLSearchParams({ q: id });
        assert.equal(js(n.search(q)), js(a.search(q)), `${wo}: /search ${id}`);
        vergleiche += 2;
      }
      for (const q of [...hashes.slice(-5), '0', '3', '999', encodeAddress(K[1].addressRaw)]) {
        const p = new URLSearchParams({ q });
        assert.equal(js(n.search(p)), js(a.search(p)), `${wo}: /search ${q}`);
        vergleiche++;
      }
    }
  };

  const nimmAn = (b: ReturnType<typeof mine>, wo: string) => {
    const r = chain.accept(b.body);
    assert.ok(r.ok, `${wo}: ${js(r)}`);
    b.txids.forEach(id => txids.add(id));
    hashes.push(toHex(headerHash(deserializeBlock(b.body).header)));
    pruefe(wo);
    return b.weiter;
  };

  // Hauptkette A: Guthaben fuer die vier Absender, dann gemischter Betrieb.
  let a: Stand = { state: emptyState(), prev: new Uint8Array(32), hoehe: 0, zeit: 1_788_912_000n };
  for (let i = 0; i < 4; i++) a = nimmAn(mine(a, { miner: K[i].addressRaw }), `A${a.hoehe}`);
  for (let runde = 0; runde < 14; runde++) {
    const txs: Transfer[] = [];
    if (runde % 2 === 0) txs.push(ueberweisung(a, runde % 4, fremd(10 + runde), UNIT + BigInt(runde)));
    if (runde % 3 === 0) txs.push(ueberweisung(a, (runde + 1) % 4, K[(runde + 2) % 4].addressRaw, 2n * UNIT));
    if (runde % 5 === 0) txs.push(ueberweisung(a, (runde + 1) % 4, fremd(0x55), UNIT, runde % 3 === 0 ? 1n : 0n));
    const empfaenger = runde % 2
      ? [K[0].addressRaw, K[2].addressRaw, fremd(0x66), fremd(30 + runde)]
      : undefined;
    for (const t of empfaenger ?? []) adressen.add(encodeAddress(t));
    for (const t of txs) adressen.add(encodeAddress(t.to));
    a = nimmAn(mine(a, { miner: runde % 4 === 3 ? fremd(0x66) : K[runde % 4].addressRaw, empfaenger, txs }), `A${a.hoehe}`);
  }
  const gabel = a.hoehe - 4;

  // Ein Zweig B ab vier Bloecken unter dem Kopf -- er wird laenger und
  // uebernimmt. Seine Bloecke enthalten andere Ueberweisungen.
  let b: Stand = rekonstruiere(store, chain, gabel);
  for (let i = 0; i < 6; i++) {
    const txs = i === 1 ? [ueberweisung(b, 3, fremd(0x77), 3n * UNIT)] : [];
    adressen.add(encodeAddress(fremd(0x77)));
    b = nimmAn(mine(b, { miner: fremd(0x88), extranonce: 777n, txs,
      empfaenger: i % 2 ? [fremd(0x88), K[1].addressRaw] : undefined }), `B${b.hoehe}`);
  }
  adressen.add(encodeAddress(fremd(0x88)));
  assert.equal(chain.tip()!.height, b.hoehe - 1, 'B ist die aktive Kette');
  assert.ok(b.hoehe - 1 > gabel + 4, 'B ist laenger als A');

  // Und A waechst wieder vorbei -- Reorg zurueck.
  for (let i = 0; i < 4; i++) a = nimmAn(mine(a, { miner: K[i % 4].addressRaw, extranonce: 5n }), `A'${a.hoehe}`);
  assert.equal(chain.tip()!.height, a.hoehe - 1, 'A fuehrt wieder');

  // Etwas Wartendes im Mempool -- /account zeigt es in beiden Richtungen.
  assert.ok(pool.add(ueberweisung(a, 2, fremd(0x55), UNIT), chain.state(), chain.height() + 1).ok);
  pruefe('mit Mempool');

  assert.ok(vergleiche > 2000, `nur ${vergleiche} Vergleiche`);
  store.close();
});

test('Verzeichnis: Ein Knoten mit langer Kette baut es beim Start einmal auf', () => {
  const store = new ChainStore(':memory:');
  store.setMeta('network', REGTEST.network);
  store.setMeta('chain_id', toHex(REGTEST.chainId));
  const chain = new ChainManager(store, REGTEST);
  let st: Stand = { state: emptyState(), prev: new Uint8Array(32), hoehe: 0, zeit: 1_788_912_000n };
  for (let i = 0; i < 30; i++) {
    const m = mine(st, { miner: K[i % 4].addressRaw });
    assert.ok(chain.accept(m.body).ok);
    st = m.weiter;
  }
  const pool = new TxPool(REGTEST);
  const neu = new ReadApi({ chain, store, pool });
  neu.vorbereiten();
  const k = neu.account(encodeAddress(K[1].addressRaw)).body as Record<string, unknown>;
  assert.equal(k.blocksFound, 8);
  assert.equal(k.balance, (8n * rewardAt(1)).toString());
  store.close();
});

// ---------------------------------------------------------------- Hilfen

/** Stand nach Block `hoehe` der aktiven Kette, aus der Ablage. */
function rekonstruiere(store: ChainStore, chain: ChainManager, hoehe: number): Stand {
  const state = emptyState();
  for (let h = 0; h <= hoehe; h++) {
    const b = store.mainAt(h)!;
    const r = applyBlock(state, deserializeBlock(b.body), REGTEST);
    assert.ok(r.ok);
  }
  const kopf = store.mainAt(hoehe)!;
  void chain;
  return { state, prev: kopf.hash, hoehe: hoehe + 1, zeit: kopf.blockTime + 600n };
}
