import { Writer, toHex, fromHex } from './codec.ts';
import { merkleRoot } from './hash.ts';
import { checkSpend, coinbaseTotal, isSpend, senderRaw, spendTotal, spendSigops, signaturTripel, TX_COINBASE, TX_BATCH }
  from './tx.ts';
import { type Block } from './block.ts';
import { mitVorpruefung } from './sigcheck.ts';
import {
  rewardAt, ADDRESS_BYTES, MAX_SUPPLY, COINBASE_V2, MAX_COINBASE_EXTRA, DUST_LIMIT,
  maxCoinbaseOutputsAt, MAX_BLOCK_SIGOPS, V6_HEIGHT,
} from './params.ts';
import { MAINNET, type ConsensusParams } from './networks.ts';
import { smtRoot, smtKey } from './smt.ts';

/**
 * Kontozustand.
 *
 * DAS IST DER KERN DES UMBAUS. Bisher war Postgres das Hauptbuch und der
 * Block enthielt nur einen Hash darauf. Jetzt gilt umgekehrt: Die Kette ist
 * die Wahrheit, die Datenbank ist ein wiederherstellbarer Index.
 *
 * Der Pruefstein dafuer ist hart und in tests/core.test.ts umgesetzt:
 * Zustand wegwerfen, aus den Bloecken neu aufbauen, identischer state_root.
 * Solange das nicht geht, ist es keine Kette, sondern eine Datenbank mit
 * Hashes daneben.
 */

export interface Account { balance: bigint; nonce: bigint }
/**
 * Schluessel: Hex der ROHADRESSE -- 20 Byte (Version 0) oder 33 Byte
 * (Version 1, ab Konsensfassung 6). Beide Laengen koennen nicht kollidieren.
 */
export type State = Map<string, Account>;

export function emptyState(): State { return new Map(); }

export function getAccount(s: State, addr: Uint8Array): Account {
  return s.get(toHex(addr)) ?? { balance: 0n, nonce: 0n };
}

function setAccount(s: State, addr: Uint8Array, a: Account): void {
  // Leere Konten nicht speichern -- sonst haengt der state_root davon ab,
  // wer irgendwann einmal eine Zeile hatte.
  if (a.balance === 0n && a.nonce === 0n) s.delete(toHex(addr));
  else s.set(toHex(addr), a);
}

export function cloneState(s: State): State {
  return new Map([...s].map(([k, v]) => [k, { ...v }]));
}

/**
 * state_root: Merkle-Baum ueber die nach Adresse sortierten Konten.
 *
 * Sortierung nach den Rohbytes, damit jede Umgebung dieselbe Reihenfolge
 * erzeugt -- eine lokalisierte Textsortierung waere ein Konsensfehler.
 *
 * Der Baum wird je Block neu berechnet, das ist O(n). Bis in den Bereich
 * einiger zehntausend Konten unkritisch; darueber braucht es einen Trie mit
 * inkrementellen Aktualisierungen.
 */
export function stateRoot(s: State): Uint8Array {
  const leaves = [...s.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([addrHex, acc]) => {
      const addr = fromHex(addrHex);
      return new Writer().bytes(addr, ADDRESS_BYTES)
        .u64(acc.balance).u64(acc.nonce).finish();
    });
  return merkleRoot(leaves);
}

/**
 * Kontoeintrag der Fassung 1 (CONSENSUS_V6.md 5.1): 81 Byte.
 *
 *   u8 recordVersion = 1 | u64 balance | u64 nonce | codeHash(32) | storageRoot(32)
 *
 * codeHash und storageRoot sind in Fassung 6 immer null; sie reservieren
 * den Platz fuer eine spaetere Vertrags-Fassung, ohne Schluessel oder Baum
 * noch einmal zu aendern.
 */
export const ACCOUNT_RECORD_V1 = 1;
export function serializeAccount(a: Account): Uint8Array {
  return new Writer().u8(ACCOUNT_RECORD_V1).u64(a.balance).u64(a.nonce)
    .bytes(new Uint8Array(32)).bytes(new Uint8Array(32)).finish();
}

/** Zustandswurzel ab Konsensfassung 6: Sparse-Merkle-Baum (smt.ts). */
export function stateRootV6(s: State): Uint8Array {
  return smtRoot([...s.entries()].map(([addrHex, acc]) => ({
    key: smtKey(fromHex(addrHex)),
    value: serializeAccount(acc),
  })));
}

