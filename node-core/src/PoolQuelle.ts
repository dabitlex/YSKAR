/*
 * Arbeit von einem Pool holen.
 *
 * Solo holen die eingebauten Miner ihre Arbeit beim eigenen Knoten
 * (MiningCoordinator). Im Pool kommt sie vom Pool-Knoten -- ueber dieselbe
 * Schnittstelle, die auch die App und der Kommandozeilen-Miner benutzen:
 *
 *   POST /session        anmelden, Modus "pool"
 *   GET  /job            Arbeit mit SHARE-Ziel
 *   POST /share          Treffer einreichen
 *   POST /session/stop   abmelden, der Platz wird frei
 *
 * Diese Klasse sieht fuer die Miner aus wie der MiningCoordinator: createJob()
 * und submitNonce(). Nur dass beides hier ueber das Netz geht.
 *
 * JE GERAET EINE SITZUNG. Prozessor und Grafikkarte bekommen eigene
 * Sitzungen und damit eigene Extranonces -- sonst durchsuchten beide
 * denselben Nonce-Raum. Fuer den Pool zaehlen sie als EIN Miner: Gezaehlt
 * werden Adressen, nicht Geraete.
 *
 * DER POOL IST EIN FREMDER RECHNER. Was er antwortet, wird Feld fuer Feld
 * geprueft, bevor es an einen Worker oder an das GPU-Programm geht. Ein Pool
 * kann den Miner fuer nichts rechnen lassen -- das kann jeder Pool, und man
 * sieht es an den ausbleibenden Auszahlungen in der Kette. Mehr kann er
 * nicht: Er bekommt die Adresse und Nonces, sonst nichts.
 */
import { encodeAddress } from '../../src/lib/core/address.ts';
import { standAusAntwort, poolBasis, type PoolEintrag, type PoolStand } from '../../src/lib/pool/verzeichnis.ts';
import type { MiningJob, SubmitResult } from '../../src/lib/node/fullnode/MiningCoordinator.ts';

/** Woher ein Miner seine Arbeit bekommt -- der eigene Knoten oder ein Pool. */
export interface Arbeitsquelle {
  createJob(adresse: Uint8Array, extranonce: bigint, extra?: Uint8Array): MiningJob | Promise<MiningJob>;
  submitNonce(jobId: string, nonce: bigint): Einreichung | Promise<Einreichung>;
}

/** Antwort auf einen eingereichten Treffer. `neuerJob`: Das Share-Ziel hat sich geaendert. */
export type Einreichung = SubmitResult & { neuerJob?: boolean };

const WARTEN_MS = 10_000;
/** Mehr liest der Miner von keiner Antwort eines Pools. */
const ANTWORT_MAX = 64 * 1024;
const HEADER_BYTES = 136;

/** Der Pool nimmt diesen Miner nicht (mehr) -- weiterversuchen hat keinen Sinn. */
export class PoolEndgueltig extends Error {
  code: string;
  constructor(code: string, text: string) { super(text); this.code = code; }
}

export interface PoolQuelleStand {
  angemeldet: boolean;
  angenommen: number;
  abgelehnt: number;
  bloecke: number;
  shareDifficulty: string | null;
  letzterShare: number | null;
  /** Hoehe, an der gerade gerechnet wird. */
  hoehe: number | null;
  /** Letzter Fehler beim Holen oder Einreichen; null, wenn zuletzt alles ging. */
  fehler: string | null;
}

interface Antwort { status: number; body: Record<string, unknown> }

/**
 * Eine Anfrage an einen Pool-Knoten.
 *
 * Keiner Umleitung wird gefolgt -- ein Pool, der woandershin zeigt, ist nicht
 * der gewaehlte. Gelesen werden hoechstens ANTWORT_MAX Byte.
 */
async function rufe(url: string, agent: string, rumpf: unknown | undefined, wartenMs: number): Promise<Antwort> {
  const res = await fetch(url, {
    method: rumpf === undefined ? 'GET' : 'POST',
    headers: { 'user-agent': agent, ...(rumpf === undefined ? {} : { 'content-type': 'application/json' }) },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf),
    signal: AbortSignal.timeout(wartenMs),
    redirect: 'error',
  });
  const teile: Uint8Array[] = [];
  let laenge = 0;
  if (res.body) {
    const leser = res.body.getReader();
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      laenge += value.length;
      if (laenge > ANTWORT_MAX) {
        try { await leser.cancel(); } catch { /* schon zu */ }
        throw new Error('Die Antwort des Pools ist zu groß.');
      }
      teile.push(value);
    }
  }
  let body: unknown = null;
  try { body = JSON.parse(Buffer.concat(teile).toString('utf8')); } catch { /* keine JSON-Antwort */ }
  return {
    status: res.status,
    body: (body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>,
  };
}

