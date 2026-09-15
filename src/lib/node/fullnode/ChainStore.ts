/**
 * Lokaler Blockspeicher.
 *
 * Das ist der Punkt, an dem YSKAR aufhoert, Supabase zu glauben. Alles, was
 * hier liegt, hat dieser Knoten selbst geprueft.
 *
 * WARUM NICHT DATEIEN WIE BEIM BEOBACHTER: Der Beobachter kennt nur eine
 * Kette und legt Bloecke nach Hoehe ab. Ein Full Node muss MEHRERE Bloecke
 * auf derselben Hoehe halten koennen -- sonst kann er eine Gabelung nicht
 * einmal darstellen, geschweige denn aufloesen. Dafuer braucht es Abfragen:
 * "alle Bloecke mit diesem Vorgaenger", "der Tip mit der meisten Arbeit",
 * "der gemeinsame Vorfahr zweier Zweige".
 *
 * WARUM node:sqlite: Seit Node 22 eingebaut. Kein natives Modul, kein
 * Kompilieren auf dem Raspberry, keine Abhaengigkeit, die in zwei Jahren
 * nicht mehr baut. Eine Datei, die man kopieren und sichern kann.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { NETWORK, CHAIN_ID } from '../../core/params.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import { workToBytes, workFromBytes, compareTips, type Tip } from './ChainWork.ts';

/** Fassung des Ablageformats. Aendert es sich, muss neu aufgebaut werden. */
export const STORE_VERSION = 1;

export type BlockStatus = 'valid' | 'invalid';

export interface StoredBlock {
  hash: Uint8Array;
  height: number;
  prevHash: Uint8Array;
  chainWork: bigint;
  difficulty: bigint;
  blockTime: bigint;
  merkleRoot: Uint8Array;
  stateRoot: Uint8Array;
  txCount: number;
  body: Uint8Array;
  status: BlockStatus;
  mainChain: boolean;
}