/**
 * Die Wurzel, die ein Block an dieser Hoehe tragen muss: flacher Baum
 * darunter, Sparse-Merkle-Baum ab v6Height (CONSENSUS_V6.md 10). Ein Knoten
 * enthaelt beide Verfahren und waehlt nach der Hoehe.
 */
export function stateRootAt(s: State, height: number, params: ConsensusParams = MAINNET): Uint8Array {
  return height >= params.v6Height ? stateRootV6(s) : stateRoot(s);
}

export type ApplyError =
  | { tx: number; reason: string };

export interface ApplyResult {
  ok: boolean;
  error?: ApplyError;
  fees: bigint;
}

/**
 * Einen Block auf den Zustand anwenden. Veraendert `state` NUR bei Erfolg --
 * bei einem Fehler bleibt der uebergebene Zustand unangetastet, damit ein
 * abgelehnter Block nichts halb angewendet zurueaesst.
 */
export function applyBlock(
  state: State,
  block: Block,
  params: ConsensusParams = MAINNET,
): ApplyResult {
  /*
    Alle Signaturen des Blocks vorab im Stapel pruefen (CONSENSUS_V6.md 7.8).
    Das aendert kein Ergebnis -- faellt der Stapel durch, wird wie bisher
    einzeln geprueft --, nur die Zeit: Mit dem WASM-Pruefer eines Knotens
    kostet ein voller Block einen Bruchteil. Ohne Stapel-Pruefer (Mini App,
    noble) passiert hier nichts.

    Das Signaturbudget gilt trotzdem VOR jeder Rechnung: Ein Block ueber dem
    Budget wird abgelehnt, ohne dass der Stapel geprueft wird.
  */
  const abV6Vorab = block.header.height >= (params.v6Height ?? V6_HEIGHT);
  const ueberBudget = abV6Vorab && blockSigops(block) > MAX_BLOCK_SIGOPS;
  const tripel = ueberBudget ? [] : block.txs.slice(1).filter(isSpend)
    .flatMap(t => signaturTripel(t, params.chainId));
  return mitVorpruefung(tripel, () => applyBlockEinzeln(state, block, params));
}

/** Signaturen eines Blocks nach Abschnitt 7.7; Coinbase zaehlt nicht. */
function blockSigops(block: Block): number {
  let n = 0;
  for (let i = 1; i < block.txs.length; i++) {
    const t = block.txs[i];
    if (isSpend(t)) n += spendSigops(t);
  }
  return n;
}

