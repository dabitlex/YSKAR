/**
 * Jobs aus der Vorarbeit (jobVorlage.ts) muessen Byte fuer Byte dieselben
 * Bloecke ergeben wie buildBlock().
 *
 * Ein einziges abweichendes Byte waere ein Block, den die eigene Pruefung
 * ablehnt -- die Arbeit des Miners waere verloren. Deshalb wird hier nicht
 * stichprobenartig, sondern ueber viele Zustaende, Mempools und
 * Aufteilungen verglichen: leere Kette, ein Konto, ungerade Anzahlen,
 * neue und bekannte Empfaenger, 64 Empfaenger, gleiche Gebuehren (dort
 * kann die zweite Auswahlrunde die Reihenfolge aendern).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBlock, selectTransactions } from '../src/lib/core/builder.ts';
import { serializeBlock } from '../src/lib/core/block.ts';
import { stateRoot, type State } from '../src/lib/core/state.ts';
import { REGTEST, MAINNET, type ConsensusParams } from '../src/lib/core/networks.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { buildTransfer, type Transfer } from '../src/lib/core/tx.ts';
import { keypairFromMnemonic } from '../src/lib/core/wallet.ts';
import { UNIT, rewardAt } from '../src/lib/core/params.ts';
import { baueVorlage, baueAusVorlage, wurzelMitCoinbase } from '../src/lib/node/fullnode/jobVorlage.ts';
import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { baueKette, zeig } from './helpers/regtest.ts';

const WORTE = 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon about';
const SENDER = [0, 1, 2, 3, 4].map(i => keypairFromMnemonic(WORTE, '', 0, i));

/** Reproduzierbarer Zufall -- ein Fehlschlag soll sich wiederholen lassen. */
function zufall(saat: number) {
  let x = saat >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}

function adresse(r: () => number): Uint8Array {
  const a = new Uint8Array(20);
  for (let i = 0; i < 20; i++) a[i] = Math.floor(r() * 256);
  return a;
}

function zustand(r: () => number, n: number, mitSendern: boolean): State {
  const s: State = new Map();
  for (let i = 0; i < n; i++) {
    s.set(toHex(adresse(r)), {
      balance: BigInt(Math.floor(r() * 1e9)) + 1n,
      nonce: BigInt(Math.floor(r() * 5)),
    });
  }
  if (mitSendern) {
    for (const k of SENDER) s.set(toHex(k.addressRaw), { balance: 50n * UNIT, nonce: 0n });
  }
  return s;
}

function mempool(r: () => number, s: State, anzahl: number, params: ConsensusParams): Transfer[] {
  const out: Transfer[] = [];
  const nonces = new Map<string, bigint>();
  for (let i = 0; i < anzahl; i++) {
    const k = SENDER[Math.floor(r() * SENDER.length)];
    const key = toHex(k.addressRaw);
    const n = nonces.get(key) ?? (s.get(key)?.nonce ?? 0n);
    // Ab und zu eine Luecke oder ein zu grosser Betrag -- die Auswahl muss
    // damit genauso umgehen wie bisher.
    const luecke = r() < 0.1 ? 1n : 0n;
    const betrag = r() < 0.05 ? 1000n * UNIT : BigInt(Math.floor(r() * 1e8)) + 1n;
    // Wenige verschiedene Gebuehren: Gleichstand ist der heikle Fall.
    const gebuehr = [2000n, 2000n, 3000n, 5000n][Math.floor(r() * 4)];
    const an = r() < 0.5 ? adresse(r) : SENDER[Math.floor(r() * SENDER.length)].addressRaw;
    out.push(buildTransfer({
      chainId: params.chainId, from: k.addressRaw, to: an, amount: betrag, fee: gebuehr,
      nonce: n + luecke, publicKey: k.publicKey, privateKey: k.privateKey,
    }));
    nonces.set(key, n + luecke + 1n);
  }
  return out;
}

type Aufteilung = (brutto: bigint) => { to: Uint8Array; amount: bigint }[];

