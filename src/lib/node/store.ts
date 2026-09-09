import { db } from '../db/service.ts';
import { type State, emptyState, stateRoot, totalSupply, getAccount, cloneState } from '../core/state.ts';
import {
  type Block, type BlockHeader, deserializeHeader, serializeBlock,
  serializeHeader, headerHash,
} from '../core/block.ts';
import { deserializeTx, serializeTx, txid, type Transfer, TX_COINBASE } from '../core/tx.ts';
import { type BlockTiming } from '../core/difficulty.ts';
import { toHex, fromHex } from '../core/codec.ts';
import { unprefix } from './hex.ts';

/**
 * Zugriff auf das Schema chain2.
 *
 * Grundsatz: Die Kette ist die Wahrheit, diese Tabellen sind ein Index.
 * `accounts` liesse sich jederzeit aus `blocks` und `transactions` neu
 * berechnen -- der state_root im Block ist die Verpflichtung darauf.
 */

const hx = (b: Uint8Array) => toHex(b);
const un = (s: string) => fromHex(unprefix(s));

export interface Tip {
  header: BlockHeader;
  hash: Uint8Array;
  height: number;
}

export async function loadTip(): Promise<Tip | null> {
  const { data, error } = await db().schema('chain2').from('blocks')
    .select('height, hash, header').order('height', { ascending: false })
    .limit(1).maybeSingle();
  // Ein Rechte- oder Verbindungsfehler darf NICHT als "Kette ist leer"
  // durchgehen -- sonst wuerde der Knoten einen zweiten Genesis bauen.
  if (error) throw new Error(`loadTip: ${error.message}`);
  if (!data) return null;
  const header = deserializeHeader(un(data.header));
  return { header, hash: un(data.hash), height: data.height };
}

/**
 * Kontozustand laden.
 *
 * Bewusst vollstaendig statt gezielt: Fuer den state_root braucht es ohnehin
 * alle Konten. Das ist O(n) je Job und bis in den Bereich einiger zehntausend
 * Konten unkritisch -- darueber braucht es einen Trie mit inkrementellen
 * Aktualisierungen.
 */
export async function loadState(): Promise<{ state: State; height: number }> {
  const [rAccounts, rMeta] = await Promise.all([
    db().schema('chain2').from('accounts').select('address, balance, nonce'),
    db().schema('chain2').from('state_meta').select('height, state_root').eq('id', 1).single(),
  ]);
  // Ein leerer Zustand und ein nicht lesbarer Zustand sehen gleich aus, haben
  // aber gegensaetzliche Folgen: Beim ersten darf gemint werden, beim zweiten
  // waeren alle Guthaben scheinbar null.
  if (rAccounts.error) throw new Error(`loadState: ${rAccounts.error.message}`);
  if (rMeta.error) throw new Error(`loadState/meta: ${rMeta.error.message}`);
  const rows = rAccounts.data;
  const meta = rMeta.data;

  const state = emptyState();
  for (const r of rows ?? []) {
    state.set(toHex(un(r.address)), { balance: BigInt(r.balance), nonce: BigInt(r.nonce) });
  }
  return { state, height: meta?.height ?? -1 };
}

/**
 * Prueft, ob der geladene Zustand zu dem passt, was die Kette behauptet.
 * Weicht er ab, ist der Index kaputt und muss neu aufgebaut werden -- der
 * Knoten darf dann keine Bloecke annehmen.
 */
export async function verifyStateConsistency(): Promise<
  { ok: true } | { ok: false; expected: string; actual: string }
> {
  const [{ state }, { data: meta }] = await Promise.all([
    loadState(),
    db().schema('chain2').from('state_meta').select('state_root, height').eq('id', 1).single(),
  ]);
  if (!meta?.state_root) return { ok: true };   // noch nichts festgeschrieben
  const actual = toHex(stateRoot(state));
  const expected = toHex(un(meta.state_root));
  return actual === expected ? { ok: true } : { ok: false, expected, actual };
}