function applyBlockEinzeln(
  state: State,
  block: Block,
  params: ConsensusParams,
): ApplyResult {
  const draft = cloneState(state);
  let fees = 0n;
  const height = block.header.height;
  const abV6 = height >= (params.v6Height ?? V6_HEIGHT);

  /*
    Signaturbudget (CONSENSUS_V6.md 7.7), VOR jeder Signaturpruefung: Wer
    einen Block ueber dem Budget schickt, hat uns nur das Zaehlen gekostet.
  */
  if (abV6) {
    let sigops = 0;
    for (let i = 1; i < block.txs.length; i++) {
      const t = block.txs[i];
      if (!isSpend(t)) return fail(i, 'not_transfer');
      sigops += spendSigops(t);
      if (sigops > MAX_BLOCK_SIGOPS) return fail(i, `too_many_sigops:${sigops}`);
    }
  }

  // Erst alle Ausgaben, dann die Coinbase -- ihr Betrag haengt von der
  // Summe der Gebuehren ab.
  for (let i = 1; i < block.txs.length; i++) {
    const t = block.txs[i];
    if (!isSpend(t)) return fail(i, 'not_transfer');

    const structural = checkSpend(t, height, params);
    if (structural) return fail(i, structural);

    const absender = senderRaw(t);
    const from = getAccount(draft, absender);
    if (from.nonce !== t.nonce) return fail(i, `nonce_mismatch:${from.nonce}!=${t.nonce}`);

    const total = spendTotal(t);
    if (from.balance < total) return fail(i, 'insufficient_funds');

    setAccount(draft, absender, { balance: from.balance - total, nonce: from.nonce + 1n });
    const outputs = t.type === TX_BATCH ? t.outputs : [{ to: t.to, amount: t.amount }];
    for (const o of outputs) {
      const to = getAccount(draft, o.to);
      setAccount(draft, o.to, { ...to, balance: to.balance + o.amount });
    }
    fees += t.fee;
  }

  const cb = block.txs[0];
  if (!cb || cb.type !== TX_COINBASE) return fail(0, 'no_coinbase');

  /*
    Coinbase-Regeln. Sie sind Konsens, also steht hier jede einzeln.

    Fassung 2 mit mehreren Empfaengern ist erst ab der Aktivierungshoehe
    zulaessig -- darunter bleibt die Geschichte unveraendert.
  */
  if (cb.version === COINBASE_V2) {
    if (block.header.height < params.coinbaseV2Height) {
      return fail(0, `coinbase_v2_zu_frueh:${block.header.height}` +
        `<${params.coinbaseV2Height}`);
    }
    // 64 Empfaenger bis Fassung 6, 255 ab v6Height (CONSENSUS_V6.md 8).
    if (cb.outputs.length < 1 || cb.outputs.length > maxCoinbaseOutputsAt(height, params.v6Height)) {
      return fail(0, `coinbase_outputs:${cb.outputs.length}`);
    }
    // Aufsteigend sortiert, keine Wiederholung. Sonst gaebe es fuer
    // dieselbe Auszahlung mehrere gueltige Kodierungen -- und damit
    // verschiedene Merkle-Wurzeln fuer dieselbe Aussage. Duplikate liessen
    // sich ausserdem zum Aufblaehen des Blocks nutzen.
    for (let i = 1; i < cb.outputs.length; i++) {
      if (toHex(cb.outputs[i - 1].to) >= toHex(cb.outputs[i].to)) {
        return fail(0, 'coinbase_outputs_unsortiert');
      }
    }
    // Kein Empfaenger mit null: sonst laesst sich der Block mit leeren
    // Eintraegen fuellen, die nichts bewirken.
    for (const o of cb.outputs) {
      if (o.amount <= 0n) return fail(0, 'coinbase_output_null');
    }
  } else if (cb.outputs.length !== 1) {
    return fail(0, 'coinbase_v1_mehrere_empfaenger');
  }

  /*
    Konsensfassung 5 (params.ts, V5_HEIGHT): nur Fassung 1 oder 2, `extra`
    hoechstens MAX_COINBASE_EXTRA Byte, und jede Ausgabe einer Coinbase der
    Fassung 2 mindestens DUST_LIMIT. Darunter bleibt alles wie bisher.
  */
  if (block.header.height >= params.v5Height) {
    if (cb.version !== 1 && cb.version !== COINBASE_V2) return fail(0, `coinbase_fassung:${cb.version}`);
    if (cb.extra.length > MAX_COINBASE_EXTRA) return fail(0, `coinbase_extra:${cb.extra.length}`);
    if (cb.version === COINBASE_V2) {
      for (const o of cb.outputs) {
        if (o.amount < DUST_LIMIT) return fail(0, 'coinbase_output_staub');
      }
    }
  }

  const expected = rewardAt(block.header.height) + fees;
  const gesamt = coinbaseTotal(cb);
  if (gesamt !== expected) {
    return fail(0, `coinbase_amount:${gesamt}!=${expected}`);
  }
  for (const o of cb.outputs) {
    const konto = getAccount(draft, o.to);
    setAccount(draft, o.to, { ...konto, balance: konto.balance + o.amount });
  }

  if (totalSupply(draft) > MAX_SUPPLY) return fail(0, 'supply_exceeded');

  state.clear();
  for (const [k, v] of draft) state.set(k, v);
  return { ok: true, fees };

  function fail(tx: number, reason: string): ApplyResult {
    return { ok: false, error: { tx, reason }, fees: 0n };
  }
}

export function totalSupply(s: State): bigint {
  let sum = 0n;
  for (const a of s.values()) sum += a.balance;
  return sum;
}

/** Zustand vollstaendig aus einer Blockfolge neu berechnen. */
export function replay(blocks: Block[]): { state: State; error?: string } {
  const state = emptyState();
  for (const b of blocks) {
    const r = applyBlock(state, b);
    if (!r.ok) {
      return { state, error: `Block ${b.header.height}: ${r.error?.reason}` };
    }
  }
  return { state };
}
