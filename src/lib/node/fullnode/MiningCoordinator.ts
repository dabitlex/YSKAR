/**
 * Mining am lokalen Knoten.
 *
 * Bis hierher kam jeder Mining-Job von Supabase. Das war der letzte Punkt,
 * an dem der Knoten etwas glauben musste: Wer den Job baut, bestimmt, in
 * welchem Block die Arbeit landet und wer die Coinbase bekommt.
 *
 * Hier erzeugt der Knoten den Job SELBST -- aus seinem eigenen Kettenkopf,
 * seinem eigenen Zustand und seinem eigenen Mempool. Er braucht dafuer
 * keine Verbindung nach aussen.
 *
 * ER GLAUBT AUCH SICH SELBST NICHT. Ein gefundener Block laeuft durch
 * dieselbe vollstaendige Pruefung wie ein fremder -- ueber ChainManager
 * .accept(). Das kostet Millisekunden und faengt jeden Fehler in der
 * Blockerzeugung ab, bevor er in die Kette kommt.
 */
import { buildBlock, finalizeBlock, selectTransactions, type BuildResult }
  from '../../core/builder.ts';
import { serializeHeader, serializeBlock, headerHash, deserializeBlock }
  from '../../core/block.ts';
import { expectedDifficulty } from '../../core/validate.ts';
import { targetFromDifficulty, MAX_FUTURE_DRIFT } from '../../core/params.ts';
import { medianTimePast, effectiveDifficulty } from '../../core/difficulty.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';
import { toHex } from '../../core/codec.ts';
import { txidHex, coinbaseTotal, type Transfer, type Coinbase } from '../../core/tx.ts';

import type { ChainManager } from './ChainManager.ts';
import type { ChainStore } from './ChainStore.ts';
import type { TxPool } from './TxPool.ts';

/** Wie lange ein Job gueltig bleibt, bevor er neu gebaut werden muss. */
export const JOB_TTL_MS = 90_000;

export interface MiningJob {
  jobId: string;
  height: number;
  version: number;
  prevHash: string;
  merkleRoot: string;
  stateRoot: string;
  timestamp: string;
  difficulty: number;
  txCount: number;
  extranonce: string;
  /** Header ohne Nonce, als Hex -- der Miner setzt nur die Nonce ein. */
  header: string;
  /** Ziel fuer einen vollen Block. Pools setzen ihr eigenes Share-Ziel. */
  target: string;
  erzeugt: number;
}

export type SubmitResult =
  | { ok: true; block: true; height: number; hash: string; reward: string }
  | { ok: true; block: false; achieved: string }
  | { ok: false; grund: string; detail?: string };

interface OffenerJob {
  job: MiningJob;
  gebaut: BuildResult;
  enthalten: Transfer[];
}

export class MiningCoordinator {
  private chain: ChainManager;
  private store: ChainStore;
  private pool: TxPool;
  private params: ConsensusParams;
  private offen = new Map<string, OffenerJob>();
  /**
   * Hoehe und Difficulty des zuletzt gebauten Jobs.
   *
   * Fuer die Anzeige. Bei jedem Aufruf neu zu rechnen waere teuer -- die
   * Difficulty-Regel liest dafuer knapp sechzig Bloecke aus der Ablage,
   * und die Statuszeile erneuert sich jede Sekunde.
   */
  private letzteVorgaben: { height: number; difficulty: bigint } | null = null;

  constructor(chain: ChainManager, store: ChainStore, pool: TxPool,
              params: ConsensusParams = MAINNET) {
    this.chain = chain;
    this.store = store;
    this.pool = pool;
    this.params = params;
  }

