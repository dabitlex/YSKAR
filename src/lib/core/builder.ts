import {
  type Tx, type Spend, type Coinbase,
  TX_COINBASE, TX_BATCH, TX_VERSION, checkSpend, txid, senderRaw, spendTotal, spendSigops, txBytes,
} from './tx.ts';
import { type Block, type BlockHeader, serializeHeader, txMerkleRoot } from './block.ts';
import { type State, cloneState, getAccount, applyBlock, stateRootAt } from './state.ts';
import {
  rewardAt, COINBASE_V2, DUST_LIMIT, maxTxsAt, maxCoinbaseOutputsAt, blockVersionAt,
  MAX_BLOCK_SIGOPS, MAX_BLOCK_BYTES, MAX_COINBASE_EXTRA, ADDRESS_BYTES,
} from './params.ts';
import { HEADER_SIZE } from './block.ts';

/**
 * Bytes, die ein Block ohne Ausgaben hoechstens braucht: Header, Zaehler,
 * Rahmen und eine Coinbase der Fassung 2 mit der groessten Empfaengerzahl
 * der Hoehe und vollem `extra`. Was darueber frei bleibt, duerfen die
 * Ausgaben fuellen -- sonst sprengt der eigene Block MAX_BLOCK_BYTES und
 * jeder Peer lehnt ihn ab (block_zu_gross).
 */
export function blockBytesOhneAusgaben(height: number, v6Height?: number): number {
  const coinbase = 2 + 1 + 4 + 1 + maxCoinbaseOutputsAt(height, v6Height) * (ADDRESS_BYTES + 8) + 1 + MAX_COINBASE_EXTRA;
  return HEADER_SIZE + 4 + 4 + coinbase;
}
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
  /** Siehe AuswahlOptionen.vorgeprueft. applyBlock prueft den Block trotzdem voll. */
  vorgeprueft?: boolean;
}

export interface BuildResult {
  block: Block;              // nonce = 0, noch ungeloest
  header: Uint8Array;        // 136 Byte, bereit fuer die Engine
  included: Spend[];
  rejected: { txid: string; reason: string }[];
  fees: bigint;
  stateRoot: Uint8Array;
}

/** Groesse auf der Leitung, je Objekt einmal gerechnet (die Serialisierung kostet). */
const BYTES = new WeakMap<Spend, number>();
export function spendBytes(t: Spend): number {
  let b = BYTES.get(t);
  if (b === undefined) { b = txBytes(t); BYTES.set(t, b); }
  return b;
}

/**
 * txid und Absender als Hex, je Objekt einmal gerechnet. Transaktionen sind
 * nach dem Bau unveraenderlich (der Mempool haelt dieselben Objekte), und
 * bei vollem Mempool sind Serialisierung und Hash sonst der groesste Posten
 * jeder Auswahl und jeder Vorschau.
 */
const TXID = new WeakMap<Spend, string>();
export function spendTxid(t: Spend): string {
  let h = TXID.get(t);
  if (h === undefined) { h = toHex(txid(t)); TXID.set(t, h); }
  return h;
}
const ABSENDER = new WeakMap<Spend, string>();
export function absenderHex(t: Spend): string {
  let h = ABSENDER.get(t);
  if (h === undefined) { h = toHex(senderRaw(t)); ABSENDER.set(t, h); }
  return h;
}

/**
 * Gebuehr je Byte -- danach waehlt der Blockbau aus und danach verdraengt der
 * Mempool. Als Gleitkommazahl: Das ist eine Reihenfolge, kein Betrag, und
 * keine Konsensregel haengt daran.
 */
export function gebuehrJeByte(t: Spend): number {
  return Number(t.fee) / spendBytes(t);
}

export interface AuswahlOptionen {
  /**
   * Der Aufrufer sichert zu, dass checkSpend(t, height) fuer JEDE
   * uebergebene Transaktion null ist -- so liefert es TxPool.fuerBlock().
   * Dann entfaellt die Signaturpruefung hier. Der Block selbst wird beim
   * Anwenden (applyBlock) trotzdem voll geprueft.
   */
  vorgeprueft?: boolean;
}

/** Ein Absender in der Auswahl: seine Transaktionen nach Nonce, und wie weit er ist. */
interface Reihe {
  key: string;
  /** Erstes Auftreten im Mempool -- entscheidet bei gleicher Gebuehr je Byte. */
  nr: number;
  txs: Spend[];
  i: number;
}

