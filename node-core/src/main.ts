/*
 * YSKAR Node Core.
 *
 * Ein voller Knoten mit eingebautem Mining und einer Oberflaeche, die als
 * lokale Seite aus dem Ordner ui/ kommt und von einer Desktop-Huelle
 * (Electron) in einem eigenen Fenster gezeigt wird. Der Knoten laeuft im
 * selben Prozess und verwendet ausschliesslich die Knotenklassen aus src/.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../../src/lib/node/fullnode/MiningServer.ts';
import { NetzStatistik, type LokaleStatistik } from '../../src/lib/node/fullnode/NetzStatistik.ts';
import { ReadApi } from '../../src/lib/node/fullnode/ReadApi.ts';
import { EPOCH_BLOCKS, rewardAt } from '../../src/lib/core/params.ts';
import { txid } from '../../src/lib/core/tx.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { PeerManager } from '../../src/lib/node/p2p/PeerManager.ts';
import type { PeerConnection } from '../../src/lib/node/p2p/PeerConnection.ts';
import { SyncManager } from '../../src/lib/node/p2p/SyncManager.ts';
import { STATS_FAEHIG, encodeStats, decodeStats } from '../../src/lib/node/p2p/messages.ts';
import { MAINNET, type ConsensusParams } from '../../src/lib/core/networks.ts';
import { stateRoot, totalSupply } from '../../src/lib/core/state.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { isValidAddress, decodeAddress } from '../../src/lib/core/address.ts';
import { cpus } from 'node:os';
import { LocalMiner } from './LocalMiner.ts';
import { GpuMiner, erkenneGpu, type GpuErkennung } from './GpuMiner.ts';
import { nameToExtra, finderName, MAX_FINDER_BYTES } from '../../src/lib/chain/finderName.ts';

/**
 * Mining-Einstellungen.
 *
 * In einer EIGENEN Datei neben config.json, nicht darin: Die bestehende
 * Konfiguration (Datenordner, Ports, Seed) wird damit nicht angefasst, und
 * ein Fehler hier kann den Knotenstart nicht verhindern.
 */
type MiningModus = 'cpu' | 'gpu' | 'beide';
interface MiningEinstellung {
  address: string;
  mode: MiningModus;
  cpuWorkers: number;
  cpuIntensity: number;
  gpuDevice: number;
  /**
   * Name, mit dem dieser Knoten in seinen Bloecken steht.
   *
   * Landet im extra-Feld der Coinbase und ist damit fuer immer Teil des
   * Blocks. Leer heisst: kein Name, der Explorer zeigt "Unbekannt".
   *
   * Nur fuer Bloecke, die dieser Knoten fuer SEINE EIGENEN Miner baut.
   * Fremde Solo-Miner ueber die Mining-Schnittstelle bekommen ihn nicht --
   * ihre Bloecke gehoeren nicht diesem Knoten.
   */
  blockName: string;
}

export const VERSION = '0.4.0';
/**
 * Stand der Konsensregeln, die dieses Programm kennt (docs/CONSENSUS_V*.md).
 * Nur fuer die Anzeige -- die Regeln selbst stehen in src/lib/core.
 */
const KONSENSFASSUNG = 4;
const GUI_PORT = 8650;
/** So oft meldet der Knoten seinen Peers, wer bei ihm mint. */
const STATS_TAKT_MS = 30_000;
/**
 * So lange gilt eine Angabe der Peers, der Knoten liege zurueck, ohne dass
 * ein Block ankommt. Danach zaehlt sie nicht mehr -- siehe miningBereit().
 */
const SYNC_GEDULD_MS = 120_000;
/**
 * Eine neue ausgehende Verbindung zaehlt hoechstens so oft als Fortschritt.
 * Sonst hielte ein Peer, der die Verbindung immer wieder abreissen laesst,
 * die Geduld beliebig lange wach.
 */
const AUSGEHEND_ZAEHLT_ALLE_MS = 600_000;
/** Name des Kopffelds, in dem die Oberflaeche ihren Zugangsschluessel schickt. */
const TOKEN_KOPF = 'x-yskar-token';
/** Platzhalter in der ausgelieferten Seite -- wird je Start ersetzt. */
const TOKEN_PLATZ = '__YSKAR_ZUGANG__';
const DEFAULT_NODE_PORT = 8645;
const DEFAULT_P2P_PORT = 8646;
const DEFAULT_SEED = 'yskar-main.dynv6.net:8646';

function defaultDataDir(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'YSKAR', 'Node');
  }
  return join(homedir(), '.yskar', 'node');
}

function json(res: ServerResponse, value: unknown, status = 200): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/*
 * Die Oberflaeche darf in keine fremde Seite eingebettet werden und laedt
 * nichts von aussen. Skripte, Stile und Schriften kommen nur aus den eigenen
 * Dateien -- eingebettete Skripte sind nicht erlaubt.
 */
const SCHUTZKOPF = {
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; " +
    "connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; " +
    "frame-ancestors 'none'",
};

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...SCHUTZKOPF,
  });
  res.end(body);
}

// ------------------------------------------------------- Dateien der Oberflaeche

const HIER = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

/** Im gebauten Programm liegt ui/ neben dem Bundle, beim Entwickeln eine Ebene hoeher. */
function findeOrdner(kandidaten: string[]): string | null {
  return kandidaten.find(k => existsSync(k)) ?? null;
}
const UI_ORDNER = findeOrdner([join(HIER, 'ui'), join(HIER, '..', 'ui')]);
/*
 * Die Schriften sind dieselben wie auf der Webseite. Der Bau kopiert sie
 * nach ui/fonts; beim Entwickeln kommen sie direkt aus website/assets/fonts,
 * damit sie nicht zweimal im Repository liegen.
 */
const SCHRIFT_ORDNER = findeOrdner([
  join(HIER, 'ui', 'fonts'),
  join(HIER, '..', 'ui', 'fonts'),
  join(HIER, '..', '..', 'website', 'assets', 'fonts'),
]);

const DATEITYP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Eine Datei der Oberflaeche lesen. `pfad` beginnt mit /ui/.
 *
 * Nur bekannte Dateitypen, nur aus den beiden Ordnern, und nie ueber sie
 * hinaus: Ein Pfad mit ".." endet ausserhalb und wird abgewiesen.
 */