export async function loadMempool(limit = 500): Promise<Transfer[]> {
  const { data } = await db().schema('chain2').from('mempool')
    .select('raw').order('fee', { ascending: false })
    .order('received_at', { ascending: true }).limit(limit);
  const out: Transfer[] = [];
  for (const r of data ?? []) {
    try {
      const t = deserializeTx(un(r.raw));
      if (t.type !== TX_COINBASE) out.push(t);
    } catch { /* kaputte Zeile ueberspringen, sie faellt beim Aufraeumen raus */ }
  }
  return out;
}

/** Difficulty und Loesungszeiten der letzten Bloecke fuer LWMA. */
export async function loadTimings(window: number): Promise<{
  timings: BlockTiming[]; timestamps: bigint[];
}> {
  const { data } = await db().schema('chain2').from('blocks')
    .select('height, difficulty, block_time')
    .order('height', { ascending: false }).limit(window + 1);

  const asc = [...(data ?? [])].reverse();
  const timings: BlockTiming[] = [];
  for (let i = 1; i < asc.length; i++) {
    timings.push({
      difficulty: BigInt(asc[i].difficulty),
      solveSeconds: BigInt(asc[i].block_time) - BigInt(asc[i - 1].block_time),
    });
  }
  return { timings, timestamps: asc.map(b => BigInt(b.block_time)) };
}

/**
 * Einen geprueften Block festschreiben. `before` ist der Zustand VOR dem
 * Block, `after` der danach -- daraus wird die Liste der geaenderten Konten
 * gebildet, damit nicht bei jedem Block alle Zeilen geschrieben werden.
 */
export async function commitBlock(
  block: Block, before: State, after: State,
): Promise<{ height: number; hash: string; txs: number }> {
  const changed: { address: string; balance: string; nonce: string }[] = [];
  const seen = new Set<string>();

  for (const [addr, acc] of after) {
    const old = before.get(addr);
    if (!old || old.balance !== acc.balance || old.nonce !== acc.nonce) {
      changed.push({ address: addr, balance: acc.balance.toString(), nonce: acc.nonce.toString() });
    }
    seen.add(addr);
  }
  // Konten, die es vorher gab und jetzt nicht mehr -> auf null, also loeschen
  for (const [addr] of before) {
    if (!seen.has(addr)) changed.push({ address: addr, balance: '0', nonce: '0' });
  }

  const h = block.header;
  const raw = serializeBlock(block);

  const txs = block.txs.map((t, idx) => {
    const base = {
      txid: hx(txid(t)), idx, type: t.type, version: t.version,
      raw: hx(serializeTx(t)),
    };
    if (t.type === TX_COINBASE) {
      return { ...base, from: null, to: hx(t.to), amount: t.amount.toString(),
               fee: '0', nonce: null, valid_until: null, memo: hx(t.extra),
               public_key: null, signature: null };
    }
    return { ...base, from: hx(t.from), to: hx(t.to),
             amount: t.amount.toString(), fee: t.fee.toString(),
             nonce: t.nonce.toString(), valid_until: t.validUntil,
             memo: hx(t.memo), public_key: hx(t.publicKey), signature: hx(t.signature) };
  });

  const { data, error } = await db().schema('chain2').rpc('commit_block', {
    p_block: {
      height: h.height, hash: hx(headerHash(h)), version: h.version,
      prev_hash: hx(h.prevHash), merkle_root: hx(h.merkleRoot),
      state_root: hx(h.stateRoot), block_time: h.timestamp.toString(),
      difficulty: h.difficulty.toString(), tx_count: h.txCount,
      extranonce: h.extranonce.toString(), nonce: h.nonce.toString(),
      header: hx(serializeHeader(h)),
      size_bytes: raw.length,
    },
    p_txs: txs,
    p_accounts: changed,
    p_supply: totalSupply(after).toString(),
  });

  if (error) throw new Error(`commit_block: ${error.message}`);
  return data as any;
}
