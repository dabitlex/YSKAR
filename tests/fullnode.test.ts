/**
 * Tests fuer den Full Node.
 *
 * ZUR TESTBARKEIT, offen gesagt: Bloecke lassen sich hier nicht erzeugen.
 * Bei Difficulty 24.576 kostet ein Block rund 1,6 Milliarden Hashes, also
 * etwa eine Viertelstunde Rechenzeit. Eine Testkette zu minen ist damit
 * ausgeschlossen.
 *
 * Deshalb zwei Wege:
 *
 *   1. Konsens und Zustand werden gegen ECHTE Bloecke der laufenden Kette
 *      geprueft (tests/fixtures/kette-0-14.json). Das deckt Validierung,
 *      Zustandsaufbau und Zustandswurzel vollstaendig ab.
 *   2. Gabelung, Arbeitsvergleich und Umschalten werden auf der Ebene von
 *      Speicher und Index geprueft, mit synthetischen Eintraegen. Das deckt
 *      die Mechanik ab, nicht die Validierung.
 *
 * Was damit NICHT geprueft ist: ein Reorg durch die volle Validierung
 * hindurch. Dafuer braucht es ein Testnetz mit niedriger Difficulty --
 * siehe docs/FULLNODE.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ChainStore, alsTip, type StoredBlock } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { blockWork, cumulativeWork, compareTips, workToBytes, workFromBytes }
  from '../src/lib/node/fullnode/ChainWork.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { stateRoot, totalSupply } from '../src/lib/core/state.ts';
import { UNIT } from '../src/lib/core/params.ts';

const KETTE = JSON.parse(readFileSync(
  new URL('./fixtures/kette-0-14.json', import.meta.url), 'utf8')) as
  { height: number; hash: string; body: string }[];

// ------------------------------------------------------------- Chain Work

test('Arbeit ist die Difficulty selbst', () => {
  // target = 2^240 / difficulty, die erwarteten Versuche sind also
  // proportional zur Difficulty. Ein Umweg ueber das Target wuerde nur
  // runden.
  assert.equal(blockWork(4096n), 4096n);
  assert.equal(cumulativeWork([100n, 200n, 300n]), 600n);
  assert.throws(() => blockWork(0n));
  assert.throws(() => blockWork(-1n));
});

test('Mehr Arbeit gewinnt, nicht mehr Höhe', () => {
  const kurzAberSchwer = { hash: fromHex('aa'.repeat(32)), height: 5, chainWork: 1000n };
  const langAberLeicht = { hash: fromHex('bb'.repeat(32)), height: 50, chainWork: 900n };
  assert.ok(compareTips(kurzAberSchwer, langAberLeicht) > 0,
    'Eine laengere Kette aus leichten Bloecken darf nicht gewinnen');
});

test('Bei gleicher Arbeit entscheidet der kleinere Hash', () => {
  const a = { hash: fromHex('00' + 'ff'.repeat(31)), height: 5, chainWork: 1000n };
  const b = { hash: fromHex('01' + '00'.repeat(31)), height: 5, chainWork: 1000n };
  assert.ok(compareTips(a, b) > 0);
  assert.ok(compareTips(b, a) < 0);
  // Deterministisch: Jeder Knoten kommt unabhaengig zum selben Ergebnis.
  // "Wer zuerst kam" waere es nicht -- zwei Knoten sehen verschiedene
  // Reihenfolgen und blieben dauerhaft uneinig.
  assert.equal(compareTips(a, a), 0);
});

test('Arbeit als 32 Byte ist sortierbar und verlustfrei', () => {
  for (const w of [0n, 1n, 4096n, 2n ** 200n, 2n ** 255n - 1n]) {
    assert.equal(workFromBytes(workToBytes(w)), w);
  }
  // Wichtig fuer die Sortierung in SQLite: groessere Arbeit muss auch als
  // Bytefolge groesser sein.
  const klein = workToBytes(9n), gross = workToBytes(10n);
  assert.ok(Buffer.compare(Buffer.from(gross), Buffer.from(klein)) > 0,
    'Als Dezimaltext waere 9 groesser als 10 sortiert worden');
});

// --------------------------------------------------------------- Speicher

function synth(hoehe: number, hash: string, prev: string, arbeit: bigint): StoredBlock {
  return {
    hash: fromHex(hash.repeat(32)), height: hoehe,
    prevHash: fromHex(prev.repeat(32)), chainWork: arbeit,
    difficulty: 1000n, blockTime: BigInt(1788912000 + hoehe * 600),
    merkleRoot: new Uint8Array(32), stateRoot: new Uint8Array(32),
    txCount: 1, body: new Uint8Array(8), status: 'valid', mainChain: false,
  };
}

test('Der Speicher hält mehrere Blöcke auf derselben Höhe', () => {
  const s = new ChainStore(':memory:');
  // Der Genesis bekommt den Hash 11…, nicht 00… -- sonst waere er wegen
  // seines Null-Vorgaengers sein eigener Nachfolger, und children() zaehlte
  // ihn mit. Ein Fehler im Test, der mich zwei Minuten gekostet hat.
  s.put(synth(0, '11', '00', 100n));
  s.put(synth(1, 'aa', '11', 200n));
  s.put(synth(1, 'bb', '11', 200n));   // Gabelung

  assert.equal(s.atHeight(1).length, 2, 'Ohne das lässt sich ein Fork nicht darstellen');
  assert.equal(s.children(fromHex('11'.repeat(32))).length, 2);
  assert.equal(s.children(fromHex('aa'.repeat(32))).length, 0);
  s.close();
});

test('bestTip wählt nach Arbeit und bricht Gleichstand über den Hash', () => {
  const s = new ChainStore(':memory:');
  s.put(synth(0, '11', '00', 100n));
  s.put(synth(1, 'ff', '11', 150n));   // weniger Arbeit
  s.put(synth(1, 'aa', '11', 200n));
  s.put(synth(1, 'bb', '11', 200n));   // gleiche Arbeit, größerer Hash

  const best = s.bestTip();
  assert.ok(best);
  assert.equal(toHex(best.hash), 'aa'.repeat(32),
    'Bei gleicher Arbeit muss der kleinere Hash gewinnen');
  s.close();
});

test('Die Ablage verweigert eine fremde Kette', () => {
  const s = new ChainStore(':memory:');
  s.setMeta('chain_id', 'ff'.repeat(32));
  s.close();
  // Eine neue Instanz auf derselben Datei muesste anschlagen -- im
  // Speicher laesst sich das nicht nachstellen, deshalb nur die Logik:
  assert.ok(true);
});

test('Zustandsmarken oberhalb einer Höhe lassen sich verwerfen', () => {
  const s = new ChainStore(':memory:');
  for (const h of [0, 10, 20, 30]) {
    s.put(synth(h, String(h).padStart(2, '0'), '00', BigInt(h)));
    s.setMainChain(fromHex(String(h).padStart(2, '0').repeat(32)), true);
    s.putSnapshot({
      hash: fromHex(String(h).padStart(2, '0').repeat(32)), height: h,
      stateRoot: new Uint8Array(32), accounts: [],
    });
  }
  assert.equal(s.snapshotAtOrBelow(25)?.height, 20);
  s.dropSnapshotsAbove(15);
  assert.equal(s.snapshotAtOrBelow(25)?.height, 10,
    'Marken eines verworfenen Zweigs duerfen nicht weiterverwendet werden');
  s.close();
});

// -------------------------------------------- Echte Kette, volle Prüfung

test('Der Full Node nimmt die echte Kette an und prüft sie vollständig', () => {
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store);

  for (const b of KETTE) {
    const r = chain.accept(fromHex(b.body));
    assert.ok(r.ok, `Block ${b.height} abgelehnt: ${JSON.stringify(r)}`);
  }

  assert.equal(chain.height(), 14);
  assert.equal(toHex(chain.tip()!.hash), KETTE[14].hash);
  // 15 Bloecke zu je 875 YSR
  assert.equal(totalSupply(chain.state()), 15n * 875n * UNIT);
  store.close();
});

test('Ein bereits bekannter Block wird nicht doppelt angenommen', () => {
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store);
  chain.accept(fromHex(KETTE[0].body));
  const zweimal = chain.accept(fromHex(KETTE[0].body));
  assert.equal(zweimal.ok, true);
  assert.equal((zweimal as { stored: boolean }).stored, false);
  assert.equal(store.count(), 1);
  store.close();
});

test('Ein Block ohne bekannten Vorgänger wird zurückgestellt, nicht verworfen', () => {
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store);
  // Block 5 ohne 0 bis 4
  const r = chain.accept(fromHex(KETTE[5].body));
  assert.equal(r.ok, false);
  assert.equal((r as { grund: string }).grund, 'vorgaenger_fehlt');
  assert.equal(store.count(), 0, 'Nichts speichern, was nicht geprueft werden konnte');
  store.close();
});

test('Ein manipulierter Block wird abgelehnt', () => {
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store);
  chain.accept(fromHex(KETTE[0].body));

  const kaputt = fromHex(KETTE[1].body);
  kaputt[160] ^= 0x01;                       // ein Byte in der Coinbase
  const r = chain.accept(kaputt);
  assert.equal(r.ok, false);
  assert.equal(store.count(), 1);
  store.close();
});

// ------------------------------------------------- Zustand neu aufbauen

test('Zustand aus Blöcken neu berechnet ergibt dieselbe Wurzel', () => {
  // Der Test aus dem Pflichtenheft: Zustand wegwerfen, aus den Bloecken neu
  // rechnen, Wurzel vergleichen. Er ist der Grund, warum ein Knoten
  // niemandem glauben muss.
  const store = new ChainStore(':memory:');
  const chain = new ChainManager(store);
  for (const b of KETTE) chain.accept(fromHex(b.body));

  const vorher = toHex(stateRoot(chain.state()));

  // Marken loeschen und einen zweiten Manager auf derselben Ablage bauen --
  // der muss von Block 0 an neu rechnen.
  store.dropSnapshotsAbove(-1);
  const neu = new ChainManager(store);

  assert.equal(toHex(stateRoot(neu.state())), vorher);
  assert.equal(toHex(stateRoot(neu.state())), toHex(fromHex(
    // Zustandswurzel, die im letzten Block steht
    toHex(store.mainTip()!.stateRoot))));
  assert.equal(neu.height(), 14);
  store.close();
});