/**
 * Auswahl aus dem Mempool, Block fuer Block.
 *
 * Zwei Regeln, die sich gegenseitig einschraenken:
 *   1. Je Absender muessen die Nonces luecken- und reihenfolgetreu sein --
 *      eine Transaktion mit Nonce 5 ist wertlos, solange 4 fehlt.
 *   2. Zwischen verschiedenen Absendern entscheidet die Gebuehr je Byte.
 *
 * Greedy: In jedem Schritt kommt die naechste faellige Transaktion des
 * Absenders dran, der gerade die hoechste Gebuehr je Byte bietet; bei
 * Gleichstand der, der im Mempool zuerst auftaucht. Guthaben wird laufend
 * mitgefuehrt, damit eine Kette von Ausgaben nicht am Ende umkippt, und
 * eine Zahlung an einen Absender kann dessen eigene Ausgabe im selben Block
 * erst moeglich machen.
 *
 * Die Absender liegen in einem Haufen (Heap), sortiert nach ihrer naechsten
 * Transaktion. Ein Schritt kostet damit log(Absender) statt einen Durchlauf
 * ueber alle -- bei vollem Mempool der Unterschied zwischen Millisekunden
 * und einer Minute.
 *
 * Mehrere Bloecke hintereinander (naechsterBlock() mehrfach) liefern die
 * Vorschau der Warteschlange: Der Zustand laeuft ueber die Bloecke weiter.
 */
export class Auswahl {
  readonly rejected: { txid: string; reason: string }[] = [];
  private haufen: Reihe[] = [];
  /** Wartet auf Guthaben: Absender -> Reihe. Eine Zahlung an ihn holt ihn zurueck. */
  private geparkt = new Map<string, Reihe>();
  /** Passte nicht mehr in diesen Block (Bytes, Signaturen): im naechsten wieder. */
  private spaeter: Reihe[] = [];
  private konten = new Map<string, { balance: bigint; nonce: bigint }>();

  private state: State;
  private height: number;
  private params: ConsensusParams;

  constructor(
    state: State,
    mempool: Spend[],
    height: number,
    params: ConsensusParams = MAINNET,
    opt: AuswahlOptionen = {},
  ) {
    this.state = state;
    this.height = height;
    this.params = params;
    const reihen = new Map<string, Reihe>();
    let nr = 0;
    for (const t of mempool) {
      if (!opt.vorgeprueft) {
        const structural = checkSpend(t, height, params);
        if (structural) { this.rejected.push({ txid: spendTxid(t), reason: structural }); continue; }
      }
      const key = absenderHex(t);
      let r = reihen.get(key);
      if (!r) { r = { key, nr: nr++, txs: [], i: 0 }; reihen.set(key, r); }
      r.txs.push(t);
    }
    // Je Absender nach Nonce sortieren; doppelte Nonces sind Konkurrenten,
    // die hoehere Gebuehr gewinnt.
    for (const r of reihen.values()) {
      r.txs.sort((a, b) => (a.nonce === b.nonce
        ? (b.fee > a.fee ? 1 : b.fee < a.fee ? -1 : 0)
        : (a.nonce < b.nonce ? -1 : 1)));
      const unique: Spend[] = [];
      for (const t of r.txs) {
        if (unique.length && unique[unique.length - 1].nonce === t.nonce) {
          this.rejected.push({ txid: toHex(txid(t)), reason: 'nonce_conflict' });
          continue;
        }
        unique.push(t);
      }
      r.txs = unique;
      this.hinein(r);
    }
  }

  private konto(key: string, raw: Uint8Array) {
    return this.konten.get(key) ?? getAccount(this.state, raw);
  }

  // ------------------------------------------------ Haufen (groesste Rate oben)

  private vor(a: Reihe, b: Reihe): boolean {
    const ra = gebuehrJeByte(a.txs[a.i]), rb = gebuehrJeByte(b.txs[b.i]);
    return ra !== rb ? ra > rb : a.nr < b.nr;
  }

