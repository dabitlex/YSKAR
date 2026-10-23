/**
 * Mempool bei Andrang (docs/CONSENSUS_V6.md, Abschnitt 13b).
 *
 * Was hier fest steht:
 *   - Ein voller Mempool lehnt NIE pauschal ab. Wer mehr je Byte zahlt,
 *     verdraengt die billigste wartende Transaktion; wer weniger zahlt,
 *     bekommt `pool_min_fee` mit der Gebuehr, die reichen wuerde.
 *   - Verdraengt wird immer die letzte Nonce eines Absenders -- es entsteht
 *     nie eine Luecke.
 *   - Die Untergrenze steigt nach einer Verdraengung und sinkt wieder.
 *   - Eigene (lokale) Transaktionen weichen nie und verfallen nicht.
 *   - Eine Transaktion, die eine Pruefung nicht besteht, verdraengt nichts.
 *   - Die Auswahl fuer den Block (Heap) entscheidet genau wie eine
 *     schlichte Referenz, und die Vorschau ueber mehrere Bloecke genau wie
 *     wiederholte Einzelauswahl.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TxPool, MAX_PER_SENDER, UNTERGRENZE_HALBWERT_MS, type RejectReason } from '../src/lib/node/fullnode/TxPool.ts';
import { buildTransfer, txidHex, senderRaw, spendTotal, TX_BATCH, type Spend } from '../src/lib/core/tx.ts';
import { keypairFromSeed, type Keypair } from '../src/lib/core/wallet.ts';
import { MAINNET } from '../src/lib/core/networks.ts';
import { UNIT } from '../src/lib/core/params.ts';
import { emptyState, getAccount, type State } from '../src/lib/core/state.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { selectTransactions, Auswahl, gebuehrJeByte, spendBytes } from '../src/lib/core/builder.ts';
import { vorschau, marktlage, blockFuerSatz } from '../src/lib/core/feemarket.ts';

const H = 6_000;            // nach Fassung 3, vor Fassung 6
const GROESSE = 168;        // Ueberweisung Fassung 1 ohne Notiz
const MINDEST = 1_680n;     // 10 Einheiten je Byte
const ZIEL = new Uint8Array(20).fill(0xee);

const KEYS: Keypair[] = [];
function key(i: number): Keypair {
  while (KEYS.length <= i) {
    const seed = new Uint8Array(64);
    seed[0] = KEYS.length & 0xff; seed[1] = KEYS.length >> 8; seed[2] = 0x5a;
    KEYS.push(keypairFromSeed(seed, 0, 0));
  }
  return KEYS[i];
}

function zustand(n: number, guthaben = 1_000n * UNIT): State {
  const s = emptyState();
  for (let i = 0; i < n; i++) s.set(toHex(key(i).addressRaw), { balance: guthaben, nonce: 0n });
  return s;
}

function tx(i: number, fee: bigint, nonce = 0n, an: Uint8Array = ZIEL, betrag = UNIT): Spend {
  const k = key(i);
  return buildTransfer({
    from: k.addressRaw, to: an, amount: betrag, fee, nonce,
    publicKey: k.publicKey, privateKey: k.privateKey,
  });
}

function uhr(start = 1_000_000) {
  let jetzt = start;
  return { jetzt: () => jetzt, weiter: (ms: number) => { jetzt += ms; } };
}

/** Invarianten eines Mempools: Bytes stimmen, je Absender lueckenlose Nonces ab dem Kontostand. */
function pruefeInvarianten(pool: TxPool, s: State, max: number, lokalErlaubt = false) {
  const alle = pool.alle();
  let bytes = 0;
  const je = new Map<string, bigint[]>();
  for (const t of alle) {
    bytes += spendBytes(t);
    const k = toHex(senderRaw(t));
    je.set(k, [...(je.get(k) ?? []), t.nonce]);
  }
  assert.equal(pool.belegt(), bytes, 'Bytezaehler stimmt');
  if (!lokalErlaubt) assert.ok(bytes <= max, `Grenze ${max} eingehalten (${bytes})`);
  for (const [k, nonces] of je) {
    nonces.sort((a, b) => (a < b ? -1 : 1));
    const start = s.get(k)?.nonce ?? 0n;
    nonces.forEach((n, i) => assert.equal(n, start + BigInt(i), `lueckenlos bei ${k.slice(0, 8)}`));
  }
}