/** Aufteilung auf n Empfaenger, die Haelfte davon (etwa) schon mit Konto. */
function aufteilung(r: () => number, s: State, n: number, anteilBekannt: number): Aufteilung {
  const bekannt = [...s.keys()];
  const ziele: Uint8Array[] = [];
  const gesehen = new Set<string>();
  while (ziele.length < n) {
    const nochBekannte = bekannt.filter(k => !gesehen.has(k));
    const a = nochBekannte.length && r() < anteilBekannt
      ? Uint8Array.from(Buffer.from(nochBekannte[Math.floor(r() * nochBekannte.length)], 'hex'))
      : adresse(r);
    if (gesehen.has(toHex(a))) continue;
    gesehen.add(toHex(a)); ziele.push(a);
  }
  return (brutto) => {
    const je = brutto / BigInt(n);
    return ziele.map((to, i) => ({ to, amount: i === 0 ? brutto - je * BigInt(n - 1) : je }));
  };
}

function vergleiche(s: State, pool: Transfer[], hoehe: number, params: ConsensusParams,
                    miner: Uint8Array, anteile?: Aufteilung) {
  const prevHash = new Uint8Array(32).fill(7);
  // Genau wie MiningCoordinator bisher: erste Auswahl, dann buildBlock.
  const { included } = selectTransactions(s, pool, hoehe, undefined, params);
  const voll = buildBlock({
    height: hoehe, prevHash, state: s, mempool: included, minerAddress: miner,
    timestamp: 1_800_000_000n, difficulty: 4096n, extranonce: 42n,
    coinbaseExtra: new Uint8Array([1, 2, 3]), anteile, params,
  });
  const v = baueVorlage('x', s, pool, hoehe, params);
  const ausVorlage = baueAusVorlage(v, {
    prevHash, minerAddress: miner, timestamp: 1_800_000_000n, difficulty: 4096n,
    extranonce: 42n, coinbaseExtra: new Uint8Array([1, 2, 3]), anteile, params,
  });
  assert.equal(toHex(serializeBlock(ausVorlage.block)), toHex(serializeBlock(voll.block)),
    'Block weicht ab');
  assert.equal(ausVorlage.fees, voll.fees);
  assert.equal(toHex(ausVorlage.stateRoot), toHex(voll.stateRoot));
  assert.deepEqual(ausVorlage.included.map(t => toHex(t.signature)), voll.included.map(t => toHex(t.signature)));
  assert.deepEqual(ausVorlage.rejected, voll.rejected);
  return { v, art: ausVorlage.art, enthalten: voll.included.length };
}

test('Vorlage: leerer Zustand, leerer Mempool -- erster Block der Kette', () => {
  const r = zufall(1);
  const { art } = vergleiche(new Map(), [], 0, REGTEST, adresse(r));
  assert.equal(art, 'v1:ab-stelle');
});

test('Vorlage: Solo-Coinbase an ein bekanntes und an ein neues Konto, viele Groessen', () => {
  const wege = new Set<string>();
  for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 31, 33, 100, 257, 1000]) {
    const r = zufall(n * 7919);
    const s = zustand(r, n, false);
    const bekannt = Uint8Array.from(Buffer.from([...s.keys()][Math.floor(r() * n)], 'hex'));
    wege.add(vergleiche(s, [], 10, REGTEST, bekannt).art);
    wege.add(vergleiche(s, [], 10, REGTEST, adresse(r)).art);
  }
  assert.deepEqual([...wege].sort(), ['v1:ab-stelle', 'v1:pfade']);
});

test('Vorlage: Pool-Coinbase mit 1 bis 64 Empfaengern, bekannt, neu und gemischt', () => {
  const wege = new Set<string>();
  let faelle = 0;
  for (const n of [0, 1, 2, 3, 10, 63, 64, 65, 200, 999]) {
    for (const empf of [1, 2, 7, 63, 64]) {
      for (const anteilBekannt of [0, 0.5, 1]) {
        const r = zufall(n * 1000 + empf * 10 + anteilBekannt * 3 + 1);
        const s = zustand(r, n, false);
        wege.add(vergleiche(s, [], 50, REGTEST, adresse(r), aufteilung(r, s, empf, anteilBekannt)).art);
        faelle++;
      }
    }
  }
  assert.ok(faelle >= 150);
  assert.ok(wege.has('v2:pfade') && wege.has('v2:ab-stelle'), [...wege].join(','));
});

