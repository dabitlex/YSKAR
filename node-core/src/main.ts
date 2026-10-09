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
import { EPOCH_BLOCKS, rewardAt, DUST_LIMIT, FEE_V3_HEIGHT } from '../../src/lib/core/params.ts';
import { txid, buildTransfer, transferBytes } from '../../src/lib/core/tx.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { getAccount } from '../../src/lib/core/state.ts';
import { notizKuerzen, notizAusHex } from '../../src/lib/wallet/notiz.ts';
import { eingabeEinheiten } from '../../src/lib/wallet/betrag.ts';
import { zahlungsCode } from '../../src/lib/wallet/qr.ts';
// @ts-ignore -- nur der Kern der Bibliothek, ohne Bildausgabe
import qrKern from 'qrcode/lib/core/qrcode.js';
import { WalletDienst, WalletFehler } from './Wallet.ts';
import { leseVerlauf, tagVon, NamenZaehler, type KettenVerlauf } from './WalletKette.ts';
import { PoolQuelle, PoolEndgueltig, fragePool, poolSchnittstelle } from './PoolQuelle.ts';
import { POOLS, hostAusEingabe, waehlbar, type PoolEintrag, type PoolStand } from '../../src/lib/pool/verzeichnis.ts';
import { PoolCoordinator } from '../../src/lib/pool/PoolCoordinator.ts';
import { fensterGroesse } from '../../src/lib/pool/pplns.ts';
import {
  ladeBetrieb, speichereBetrieb, pruefeBetrieb, pruefePoolName, platzGrenze, leseFenster,
  schreibeFenster, schreibeFensterSofort, kuerze, heimnetzAdressen, type BetriebEinstellung,
} from './PoolBetrieb.ts';
import { PeerManager } from '../../src/lib/node/p2p/PeerManager.ts';
import type { PeerConnection } from '../../src/lib/node/p2p/PeerConnection.ts';
import { SyncManager } from '../../src/lib/node/p2p/SyncManager.ts';
import { STATS_FAEHIG, encodeStats, decodeStats } from '../../src/lib/node/p2p/messages.ts';
import { MAINNET, istMainnet, type ConsensusParams } from '../../src/lib/core/networks.ts';
import { stateRoot, totalSupply } from '../../src/lib/core/state.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { isValidAddress, decodeAddress } from '../../src/lib/core/address.ts';
import { cpus } from 'node:os';
import { LocalMiner } from './LocalMiner.ts';
import { GpuMiner, erkenneGpu, type GpuErkennung } from './GpuMiner.ts';
import { nameToExtra, finderName, MAX_FINDER_BYTES } from '../../src/lib/chain/finderName.ts';
import {
  linkErlaubt, sucheUpdate, Protokoll, ordnerBytes, KernFehler, RELEASES_ABFRAGE, RELEASES_SEITE,
  type Huelle, type UpdateStand,
} from './Programm.ts';

/**
 * Mining-Einstellungen.
 *
 * In einer EIGENEN Datei neben config.json, nicht darin: Die bestehende
 * Konfiguration (Datenordner, Ports, Seed) wird damit nicht angefasst, und
 * ein Fehler hier kann den Knotenstart nicht verhindern.
 */
type MiningModus = 'cpu' | 'gpu' | 'beide';
/** Solo: an eigenen Bloecken rechnen. Pool: mit anderen teilen. */
type MiningZiel = 'solo' | 'pool';
interface MiningEinstellung {
  address: string;
  /** Fehlt das Feld in einer aelteren Datei, gilt "solo". */
  ziel: MiningZiel;
  /** Der gewaehlte Pool -- Adresse des Pool-Knotens, wie hostAusEingabe() sie liefert. */
  poolHost: string;
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
  /**
   * Lief das Mining, als das Programm zuletzt endete? Nur dann wird es nach
   * dem Start fortgesetzt (Einstellung "Mining nach dem Start fortsetzen").
   * Wer selbst stoppt, will nicht, dass es von allein wieder anfaengt.
   */
  lief: boolean;
}

export const VERSION = '0.5.2';
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
/**
 * Name des Cookies, ueber das das Fenster des Programms den Schluessel
 * mitschickt. Gesetzt wird es von electron-main.mjs, bevor die Seite laedt
 * -- nur in der Sitzung dieses Fensters, HttpOnly und SameSite=Strict.
 */
const TOKEN_COOKIE = 'yskar_zugang';
/** Platzhalter in der ausgelieferten Seite -- wird je Start ersetzt. */
const TOKEN_PLATZ = '__YSKAR_ZUGANG__';
const DEFAULT_NODE_PORT = 8645;
const DEFAULT_P2P_PORT = 8646;
const DEFAULT_SEED = 'yskar-main.dynv6.net:8646';
/**
 * Weitere fest eingebaute Seeds des Hauptnetzes.
 *
 * Das Feld "Seed" in den Einstellungen nennt EINEN Knoten. Steht dort der
 * einzige Einstieg ins Netz und ist dieser Knoten gerade aus, findet ein
 * frisch gestarteter Node Core niemanden -- sein Adressbuch ist noch leer.
 * Deshalb kennt das Programm einen zweiten Einstieg, der unabhaengig vom
 * ersten laeuft (anderer Rechner, anderer Anschluss).
 *
 * Hier steht bewusst KEINE zweite Adresse desselben Rechners (etwa seine
 * feste IP neben seinem Namen): Der Knoten kann ihn dann unter beiden
 * Adressen anwaehlen und belegt dort zwei Plaetze.
 */
export const WEITERE_SEEDS: readonly string[] = ['yskar-seed2.dynv6.net:8646'];

/**
 * Welche Seeds der Knoten beim Start kennt.
 *
 * - Feld leer: keiner. Wer das Feld leert, will ohne Seed laufen -- daran
 *   aendern auch die fest eingebauten nichts.
 * - Sonst der eingetragene, und im Hauptnetz dazu die fest eingebauten.
 *   In jedem anderen Netz (Tests) bleibt es beim eingetragenen: Ein
 *   Testknoten waehlt nie eine Adresse des Hauptnetzes an.
 */
export function seedListe(eingetragen: string, hauptnetz: boolean): string[] {
  const erster = eingetragen.trim();
  if (!erster) return [];
  const liste = [erster];
  if (hauptnetz) for (const s of WEITERE_SEEDS) if (!liste.includes(s)) liste.push(s);
  return liste;
}
/** So meldet sich das Programm bei einem Pool. */
const POOL_AGENT = `yskar-node-core/${VERSION}`;
/** So lange gilt die Antwort eines Pools, bevor er neu gefragt wird. */
const POOL_STAND_GILT_MS = 10_000;
/** Abstand, in dem der Pool befragt wird, in dem gerade gemint wird. */
const POOL_TAKT_MS = 20_000;
/** Abstand der Messpunkte fuer den Verlauf der Leistung, und wie viele bleiben. */
const LEISTUNG_TAKT_MS = 15_000;
const LEISTUNG_PUNKTE = 240;
/** So oft wird das Fenster des eigenen Pools gesichert. */
const FENSTER_TAKT_MS = 120_000;
/** Mehr Zeilen zeigt die Liste "Miner im Pool" nicht. */
const POOL_MINER_ZEILEN = 64;

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

/**
 * Kommt die Verbindung vom eigenen PC oder aus dem eigenen Netz?
 * Private Bereiche nach RFC 1918, die eigene Schleife, Adressen ohne Router
 * (169.254/16, fe80::/10) und eigene IPv6-Netze (fc00::/7).
 */
export function istPrivateQuelle(adresse: string | undefined): boolean {
  if (!adresse) return false;
  let a = adresse.toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (m) {
    const x = Number(m[1]), y = Number(m[2]);
    return x === 127 || x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254);
  }
  return /^fe[89ab][0-9a-f]:/.test(a) || /^f[cd][0-9a-f]{2}:/.test(a);
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
  /** Minuten ohne Regung, nach denen sich die Wallet sperrt. 0 = nie. */
  sperreMinuten: number;
  /** Beim Schliessen des Fensters weiterlaufen (Infobereich neben der Uhr). */
  imHintergrund: boolean;
  /** Mining nach dem Start fortsetzen, wenn es beim Beenden lief. */
  miningFortsetzen: boolean;
  /** Beim Start bei GitHub nachsehen, ob es eine neuere Version gibt. */
  updatesSuchen: boolean;
}

const SPERRE_WAHL = [0, 5, 10, 30];
const VORGABE_EINSTELLUNGEN: Einstellungen = {
  sprache: 'de', knotenSofort: true, sperreMinuten: 10,
  imHintergrund: false, miningFortsetzen: false, updatesSuchen: true,
};
/** So lange wird nach dem Start versucht, das Mining fortzusetzen -- der Knoten muss erst aufholen. */
const FORTSETZEN_TAKT_MS = 5_000;
const FORTSETZEN_VERSUCHE = 720;
/** Abstand, in dem ein laufendes Programm erneut nach einer neuen Version sieht. */
const UPDATE_TAKT_MS = 24 * 3600_000;

function pruefeEinstellungen(roh: unknown, basis: Einstellungen): Einstellungen {
  const e = { ...basis };
  if (roh === null || typeof roh !== 'object') return e;
  const r = roh as Record<string, unknown>;
  if (r.sprache === 'de' || r.sprache === 'en') e.sprache = r.sprache;
  if (typeof r.knotenSofort === 'boolean') e.knotenSofort = r.knotenSofort;
  if (typeof r.sperreMinuten === 'number' && SPERRE_WAHL.includes(r.sperreMinuten)) e.sperreMinuten = r.sperreMinuten;
  if (typeof r.imHintergrund === 'boolean') e.imHintergrund = r.imHintergrund;
  if (typeof r.miningFortsetzen === 'boolean') e.miningFortsetzen = r.miningFortsetzen;
  if (typeof r.updatesSuchen === 'boolean') e.updatesSuchen = r.updatesSuchen;
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
  /** Wo nach einer neuen Version gesucht wird. In Tests: ein eigener Server. */
  updateQuelle?: string;
  /** Abstand der Versuche, das Mining nach dem Start fortzusetzen. */
  fortsetzenTaktMs?: number;
}