/** Adresse der Mining-Schnittstelle eines Pools. */
export function poolSchnittstelle(host: string): string {
  return poolBasis(host) + '/api/v2';
}

/**
 * Einen Pool nach seinem Stand fragen. Wirft nie: Keine oder eine kaputte
 * Antwort ergibt den Stand "aus". Mit `address` sagt der Pool, ob diese
 * Adresse schon einen Platz hat -- sie geht nur an den GEWAEHLTEN Pool.
 */
export async function fragePool(eintrag: PoolEintrag, agent: string,
                                opt: { address?: string | null; wartenMs?: number } = {}): Promise<PoolStand> {
  try {
    const frage = opt.address ? `?address=${encodeURIComponent(opt.address)}` : '';
    const r = await rufe(`${poolSchnittstelle(eintrag.host)}/pool${frage}`, agent, undefined, opt.wartenMs ?? 4_000);
    return standAusAntwort(eintrag, r.status, r.body);
  } catch {
    return standAusAntwort(eintrag, null, null);
  }
}

// ---------------------------------------------------------------- Pruefung

const hex = (x: unknown, zeichen: number): string => {
  if (typeof x !== 'string' || x.length !== zeichen || !/^[0-9a-f]+$/.test(x)) {
    throw new Error('Der Pool schickt unlesbare Arbeit.');
  }
  return x;
};

const ganz = (x: unknown, max: number): number => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d{1,10}$/.test(x) ? Number(x) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error('Der Pool schickt unlesbare Arbeit.');
  return n;
};

const gross = (x: unknown): bigint => {
  const s = typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? String(x) : x;
  if (typeof s !== 'string' || !/^\d{1,20}$/.test(s)) throw new Error('Der Pool schickt unlesbare Arbeit.');
  const n = BigInt(s);
  if (n > 0xffff_ffff_ffff_ffffn) throw new Error('Der Pool schickt unlesbare Arbeit.');
  return n;
};

const zahlText = (x: unknown): string | null =>
  typeof x === 'string' && /^\d{1,40}$/.test(x) ? x : null;

function bytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Aus den Feldern eines Jobs den Header bauen -- wie jeder Miner. Das Feld
 * `difficulty` ist das ROHE Header-Feld und kommt unveraendert an Stelle 112.
 */
function baueJob(j: Record<string, unknown>): MiningJob {
  if (typeof j.jobId !== 'string' || j.jobId.length < 1 || j.jobId.length > 128 || !/^[\x21-\x7e]+$/.test(j.jobId)) {
    throw new Error('Der Pool schickt unlesbare Arbeit.');
  }
  const version = ganz(j.version, 0xffff_ffff);
  const height = ganz(j.height, 0xffff_ffff);
  const prevHash = hex(j.prevHash, 64);
  const merkleRoot = hex(j.merkleRoot, 64);
  const stateRoot = hex(j.stateRoot, 64);
  const timestamp = gross(j.timestamp);
  const feld = ganz(j.difficulty, 0xffff_ffff);
  const txCount = ganz(j.txCount, 0xffff_ffff);
  const extranonce = gross(j.extranonce);
  const target = hex(j.target, 64);

  const header = new Uint8Array(HEADER_BYTES);
  const v = new DataView(header.buffer);
  v.setUint32(0, version, true);
  v.setUint32(4, height, true);
  header.set(bytes(prevHash), 8);
  header.set(bytes(merkleRoot), 40);
  header.set(bytes(stateRoot), 72);
  v.setBigUint64(104, timestamp, true);
  v.setUint32(112, feld, true);
  v.setUint32(116, txCount, true);
  v.setBigUint64(120, extranonce, true);
  // 128..135: die Nonce -- setzt der Miner ein.

  return {
    jobId: j.jobId, height, version, prevHash, merkleRoot, stateRoot,
    timestamp: timestamp.toString(), difficulty: feld,
    difficultyWert: zahlText(j.difficultyWert) ?? String(feld),
    txCount, extranonce: extranonce.toString(),
    header: Buffer.from(header).toString('hex'), target,
    erzeugt: Date.now(),
  };
}

