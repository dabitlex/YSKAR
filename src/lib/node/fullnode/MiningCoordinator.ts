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
import { baueVorlage, baueAusVorlage, type JobVorlage } from './jobVorlage.ts';
import { serializeHeader, serializeBlock, headerHash, deserializeBlock }
  from '../../core/block.ts';
import { expectedDifficulty } from '../../core/validate.ts';
import { targetFromDifficulty, MAX_FUTURE_DRIFT, difficultyAtHeight, encodeDifficulty }
  from '../../core/params.ts';
import { medianTimePast, effectiveDifficulty } from '../../core/difficulty.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';
import { toHex } from '../../core/codec.ts';
import { txidHex, coinbaseTotal, type Transfer, type Coinbase } from '../../core/tx.ts';

import type { ChainManager } from './ChainManager.ts';
import type { ChainStore } from './ChainStore.ts';
import type { TxPool } from './TxPool.ts';
import { mempoolNachziehen } from './mempoolPflege.ts';

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
  /**
   * Das ROHE 4-Byte-Feld aus dem Header, nicht der Wert.
   *
   * Aeltere Miner (App, Mini App, CLI) schreiben genau diese Zahl an
   * Stelle 112 in ihren Header. Unter 2^31 ist Feld = Wert; darueber
   * (Konsensfassung 4) steht hier die Gleitkomma-Schreibweise -- und nur so
   * rechnen alte Miner weiter richtig. Fuer Anzeigen: difficultyWert.
   */
  difficulty: number;
  /** Echte Difficulty als Dezimaltext -- beliebig gross, ohne Rundung. */
  difficultyWert: string;
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