// ------------------------------------------------------------ Verdraengung

test('Voller Mempool: hoehere Gebuehr je Byte verdraengt die billigste', () => {
  const s = zustand(12);
  const u = uhr();
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 10 * GROESSE, jetzt: u.jetzt });
  for (let i = 0; i < 10; i++) assert.ok(pool.add(tx(i, MINDEST + BigInt(i) * 168n), s, H).ok);
  assert.equal(pool.size(), 10);

  const teuer = tx(10, MINDEST * 3n);
  const r = pool.add(teuer, s, H);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.ok && r.verdraengt, 1);
  assert.equal(pool.size(), 10);
  assert.ok(pool.has(txidHex(teuer)));
  assert.ok(!pool.has(txidHex(tx(0, MINDEST))), 'die billigste (Konto 0) ist weg');
  // Untergrenze: verdraengter Satz (10/Byte) plus Aufschlag (1/Byte).
  assert.equal(pool.untergrenzeJeByte(), 11);
  assert.equal(pool.mindestGebuehr(H), 11n * 168n);
  pruefeInvarianten(pool, s, 10 * GROESSE);
});

test('Voller Mempool: zu wenig gibt pool_min_fee mit der noetigen Gebuehr -- und die reicht', () => {
  const s = zustand(12);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 10 * GROESSE });
  for (let i = 0; i < 10; i++) assert.ok(pool.add(tx(i, MINDEST * 2n), s, H).ok);

  const gleich = pool.add(tx(10, MINDEST * 2n), s, H);
  assert.equal(gleich.ok, false);
  assert.equal(!gleich.ok && gleich.reason, 'pool_min_fee');
  const noetig = !gleich.ok ? gleich.noetig! : 0n;
  assert.ok(noetig > MINDEST * 2n);

  const genug = pool.add(tx(10, noetig), s, H);
  assert.ok(genug.ok, JSON.stringify(genug));
  pruefeInvarianten(pool, s, 10 * GROESSE);
});

test('Es gibt keinen Ablehnungsgrund "Warteschlange voll" mehr', () => {
  // Kompiliert nur, solange 'pool_full' kein RejectReason ist.
  const gruende: RejectReason[] = ['pool_min_fee', 'fee_too_low', 'sender_limit'];
  assert.ok(!(gruende as string[]).includes('pool_full'));
  const code = readFileSync(new URL('../src/lib/node/fullnode/TxPool.ts', import.meta.url), 'utf8');
  assert.ok(!/reason: 'pool_full'/.test(code));
});

test('Verdraengt wird die LETZTE Nonce eines Absenders -- nie eine Luecke', () => {
  const s = zustand(4);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 6 * GROESSE });
  // Konto 0: drei billige hintereinander, Nonce 0 am billigsten.
  assert.ok(pool.add(tx(0, MINDEST, 0n), s, H).ok);
  assert.ok(pool.add(tx(0, MINDEST + 168n, 1n), s, H).ok);
  assert.ok(pool.add(tx(0, MINDEST + 336n, 2n), s, H).ok);
  // Drei teurere von anderen.
  for (let i = 1; i <= 3; i++) assert.ok(pool.add(tx(i, MINDEST * 5n), s, H).ok);

  // Neuer teurer: Platz fuer 168 Byte -- weichen muss Nonce 2 von Konto 0
  // (die letzte), obwohl Nonce 0 billiger ist.
  const neu = tx(1, MINDEST * 6n, 1n);
  assert.ok(pool.add(neu, s, H).ok);
  const nonces0 = pool.alle().filter(t => toHex(senderRaw(t)) === toHex(key(0).addressRaw)).map(t => t.nonce);
  assert.deepEqual(nonces0.sort(), [0n, 1n]);
  pruefeInvarianten(pool, s, 6 * GROESSE);

  // Zwei weitere: erst Nonce 1, dann Nonce 0 von Konto 0.
  assert.ok(pool.add(tx(2, MINDEST * 6n, 1n), s, H).ok);
  assert.ok(pool.add(tx(3, MINDEST * 6n, 1n), s, H).ok);
  assert.equal(pool.alle().filter(t => toHex(senderRaw(t)) === toHex(key(0).addressRaw)).length, 0);
  pruefeInvarianten(pool, s, 6 * GROESSE);
});

