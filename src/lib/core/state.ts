import { Writer, toHex } from './codec.ts';
import { merkleRoot } from './hash.ts';
import { txid, checkTransfer, coinbaseTotal, TX_COINBASE, TX_TRANSFER, type Tx }
  from './tx.ts';
import { type Block } from './block.ts';
import { rewardAt, ADDRESS_BYTES, MAX_SUPPLY, COINBASE_V2, MAX_COINBASE_OUTPUTS }
  from './params.ts';
import { MAINNET, type ConsensusParams } from './networks.ts';

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
export type State = Map<string, Account>;   // Schluessel: Hex der 20-Byte-Adresse

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
      const addr = new Uint8Array(ADDRESS_BYTES);
      for (let i = 0; i < ADDRESS_BYTES; i++) {
        addr[i] = parseInt(addrHex.substr(i * 2, 2), 16);
      }
      return new Writer().bytes(addr, ADDRESS_BYTES)
        .u64(acc.balance).u64(acc.nonce).finish();
    });
  return merkleRoot(leaves);
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
  const draft = cloneState(state);
  let fees = 0n;

  // Erst alle Ueberweisungen, dann die Coinbase -- ihr Betrag haengt von der
  // Summe der Gebuehren ab.
  for (let i = 1; i < block.txs.length; i++) {
    const t = block.txs[i];
    if (t.type !== TX_TRANSFER) return fail(i, 'not_transfer');

    const structural = checkTransfer(t, block.header.height);
    if (structural) return fail(i, structural);

    const from = getAccount(draft, t.from);
    if (from.nonce !== t.nonce) return fail(i, `nonce_mismatch:${from.nonce}!=${t.nonce}`);

    const total = t.amount + t.fee;
    if (from.balance < total) return fail(i, 'insufficient_funds');

    setAccount(draft, t.from, { balance: from.balance - total, nonce: from.nonce + 1n });
    const to = getAccount(draft, t.to);
    setAccount(draft, t.to, { ...to, balance: to.balance + t.amount });
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
    if (cb.outputs.length < 1 || cb.outputs.length > MAX_COINBASE_OUTPUTS) {
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