test('Vorlage: mit Mempool -- Auswahl, Gebuehren, gleiche Gebuehren, Luecken, fehlende Deckung', () => {
  let enthalten = 0, abgelehnt = 0;
  for (let fall = 0; fall < 30; fall++) {
    const r = zufall(4242 + fall);
    const s = zustand(r, Math.floor(r() * 300), true);
    const pool = mempool(r, s, Math.floor(r() * 60), REGTEST);
    const pool2 = [...pool].sort(() => r() - 0.5);   // andere Reihenfolge im Mempool
    for (const p of [pool, pool2]) {
      const a = vergleiche(s, p, 120, REGTEST, adresse(r));
      vergleiche(s, p, 120, REGTEST, adresse(r), aufteilung(r, s, 1 + Math.floor(r() * 64), r()));
      enthalten += a.enthalten;
      abgelehnt += p.length - a.enthalten;
    }
  }
  // Die Faelle pruefen wirklich etwas: Es wurde ausgewaehlt UND liegengelassen.
  assert.ok(enthalten > 200, `nur ${enthalten} Ueberweisungen ausgewaehlt`);
  assert.ok(abgelehnt > 20, `nur ${abgelehnt} liegengelassen`);
});

test('Vorlage: dieselbe Vorlage fuer viele Jobs -- jeder Job wie ein eigener voller Bau', () => {
  const r = zufall(99);
  const s = zustand(r, 500, true);
  const pool = mempool(r, s, 30, REGTEST);
  const v = baueVorlage('x', s, pool, 77, REGTEST);
  const prevHash = new Uint8Array(32).fill(3);
  const { included } = selectTransactions(s, pool, 77, undefined, REGTEST);
  for (let i = 0; i < 60; i++) {
    const anteile = i % 3 === 0 ? undefined : aufteilung(r, s, 1 + (i % 64), i % 2 ? 1 : 0.3);
    const miner = adresse(r);
    const a = baueAusVorlage(v, { prevHash, minerAddress: miner, timestamp: BigInt(1_800_000_000 + i),
      difficulty: 9999n, extranonce: BigInt(i), anteile, params: REGTEST });
    const b = buildBlock({ height: 77, prevHash, state: s, mempool: included, minerAddress: miner,
      timestamp: BigInt(1_800_000_000 + i), difficulty: 9999n, extranonce: BigInt(i), anteile, params: REGTEST });
    assert.equal(toHex(serializeBlock(a.block)), toHex(serializeBlock(b.block)), `Job ${i}`);
  }
  // Die Vorlage selbst wurde dabei nicht veraendert.
  const nochmal = baueVorlage('x', s, pool, 77, REGTEST);
  assert.deepEqual(nochmal.sortiert, v.sortiert);
  assert.equal(toHex(nochmal.ebenen.at(-1)![0] ?? new Uint8Array(32)), toHex(v.ebenen.at(-1)![0] ?? new Uint8Array(32)));
});

test('Vorlage: Die Wurzel entspricht stateRoot() auch fuer Faelle, die buildBlock nicht baut', () => {
  // Coinbase ueber null an ein neues Konto: Das Konto entsteht nicht.
  const r = zufall(5);
  const s = zustand(r, 9, false);
  const v = baueVorlage('x', s, [], 1, REGTEST);
  const { wurzel } = wurzelMitCoinbase(v, [{ to: adresse(r), amount: 0n }]);
  assert.equal(toHex(wurzel), toHex(stateRoot(s)));
});

test('Vorlage: Fehlerfaelle wie buildBlock -- Fassung 2 zu frueh', () => {
  const r = zufall(17);
  const s = zustand(r, 5, false);
  const anteile = aufteilung(r, s, 3, 0.5);
  const hoehe = MAINNET.coinbaseV2Height - 1;
  assert.throws(() => buildBlock({ height: hoehe, prevHash: new Uint8Array(32), state: s, mempool: [],
    minerAddress: adresse(r), timestamp: 1n, difficulty: 1n, extranonce: 0n, anteile, params: MAINNET }),
    /coinbase_v2_zu_frueh/);
  const v = baueVorlage('x', s, [], hoehe, MAINNET);
  assert.throws(() => baueAusVorlage(v, { prevHash: new Uint8Array(32), minerAddress: adresse(r),
    timestamp: 1n, difficulty: 1n, extranonce: 0n, anteile, params: MAINNET }), /coinbase_v2_zu_frueh/);
  // Die Belohnung stimmt mit dem ueberein, was buildBlock verteilt.
  assert.ok(rewardAt(hoehe) > 0n);
});

