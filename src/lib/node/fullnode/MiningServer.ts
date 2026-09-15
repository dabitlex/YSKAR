/**
 * Mining-Schnittstelle des Knotens.
 *
 * Spricht GENAU dasselbe Protokoll wie der Server: /session, /job, /share,
 * /session/stop, /summary. Dadurch laeuft der bestehende Miner unveraendert
 * gegen einen lokalen Knoten -- es genuegt `--api http://127.0.0.1:8645`.
 *
 * Warum kein zweiter Miner: Eine zweite Kopie von Engine, Rechen-Thread und
 * Kommandozeile waere dieselbe Verdopplung, die uns in diesem Projekt schon
 * zweimal getroffen hat -- einmal beim Blockheader, einmal beim
 * WASM-Zwischenspeicher. Beide Male fiel es erst nach Stunden auf, weil die
 * Kopien lautlos auseinanderliefen.
 *
 * Der Knoten haelt Sessions im Arbeitsspeicher. Nach einem Neustart sind
 * sie weg, und die Miner melden sich neu an -- das ist richtig so, denn der
 * Nonce-Bereich einer Session gilt nur fuer den Kettenkopf, auf dem sie
 * begonnen hat.
 *
 * GEBUNDEN AN LOCALHOST, solange nichts anderes angegeben wird. Diese
 * Schnittstelle nimmt Arbeit entgegen und baut Bloecke; sie gehoert nicht
 * ungeschuetzt ins Netz.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { decodeAddress } from '../../core/address.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import { totalSupply, stateRoot } from '../../core/state.ts';
import { MAX_SUPPLY, rewardAt, TARGET_BLOCK_TIME } from '../../core/params.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';

import type { ChainManager } from './ChainManager.ts';
import type { ChainStore } from './ChainStore.ts';
import type { TxPool } from './TxPool.ts';
import type { MiningCoordinator, MiningJob } from './MiningCoordinator.ts';

/** Angestrebter Abstand zwischen zwei Shares, in Sekunden. */
const SHARE_ZIEL_SEKUNDEN = 30;
/** Startwert, bis genug gemessen wurde. */
const SHARE_START = 128n;
/** Eine Session gilt als tot, wenn so lange nichts kam. */
const SESSION_TIMEOUT_MS = 300_000;

interface Session {
  id: string;
  address: Uint8Array;
  addressHex: string;
  extranonce: bigint;
  shareDifficulty: bigint;
  /** Zeitpunkte der letzten angenommenen Shares, fuer die Anpassung. */
  letzteShares: number[];
  angenommen: number;
  abgelehnt: number;
  gestartet: number;
  zuletzt: number;
  platform: string | null;
  /** Job je Session -- die Extranonce steckt im Header. */
  jobId: string | null;
}

export interface ServerOptionen {
  host?: string;
  port?: number;
  params?: ConsensusParams;
}

export class MiningServer {
  private chain: ChainManager;
  private store: ChainStore;
  private pool: TxPool;
  private mining: MiningCoordinator;
  private params: ConsensusParams;

  private sessions = new Map<string, Session>();
  private naechsteExtranonce = 1n;
  private server = createServer((req, res) => this.behandle(req, res));

  /** Wird bei jedem angenommenen Block gerufen -- fuer die Anzeige. */
  onBlock?: (h: number, hash: string, adresse: string) => void;

  /**
   * Wohin ein gefundener Block weitergereicht wird.
   *
   * Solange es kein P2P gibt, ist das der Server. Ohne diese Weitergabe
   * laege ein lokal gefundener Block nur hier und wuerde beim naechsten
   * Block der anderen Seite verdraengt -- echte Arbeit fuer nichts.
   */
  upstream?: string;
  onUpstream?: (ergebnis: { ok: boolean; grund?: string; hoehe?: number }) => void;

  constructor(teile: {
    chain: ChainManager; store: ChainStore; pool: TxPool; mining: MiningCoordinator;
  }, opt: ServerOptionen = {}) {
    this.chain = teile.chain;
    this.store = teile.store;
    this.pool = teile.pool;
    this.mining = teile.mining;
    this.params = opt.params ?? MAINNET;
  }

