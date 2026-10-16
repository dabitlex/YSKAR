import {
  type Tx, type Spend, type Coinbase,
  TX_COINBASE, TX_BATCH, TX_VERSION, checkSpend, txid, senderRaw, spendTotal, spendSigops,
} from './tx.ts';
import { type Block, type BlockHeader, serializeHeader, txMerkleRoot } from './block.ts';
import { type State, cloneState, getAccount, applyBlock, stateRootAt } from './state.ts';
import {
  rewardAt, COINBASE_V2, DUST_LIMIT, maxTxsAt, maxCoinbaseOutputsAt, blockVersionAt,
  MAX_BLOCK_SIGOPS,
} from './params.ts';
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
  mempool: Spend[];
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
  included: Spend[];
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
  mempool: Spend[],
  height: number,
  limit?: number,
  params: ConsensusParams = MAINNET,
): { included: Spend[]; rejected: { txid: string; reason: string }[]; fees: bigint } {
  // Ein Platz gehoert der Coinbase; die Grenze haengt an der Hoehe (Fassung 6).
  const max = limit ?? maxTxsAt(height, params.v6Height) - 1;
  const rejected: { txid: string; reason: string }[] = [];
  const bySender = new Map<string, Spend[]>();

  for (const t of mempool) {
    const structural = checkSpend(t, height, params);
    if (structural) { rejected.push({ txid: toHex(txid(t)), reason: structural }); continue; }
    const key = toHex(senderRaw(t));
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
    const unique: Spend[] = [];
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
  const included: Spend[] = [];
  let fees = 0n;
  let sigops = 0;
  const abV6 = height >= params.v6Height;

  while (included.length < max) {
    let best: { key: string; tx: Spend } | null = null;

    for (const [key, list] of bySender) {
      const i = cursor.get(key) ?? 0;
      const t = list[i];
      if (!t) continue;

      const acc = getAccount(draft, senderRaw(t));
      if (t.nonce !== acc.nonce) continue;                 // noch nicht faellig
      if (acc.balance < spendTotal(t)) continue;           // reicht nicht
      // Signaturbudget des Blocks (CONSENSUS_V6.md 7.7).
      if (abV6 && sigops + spendSigops(t) > MAX_BLOCK_SIGOPS) continue;

      if (!best || t.fee > best.tx.fee) best = { key, tx: t };
    }

    if (!best) break;

    const t = best.tx;
    const absender = senderRaw(t);
    const from = getAccount(draft, absender);
    draft.set(toHex(absender), { balance: from.balance - spendTotal(t), nonce: from.nonce + 1n });
    const outputs = t.type === TX_BATCH ? t.outputs : [{ to: t.to, amount: t.amount }];
    for (const o of outputs) {
      const to = getAccount(draft, o.to);
      draft.set(toHex(o.to), { ...to, balance: to.balance + o.amount });
    }

    included.push(t);
    fees += t.fee;
    if (abV6) sigops += spendSigops(t);
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
  v6Height?: number,
): Coinbase {
  const max = maxCoinbaseOutputsAt(height, v6Height);
  if (anteile.length < 1 || anteile.length > max) {
    throw new Error(`Coinbase braucht 1 bis ${max} Empfaenger`);
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

/**
 * Die Coinbase fuer eine Aufteilung waehlen -- gemeinsam fuer buildBlock()
 * und die Job-Vorlage (jobVorlage.ts), damit beide dasselbe bauen.
 *
 * Ohne Aufteilung: Fassung 1 an `minerAddress`. Mit Aufteilung: Fassung 2.
 * Ausnahme ab Konsensfassung 5: Dort muss jede Ausgabe einer Coinbase der
 * Fassung 2 mindestens DUST_LIMIT betragen, Fassung 1 kennt diese Grenze
 * nicht. Ein einzelner Empfaenger mit weniger (erst ab Hoehe 360.000
 * moeglich, wenn die Belohnung darunter faellt) bekommt deshalb Fassung 1 --
 * derselbe Betrag an dieselbe Adresse.
 */
export function waehleCoinbase(
  height: number,
  verteilt: { to: Uint8Array; amount: bigint }[] | null,
  minerAddress: Uint8Array,
  fees: bigint,
  extra: Uint8Array | undefined,
  params: ConsensusParams,
): Coinbase {
  if (!verteilt || verteilt.length === 0) return buildCoinbase(height, minerAddress, fees, extra);
  if (verteilt.length === 1 && verteilt[0].amount < DUST_LIMIT && height >= params.v5Height) {
    return buildCoinbase(height, verteilt[0].to, fees, extra);
  }
  return buildCoinbaseV2(height, verteilt, fees, extra, params.v6Height);
}

export function buildBlock(p: BuildParams): BuildResult {
  const { included, rejected, fees } =
    selectTransactions(p.state, p.mempool, p.height, undefined, p.params ?? MAINNET);

  /*
    Aufteilung erst hier, weil erst jetzt feststeht, wie viel zu verteilen
    ist: Belohnung PLUS die Gebuehren der ausgewaehlten Transaktionen.

    Liefert die Aufteilung nichts -- etwa weil der Pool noch keine Shares
    hat --, geht der Block wie bisher an minerAddress. Ein Pool ohne
    Teilnehmer mint dann fuer sich selbst, statt gar nicht zu minen.
  */
  const brutto = rewardAt(p.height) + fees;
  const verteilt = p.anteile ? p.anteile(brutto) : null;
  const coinbase = waehleCoinbase(p.height, verteilt, p.minerAddress, fees, p.coinbaseExtra, p.params ?? MAINNET);
  const txs: Tx[] = [coinbase, ...included];

  // Zustand nach diesem Block bestimmen -- daraus kommt state_root.
  const after = cloneState(p.state);
  const header: BlockHeader = {
    version: blockVersionAt(p.height, (p.params ?? MAINNET).v6Height),
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

  header.stateRoot = stateRootAt(after, p.height, p.params ?? MAINNET);
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