test('Der eigene Vorgaenger wird nicht verdraengt', () => {
  const s = zustand(3);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 3 * GROESSE });
  assert.ok(pool.add(tx(0, MINDEST, 0n), s, H).ok);          // billigste, Konto 0
  assert.ok(pool.add(tx(1, MINDEST * 2n), s, H).ok);
  assert.ok(pool.add(tx(2, MINDEST * 3n), s, H).ok);
  // Konto 0, Nonce 1, sehr teuer: Konto 0 Nonce 0 darf nicht weichen,
  // sonst waere die neue selbst eine Luecke. Und Konto 1 weicht auch nicht:
  // Die neue kaeme erst mit Nonce 0 (10 je Byte) in einen Block, ihr
  // wirksamer Satz ist 10 (mempool-schutz.test.ts).
  const r = pool.add(tx(0, MINDEST * 9n, 1n), s, H);
  assert.equal(!r.ok && r.reason, 'pool_min_fee');
  assert.equal(!r.ok ? r.noetig : 'x', undefined, 'kein Betrag: der Vorgaenger ist zu billig');
  assert.ok(pool.has(txidHex(tx(0, MINDEST, 0n))));
  assert.ok(pool.has(txidHex(tx(1, MINDEST * 2n))));
  // Ist der eigene Vorgaenger teuer genug, weicht der billigste FREMDE.
  const pool2 = new TxPool(MAINNET, undefined, { maxBytes: 3 * GROESSE });
  assert.ok(pool2.add(tx(0, MINDEST * 4n, 0n), s, H).ok);
  assert.ok(pool2.add(tx(1, MINDEST * 2n), s, H).ok);
  assert.ok(pool2.add(tx(2, MINDEST * 3n), s, H).ok);
  const r2 = pool2.add(tx(0, MINDEST * 9n, 1n), s, H);
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.ok(pool2.has(txidHex(tx(0, MINDEST * 4n, 0n))));
  assert.ok(!pool2.has(txidHex(tx(1, MINDEST * 2n))));
  pruefeInvarianten(pool2, s, 3 * GROESSE);
});

test('Eine Transaktion mit falscher Signatur verdraengt nichts', () => {
  const s = zustand(4);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 3 * GROESSE });
  for (let i = 0; i < 3; i++) assert.ok(pool.add(tx(i, MINDEST), s, H).ok);
  const vorher = pool.alle().map(t => txidHex(t)).sort();
  const falsch = tx(3, MINDEST * 10n) as Spend & { signature: Uint8Array };
  falsch.signature = new Uint8Array(falsch.signature); falsch.signature[5] ^= 1;
  const r = pool.add(falsch, s, H);
  assert.equal(!r.ok && r.reason, 'bad_signature');
  assert.deepEqual(pool.alle().map(t => txidHex(t)).sort(), vorher);
  assert.equal(pool.untergrenzeJeByte(), 10, 'Untergrenze unveraendert');
});

test('Unter der gestiegenen Untergrenze: Ablehnung vor der Signaturpruefung', () => {
  const s = zustand(4);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 2 * GROESSE });
  assert.ok(pool.add(tx(0, MINDEST), s, H).ok);
  assert.ok(pool.add(tx(1, MINDEST), s, H).ok);
  assert.ok(pool.add(tx(2, MINDEST * 4n), s, H).ok);       // verdraengt, Untergrenze 11
  const billig = tx(3, MINDEST) as Spend & { signature: Uint8Array };
  billig.signature = new Uint8Array(64);                     // waere bad_signature
  const r = pool.add(billig, s, H);
  assert.equal(!r.ok && r.reason, 'pool_min_fee', 'billig zuerst erkannt');
  assert.equal(!r.ok && r.noetig, 11n * 168n);
});