  /**
   * Einen Job bauen.
   *
   * Der vollstaendige Blockkoerper bleibt hier liegen. Ihn spaeter aus dem
   * Mempool zu rekonstruieren waere ein Fehler: Zwischen Ausgabe und Fund
   * aendert sich der Mempool, und merkle_root wie state_root im Header
   * verpflichten auf GENAU diese Auswahl. Weicht sie um eine Transaktion
   * ab, ist die geleistete Arbeit wertlos.
   */
  createJob(minerAddress: Uint8Array, extranonce: bigint): MiningJob {
    const tip = this.chain.tip();
    const hoehe = (tip?.height ?? -1) + 1;
    const state = this.chain.state();

    const { difficulty, zeitstempel } = this.naechsteVorgaben(tip);

    const { included } = selectTransactions(state, this.pool.alle(), hoehe);

    const gebaut = buildBlock({
      height: hoehe,
      prevHash: tip ? tip.hash : new Uint8Array(32),
      state,
      mempool: included,
      minerAddress,
      timestamp: zeitstempel,
      difficulty,
      extranonce,
      coinbaseExtra: new Uint8Array(0),
      params: this.params,
    });

    const h = gebaut.block.header;
    const jobId = toHex(headerHash({ ...h, nonce: 0n })).slice(0, 32);

    const job: MiningJob = {
      jobId,
      height: hoehe,
      version: h.version,
      prevHash: toHex(h.prevHash),
      merkleRoot: toHex(h.merkleRoot),
      stateRoot: toHex(h.stateRoot),
      timestamp: h.timestamp.toString(),
      difficulty: Number(h.difficulty),
      txCount: h.txCount,
      extranonce: h.extranonce.toString(),
      header: toHex(serializeHeader({ ...h, nonce: 0n })),
      target: toHex(zielBytes(targetFromDifficulty(h.difficulty))),
      erzeugt: Date.now(),
    };

    this.offen.set(jobId, { job, gebaut, enthalten: included });
    this.letzteVorgaben = { height: hoehe, difficulty: h.difficulty };
    this.aufraeumen();
    return job;
  }

  /**
   * Eine gefundene Nonce einreichen.
   *
   * Der Einreicher schickt NUR die Nonce. Der Hash wird hier selbst
   * gerechnet -- aus dem Koerper, der beim Job hinterlegt wurde. Eine
   * Angabe des Miners ueber die erreichte Difficulty wird nie uebernommen.
   */
  submitNonce(jobId: string, nonce: bigint): SubmitResult {
    const offen = this.offen.get(jobId);
    if (!offen) return { ok: false, grund: 'job_unknown' };
    if (Date.now() - offen.job.erzeugt > JOB_TTL_MS) {
      this.offen.delete(jobId);
      return { ok: false, grund: 'job_expired' };
    }

    // Hat sich die Kette inzwischen bewegt, gehoert der Job zu einer
    // Vergangenheit, die es nicht mehr gibt.
    const tip = this.chain.tip();
    const erwarteterVorgaenger = tip ? toHex(tip.hash) : toHex(new Uint8Array(32));
    if (offen.job.prevHash !== erwarteterVorgaenger) {
      this.offen.delete(jobId);
      return { ok: false, grund: 'stale_job' };
    }

    const block = finalizeBlock(offen.gebaut, nonce);
    const hash = headerHash(block.header);
    const wert = alsZahl(hash);
    const ziel = targetFromDifficulty(block.header.difficulty);

    if (wert > ziel) {
      return { ok: true, block: false, achieved: erreichteDifficulty(wert).toString() };
    }

    // Der Knoten glaubt auch sich selbst nicht: Der eigene Block laeuft
    // durch dieselbe vollstaendige Pruefung wie ein fremder.
    const roh = serializeBlock(block);
    const r = this.chain.accept(roh);
    if (!r.ok) return { ok: false, grund: r.grund, detail: r.detail };

    const coinbase = block.txs[0] as Coinbase;
    this.offen.delete(jobId);
    this.pool.nachBlock(offen.enthalten, this.chain.state());

    return {
      ok: true, block: true,
      height: block.header.height,
      hash: toHex(hash),
      reward: coinbaseTotal(coinbase).toString(),
    };
  }

