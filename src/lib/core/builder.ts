import {
  type Tx, type Transfer, type Coinbase,
  TX_COINBASE, TX_TRANSFER, TX_VERSION, checkTransfer, txid,
} from './tx.ts';
import { type Block, type BlockHeader, serializeHeader, txMerkleRoot, BLOCK_VERSION } from './block.ts';
import { type State, cloneState, getAccount, applyBlock, stateRoot } from './state.ts';
import { rewardAt, MAX_TXS_PER_BLOCK, COINBASE_V2, MAX_COINBASE_OUTPUTS }
  from './params.ts';
import { toHex } from './codec.ts';
import { MAINNET, type ConsensusParams } from './networks.ts';

/**
 * Blockbau.
 *
 * WICHTIG: Jede Session bekommt einen EIGENEN Job. Die Coinbase geht an den
 * Finder, und weil state_root auf den Zustand NACH dem Block verpflichtet,
 * haben zwei Miner mit verschiedenen Wallets zwangslaeufig verschiedene
 * merkle_root und state_root. Bei Solo-Mining ist das genau richtig -- einen
 * gemeinsamen Job koennte es nur mit gemeinsamer Coinbase geben, also im
 * Pool-Modell.
 *
 * Daraus folgt auch, warum die Transaktionsauswahl zum Job gehoert und nicht
 * erst beim Blockfund passiert: Beide Wurzeln stehen im Header und werden
 * mitgehasht. Wer die Auswahl nachtraeglich aendert, macht den gefundenen
 * Proof of Work wertlos.
 */

export interface BuildParams {
  /** Netzparameter. Ohne Angabe gilt das Mainnet. */
  params?: ConsensusParams;
  height: number;
  prevHash: Uint8Array;
  /** Zustand NACH dem Vorgaengerblock. */
  state: State;
  mempool: Transfer[];
  minerAddress: Uint8Array;
  timestamp: bigint;
  difficulty: bigint;
  extranonce: bigint;
  coinbaseExtra?: Uint8Array;
  /**
   * Aufteilung der Belohnung auf mehrere Empfaenger -- fuer Pool-Mining.
   *
   * Ohne Angabe bekommt minerAddress alles (Coinbase Fassung 1, gilt fuer
   * immer). Mit Angabe entsteht Fassung 2, die erst ab COINBASE_V2_HEIGHT
   * gueltig ist -- davor lehnt applyBlock() sie ab.
   *
   * Die Anteile sind BRUTTO gemeint: Sie muessen zusammen genau
   * reward(height) + fees ergeben. Das Nachrechnen macht buildCoinbaseV2
   * selbst; wer sich verrechnet, bekommt hier einen Fehler und keinen
   * ungueltigen Block.
   */
  anteile?: (brutto: bigint) => { to: Uint8Array; amount: bigint }[];
}

export interface BuildResult {
  block: Block;              // nonce = 0, noch ungeloest
  header: Uint8Array;        // 136 Byte, bereit fuer die Engine
  included: Transfer[];
  rejected: { txid: string; reason: string }[];
  fees: bigint;
  stateRoot: Uint8Array;
}

/**
 * Auswahl aus dem Mempool.
 *
 * Zwei Regeln, die sich gegenseitig einschraenken:
 *   1. Je Absender muessen die Nonces luecken- und reihenfolgetreu sein --
 *      eine Transaktion mit Nonce 5 ist wertlos, solange 4 fehlt.
 *   2. Zwischen verschiedenen Absendern entscheidet die Gebuehr.
 *
 * Deshalb wird greedy ausgewaehlt: In jedem Schritt kommt die naechste
 * faellige Transaktion desjenigen Absenders dran, der gerade die hoechste
 * Gebuehr bietet. Guthaben wird dabei laufend mitgefuehrt, damit eine Kette
 * von Ausgaben nicht am Ende umkippt.
 */
export function selectTransactions(
  state: State,
  mempool: Transfer[],
  height: number,
  limit = MAX_TXS_PER_BLOCK - 1,   // ein Platz gehoert der Coinbase
): { included: Transfer[]; rejected: { txid: string; reason: string }[]; fees: bigint } {
  const rejected: { txid: string; reason: string }[] = [];
  const bySender = new Map<string, Transfer[]>();

  for (const t of mempool) {
    const structural = checkTransfer(t, height);
    if (structural) { rejected.push({ txid: toHex(txid(t)), reason: structural }); continue; }
    const key = toHex(t.from);
    const list = bySender.get(key) ?? [];
    list.push(t);
    bySender.set(key, list);
  }

  // Je Absender nach Nonce sortieren; doppelte Nonces sind Konkurrenten,
  // die hoehere Gebuehr gewinnt.
  for (const [key, list] of bySender) {
    list.sort((a, b) => (a.nonce === b.nonce
      ? (b.fee > a.fee ? 1 : b.fee < a.fee ? -1 : 0)
      : (a.nonce < b.nonce ? -1 : 1)));
    const unique: Transfer[] = [];
    for (const t of list) {
      if (unique.length && unique[unique.length - 1].nonce === t.nonce) {
        rejected.push({ txid: toHex(txid(t)), reason: 'nonce_conflict' });
        continue;
      }
      unique.push(t);
    }
    bySender.set(key, unique);
  }

  const draft = cloneState(state);
  const cursor = new Map<string, number>();
  const included: Transfer[] = [];
  let fees = 0n;

  while (included.length < limit) {
    let best: { key: string; tx: Transfer } | null = null;

    for (const [key, list] of bySender) {
      const i = cursor.get(key) ?? 0;
      const t = list[i];
      if (!t) continue;

      const acc = getAccount(draft, t.from);
      if (t.nonce !== acc.nonce) continue;                 // noch nicht faellig
      if (acc.balance < t.amount + t.fee) continue;        // reicht nicht

      if (!best || t.fee > best.tx.fee) best = { key, tx: t };
    }

    if (!best) break;

    const t = best.tx;
    const from = getAccount(draft, t.from);
    draft.set(toHex(t.from), { balance: from.balance - t.amount - t.fee, nonce: from.nonce + 1n });
    const to = getAccount(draft, t.to);
    draft.set(toHex(t.to), { ...to, balance: to.balance + t.amount });

    included.push(t);
    fees += t.fee;
    cursor.set(best.key, (cursor.get(best.key) ?? 0) + 1);
  }

  // Was uebrig blieb, ist nicht ungueltig -- es passte nur nicht in DIESEN
  // Block. Der Mempool behaelt es.
  return { included, rejected, fees };
}