test('Ersetzung (gleiche Nonce, hoehere Gebuehr) auch im vollen Mempool', () => {
  const s = zustand(3);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 3 * GROESSE });
  for (let i = 0; i < 3; i++) assert.ok(pool.add(tx(i, MINDEST * 2n), s, H).ok);
  const zuWenig = pool.add(tx(1, MINDEST * 2n + 100n), s, H);
  assert.equal(!zuWenig.ok && zuWenig.reason, 'fee_not_higher');
  assert.equal(!zuWenig.ok && zuWenig.noetig, MINDEST * 3n);
  const r = pool.add(tx(1, MINDEST * 3n), s, H);
  assert.ok(r.ok && r.ersetzt, JSON.stringify(r));
  assert.equal(pool.size(), 3);
  pruefeInvarianten(pool, s, 3 * GROESSE);
});

// ------------------------------------------------------------ Untergrenze

test('Die Untergrenze sinkt mit der Halbwertszeit -- bei halb leerem Mempool schneller', () => {
  const s = zustand(6);
  const u = uhr();
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 2 * GROESSE, jetzt: u.jetzt });
  assert.ok(pool.add(tx(0, MINDEST * 10n), s, H).ok);       // 100/Byte
  assert.ok(pool.add(tx(1, MINDEST * 10n), s, H).ok);
  assert.ok(pool.add(tx(2, MINDEST * 20n), s, H).ok);       // verdraengt 100/Byte
  assert.equal(pool.untergrenzeJeByte(), 101);

  // Voll: Halbwertszeit 3 h.
  u.weiter(UNTERGRENZE_HALBWERT_MS);
  assert.ok(Math.abs(pool.untergrenzeJeByte() - 50.5) < 0.01);

  // Halb leer (ein Block hat geraeumt): viermal so schnell.
  // Bei gleichem Satz wich die neuere (Konto 1); Konto 0 wartet noch.
  assert.ok(pool.nachBlock([tx(0, MINDEST * 10n)], s, H + 1).entfernt === 1);
  assert.ok(pool.belegt() <= pool.maxBytes / 2);
  u.weiter(UNTERGRENZE_HALBWERT_MS / 4);
  assert.ok(Math.abs(pool.untergrenzeJeByte() - 25.25) < 0.01);
  // Irgendwann zurueck auf den Weiterleitungs-Satz.
  u.weiter(UNTERGRENZE_HALBWERT_MS * 3);
  assert.equal(pool.untergrenzeJeByte(), 10);
  assert.equal(pool.mindestGebuehr(H), MINDEST);
});

// ------------------------------------------------------------ Lokal

test('Eigene Transaktionen weichen nie, verfallen nicht und kommen notfalls ueber die Grenze', () => {
  const s = zustand(4);
  const u = uhr();
  const pool = new TxPool(MAINNET, undefined, { maxBytes: 2 * GROESSE, jetzt: u.jetzt });
  const eigen = tx(0, MINDEST);
  assert.ok(pool.add(eigen, s, H, { lokal: true }).ok);
  assert.ok(pool.add(tx(1, MINDEST), s, H).ok);
  // Fremd, teuer: verdraengt Konto 1, nicht die eigene.
  assert.ok(pool.add(tx(2, MINDEST * 5n), s, H).ok);
  assert.ok(pool.has(txidHex(eigen)));
  assert.ok(pool.istLokal(txidHex(eigen)));
  // Noch eine eigene, billig, bei vollem Mempool mit gestiegener Untergrenze:
  // wird angenommen und verdraengt die fremde.
  const eigen2 = tx(0, MINDEST, 1n);
  assert.ok(pool.add(eigen2, s, H, { lokal: true }).ok);
  assert.equal(pool.lokale().length, 2);
  // Nur noch eigene im Mempool: eine dritte darf ueber die Grenze.
  assert.ok(pool.add(tx(0, MINDEST, 2n), s, H, { lokal: true }).ok);
  assert.ok(pool.belegt() > pool.maxBytes);
  // 73 Stunden spaeter: Fremde verfallen, eigene nicht.
  u.weiter(73 * 3600_000);
  pool.aufraeumen(72 * 3600);
  assert.equal(pool.size(), pool.lokale().length);
  pruefeInvarianten(pool, s, 0, true);
});