export interface Snapshot {
  hash: Uint8Array;
  height: number;
  stateRoot: Uint8Array;
  accounts: [string, { balance: bigint; nonce: bigint }][];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  hash        BLOB PRIMARY KEY,
  height      INTEGER NOT NULL,
  prev_hash   BLOB    NOT NULL,
  -- 32 Byte Big-Endian, damit SQLite direkt danach sortieren kann.
  chain_work  BLOB    NOT NULL,
  difficulty  TEXT    NOT NULL,
  block_time  INTEGER NOT NULL,
  merkle_root BLOB    NOT NULL,
  state_root  BLOB    NOT NULL,
  tx_count    INTEGER NOT NULL,
  body        BLOB    NOT NULL,
  status      TEXT    NOT NULL,
  main_chain  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS blocks_height   ON blocks(height);
CREATE INDEX IF NOT EXISTS blocks_prev     ON blocks(prev_hash);
CREATE INDEX IF NOT EXISTS blocks_main     ON blocks(main_chain, height);
CREATE INDEX IF NOT EXISTS blocks_bestwork ON blocks(status, chain_work DESC);

-- Zustandsmarken. Ohne sie muesste nach jedem Reorg und jedem Neustart die
-- gesamte Kette neu gerechnet werden.
CREATE TABLE IF NOT EXISTS snapshots (
  hash       BLOB PRIMARY KEY,
  height     INTEGER NOT NULL,
  state_root BLOB NOT NULL,
  accounts   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_height ON snapshots(height);
`;

export class ChainStore {
  private db: DatabaseSync;

  constructor(pfad: string) {
    if (pfad !== ':memory:') mkdirSync(dirname(pfad), { recursive: true });
    this.db = new DatabaseSync(pfad);

    // WAL: Lesen blockiert Schreiben nicht. Bei einem Knoten, der gleichzeitig
    // synchronisiert und Abfragen beantwortet, ist das der Unterschied
    // zwischen "laeuft" und "haengt".
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA);

    this.pruefeIdentitaet();
  }

  /**
   * Netz und Kette festnageln.
   *
   * Eine Ablage, die einmal fuer yskar-main-1 angelegt wurde, darf nie mit
   * Bloecken einer anderen Kette weiterbenutzt werden. Das faellt sonst erst
   * auf, wenn der State Root nicht mehr passt -- und dann ist unklar, ob der
   * Fehler im Code oder in den Daten steckt.
   */
  private pruefeIdentitaet(): void {
    const erwartet: Record<string, string> = {
      network: NETWORK,
      chain_id: toHex(CHAIN_ID),
      store_version: String(STORE_VERSION),
    };
    for (const [key, wert] of Object.entries(erwartet)) {
      const vorhanden = this.meta(key);
      if (vorhanden === null) this.setMeta(key, wert);
      else if (vorhanden !== wert) {
        throw new Error(
          `Diese Ablage gehoert zu ${key}=${vorhanden}, erwartet wird ${wert}. ` +
          `Falscher Datenordner oder veraltetes Format.`);
      }
    }
  }

  meta(key: string): string | null {
    const zeile = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      { value: string } | undefined;
    return zeile ? zeile.value : null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  // ------------------------------------------------------------- Bloecke

  put(b: StoredBlock): void {
    this.db.prepare(`
      INSERT INTO blocks (hash, height, prev_hash, chain_work, difficulty,
                          block_time, merkle_root, state_root, tx_count,
                          body, status, main_chain)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(hash) DO UPDATE SET
        status = excluded.status, main_chain = excluded.main_chain
    `).run(
      b.hash, b.height, b.prevHash, workToBytes(b.chainWork),
      b.difficulty.toString(), Number(b.blockTime),
      b.merkleRoot, b.stateRoot, b.txCount, b.body,
      b.status, b.mainChain ? 1 : 0);
  }

  get(hash: Uint8Array): StoredBlock | null {
    const z = this.db.prepare('SELECT * FROM blocks WHERE hash = ?').get(hash);
    return z ? zuBlock(z as Record<string, unknown>) : null;
  }

  has(hash: Uint8Array): boolean {
    return this.db.prepare('SELECT 1 FROM blocks WHERE hash = ?').get(hash) !== undefined;
  }

  /** Alle bekannten Nachfolger eines Blocks -- die Verzweigungen. */
  children(hash: Uint8Array): StoredBlock[] {
    const zeilen = this.db.prepare('SELECT * FROM blocks WHERE prev_hash = ?').all(hash);
    return zeilen.map(z => zuBlock(z as Record<string, unknown>));
  }

  /** Alle Bloecke einer Hoehe. Mehr als einer bedeutet eine Gabelung. */
  atHeight(height: number): StoredBlock[] {
    const zeilen = this.db.prepare('SELECT * FROM blocks WHERE height = ?').all(height);
    return zeilen.map(z => zuBlock(z as Record<string, unknown>));
  }

  /** Block der aktiven Kette auf dieser Hoehe. */
  mainAt(height: number): StoredBlock | null {
    const z = this.db.prepare(
      'SELECT * FROM blocks WHERE height = ? AND main_chain = 1').get(height);
    return z ? zuBlock(z as Record<string, unknown>) : null;
  }

  /** Kopf der aktiven Kette. */
  mainTip(): StoredBlock | null {
    const z = this.db.prepare(
      'SELECT * FROM blocks WHERE main_chain = 1 ORDER BY height DESC LIMIT 1').get();
    return z ? zuBlock(z as Record<string, unknown>) : null;
  }

  /**
   * Der gueltige Block mit der meisten Arbeit -- unabhaengig davon, ob er
   * gerade zur aktiven Kette gehoert. Genau hier entscheidet sich, ob ein
   * Reorg noetig ist.
   */
  bestTip(): StoredBlock | null {
    const zeilen = this.db.prepare(`
      SELECT * FROM blocks WHERE status = 'valid'
      ORDER BY chain_work DESC LIMIT 8`).all();
    if (zeilen.length === 0) return null;

    // SQLite sortiert nach Arbeit. Bei Gleichstand entscheidet der Hash --
    // das kann SQL nicht in derselben Ordnung, also hier.
    let bester = zuBlock(zeilen[0] as Record<string, unknown>);
    for (const z of zeilen.slice(1)) {
      const k = zuBlock(z as Record<string, unknown>);
      if (compareTips(alsTip(k), alsTip(bester)) > 0) bester = k;
    }
    return bester;
  }

  /** Alle gueltigen Tips: Bloecke ohne bekannten Nachfolger. */
  tips(): StoredBlock[] {
    const zeilen = this.db.prepare(`
      SELECT b.* FROM blocks b
      WHERE b.status = 'valid'
        AND NOT EXISTS (SELECT 1 FROM blocks c WHERE c.prev_hash = b.hash)
      ORDER BY b.chain_work DESC`).all();
    return zeilen.map(z => zuBlock(z as Record<string, unknown>));
  }

  setMainChain(hash: Uint8Array, an: boolean): void {
    this.db.prepare('UPDATE blocks SET main_chain = ? WHERE hash = ?')
      .run(an ? 1 : 0, hash);
  }

  setStatus(hash: Uint8Array, status: BlockStatus): void {
    this.db.prepare('UPDATE blocks SET status = ? WHERE hash = ?').run(status, hash);
  }

  height(): number {
    const tip = this.mainTip();
    return tip ? tip.height : -1;
  }

  count(): number {
    const z = this.db.prepare('SELECT COUNT(*) AS n FROM blocks').get() as { n: number };
    return z.n;
  }

  // -------------------------------------------------------- Zustandsmarken

  putSnapshot(s: Snapshot): void {
    this.db.prepare(`
      INSERT INTO snapshots (hash, height, state_root, accounts) VALUES (?,?,?,?)
      ON CONFLICT(hash) DO UPDATE SET accounts = excluded.accounts
    `).run(s.hash, s.height, s.stateRoot,
      JSON.stringify(s.accounts.map(([a, k]) =>
        [a, k.balance.toString(), k.nonce.toString()])));
  }

  getSnapshot(hash: Uint8Array): Snapshot | null {
    const z = this.db.prepare('SELECT * FROM snapshots WHERE hash = ?').get(hash) as
      Record<string, unknown> | undefined;
    return z ? zuSnapshot(z) : null;
  }

  /**
   * Die juengste Marke auf der aktiven Kette, die nicht hoeher als `height`
   * liegt. Ausgangspunkt fuer das Nachrechnen nach einem Reorg.
   */
  snapshotAtOrBelow(height: number): Snapshot | null {
    const z = this.db.prepare(`
      SELECT s.* FROM snapshots s
      JOIN blocks b ON b.hash = s.hash
      WHERE s.height <= ? AND b.main_chain = 1
      ORDER BY s.height DESC LIMIT 1`).get(height) as Record<string, unknown> | undefined;
    return z ? zuSnapshot(z) : null;
  }

  /** Marken oberhalb einer Hoehe verwerfen -- sie gehoeren zu einem Zweig,
   *  der nicht mehr gilt. */
  dropSnapshotsAbove(height: number): void {
    this.db.prepare('DELETE FROM snapshots WHERE height > ?').run(height);
  }

  /** Alte Marken ausduennen, die juengsten behalten. */
  pruneSnapshots(behalten: number): void {
    this.db.prepare(`
      DELETE FROM snapshots WHERE height NOT IN (
        SELECT height FROM snapshots ORDER BY height DESC LIMIT ?)`).run(behalten);
  }

  transaktion<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  close(): void { this.db.close(); }
}

// ------------------------------------------------------------- Umwandlung

function alsBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string') return fromHex(v);
  throw new Error('Bytefeld hat unerwarteten Typ: ' + typeof v);
}

function zuBlock(z: Record<string, unknown>): StoredBlock {
  return {
    hash: alsBytes(z.hash),
    height: Number(z.height),
    prevHash: alsBytes(z.prev_hash),
    chainWork: workFromBytes(alsBytes(z.chain_work)),
    difficulty: BigInt(String(z.difficulty)),
    blockTime: BigInt(Number(z.block_time)),
    merkleRoot: alsBytes(z.merkle_root),
    stateRoot: alsBytes(z.state_root),
    txCount: Number(z.tx_count),
    body: alsBytes(z.body),
    status: String(z.status) as BlockStatus,
    mainChain: Number(z.main_chain) === 1,
  };
}

function zuSnapshot(z: Record<string, unknown>): Snapshot {
  const roh = JSON.parse(String(z.accounts)) as [string, string, string][];
  return {
    hash: alsBytes(z.hash),
    height: Number(z.height),
    stateRoot: alsBytes(z.state_root),
    accounts: roh.map(([a, b, n]) => [a, { balance: BigInt(b), nonce: BigInt(n) }]),
  };
}

export function alsTip(b: StoredBlock): Tip {
  return { hash: b.hash, height: b.height, chainWork: b.chainWork };
}