export function buildCoinbase(
  height: number, to: Uint8Array, fees: bigint, extra?: Uint8Array,
): Coinbase {
  return {
    type: TX_COINBASE,
    version: TX_VERSION,
    height,
    outputs: [{ to, amount: rewardAt(height) + fees }],
    // Macht den txid eindeutig, auch wenn derselbe Miner zweimal denselben
    // Betrag auf derselben Hoehe bekaeme.
    extra: extra ?? new Uint8Array(0),
  };
}

/**
 * Coinbase mit mehreren Empfaengern -- Fassung 2.
 *
 * Fuer Pool Mining: Der Block zahlt alle Beteiligten direkt aus, der
 * Betreiber haelt nie fremdes Geld.
 *
 * Die Anteile muessen exakt aufgehen. Ein Rest von einer Einheit waere kein
 * Rundungsfehler, sondern ein ungueltiger Block -- deshalb prueft diese
 * Funktion die Summe, statt sie stillschweigend anzupassen.
 */
export function buildCoinbaseV2(
  height: number,
  anteile: { to: Uint8Array; amount: bigint }[],
  fees: bigint,
  extra?: Uint8Array,
): Coinbase {
  if (anteile.length < 1 || anteile.length > MAX_COINBASE_OUTPUTS) {
    throw new Error(`Coinbase braucht 1 bis ${MAX_COINBASE_OUTPUTS} Empfaenger`);
  }
  // Aufsteigend sortieren und auf Wiederholungen pruefen: Die Kette nimmt
  // nur diese eine Reihenfolge an.
  const sortiert = [...anteile].sort((a, b) => toHex(a.to) < toHex(b.to) ? -1 : 1);
  for (let i = 1; i < sortiert.length; i++) {
    if (toHex(sortiert[i - 1].to) === toHex(sortiert[i].to)) {
      throw new Error('derselbe Empfaenger zweimal -- Anteile vorher zusammenfassen');
    }
  }
  let summe = 0n;
  for (const a of sortiert) {
    if (a.amount <= 0n) throw new Error('Empfaenger ohne Betrag');
    summe += a.amount;
  }
  const erwartet = rewardAt(height) + fees;
  if (summe !== erwartet) {
    throw new Error(`Anteile ergeben ${summe}, erwartet ${erwartet}`);
  }
  return {
    type: TX_COINBASE,
    version: COINBASE_V2,
    height,
    outputs: sortiert,
    extra: extra ?? new Uint8Array(0),
  };
}

export function buildBlock(p: BuildParams): BuildResult {
  const { included, rejected, fees } =
    selectTransactions(p.state, p.mempool, p.height);

  /*
    Aufteilung erst hier, weil erst jetzt feststeht, wie viel zu verteilen
    ist: Belohnung PLUS die Gebuehren der ausgewaehlten Transaktionen.

    Liefert die Aufteilung nichts -- etwa weil der Pool noch keine Shares
    hat --, geht der Block wie bisher an minerAddress. Ein Pool ohne
    Teilnehmer mint dann fuer sich selbst, statt gar nicht zu minen.
  */
  const brutto = rewardAt(p.height) + fees;
  const verteilt = p.anteile ? p.anteile(brutto) : null;
  const coinbase = verteilt && verteilt.length > 0
    ? buildCoinbaseV2(p.height, verteilt, fees, p.coinbaseExtra)
    : buildCoinbase(p.height, p.minerAddress, fees, p.coinbaseExtra);
  const txs: Tx[] = [coinbase, ...included];

  // Zustand nach diesem Block bestimmen -- daraus kommt state_root.
  const after = cloneState(p.state);
  const header: BlockHeader = {
    version: BLOCK_VERSION,
    height: p.height,
    prevHash: p.prevHash,
    merkleRoot: txMerkleRoot(txs),
    stateRoot: new Uint8Array(32),   // gleich ersetzt
    timestamp: p.timestamp,
    difficulty: p.difficulty,
    txCount: txs.length,
    extranonce: p.extranonce,
    nonce: 0n,
  };
  const probe: Block = { header, txs };
  const applied = applyBlock(after, probe, p.params ?? MAINNET);
  if (!applied.ok) {
    throw new Error(`Blockbau fehlgeschlagen: ${applied.error?.reason} (tx ${applied.error?.tx})`);
  }

  header.stateRoot = stateRoot(after);
  return {
    block: { header, txs },
    header: serializeHeader(header),
    included, rejected, fees,
    stateRoot: header.stateRoot,
  };
}

/** Den gefundenen Nonce in den gebauten Block eintragen. */
export function finalizeBlock(built: BuildResult, nonce: bigint): Block {
  return {
    header: { ...built.block.header, nonce },
    txs: built.block.txs,
  };
}