test('Verfallen nimmt die spaeteren Nonces mit', () => {
  const s = zustand(2);
  const u = uhr();
  const pool = new TxPool(MAINNET, undefined, { jetzt: u.jetzt });
  assert.ok(pool.add(tx(0, MINDEST, 0n), s, H).ok);
  u.weiter(10 * 3600_000);
  assert.ok(pool.add(tx(0, MINDEST, 1n), s, H).ok);
  assert.ok(pool.add(tx(1, MINDEST, 0n), s, H).ok);
  u.weiter(65 * 3600_000);   // die erste ist 75 h alt, die anderen 65 h
  assert.equal(pool.aufraeumen(72 * 3600), 2, 'Nonce 0 und die davon abhaengige Nonce 1');
  assert.equal(pool.size(), 1);
  pruefeInvarianten(pool, s, Infinity);
});

// ------------------------------------------------------------ Nach dem Block

test('Nach einem Block: Luecken fallen samt allem dahinter heraus', () => {
  const s = zustand(2);
  const pool = new TxPool(MAINNET);
  for (let n = 0n; n < 4n; n++) assert.ok(pool.add(tx(0, MINDEST, n), s, H).ok);
  // Anderswo wurde Nonce 0 mit anderer Gebuehr bestaetigt; das Guthaben
  // reicht danach nur noch fuer eine weitere.
  const nachher = emptyState();
  nachher.set(toHex(key(0).addressRaw), { balance: spendTotal(tx(0, MINDEST)) + 10n, nonce: 1n });
  const r = pool.nachBlock([], nachher, H + 1);
  assert.equal(pool.size(), 1, JSON.stringify(r));
  assert.equal(pool.alle()[0].nonce, 1n);
  pruefeInvarianten(pool, nachher, Infinity);
});

test('fuerBlock: nur, was an der Hoehe gilt; Fenster ohne neue Signaturpruefung', () => {
  const s = zustand(2);
  const pool = new TxPool(MAINNET);
  const k = key(0);
  const befristet = buildTransfer({ from: k.addressRaw, to: ZIEL, amount: UNIT, fee: MINDEST, nonce: 0n,
    validUntil: H + 2, publicKey: k.publicKey, privateKey: k.privateKey });
  assert.ok(pool.add(befristet, s, H).ok);
  assert.ok(pool.add(tx(1, MINDEST), s, H).ok);
  assert.equal(pool.fuerBlock(H).length, 2);
  assert.equal(pool.fuerBlock(H + 2).length, 2);
  assert.equal(pool.fuerBlock(H + 3).length, 1, 'abgelaufen an H+3');
});

test('zuKonto: Absender und Empfaenger, ohne den ganzen Mempool zu lesen', () => {
  const s = zustand(3);
  const pool = new TxPool(MAINNET);
  const an = key(2).addressRaw;
  assert.ok(pool.add(tx(0, MINDEST, 0n, an), s, H).ok);
  assert.ok(pool.add(tx(1, MINDEST), s, H).ok);
  assert.equal(pool.zuKonto(toHex(an)).length, 1);
  assert.equal(pool.zuKonto(toHex(key(0).addressRaw)).length, 1);
  assert.equal(pool.zuKonto(toHex(ZIEL)).length, 1);
});

// ------------------------------------------------------------ Zufall

