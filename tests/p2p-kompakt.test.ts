/**
 * Kompakte Bloecke (Volllast-Konzept M2): Header, Coinbase und je
 * Ueberweisung ein txid-Praefix statt des vollen Blocks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeKompakt, decodeKompakt, encodeFehlende, decodeFehlende, encodeNachgereicht, decodeNachgereicht,
  ordneZu, setzeZusammen, kurzAusHex, KOMPAKT_FAEHIG,
} from '../src/lib/node/p2p/kompakt.ts';
import { PeerConnection } from '../src/lib/node/p2p/PeerConnection.ts';
import { serializeBlock, deserializeBlock } from '../src/lib/core/block.ts';
import { emptyState, applyBlock, type State } from '../src/lib/core/state.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { txid, type Spend } from '../src/lib/core/tx.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { mineBlock } from './helpers/regtest.ts';
import { knoten, kette, warte, UEBERWEISUNGEN } from './helpers/mempoolNetz.ts';

const KOMPAKT = `test/0.1 ${KOMPAKT_FAEHIG}`;

/** Die Testkette und ein Block mit allen 1.280 Ueberweisungen darauf. */
function ketteUndBlock() {
  const bloecke = kette();
  const state: State = emptyState();
  for (const b of bloecke) assert.ok(applyBlock(state, b.block, REGTEST).ok);
  const letzter = bloecke[bloecke.length - 1];
  const g = mineBlock({ height: bloecke.length, prevHash: letzter.hash, state,
    timestamp: 1_788_912_000n + BigInt(bloecke.length) * REGTEST.targetBlockTime, mempool: UEBERWEISUNGEN });
  assert.equal(g.block.txs.length, UEBERWEISUNGEN.length + 1);
  return { bloecke, neu: g };
}

test('Kodierung: kompakt, getblocktxn, blocktxn hin und zurück', () => {
  const { neu } = ketteUndBlock();
  const roh = encodeKompakt(neu.block);
  const k = decodeKompakt(roh);
  assert.equal(k.kurz.length, UEBERWEISUNGEN.length);
  assert.equal(toHex(txid(k.coinbase)), toHex(txid(neu.block.txs[0])));
  assert.ok(roh.length < serializeBlock(neu.block).length / 15, `kompakt ${roh.length} B, voll ${serializeBlock(neu.block).length} B`);
  assert.deepEqual(decodeFehlende(encodeFehlende(neu.hash, [1, 7, 900])).stellen, [1, 7, 900]);
  const n = decodeNachgereicht(encodeNachgereicht(neu.hash, neu.block.txs.slice(1, 4)));
  assert.deepEqual(n.txs.map(t => toHex(txid(t))), neu.block.txs.slice(1, 4).map(t => toHex(txid(t))));
});

test('Zuordnung: fehlende und mehrdeutige werden nachgefragt; falsche Merkle-Wurzel ergibt null', () => {
  const { neu } = ketteUndBlock();
  const k = decodeKompakt(encodeKompakt(neu.block));
  const wartend = neu.block.txs.slice(1).map(tx => ({ id: toHex(txid(tx)), tx: tx as Spend }));
  // Alles da
  let z = ordneZu(k, wartend);
  assert.deepEqual(z.fehlt, []);
  assert.equal(toHex(setzeZusammen(neu.block.header, z.txs)!.body), toHex(serializeBlock(neu.block)));
  // Zwei fehlen, eine Kurz-ID ist doppelt belegt (wie bei einer Präfix-Kollision)
  const ohne = wartend.filter((_, i) => i !== 10 && i !== 20);
  ohne.push({ id: wartend[30].id.slice(0, 16) + 'f'.repeat(48), tx: wartend[31].tx });
  z = ordneZu(k, ohne);
  assert.deepEqual(z.fehlt, [11, 21, 31]);
  // Falsch zugeordnet: Merkle-Wurzel passt nicht -> null, nie ein falscher Block
  const vertauscht = [...ordneZu(k, wartend).txs];
  [vertauscht[1], vertauscht[2]] = [vertauscht[2], vertauscht[1]];
  assert.equal(setzeZusammen(neu.block.header, vertauscht), null);
  assert.equal(kurzAusHex('ab'.repeat(32)).length, 16);
});

/** Zwei verbundene Knoten auf der Testkette; B hat die gegebenen Überweisungen in seiner Warteschlange. */
async function zweiKnoten(port: number, agentB: string, beiB: Spend[]) {
  const { bloecke, neu } = ketteUndBlock();
  const a = knoten({ port, agent: KOMPAKT });
  await a.start();
  const b = knoten({ seeds: [{ host: '127.0.0.1', port }], agent: agentB });
  for (const k of [a, b]) for (const bl of bloecke) assert.ok(k.chain.accept(bl.body).ok);
  for (const tx of beiB) assert.ok(b.pool.add(tx, b.chain.state(), b.chain.height() + 1).ok);
  await b.start();
  await warte(1500);
  return { a, b, neu };
}