/** Was createJob() zusaetzlich beachten soll. */
export interface JobWunsch {
  /**
   * Fruehester Zeitstempel fuer diesen Job.
   *
   * Der MiningServer bindet das Share-Ziel an den Job. Soll sich das Ziel
   * aendern, braucht die Sitzung einen Job mit ANDERER Kennung -- und
   * innerhalb derselben Sekunde ergaebe dieselbe Vorlage dieselbe Kennung.
   * Ein um eine Sekunde spaeterer Zeitstempel macht sie verschieden. Die
   * Regel fuer Zeitstempel (nicht mehr als MAX_FUTURE_DRIFT voraus) gilt
   * weiter: Daran wird der Wunsch gekappt.
   */
  mindestZeit?: bigint;
}

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
  private jetzt: () => bigint;

  /**
   * Vorarbeit fuer den naechsten Block -- siehe jobVorlage.ts.
   *
   * Gilt fuer genau einen Kettenkopf und einen Mempool-Stand. Aendert sich
   * eins von beidem, wird sie beim naechsten Job neu gerechnet.
   */
  private vorlage: JobVorlage | null = null;
  /**
   * Welche Rechenwege dieser Vorlage schon gegen buildBlock() geprueft sind.
   *
   * Ein Weg ist: Coinbase-Fassung (ein oder mehrere Empfaenger) und wie die
   * Wurzel entsteht (nur Pfade, oder ab einer neuen Stelle). Jeder wird
   * einmal je Vorlage voll nachgebaut und verglichen -- hoechstens vier
   * volle Bauten je Kettenkopf und Mempool-Stand.
   */
  private vorlageGeprueft = new Set<string>();
  /**
   * Ein: Jobs aus der Vorlage. Aus: jeder Job wie bisher mit buildBlock().
   *
   * Schaltet sich selbst ab, sobald ein Job aus der Vorlage auch nur in
   * einem Byte von buildBlock() abweicht -- dann lieber langsam und richtig.
   */
  vorlageAn = true;
  /** Wird gerufen, wenn die Vorlage abgeschaltet werden musste. */
  onFehler?: (wo: string, e: Error) => void;

  /**
   * @param jetzt  Aktuelle Zeit in Sekunden. Ohne Angabe die Systemuhr.
   *
   * Von aussen setzbar, damit Tests eine Kette mit gleichmaessigen
   * Abstaenden erzeugen koennen. Mit der Systemuhr entstehen Testbloecke in
   * Millisekunden, die Difficulty-Regel sieht Loesungszeiten nahe null und
   * hebt die Difficulty je Block um den Deckelungsfaktor an -- das ist
   * richtig, macht Tests aber von der Maschinenlast abhaengig.
   */
  constructor(chain: ChainManager, store: ChainStore, pool: TxPool,
              params: ConsensusParams = MAINNET,
              jetzt?: () => bigint) {
    this.chain = chain;
    this.store = store;
    this.pool = pool;
    this.params = params;
    this.jetzt = jetzt ?? (() => BigInt(Math.floor(Date.now() / 1000)));
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
  /**
   * @param extra  Inhalt des extra-Felds der Coinbase. Dort traegt sich
   *               ein_ Pool oder ein Miner mit seinem Namen ein; der
   *               Explorer liest ihn wieder heraus.
   *
   *               Ohne Angabe bleibt das Feld leer. Der Aufrufer
   *               entscheidet: Fuer die eigenen Miner des Knotens und fuer
   *               Pool-Sitzungen der eingestellte Name, fuer fremde
   *               Solo-Miner nichts -- ihre Bloecke gehoeren nicht diesem
   *               Knoten, und sein Name stuende zu Unrecht darin.
   */
  /**
   * @param anteile  Aufteilung der Belohnung fuer Pool-Mining. Ohne Angabe
   *                 bekommt minerAddress alles.
   *
   *                 WICHTIG: Die Anteile sind BRUTTO. Sie muessen zusammen
   *                 genau reward(height) + fees ergeben -- und die fees
   *                 kennt erst der Blockbau, weil er die Transaktionen
   *                 auswaehlt. Deshalb nimmt createJob eine FUNKTION
   *                 entgegen, nicht eine fertige Liste: Sie bekommt die
   *                 tatsaechliche Summe und teilt sie auf.
   */
  createJob(minerAddress: Uint8Array, extranonce: bigint,
            extra: Uint8Array = new Uint8Array(0),
            anteile?: (brutto: bigint) => { to: Uint8Array; amount: bigint }[],
            wunsch: JobWunsch = {}): MiningJob {
    const tip = this.chain.tip();
    const hoehe = (tip?.height ?? -1) + 1;
    const state = this.chain.state();

    const { difficulty, zeitstempel } = this.naechsteVorgaben(tip, wunsch.mindestZeit);
    const prevHash = tip ? tip.hash : new Uint8Array(32);

    const gebaut = this.vorlageAn
      ? this.ausVorlage(hoehe, prevHash, minerAddress, zeitstempel, difficulty, extranonce, extra, anteile)
      : this.vollerBau(hoehe, prevHash, minerAddress, zeitstempel, difficulty, extranonce, extra, anteile);

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
      difficulty: encodeDifficulty(h.difficulty, h.height),
      difficultyWert: h.difficulty.toString(),
      txCount: h.txCount,
      extranonce: h.extranonce.toString(),
      header: toHex(serializeHeader({ ...h, nonce: 0n })),
      target: toHex(zielBytes(targetFromDifficulty(h.difficulty))),
      erzeugt: Date.now(),
    };

    this.offen.set(jobId, { job, gebaut, enthalten: gebaut.included });
    this.letzteVorgaben = { height: hoehe, difficulty: h.difficulty };
    this.aufraeumen();
    return job;
  }

  /** Der Blockbau wie bisher: alles neu, ohne Vorarbeit. */
  private vollerBau(hoehe: number, prevHash: Uint8Array, minerAddress: Uint8Array,
                    zeitstempel: bigint, difficulty: bigint, extranonce: bigint,
                    extra: Uint8Array,
                    anteile?: (brutto: bigint) => { to: Uint8Array; amount: bigint }[]): BuildResult {
    const state = this.chain.state();
    const { included } = selectTransactions(state, this.pool.alle(), hoehe, undefined, this.params);
    return buildBlock({
      height: hoehe, prevHash, state, mempool: included, minerAddress,
      timestamp: zeitstempel, difficulty, extranonce, coinbaseExtra: extra, anteile,
      params: this.params,
    });
  }

  /**
   * Der Blockbau aus der Vorarbeit.
   *
   * Der erste Job jeder neuen Vorlage wird ZUSAETZLICH voll gebaut und
   * Byte fuer Byte verglichen. Weicht er ab, gilt ab sofort wieder der
   * volle Bau -- fuer immer, bis zum Neustart -- und der Fehler wird
   * gemeldet. Ein Miner, der auf einem falschen Job rechnet, verliert seine
   * Arbeit; das darf nicht stillschweigend passieren.
   */
  private ausVorlage(hoehe: number, prevHash: Uint8Array, minerAddress: Uint8Array,
                     zeitstempel: bigint, difficulty: bigint, extranonce: bigint,
                     extra: Uint8Array,
                     anteile?: (brutto: bigint) => { to: Uint8Array; amount: bigint }[]): BuildResult {
    const schluessel = `${toHex(prevHash)}:${hoehe}:${this.pool.version()}`;
    if (this.vorlage?.schluessel !== schluessel) {
      this.vorlage = baueVorlage(schluessel, this.chain.state(), this.pool.alle(), hoehe, this.params);
      this.vorlageGeprueft.clear();
    }
    const { art, ...gebaut } = baueAusVorlage(this.vorlage, {
      prevHash, minerAddress, timestamp: zeitstempel, difficulty, extranonce,
      coinbaseExtra: extra, anteile, params: this.params,
    });
    if (this.vorlageGeprueft.has(art)) return gebaut;

    const voll = this.vollerBau(hoehe, prevHash, minerAddress, zeitstempel, difficulty, extranonce, extra, anteile);
    const gleich = toHex(serializeBlock(voll.block)) === toHex(serializeBlock(gebaut.block))
      && voll.fees === gebaut.fees;
    if (!gleich) {
      this.vorlageAn = false;
      this.vorlage = null;
      this.onFehler?.('Job-Vorlage', new Error(
        'Ein Job aus der Vorarbeit wich vom vollen Blockbau ab -- die Vorarbeit ist bis zum Neustart abgeschaltet.'));
      return voll;
    }
    this.vorlageGeprueft.add(art);
    return gebaut;
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

    /*
      Frueher stand hier pool.nachBlock(offen.enthalten, ...) -- die
      Transaktionen, die DIESER Knoten in DIESEN Block gebaut hat.

      Das war die halbe Wahrheit. Ein angenommener Block kann einen Reorg
      ausgeloest haben; dann sind auch Bloecke aus der aktiven Kette
      gefallen, deren Transaktionen zurueck in die Warteschlange gehoeren.
      Und dieselbe Pflege braucht jeder angenommene Block, nicht nur der
      selbst gefundene -- deshalb steht sie jetzt in einer Funktion, die
      alle drei Annahmestellen rufen.
    */
    if (r.stored) {
      mempoolNachziehen(r, this.pool, this.chain.state(), this.chain.height());
    }

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
    this.vorlage = null;
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
  private naechsteVorgaben(tip: { height: number; blockTime: bigint } | null,
                           mindestZeit?: bigint): {
    difficulty: bigint; zeitstempel: bigint;
  } {
    const jetzt = this.jetzt();

    if (!tip) {
      const z = mindestZeit !== undefined && mindestZeit > jetzt
        ? (mindestZeit < jetzt + MAX_FUTURE_DRIFT - 5n ? mindestZeit : jetzt + MAX_FUTURE_DRIFT - 5n)
        : jetzt;
      return { difficulty: this.params.genesisDifficulty, zeitstempel: z };
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
    if (mindestZeit !== undefined && zeitstempel < mindestZeit) zeitstempel = mindestZeit;
    const obergrenze = jetzt + MAX_FUTURE_DRIFT - 5n;
    if (zeitstempel > obergrenze) zeitstempel = obergrenze;
    /*
      Nie vor dem Vorgaenger (Konsensfassung 5, ab V5_HEIGHT Pflicht). Geht
      die eigene Uhr nach oder liegt der Vorgaenger leicht in der Zukunft,
      bekommt der Block dessen Zeitstempel -- gleich ist erlaubt, warten
      muss niemand. Auch vor der Aktivierung schadet das nicht: Der Wert
      wird hier nur angehoben, nie gesenkt, die Median-Regel bleibt also
      erfuellt. Und ueber der eigenen Zukunftsgrenze liegt er nicht, denn
      diesen Vorgaenger hat der Knoten selbst schon angenommen.
    */
    if (zeitstempel < tip.blockTime) zeitstempel = tip.blockTime;

    // Notfallregel: Nach langer Stille darf leichter gemint werden.
    const vergangen = zeitstempel > tip.blockTime ? zeitstempel - tip.blockTime : 0n;
    // Ab Konsensfassung 4 auf den naechsten darstellbaren Wert abrunden --
    // genau wie validate es erwartet. Darunter aendert das nichts.
    const difficulty = difficultyAtHeight(
      effectiveDifficulty(regulaer, vergangen, this.params), tip.height + 1);

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