test('Zufallslauf: viele Absender, Verdraengung, Bloecke -- Invarianten halten', () => {
  let saat = 4242;
  const zufall = (n: number) => { saat = (saat * 1103515245 + 12345) % 2 ** 31; return saat % n; };
  const N = 30;
  let s = zustand(N);
  const max = 40 * GROESSE;
  const pool = new TxPool(MAINNET, undefined, { maxBytes: max });
  const naechste = new Map<number, bigint>();
  let angenommen = 0, untergrenze = 0, voll = 0;
  for (let schritt = 0; schritt < 600; schritt++) {
    const i = zufall(N);
    const k = toHex(key(i).addressRaw);
    const wartend = pool.alle().filter(t => toHex(senderRaw(t)) === k).length;
    const nonce = (s.get(k)?.nonce ?? 0n) + BigInt(wartend);
    naechste.set(i, nonce);
    const fee = MINDEST + BigInt(zufall(40)) * 168n;
    const r = pool.add(tx(i, fee, nonce), s, H);
    if (r.ok) angenommen++;
    else if (r.reason === 'pool_min_fee') untergrenze++;
    else assert.ok(['sender_limit'].includes(r.reason), r.reason);
    if (pool.belegt() > max - GROESSE) voll++;
    // Ab und zu ein Block aus dem Mempool.
    if (schritt % 50 === 49) {
      const { included } = selectTransactions(s, pool.fuerBlock(H), H, 15, MAINNET, { vorgeprueft: true });
      const neu = new Map(s);
      for (const t of included) {
        const a = toHex(senderRaw(t));
        const alt = neu.get(a)!;
        neu.set(a, { balance: alt.balance - spendTotal(t), nonce: alt.nonce + 1n });
      }
      s = neu;
      pool.nachBlock(included, s, H + 1);
    }
    pruefeInvarianten(pool, s, max);
  }
  assert.ok(angenommen > 100 && untergrenze > 0 && voll > 0, `${angenommen}/${untergrenze}/${voll}`);
});

test('Je Absender gilt weiter die Grenze von 32 wartenden', () => {
  const s = zustand(1);
  const pool = new TxPool(MAINNET);
  for (let n = 0; n < MAX_PER_SENDER; n++) assert.ok(pool.add(tx(0, MINDEST, BigInt(n)), s, H).ok);
  const r = pool.add(tx(0, MINDEST, BigInt(MAX_PER_SENDER)), s, H);
  assert.equal(!r.ok && r.reason, 'sender_limit');
});

// ------------------------------------------------------------ Auswahl

/** Referenz: die Regel ohne Heap, so schlicht wie moeglich. */
function referenzAuswahl(state: State, mempool: Spend[], limit: number): Spend[] {
  const je = new Map<string, Spend[]>();
  const reihenfolge: string[] = [];
  for (const t of mempool) {
    const k = toHex(senderRaw(t));
    if (!je.has(k)) { je.set(k, []); reihenfolge.push(k); }
    je.get(k)!.push(t);
  }
  for (const l of je.values()) l.sort((a, b) => (a.nonce < b.nonce ? -1 : 1));
  const konten = new Map<string, { balance: bigint; nonce: bigint }>();
  const konto = (k: string, raw: Uint8Array) => konten.get(k) ?? getAccount(state, raw);
  const pos = new Map<string, number>();
  const raus = new Set<string>();
  const out: Spend[] = [];
  while (out.length < limit) {
    let best: { k: string; t: Spend } | null = null;
    for (const k of reihenfolge) {
      if (raus.has(k)) continue;
      let t = je.get(k)![pos.get(k) ?? 0];
      if (!t) continue;
      const a = konto(k, senderRaw(t));
      // Verbrauchte Nonces ueberspringen, eine Luecke beendet die Reihe.
      while (t && t.nonce < a.nonce) { pos.set(k, (pos.get(k) ?? 0) + 1); t = je.get(k)![pos.get(k)!]; }
      if (!t) continue;
      if (t.nonce !== a.nonce) { raus.add(k); continue; }
      if (a.balance < spendTotal(t)) continue;
      if (!best || gebuehrJeByte(t) > gebuehrJeByte(best.t)) best = { k, t };
    }
    if (!best) break;
    const { k, t } = best;
    const a = konto(k, senderRaw(t));
    konten.set(k, { balance: a.balance - spendTotal(t), nonce: a.nonce + 1n });
    const outs = t.type === TX_BATCH ? t.outputs : [{ to: t.to, amount: t.amount }];
    for (const o of outs) {
      const ok = toHex(o.to);
      const b = konto(ok, o.to);
      konten.set(ok, { ...b, balance: b.balance + o.amount });
    }
    out.push(t);
    pos.set(k, (pos.get(k) ?? 0) + 1);
  }
  return out;
}