function zaehleSenden(von: { peers: { alle(): PeerConnection[] } }) {
  const zaehler: Record<string, { n: number; bytes: number }> = {};
  const original = PeerConnection.prototype.send;
  PeerConnection.prototype.send = function (this: PeerConnection, command, payload) {
    if (von.peers.alle().includes(this)) {
      const z = (zaehler[command] ??= { n: 0, bytes: 0 }); z.n++; z.bytes += payload.length;
    }
    return original.call(this, command, payload);
  };
  return { zaehler, aus: () => { PeerConnection.prototype.send = original; } };
}

async function warteAufHoehe(k: ReturnType<typeof knoten>, h: number) {
  const t0 = Date.now();
  while (k.chain.height() < h && Date.now() - t0 < 10000) await warte(50);
}

test('Kompakt: Peer hat alles in der Warteschlange -- Block sofort zusammengesetzt, kein voller Block', async () => {
  const { a, b, neu } = await zweiKnoten(19860, KOMPAKT, UEBERWEISUNGEN);
  const z = zaehleSenden(a);
  assert.ok(a.chain.accept(neu.body).ok);
  a.sync.kuendigeAn(neu.hash);
  await warteAufHoehe(b, neu.block.header.height);
  z.aus();
  assert.equal(b.chain.height(), neu.block.header.height);
  assert.equal(toHex(b.chain.tip()!.hash), toHex(neu.hash));
  assert.deepEqual({ ...b.sync.kompaktStand }, { empfangen: 1, sofort: 1, nachgefragt: 0, vollGeholt: 0 });
  assert.equal(z.zaehler.block, undefined, 'kein voller Block');
  assert.ok(z.zaehler.cmpctblock.bytes < serializeBlock(neu.block).length / 15);
  assert.equal(b.pool.size(), 0, 'Warteschlange danach leer');
  await a.stop(); await b.stop();
});

test('Kompakt: 100 fehlen -- werden nachgefragt, Block angenommen', async () => {
  const { a, b, neu } = await zweiKnoten(19861, KOMPAKT, UEBERWEISUNGEN.slice(0, 1180));
  const z = zaehleSenden(a);
  assert.ok(a.chain.accept(neu.body).ok);
  a.sync.kuendigeAn(neu.hash);
  await warteAufHoehe(b, neu.block.header.height);
  z.aus();
  assert.equal(toHex(b.chain.tip()!.hash), toHex(neu.hash));
  assert.deepEqual({ ...b.sync.kompaktStand }, { empfangen: 1, sofort: 0, nachgefragt: 1, vollGeholt: 0 });
  assert.equal(z.zaehler.blocktxn.n, 1);
  assert.equal(z.zaehler.block, undefined);
  await a.stop(); await b.stop();
});

test('Ohne +cmpct: wie bisher Ankündigung und voller Block', async () => {
  const { a, b, neu } = await zweiKnoten(19862, 'test/0.1', UEBERWEISUNGEN);
  const z = zaehleSenden(a);
  assert.ok(a.chain.accept(neu.body).ok);
  a.sync.kuendigeAn(neu.hash);
  await warteAufHoehe(b, neu.block.header.height);
  z.aus();
  assert.equal(toHex(b.chain.tip()!.hash), toHex(neu.hash));
  assert.equal(z.zaehler.cmpctblock, undefined);
  assert.equal(z.zaehler.block.n, 1);
  assert.equal(b.sync.kompaktStand.empfangen, 0);
  await a.stop(); await b.stop();
});

test('Kompakt: falsche Nachlieferung -> voller Block wird geholt', async () => {
  const { a, b, neu } = await zweiKnoten(19863, KOMPAKT, UEBERWEISUNGEN.slice(0, 1270));
  // A antwortet auf getblocktxn absichtlich mit einer Überweisung zu wenig.
  const echt = (a.sync as any).aufFehlende.bind(a.sync);
  (a.sync as any).aufFehlende = (p: PeerConnection, roh: Uint8Array) => {
    const { hash, stellen } = decodeFehlende(roh);
    const block = deserializeBlock(a.store.get(hash)!.body);
    p.send('blocktxn', encodeNachgereicht(hash, stellen.slice(1).map(s => block.txs[s])));
    void echt;
  };
  assert.ok(a.chain.accept(neu.body).ok);
  a.sync.kuendigeAn(neu.hash);
  await warteAufHoehe(b, neu.block.header.height);
  assert.equal(toHex(b.chain.tip()!.hash), toHex(neu.hash), 'Block kommt trotzdem an');
  assert.equal(b.sync.kompaktStand.vollGeholt, 1);
  await a.stop(); await b.stop();
});