  private hinein(r: Reihe): void {
    const h = this.haufen;
    h.push(r);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.vor(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  private heraus(): Reihe | undefined {
    const h = this.haufen;
    if (h.length === 0) return undefined;
    const oben = h[0];
    const letzter = h.pop()!;
    if (h.length > 0) {
      h[0] = letzter;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && this.vor(h[l], h[m])) m = l;
        if (r < h.length && this.vor(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return oben;
  }

  /** Ist noch etwas uebrig, das in einen spaeteren Block passen koennte? */
  leer(): boolean {
    return this.haufen.length === 0 && this.spaeter.length === 0;
  }

  /**
   * Den naechsten Block fuellen. `hoehe` ist die Hoehe dieses Blocks --
   * beim ersten Aufruf die aus dem Konstruktor, danach jeweils eins mehr.
   */
  naechsterBlock(limit?: number, hoehe: number = this.height): { included: Spend[]; fees: bigint } {
    for (const r of this.spaeter) this.hinein(r);
    this.spaeter = [];

    // Ein Platz gehoert der Coinbase; die Grenze haengt an der Hoehe (Fassung 6).
    const max = limit ?? maxTxsAt(hoehe, this.params.v6Height) - 1;
    const included: Spend[] = [];
    let fees = 0n;
    let sigops = 0;
    let bytes = blockBytesOhneAusgaben(hoehe, this.params.v6Height);
    const abV6 = hoehe >= this.params.v6Height;

    while (included.length < max) {
      const r = this.heraus();
      if (!r) break;
      const t = r.txs[r.i];
      const absender = senderRaw(t);
      const acc = this.konto(r.key, absender);
      // Schon verbraucht (etwa vom Block, der gerade kam, bevor der Mempool
      // aufgeraeumt hat): nur DIESE ueberspringen, nicht die ganze Reihe --
      // die naechste Nonce des Absenders kann genau die faellige sein.
      if (t.nonce < acc.nonce) {
        r.i++;
        if (r.i < r.txs.length) this.hinein(r);
        continue;
      }
      // Noch nicht faellig (Luecke): Daran aendert in dieser Auswahl nur der
      // Absender selbst etwas -- und dessen Reihe steht hier.
      if (t.nonce !== acc.nonce) continue;
      if (acc.balance < spendTotal(t)) { this.geparkt.set(r.key, r); continue; }
      // Signaturbudget (CONSENSUS_V6.md 7.7) und Blockgroesse (Fassung 5):
      // je Transaktion 4 Byte Rahmen plus ihre Bytes. Was nicht mehr passt,
      // passt in diesem Block auch spaeter nicht -- beides waechst nur.
      if ((abV6 && sigops + spendSigops(t) > MAX_BLOCK_SIGOPS)
          || bytes + 4 + spendBytes(t) > MAX_BLOCK_BYTES) {
        this.spaeter.push(r);
        continue;
      }

      this.konten.set(r.key, { balance: acc.balance - spendTotal(t), nonce: acc.nonce + 1n });
      const outputs = t.type === TX_BATCH ? t.outputs : [{ to: t.to, amount: t.amount }];
      for (const o of outputs) {
        const k = toHex(o.to);
        const to = this.konto(k, o.to);
        this.konten.set(k, { ...to, balance: to.balance + o.amount });
        const wartet = this.geparkt.get(k);
        if (wartet) { this.geparkt.delete(k); this.hinein(wartet); }
      }

      included.push(t);
      fees += t.fee;
      if (abV6) sigops += spendSigops(t);
      bytes += 4 + spendBytes(t);
      r.i++;
      if (r.i < r.txs.length) this.hinein(r);
    }
    // Was uebrig blieb, ist nicht ungueltig -- es passte nur nicht in DIESEN
    // Block. Der Mempool behaelt es.
    return { included, fees };
  }
}

export function selectTransactions(
  state: State,
  mempool: Spend[],
  height: number,
  limit?: number,
  params: ConsensusParams = MAINNET,
  opt: AuswahlOptionen = {},
): { included: Spend[]; rejected: { txid: string; reason: string }[]; fees: bigint } {
  const a = new Auswahl(state, mempool, height, params, opt);
  const { included, fees } = a.naechsterBlock(limit, height);
  return { included, rejected: a.rejected, fees };
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
    selectTransactions(p.state, p.mempool, p.height, undefined, p.params ?? MAINNET,
      { vorgeprueft: p.vorgeprueft });

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