function uiDatei(pfad: string): { typ: string; inhalt: Buffer } | null {
  const typ = DATEITYP[extname(pfad).toLowerCase()];
  if (!typ) return null;
  let teil: string;
  try { teil = decodeURIComponent(pfad.slice('/ui/'.length)); } catch { return null; }
  if (teil.includes('\0')) return null;
  const inSchrift = teil.startsWith('fonts/');
  const wurzel = inSchrift ? SCHRIFT_ORDNER : UI_ORDNER;
  if (!wurzel) return null;
  const ziel = resolve(wurzel, inSchrift ? teil.slice('fonts/'.length) : teil);
  if (ziel !== wurzel && !ziel.startsWith(resolve(wurzel) + sep)) return null;
  try {
    if (!statSync(ziel).isFile()) return null;
    return { typ, inhalt: readFileSync(ziel) };
  } catch { return null; }
}

/*
 * Rumpf einer Anfrage lesen.
 *
 * Ein Rumpf muss als JSON ausgewiesen sein. Ein Formular oder ein
 * "text/plain"-Aufruf aus einer fremden Webseite kommt ohne Vorabfrage des
 * Browsers an -- genau diese Aufrufe sollen hier nicht als Befehl gelten.
 */
function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const typ = String(req.headers['content-type'] ?? '').toLowerCase();
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 65536) {
        req.destroy();
        reject(new Error('Anfrage zu groß'));
      }
    });
    req.on('end', () => {
      if (raw && !typ.startsWith('application/json')) {
        reject(new Error('Inhaltstyp muss application/json sein.'));
        return;
      }
      try {
        const wert: unknown = raw ? JSON.parse(raw) : {};
        if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) {
          reject(new Error('Ungültiges JSON'));
          return;
        }
        resolveBody(wert as Record<string, unknown>);
      }
      catch { reject(new Error('Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

/**
 * Mining-Schnittstelle des Node Core.
 *
 * Die eingebauten Miner haengen an keiner Sitzung der Schnittstelle -- sie
 * holen ihre Arbeit direkt beim Koordinator. Ohne diese Ergaenzung fehlten
 * sie in der Statistik: Weder dieser Knoten noch seine Peers wuessten, dass
 * hier jemand mint.
 */
class KernServer extends MiningServer {
  intern: (() => LokaleStatistik | null) | null = null;

  lokaleStatistik(): LokaleStatistik {
    const l = super.lokaleStatistik();
    const i = this.intern?.() ?? null;
    if (!i) return l;
    return {
      adressen: [...new Set([...l.adressen, ...i.adressen])],
      hashrate: l.hashrate + i.hashrate,
      sessions: l.sessions + i.sessions,
    };
  }
}

/** Mittlerer Wert -- ein einzelner Peer mit falscher Angabe verschiebt ihn nicht. */
function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/**
 * Einstellungen des Programms -- alles, was nicht den Knoten selbst betrifft.
 *
 * In einer eigenen Datei neben config.json. Jedes Feld wird einzeln
 * geprueft: Eine beschaedigte oder aeltere Datei darf den Start nicht
 * verhindern und nichts Unzulaessiges einschleusen.
 */
export interface Einstellungen {
  sprache: 'de' | 'en';
  /** Den Knoten beim Oeffnen des Programms sofort starten. */
  knotenSofort: boolean;
}

const VORGABE_EINSTELLUNGEN: Einstellungen = { sprache: 'de', knotenSofort: true };

function pruefeEinstellungen(roh: unknown, basis: Einstellungen): Einstellungen {
  const e = { ...basis };
  if (roh === null || typeof roh !== 'object') return e;
  const r = roh as Record<string, unknown>;
  if (r.sprache === 'de' || r.sprache === 'en') e.sprache = r.sprache;
  if (typeof r.knotenSofort === 'boolean') e.knotenSofort = r.knotenSofort;
  return e;
}

function ladeEinstellungen(pfad: string): Einstellungen {
  if (!existsSync(pfad)) return { ...VORGABE_EINSTELLUNGEN };
  try { return pruefeEinstellungen(JSON.parse(readFileSync(pfad, 'utf8')), VORGABE_EINSTELLUNGEN); }
  catch { return { ...VORGABE_EINSTELLUNGEN }; }
}

/**
 * Nur fuer Tests. Die ausgelieferte Anwendung ruft `new NodeCoreApp()` ohne
 * Angaben auf und laeuft damit immer auf dem Mainnet, mit den festen Ports
 * und den Ordnern unter %LOCALAPPDATA%.
 */
export interface NodeCoreOptionen {
  params?: ConsensusParams;
  guiPort?: number;
  /** Ordner fuer config.json und mining.json. */
  basis?: string;
  /** Uhr fuer die Zeitstempel neuer Bloecke, in Sekunden. */
  uhr?: () => bigint;
  /** Abstand der Statistik-Meldungen an die Peers. */
  statsTaktMs?: number;
}

export class NodeCoreApp {
  private params: ConsensusParams;
  private guiPort: number;
  private uhr: (() => bigint) | undefined;
  private statsTaktMs: number;
  /** Wann zuletzt etwas geschah, das einen Rueckstand belegt oder abbaut. */
  private fortschritt = 0;
  private letzterAusgehend = 0;
  private store: ChainStore | null = null;
  private chain: ChainManager | null = null;
  private pool: TxPool | null = null;
  private mining: MiningCoordinator | null = null;
  private miningServer: KernServer | null = null;
  private peers: PeerManager | null = null;
  private sync: SyncManager | null = null;
  private statistik: NetzStatistik | null = null;
  private statsTakt: ReturnType<typeof setInterval> | null = null;
  private lesen: ReadApi | null = null;
  /** Wann eine wartende Ueberweisung hier zum ersten Mal gesehen wurde. */
  private txGesehen = new Map<string, number>();
  /** IP des Seeds -- nur damit die Peer-Liste ihn beim Namen nennen kann. */
  private seedIp: string | null = null;
  private einstellungen: Einstellungen;
  private einstellungenPfad: string;
  /*
   * Zugangsschluessel der Oberflaeche. Entsteht bei jedem Start neu und
   * steht nur in der Seite, die dieser Server selbst ausliefert. Eine fremde
   * Webseite kann die Seite nicht lesen und kennt ihn deshalb nicht.
   */
  private zugang = randomBytes(32).toString('hex');
  private guiServer = createServer((req, res) => this.handleGui(req, res));
  private configured = false;
  private running = false;
  private startedAt = 0;
  private logs: string[] = [];
  private cpuMiner: LocalMiner | null = null;
  private gpuMiner: GpuMiner | null = null;
  private gpuErkennung: GpuErkennung | null = null;
  private gpuSucheLaeuft = false;
  private miningPfad = '';
  private mining_: MiningEinstellung = {
    address: '', mode: 'cpu',
    cpuWorkers: Math.max(1, cpus().length - 1),
    cpuIntensity: 100, gpuDevice: 0, blockName: '',
  };
  private configPath: string;
  private config: {
    dataDir: string;
    nodePort: number;
    p2pPort: number;
    seed: string;
  };

  constructor(opt: NodeCoreOptionen = {}) {
    this.params = opt.params ?? MAINNET;
    this.guiPort = opt.guiPort ?? GUI_PORT;
    this.uhr = opt.uhr;
    this.statsTaktMs = opt.statsTaktMs ?? STATS_TAKT_MS;
    const base = opt.basis ?? (process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'YSKAR', 'Node Core')
      : join(homedir(), '.yskar', 'node-core'));
    mkdirSync(base, { recursive: true });
    this.configPath = join(base, 'config.json');
    this.miningPfad = join(base, 'mining.json');
    this.einstellungenPfad = join(base, 'einstellungen.json');
    this.einstellungen = ladeEinstellungen(this.einstellungenPfad);
    this.ladeMining();
    this.config = {
      dataDir: defaultDataDir(),
      nodePort: DEFAULT_NODE_PORT,
      p2pPort: DEFAULT_P2P_PORT,
      seed: DEFAULT_SEED,
    };
    if (existsSync(this.configPath)) {
      try {
        const saved = JSON.parse(readFileSync(this.configPath, 'utf8'));
        this.config = { ...this.config, ...saved };
        this.config.dataDir = String(this.config.dataDir || defaultDataDir());
        this.config.nodePort = Number(this.config.nodePort || DEFAULT_NODE_PORT);
        this.config.p2pPort = Number(this.config.p2pPort || DEFAULT_P2P_PORT);
        this.config.seed = String(this.config.seed || '');
        this.configured = true;
      } catch {
        this.log('Konfiguration konnte nicht gelesen werden. Standardwerte werden verwendet.');
      }
    }
  }

  private log(text: string): void {
    const line = `[${new Date().toLocaleTimeString('de-DE')}] ${text}`;
    this.logs.push(line);
    if (this.logs.length > 200) this.logs.shift();
    console.log(line);
  }

  /*
   * Mining-Einstellungen laden.
   *
   * Beschaedigt oder aus einer alten Fassung? Dann gelten die Vorgaben --
   * Feld fuer Feld geprueft, nicht blind uebernommen. Eine kaputte Datei
   * darf den Start nicht verhindern.
   */
  private ladeMining(): void {
    if (!existsSync(this.miningPfad)) return;
    try {
      const d = JSON.parse(readFileSync(this.miningPfad, 'utf8')) as Partial<MiningEinstellung>;
      const kerne = cpus().length;
      if (typeof d.address === 'string' && isValidAddress(d.address)) this.mining_.address = d.address;
      if (d.mode === 'cpu' || d.mode === 'gpu' || d.mode === 'beide') this.mining_.mode = d.mode;
      if (Number.isInteger(d.cpuWorkers)) this.mining_.cpuWorkers = Math.max(1, Math.min(kerne, Number(d.cpuWorkers)));
      if (Number.isFinite(d.cpuIntensity)) this.mining_.cpuIntensity = Math.max(10, Math.min(100, Number(d.cpuIntensity)));
      if (Number.isInteger(d.gpuDevice) && Number(d.gpuDevice) >= 0) this.mining_.gpuDevice = Number(d.gpuDevice);
      if (typeof d.blockName === 'string') {
        // Ueber denselben Weg wie beim Speichern -- eine Datei aus einer
        // aelteren Fassung darf keinen unzulaessigen Namen einschleusen.
        try { nameToExtra(d.blockName); this.mining_.blockName = d.blockName; }
        catch { this.log('Name im Block war unzulaessig -- leer gelassen.'); }
      }
    } catch {
      this.log('mining.json war unlesbar -- Vorgaben verwendet.');
    }
  }

  private speichereMining(): void {
    try { writeFileSync(this.miningPfad, JSON.stringify(this.mining_, null, 2)); }
    catch (e) { this.log(`mining.json nicht gespeichert: ${(e as Error).message}`); }
  }

  /** GPU suchen. Laeuft im Hintergrund und haelt nie den Knoten auf. */
  private async sucheGpu(): Promise<GpuErkennung> {
    if (this.gpuSucheLaeuft && this.gpuErkennung) return this.gpuErkennung;
    this.gpuSucheLaeuft = true;
    try {
      this.gpuErkennung = await erkenneGpu();
      const e = this.gpuErkennung;
      this.log(e.verfuegbar
        ? `GPU: ${e.geraete.map(g => `${g.name} (CC ${g.cc})`).join(', ')}`
        : `GPU nicht verfuegbar: ${e.grund}`);
      return e;
    } finally {
      this.gpuSucheLaeuft = false;
    }
  }

  /*
   * Ein Block ist entstanden oder angekommen -- alle Miner muessen weg vom
   * alten Vorgaenger.
   *
   * Ohne diesen Aufruf rechnete ein interner Miner bis zur naechsten
   * Job-Erneuerung (bis zu 30 Sekunden) auf einem Block weiter, der schon
   * einen Nachfolger hat. Seine Treffer waeren "stale" und wertlos.
   */
  private minerNeuAusrichten(): void {
    this.mining?.invalidate();
    this.cpuMiner?.notifyChainChanged();
    this.gpuMiner?.notifyChainChanged();
  }

  /** Ein intern gefundener Block: ins Netz geben und alle Miner umstellen. */
  private eigenerBlock(quelle: string, height: number, hash: string): void {
    this.log(`BLOCK GEFUNDEN (${quelle}) #${height} · ${hash.slice(0, 32)}…`);
    const n = this.sync?.kuendigeAn(this.hexToBytes(hash)) ?? 0;
    if (n > 0) this.log(`  an ${n} Peer${n > 1 ? 's' : ''} gemeldet`);
    this.minerNeuAusrichten();
  }

  /** Was die eingebauten Miner gerade leisten -- fuer die Statistik. */
  private interneStatistik(): LokaleStatistik | null {
    const laufend = [this.cpuMiner?.status(), this.gpuMiner?.status()]
      .filter(m => m?.running);
    if (laufend.length === 0 || !isValidAddress(this.mining_.address)) return null;
    const hashrate = laufend.reduce(
      (summe, m) => summe + (Number.isFinite(m!.hashrate) ? Math.max(0, m!.hashrate) : 0), 0);
    return {
      adressen: [toHex(decodeAddress(this.mining_.address))],
      hashrate,
      sessions: laufend.length,
    };
  }

  /*
   * Den Peers melden, wer hier mint (NetzStatistik.ts).
   *
   * Gesendet wird NUR an Peers, deren Kennung "+stats" traegt. Ein Knoten
   * aelterer Fassung kennt den Befehl nicht und wuerde die Verbindung
   * trennen.
   */
  private meldeStats(an?: PeerConnection): void {
    if (!this.peers || !this.statistik || !this.miningServer) return;
    const l = this.miningServer.lokaleStatistik();
    const nutzlast = encodeStats({
      knoten: this.statistik.eigeneKennung,
      hashrate: Number.isFinite(l.hashrate) ? BigInt(Math.max(0, Math.round(l.hashrate))) : 0n,
      sessions: l.sessions,
      adressen: l.adressen.map(h => this.hexToBytes(h)),
    });
    for (const p of an ? [an] : this.peers.bereite()) {
      if (p.info().agent.includes(STATS_FAEHIG)) p.send('stats', nutzlast);
    }
  }

  /*
   * Darf das Mining starten?
   *
   * Der Miner rechnet auf dem Kopf der EIGENEN Kette. Holt der Knoten noch
   * auf, ist das ein alter Stand, und ein Treffer dort waere wertlos. Ohne
   * jeden Peer gilt dasselbe: Niemand erfuehre von dem Block.
   *
   * Ob der Knoten zurueckliegt, sagen ihm nur seine Peers -- und die koennen
   * luegen. Eine Sperre, die sich auf ihr Wort verlaesst, liesse sich von
   * aussen dauerhaft ausloesen. Deshalb drei Vorkehrungen:
   *
   *   1. Verglichen wird mit dem MITTLEREN Stand, nicht mit dem hoechsten.
   *   2. Gibt es ausgehende Verbindungen, zaehlen nur sie. Die hat dieser
   *      Knoten selbst gewaehlt; eingehende kann jeder beliebig oft oeffnen.
   *   3. Die Angabe "du liegst zurueck" gilt nur, solange auch Bloecke
   *      kommen. Bleibt SYNC_GEDULD_MS lang jeder Fortschritt aus, war sie
   *      nicht gedeckt, und das Mining darf starten. Als Fortschritt zaehlen
   *      der Knotenstart, ein angenommener Block und -- hoechstens alle
   *      AUSGEHEND_ZAEHLT_ALLE_MS -- eine neue AUSGEHENDE Verbindung. Nichts
   *      davon kann ein Fremder nach Belieben ausloesen.
   *
   * Dasselbe gilt fuer die Warteschlange des Abgleichs: Angekuendigte
   * Bloecke, die nie geliefert werden, sperren nicht fuer immer.
   *
   * DER PREIS, ausdruecklich: Stockt ein echter Abgleich laenger als
   * SYNC_GEDULD_MS, oeffnet die Sperre, obwohl der Knoten zurueckliegt. Dann
   * rechnet der Miner bis zum naechsten Block auf einem alten Stand -- das
   * kostet eigene Rechenzeit und sonst nichts. Die andere Richtung waere
   * schlimmer: eine Sperre, die Fremde geschlossen halten koennen.
   *
   * Ein Block Abstand ist erlaubt: Der letzte Block ist oft noch unterwegs.
   */
  private miningBereit(jetzt: number = Date.now()): { bereit: boolean; grund: string | null } {
    const peers = this.peers?.info() ?? [];
    if (peers.length === 0) {
      return { bereit: false, grund: 'Noch kein Peer verbunden. Ohne Verbindung zum Netz wäre ein gefundener Block wertlos. Bitte kurz warten.' };
    }
    const ausgehend = peers.filter(p => p.richtung === 'aus');
    const massgeblich = ausgehend.length > 0 ? ausgehend : peers;

    const hoehe = this.chain?.tip()?.height ?? -1;
    const ziel = median(massgeblich.map(p => p.height));
    const offen = this.sync?.fehlendeBloecke() ?? 0;

    let grund: string | null = null;
    if (hoehe < ziel - 1) {
      grund = `Der Knoten synchronisiert noch (Höhe ${Math.max(0, hoehe)} von ${ziel}). Das Mining startet erst, wenn er auf dem Stand des Netzes ist.`;
    } else if (offen > 1) {
      // Die Hoehe der Peers stammt vom Verbindungsaufbau und kann Stunden
      // alt sein. Dann zaehlt, was der Abgleich gerade nachlaedt. Ein
      // einzelner Block in der Warteschlange ist bei jedem neuen Block normal.
      grund = `Der Knoten synchronisiert noch (${offen} Blöcke fehlen). Das Mining startet erst, wenn er auf dem Stand des Netzes ist.`;
    }
    if (grund === null) return { bereit: true, grund: null };

    // Rueckstand behauptet, aber seit einer Weile kommt nichts: nicht gedeckt.
    if (jetzt - this.fortschritt > SYNC_GEDULD_MS) return { bereit: true, grund: null };
    return { bereit: false, grund };
  }

  /** Eine selbst aufgebaute Verbindung bringt einen frischen Stand mit. */
  private ausgehendVerbunden(jetzt: number = Date.now()): void {
    if (jetzt - this.letzterAusgehend < AUSGEHEND_ZAEHLT_ALLE_MS) return;
    this.letzterAusgehend = jetzt;
    this.fortschritt = jetzt;
  }

  /** Stand fuer GUI und API. */
  private miningStatus() {
    const cpu = this.cpuMiner?.status() ?? null;
    const gpu = this.gpuMiner?.status() ?? null;
    return {
      nodeRunning: this.running,
      config: this.mining_,
      cores: cpus().length,
      cpu, gpu,
      gpuErkennung: this.gpuErkennung,
      gpuSucheLaeuft: this.gpuSucheLaeuft,
      totalHashrate: (cpu?.running ? cpu.hashrate : 0) + (gpu?.running ? gpu.hashrate : 0),
      // Was der Explorer aus dem Block herauslesen wird -- zurueckgelesen,
      // nicht nur wiederholt. So sieht man, ob der Name wirklich ankommt.
      blockNameGelesen: finderName(
        Buffer.from(this.mining_.blockName, 'utf8').toString('hex')),
      maxBlockName: MAX_FINDER_BYTES,
      running: !!(cpu?.running || gpu?.running),
      // Ob ein Start gerade Sinn hat -- siehe miningBereit().
      startklar: this.running ? this.miningBereit() : { bereit: false, grund: 'Zuerst den Full Node starten.' },
    };
  }

  /*
   * Mining starten.
   *
   * Adresse ueber die bestehende Pruefung aus core/address.ts -- keine
   * eigene Adresslogik. Im Modus "beide" startet die CPU auch dann, wenn die
   * GPU nicht verfuegbar ist; der Grund steht in der Antwort.
   */
  private async startMining(body: Record<string, unknown>) {
    if (!this.running || !this.cpuMiner || !this.gpuMiner) {
      throw new Error('Zuerst den Full Node starten.');
    }
    const address = String(body.address ?? this.mining_.address).trim().toLowerCase();
    if (!isValidAddress(address)) throw new Error('Ungültige YSKAR-Adresse.');

    const stand = this.miningBereit();
    if (!stand.bereit) throw new Error(stand.grund ?? 'Der Knoten ist noch nicht bereit.');

    const mode = body.mode === 'gpu' || body.mode === 'beide' ? body.mode : 'cpu';
    const kerne = cpus().length;
    const cpuWorkers = Math.max(1, Math.min(kerne, Math.floor(Number(body.cpuWorkers ?? this.mining_.cpuWorkers)) || 1));
    const cpuIntensity = Math.max(10, Math.min(100, Math.round(Number(body.cpuIntensity ?? this.mining_.cpuIntensity)) || 100));
    const gpuDevice = Math.max(0, Math.floor(Number(body.gpuDevice ?? this.mining_.gpuDevice)) || 0);

    /*
      Name im Block. Wird hier geprueft, nicht erst beim Bauen: Was einmal
      in einem Block steht, steht dort fuer immer.
    */
    const blockName = String(body.blockName ?? this.mining_.blockName ?? '').trim();
    let extra: Uint8Array;
    try { extra = nameToExtra(blockName); }
    catch (e) { throw new Error(`Name im Block: ${(e as Error).message}`); }

    this.mining_ = { address, mode, cpuWorkers, cpuIntensity, gpuDevice, blockName };
    this.speichereMining();

    this.cpuMiner.setExtra(extra);
    this.gpuMiner.setExtra(extra);

    const hinweise: string[] = [];

    if (mode === 'cpu' || mode === 'beide') {
      await this.cpuMiner.stop();
      await this.cpuMiner.start(address, cpuWorkers, cpuIntensity);
    } else {
      await this.cpuMiner.stop();
    }

    if (mode === 'gpu' || mode === 'beide') {
      const e = this.gpuErkennung ?? await this.sucheGpu();
      const geraet = e.geraete.find(g => g.id === gpuDevice) ?? e.geraete[0];
      if (!e.verfuegbar || !geraet) {
        const grund = e.grund ?? 'Keine GPU gefunden.';
        if (mode === 'gpu') throw new Error(`GPU-Mining nicht möglich: ${grund}`);
        hinweise.push(`GPU nicht gestartet: ${grund}`);
      } else {
        await this.gpuMiner.stop();
        await this.gpuMiner.start(decodeAddress(address), geraet);
      }
    } else {
      await this.gpuMiner.stop();
    }

    return { ok: true, hinweise, status: this.miningStatus() };
  }

  private async stopMining() {
    await this.cpuMiner?.stop();
    await this.gpuMiner?.stop();
    return { ok: true, status: this.miningStatus() };
  }

  async startGui(): Promise<void> {
    await new Promise<void>((resolveGui, reject) => {
      this.guiServer.once('error', reject);
      this.guiServer.listen(this.guiPort, '127.0.0.1', resolveGui);
    });
    this.log(`GUI-Server gestartet · 127.0.0.1:${this.guiPort}`);
  }

  async shutdown(): Promise<void> {
    await this.stopNode();
    if (this.guiServer.listening) {
      await new Promise<void>(resolveGui => this.guiServer.close(() => resolveGui()));
    }
  }

  private async configure(body: Record<string, unknown>): Promise<void> {
    const dataDir = String(body.dataDir || this.config.dataDir).trim();
    const nodePort = Number(body.nodePort || this.config.nodePort);
    const p2pPort = Number(body.p2pPort || this.config.p2pPort);
    const seed = String(body.seed ?? this.config.seed).trim();
    if (!dataDir) throw new Error('Datenordner fehlt.');
    if (!Number.isInteger(nodePort) || nodePort < 1024 || nodePort > 65535) throw new Error('Ungültiger Node-Port.');
    if (!Number.isInteger(p2pPort) || p2pPort < 1024 || p2pPort > 65535) throw new Error('Ungültiger P2P-Port.');
    if (nodePort === p2pPort) throw new Error('Node-Port und P2P-Port müssen unterschiedlich sein.');
    if (seed) this.parseSeed(seed);
    // Der Assistent prueft seine Eingaben, bevor er sie festschreibt.
    if (body.nurPruefen === true) return;
    this.config = { dataDir, nodePort, p2pPort, seed };
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    this.configured = true;
    this.log(`Konfiguration gespeichert. Daten: ${dataDir}`);
  }

  /*
   * Knoten starten.
   *
   * Scheitert der Start mittendrin -- etwa weil ein Port belegt ist --,
   * wird alles wieder abgebaut, was schon lief. Sonst bliebe der P2P-Port
   * gebunden, waehrend der Knoten als "gestoppt" gilt, und jeder weitere
   * Startversuch scheiterte an genau diesem Port.
   */
  async startNode(): Promise<void> {
    if (this.running) return;
    if (!this.configured) throw new Error('Assistent noch nicht abgeschlossen.');
    try {
      await this.baueAuf();
    } catch (e) {
      await this.baueAb();
      // Die eben geoeffnete Ablage gehoert zu einem Knoten, den es nicht gibt.
      try { this.store?.close(); } catch { /* war nie offen */ }
      this.store = null; this.chain = null; this.pool = null; this.mining = null;
      this.miningServer = null; this.peers = null; this.sync = null;
      this.statistik = null; this.cpuMiner = null; this.gpuMiner = null;
      this.lesen = null;
      this.log(`Full Node nicht gestartet: ${(e as Error).message}`);
      throw e;
    }
  }

  private async baueAuf(): Promise<void> {
    const params = this.params;
    const db = join(resolve(this.config.dataDir), 'chain.db');
    this.store = new ChainStore(db, { network: params.network, chainId: params.chainId });
    this.chain = new ChainManager(this.store, params);
    this.pool = new TxPool(params);
    this.mining = new MiningCoordinator(this.chain, this.store, this.pool, params, this.uhr);
    this.miningServer = new KernServer({ chain: this.chain, store: this.store, pool: this.pool, mining: this.mining }, {
      host: '127.0.0.1', port: this.config.nodePort, params,
    });
    this.miningServer.intern = () => this.interneStatistik();

    /*
     * Eine ueber die lokale Schnittstelle eingereichte Ueberweisung den
     * Peers ankuendigen. Ohne das kennte sie nur dieser Knoten, und sie
     * kaeme erst in einen Block, wenn er selbst einen findet.
     */
    this.miningServer.onNeueTx = hash => { this.sync?.kuendigeAnTx(hash); };

    // Miner und Leistung ueber die Knoten hinweg (NetzStatistik.ts).
    this.statistik = new NetzStatistik(randomBytes(8).readBigUInt64BE());
    this.miningServer.netzStatistik = this.statistik;

    // Dieselbe Leseschnittstelle, die auch der Explorer nutzt -- hier fuer
    // die eigene Oberflaeche: Bloecke, Konten, Suche, Gebuehren.
    const netz = () => this.statistik!.summe(this.miningServer!.lokaleStatistik());
    this.lesen = new ReadApi({
      chain: this.chain, store: this.store, pool: this.pool, params,
      hashrate: () => netz().hashrate || null,
      aktiveMiner: () => netz().miner,
      miningSessions: () => netz().sessions,
      knoten: () => netz().knoten,
    });
    this.txGesehen.clear();
    void this.findeSeedIp();

    this.miningServer.onBlock = (height, hash, address) => {
      this.log(`BLOCK GEFUNDEN #${height} · ${hash.slice(0, 32)}… · ${address.slice(0, 16)}…`);
      this.sync?.kuendigeAn(this.hexToBytes(hash));
      // Ein externer Miner hat getroffen -- die internen muessen umstellen.
      this.cpuMiner?.notifyChainChanged();
      this.gpuMiner?.notifyChainChanged();
    };

    /*
     * Interne Miner. Beide holen ihre Jobs beim MiningCoordinator, beide
     * reichen ueber submitNonce() ein -- es gibt keine zweite
     * Validierung und keinen zweiten Weg in die Kette.
     */
    this.cpuMiner = new LocalMiner({
      mining: this.mining,
      onBlock: (h, hash) => this.eigenerBlock('CPU', h, hash),
      onLog: t => this.log(t),
    });
    this.gpuMiner = new GpuMiner({
      mining: this.mining,
      onBlock: (h, hash) => this.eigenerBlock('GPU', h, hash),
      onLog: t => this.log(t),
    });
    // Die GPU-Suche laeuft nebenher -- sie darf den Start nie verzoegern.
    void this.sucheGpu();
    this.miningServer.onFehler = (where, e) => this.log(`Fehler ${where}: ${e.message}`);
    this.miningServer.onUpstream = result => this.log(result.ok ? `Block weitergegeben: Höhe ${result.hoehe}` : `Block nicht weitergegeben: ${result.grund}`);

    this.peers = new PeerManager({
      params,
      agent: `yskar-node-core/${VERSION} ${STATS_FAEHIG}`,
      listenPort: this.config.p2pPort,
      seeds: this.config.seed ? [this.parseSeed(this.config.seed)] : [],
      kette: () => {
        const tip = this.chain!.tip();
        return { height: tip?.height ?? -1, chainWork: tip?.chainWork ?? 0n };
      },
      onReady: p => {
        this.log(`Peer verbunden: ${p.host}:${p.port} · Höhe ${p.fremdeHoehe()}`);
        if (p.richtung === 'aus') this.ausgehendVerbunden();
        this.sync?.aufPeer(p);
        this.meldeStats(p);
      },
      onMessage: (p, frame) => {
        if (frame.command === 'stats') {
          try { this.statistik?.aufnehmen(decodeStats(frame.payload)); }
          catch (e) { p.close(`stats_unlesbar:${(e as Error).message}`); }
          return;
        }
        this.sync?.aufNachricht(p, frame);
      },
      onClose: (p, reason) => this.log(`Peer getrennt: ${p.host}:${p.port} · ${reason}`),
      onLog: text => this.log(text),
    });

    /*
     * Mit Warteschlange: Der Knoten nimmt Ueberweisungen seiner Peers an,
     * gibt sie weiter und baut sie in seine Bloecke ein. Ohne `pool`
     * enthielten die Bloecke dieses Knotens nur die Belohnung.
     */
    this.sync = new SyncManager({
      chain: this.chain,
      store: this.store,
      peers: this.peers,
      params,
      pool: this.pool,
      onBlock: (height, hash, from) => {
        this.fortschritt = Date.now();
        this.minerNeuAusrichten();
        this.log(`Block #${height} von ${from} · ${hash.slice(0, 32)}…`);
      },
      onLog: text => this.log(text),
    });

    await this.peers.start();
    this.sync.start();
    this.statsTakt = setInterval(() => this.meldeStats(), this.statsTaktMs);
    this.statsTakt.unref?.();
    await this.miningServer.listen('127.0.0.1', this.config.nodePort);
    this.running = true;
    this.startedAt = Date.now();
    this.fortschritt = this.startedAt;
    this.log(`Full Node gestartet · ${params.network} · P2P :${this.config.p2pPort} · API :${this.config.nodePort}`);
  }

  private parseSeed(seed: string): { host: string; port: number } {
    const i = seed.lastIndexOf(':');
    if (i < 1) throw new Error(`Seed "${seed}" muss host:port sein.`);
    const port = Number(seed.slice(i + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger Seed-Port.');
    return { host: seed.slice(0, i), port };
  }

  private hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  async stopNode(): Promise<void> {
    if (!this.running) return;
    await this.baueAb();
    this.log('Full Node gestoppt.');
  }

  /** Alles anhalten, was laeuft -- auch nach einem halben Start. */
  private async baueAb(): Promise<void> {
    // Miner zuerst: Sie brauchen den Koordinator, und der haengt an der
    // Kette, die gleich geschlossen wird. Worker und GPU-Prozess sollen
    // nicht als Waisen weiterlaufen.
    try { await this.cpuMiner?.stop(); } catch { /* lief nicht */ }
    try { await this.gpuMiner?.stop(); } catch { /* lief nicht */ }
    if (this.statsTakt) clearInterval(this.statsTakt);
    this.statsTakt = null;
    this.sync?.stop();
    await this.peers?.stop();
    await this.miningServer?.close();
    this.running = false;
  }

  private status() {
    const tip = this.chain?.tip() ?? null;
    const peers = this.peers?.info() ?? [];
    const state = this.chain?.state();
    const targetHeight = peers.length ? Math.max(...peers.map(p => p.height)) : null;
    const currentHeight = tip?.height ?? -1;
    const syncing = targetHeight !== null && targetHeight > currentHeight;
    const progress = targetHeight !== null && targetHeight >= 0
      ? Math.max(0, Math.min(100, Math.round(((currentHeight + 1) / Math.max(1, targetHeight + 1)) * 100)))
      : null;
    return {
      version: VERSION,
      network: this.params.network,
      running: this.running,
      configured: this.configured,
      dataDir: this.config.dataDir,
      nodePort: this.config.nodePort,
      p2pPort: this.config.p2pPort,
      seed: this.config.seed,
      height: tip?.height ?? null,
      nextHeight: currentHeight + 1,
      targetHeight,
      syncProgress: progress,
      syncing,
      tipHash: tip ? toHex(tip.hash) : null,
      chainWork: tip?.chainWork?.toString() ?? '0',
      difficulty: tip?.difficulty?.toString() ?? null,
      blocksStored: this.store?.count() ?? 0,
      tips: this.store?.tips().length ?? 0,
      totalSupply: state ? totalSupply(state).toString() : '0',
      stateRoot: tip && state ? toHex(stateRoot(state)) : null,
      peers: this.peerListe(),
      peerCount: peers.length,
      outboundPeers: this.peers?.zahlAus() ?? 0,
      inboundPeers: this.peers?.zahlEin() ?? 0,
      peerBook: this.peers?.buchGroesse() ?? 0,
      syncPending: this.sync?.fehlendeBloecke() ?? 0,
      syncRequests: this.sync?.offeneAnfragen() ?? 0,
      mempool: this.pool?.size() ?? 0,
      // Aus Difficulty und Blockzeit -- die einzige Zahl, die jeden Miner enthaelt.
      netzHashrate: this.running ? (this.lesen?.summary().hashrate ?? null) : null,
      naechsteBelohnung: rewardAt(currentHeight + 1).toString(),
      halbierungBei: (Math.floor((currentHeight + 1) / EPOCH_BLOCKS) + 1) * EPOCH_BLOCKS,
      letzterBlock: tip ? Number(tip.blockTime) : null,
      zielBlockzeit: Number(this.params.targetBlockTime),
      guiPort: this.guiPort,
      konsensfassung: KONSENSFASSUNG,
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    };
  }

  /** Den Seed einmal aufloesen, damit die Peer-Liste ihn beim Namen nennt. */
  private async findeSeedIp(): Promise<void> {
    this.seedIp = null;
    if (!this.config.seed) return;
    try {
      const { host } = this.parseSeed(this.config.seed);
      const { lookup } = await import('node:dns/promises');
      this.seedIp = (await lookup(host)).address;
    } catch { /* ohne Namen geht es auch */ }
  }

  /** Verbundene Knoten, so wie die Oberflaeche sie zeigt. */
  private peerListe() {
    const seedPort = this.config.seed ? Number(this.config.seed.slice(this.config.seed.lastIndexOf(':') + 1)) : 0;
    return (this.peers?.info() ?? []).map(p => {
      const istSeed = p.richtung === 'aus' && this.seedIp !== null
        && p.host === this.seedIp && p.port === seedPort;
      return {
        id: p.id,
        adresse: istSeed ? this.config.seed : `${p.host}:${p.port}`,
        seed: istSeed,
        richtung: p.richtung,
        hoehe: p.height,
        programm: p.agent,
        seit: p.seit,
      };
    });
  }

  private verbindePeer(body: Record<string, unknown>) {
    if (!this.running || !this.peers) throw new Error('Zuerst den Full Node starten.');
    const { host, port } = this.parseSeed(String(body.adresse ?? '').trim());
    if (!/^[a-zA-Z0-9.\-:\[\]]{1,253}$/.test(host)) throw new Error('Ungültige Adresse.');
    this.peers.verbinde(host, port);
    this.log(`Verbindung zu ${host}:${port} wird aufgebaut.`);
    return { ok: true };
  }

  private trennePeer(body: Record<string, unknown>) {
    const p = this.peers?.alle().find(x => x.id === Number(body.id));
    if (!p) throw new Error('Diese Verbindung gibt es nicht mehr.');
    p.close('vom_nutzer_getrennt');
    return { ok: true };
  }

  /** Wartende Ueberweisungen mit dem Zeitpunkt, zu dem dieser Knoten sie zuerst sah. */
  private mempoolListe() {
    const jetzt = Date.now();
    const offen = this.pool?.alle() ?? [];
    const ids = new Set<string>();
    const liste = offen.map(tx => {
      const id = toHex(txid(tx));
      ids.add(id);
      if (!this.txGesehen.has(id)) this.txGesehen.set(id, jetzt);
      return {
        txid: id,
        from: encodeAddress(tx.from), to: encodeAddress(tx.to),
        amount: tx.amount.toString(), fee: tx.fee.toString(),
        seit: this.txGesehen.get(id)!,
      };
    });
    for (const id of this.txGesehen.keys()) if (!ids.has(id)) this.txGesehen.delete(id);
    return { wartend: liste.sort((x, y) => x.seit - y.seit) };
  }

  private setzeEinstellungen(body: Record<string, unknown>) {
    this.einstellungen = pruefeEinstellungen(body, this.einstellungen);
    try { writeFileSync(this.einstellungenPfad, JSON.stringify(this.einstellungen, null, 2)); }
    catch (e) { this.log(`einstellungen.json nicht gespeichert: ${(e as Error).message}`); }
    return this.einstellungen;
  }

  /*
   * Wer darf mit der Oberflaeche sprechen?
   *
   * Der Server lauscht nur auf 127.0.0.1 -- aber jede Webseite, die im
   * Browser dieses PCs offen ist, kann Anfragen an 127.0.0.1 schicken. Ohne
   * Pruefung koennte eine fremde Seite die Auszahlungsadresse des Minings
   * aendern oder den Knoten beenden. Drei Schranken, jede fuer sich:
   *
   *   1. Host: nur die eigene Adresse. Verhindert, dass ein fremder Name auf
   *      127.0.0.1 umgebogen wird und die Seite dann als "gleiche Herkunft"
   *      gilt (DNS-Rebinding).
   *   2. Herkunft: Schickt der Browser eine, muss es die eigene sein.
   *   3. Zugangsschluessel fuer alles unter /api/. Er steht nur in der Seite,
   *      die dieser Server ausliefert; eine fremde Seite kann sie nicht lesen.
   *
   * Das schuetzt vor Webseiten. Vor einem Schadprogramm, das auf dem PC
   * selbst laeuft, schuetzt es nicht -- das kann die Seite abrufen wie die
   * Anwendung auch.
   */
  private abgewiesen(req: IncomingMessage, pfad: string): { status: number; error: string } | null {
    const eigen = [`127.0.0.1:${this.guiPort}`, `localhost:${this.guiPort}`];

    const host = String(req.headers.host ?? '').toLowerCase();
    if (!eigen.includes(host)) {
      return { status: 403, error: 'Zugriff verweigert: fremder Host.' };
    }

    const origin = req.headers.origin;
    if (origin !== undefined && !eigen.some(h => origin === `http://${h}`)) {
      return { status: 403, error: 'Zugriff verweigert: fremde Herkunft.' };
    }
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
      return { status: 403, error: 'Zugriff verweigert: fremde Herkunft.' };
    }

    if (pfad.startsWith('/api/')) {
      const kopf = req.headers[TOKEN_KOPF];
      const a = Buffer.from(typeof kopf === 'string' ? kopf : '');
      const b = Buffer.from(this.zugang);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { status: 401, error: 'Zugriff verweigert: Zugangsschlüssel fehlt.' };
      }
    }
    return null;
  }

  /** Die Seite mit dem Zugangsschluessel dieses Starts. */
  private seite(): string | null {
    const roh = uiDatei('/ui/index.html');
    return roh ? roh.inhalt.toString('utf8').split(TOKEN_PLATZ).join(this.zugang) : null;
  }

  private async handleGui(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pfad = url.pathname;
      const nein = this.abgewiesen(req, pfad);
      if (nein) return json(res, { error: nein.error }, nein.status);
      const GET = req.method === 'GET', POST = req.method === 'POST';

      if (GET && pfad === '/') {
        const seite = this.seite();
        if (!seite) return json(res, { error: 'Die Dateien der Oberfläche fehlen (ui/).' }, 500);
        return html(res, seite);
      }
      if (GET && pfad.startsWith('/ui/') && pfad !== '/ui/index.html') {
        const d = uiDatei(pfad);
        if (!d) return json(res, { error: 'not_found' }, 404);
        res.writeHead(200, { 'content-type': d.typ, 'content-length': d.inhalt.length, ...SCHUTZKOPF });
        res.end(d.inhalt);
        return;
      }

      if (GET && pfad === '/api/status') {
        return json(res, { ...this.status(), mining: this.miningStatus(), einstellungen: this.einstellungen });
      }
      if (GET && pfad === '/api/einstellungen') return json(res, this.einstellungen);
      if (POST && pfad === '/api/einstellungen') return json(res, this.setzeEinstellungen(await readBody(req)));

      // Leseschnittstelle des Knotens: /api/lesen/blocks, /blocks/<h>, /account/<a>, /search, /fees, /tx/<id>
      if (GET && pfad.startsWith('/api/lesen/')) {
        if (!this.lesen || !this.running) return json(res, { error: 'Der Knoten läuft nicht.' }, 409);
        const r = this.lesen.behandle('GET', pfad.slice('/api/lesen'.length), url.searchParams);
        if (!r) return json(res, { error: 'not_found' }, 404);
        return json(res, r.body, r.status);
      }
      if (GET && pfad === '/api/kette/mempool') return json(res, this.mempoolListe());

      if (POST && pfad === '/api/peers/verbinden') return json(res, this.verbindePeer(await readBody(req)));
      if (POST && pfad === '/api/peers/trennen') return json(res, this.trennePeer(await readBody(req)));

      if (GET && pfad === '/api/mining/status') return json(res, this.miningStatus());
      if (POST && pfad === '/api/mining/start') return json(res, await this.startMining(await readBody(req)));
      if (POST && pfad === '/api/mining/stop') return json(res, await this.stopMining());
      if (POST && pfad === '/api/mining/detect') {
        this.gpuErkennung = null;
        await this.sucheGpu();
        return json(res, this.miningStatus());
      }

      if (GET && pfad === '/api/logs') return json(res, { logs: this.logs });
      if (POST && pfad === '/api/configure') {
        await this.configure(await readBody(req));
        return json(res, { ok: true, config: this.config });
      }
      if (POST && pfad === '/api/start') { await this.startNode(); return json(res, { ok: true }); }
      if (POST && pfad === '/api/stop') { await this.stopNode(); return json(res, { ok: true }); }
      if (POST && pfad === '/api/shutdown') {
        json(res, { ok: true });
        setTimeout(async () => { await this.stopNode(); this.guiServer.close(); process.exit(0); }, 50).unref();
        return;
      }
      json(res, { error: 'not_found' }, 404);
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
  }
}