test('Auswahl (Heap) entscheidet wie die schlichte Referenz -- auch mit Zahlungsketten', () => {
  let saat = 99;
  const zufall = (n: number) => { saat = (saat * 1103515245 + 12345) % 2 ** 31; return saat % n; };
  for (let lauf = 0; lauf < 12; lauf++) {
    const N = 14;
    const s = emptyState();
    // Manche Konten fast leer: Sie koennen erst zahlen, wenn sie im selben
    // Block etwas bekommen haben.
    for (let i = 0; i < N; i++) {
      s.set(toHex(key(i).addressRaw), { balance: i % 3 === 0 ? 1000n : 50n * UNIT, nonce: 0n });
    }
    const mempool: Spend[] = [];
    for (let i = 0; i < N; i++) {
      const n = 1 + zufall(4);
      for (let j = 0; j < n; j++) {
        const an = zufall(3) === 0 ? key(zufall(N)).addressRaw : ZIEL;
        if (toHex(an) === toHex(key(i).addressRaw)) continue;
        // Gleiche Gebuehren absichtlich haeufig: die Reihenfolge entscheidet.
        mempool.push(tx(i, MINDEST + BigInt(zufall(5)) * 168n, BigInt(j), an, UNIT * BigInt(1 + zufall(3))));
      }
    }
    // gemischte Reihenfolge
    for (let i = mempool.length - 1; i > 0; i--) { const j = zufall(i + 1); [mempool[i], mempool[j]] = [mempool[j], mempool[i]]; }
    for (const limit of [5, 12, 1000]) {
      const heap = selectTransactions(s, mempool, H, limit).included.map(txidHex);
      const ref = referenzAuswahl(s, mempool, limit).map(txidHex);
      assert.deepEqual(heap, ref, `Lauf ${lauf}, Grenze ${limit}`);
    }
  }
});

test('Vorschau ueber mehrere Bloecke = wiederholte Einzelauswahl', () => {
  const N = 40;
  let s = zustand(N);
  const mempool: Spend[] = [];
  for (let i = 0; i < N; i++) for (let n = 0; n < 3; n++) mempool.push(tx(i, MINDEST + BigInt((i * 7 + n * 3) % 11) * 168n, BigInt(n)));
  const v = vorschau(s, mempool, H, 20, 17);
  // Nachrechnen: Block fuer Block neu auswaehlen.
  let rest = [...mempool];
  for (let b = 1; rest.length > 0; b++) {
    const { included } = selectTransactions(s, rest, H + b - 1, 17);
    for (const t of included) assert.equal(v.plaetze.get(txidHex(t)), b, `Block ${b}`);
    assert.equal(v.bloecke[b - 1].anzahl, included.length);
    const neu = new Map(s);
    for (const t of included) {
      const k = toHex(senderRaw(t)); const a = neu.get(k)!;
      neu.set(k, { balance: a.balance - spendTotal(t), nonce: a.nonce + 1n });
    }
    s = neu;
    const drin = new Set(included.map(txidHex));
    rest = rest.filter(t => !drin.has(txidHex(t)));
  }
  assert.equal(v.plaetze.size, mempool.length);
});