// ------------------------------------------------------------------ Quelle

export class PoolQuelle implements Arbeitsquelle {
  private basis: string;
  private agent: string;
  private sitzung: string | null = null;
  private anmeldung: Promise<string> | null = null;
  private beendet = false;

  private angenommen = 0;
  private abgelehnt = 0;
  private bloecke = 0;
  private shareDifficulty: string | null = null;
  private letzterShare: number | null = null;
  private hoehe: number | null = null;
  private fehler: string | null = null;

  /** Der Job, den der Pool dieser Sitzung zuletzt gegeben hat. Er kennt nur diesen. */
  private aktuell: { jobId: string; ziel: string } | null = null;
  /** Laeuft gerade eine Anfrage nach neuer Arbeit? */
  private holt = 0;

  /** Wird gerufen, wenn der Pool endgueltig ablehnt (voll, kein Pool). */
  onEndgueltig?: (e: PoolEndgueltig) => void;

  /** `basis`: Adresse der Schnittstelle, etwa https://pool.example.org/api/v2 */
  constructor(basis: string, agent: string) {
    this.basis = basis.replace(/\/+$/, '');
    this.agent = agent;
  }

  stand(): PoolQuelleStand {
    return {
      angemeldet: this.sitzung !== null,
      angenommen: this.angenommen, abgelehnt: this.abgelehnt, bloecke: this.bloecke,
      shareDifficulty: this.shareDifficulty, letzterShare: this.letzterShare,
      hoehe: this.hoehe, fehler: this.fehler,
    };
  }

  private ruf(pfad: string, rumpf?: unknown): Promise<Antwort> {
    return rufe(this.basis + pfad, this.agent, rumpf, WARTEN_MS);
  }

  /**
   * Beim Pool anmelden. Laeuft schon eine Anmeldung, wird auf sie gewartet --
   * zwei gleichzeitige Aufrufe sollen nicht zwei Sitzungen oeffnen.
   */
  anmelden(adresse: Uint8Array): Promise<string> {
    if (this.beendet) return Promise.reject(new Error('Mining wurde gestoppt.'));
    if (this.sitzung) return Promise.resolve(this.sitzung);
    if (this.anmeldung) return this.anmeldung;
    this.anmeldung = (async () => {
      const r = await this.ruf('/session', { address: encodeAddress(adresse), mode: 'pool', platform: 'node-core' });
      const fehler = typeof r.body.error === 'string' ? r.body.error : null;
      if (fehler === 'pool_full') {
        throw new PoolEndgueltig('pool_full', 'Der Pool ist voll: Alle Plätze sind belegt.');
      }
      if (fehler === 'pool_unavailable' || (r.status === 200 && !fehler && r.body.mode !== 'pool')) {
        // Ein Knoten, der die Sitzung still als Solo fuehrt, teilt nichts.
        if (typeof r.body.sessionId === 'string') {
          void this.ruf('/session/stop', { sessionId: r.body.sessionId }).catch(() => {});
        }
        throw new PoolEndgueltig('pool_unavailable', 'Dieser Knoten betreibt keinen Pool.');
      }
      if (fehler === 'bad_address' || fehler === 'missing_address') {
        throw new PoolEndgueltig('bad_address', 'Der Pool nimmt diese Adresse nicht an.');
      }
      const id = r.body.sessionId;
      if (r.status !== 200 || typeof id !== 'string' || id.length < 1 || id.length > 128) {
        throw new Error(`Der Pool antwortet nicht wie erwartet (HTTP ${r.status}${fehler ? ', ' + fehler.slice(0, 40) : ''}).`);
      }
      if (this.beendet) {
        // Waehrend der Anmeldung gestoppt: gleich wieder abmelden.
        void this.ruf('/session/stop', { sessionId: id }).catch(() => {});
        throw new Error('Mining wurde gestoppt.');
      }
      this.sitzung = id;
      this.shareDifficulty = zahlText(r.body.shareDifficulty) ?? this.shareDifficulty;
      return id;
    })().finally(() => { this.anmeldung = null; });
    return this.anmeldung;
  }