  listen(host = '127.0.0.1', port = 8645): Promise<void> {
    return new Promise((auf, ab) => {
      this.server.once('error', ab);
      this.server.listen(port, host, () => auf());
    });
  }

  close(): Promise<void> {
    return new Promise(auf => this.server.close(() => auf()));
  }

  aktiveSessions(): number {
    this.aufraeumen();
    return this.sessions.size;
  }

  gesamtHashrate(): number {
    this.aufraeumen();
    let summe = 0;
    for (const s of this.sessions.values()) {
      const abstand = this.mittlererAbstand(s);
      if (abstand) summe += Number(s.shareDifficulty) * 65536 / abstand;
    }
    return summe;
  }

  // ------------------------------------------------------------ Weiterleitung

  private async behandle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    const pfad = url.pathname.replace(/^\/api\/v2/, '');

    try {
      if (req.method === 'POST' && pfad === '/session') {
        return this.json(res, await this.session(req));
      }
      if (req.method === 'POST' && pfad === '/session/stop') {
        const b = await this.body(req);
        this.sessions.delete(String(b.sessionId));
        return this.json(res, { stopped: true });
      }
      if (req.method === 'GET' && pfad === '/job') {
        return this.json(res, this.job(url.searchParams.get('session')));
      }
      if (req.method === 'POST' && pfad === '/share') {
        return this.json(res, this.share(await this.body(req)));
      }
      if (req.method === 'GET' && pfad === '/summary') {
        return this.json(res, this.summary());
      }
      if (req.method === 'GET' && pfad === '/status') {
        return this.json(res, this.status());
      }
      this.json(res, { error: 'not_found' }, 404);
    } catch (e) {
      this.json(res, { error: 'internal', detail: String((e as Error).message) }, 500);
    }
  }

  private json(res: ServerResponse, daten: unknown, status = 200): void {
    const text = JSON.stringify(daten);
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
  }

  /**
   * Rumpf einlesen, mit Groessengrenze.
   *
   * Ohne Grenze kann eine einzige Anfrage den Knoten den Speicher kosten.
   * Ein Share ist rund hundert Byte; 64 KB sind grosszuegig.
   */
  private body(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((auf, ab) => {
      let roh = '';
      req.on('data', (stueck: Buffer) => {
        roh += stueck;
        if (roh.length > 65536) { req.destroy(); ab(new Error('Anfrage zu gross')); }
      });
      req.on('end', () => {
        try { auf(roh ? JSON.parse(roh) : {}); }
        catch { ab(new Error('kein gueltiges JSON')); }
      });
      req.on('error', ab);
    });
  }

  // ----------------------------------------------------------------- Session

  private async session(req: IncomingMessage): Promise<Record<string, unknown>> {
    const b = await this.body(req);
    if (typeof b.address !== 'string') return { error: 'missing_address' };

    let roh: Uint8Array;
    try { roh = decodeAddress(b.address); }
    catch { return { error: 'bad_address' }; }

    this.aufraeumen();
    const s: Session = {
      id: randomUUID(),
      address: roh,
      addressHex: toHex(roh),
      // Eindeutig je Session: Sie trennt die Nonce-Raeume. Zwei Miner
      // koennen denselben Treffer dadurch gar nicht finden.
      extranonce: this.naechsteExtranonce++,
      shareDifficulty: SHARE_START,
      letzteShares: [],
      angenommen: 0, abgelehnt: 0,
      gestartet: Date.now(), zuletzt: Date.now(),
      platform: typeof b.platform === 'string' ? b.platform : null,
      jobId: null,
    };
    this.sessions.set(s.id, s);

    const gleiche = [...this.sessions.values()]
      .filter(x => x.addressHex === s.addressHex).length;

    return {
      sessionId: s.id,
      extranonce: s.extranonce.toString(),
      shareDifficulty: s.shareDifficulty.toString(),
      address: b.address,
      concurrentSessions: gleiche,
    };
  }

  // --------------------------------------------------------------------- Job

  private job(sessionId: string | null): Record<string, unknown> {
    const s = sessionId ? this.sessions.get(sessionId) : null;
    if (!s) return { error: 'session_inactive' };
    s.zuletzt = Date.now();

    // Jede Session bekommt einen eigenen Job: Die Extranonce steht im
    // Header, und state_root haengt am Kettenkopf. Ein geteilter Job waere
    // fuer beide falsch.
    const job: MiningJob = this.mining.createJob(s.address, s.extranonce);
    s.jobId = job.jobId;

    return {
      jobId: job.jobId,
      height: job.height,
      version: job.version,
      prevHash: job.prevHash,
      merkleRoot: job.merkleRoot,
      stateRoot: job.stateRoot,
      timestamp: job.timestamp,
      difficulty: job.difficulty,
      txCount: job.txCount,
      extranonce: job.extranonce,
      // Der Miner rechnet gegen das SHARE-Ziel, nicht gegen das Blockziel.
      // Sonst saehe er stundenlang keinen Treffer und wuesste nicht, ob er
      // ueberhaupt arbeitet.
      target: toHex(zielBytes(zielAus(s.shareDifficulty))),
      shareDifficulty: s.shareDifficulty.toString(),
    };
  }

  // ------------------------------------------------------------------- Share

  private share(b: Record<string, unknown>): Record<string, unknown> {
    const s = this.sessions.get(String(b.sessionId));
    if (!s) return { accepted: false, reason: 'session_inactive' };
    s.zuletzt = Date.now();

    const jobId = String(b.jobId);
    if (s.jobId !== jobId) {
      // Fremde Jobs abweisen: Sonst koennten zwei Sessions dieselbe Nonce
      // auf denselben Job einreichen und beide gutgeschrieben bekommen.
      return { accepted: false, reason: 'job_foreign' };
    }

    let nonce: bigint;
    try { nonce = BigInt(String(b.nonce)); }
    catch { return { accepted: false, reason: 'malformed' }; }

    const netzDifficulty = BigInt(this.chain.tip()?.difficulty ?? 0n);
    const r = this.mining.submitNonce(jobId, nonce);

    if (!r.ok) {
      s.abgelehnt++;
      return { accepted: false, reason: r.grund, detail: r.detail };
    }

    if (r.block) {
      s.angenommen++;
      this.nachShare(s);
      this.mining.invalidate();
      this.onBlock?.(r.height, r.hash, s.addressHex);
      // Nicht abwarten: Der Miner soll seine Antwort sofort bekommen, die
      // Weitergabe darf ihn nicht aufhalten.
      void this.weitergeben(r.hash);
      return {
        accepted: true, block: true,
        height: r.height, reward: r.reward, hash: r.hash,
        credited: s.shareDifficulty.toString(),
        shareDifficulty: s.shareDifficulty.toString(),
        achieved: (netzDifficulty > 0n ? netzDifficulty : s.shareDifficulty).toString(),
        required: s.shareDifficulty.toString(),
        blockDifficulty: netzDifficulty.toString(),
      };
    }

    // Kein Block. Reicht es fuer einen Share?
    const erreicht = BigInt(r.achieved);
    if (erreicht < s.shareDifficulty) {
      s.abgelehnt++;
      return {
        accepted: false, reason: 'low_difficulty',
        achieved: erreicht.toString(),
        required: s.shareDifficulty.toString(),
        blockDifficulty: netzDifficulty.toString(),
      };
    }

    s.angenommen++;
    const vorher = s.shareDifficulty;
    this.nachShare(s);

    return {
      accepted: true, block: false,
      credited: vorher.toString(),
      shareDifficulty: s.shareDifficulty.toString(),
      achieved: erreicht.toString(),
      required: vorher.toString(),
      blockDifficulty: netzDifficulty.toString(),
    };
  }

  /**
   * Share-Ziel nachfuehren.
   *
   * Angestrebt wird ein Share alle 30 Sekunden. Gemessen wird ueber die
   * letzten acht, nicht ueber den einzelnen Abstand: Die Abstaende sind
   * exponentialverteilt, und wer auf jeden einzelnen reagiert, bringt das
   * Ziel zum Schwingen statt es einzuregeln. Diesen Fehler hatten wir in
   * der ersten Fassung schon einmal.
   */
  private nachShare(s: Session): void {
    const jetzt = Date.now();
    s.letzteShares.push(jetzt);
    if (s.letzteShares.length > 9) s.letzteShares.shift();

    const abstand = this.mittlererAbstand(s);
    if (abstand === null) return;

    const faktor = SHARE_ZIEL_SEKUNDEN / abstand;
    // Totzone: Kleine Abweichungen nicht nachregeln.
    if (faktor > 0.6 && faktor < 1.6) return;

    const gedeckelt = Math.max(0.25, Math.min(4, faktor));
    let neu = BigInt(Math.max(1, Math.round(Number(s.shareDifficulty) * gedeckelt)));
    if (neu < 1n) neu = 1n;
    s.shareDifficulty = neu;
  }

  private mittlererAbstand(s: Session): number | null {
    if (s.letzteShares.length < 3) return null;
    const erste = s.letzteShares[0];
    const letzte = s.letzteShares[s.letzteShares.length - 1];
    return (letzte - erste) / 1000 / (s.letzteShares.length - 1);
  }

  /**
   * Einen gefundenen Block nach oben reichen.
   *
   * Der Block wird aus der eigenen Ablage gelesen, nicht aus dem
   * Arbeitsspeicher -- so geht genau das hinaus, was lokal geprueft und
   * festgeschrieben wurde.
   */
  private async weitergeben(hashHex: string): Promise<void> {
    if (!this.upstream) return;
    const gespeichert = this.store.get(fromHex(hashHex));
    if (!gespeichert) {
      this.onUpstream?.({ ok: false, grund: 'lokal nicht gefunden' });
      return;
    }
    try {
      const res = await fetch(`${this.upstream}/api/v2/block`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: toHex(gespeichert.body) }),
      });
      const body = await res.json().catch(() => ({}));
      this.onUpstream?.(body.accepted
        ? { ok: true, hoehe: body.height }
        : { ok: false, grund: body.detail ?? body.reason ?? `HTTP ${res.status}` });
    } catch (e) {
      this.onUpstream?.({ ok: false, grund: String((e as Error).message) });
    }
  }

  private aufraeumen(): void {
    const grenze = Date.now() - SESSION_TIMEOUT_MS;
    for (const [id, s] of this.sessions) {
      if (s.zuletzt < grenze) this.sessions.delete(id);
    }
  }

  // ---------------------------------------------------------------- Auskunft

  private summary(): Record<string, unknown> {
    const tip = this.chain.tip();
    const hoehe = tip?.height ?? -1;
    return {
      token: { token_name: 'YSKAR', token_symbol: 'YSR', decimals: 8 },
      height: tip ? tip.height : null,
      nextHeight: hoehe + 1,
      difficulty: tip ? Number(tip.difficulty) : null,
      hashrate: this.gesamtHashrate() || null,
      targetBlockTime: Number(TARGET_BLOCK_TIME),
      tipHash: tip ? toHex(tip.hash) : null,
      stateHeight: this.chain.height(),
      stateRoot: tip ? toHex(stateRoot(this.chain.state())) : null,
      totalSupply: totalSupply(this.chain.state()).toString(),
      maxSupply: MAX_SUPPLY.toString(),
      nextReward: rewardAt(hoehe + 1).toString(),
      mempool: this.pool.size(),
      activeMiners: new Set([...this.sessions.values()].map(s => s.addressHex)).size,
    };
  }

  private status(): Record<string, unknown> {
    const tip = this.chain.tip();
    return {
      network: this.params.network,
      height: tip?.height ?? null,
      bestBlock: tip ? toHex(tip.hash) : null,
      chainWork: tip ? tip.chainWork.toString() : '0',
      difficulty: tip ? Number(tip.difficulty) : null,
      blocksStored: this.store.count(),
      tips: this.store.tips().length,
      mempool: this.pool.size(),
      sessions: this.aktiveSessions(),
      openJobs: this.mining.offeneJobs(),
    };
  }
}

const zielAus = (difficulty: bigint) => (1n << 240n) / (difficulty > 0n ? difficulty : 1n);

function zielBytes(ziel: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = ziel;
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