  /** Alle Jobs verwerfen -- nach einem Reorg oder fremden Block noetig. */
  invalidate(): void {
    this.offen.clear();
    this.letzteVorgaben = null;
  }

  /**
   * Woran gerade gearbeitet wird -- Hoehe und Difficulty des naechsten
   * Blocks, nicht des letzten fertigen.
   *
   * Das sind zwei verschiedene Zahlen, und die Verwechslung ist naheliegend:
   * Block 839 kann Difficulty 63.980 haben, waehrend an Block 840 mit
   * 65.736 gearbeitet wird. Die Regel errechnet die Difficulty jedes Blocks
   * neu aus den Loesungszeiten davor.
   */
  aktuelleArbeit(): { height: number; difficulty: bigint } | null {
    return this.letzteVorgaben;
  }

  offeneJobs(): number { return this.offen.size; }

  /**
   * Difficulty und Zeitstempel fuer den naechsten Block.
   *
   * Beides muss GENAU den Regeln folgen, sonst lehnt die eigene
   * Validierung den fertigen Block ab -- nach getaner Arbeit.
   */
  private naechsteVorgaben(tip: { height: number; blockTime: bigint } | null): {
    difficulty: bigint; zeitstempel: bigint;
  } {
    const jetzt = BigInt(Math.floor(Date.now() / 1000));

    if (!tip) {
      return { difficulty: this.params.genesisDifficulty, zeitstempel: jetzt };
    }

    const kette = this.aktiveKette(tip.height);
    const timings = kette.slice(1).map((b, i) => ({
      solveSeconds: b.blockTime - kette[i].blockTime,
      difficulty: b.difficulty,
    }));
    const regulaer = expectedDifficulty(
      timings.slice(-this.params.lwmaWindow - 1), this.params);

    // Der Zeitstempel muss ueber dem Median der letzten Bloecke liegen und
    // darf nicht zu weit in der Zukunft stehen.
    const median = medianTimePast(kette.slice(-11).map(b => b.blockTime));
    let zeitstempel = jetzt;
    if (zeitstempel <= median) zeitstempel = median + 1n;
    const obergrenze = jetzt + MAX_FUTURE_DRIFT - 5n;
    if (zeitstempel > obergrenze) zeitstempel = obergrenze;

    // Notfallregel: Nach langer Stille darf leichter gemint werden.
    const vergangen = zeitstempel > tip.blockTime ? zeitstempel - tip.blockTime : 0n;
    const difficulty = effectiveDifficulty(regulaer, vergangen, this.params);

    return { difficulty, zeitstempel };
  }

  private aktiveKette(bisHoehe: number): { blockTime: bigint; difficulty: bigint }[] {
    const ab = Math.max(0, bisHoehe - this.params.lwmaWindow - 12);
    const out: { blockTime: bigint; difficulty: bigint }[] = [];
    for (let h = ab; h <= bisHoehe; h++) {
      const b = this.store.mainAt(h);
      if (!b) throw new Error(`Aktive Kette hat eine Luecke bei Hoehe ${h}`);
      out.push({ blockTime: b.blockTime, difficulty: b.difficulty });
    }
    return out;
  }

  private aufraeumen(): void {
    const grenze = Date.now() - JOB_TTL_MS;
    for (const [id, o] of this.offen) {
      if (o.job.erzeugt < grenze) this.offen.delete(id);
    }
  }
}

// ------------------------------------------------------------- Hilfsmittel

function alsZahl(hash: Uint8Array): bigint {
  let v = 0n;
  for (const b of hash) v = (v << 8n) | BigInt(b);
  return v;
}

function erreichteDifficulty(hashWert: bigint): bigint {
  if (hashWert === 0n) return (1n << 240n);
  return (1n << 240n) / hashWert;
}

function zielBytes(ziel: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = ziel;
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