// ------------------------------------------------- im MiningCoordinator

function knotenMitKette() {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const kette = baueKette(6, { miner: SENDER[0].addressRaw });
  for (const b of kette.bloecke) { const r = chain.accept(b.body); assert.ok(r.ok, zeig(r)); }
  const pool = new TxPool(REGTEST);
  const uhr = () => kette.zeit;    // fest: dieselbe Sekunde fuer beide
  const mitVorlage = new MiningCoordinator(chain, store, pool, REGTEST, uhr);
  const ohne = new MiningCoordinator(chain, store, pool, REGTEST, uhr);
  ohne.vorlageAn = false;
  return { store, chain, pool, mitVorlage, ohne };
}

test('Coordinator: Jobs mit und ohne Vorarbeit sind gleich -- auch wenn sich der Mempool aendert', () => {
  const k = knotenMitKette();
  const r = zufall(31);
  const empf = [adresse(r), adresse(r), SENDER[0].addressRaw];
  const anteile: Aufteilung = (brutto) => {
    const je = brutto / 3n;
    return empf.map((to, i) => ({ to, amount: i === 0 ? brutto - 2n * je : je }));
  };
  const vergleicheJob = (wo: string) => {
    for (const [miner, a] of [[adresse(r), undefined], [SENDER[0].addressRaw, undefined], [adresse(r), anteile]] as const) {
      const x = k.mitVorlage.createJob(miner, 5n, new Uint8Array([9]), a);
      const y = k.ohne.createJob(miner, 5n, new Uint8Array([9]), a);
      assert.equal(x.header, y.header, `${wo}: Header`);
      assert.equal(x.jobId, y.jobId);
    }
  };
  vergleicheJob('leerer Mempool');
  let nonce = 0n;
  for (let i = 0; i < 5; i++) {
    const t = buildTransfer({ chainId: REGTEST.chainId, from: SENDER[0].addressRaw, to: adresse(r),
      amount: UNIT, fee: 3000n, nonce: nonce++, publicKey: SENDER[0].publicKey, privateKey: SENDER[0].privateKey });
    assert.ok(k.pool.add(t, k.chain.state(), k.chain.height() + 1).ok);
    vergleicheJob(`nach Ueberweisung ${i + 1}`);
  }
  assert.equal(k.mitVorlage.vorlageAn, true, 'keine Abweichung, die Vorarbeit bleibt an');
  k.store.close();
});

test('Coordinator: Weicht ein Job aus der Vorarbeit ab, schaltet sie sich ab und meldet es', () => {
  const k = knotenMitKette();
  const gemeldet: string[] = [];
  k.mitVorlage.onFehler = (wo, e) => gemeldet.push(`${wo}: ${e.message}`);
  const miner = new Uint8Array(20).fill(0x42);
  k.mitVorlage.createJob(miner, 1n);
  // Die Vorarbeit kaputt machen -- so, wie ein Fehler darin aussaehe.
  const v = (k.mitVorlage as any).vorlage;
  v.ebenen[0][0] = new Uint8Array(32);
  v.ebenen = [v.ebenen[0], ...v.ebenen.slice(1).map((e: Uint8Array[]) => e.map(() => new Uint8Array(32)))];
  (k.mitVorlage as any).vorlageGeprueft.clear();

  const job = k.mitVorlage.createJob(miner, 2n);
  const richtig = k.ohne.createJob(miner, 2n);
  assert.equal(job.header, richtig.header, 'ausgegeben wird der richtige Job');
  assert.equal(k.mitVorlage.vorlageAn, false);
  assert.match(gemeldet.join(), /Job-Vorlage/);
  k.store.close();
});