  async createJob(adresse: Uint8Array): Promise<MiningJob> {
    this.holt++;
    try {
      let sitzung = await this.anmelden(adresse);
      let r = await this.ruf('/job?session=' + encodeURIComponent(sitzung));
      if (r.body.error === 'session_inactive') {
        // Der Pool hat die Sitzung vergessen (Neustart dort, lange Pause hier).
        this.sitzung = null;
        sitzung = await this.anmelden(adresse);
        r = await this.ruf('/job?session=' + encodeURIComponent(sitzung));
      }
      if (r.status !== 200 || typeof r.body.jobId !== 'string') {
        const grund = typeof r.body.error === 'string' ? ', ' + r.body.error.slice(0, 40) : '';
        throw new Error(`Der Pool gibt keine Arbeit (HTTP ${r.status}${grund}).`);
      }
      const job = baueJob(r.body);
      const ziel = zahlText(r.body.shareDifficulty) ?? '';
      if (ziel) this.shareDifficulty = ziel;
      this.aktuell = { jobId: job.jobId, ziel };
      this.hoehe = job.height;
      this.fehler = null;
      return job;
    } catch (e) {
      this.fehler = (e as Error).message;
      if (e instanceof PoolEndgueltig) this.onEndgueltig?.(e);
      throw e;
    } finally {
      this.holt--;
    }
  }

  async submitNonce(jobId: string, nonce: bigint): Promise<Einreichung> {
    // Der Pool kennt je Sitzung nur den letzten Job. Ein Treffer auf einem
    // aelteren wuerde abgewiesen -- den Weg ueber das Netz kann er sich sparen.
    if (!this.sitzung || this.aktuell?.jobId !== jobId) return { ok: false, grund: 'job_ersetzt' };
    const gegen = this.aktuell;
    let r: Antwort;
    try {
      r = await this.ruf('/share', { sessionId: this.sitzung, jobId, nonce: nonce.toString() });
    } catch (e) {
      // Nicht angekommen oder Antwort verloren: Der Treffer ist weg, die
      // Arbeit geht weiter. Kein neuer Job -- der alte gilt noch.
      this.fehler = (e as Error).message;
      return { ok: false, grund: 'job_ersetzt' };
    }
    const b = r.body;
    if (b.accepted !== true) {
      const grund = typeof b.reason === 'string' ? b.reason.slice(0, 40) : `http_${r.status}`;
      if (grund === 'session_inactive') this.sitzung = null;
      const veraltet = ['session_inactive', 'job_foreign', 'stale_job', 'job_unknown', 'job_expired'].includes(grund);
      if (!veraltet) { this.abgelehnt++; return { ok: false, grund }; }
      // Veraltete Arbeit ist kein Fehler des Miners. Ist neue schon da oder
      // unterwegs, braucht es keine weitere Anfrage.
      const ersetzt = this.holt > 0 || this.aktuell !== gegen;
      return { ok: false, grund: ersetzt ? 'job_ersetzt' : 'stale_job' };
    }

    this.angenommen++;
    this.letzterShare = Date.now();
    this.fehler = null;
    const neu = zahlText(b.shareDifficulty);
    const geaendert = neu !== null && neu !== gegen.ziel;
    if (neu !== null) this.shareDifficulty = neu;
    const erreicht = zahlText(b.achieved) ?? '0';

    if (b.block === true) {
      this.bloecke++;
      return {
        ok: true, block: true,
        height: typeof b.height === 'number' && Number.isInteger(b.height) ? b.height : (this.hoehe ?? 0),
        hash: typeof b.hash === 'string' && /^[0-9a-f]{64}$/.test(b.hash) ? b.hash : '',
        reward: zahlText(b.reward) ?? '0',
        neuerJob: true,
      };
    }
    return { ok: true, block: false, achieved: erreicht, neuerJob: geaendert };
  }

  /** Abmelden -- der Platz im Pool wird sofort frei. */
  async beenden(): Promise<void> {
    this.beendet = true;
    if (this.anmeldung) { try { await this.anmeldung; } catch { /* meldet sich selbst ab */ } }
    const s = this.sitzung;
    this.sitzung = null;
    this.aktuell = null;
    if (s) { try { await this.ruf('/session/stop', { sessionId: s }); } catch { /* der Pool raeumt selbst auf */ } }
  }
}