export type { Huelle } from './Programm.ts';

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
  private wallet: WalletDienst;
  /** Verlauf der Wallet aus der Kette -- gilt, bis ein neuer Block kommt. */
  private verlaufMerker: { kopf: string; je: Map<string, KettenVerlauf> } | null = null;
  /** Bloecke je Name in der eigenen Kette -- fuer die Pool-Liste. */
  private namen = new NamenZaehler();
  /** Die Sitzungen beim Pool: je Geraet eine. */
  private poolQuellen: { cpu: PoolQuelle | null; gpu: PoolQuelle | null } = { cpu: null, gpu: null };
  /** Der Pool, in dem gerade gemint wird. null = solo oder gestoppt. */
  private poolAktiv: { eintrag: PoolEintrag; stand: PoolStand } | null = null;
  private poolTakt: ReturnType<typeof setInterval> | null = null;
  /** Warum das Mining im Pool von selbst geendet hat. */
  private poolEnde: { code: string; text: string; zeit: number; pool: string } | null = null;
  private poolMerker = new Map<string, { bis: number; stand: PoolStand }>();
  /** Verbindung zur Desktop-Huelle; null, wenn das Programm ohne sie laeuft. */
  private huelle: Huelle | null = null;
  private basis: string;
  private protokoll: Protokoll | null = null;
  /** Wo nach einer neuen Version gesucht wird; null = gar nicht (Tests). */
  private updateQuelle: string | null;
  private update: UpdateStand = { geprueft: null, neueste: null, neuer: false, url: RELEASES_SEITE, fehler: null };
  private updateLaeuft: Promise<UpdateStand> | null = null;
  private updateTakt: ReturnType<typeof setInterval> | null = null;
  private fortsetzenTakt: ReturnType<typeof setInterval> | null = null;
  private fortsetzenTaktMs: number;
  private ordnerMerker: { pfad: string; bis: number; bytes: number | null } | null = null;
  /** Der eigene Pool: Einstellungen, und was davon gerade laeuft. */
  private betrieb: BetriebEinstellung;
  private betriebPfad: string;
  private fensterPfad: string;
  /** Name und Plaetze des laufenden Pools -- sie gelten bis zu seinem naechsten Start. */
  private betriebLaeuft: { name: string; plaetze: number } | null = null;
  /** Warum der Pool nicht laeuft, obwohl er eingeschaltet ist. */
  private betriebFehler: string | null = null;
  private betriebFehlerCode: string | null = null;
  private fensterTakt: ReturnType<typeof setInterval> | null = null;
  private fensterGesichert = '';
  /** Zaehlt die Sicherungen des Fensters -- eine aeltere ueberschreibt nie eine neuere. */
  private fensterFolge = 0;
  /** Worauf die Schnittstelle des Knotens gerade lauscht. */
  private lauscht = '127.0.0.1';
  /** Leistung ueber die Zeit, seit dem letzten Start. */
  private leistung: { zeit: number; hashrate: number }[] = [];
  private leistungTakt: ReturnType<typeof setInterval> | null = null;
  /*
   * Zugangsschluessel der Oberflaeche. Entsteht bei jedem Start neu.
   *
   * Er steht NICHT mehr in der Seite (Befund S8): Die Seite konnte jedes
   * Programm abrufen, das 127.0.0.1 erreicht -- auch das eines anderen
   * Benutzers am selben PC -- und hatte damit den Schluessel, etwa um die
   * Auszahlungsadresse des Minings zu aendern. Jetzt bekommt ihn nur das
   * eigene Fenster: electron-main.mjs liest ihn ueber zugangFuerFenster()
   * im selben Prozess und setzt ihn als Cookie in die Sitzung des Fensters.
   *
   * Werkzeuge, die das Programm selbst starten (der Probelauf im Bau auf
   * GitHub), koennen ihn vorgeben: YSKAR_ZUGANG mit genau 64 Hexzeichen.
   * Wer die Umgebung des Prozesses setzen kann, ist ohnehin derselbe
   * Benutzer. Die Variable wird nach dem Lesen entfernt, damit Kindprozesse
   * (GPU-Miner) sie nicht erben.
   */
  private zugang = startZugang();
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
    address: '', ziel: 'solo', poolHost: '', mode: 'cpu',
    cpuWorkers: Math.max(1, cpus().length - 1),
    cpuIntensity: 100, gpuDevice: 0, blockName: '', lief: false,
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
    this.basis = base;
    this.protokoll = new Protokoll(join(base, 'protokoll.log'));
    // In Tests wird nicht bei GitHub gesucht -- ausser der Test nennt eine eigene Quelle.
    this.updateQuelle = opt.updateQuelle ?? (opt.params ? null : RELEASES_ABFRAGE);
    this.fortsetzenTaktMs = opt.fortsetzenTaktMs ?? FORTSETZEN_TAKT_MS;
    this.configPath = join(base, 'config.json');
    this.miningPfad = join(base, 'mining.json');
    this.einstellungenPfad = join(base, 'einstellungen.json');
    this.betriebPfad = join(base, 'pool.json');
    this.fensterPfad = join(base, 'pool-fenster.json');
    this.betrieb = ladeBetrieb(this.betriebPfad);
    this.einstellungen = ladeEinstellungen(this.einstellungenPfad);
    this.wallet = new WalletDienst(base);
    this.wallet.sperreMinuten = this.einstellungen.sperreMinuten;
    this.ladeMining();
    this.config = {
      dataDir: defaultDataDir(),
      nodePort: DEFAULT_NODE_PORT,
      p2pPort: DEFAULT_P2P_PORT,
      seed: DEFAULT_SEED,
    };
    if (existsSync(this.configPath)) {
      try {
        // Feld fuer Feld, mit denselben Grenzen wie beim Speichern. Was nicht
        // passt, faellt auf die Vorgabe zurueck -- eine von Hand veraenderte
        // Datei soll keinen Knoten auf Port 80 oder in "[object Object]" starten.
        const saved: unknown = JSON.parse(readFileSync(this.configPath, 'utf8'));
        if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('kein Objekt');
        const r = saved as Record<string, unknown>;
        const port = (x: unknown, vorgabe: number) =>
          typeof x === 'number' && Number.isInteger(x) && x >= 1024 && x <= 65535 ? x : vorgabe;
        if (typeof r.dataDir === 'string' && r.dataDir.trim() !== '') this.config.dataDir = r.dataDir.trim();
        this.config.nodePort = port(r.nodePort, DEFAULT_NODE_PORT);
        this.config.p2pPort = port(r.p2pPort, DEFAULT_P2P_PORT);
        if (this.config.nodePort === this.config.p2pPort) {
          this.config.nodePort = DEFAULT_NODE_PORT; this.config.p2pPort = DEFAULT_P2P_PORT;
        }
        if (typeof r.seed === 'string') {
          const seed = r.seed.trim();
          try { if (seed) this.parseSeed(seed); this.config.seed = seed; } catch { /* Vorgabe bleibt */ }
        }
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
    this.protokoll?.schreibe(text);
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
      if (d.ziel === 'solo' || d.ziel === 'pool') this.mining_.ziel = d.ziel;
      if (typeof d.poolHost === 'string') this.mining_.poolHost = hostAusEingabe(d.poolHost) ?? '';
      if (typeof d.lief === 'boolean') this.mining_.lief = d.lief;
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
    if (this.poolAktiv) {
      // Der Block liegt beim Pool-Knoten, nicht hier -- er gibt ihn ins Netz.
      this.log(`BLOCK IM POOL GEFUNDEN (${quelle}) #${height} · ${this.poolAnzeige(this.poolAktiv.eintrag, this.poolAktiv.stand)}`);
      return;
    }
    this.log(`BLOCK GEFUNDEN (${quelle}) #${height} · ${hash.slice(0, 32)}…`);
    const n = this.sync?.kuendigeAn(this.hexToBytes(hash)) ?? 0;
    if (n > 0) this.log(`  an ${n} Peer${n > 1 ? 's' : ''} gemeldet`);
    this.minerNeuAusrichten();
  }

  /** Was die eingebauten Miner gerade leisten -- fuer die Statistik. */
  private interneStatistik(): LokaleStatistik | null {
    // Im Pool zaehlt der Pool-Knoten diese Miner -- hier noch einmal waere doppelt.
    if (this.poolAktiv) return null;
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
  private miningBereit(jetzt: number = Date.now()): { bereit: boolean; grund: string | null; code?: string; werte?: number[] } {
    const peers = this.peers?.info() ?? [];
    if (peers.length === 0) {
      return { bereit: false, code: 'bereit_kein_peer', grund: 'Noch kein Peer verbunden. Ohne Verbindung zum Netz wäre ein gefundener Block wertlos. Bitte kurz warten.' };
    }
    const ausgehend = peers.filter(p => p.richtung === 'aus');
    const massgeblich = ausgehend.length > 0 ? ausgehend : peers;

    const hoehe = this.chain?.tip()?.height ?? -1;
    const ziel = median(massgeblich.map(p => p.height));
    const offen = this.sync?.fehlendeBloecke() ?? 0;

    let grund: string | null = null;
    let code = '';
    let werte: number[] = [];
    if (hoehe < ziel - 1) {
      code = 'bereit_sync_hoehe'; werte = [Math.max(0, hoehe), ziel];
      grund = `Der Knoten synchronisiert noch (Höhe ${Math.max(0, hoehe)} von ${ziel}). Das Mining startet erst, wenn er auf dem Stand des Netzes ist.`;
    } else if (offen > 1) {
      code = 'bereit_sync_bloecke'; werte = [offen];
      // Die Hoehe der Peers stammt vom Verbindungsaufbau und kann Stunden
      // alt sein. Dann zaehlt, was der Abgleich gerade nachlaedt. Ein
      // einzelner Block in der Warteschlange ist bei jedem neuen Block normal.
      grund = `Der Knoten synchronisiert noch (${offen} Blöcke fehlen). Das Mining startet erst, wenn er auf dem Stand des Netzes ist.`;
    }
    if (grund === null) return { bereit: true, grund: null };

    // Rueckstand behauptet, aber seit einer Weile kommt nichts: nicht gedeckt.
    if (jetzt - this.fortschritt > SYNC_GEDULD_MS) return { bereit: true, grund: null };
    return { bereit: false, grund, code, werte };
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
      startklar: this.running ? this.miningBereit() : { bereit: false, grund: 'Zuerst den Full Node starten.', code: 'knoten_aus' },
      pool: this.poolStatus(),
      poolEnde: this.poolEnde,
      // Welche Adressen in der gepflegten Liste stehen -- alles andere ist von Hand eingetragen.
      poolListe: POOLS.map(p => p.host),
      poolName: this.mining_.poolHost ? this.poolNameZuletzt(this.mining_.poolHost) : null,
      verlauf: this.leistung,
    };
  }

  // ------------------------------------------------------------------- Pool

  /** Ein Eintrag der Liste oder eine eigene Adresse. */
  private poolEintrag(host: string): PoolEintrag {
    if (host === this.eigenerPoolHost() && this.betriebLaeuft) {
      return { host, name: this.betriebLaeuft.name, kette: this.betriebLaeuft.name };
    }
    return POOLS.find(p => p.host === host) ?? { host, name: host };
  }

  /** Unter dieser Adresse erreichen die eigenen Miner den eigenen Pool. */
  private eigenerPoolHost(): string {
    return `http://127.0.0.1:${this.config.nodePort}`;
  }

  /*
   * Wie ein Pool in der Oberflaeche heisst. Die Pools der Liste tragen den
   * Namen aus der Liste. Eine von Hand eingetragene Adresse hat dort keinen;
   * dann gilt der Name, den der Pool in seine Bloecke schreibt -- eine
   * Selbstauskunft, deshalb steht die Adresse immer daneben.
   */
  private poolAnzeige(eintrag: PoolEintrag, stand: PoolStand): string {
    if (eintrag.host === this.eigenerPoolHost() && this.betriebLaeuft) return this.betriebLaeuft.name;
    return POOLS.some(p => p.host === eintrag.host) ? eintrag.name : (stand.kette ?? eintrag.name);
  }

  /** Einen Pool fragen -- die Antwort gilt POOL_STAND_GILT_MS lang. */
  private async poolStandVon(eintrag: PoolEintrag, adresse?: string): Promise<PoolStand> {
    const schluessel = eintrag.host + ' ' + (adresse ?? '');
    const m = this.poolMerker.get(schluessel);
    if (m && m.bis > Date.now()) return m.stand;
    const stand = await fragePool(eintrag, POOL_AGENT, { address: adresse ?? null });
    if (this.poolMerker.size > 32) this.poolMerker.clear();
    this.poolMerker.set(schluessel, { bis: Date.now() + POOL_STAND_GILT_MS, stand });
    return stand;
  }

  /** Name des gewaehlten Pools, soweit er schon einmal geantwortet hat. */
  private poolNameZuletzt(host: string): string {
    const eintrag = this.poolEintrag(host);
    for (const [schluessel, m] of this.poolMerker) {
      if (schluessel.startsWith(host + ' ')) return this.poolAnzeige(eintrag, m.stand);
    }
    return eintrag.name;
  }

  /** Gefundene Bloecke je Pool -- aus der eigenen Kette, ueber den Namen im Block. */
  private mitBloecken(stand: PoolStand): PoolStand {
    if (!this.store || !this.chain || !this.running || !stand.kette) return stand;
    const chain = this.chain;
    const z = this.namen.zahlen(this.store, () => chain.tip()?.height ?? null);
    return z ? { ...stand, bloecke: z.get(stand.kette)?.zahl ?? 0 } : stand;
  }

  /*
   * Die Pools zur Auswahl: die gepflegte Liste und, wenn angegeben, eine
   * eigene Adresse.
   *
   * Gefragt wird OHNE die Mining-Adresse. Sie geht erst beim Start an einen
   * Pool -- und dann nur an den gewaehlten.
   */
  private async poolListe(eigen: string | null) {
    const eintraege: (PoolEintrag & { eigen?: boolean; hier?: boolean })[] = [...POOLS];
    // Der eigene Pool steht zuerst -- solange er laeuft.
    if (this.miningServer?.poolKoordinator && this.betriebLaeuft) {
      eintraege.unshift({ ...this.poolEintrag(this.eigenerPoolHost()), hier: true });
    }
    let eigenFehler: string | null = null;
    if (eigen !== null && eigen.trim() !== '') {
      const host = hostAusEingabe(eigen);
      if (!host) eigenFehler = 'Das ist keine Adresse eines Pools.';
      else if (!eintraege.some(e => e.host === host)) eintraege.push({ host, name: host, eigen: true });
    }
    const pools = await Promise.all(eintraege.map(async e => {
      const stand = this.mitBloecken(await this.poolStandVon(e));
      return { ...stand, anzeige: this.poolAnzeige(e, stand), eigen: e.eigen === true, hier: e.hier === true };
    }));
    return { pools, eigenFehler };
  }

  /** Stand der Verbindung zum Pool, in dem gerade gemint wird. */
  private poolStatus() {
    const a = this.poolAktiv;
    if (!a) return null;
    const q = [this.poolQuellen.cpu, this.poolQuellen.gpu].filter((x): x is PoolQuelle => x !== null).map(x => x.stand());
    const summe = (f: (s: ReturnType<PoolQuelle['stand']>) => number) => q.reduce((n, s) => n + f(s), 0);
    const zuletzt = q.map(s => s.letzterShare).filter((x): x is number => x !== null);
    // Die letzte Auszahlung steht in der Kette -- nicht beim Pool erfragt.
    let auszahlung = null;
    if (isValidAddress(this.mining_.address)) {
      const l = this.kettenVerlauf(this.mining_.address).letztePool;
      if (l && (!a.stand.kette || l.name === a.stand.kette)) auszahlung = l;
    }
    return {
      host: a.eintrag.host,
      name: this.poolAnzeige(a.eintrag, a.stand),
      stand: this.mitBloecken(a.stand),
      // Verbunden heisst: angemeldet, und der letzte Austausch ging gut.
      verbunden: q.length > 0 && q.every(s => s.angemeldet && s.fehler === null),
      fehler: q.find(s => s.fehler !== null)?.fehler ?? null,
      angenommen: summe(s => s.angenommen),
      abgelehnt: summe(s => s.abgelehnt),
      bloecke: summe(s => s.bloecke),
      letzterShare: zuletzt.length ? Math.max(...zuletzt) : null,
      shareDifficulty: {
        cpu: this.poolQuellen.cpu?.stand().shareDifficulty ?? null,
        gpu: this.poolQuellen.gpu?.stand().shareDifficulty ?? null,
      },
      auszahlung,
    };
  }

  /** Beim Pool abmelden -- die Plaetze werden sofort frei. */
  private async beendePool(): Promise<void> {
    if (this.poolTakt) clearInterval(this.poolTakt);
    this.poolTakt = null;
    const q = [this.poolQuellen.cpu, this.poolQuellen.gpu];
    this.poolQuellen = { cpu: null, gpu: null };
    this.poolAktiv = null;
    await Promise.all(q.map(x => x?.beenden()));
  }

  /*
   * Der Pool nimmt diesen Miner nicht mehr: voll, oder er betreibt keinen
   * Pool mehr. Dann stoppt das Mining und sagt warum. Es rechnet NIE
   * stillschweigend solo weiter -- wer "Pool" gewaehlt hat, will teilen.
   */
  private poolAbbruch(e: PoolEndgueltig): void {
    const a = this.poolAktiv;
    if (!a) return;
    this.poolEnde = { code: e.code, text: e.message, zeit: Date.now(), pool: this.poolAnzeige(a.eintrag, a.stand) };
    this.log(`Mining im Pool beendet: ${e.message}`);
    // Der Pool hat abgelehnt -- das soll sich nach dem naechsten Start nicht von selbst wiederholen.
    this.merkeLief(false);
    void this.stopMining().catch(() => {});
  }

  // --------------------------------------------------------- Pool betreiben

  /*
   * Die Difficulty, die die Groesse des Fensters bestimmt: die des letzten
   * Blocks -- dieselbe, mit der die Auszahlung rechnet (MiningServer.job).
   *
   * NICHT die des offenen Jobs. Die sinkt, wenn lange kein Block kam
   * (Notfallregel), und ein danach bemessenes Fenster waere voruebergehend
   * viel kleiner. Wuerde in so einem Moment aufgeraeumt, fiele Arbeit weg,
   * die bei der naechsten Auszahlung noch zaehlt. null: Es gibt noch keinen
   * Block -- dann wird nichts bemessen.
   */
  private netzDifficulty(): bigint | null {
    const d = this.chain?.tip()?.difficulty;
    return d !== undefined && d > 0n ? d : null;
  }

  /*
   * Den eigenen Pool starten -- wenn er eingeschaltet ist und der Knoten
   * laeuft. Scheitert das (kein Name, keine Wallet fuer die Gebuehr), laeuft
   * der Knoten ohne Pool weiter, und der Grund steht in der Oberflaeche.
   */
  private starteBetrieb(): void {
    const server = this.miningServer;
    this.betriebFehler = null;
    this.betriebFehlerCode = null;
    if (!server || !this.betrieb.aktiv || server.poolKoordinator) return;
    try {
      const name = pruefePoolName(this.betrieb.name);
      const stand = leseFenster(this.fensterPfad, this.params.network);
      if (stand.hinweis) this.log(`Fenster des Pools: ${stand.hinweis}`);
      const adresse = this.wallet.stand().adresse;
      const auszahlung = adresse ? decodeAddress(adresse) : null;
      if (this.betrieb.feeBps > 0 && !auszahlung) {
        throw new KernFehler('wallet_fehlt', 'Für eine Gebühr braucht der Pool eine Wallet, an die sie geht.');
      }
      /*
        Liegt noch Arbeit im Fenster, gilt fuer sie die Gebuehr von damals --
        die neue erst ab dem naechsten Block, wie im laufenden Betrieb.
      */
      let fee = this.betrieb.feeBps;
      if (stand.eintraege.length > 0 && stand.feeBps !== null && stand.feeBps !== fee) {
        fee = stand.feeBps > 0 && !auszahlung ? 0 : stand.feeBps;
      }
      const pk = new PoolCoordinator({
        name, feeBps: fee, payoutAddress: auszahlung,
        maxMiner: Math.min(this.betrieb.plaetze, platzGrenze(Math.max(fee, this.betrieb.feeBps))),
      });
      if (fee !== this.betrieb.feeBps) pk.setzeGebuehr(this.betrieb.feeBps, auszahlung);
      pk.laden(stand.eintraege);
      server.poolKoordinator = pk;
      server.blockName = nameToExtra(name);
      this.betriebLaeuft = { name, plaetze: this.betrieb.plaetze };
      this.fensterGesichert = '';
      this.fensterTakt = setInterval(() => { void this.sichereFenster(); }, FENSTER_TAKT_MS);
      this.fensterTakt.unref?.();
      this.log(`Pool gestartet: ${name} · Gebühr ${(fee / 100).toFixed(2)} % · ${pk.plaetze()} Plätze`
        + (stand.eintraege.length ? ` · ${stand.eintraege.length} Shares aus dem letzten Lauf` : ''));
    } catch (e) {
      this.betriebFehler = (e as Error).message;
      this.betriebFehlerCode = e instanceof KernFehler ? e.code : null;
      this.log(`Pool nicht gestartet: ${this.betriebFehler}`);
    }
  }

  /** Das Fenster kuerzen, wenn es weit ueber das hinausgewachsen ist, was zaehlen kann. */
  private pflegeFenster(pk: PoolCoordinator): void {
    const d = this.netzDifficulty();
    // Nur mit einer Kette, die auf dem Stand ist: Waehrend des Aufholens gehoert
    // die Difficulty zu einem alten Block und sagt nichts ueber das Fenster von heute.
    const peers = this.peers?.info() ?? [];
    const hoehe = this.chain?.tip()?.height ?? -1;
    const holtAuf = peers.some(p => p.height > hoehe) || (this.sync?.fehlendeBloecke() ?? 0) > 1;
    if (d === null || holtAuf) return;
    const behalten = fensterGroesse(d) * 3n;
    if (pk.arbeitGesamt() > behalten * 2n) pk.laden(kuerze(pk.exportieren(), behalten));
  }

  private async sichereFenster(): Promise<void> {
    const pk = this.miningServer?.poolKoordinator;
    if (!pk) return;
    this.pflegeFenster(pk);
    const fee = pk.einstellungen().feeBps;
    const stand = `${pk.eintraege()}:${pk.arbeitGesamt()}:${fee}`;
    if (stand === this.fensterGesichert) return;
    const folge = ++this.fensterFolge;
    try {
      // Nur umbenennen, wenn inzwischen niemand einen neueren Stand geschrieben hat.
      const geschrieben = await schreibeFenster(this.fensterPfad, this.params.network, fee, pk.exportieren(),
        () => folge === this.fensterFolge);
      if (geschrieben) this.fensterGesichert = stand;
    } catch (e) { this.log(`Fenster des Pools nicht gesichert: ${(e as Error).message}`); }
  }

  /*
   * Den eigenen Pool anhalten. Die Sitzungen der Miner enden -- sonst
   * bekaemen sie weiter Arbeit, aber ohne Pool mit einer Coinbase an eine
   * einzige Adresse. Das Fenster bleibt gesichert: Die Arbeit darin wurde
   * geleistet und zaehlt, wenn der Pool wieder laeuft.
   */
  private stoppeBetrieb(): void {
    const server = this.miningServer;
    const pk = server?.poolKoordinator;
    if (this.fensterTakt) clearInterval(this.fensterTakt);
    this.fensterTakt = null;
    this.betriebLaeuft = null;
    if (!server || !pk) return;
    this.fensterFolge++;
    try { schreibeFensterSofort(this.fensterPfad, this.params.network, pk.einstellungen().feeBps, pk.exportieren()); }
    catch (e) { this.log(`Fenster des Pools nicht gesichert: ${(e as Error).message}`); }
    const n = server.beendePoolSitzungen();
    server.poolKoordinator = null;
    server.blockName = new Uint8Array(0);
    this.log(`Pool angehalten${n ? ` · ${n} Sitzung${n > 1 ? 'en' : ''} beendet` : ''}`);
  }

  /*
   * Worauf die Schnittstelle des Knotens lauscht.
   *
   * Vorgabe: nur dieser PC. Mit laufendem Pool und "Im Heimnetz freigeben"
   * auch die anderen Geraete im eigenen Netz. Die Oberflaeche und die Wallet
   * bleiben davon unberuehrt -- sie haengen an einem anderen Anschluss, der
   * nie nach aussen zeigt.
   */
  /*
   * Wer die Schnittstelle des Knotens (Port 8645) benutzen darf.
   *
   * OHNE POOL ist sie nur fuer diesen PC da -- fuer einen Miner, der hier
   * ueber den eigenen Knoten rechnet. Eine Webseite im Browser hat dort
   * nichts verloren: Sie koennte sonst Sitzungen oeffnen und den Knoten
   * beschaeftigen. Deshalb: nur der eigene Rechnername (gegen umgebogene
   * Namen) und keine Anfrage, die von einer fremden Seite stammt.
   *
   * MIT POOL ist sie ein Angebot an andere: App und Mini App laufen im
   * Browser und kommen ueber die eigene Adresse des Betreibers herein. Dann
   * gilt nur noch eine Schranke: Die Anfrage muss vom eigenen PC oder aus
   * dem eigenen Netz kommen -- auch dann, wenn der Anschluss auf allen
   * Netzkarten lauscht und eine davon ins Internet zeigt.
   */
  private schnittstelleErlaubt(req: IncomingMessage): boolean {
    if (!istPrivateQuelle(req.socket.remoteAddress)) return false;
    if (this.miningServer?.poolKoordinator) return true;
    const eigen = [`127.0.0.1:${this.config.nodePort}`, `localhost:${this.config.nodePort}`];
    if (!eigen.includes(String(req.headers.host ?? '').toLowerCase())) return false;
    if (req.headers.origin !== undefined) return false;
    const site = req.headers['sec-fetch-site'];
    return site === undefined || site === 'same-origin' || site === 'none';
  }

  private lauschZiel(): string {
    return this.betrieb.heimnetz && !!this.miningServer?.poolKoordinator ? '0.0.0.0' : '127.0.0.1';
  }

  private async richteLauschen(): Promise<void> {
    const server = this.miningServer;
    const ziel = this.lauschZiel();
    if (!server || !this.running || ziel === this.lauscht) return;
    await server.close();
    try {
      await server.listen(ziel, this.config.nodePort);
      this.lauscht = ziel;
      this.log(ziel === '0.0.0.0' ? `Schnittstelle im Heimnetz freigegeben · Port ${this.config.nodePort}` : 'Schnittstelle wieder nur für diesen PC');
    } catch (e) {
      // Zurueck auf den eigenen PC -- ohne Schnittstelle kaemen auch die eigenen Miner nicht mehr an den Pool.
      await server.listen('127.0.0.1', this.config.nodePort);
      this.lauscht = '127.0.0.1';
      throw new KernFehler('heimnetz_fehler', `Freigabe im Heimnetz nicht möglich: ${(e as Error).message}`, [(e as Error).message]);
    }
  }

  /*
   * Die Wallet wurde angelegt oder entfernt, waehrend der Pool laeuft.
   *
   * Die Gebuehr geht an die Wallet dieses PCs. Gibt es eine andere, geht sie
   * ab dem naechsten Block dorthin. Gibt es keine mehr, kann ein Pool mit
   * Gebuehr nicht weiterlaufen -- er haelt an und sagt warum.
   */
  private walletGeaendert(): void {
    const pk = this.miningServer?.poolKoordinator;
    if (!pk) { if (this.betrieb.aktiv && this.running) { this.starteBetrieb(); void this.richteLauschen().catch(() => {}); } return; }
    const adresse = this.wallet.stand().adresse;
    const e = pk.einstellungen();
    if (adresse) { pk.setzeGebuehr(e.feeBpsAbNaechstem ?? e.feeBps, decodeAddress(adresse)); return; }
    if (e.feeBps > 0 || (e.feeBpsAbNaechstem ?? 0) > 0) {
      this.stoppeBetrieb();
      this.betriebFehler = 'Für eine Gebühr braucht der Pool eine Wallet, an die sie geht.';
      this.betriebFehlerCode = 'wallet_fehlt';
      void this.richteLauschen().catch(() => {});
    }
  }

  /** Einstellungen des eigenen Pools aendern -- und anwenden, soweit der Knoten laeuft. */
  private async setzeBetrieb(body: Record<string, unknown>) {
    const neu = pruefeBetrieb(body, this.betrieb, true);
    if (neu.aktiv) {
      neu.name = pruefePoolName(neu.name);
      if (neu.feeBps > 0 && !this.wallet.stand().adresse) {
        throw new KernFehler('wallet_fehlt', 'Für eine Gebühr braucht der Pool eine Wallet, an die sie geht.');
      }
    }
    const vorher = this.betrieb;
    this.betrieb = neu;
    try { speichereBetrieb(this.betriebPfad, neu); }
    catch (e) { this.log(`pool.json nicht gespeichert: ${(e as Error).message}`); }

    const server = this.miningServer;
    if (server && this.running) {
      const pk = server.poolKoordinator;
      if (neu.aktiv && !pk) this.starteBetrieb();
      else if (!neu.aktiv && pk) this.stoppeBetrieb();
      else if (pk && neu.feeBps !== vorher.feeBps) {
        // Wirkt ab dem naechsten Block -- die Arbeit bis dahin lief unter der alten Gebuehr.
        const adresse = this.wallet.stand().adresse;
        pk.setzeGebuehr(neu.feeBps, adresse ? decodeAddress(adresse) : null);
        this.log(`Pool: Gebühr ab dem nächsten Block ${(neu.feeBps / 100).toFixed(2)} %`);
      }
      await this.richteLauschen();
    }
    return this.betriebStatus();
  }

  /** Wer im Fenster steht -- neu gerechnet nur, wenn sich etwas geaendert hat. */
  private fensterMerker: { stand: string; anteile: ReturnType<PoolCoordinator['fenster']> } | null = null;
  private fensterAnteile(pk: PoolCoordinator): ReturnType<PoolCoordinator['fenster']> {
    const d = this.netzDifficulty() ?? 1n;
    const stand = `${pk.eintraege()}:${pk.arbeitGesamt()}:${d}`;
    if (this.fensterMerker?.stand !== stand) this.fensterMerker = { stand, anteile: pk.fenster(d) };
    return this.fensterMerker.anteile;
  }

  /** Stand des eigenen Pools fuer die Oberflaeche. */
  private betriebStatus() {
    const server = this.miningServer;
    const pk = this.running ? server?.poolKoordinator ?? null : null;
    const wallet = this.wallet.stand().adresse;
    const grenze = platzGrenze(this.betrieb.feeBps);
    const basis = {
      config: this.betrieb,
      laeuft: !!pk,
      fehler: pk ? null : this.betriebFehler,
      fehlerCode: pk ? null : this.betriebFehlerCode,
      grenze,
      auszahlung: wallet,
      heimnetz: {
        offen: this.lauscht === '0.0.0.0',
        adressen: heimnetzAdressen().map(ip => `http://${ip}:${this.config.nodePort}`),
      },
      eigenerHost: this.eigenerPoolHost(),
    };
    if (!pk || !server) {
      return { ...basis, angewandt: null, neustartNoetig: false, auskunft: null, bloecke: null, letzterBlock: null,
               eigenerMiner: false, miner: [] as unknown[], weitere: 0 };
    }

    const e = pk.einstellungen();
    const a = server.poolAuskunft() ?? {};
    const chain = this.chain;
    const namen = this.store && chain ? this.namen.zahlen(this.store, () => chain.tip()?.height ?? null) : null;
    const funde = namen?.get(e.name) ?? null;

    // Wer im Fenster steht und wer gerade verbunden ist -- je Adresse eine Zeile.
    const fenster = this.fensterAnteile(pk);
    let gesamt = 0n;
    for (const f of fenster) gesamt += f.work;
    // hashrate bleibt null, bis der Pool sie messen konnte -- dafuer braucht er ein paar Shares.
    const je = new Map<string, { work: bigint; hashrate: number | null; letzterShare: number | null; sitzungen: number }>();
    for (const f of fenster) je.set(toHex(f.to), { work: f.work, hashrate: null, letzterShare: null, sitzungen: 0 });
    for (const x of server.poolSitzungen()) {
      const z = je.get(x.addressHex) ?? { work: 0n, hashrate: null, letzterShare: null, sitzungen: 0 };
      if (x.hashrate !== null) z.hashrate = (z.hashrate ?? 0) + x.hashrate;
      z.sitzungen++;
      if (x.letzterShare !== null && (z.letzterShare === null || x.letzterShare > z.letzterShare)) z.letzterShare = x.letzterShare;
      je.set(x.addressHex, z);
    }
    const eigene = new Set([wallet, isValidAddress(this.mining_.address) ? this.mining_.address : null]);
    const alle = [...je.entries()]
      .sort((x, y) => (y[1].work > x[1].work ? 1 : y[1].work < x[1].work ? -1 : (y[1].hashrate ?? 0) - (x[1].hashrate ?? 0)));
    const miner = alle.slice(0, POOL_MINER_ZEILEN).map(([hex, z]) => {
      const adresse = encodeAddress(this.hexToBytes(hex));
      return {
        adresse,
        du: eigene.has(adresse),
        hashrate: z.hashrate,
        // Anteil an der Arbeit im Fenster, in Zehntausendsteln.
        anteil: gesamt > 0n ? Number((z.work * 10_000n) / gesamt) / 10_000 : 0,
        letzterShare: z.letzterShare,
        verbunden: z.sitzungen > 0,
      };
    });

    return {
      ...basis,
      angewandt: { name: e.name, plaetze: this.betriebLaeuft?.plaetze ?? pk.plaetze(), feeBps: e.feeBps, feeBpsNaechster: e.feeBpsAbNaechstem },
      // Name und Plaetze gelten erst nach einem Neustart des Pools.
      neustartNoetig: !!this.betriebLaeuft
        && (this.betriebLaeuft.name !== this.betrieb.name.trim() || this.betriebLaeuft.plaetze !== this.betrieb.plaetze),
      auskunft: {
        miner: Number(a.miner ?? 0), belegt: Number(a.belegt ?? 0), plaetze: Number(a.plaetze ?? pk.plaetze()),
        frei: Number(a.frei ?? 0), hashrate: Number(a.hashrate ?? 0),
      },
      bloecke: funde ? funde.zahl : namen ? 0 : null,
      letzterBlock: funde ? funde.letzte : null,
      eigenerMiner: this.poolAktiv?.eintrag.host === this.eigenerPoolHost(),
      miner,
      weitere: Math.max(0, alle.length - miner.length),
    };
  }

  private merkeLeistung(): void {
    const cpu = this.cpuMiner?.status(), gpu = this.gpuMiner?.status();
    if (!cpu?.running && !gpu?.running) return;
    const h = (cpu?.running ? cpu.hashrate : 0) + (gpu?.running ? gpu.hashrate : 0);
    this.leistung.push({ zeit: Date.now(), hashrate: Number.isFinite(h) ? Math.max(0, Math.round(h)) : 0 });
    if (this.leistung.length > LEISTUNG_PUNKTE) this.leistung.shift();
  }

  /*
   * Mining starten.
   *
   * Adresse ueber die bestehende Pruefung aus core/address.ts -- keine
   * eigene Adresslogik. Im Modus "beide" startet die CPU auch dann, wenn die
   * GPU nicht verfuegbar ist; der Grund steht in der Antwort.
   *
   * Solo kommt die Arbeit vom eigenen Knoten, im Pool vom Pool-Knoten
   * (PoolQuelle.ts). Die Miner selbst sind in beiden Faellen dieselben.
   */
  /*
   * Start und Stopp laufen NACHEINANDER, nie ineinander. Beide warten
   * zwischendurch -- auf den Pool, auf den Selbsttest der Grafikkarte. Kaeme
   * in dieser Zeit ein Stopp dazwischen, liefe der Start danach weiter und
   * setzte fort, was eben gestoppt wurde; zwei Starts zugleich hoben sich
   * gegenseitig auf.
   */
  private miningFolge: Promise<unknown> = Promise.resolve();
  private nacheinander<T>(tun: () => Promise<T>): Promise<T> {
    const lauf = this.miningFolge.then(tun, tun);
    this.miningFolge = lauf.then(() => {}, () => {});
    return lauf;
  }
  private startMining(body: Record<string, unknown>) { return this.nacheinander(() => this.starteMining(body)); }
  private stopMining() { return this.nacheinander(() => this.stoppeMining()); }

  private async starteMining(body: Record<string, unknown>) {
    if (!this.running || !this.cpuMiner || !this.gpuMiner) {
      throw new KernFehler('knoten_aus', 'Zuerst den Full Node starten.');
    }
    const cpuMiner = this.cpuMiner, gpuMiner = this.gpuMiner;
    const address = String(body.address ?? this.mining_.address).trim().toLowerCase();
    if (!isValidAddress(address)) throw new KernFehler('adresse_falsch', 'Das ist keine gültige YSKAR-Adresse.');

    const ziel: MiningZiel = body.ziel === 'pool' || body.ziel === 'solo' ? body.ziel : this.mining_.ziel;
    let poolHost = this.mining_.poolHost;
    let pool: { eintrag: PoolEintrag; stand: PoolStand } | null = null;

    if (ziel === 'pool') {
      /*
        Im Pool rechnet der Miner an der Kette des POOL-Knotens. Ob der
        eigene Knoten schon auf dem Stand des Netzes ist, spielt dafuer
        keine Rolle -- gefragt wird stattdessen der Pool: Gibt es ihn, und
        hat er einen Platz fuer diese Adresse?
      */
      const host = hostAusEingabe(String(body.poolHost ?? this.mining_.poolHost ?? ''));
      if (!host) throw new KernFehler('pool_fehlt', 'Bitte zuerst einen Pool wählen.');
      poolHost = host;
      const eintrag = this.poolEintrag(host);
      const stand = await fragePool(eintrag, POOL_AGENT, { address });
      if (stand.status === 'aus') throw new KernFehler('pool_aus', 'Der Pool antwortet nicht.');
      if (stand.status === 'keinPool') throw new KernFehler('pool_unavailable', 'Unter dieser Adresse läuft kein Pool.');
      if (!waehlbar(stand)) throw new KernFehler('pool_full', 'Der Pool ist voll: Alle Plätze sind belegt.');
      if (host === this.eigenerPoolHost()) {
        // Der eigene Pool baut auf der EIGENEN Kette -- dann gilt dieselbe
        // Pruefung wie solo.
        const bereit = this.miningBereit();
        if (!bereit.bereit) throw new KernFehler(bereit.code ?? 'nicht_bereit', bereit.grund ?? 'Der Knoten ist noch nicht bereit.', bereit.werte);
      }
      pool = { eintrag, stand };
    } else {
      const stand = this.miningBereit();
      if (!stand.bereit) throw new KernFehler(stand.code ?? 'nicht_bereit', stand.grund ?? 'Der Knoten ist noch nicht bereit.', stand.werte);
    }

    const mode = body.mode === 'gpu' || body.mode === 'beide' ? body.mode : 'cpu';
    const kerne = cpus().length;
    const cpuWorkers = Math.max(1, Math.min(kerne, Math.floor(Number(body.cpuWorkers ?? this.mining_.cpuWorkers)) || 1));
    const cpuIntensity = Math.max(10, Math.min(100, Math.round(Number(body.cpuIntensity ?? this.mining_.cpuIntensity)) || 100));
    const gpuDevice = Math.max(0, Math.floor(Number(body.gpuDevice ?? this.mining_.gpuDevice)) || 0);

    /*
      Name im Block. Wird hier geprueft, nicht erst beim Bauen: Was einmal
      in einem Block steht, steht dort fuer immer. Im Pool traegt der Block
      den Namen des Pools -- der eigene bleibt fuer Solo gespeichert.
    */
    const blockName = String(body.blockName ?? this.mining_.blockName ?? '').trim();
    let extra: Uint8Array;
    try { extra = nameToExtra(blockName); }
    catch (e) { throw new KernFehler('block_name', `Name im Block: ${(e as Error).message}`); }

    // Erst alles anhalten: Die Quelle der Arbeit laesst sich nur im Stillstand wechseln.
    await cpuMiner.stop();
    await gpuMiner.stop();
    await this.beendePool();
    this.poolEnde = null;

    this.mining_ = { address, ziel, poolHost, mode, cpuWorkers, cpuIntensity, gpuDevice, blockName, lief: this.mining_.lief };
    this.speichereMining();

    cpuMiner.setExtra(extra);
    gpuMiner.setExtra(extra);

    const hinweise: string[] = [];
    const hinweisCodes: { code: string; werte: string[] }[] = [];
    const adresse = decodeAddress(address);

    /*
      Im Pool bekommt jedes Geraet eine eigene Sitzung. Angemeldet wird
      HIER, vor dem Start des Rechnens: Lehnt der Pool ab, steht der Grund
      in der Antwort -- und nichts rechnet.
    */
    const quelle = async (geraet: 'cpu' | 'gpu'): Promise<PoolQuelle | null> => {
      if (!pool) return null;
      const q = new PoolQuelle(poolSchnittstelle(pool.eintrag.host), POOL_AGENT);
      this.poolQuellen[geraet] = q;
      try { await q.anmelden(adresse); }
      catch (e) {
        if (e instanceof PoolEndgueltig) throw new KernFehler(e.code, e.message);
        throw new KernFehler('pool_aus', `Anmeldung beim Pool gescheitert: ${(e as Error).message}`);
      }
      q.onEndgueltig = fehler => this.poolAbbruch(fehler);
      return q;
    };

    try {
      this.poolAktiv = pool;

      if (mode === 'cpu' || mode === 'beide') {
        cpuMiner.setzeQuelle(await quelle('cpu'));
        await cpuMiner.start(address, cpuWorkers, cpuIntensity);
      }

      if (mode === 'gpu' || mode === 'beide') {
        const e = this.gpuErkennung ?? await this.sucheGpu();
        const geraet = e.geraete.find(g => g.id === gpuDevice) ?? e.geraete[0];
        if (!e.verfuegbar || !geraet) {
          const grund = e.grund ?? 'Keine GPU gefunden.';
          if (mode === 'gpu') throw new KernFehler('gpu_nicht_moeglich', `GPU-Mining nicht möglich: ${grund}`, [grund]);
          hinweise.push(`GPU nicht gestartet: ${grund}`);
          hinweisCodes.push({ code: 'gpu_nicht_gestartet', werte: [grund] });
        } else {
          try {
            gpuMiner.setzeQuelle(await quelle('gpu'));
            await gpuMiner.start(adresse, geraet);
          } catch (fehler) {
            // Mit beiden Geraeten gewaehlt: Der Prozessor rechnet weiter.
            if (mode === 'gpu') throw fehler;
            await this.poolQuellen.gpu?.beenden();
            this.poolQuellen.gpu = null;
            hinweise.push(`GPU nicht gestartet: ${(fehler as Error).message}`);
            hinweisCodes.push({ code: 'gpu_nicht_gestartet', werte: [(fehler as Error).message] });
          }
        }
      }
    } catch (e) {
      // Ein halber Start bleibt nicht stehen.
      await this.stoppeMining();
      throw e;
    }

    if (pool) {
      const name = this.poolAnzeige(pool.eintrag, pool.stand);
      this.log(`Mining im Pool ${name}${name === pool.eintrag.host ? '' : ` (${pool.eintrag.host})`}`);
      // Nebenher fragen, wie es um den Pool steht -- Miner, Leistung, Gebuehr.
      this.poolTakt = setInterval(() => {
        const a = this.poolAktiv;
        if (!a) return;
        void fragePool(a.eintrag, POOL_AGENT, { address: this.mining_.address }).then(stand => {
          // Antwortet er gerade nicht, bleiben die letzten Zahlen stehen.
          if (this.poolAktiv === a && stand.status !== 'aus') a.stand = stand;
        });
      }, POOL_TAKT_MS);
      this.poolTakt.unref?.();
    }

    this.merkeLief(true);
    this.leistung = [];
    if (this.leistungTakt) clearInterval(this.leistungTakt);
    this.leistungTakt = setInterval(() => this.merkeLeistung(), LEISTUNG_TAKT_MS);
    this.leistungTakt.unref?.();

    return { ok: true, hinweise, hinweisCodes, status: this.miningStatus() };
  }

  private async stoppeMining() {
    if (this.leistungTakt) clearInterval(this.leistungTakt);
    this.leistungTakt = null;
    await this.cpuMiner?.stop();
    await this.gpuMiner?.stop();
    await this.beendePool();
    // Zurueck zum eigenen Knoten -- der naechste Start entscheidet neu.
    this.cpuMiner?.setzeQuelle(null);
    this.gpuMiner?.setzeQuelle(null);
    return { ok: true, status: this.miningStatus() };
  }

  async startGui(): Promise<void> {
    await new Promise<void>((resolveGui, reject) => {
      this.guiServer.once('error', reject);
      this.guiServer.listen(this.guiPort, '127.0.0.1', resolveGui);
    });
    this.log(`GUI-Server gestartet · 127.0.0.1:${this.guiPort}`);
    if (this.einstellungen.updatesSuchen && this.updateQuelle) {
      // Nebenher, mit etwas Abstand -- der Start soll davon nichts merken.
      setTimeout(() => { void this.pruefeUpdate(); }, 4_000).unref();
    }
    this.updateTakt = setInterval(() => {
      if (this.einstellungen.updatesSuchen) void this.pruefeUpdate();
    }, UPDATE_TAKT_MS);
    this.updateTakt.unref?.();
  }

  // ----------------------------------------------------------------- Huelle

  /** Die Desktop-Huelle meldet sich an. Ohne sie fehlen Dialoge, Infobereich und Autostart. */
  setzeHuelle(h: Huelle | null): void { this.huelle = h; }

  /** Soll das Programm weiterlaufen, wenn das Fenster geschlossen wird? */
  imHintergrund(): boolean { return this.einstellungen.imHintergrund; }

  sprache(): 'de' | 'en' { return this.einstellungen.sprache; }

  /** Darf diese Adresse im Browser geoeffnet werden? Liefert sie dann zurueck, sonst null. */
  linkErlaubt(url: unknown): string | null { return linkErlaubt(url); }

  private huelleStatus() {
    const h = this.huelle;
    let autostart: boolean | null = null;
    let infobereich = false;
    if (h) {
      try { autostart = h.autostart(); } catch { /* Windows gibt keine Auskunft */ }
      try { infobereich = h.infobereich(); } catch { /* dann eben nicht */ }
    }
    return { vorhanden: h !== null, autostart, infobereich };
  }

  private verlangeHuelle(): Huelle {
    if (!this.huelle) throw new KernFehler('ohne_huelle', 'Das geht nur im installierten Programm.');
    return this.huelle;
  }

  private async huelleAufruf(pfad: string, body: Record<string, unknown>) {
    const h = this.verlangeHuelle();
    if (pfad === '/api/huelle/ordner-waehlen') {
      return { pfad: await h.waehleOrdner(String(body.start ?? this.config.dataDir)) };
    }
    if (pfad === '/api/huelle/ordner-oeffnen') {
      // Nur die beiden eigenen Ordner -- kein Pfad aus der Anfrage.
      const ziel = body.welcher === 'daten' ? resolve(this.config.dataDir) : this.basis;
      // Nur ein ORDNER: Eine Datei wuerde Windows an dieser Stelle ausfuehren.
      if (!existsSync(ziel) || !statSync(ziel).isDirectory()) throw new KernFehler('ordner_fehlt', 'Den Ordner gibt es noch nicht.');
      await h.oeffneOrdner(ziel);
      return { ok: true };
    }
    if (pfad === '/api/huelle/link') {
      const url = linkErlaubt(body.url);
      if (!url) throw new KernFehler('link_gesperrt', 'Diese Adresse öffnet das Programm nicht.');
      await h.oeffneLink(url);
      return { ok: true };
    }
    if (pfad === '/api/huelle/autostart') {
      if (typeof body.an !== 'boolean') throw new Error('an fehlt.');
      h.setzeAutostart(body.an);
      return this.huelleStatus();
    }
    return null;
  }

  // ---------------------------------------------------------------- Updates

  /** Bei GitHub nachsehen. Laeuft schon eine Suche, wird auf sie gewartet. */
  private pruefeUpdate(): Promise<UpdateStand> {
    if (!this.updateQuelle) {
      return Promise.resolve({ ...this.update, fehler: 'Die Suche ist hier nicht eingerichtet.' });
    }
    const quelle = this.updateQuelle;
    this.updateLaeuft ??= sucheUpdate(VERSION, quelle, `yskar-node-core/${VERSION}`)
      .then(stand => {
        const bekannt = this.update.neuer ? this.update.neueste : null;
        // Ein Fehlschlag loescht nicht, was eine fruehere Suche gefunden hat.
        this.update = stand.fehler && this.update.neueste
          ? { ...this.update, geprueft: stand.geprueft, fehler: stand.fehler } : stand;
        if (stand.neuer && stand.neueste !== bekannt) this.log(`Neue Version verfügbar: ${stand.neueste}`);
        return this.update;
      })
      .finally(() => { this.updateLaeuft = null; });
    return this.updateLaeuft;
  }

  // ------------------------------------------------------ Mining fortsetzen

  private merkeLief(lief: boolean): void {
    if (this.mining_.lief === lief) return;
    this.mining_.lief = lief;
    this.speichereMining();
  }

  private beendeFortsetzen(): void {
    if (this.fortsetzenTakt) clearInterval(this.fortsetzenTakt);
    this.fortsetzenTakt = null;
  }

  /*
   * Nach dem Start des Knotens das Mining wieder aufnehmen -- wenn es so
   * eingestellt ist und das Mining beim letzten Beenden lief.
   *
   * Der Knoten muss erst aufholen; bis dahin lehnt startMining() ab, und es
   * wird in kurzen Abstaenden wieder versucht. Greift der Nutzer selbst ein
   * (starten oder stoppen), endet das Versuchen.
   */
  private planeFortsetzen(): void {
    this.beendeFortsetzen();
    if (!this.einstellungen.miningFortsetzen || !this.mining_.lief || !isValidAddress(this.mining_.address)) return;
    let versuche = 0;
    let letzterGrund = '';
    let laeuft = false;
    this.log('Mining wird fortgesetzt, sobald der Knoten bereit ist.');
    this.fortsetzenTakt = setInterval(async () => {
      if (laeuft) return;
      const rechnet = !!(this.cpuMiner?.status().running || this.gpuMiner?.status().running);
      if (!this.running || rechnet || ++versuche > FORTSETZEN_VERSUCHE) {
        if (versuche > FORTSETZEN_VERSUCHE) this.log('Mining nicht fortgesetzt: Der Knoten wurde nicht rechtzeitig bereit.');
        return this.beendeFortsetzen();
      }
      laeuft = true;
      try {
        await this.startMining({});
        this.log('Mining fortgesetzt.');
        this.beendeFortsetzen();
      } catch (e) {
        const grund = (e as Error).message;
        if (grund !== letzterGrund) { letzterGrund = grund; this.log(`Mining noch nicht fortgesetzt: ${grund}`); }
      } finally { laeuft = false; }
    }, this.fortsetzenTaktMs);
    this.fortsetzenTakt.unref?.();
  }

  /** Wie viel Platz der Datenordner belegt -- alle halbe Minute neu gezaehlt. */
  private datenBytes(): number | null {
    const pfad = resolve(this.config.dataDir);
    const m = this.ordnerMerker;
    if (m && m.pfad === pfad && m.bis > Date.now()) return m.bytes;
    const bytes = ordnerBytes(pfad);
    this.ordnerMerker = { pfad, bis: Date.now() + 30_000, bytes };
    return bytes;
  }

  async shutdown(): Promise<void> {
    if (this.updateTakt) clearInterval(this.updateTakt);
    this.updateTakt = null;
    await this.stopNode();
    if (this.guiServer.listening) {
      await new Promise<void>(resolveGui => {
        this.guiServer.close(() => resolveGui());
        // Das Fenster fragt alle zwei Sekunden und haelt seine Verbindung offen -- darauf wird nicht gewartet.
        this.guiServer.closeAllConnections();
      });
    }
  }

  private async configure(body: Record<string, unknown>): Promise<void> {
    const dataDir = String(body.dataDir || this.config.dataDir).trim();
    const nodePort = Number(body.nodePort || this.config.nodePort);
    const p2pPort = Number(body.p2pPort || this.config.p2pPort);
    const seed = String(body.seed ?? this.config.seed).trim();
    if (!dataDir) throw new KernFehler('datenordner_fehlt', 'Datenordner fehlt.');
    if (!Number.isInteger(nodePort) || nodePort < 1024 || nodePort > 65535) throw new KernFehler('port_node', 'Ungültiger Node-Port.');
    if (!Number.isInteger(p2pPort) || p2pPort < 1024 || p2pPort > 65535) throw new KernFehler('port_p2p', 'Ungültiger P2P-Port.');
    if (nodePort === p2pPort) throw new KernFehler('ports_gleich', 'Node-Port und P2P-Port müssen unterschiedlich sein.');
    if (seed) this.parseSeed(seed);
    // Der Assistent prueft seine Eingaben, bevor er sie festschreibt.
    if (body.nurPruefen === true) return;
    // Erst anlegen, dann uebernehmen: Scheitert das Anlegen -- etwa weil der
    // Pfad eine Datei ist --, bleibt die bisherige Einstellung stehen.
    mkdirSync(dataDir, { recursive: true });
    if (!statSync(dataDir).isDirectory()) throw new KernFehler('ordner_kein_ordner', 'Der Datenordner ist kein Ordner.');
    this.config = { dataDir, nodePort, p2pPort, seed };
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
    if (!this.configured) throw new KernFehler('nicht_eingerichtet', 'Assistent noch nicht abgeschlossen.');
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
    this.miningServer.zulassen = req => this.schnittstelleErlaubt(req);

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
    this.namen = new NamenZaehler();
    this.verlaufMerker = null;
    this.ordnerMerker = null;
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
      seeds: seedListe(this.config.seed, istMainnet(params)).map(s => this.parseSeed(s)),
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
          try { this.statistik?.aufnehmen(decodeStats(frame.payload), `v:${p.id}`); }
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
    this.starteBetrieb();
    this.lauscht = this.lauschZiel();
    await this.miningServer.listen(this.lauscht, this.config.nodePort);
    this.running = true;
    this.startedAt = Date.now();
    this.fortschritt = this.startedAt;
    this.log(`Full Node gestartet · ${params.network} · P2P :${this.config.p2pPort} · API :${this.config.nodePort}`);
    this.planeFortsetzen();
  }

  private parseSeed(seed: string): { host: string; port: number } {
    const i = seed.lastIndexOf(':');
    if (i < 1) throw new KernFehler('seed_format', `Seed "${seed}" muss host:port sein.`, [seed.slice(0, 80)]);
    const port = Number(seed.slice(i + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new KernFehler('seed_port', 'Ungültiger Seed-Port.');
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
    this.beendeFortsetzen();
    // Miner zuerst: Sie brauchen den Koordinator, und der haengt an der
    // Kette, die gleich geschlossen wird. Worker und GPU-Prozess sollen
    // nicht als Waisen weiterlaufen.
    // In der Reihe mit Start und Stopp: Ein Start, der gerade laeuft, ist vorher zu Ende.
    try { await this.stopMining(); } catch { /* lief nicht */ }
    if (this.statsTakt) clearInterval(this.statsTakt);
    this.statsTakt = null;
    this.sync?.stop();
    await this.peers?.stop();
    try { this.stoppeBetrieb(); } catch { /* lief nicht */ }
    await this.miningServer?.close();
    this.lauscht = '127.0.0.1';
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
      // Die fest eingebauten Seeds, die dieser Knoten zusaetzlich anwaehlt.
      weitereSeeds: seedListe(this.config.seed, istMainnet(this.params)).slice(1),
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
      dataDirBytes: this.datenBytes(),
      programmOrdner: this.basis,
      huelle: this.huelleStatus(),
      update: this.update,
      wallet: this.wallet.stand(),
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
    const weitere = seedListe(this.config.seed, istMainnet(this.params)).slice(1);
    return (this.peers?.info() ?? []).map(p => {
      const istSeed = p.richtung === 'aus' && this.seedIp !== null
        && p.host === this.seedIp && p.port === seedPort;
      // Die fest eingebauten Seeds stehen als Adresse im Programm, nicht als Name.
      const istWeiterer = p.richtung === 'aus' && weitere.includes(`${p.host}:${p.port}`);
      return {
        id: p.id,
        adresse: istSeed ? this.config.seed : `${p.host}:${p.port}`,
        seed: istSeed || istWeiterer,
        richtung: p.richtung,
        hoehe: p.height,
        programm: p.agent,
        seit: p.seit,
      };
    });
  }

  private verbindePeer(body: Record<string, unknown>) {
    if (!this.running || !this.peers) throw new KernFehler('knoten_aus', 'Zuerst den Full Node starten.');
    const { host, port } = this.parseSeed(String(body.adresse ?? '').trim());
    if (!/^[a-zA-Z0-9.\-:\[\]]{1,253}$/.test(host)) throw new KernFehler('peer_adresse', 'Ungültige Adresse.');
    this.peers.verbinde(host, port);
    this.log(`Verbindung zu ${host}:${port} wird aufgebaut.`);
    return { ok: true };
  }

  private trennePeer(body: Record<string, unknown>) {
    const p = this.peers?.alle().find(x => x.id === Number(body.id));
    if (!p) throw new KernFehler('peer_weg', 'Diese Verbindung gibt es nicht mehr.');
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
    this.wallet.sperreMinuten = this.einstellungen.sperreMinuten;
    try { writeFileSync(this.einstellungenPfad, JSON.stringify(this.einstellungen, null, 2)); }
    catch (e) { this.log(`einstellungen.json nicht gespeichert: ${(e as Error).message}`); }
    return this.einstellungen;
  }

  // ----------------------------------------------------------------- Wallet

  /** Sperrt die Wallet -- auch von aussen, etwa wenn Windows gesperrt wird. */
  sperreWallet(): void { this.wallet.sperren(); }

  /** Was die Kette ueber eine Adresse sagt -- gilt, bis ein neuer Block kommt. */
  private kettenVerlauf(adresse: string): KettenVerlauf {
    const tip = this.chain?.tip();
    if (!tip || !this.store || !this.running) {
      return { ueberweisungen: [], mining: [], letztePool: null, gesendetAn: [], durchsucht: 0 };
    }
    const kopf = toHex(tip.hash);
    if (this.verlaufMerker?.kopf !== kopf) this.verlaufMerker = { kopf, je: new Map() };
    const je = this.verlaufMerker.je;
    let v = je.get(adresse);
    if (!v) {
      // Wallet und Mining fragen oft nach verschiedenen Adressen -- beide bleiben.
      if (je.size >= 4) je.clear();
      v = leseVerlauf(this.store, tip.height, toHex(decodeAddress(adresse)));
      je.set(adresse, v);
    }
    return v;
  }

  /** Was von dieser Adresse im Mempool wartet -- in beide Richtungen. */
  private walletWartend(adresse: string) {
    const hex = toHex(decodeAddress(adresse));
    const gesehen = new Map(this.mempoolListe().wartend.map(w => [w.txid, w.seit]));
    return (this.pool?.alle() ?? [])
      .filter(t => toHex(t.from) === hex || toHex(t.to) === hex)
      .map(t => {
        const id = toHex(txid(t));
        const aus = toHex(t.from) === hex;
        const gegen = encodeAddress(aus ? t.to : t.from);
        return {
          txid: id, art: aus ? 'aus' as const : 'ein' as const, gegen,
          name: this.wallet.kontaktName(gegen),
          betrag: t.amount.toString(), gebuehr: t.fee.toString(),
          notiz: notizAusHex(toHex(t.memo)), seit: gesehen.get(id) ?? Date.now(),
        };
      });
  }

  /** Guthaben und was davon frei ist: Wartende eigene Zahlungen zaehlen schon ab. */
  private walletKonto(adresse: string) {
    const konto = this.chain && this.running
      ? getAccount(this.chain.state(), decodeAddress(adresse))
      : { balance: 0n, nonce: 0n };
    const wartend = this.walletWartend(adresse);
    const gebunden = wartend.filter(w => w.art === 'aus')
      .reduce((summe, w) => summe + BigInt(w.betrag) + BigInt(w.gebuehr), 0n);
    const verfuegbar = konto.balance > gebunden ? konto.balance - gebunden : 0n;
    return { konto, wartend, gebunden, verfuegbar,
             naechsteNonce: konto.nonce + BigInt(wartend.filter(w => w.art === 'aus').length) };
  }

  private walletUebersicht() {
    const adresse = this.wallet.verlangeOffen();
    const { konto, wartend, gebunden, verfuegbar } = this.walletKonto(adresse);
    const v = this.kettenVerlauf(adresse);
    const heute = tagVon(Date.now() / 1000);

    // Die letzten sieben Kalendertage, aeltester zuerst.
    const jeTag = new Map(v.mining.map(m => [m.tag, m]));
    const sieben = [];
    for (let i = 6; i >= 0; i--) {
      const tag = tagVon(Date.now() / 1000 - i * 86400);
      const m = jeTag.get(tag);
      sieben.push({ tag, summe: m?.summe ?? '0', bloecke: (m?.solo ?? 0) + (m?.pool ?? 0) });
    }
    const heuteEin = v.ueberweisungen.filter(u => u.art === 'ein' && tagVon(u.zeit) === heute)
      .reduce((summe, u) => summe + BigInt(u.betrag), 0n) + BigInt(jeTag.get(heute)?.summe ?? '0');

    return {
      knotenLaeuft: this.running,
      adresse,
      guthaben: konto.balance.toString(),
      verfuegbar: verfuegbar.toString(),
      unterwegs: gebunden.toString(),
      heute: heuteEin.toString(),
      wartend,
      ueberweisungen: v.ueberweisungen.map(u => ({ ...u, name: this.wallet.kontaktName(u.gegen) })),
      mining: v.mining,
      sieben,
      kontakte: this.wallet.kontakte(),
      datei: this.wallet.datei(),
      durchsucht: v.durchsucht,
    };
  }

  /*
   * Eine Zahlung durchrechnen -- ohne Passwort, ohne etwas zu senden.
   *
   * Dieselbe Rechnung wie in der App (Send.tsx): Die Stufe kommt aus der
   * gemessenen Marktlage des Knotens, liegt aber nie unter dem Satz je Byte
   * fuer die tatsaechliche Groesse -- die Notiz macht die Ueberweisung
   * laenger.
   */
  private walletRechne(body: Record<string, unknown>) {
    const adresse = this.wallet.verlangeOffen();
    if (!this.running || !this.chain || !this.pool || !this.lesen) {
      throw new WalletFehler('senden_knoten_aus', 'Zum Senden muss der Knoten laufen.');
    }
    const an = String(body.an ?? '').trim().toLowerCase();
    if (!isValidAddress(an)) throw new WalletFehler('adresse_falsch', 'Das ist keine gültige YSKAR-Adresse.');
    if (an === adresse) throw new WalletFehler('eigene_adresse', 'Das ist deine eigene Adresse.');

    const notiz = notizKuerzen(String(body.notiz ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim());
    const memo = new TextEncoder().encode(notiz);
    const stufe = body.stufe === 'langsam' || body.stufe === 'schnell' ? body.stufe : 'normal';

    const hoehe = this.chain.height() + 1;
    const markt = this.lesen.fees(new URLSearchParams());
    let gebuehr = BigInt(markt.stufen[stufe].fee);
    const jeByte = markt.mindestJeByte ? BigInt(markt.mindestJeByte) * BigInt(transferBytes(memo.length)) : 0n;
    if (jeByte > gebuehr) gebuehr = jeByte;
    const boden = this.pool.mindestGebuehr(hoehe, memo.length);
    if (boden > gebuehr) gebuehr = boden;

    const { verfuegbar, wartend, naechsteNonce } = this.walletKonto(adresse);
    let betrag: bigint;
    if (body.alles === true) {
      betrag = verfuegbar - gebuehr;
      if (betrag <= 0n) throw new WalletFehler('guthaben_reicht_nicht', 'Dafür reicht das Guthaben nicht.');
    } else {
      betrag = eingabeEinheiten(String(body.betrag ?? ''));
      if (betrag <= 0n) throw new WalletFehler('betrag_falsch', 'Gib einen Betrag ein.');
    }
    if (hoehe >= (this.params.feeV3Height ?? FEE_V3_HEIGHT) && betrag < DUST_LIMIT) {
      throw new WalletFehler('betrag_staub', 'Der Betrag ist zu klein. Mindestens 0,000001 YSR.');
    }
    if (betrag + gebuehr > verfuegbar) throw new WalletFehler('guthaben_reicht_nicht', 'Dafür reicht das Guthaben nicht.');

    const v = this.kettenVerlauf(adresse);
    const bekannt = this.wallet.kontaktName(an) !== null || v.gesendetAn.includes(an)
      || wartend.some(w => w.art === 'aus' && w.gegen === an);

    return {
      an, name: this.wallet.kontaktName(an), neu: !bekannt,
      betrag, gebuehr, notiz, memo, stufe, naechsteNonce,
      gesamt: betrag + gebuehr, verfuegbar, danach: verfuegbar - betrag - gebuehr,
      zielBlock: markt.stufen[stufe].block, andrang: markt.andrang,
    };
  }

  private walletVorschau(body: Record<string, unknown>) {
    const r = this.walletRechne(body);
    this.wallet.regung();
    return {
      an: r.an, name: r.name, neu: r.neu, notiz: r.notiz, stufe: r.stufe,
      betrag: r.betrag.toString(), gebuehr: r.gebuehr.toString(), gesamt: r.gesamt.toString(),
      verfuegbar: r.verfuegbar.toString(), danach: r.danach.toString(),
      zielBlock: r.zielBlock, andrang: r.andrang,
    };
  }

  /** Unterschreiben und ins Netz geben. Verlangt das Passwort -- jedes Mal. */
  private async walletSenden(body: Record<string, unknown>) {
    const r = this.walletRechne(body);
    const paar = await this.wallet.schluessel(body.passwort);
    const tx = buildTransfer({
      chainId: this.params.chainId,
      from: paar.addressRaw, to: decodeAddress(r.an),
      amount: r.betrag, fee: r.gebuehr, nonce: r.naechsteNonce, memo: r.memo,
      publicKey: paar.publicKey, privateKey: paar.privateKey,
    });
    paar.privateKey.fill(0);

    const aufnahme = this.pool!.add(tx, this.chain!.state(), this.chain!.height() + 1);
    if (!aufnahme.ok) {
      const text: Record<string, string> = {
        insufficient_funds: 'Dafür reicht das Guthaben nicht.',
        fee_too_low: 'Die Gebühr ist dem Knoten zu niedrig.',
        nonce_gap: 'Eine frühere Überweisung wartet noch. Bitte kurz warten und noch einmal versuchen.',
        nonce_too_low: 'Eine frühere Überweisung wartet noch. Bitte kurz warten und noch einmal versuchen.',
        unknown_account: 'Auf dieser Wallet liegt noch kein Guthaben.',
        sender_limit: 'Von dieser Wallet warten schon zu viele Überweisungen.',
        pool_full: 'Die Warteschlange des Knotens ist voll. Bitte später noch einmal versuchen.',
        duplicate: 'Diese Überweisung wurde schon eingereicht.',
      };
      throw new WalletFehler('abgelehnt_' + aufnahme.reason,
        text[aufnahme.reason] ?? `Der Knoten hat die Überweisung abgelehnt (${aufnahme.reason}).`);
    }
    const n = this.sync?.kuendigeAnTx(txid(tx)) ?? 0;
    this.log(`Überweisung ${aufnahme.txid.slice(0, 16)}… eingereicht, an ${n} Peer${n === 1 ? '' : 's'} gemeldet`);
    return {
      txid: aufnahme.txid, an: r.an, name: r.name,
      betrag: r.betrag.toString(), gebuehr: r.gebuehr.toString(),
      peers: n,
    };
  }

  /** QR-Code der Adresse, auf Wunsch mit Betrag und Notiz -- im Format der App. */
  private walletQr(such: URLSearchParams) {
    const adresse = this.wallet.verlangeOffen();
    const betrag = eingabeEinheiten(such.get('betrag') ?? '');
    const code = zahlungsCode(adresse, betrag > 0n ? betrag : null, such.get('notiz'));
    const q = qrKern.create(code, { errorCorrectionLevel: 'M' });
    const n: number = q.modules.size;
    const zeilen: string[] = [];
    for (let y = 0; y < n; y++) {
      let z = '';
      for (let x = 0; x < n; x++) z += q.modules.data[y * n + x] ? '1' : '0';
      zeilen.push(z);
    }
    return { code, groesse: n, zeilen };
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
      // Der Schluessel kommt im Kopffeld (Werkzeuge, Tests) oder im Cookie
      // des eigenen Fensters. Verglichen wird in fester Zeit.
      const kopf = req.headers[TOKEN_KOPF];
      const ausKopf = typeof kopf === 'string' ? kopf : '';
      const ausCookie = cookieWert(req.headers.cookie, TOKEN_COOKIE);
      if (!this.passt(ausKopf) && !this.passt(ausCookie)) {
        return { status: 401, error: 'Zugriff verweigert: Zugangsschlüssel fehlt.' };
      }
    }
    return null;
  }

  private passt(wert: string): boolean {
    const a = Buffer.from(wert);
    const b = Buffer.from(this.zugang);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Der Zugangsschluessel -- nur fuer das eigene Fenster (electron-main.mjs,
   * derselbe Prozess) und fuer Tests. Ueber HTTP gibt es ihn nirgends.
   */
  zugangFuerFenster(): string { return this.zugang; }

  /** Die Seite -- ohne Zugangsschluessel (siehe `zugang`). */
  private seite(): string | null {
    const roh = uiDatei('/ui/index.html');
    return roh ? roh.inhalt.toString('utf8').split(TOKEN_PLATZ).join('') : null;
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
        return json(res, { ...this.status(), mining: this.miningStatus(), betrieb: this.betriebStatus(), einstellungen: this.einstellungen });
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

      // Wallet
      if (pfad === '/api/wallet' || pfad.startsWith('/api/wallet/')) {
        const w = this.wallet;
        if (GET && pfad === '/api/wallet') return json(res, w.stand());
        if (GET && pfad === '/api/wallet/uebersicht') return json(res, this.walletUebersicht());
        if (GET && pfad === '/api/wallet/qr') return json(res, this.walletQr(url.searchParams));
        if (POST) {
          const b = await readBody(req);
          if (pfad === '/api/wallet/neu') return json(res, { woerter: w.neueWoerter() });
          if (pfad === '/api/wallet/anlegen') { const r = await w.anlegen(b.woerter, b.passwort); this.walletGeaendert(); return json(res, r); }
          if (pfad === '/api/wallet/entsperren') return json(res, await w.entsperren(b.passwort));
          if (pfad === '/api/wallet/zuruecksetzen') return json(res, await w.neuesPasswortMitWoertern(b.woerter, b.passwort));
          if (pfad === '/api/wallet/sperren') { w.sperren(); return json(res, w.stand()); }
          if (pfad === '/api/wallet/regung') { w.regung(); return json(res, w.stand()); }
          if (pfad === '/api/wallet/pruefen') return json(res, this.walletVorschau(b));
          if (pfad === '/api/wallet/senden') return json(res, await this.walletSenden(b));
          if (pfad === '/api/wallet/woerter') return json(res, { woerter: await w.woerter(b.passwort) });
          if (pfad === '/api/wallet/passwort') { await w.passwortAendern(b.alt, b.neu); return json(res, { ok: true }); }
          if (pfad === '/api/wallet/entfernen') { await w.entfernen(b.passwort); this.walletGeaendert(); return json(res, w.stand()); }
          if (pfad === '/api/wallet/kontakt') return json(res, { kontakte: w.setzeKontakt(b.name, b.adresse) });
          if (pfad === '/api/wallet/kontakt/entfernen') return json(res, { kontakte: w.entferneKontakt(b.adresse) });
        }
        return json(res, { error: 'not_found' }, 404);
      }

      if (GET && pfad === '/api/mining/status') return json(res, this.miningStatus());
      if (POST && pfad === '/api/mining/start') {
        this.beendeFortsetzen();
        return json(res, await this.startMining(await readBody(req)));
      }
      if (POST && pfad === '/api/mining/stop') {
        // Von Hand gestoppt: nicht von selbst wieder anfangen.
        this.beendeFortsetzen();
        this.merkeLief(false);
        return json(res, await this.stopMining());
      }
      if (POST && pfad.startsWith('/api/huelle/')) {
        const r = await this.huelleAufruf(pfad, await readBody(req));
        return r ? json(res, r) : json(res, { error: 'not_found' }, 404);
      }
      if (POST && pfad === '/api/update/suchen') return json(res, await this.pruefeUpdate());
      if (POST && pfad === '/api/pool/betrieb') return json(res, await this.setzeBetrieb(await readBody(req)));
      if (GET && pfad === '/api/pool/liste') return json(res, await this.poolListe(url.searchParams.get('eigen')));
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
        // Mit Huelle beendet sie das Programm -- samt Fenster und Infobereich.
        if (this.huelle) { const h = this.huelle; setTimeout(() => h.beenden(), 50).unref(); return; }
        setTimeout(async () => { await this.stopNode(); this.guiServer.close(); process.exit(0); }, 50).unref();
        return;
      }
      json(res, { error: 'not_found' }, 404);
    } catch (e) {
      const bekannt = e instanceof WalletFehler || e instanceof KernFehler ? e : null;
      json(res, {
        error: (e as Error).message,
        ...(bekannt ? { code: bekannt.code, ...(bekannt.werte.length ? { werte: bekannt.werte } : {}) } : {}),
      }, 400);
    }
  }
}

/** Zugangsschluessel dieses Starts: vorgegeben (YSKAR_ZUGANG) oder zufaellig. */
export function startZugang(env: NodeJS.ProcessEnv = process.env): string {
  const vorgabe = env.YSKAR_ZUGANG;
  delete env.YSKAR_ZUGANG;
  return typeof vorgabe === 'string' && /^[0-9a-f]{64}$/.test(vorgabe)
    ? vorgabe : randomBytes(32).toString('hex');
}

/** Wert eines Cookies aus dem Kopffeld "cookie", sonst ''. */
function cookieWert(kopf: string | undefined, name: string): string {
  if (!kopf) return '';
  for (const teil of kopf.split(';')) {
    const i = teil.indexOf('=');
    if (i < 0) continue;
    if (teil.slice(0, i).trim() === name) return teil.slice(i + 1).trim();
  }
  return '';
}