test('Marktlage: Stufen je Byte, und blockFuerSatz trifft die Vorschau', () => {
  const N = 30;
  const s = zustand(N);
  const mempool: Spend[] = [];
  for (let i = 0; i < N; i++) mempool.push(tx(i, MINDEST + BigInt(i) * 168n));
  const m = marktlage(s, mempool, H, 10, MINDEST, { basisBytes: GROESSE });
  assert.equal(m.andrang, true);
  assert.deepEqual(m.bloecke.map(b => b.anzahl), [10, 10, 10]);
  // Block 1 nimmt die 10 teuersten (20..29 Schritte), Block 2 die mittleren.
  assert.equal(m.bloecke[0].minJeByte, 10 + 20);
  assert.ok(m.schnell.jeByte > 30 && m.schnell.block === 1);
  assert.equal(m.normal.jeByte, 10 + 10);
  assert.equal(m.langsam.fee, MINDEST);
  assert.equal(blockFuerSatz(m.vorschau, 31, 10), 1);
  assert.equal(blockFuerSatz(m.vorschau, 25, 10), 2);
  assert.equal(blockFuerSatz(m.vorschau, 10, 10), 4, 'hinter allen: Block nach der Vorschau');
  // Auswahl-Klasse direkt: drei Bloecke, dann leer.
  const a = new Auswahl(s, mempool, H);
  assert.equal(a.naechsterBlock(10).included.length, 10);
  assert.equal(a.naechsterBlock(10, H + 1).included.length, 10);
  assert.equal(a.naechsterBlock(10, H + 2).included.length, 10);
  assert.ok(a.leer());
});

// ------------------------------------------------------------ Befunde der Gegenpruefung

test('lokale(): nach Nonce sortiert, auch nach einer Erhoehung von Nonce 0', () => {
  const s = zustand(1);
  const pool = new TxPool(MAINNET);
  for (let n = 0n; n < 3n; n++) assert.ok(pool.add(tx(0, MINDEST, n), s, H, { lokal: true }).ok);
  assert.ok(pool.add(tx(0, MINDEST * 3n, 0n), s, H, { lokal: true }).ok);   // Nonce 0 erhoeht
  assert.deepEqual(pool.lokale().map(t => t.nonce), [0n, 1n, 2n]);
  // Wiederladen in dieser Reihenfolge gelingt vollstaendig.
  const neu = new TxPool(MAINNET);
  for (const t of pool.lokale()) assert.ok(neu.add(t, s, H, { lokal: true }).ok);
  assert.equal(neu.size(), 3);
});

test('Eine fremde fruehere Nonce verfaellt nicht, wenn eine eigene dahinter haengt', () => {
  const s = zustand(1);
  const u = uhr();
  const pool = new TxPool(MAINNET, undefined, { jetzt: u.jetzt });
  assert.ok(pool.add(tx(0, MINDEST, 0n), s, H).ok);                    // kam von einem Peer
  assert.ok(pool.add(tx(0, MINDEST, 1n), s, H, { lokal: true }).ok);   // eigene
  u.weiter(80 * 3600_000);
  assert.equal(pool.aufraeumen(72 * 3600), 0);
  assert.equal(pool.size(), 2);
});

test('Nichts verdraengbar: pool_min_fee ohne eine Zahl, die nie reichen wuerde', () => {
  const s = zustand(2);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: GROESSE });
  assert.ok(pool.add(tx(0, MINDEST), s, H, { lokal: true }).ok);
  const r = pool.add(tx(1, MINDEST * 50n), s, H);
  assert.equal(!r.ok && r.reason, 'pool_min_fee');
  assert.equal(!r.ok && r.noetig, undefined);
});

test('Eine eigene Transaktion, die Teurere verdraengt, hebt die Untergrenze nicht', () => {
  const s = zustand(2);
  const pool = new TxPool(MAINNET, undefined, { maxBytes: GROESSE });
  assert.ok(pool.add(tx(1, MINDEST * 9n), s, H).ok);
  assert.ok(pool.add(tx(0, MINDEST), s, H, { lokal: true }).ok);
  assert.equal(pool.untergrenzeJeByte(), 10);
});
