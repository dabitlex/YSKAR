#!/usr/bin/env node
/**
 * YSKAR Full Node — Kommandozeile.
 *
 * Holt die Kette und prueft jeden Block SELBST: Header, Proof of Work,
 * Merkle-Wurzel, Signaturen, Guthaben, Zustandswurzel, Difficulty-Regel.
 * Gespeichert wird lokal in SQLite, mit Block-Index und Gabelungen.
 *
 * Ab 1.0.0 sind alle Ausgaben englisch (vorher deutsch), und der Knoten
 * zeigt den Stand der Konsensfassung 6: ab welcher Hoehe sie gilt, wie viele
 * Bloecke es bis dahin sind, ob dieses Programm sie umsetzt -- und meldet
 * sich laut, wenn es veraltet ist. Die Kommentare im Quelltext bleiben
 * deutsch wie im ganzen Repository.
 *
 * Die Befehle heissen ab 1.0.0 englisch (mirror, testkey, send). Die alten
 * Namen (spiegel, testkonto, ueberweisen) bleiben gueltig -- der Dienst
 * yskar-spiegel auf dem Hauptknoten ruft "spiegel" auf.
 */
import { readFileSync } from 'node:fs';
import { liesErgebnis, pruefe as pruefeNachricht } from '../../core/signedMessage.ts';
import { stateRootAt, totalSupply } from '../../core/state.ts';
import { gemeldeteFassung, naechsteAktivierung, fassungsStatus } from '../fassung.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import { MAX_SUPPLY, TARGET_BLOCK_TIME } from '../../core/params.ts';
import { deserializeBlock } from '../../core/block.ts';
import { ChainStore } from './ChainStore.ts';
import { spiegelKopf } from './spiegelKopf.ts';
import { ChainManager, AktivierungsFehler } from './ChainManager.ts';
import { TxPool } from './TxPool.ts';
import { MiningCoordinator } from './MiningCoordinator.ts';
import { MiningServer } from './MiningServer.ts';
import { MAINNET, REGTEST, regtestMitV6, type ConsensusParams } from '../../core/networks.ts';
import { PeerManager } from '../p2p/PeerManager.ts';
import type { PeerConnection } from '../p2p/PeerConnection.ts';
import { encodeStats, decodeStats, STATS_FAEHIG } from '../p2p/messages.ts';
import { NetzStatistik } from './NetzStatistik.ts';
import { PoolCoordinator } from '../../pool/PoolCoordinator.ts';
import { fensterGroesse } from '../../pool/pplns.ts';
import { leseFenster, schreibeFenster, schreibeFensterSofort, kuerze } from '../../pool/fensterDatei.ts';
import { nameToExtra, finderName, finderAnzeige } from '../../chain/finderName.ts';
import { decodeAddress, istAuszahlungsAdresse } from '../../core/address.ts';
import { SyncManager } from '../p2p/SyncManager.ts';
import { mempoolNachziehen } from './mempoolPflege.ts';

const VERSION = '1.0.0';
/** Wie oft das Fenster des Pools gesichert wird (wie in Node Core). */
const FENSTER_TAKT_MS = 120_000;
/** Wie oft im Betrieb eine Uebersichtszeile ins Protokoll geht. */
const UEBERSICHT_TAKT_MS = 600_000;
const DOKU = 'https://github.com/dabitlex/YSKAR/blob/main/docs/FULLNODE.md';
const V6_DOKU = 'https://github.com/dabitlex/YSKAR/blob/main/docs/CONSENSUS_V6.md';
const EXPLORER = 'https://yskar.app/explorer';

/*
  Node warnt bei jedem Start, dass node:sqlite experimentell sei. Fuer den
  Nutzer ist das Rauschen -- er hat die Entscheidung nicht getroffen.

  Gefiltert wird NUR diese eine Warnung. Alle Warnungen abzuschalten wuerde
  auch die verstecken, die etwas bedeuten.
*/
// removeAllListeners zuerst: Node druckt Warnungen ueber einen eigenen
// Empfaenger, der bestehen bleibt, wenn man nur einen weiteren hinzufuegt.
process.removeAllListeners('warning');
process.on('warning', w => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(`${w.name}: ${w.message}`);
});

interface Optionen {
  api: string; daten: string; befehl: string;
  einmal: boolean; intervall: number; help?: boolean; version?: boolean;
  bind: string; port: number; regtest: boolean;
  /** Lauschport fuer P2P. 0 = nur ausgehend. */
  p2pPort: number;
  /** Feste Startadressen, Form host:port. */
  seeds: string[];
  /** P2P ganz aus. */
  keinP2P: boolean;
  /** Name des Pools. Leer = kein Pool, nur Solo-Mining. */
  poolName: string;
  /** Gebuehr in Basispunkten, 0 bis 500. */
  poolFee: number;
  /** Wohin die Gebuehr geht. Pflicht, sobald poolFee > 0. */
  poolAuszahlung: string;
  /** Hoechstzahl der Adressen im Pool. null = Grenze der Kette (64 bzw. 63). */
  poolMax: number | null;
  /** Obergrenze des Mempools in MB (--mempool-mb). null = Vorgabe (32). */
  mempoolMb: number | null;
  /** Wohin gefundene Bloecke gehen. Leer heisst: nirgends. */
  upstream?: string;
  /**
   * Woher der Absender einer Mining-Anfrage kommt (--sender-ip): 'proxy'
   * hinter einem Proxy wie Caddy, 'socket' ohne Proxy. Ohne Angabe gelten
   * keine Grenzen je Absender.
   */
  absender: 'proxy' | 'socket' | null;
  /**
   * Nur mit --regtest: Fassung 6 ab dieser Hoehe statt nie (--v6-height).
   * Fuer den Uebergangstest mit alten und neuen Knoten nebeneinander.
   */
  v6Hoehe?: string;
  /** testkey / send (nur --regtest): Datei mit dem Testschluessel. */
  schluessel: string;
  /** send: Empfaenger, Betrag und Gebuehr in YSR, erzwungene Fassung, Notiz. */
  an?: string; betrag?: string; gebuehr?: string; txFassung?: string; memo?: string;
}

/**
 * Befehlsnamen. Bis 0.1.0 deutsch -- die alten Namen bleiben gueltig, damit
 * bestehende Dienste (yskar-spiegel.service) und Skripte weiterlaufen.
 */
const BEFEHL_ALIAS: Readonly<Record<string, string>> = {
  spiegel: 'mirror', testkonto: 'testkey', ueberweisen: 'send',
};
const BEFEHLE = ['sync', 'mine', 'status', 'chain', 'tips', 'mirror', 'testkey', 'send', 'verify-message'];

function argumente(argv: string[]): Optionen {
  const roh = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'sync';
  const o: Optionen = {
    api: 'https://yskar.vercel.app', daten: './knoten',
    befehl: BEFEHL_ALIAS[roh] ?? roh,
    einmal: false, intervall: 60,
    bind: '127.0.0.1', port: 8645, regtest: false,
    p2pPort: 8646, seeds: [], keinP2P: false,
    poolName: '', poolFee: 0, poolAuszahlung: '', poolMax: null, mempoolMb: null,
    absender: null, schluessel: './testkonto.json',
  };
  for (let i = 0; i < argv.length; i++) {
    const [k, direkt] = argv[i].split('=');
    const wert = direkt ?? argv[i + 1];
    const nimm = () => { if (direkt === undefined) i++; return wert; };
    switch (k) {
      case '--api': o.api = nimm().replace(/\/+$/, ''); break;
      case '--data': case '-d': o.daten = nimm(); break;
      case '--interval': o.intervall = Number(nimm()); break;
      case '--once': o.einmal = true; break;
      case '--bind': o.bind = nimm(); break;
      case '--port': o.port = Number(nimm()); break;
      case '--regtest': o.regtest = true; break;
      case '--upstream': o.upstream = nimm().replace(/\/+$/, ''); break;
      case '--no-upstream': o.upstream = ''; break;
      case '--p2p-port': o.p2pPort = Number(nimm()); break;
      case '--seed': o.seeds.push(nimm()); break;
      case '--no-p2p': o.keinP2P = true; break;
      case '--pool': o.poolName = nimm(); break;
      case '--pool-fee': o.poolFee = Number(nimm()); break;
      case '--pool-payout': o.poolAuszahlung = nimm(); break;
      case '--pool-max': o.poolMax = Number(nimm()); break;
      case '--mempool-mb': o.mempoolMb = Number(nimm()); break;
      case '--sender-ip': {
        const w = nimm();
        if (w !== 'proxy' && w !== 'socket') {
          console.error(`  --sender-ip takes "proxy" or "socket", not "${w}".`);
          process.exit(1);
        }
        o.absender = w;
        break;
      }
      case '--v6-height': o.v6Hoehe = nimm(); break;
      case '--key': o.schluessel = nimm(); break;
      case '--to': o.an = nimm(); break;
      case '--amount': o.betrag = nimm(); break;
      case '--fee': o.gebuehr = nimm(); break;
      case '--tx-version': o.txFassung = nimm(); break;
      case '--memo': o.memo = nimm(); break;
      case '--help': case '-h': o.help = true; break;
      case '--version': case '-v': o.version = true; break;
    }
  }
  return o;
}

/**
 * Die Konsensparameter fuer diesen Lauf.
 *
 * --v6-height gilt nur im Testnetz: Die Aktivierungshoehe des Mainnets
 * steht im Code (V6_HEIGHT) und laesst sich nicht von aussen setzen.
 */
function netzParameter(opt: Optionen): ConsensusParams {
  if (opt.v6Hoehe !== undefined) {
    if (!opt.regtest) {
      throw new Error('--v6-height only works with --regtest. The mainnet activation height is fixed ' +
        'in the program and cannot be changed.');
    }
    const hoehe = /^\d+$/.test(opt.v6Hoehe) ? Number(opt.v6Hoehe) : NaN;
    // regtestMitV6 (core, mit anderen Programmen geteilt) meldet deutsch -- hier englisch.
    try { return regtestMitV6(hoehe); }
    catch { throw new Error(`--v6-height needs a whole number from 1, not "${opt.v6Hoehe}"`); }
  }
  return opt.regtest ? REGTEST : MAINNET;
}

// ----------------------------------------------------------------- Ausgabe

const FARBE = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (c: string, s: string) => FARBE ? `\x1b[${c}m${s}\x1b[0m` : s;
const gruen = (s: string) => f('32', s), rot = (s: string) => f('31', s);
const gelb = (s: string) => f('33', s), grau = (s: string) => f('90', s);
const fett = (s: string) => f('1', s), cyan = (s: string) => f('36', s);
const blau = (s: string) => f('94', s);
const uhr = () => new Date().toTimeString().slice(0, 8);
/** Zahlen im englischen Format: 6,809. */
const nf = (n: number | bigint) => Number(n).toLocaleString('en-US');

/**
 * Meldung ausgeben, ohne die laufende Statuszeile zu zerreissen.
 *
 * Die Statuszeile wird mit \r an Ort und Stelle erneuert. Wer daneben
 * einfach console.log benutzt, haengt seinen Text an ihren Rest an. Erst
 * loeschen, dann drucken.
 */
function melde(text: string): void {
  if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
  console.log(text);
}

/**
 * Eine Protokollzeile: Uhrzeit, Art (feste Breite), Text. Die Art steht immer
 * an derselben Stelle, damit sich das Journal ueberfliegen und mit grep
 * filtern laesst.
 */
const ART = 9;
function log(art: string, farbe: (s: string) => string, text: string): void {
  melde(`${grau('[' + uhr() + ']')} ${farbe(art.padEnd(ART))} ${text}`);
}
/** Fortsetzung unter einer Protokollzeile, buendig mit deren Text. */
const EINZUG = ' '.repeat(10 + 1 + ART + 1);

const LINIE = 88;
const linie = () => console.log(grau(' ' + '─'.repeat(LINIE)));
const abschnitt = (t: string) => console.log(` ${fett(t)}`);
const MARKE = 13;
const zeile = (m: string, w: string) => console.log(` ${grau('*')} ${cyan(m.padEnd(MARKE))}${w}`);
const P = grau(' · ');

function kopf(titel = ''): void {
  console.log('');
  const links = `YSKAR Full Node ${VERSION}${titel ? '  ' + titel : ''}`;
  console.log(` ${fett('YSKAR Full Node')} ${grau(VERSION)}${titel ? '  ' + grau(titel) : ''}` +
    `${' '.repeat(Math.max(2, LINIE - links.length - 18))}${grau('Fair from block 0.')}`);
  linie();
}

/** Ein Fehler, der den Start beendet: Titel, dann was zu tun ist. */
function abbruch(titel: string, ...zeilen: string[]): never {
  console.error(`\n ${rot(fett('✖ ' + titel))}`);
  for (const z of zeilen) console.error(`   ${z}`);
  console.error('');
  process.exit(1);
}

/** Sekunden als "45 s", "12 min", "5h 20m", "22 days". */
function dauer(sek: number): string {
  const s = Math.round(sek);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 2 * 86400) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
  return `${Math.round(s / 86400)} days`;
}

/** "around 20 Nov 2026" -- nur ein Anhaltspunkt aus der Zielblockzeit. */
function ungefaehrAm(sekunden: number): string {
  const d = new Date(Date.now() + sekunden * 1000);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const netzName = (params: ConsensusParams) =>
  `${params.network} ${grau(params === MAINNET ? '(mainnet)' : '(test network)')}`;

/**
 * Der Stand der Konsensfassung 6 in Worten -- fuer Startkopf, status und
 * die Hinweise im Betrieb. Eine Quelle fuer alle drei, damit sie sich nie
 * widersprechen.
 */
function fassungsLage(params: ConsensusParams, hoehe: number) {
  const ab = naechsteAktivierung(params);
  const aktiv = ab > 0 && hoehe + 1 >= ab;   // der NAECHSTE Block folgt schon den neuen Regeln
  const rest = ab > 0 ? Math.max(0, ab - (hoehe + 1)) : null;
  return {
    ab, aktiv, rest,
    jetzt: aktiv ? 6 : 5,
    sekunden: rest === null ? null : rest * Number(TARGET_BLOCK_TIME),
    umgesetzt: gemeldeteFassung(params),
  };
}

/** Interne Ablehnungsgruende der Kette in Worten. Der Code steht dahinter. */
const GRUENDE: Readonly<Record<string, string>> = {
  unlesbar: 'unreadable block',
  struktur: 'broken block structure',
  fassung_unbekannt: 'unknown consensus revision',
  kodierung: 'non-canonical encoding',
  vorgaenger_fehlt: 'unknown parent block',
  vorgaenger_ungueltig: 'parent block is invalid',
  hoehe_passt_nicht: 'height does not follow the parent',
  zweig_unlesbar: 'branch cannot be read',
  timestamp: 'timestamp rule broken',
  difficulty: 'difficulty rule broken',
  anwenden: 'transactions cannot be applied',
  state_root: 'state root does not match',
};
const grundText = (g: string) => GRUENDE[g] ? `${GRUENDE[g]} ${grau(`(${g})`)}` : g;

/** Gruende fuer das Ende einer Peer-Verbindung, soweit sie intern deutsch heissen. */
function trennGrund(g: string): string {
  return g
    .replace(/^herunterfahren$/, 'shutting down')
    .replace(/^verdraengt$/, 'replaced by a better peer')
    .replace(/^selbstverbindung/, 'connected to itself')
    .replace(/^stats_unlesbar/, 'unreadable statistics');
}

/** Hinweis aus fensterDatei.ts (mit Node Core geteilt, deshalb dort deutsch). */
function fensterHinweis(h: string): string {
  return h
    .replace(/^gesicherte Arbeit nicht übernommen \((.*)\); die Datei liegt als pool-fenster\.json\.unlesbar daneben\.$/,
      'saved work not loaded ($1); the file was kept as pool-fenster.json.unlesbar.')
    .replace(/^nur die jüngsten (\d+) Einträge übernommen\.$/, 'only the newest $1 entries were loaded.');
}

const KEIN_AUSZAHLUNGSKONTO = 'Mining pays only to a normal wallet address (ysr1…, 42 characters). ' +
  'Shared accounts (ysr1p…) cannot receive a block reward yet.';

// -------------------------------------------------------------------- Netz

/**
 * Frist fuer jede Anfrage an die Gegenstelle. Ohne sie haengt der Abgleich
 * (und der Dienst yskar-spiegel) fuer immer, wenn die Gegenstelle die
 * Verbindung annimmt und nie antwortet.
 */
const ANFRAGE_FRIST_MS = 30_000;

async function hole(api: string, pfad: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${api}/api/v2${pfad}`, { signal: AbortSignal.timeout(ANFRAGE_FRIST_MS) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body.detail ?? body.error ?? `HTTP ${res.status}`));
  return body as Record<string, unknown>;
}

/** Netzwerkfehler von fetch in einem lesbaren Satz. */
function netzFehler(e: unknown): string {
  const err = e as Error & { cause?: { code?: string } };
  if (err?.name === 'TimeoutError') return `no answer within ${ANFRAGE_FRIST_MS / 1000} s`;
  const c = err?.cause?.code;
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') return 'the host name could not be resolved';
  if (c === 'ECONNREFUSED') return 'the connection was refused';
  if (c === 'ECONNRESET') return 'the connection was reset';
  return err?.message === 'fetch failed' ? 'not reachable' : (err?.message ?? String(e));
}

// ------------------------------------------------------------------ Befehle

/**
 * Liegengebliebene Bloecke an die Gegenstelle nachschieben (Befehl mirror,
 * frueher spiegel).
 *
 * WOZU: Die Gegenstelle nimmt immer nur den NAECHSTEN Block an. Scheitert
 * einer, blockiert er alle weiteren. Der Spiegel bleibt stehen, waehrend die
 * Kette weiterlaeuft. Diese Funktion schliesst die Luecke, ohne dass die
 * Kette angefasst wird.
 *
 * Beim ERSTEN Fehler wird abgebrochen. Weitermachen waere sinnlos -- der
 * naechste Block braucht den vorigen.
 */
async function spiegel(
  opt: Optionen, store: ChainStore, chain: ChainManager,
): Promise<void> {
  const ziel = opt.upstream || opt.api;
  kopf('mirror');
  zeile('MIRROR', ziel);

  const eigene = chain.height();
  if (eigene === null || eigene < 0) {
    abbruch('The local chain is empty', 'Run "sync" or "mine" first.');
  }

  let dort: number;
  try {
    /*
      WARUM NICHT /api/v2/summary

      Die Gegenstelle reicht ihr summary an DIESEN Knoten durch. Gefragt,
      wie hoch sie stehe, antwortete sie also mit unserer eigenen Hoehe.
      /api/v2/blocks liest dagegen aus dem Spiegel selbst. Eine leere Liste
      ist die ehrliche Antwort "ich habe nichts" und wird zu -1.
    */
    const res = await fetch(`${ziel}/api/v2/blocks?limit=1`, { signal: AbortSignal.timeout(ANFRAGE_FRIST_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    let r: { blocks?: { height?: number }[] };
    try { r = JSON.parse(text); }
    catch { throw new Error(`no JSON answer: ${text.slice(0, 60)}`); }
    if (!Array.isArray(r.blocks)) throw new Error('answer without a block list');
    dort = r.blocks.length === 0 ? -1 : Number(r.blocks[0].height ?? -1);
    if (!Number.isFinite(dort)) throw new Error('answer without a height');
  } catch (e) {
    abbruch('The mirror cannot be reached', `${ziel}: ${netzFehler(e)}`);
  }

  zeile('MIRROR HEIGHT', nf(dort));
  zeile('LOCAL HEIGHT', nf(eigene));
  linie();

  if (dort >= eigene) {
    console.log(gruen('\n Nothing to push -- the mirror is up to date.\n'));
    return;
  }
  console.log(grau(`\n ${nf(eigene - dort)} blocks to push.\n`));

  let geschafft = 0;
  for (let h = dort + 1; h <= eigene; h++) {
    const b = store.mainAt(h);
    if (!b) {
      console.error(rot(` Block ${nf(h)} is missing from the local store.`));
      break;
    }
    try {
      const res = await fetch(`${ziel}/api/v2/block`, {
        method: 'POST',
        headers: spiegelKopf(),
        body: JSON.stringify({ raw: toHex(b.body) }),
        signal: AbortSignal.timeout(ANFRAGE_FRIST_MS),
      });
      const body = await res.json().catch(() => ({}));
      if (!body.accepted) {
        console.error(rot(` Block ${nf(h)} rejected by the mirror: ${
          body.detail ?? body.reason ?? `HTTP ${res.status}`}`));
        console.error(grau(' Stopped -- the following blocks need this one.\n'));
        break;
      }
      geschafft++;
      if (geschafft % 10 === 0 || h === eigene) console.log(grau(` ${nf(h)} …`));
    } catch (e) {
      console.error(rot(` Block ${nf(h)}: ${netzFehler(e)}`));
      break;
    }
  }

  console.log(geschafft === eigene - dort
    ? gruen(`\n ${nf(geschafft)} blocks pushed. The mirror is up to date.\n`)
    : gelb(`\n ${nf(geschafft)} of ${nf(eigene - dort)} blocks pushed.\n`));
}

function status(store: ChainStore, chain: ChainManager, params: ConsensusParams = MAINNET): void {
  const tip = chain.tip();
  kopf();
  abschnitt('CHAIN');
  /*
    Bis 0.1.0 stand hier die Konstante NETWORK -- mit --regtest zeigte
    status deshalb "yskar-main-1". Die Kennung kommt aus den Parametern.
  */
  zeile('NETWORK', netzName(params));
  if (tip) {
    const alter = Math.round(Date.now() / 1000 - Number(tip.blockTime));
    zeile('HEIGHT', `${nf(tip.height)}${P}last block ${dauer(Math.max(0, alter))} ago`);
    zeile('BEST BLOCK', toHex(tip.hash));
    zeile('DIFFICULTY', nf(tip.difficulty));
    zeile('CHAIN WORK', nf(tip.chainWork));
    zeile('STATE ROOT', toHex(stateRootAt(chain.state(), chain.height(), params)));
    const umlauf = Number(totalSupply(chain.state())) / 1e8;
    const max = Number(MAX_SUPPLY) / 1e8;
    zeile('SUPPLY', `${nf(Math.round(umlauf))} of ${nf(max)} YSR ${grau(`(${((umlauf / max) * 100).toFixed(1)}%)`)}`);
  } else {
    zeile('HEIGHT', grau('no blocks yet'));
  }
  const zweige = store.tips().length;
  zeile('STORED', `${nf(store.count())} blocks${P}${nf(zweige)} branch ${zweige === 1 ? 'tip' : 'tips'}${
    zweige > 1 ? grau(' (a fork was seen; the branch with the most work is active)') : ''}`);
  console.log('');
  fassungsBlock(params, tip ? tip.height : -1, chain);
  linie();
  console.log('');
}

/** Der Abschnitt CONSENSUS -- gleich in status und im Startkopf. */
function fassungsBlock(params: ConsensusParams, hoehe: number, chain: ChainManager, knapp = false): void {
  const l = fassungsLage(params, hoehe);
  const stand = fassungsStatus(chain.hoehereFassungGesehen !== null);
  abschnitt('CONSENSUS');
  zeile('REVISION', `${l.jetzt} ${grau('(active now)')}`);
  if (l.ab === 0) {
    zeile('NEXT', grau('no activation height for revision 6 is set in this program'));
  } else if (!l.aktiv) {
    zeile(knapp ? 'ACTIVATION' : 'NEXT', `revision 6 from block ${nf(l.ab)}${P}${nf(l.rest!)} blocks to go ${
      grau(`(≈ ${dauer(l.sekunden!)}${params === MAINNET ? `, around ${ungefaehrAm(l.sekunden!)}` : ''})`)}`);
  } else {
    zeile('SINCE', `block ${nf(l.ab)}`);
  }
  if (stand === 'outdated') {
    zeile('THIS NODE', rot(fett('OUTDATED')) + rot(' — a block of a higher revision was seen. Update yskar-node now.'));
  } else if (l.umgesetzt >= 6) {
    zeile('THIS NODE', gruen(l.aktiv ? '✓ runs revision 6' : '✓ ready for revision 6') +
      grau(l.aktiv ? '' : ' — no update needed before the activation'));
  } else {
    zeile('THIS NODE', gelb('follows revision 5 only'));
  }
  if (stand === 'update_recommended' || stand === 'probably_forked') {
    zeile('', gelb(stand === 'probably_forked'
      ? 'This program is more than a year old and probably no longer follows the network. Update it.'
      : 'This program is more than half a year old. Check for a newer version.'));
  }
  if (!knapp && l.umgesetzt >= 6 && !l.aktiv) {
    zeile('WHAT CHANGES', `block version 6${P}shared accounts (multisig)${P}hash and time locks`);
    zeile('', `up to 255 coinbase outputs${P}larger blocks${P}fork ID in every signature`);
    zeile('', grau(`Details: ${V6_DOKU}`));
  }
}

function chainListe(store: ChainStore): void {
  const tip = store.mainTip();
  if (!tip) { console.log('\n No blocks yet.\n'); return; }
  console.log('');
  for (let h = Math.max(0, tip.height - 14); h <= tip.height; h++) {
    const b = store.mainAt(h);
    if (!b) continue;
    const andere = store.atHeight(h).length - 1;
    console.log(
      `  ${grau('#' + String(h).padStart(6))}  ${toHex(b.hash).slice(0, 32)}…  ` +
      `${grau('diff')} ${String(nf(b.difficulty)).padStart(12)}` +
      (andere > 0 ? gelb(`  +${andere} side ${andere > 1 ? 'branches' : 'branch'}`) : ''));
  }
  console.log('');
}

function tipsListe(store: ChainStore): void {
  const alle = store.tips();
  console.log('');
  if (alle.length === 0) { console.log('  None.\n'); return; }
  for (const t of alle) {
    const aktiv = t.mainChain;
    console.log(
      `  ${aktiv ? gruen('active') : grau('branch')} ` +
      `${grau('#' + String(t.height).padStart(6))}  ${toHex(t.hash).slice(0, 32)}…  ` +
      `${grau('work')} ${nf(t.chainWork)}`);
  }
  console.log('');
  if (alle.length > 1) {
    console.log(grau('  Several branch tips mean there was a fork. The active one is the branch\n' +
                     '  with the most cumulative work.\n'));
  }
}

/**
 * Kette aufholen.
 *
 * Stapelweise, weil ein Aufruf je Block bei zehntausenden Bloecken
 * unzumutbar waere. Jeder Block wird einzeln geprueft -- der Stapel ist
 * nur die Transportform.
 *
 * `pool` ist optional, weil dieselbe Funktion zwei Rollen spielt: beim
 * Start den Erstabgleich (da gibt es noch keinen Mempool) und im Betrieb
 * den Takt alle 30 Sekunden (da gibt es einen, und er muss gepflegt
 * werden).
 */
async function sync(
  opt: Optionen, store: ChainStore, chain: ChainManager, pool?: TxPool,
): Promise<boolean> {
  let geprueft = 0;
  const t0 = Date.now();

  /*
    Ab welcher Hoehe gefragt wird. Normal: ab dem eigenen Kopf + 1.

    Folgt die Gegenstelle einem ANDEREN Zweig, der an oder unter unserem
    Kopf abzweigt, passt ihr Block h+1 an nichts, was wir haben
    ("vorgaenger_fehlt"). Dann geht der Abgleich schrittweise zurueck
    (1, 2, 4, ... Bloecke), bis die Gegenstelle einen Block liefert, dessen
    Vorgaenger wir kennen (Issue #11).
  */
  let von = chain.height() + 1;
  let schritt = 0;

  abgleich: for (;;) {
    const antwort = await hole(opt.api, `/sync?from=${von}&count=200`);
    const bloecke = (antwort.blocks ?? []) as { height: number; hash: string; body: string }[];
    if (bloecke.length === 0) break;

    for (const b of bloecke) {
      const r = chain.accept(fromHex(b.body));
      if (!r.ok && r.grund === 'vorgaenger_fehlt' && b.height > 0) {
        schritt = schritt === 0 ? 1 : schritt * 2;
        const zurueck = Math.max(0, b.height - schritt);
        if (schritt === 1) {
          log('fork', gelb, `at height ${nf(b.height)}: the source follows another branch, ` +
            `looking for the common parent…`);
        }
        von = zurueck;
        continue abgleich;
      }
      if (!r.ok) {
        // Der Zweck dieses Programms. Ab hier ist jede weitere Aussage wertlos.
        melde('');
        melde(rot(fett(' ✖ BLOCK REJECTED')));
        melde(rot(`   height ${nf(b.height)}: ${grundText(r.grund)}`));
        if (r.detail) melde(rot(`   ${r.detail}`));
        melde(grau('   The source delivers something that breaks the rules of the chain.'));
        melde(grau(`   Checked locally up to height ${nf(chain.height())}.`));
        melde('');
        return false;
      }
      if (r.stored) {
        geprueft++;
        if (pool) mempoolNachziehen(r, pool, chain.state(), chain.height());
        if (r.reorg) {
          log('reorg', gelb, `switched to the branch with more work${P}height ${nf(r.height)}${P}` +
            `new tip ${toHex(r.tip).slice(0, 16)}…`);
        }
      }
      von = b.height + 1;
    }
  }

  if (geprueft > 0) {
    const tip = chain.tip()!;
    log('sync', blau, `${gruen('✓')} ${nf(geprueft)} ${geprueft === 1 ? 'block' : 'blocks'} checked${P}` +
      `height ${nf(tip.height)}${P}work ${nf(tip.chainWork)}${P}${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } else if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[2K${grau('[' + uhr() + ']')} ` +
      `at height ${nf(chain.height())}, waiting…`);
  }
  return true;
}

/**
 * Hinweise zur Konsensfassung 6 im Betrieb.
 *
 * Einmal je Schwelle (1.000, 500, 100 und 10 Bloecke vorher), einmal bei der
 * Aktivierung -- und laut, sobald die Kette einen Block hoeherer Fassung mit
 * gueltiger Arbeit gesehen hat: Dann ist DIESES Programm veraltet, und der
 * Betreiber muss es erfahren, auch wenn er nur ins Journal schaut.
 */
function fassungsHinweise(params: ConsensusParams, chain: ChainManager) {
  const gemeldet = new Set<string>();
  let veraltetGemeldet = false;
  const SCHWELLEN = [1000, 500, 100, 10];
  return () => {
    const hoehe = chain.height();
    const l = fassungsLage(params, hoehe);
    if (l.ab > 0 && hoehe >= 0) {
      if (l.aktiv) {
        // Nur melden, wenn der Knoten die Aktivierung WAEHREND des Laufs
        // erlebt -- nicht bei jedem Start auf einer Kette, die laengst darueber ist.
        if (!gemeldet.has('aktiv') && gemeldet.size > 0 && hoehe + 1 - l.ab < 3) {
          melde('');
          log('consensus', s => gruen(fett(s)), gruen(fett(`★ REVISION 6 ACTIVE  from block #${nf(l.ab)}`)));
          melde(grau(`${EINZUG}Block version 6, shared accounts, locks and 255 coinbase outputs are now valid.`));
          melde(grau(`${EINZUG}Peers below revision 6 are no longer asked for blocks.`));
          melde('');
        }
        gemeldet.add('aktiv');
      } else {
        // Die kleinste erreichte Schwelle zaehlt. Alle groesseren gelten mit
        // als erledigt -- ein Start bei 80 Bloecken Rest meldet einmal, nicht viermal.
        const erreicht = SCHWELLEN.filter(s => l.rest! <= s);
        const schwelle = erreicht.length ? Math.min(...erreicht) : undefined;
        if (schwelle !== undefined && !gemeldet.has(String(schwelle))) {
          for (const s of erreicht) gemeldet.add(String(s));
          log('consensus', gelb, `revision 6 activates in ${nf(l.rest!)} ${l.rest === 1 ? 'block' : 'blocks'} ` +
            `${grau(`(block ${nf(l.ab)}, ≈ ${dauer(l.sekunden!)})`)}` +
            (l.umgesetzt >= 6 ? grau(' · this node is ready') : ''));
          if (schwelle <= 100) {
            melde(grau(`${EINZUG}Wallets pause sending shortly before the activation; the node keeps working normally.`));
          }
        }
      }
    }
    if (!veraltetGemeldet && chain.hoehereFassungGesehen !== null) {
      veraltetGemeldet = true;
      const h = chain.hoehereFassungGesehen;
      melde('');
      log('consensus', s => rot(fett(s)), rot(fett('! THIS NODE IS OUTDATED')));
      melde(`${EINZUG}A peer sent a block of version ${h.version} at height ${nf(h.height)} with valid work.`);
      melde(`${EINZUG}This program (yskar-node ${VERSION}) does not know that revision and follows a chain`);
      melde(`${EINZUG}the rest of the network has left. Update yskar-node now:`);
      melde(grau(`${EINZUG}git pull && cd node && npm install && npm run build && sudo systemctl restart yskar-node`));
      melde('');
    }
  };
}

/**
 * Mining-Schnittstelle oeffnen.
 *
 * Der Knoten baut die Jobs selbst und nimmt gefundene Bloecke selbst an --
 * ohne Server. Der bestehende Miner spricht dasselbe Protokoll und laeuft
 * unveraendert dagegen.
 */
async function mine(opt: Optionen, store: ChainStore, chain: ChainManager): Promise<void> {
  const params = netzParameter(opt);
  const mb = opt.mempoolMb;
  if (mb !== null && !(Number.isFinite(mb) && mb >= 1 && mb <= 4096)) {
    abbruch('--mempool-mb needs a number from 1 to 4096');
  }
  const pool = new TxPool(params, undefined, mb === null ? {} : { maxBytes: Math.floor(mb * 1024 * 1024) });
  const koordinator = new MiningCoordinator(chain, store, pool, params);
  const server = new MiningServer({ chain, store, pool, mining: koordinator }, {
    host: opt.bind, port: opt.port, params, absender: opt.absender,
  });
  // Weicht ein Job aus der Vorarbeit je vom vollen Blockbau ab, schaltet
  // sich die Vorarbeit ab -- und das gehoert ins Protokoll.
  koordinator.onFehler = (wo, e) => log('error', rot, rot(`${wo}: ${e.message}`));

  // Ohne Weitergabe laege ein gefundener Block nur hier und wuerde beim
  // naechsten Block der anderen Seite verdraengt. Im Testnetz gibt es
  // niemanden, dem man ihn geben koennte.
  const nachOben = opt.upstream !== undefined
    ? opt.upstream
    : (opt.regtest ? '' : opt.api);
  if (nachOben) server.upstream = nachOben;

  /*
    Eine ueber die Schnittstelle eingereichte Ueberweisung an die Peers
    ankuendigen. Der SyncManager entsteht erst weiter unten -- deshalb die
    Closure und nicht die Referenz.
  */
  server.onNeueTx = hash => { abgleich?.kuendigeAnTx(hash); };

  server.onUpstream = e => {
    melde(e.ok
      ? grau(`${EINZUG}forwarded to the mirror, accepted there as height ${nf(e.hoehe ?? 0)}`)
      : gelb(`${EINZUG}not forwarded to the mirror: ${e.grund}`));
  };

  server.onFehler = (wo, e) => {
    log('error', rot, rot(`${wo}: ${e.message}`));
    if (e.stack) melde(grau(e.stack.split('\n').slice(1, 4).join('\n')));
  };

  server.onBlock = (h, hash, adresse) => {
    melde('');
    const pk = server.poolKoordinator;
    log('block', s => gruen(fett(s)), gruen(fett(`★ BLOCK FOUND  #${nf(h)}`)) +
      (pk ? grau(`   pool ${opt.poolName}`) : ''));
    melde(`${EINZUG}${grau('hash    ')}${hash}`);
    melde(`${EINZUG}${grau(pk ? 'pool    ' : 'paid to ')}${pk ? 'reward split among the pool\'s miners in this block' : adresse}`);
    if (params === MAINNET) melde(`${EINZUG}${grau('explorer')} ${EXPLORER}#block-${h}`);
  };

  /*
    Das Knotennetz.

    Es laeuft neben der Mining-Schnittstelle und unabhaengig von ihr: Ein
    Knoten ohne Miner ist ein vollwertiger Teilnehmer, und ein Miner ohne
    Peers arbeitet weiter.
  */
  let netz: PeerManager | null = null;
  let abgleich: SyncManager | null = null;
  let statsTakt: ReturnType<typeof setInterval> | null = null;

  /*
    Miner-Statistik ueber die Knoten hinweg (NetzStatistik.ts).

    Gesendet wird NUR an Peers, deren Kennung "+stats" traegt. Ein Knoten
    aelterer Fassung kennt den Befehl nicht und wuerde die Verbindung
    trennen.
  */
  const statistik = new NetzStatistik(
    BigInt.asUintN(64, BigInt(Math.floor(Math.random() * 2 ** 32)) << 32n
      | BigInt(Math.floor(Math.random() * 2 ** 32))));
  server.netzStatistik = statistik;
  const kannStats = (p: PeerConnection) => p.info().agent.includes(STATS_FAEHIG);
  const meldeStats = (an?: PeerConnection) => {
    if (!netz) return;
    const l = server.lokaleStatistik();
    const nutzlast = encodeStats({
      knoten: statistik.eigeneKennung,
      hashrate: Number.isFinite(l.hashrate) ? BigInt(Math.max(0, Math.round(l.hashrate))) : 0n,
      sessions: l.sessions,
      adressen: l.adressen.map(h => fromHex(h)),
    });
    for (const p of an ? [an] : netz.bereite()) {
      if (kannStats(p)) p.send('stats', nutzlast);
    }
  };

  /** Anzahl Transaktionen und Finder eines gespeicherten Blocks -- fuer die Protokollzeile. */
  const blockInfo = (hashHex: string): string => {
    try {
      const g = store.get(fromHex(hashHex));
      if (!g) return '';
      const b = deserializeBlock(g.body);
      const ueberweisungen = b.txs.length - 1;
      const cb = b.txs[0] as { extra?: Uint8Array };
      const name = finderAnzeige(cb?.extra ? finderName(toHex(cb.extra)) : null);
      return `${P}${nf(ueberweisungen)} ${ueberweisungen === 1 ? 'transfer' : 'transfers'}` +
        (name ? `${P}miner ${name}` : '');
    } catch { return ''; }
  };

  if (!opt.keinP2P) {
    const seeds = opt.seeds.map(s => {
      const i = s.lastIndexOf(':');
      if (i < 1) abbruch(`--seed "${s}" must be host:port`, 'For example: --seed pool.yskar.app:8646');
      return { host: s.slice(0, i), port: Number(s.slice(i + 1)) };
    });

    netz = new PeerManager({
      params,
      agent: `yskar-node/${VERSION} ${STATS_FAEHIG}`,
      listenPort: opt.p2pPort,
      seeds,
      kette: () => {
        const t = chain.tip();
        return { height: t?.height ?? -1, chainWork: t?.chainWork ?? 0n };
      },
      onReady: p => {
        const i = p.info();
        const agent = i.agent.replace(` ${STATS_FAEHIG}`, '').trim();
        log('peer', gruen, `${p.host} connected${P}height ${nf(p.fremdeHoehe())}${P}revision ${
          i.revision || '?'}${agent ? grau(` · ${agent}`) : ''}`);
        if (i.revision > 0 && i.revision < 6 && naechsteAktivierung(params) > 0) {
          log('peer', gelb, `${p.host} speaks revision ${i.revision}${grau(` · kept for transfers, not asked for blocks from ${
            nf(naechsteAktivierung(params))} on`)}`);
        }
        abgleich?.aufPeer(p);
        meldeStats(p);
      },
      onMessage: (p, fr) => {
        if (fr.command === 'stats') {
          try { statistik.aufnehmen(decodeStats(fr.payload), `v:${p.id}`); }
          catch (e) { p.close(`stats_unlesbar:${(e as Error).message}`); }
          return;
        }
        abgleich?.aufNachricht(p, fr);
      },
      onClose: (p, g) => {
        if (p.ready) log('peer', grau, grau(`${p.host} disconnected (${trennGrund(g)})`));
      },
      onLog: t => log('peer', grau, grau(t)),
    });

    abgleich = new SyncManager({
      chain, store, peers: netz, params, pool,
      onBlock: (h, hash, von) => {
        koordinator.invalidate();
        log('block', gruen, `#${nf(h)}${P}from peer ${von}${blockInfo(hash)}${grau(` · ${hash.slice(0, 16)}…`)}`);

        /*
          Auch Bloecke aus dem Netz in den Spiegel geben. Sobald der Knoten
          die Wahrheit ist, muss jeder angenommene Block dorthin, sonst bleibt
          der Spiegel stehen, waehrend die Kette weiterlaeuft. Fehler werden
          nur gemeldet: Der Spiegel darf die Kette nicht aufhalten.
        */
        void server.weitergeben(hash);
      },
      onLog: t => /veraltet|OUTDATED/.test(t)
        ? log('consensus', rot, rot(t))
        : /rejected|abgelehnt/.test(t) ? log('rejected', rot, t) : log('sync', grau, grau(t)),
    });

    try {
      await netz.start();
      abgleich.start();
      statsTakt = setInterval(() => meldeStats(), 30_000);
    } catch (e) {
      const err = e as Error & { code?: string };
      log('peer', gelb, err.code === 'EADDRINUSE'
        ? `peer network not started: port ${opt.p2pPort} is already in use (another yskar-node?)`
        : `peer network not started: ${err.message}`);
      netz = null; abgleich = null;
    }
  }

  // Selbst gefundene Bloecke ins Netz geben.
  const vorherOnBlock = server.onBlock;
  server.onBlock = (h, hash, adresse) => {
    vorherOnBlock?.(h, hash, adresse);
    if (abgleich) {
      const n = abgleich.kuendigeAn(fromHex(hash));
      if (n > 0) melde(`${EINZUG}${grau('sent to ')}${n} ${n > 1 ? 'peers' : 'peer'}`);
    }
  };

  /*
    Pool einschalten, wenn ein Name angegeben ist.

    Die Pruefung passiert HIER und nicht erst beim ersten Block: Ein Pool,
    der Gebuehr nimmt, muss sagen wohin -- sonst startet er nicht. Und der
    Name wandert in die Coinbase jedes Pool-Blocks.
  */
  const fensterPfad = `${opt.daten}/pool-fenster.json`;
  let fensterAusLauf = 0;
  const fensterHinweise: string[] = [];
  if (opt.poolName) {
    let auszahlung: Uint8Array | null = null;
    if (opt.poolFee > 0) {
      if (!opt.poolAuszahlung) {
        abbruch('--pool-fee needs --pool-payout', 'A pool with a fee needs an address that receives the fee: --pool-payout ysr1…');
      }
      try { auszahlung = decodeAddress(opt.poolAuszahlung); }
      catch { abbruch('--pool-payout is not a valid YSKAR address', opt.poolAuszahlung); }
      if (!istAuszahlungsAdresse(auszahlung!)) abbruch('--pool-payout cannot receive a block reward', KEIN_AUSZAHLUNGSKONTO);
    }
    try {
      /*
        Das gesicherte Fenster vom letzten Lauf (Issue #7). Liegt darin noch
        Arbeit, gilt fuer sie die Gebuehr von damals -- eine geaenderte
        --pool-fee erst ab dem naechsten Block.
      */
      const stand = leseFenster(fensterPfad, params.network);
      if (stand.hinweis) fensterHinweise.push(fensterHinweis(stand.hinweis));
      let fee = opt.poolFee;
      if (stand.eintraege.length > 0 && stand.feeBps !== null && stand.feeBps !== fee) {
        fee = stand.feeBps > 0 && !auszahlung ? 0 : stand.feeBps;
      }
      const pk = new PoolCoordinator({
        name: opt.poolName, feeBps: fee, payoutAddress: auszahlung, v6Height: params.v6Height,
        // Unsinn ("--pool-max abc") landet als NaN hier und laesst den Start
        // scheitern -- besser als stillschweigend ohne Grenze zu laufen.
        ...(opt.poolMax !== null ? { maxMiner: opt.poolMax } : {}),
      });
      if (fee !== opt.poolFee) pk.setzeGebuehr(opt.poolFee, auszahlung);
      pk.laden(stand.eintraege);
      fensterAusLauf = stand.eintraege.length;
      server.poolKoordinator = pk;
      server.blockName = nameToExtra(opt.poolName);
    } catch (e) {
      const m = (e as Error).message;
      abbruch('The pool could not start',
        /^Gebuehr .* liegt nicht/.test(m) ? '--pool-fee must be between 0 and 500 basis points (0.00% to 5.00%).'
        : /^Platzzahl .* liegt nicht/.test(m) ? '--pool-max must be between 1 and 255.'
        : /Auszahlungsadresse/.test(m) ? 'A pool with a fee needs --pool-payout.'
        : m);
    }
  }

  try {
    await server.listen(opt.bind, opt.port);
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === 'EADDRINUSE') {
      abbruch(`Port ${opt.port} is already in use`,
        `Another program (often a second yskar-node) listens on ${opt.bind}:${opt.port}.`,
        'Stop it, or choose another port with --port.');
    }
    if (err.code === 'EACCES') abbruch(`No permission to listen on port ${opt.port}`, 'Use a port above 1024.');
    throw e;
  }

  /** Die geltende Gebuehr -- und eine angekuendigte, falls das Fenster noch unter der alten steht. */
  const gebuehrJetzt = () => {
    const e = server.poolKoordinator?.einstellungen();
    if (!e) return `${(opt.poolFee / 100).toFixed(2)}%`;
    const jetzt = `${(e.feeBps / 100).toFixed(2)}%`;
    return e.feeBpsAbNaechstem !== null && e.feeBpsAbNaechstem !== e.feeBps
      ? `${jetzt} (from the next block ${(e.feeBpsAbNaechstem / 100).toFixed(2)}%)` : jetzt;
  };

  kopf('mine');
  abschnitt('NODE');
  zeile('VERSION', `yskar-node ${VERSION}${P}node ${process.version.slice(1)}${P}${process.platform} ${process.arch}`);
  zeile('NETWORK', netzName(params));
  zeile('DATA', `${opt.daten}/chain.db${P}${nf(store.count())} blocks stored`);
  const tip0 = chain.tip();
  zeile('CHAIN', tip0
    ? `height ${nf(tip0.height)}${P}difficulty ${nf(tip0.difficulty)}${P}last block ${
        dauer(Math.max(0, Date.now() / 1000 - Number(tip0.blockTime)))} ago`
    : grau(netz ? 'empty — the chain is loaded from the peers' : 'empty'));
  console.log('');
  fassungsBlock(params, chain.height(), chain, true);
  console.log('');
  abschnitt('SERVICES');
  zeile('MINING API', `http://${opt.bind}:${opt.port}${P}${opt.absender === 'proxy'
    ? 'sender limits from X-Forwarded-For (behind a proxy)'
    : opt.absender === 'socket' ? 'sender limits from the connection' : grau('no limits per sender')}`);
  if (opt.poolName) {
    const pk = server.poolKoordinator;
    const v6ab = naechsteAktivierung(params);
    const plaetzeV6 = v6ab > 0 && chain.height() + 1 < v6ab && pk ? pk.plaetze(v6ab) : null;
    zeile('POOL', `${opt.poolName}${P}fee ${gebuehrJetzt()}${opt.poolAuszahlung && opt.poolFee > 0
      ? ` to ${opt.poolAuszahlung.slice(0, 8)}…${opt.poolAuszahlung.slice(-4)}` : ''}${P}up to ${
        pk?.plaetze() ?? '?'} addresses${plaetzeV6 && plaetzeV6 !== pk?.plaetze()
        ? grau(` (${plaetzeV6} from block ${nf(v6ab)})`) : ''}`);
    if (fensterAusLauf) zeile('', grau(`${nf(fensterAusLauf)} shares loaded from the last run`));
    for (const h of fensterHinweise) zeile('', gelb(h));
  } else {
    zeile('POOL', grau('off (solo mining only)'));
  }
  zeile('PEERS', netz
    ? `${opt.p2pPort > 0 ? `listening on 0.0.0.0:${opt.p2pPort}` : 'outgoing only'}${
        opt.seeds.length ? `${P}${opt.seeds.length} ${opt.seeds.length > 1 ? 'seeds' : 'seed'}` : ''}`
    : grau('off'));
  zeile('FORWARDING', nachOben
    ? `found blocks go to the peers and to ${nachOben}${P}sync every 30 s from ${opt.api}`
    : `found blocks go to the peers${P}${grau('no upstream server')}`);
  zeile('MEMPOOL', `up to ${mb ?? 32} MB`);
  linie();

  /*
    Einmal aufholen, bevor der erste Miner einen Job bekommt. Ohne das baut
    der Knoten die ersten Jobs auf dem Stand vom letzten Beenden -- und jeder
    Fund waere "stale".
  */
  if (nachOben) {
    log('sync', blau, `catching up from ${opt.api} …`);
    try {
      await sync({ ...opt, einmal: true }, store, chain);
      const tip = chain.tip();
      log('sync', blau, `up to date${P}height ${nf(chain.height())}` +
        (tip ? `${P}difficulty ${nf(tip.difficulty)}` : ''));
    } catch (e) {
      log('sync', gelb, `${opt.api}: ${netzFehler(e)}${grau(' · mining continues on the local chain')}`);
    }
  }

  console.log(`\n Connect a miner:`);
  console.log(`   yskar-miner --address ysr1… --api http://${opt.bind}:${opt.port}${opt.poolName ? ' --mode pool' : ''}\n`);
  if (opt.bind !== '127.0.0.1') {
    console.log(` ${gelb(fett('! The mining API is reachable from outside'))}`);
    console.log(`   It listens on ${opt.bind}:${opt.port}. Put it behind a proxy with TLS${
      opt.absender ? '' : ' and start with --sender-ip proxy,'}`);
    console.log(`   ${opt.absender ? 'It' : 'otherwise one sender can open all sessions. It'} accepts work and builds blocks.\n`);
  }

  /*
    Das Fenster des Pools sichern (Issue #7): alle zwei Minuten, wenn sich
    etwas geaendert hat, und beim Beenden in einem Zug.
  */
  let fensterGesichert = '';
  let fensterFolge = 0;
  const sichereFenster = async () => {
    const pk = server.poolKoordinator;
    if (!pk) return;
    const d = chain.tip()?.difficulty;
    if (d && d > 0n && (abgleich?.fehlendeBloecke() ?? 0) <= 1) {
      const behalten = fensterGroesse(d) * 3n;
      if (pk.arbeitGesamt() > behalten * 2n) pk.laden(kuerze(pk.exportieren(), behalten));
    }
    const fee = pk.einstellungen().feeBps;
    const stand = `${pk.eintraege()}:${pk.arbeitGesamt()}:${fee}`;
    if (stand === fensterGesichert) return;
    const folge = ++fensterFolge;
    try {
      const geschrieben = await schreibeFenster(fensterPfad, params.network, fee, pk.exportieren(),
        () => folge === fensterFolge);
      if (geschrieben) fensterGesichert = stand;
    } catch (e) { log('pool', gelb, `pool window not saved: ${(e as Error).message}`); }
  };
  const fensterTakt = server.poolKoordinator ? setInterval(() => { void sichereFenster(); }, FENSTER_TAKT_MS) : null;
  fensterTakt?.unref?.();

  let laeuft = true;
  const aufhoeren = async () => {
    if (!laeuft) return;
    laeuft = false;
    clearInterval(syncTakt);
    clearInterval(takt);
    clearInterval(uebersichtTakt);
    if (statsTakt) clearInterval(statsTakt);
    if (fensterTakt) clearInterval(fensterTakt);
    melde('');
    log('stop', grau, 'stopping …');
    const pk = server.poolKoordinator;
    if (pk) {
      fensterFolge++;
      try { schreibeFensterSofort(fensterPfad, params.network, pk.einstellungen().feeBps, pk.exportieren()); }
      catch (e) { console.error(`  pool window not saved: ${(e as Error).message}`); }
    }
    abgleich?.stop();
    await netz?.stop();
    await server.close();
    status(store, chain, params);
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', aufhoeren);
  process.on('SIGTERM', aufhoeren);

  /*
    Waehrend des Minens weiter synchronisieren. Nach jedem neuen Block
    muessen die offenen Jobs verworfen werden: Sie zeigen auf einen
    Vorgaenger, den es als Kettenkopf nicht mehr gibt.
  */
  let syncLaeuft = false;
  const syncTakt = setInterval(async () => {
    if (syncLaeuft || !nachOben) return;
    syncLaeuft = true;
    // Der Kopf, nicht nur die Hoehe: Ein Reorg auf gleicher Hoehe (Issue #11)
    // aendert den Vorgaenger aller Jobs genauso.
    const vorher = chain.tip() ? toHex(chain.tip()!.hash) : '';
    try {
      await sync({ ...opt, einmal: true }, store, chain, pool);
      if ((chain.tip() ? toHex(chain.tip()!.hash) : '') !== vorher) {
        koordinator.invalidate();
        log('sync', blau, `chain moved on${P}height ${nf(chain.height())}${grau(' · jobs rebuilt')}`);
      }
    } catch (e) {
      log('sync', gelb, `${opt.api}: ${netzFehler(e)}`);
    } finally { syncLaeuft = false; }
  }, 30_000);
  syncTakt.unref();

  const hinweise = fassungsHinweise(params, chain);
  hinweise();

  const takt = setInterval(() => {
    hinweise();
    if (!process.stdout.isTTY) return;
    const tip = chain.tip();
    // Gezeigt wird, WORAN GEARBEITET WIRD -- also der naechste Block, nicht
    // der letzte fertige. Beide haben verschiedene Difficulties.
    const arbeit = koordinator.aktuelleArbeit();
    const naechste = arbeit ? arbeit.height : (tip ? tip.height + 1 : 0);
    process.stdout.write(`\r\x1b[2K${grau('[' + uhr() + ']')} ` +
      `${grau('chain')} ${tip ? nf(tip.height) : '—'} ` +
      `${grau('· building')} ${nf(naechste)} ` +
      `${grau('· diff')} ${arbeit ? nf(arbeit.difficulty) : grau('—')} ` +
      `${grau('·')} ${server.aktiveSessions()} ${server.aktiveSessions() === 1 ? 'miner' : 'miners'} ` +
      `${grau('·')} mempool ${pool.size()}` +
      (netz ? `${grau(' · ')}${netz.bereite().length} peers` : ''));
  }, 1000);
  takt.unref();

  /*
    Uebersicht alle zehn Minuten -- auch ohne Terminal. Im Journal steht so
    regelmaessig, dass der Knoten lebt und wie er steht, ohne dass jemand
    "status" aufrufen muss.
  */
  const uebersichtTakt = setInterval(() => {
    const tip = chain.tip();
    log('stats', grau, `height ${tip ? nf(tip.height) : '—'}${P}${netz ? netz.bereite().length : 0} peers${P}` +
      `${server.aktiveSessions()} mining sessions${P}mempool ${pool.size()}`);
  }, UEBERSICHT_TAKT_MS);
  uebersichtTakt.unref();

  await new Promise(() => { /* bis Strg+C */ });
}

// --------------------------------------------------- Testnetz-Ueberweisungen

/**
 * testkey und send (frueher testkonto und ueberweisen). Nur im Testnetz:
 * Der Schluessel liegt unverschluesselt in einer Datei
 * (testnetzUeberweisung.ts).
 */
async function testnetzBefehl(opt: Optionen, params: ConsensusParams): Promise<void> {
  if (!opt.regtest) {
    abbruch(`"${opt.befehl}" only works with --regtest`, 'Test keys and test transfers exist only on the test network.');
  }
  const { testkonto, ueberweise, ysrInEinheiten, einheitenInYsr } = await import('./testnetzUeberweisung.ts');
  let konto: ReturnType<typeof testkonto>;
  try { konto = testkonto(opt.schluessel); }
  catch (e) { abbruch('The test key cannot be used', (e as Error).message); }

  if (opt.befehl === 'testkey') {
    console.log(`\n  ${konto.neu ? 'New test key in' : 'Test key from'} ${opt.schluessel}`);
    console.log(`  Address  ${fett(konto.schluessel.address)}`);
    console.log(grau(`  Test network only -- the key is stored unencrypted in the file.\n`));
    return;
  }

  if (!opt.an || !opt.betrag) {
    abbruch('"send" needs --to <ysr1…> and --amount <ysr>');
  }
  let ergebnis;
  try {
    const fassung = opt.txFassung === undefined ? undefined : Number(opt.txFassung);
    ergebnis = await ueberweise({
      api: opt.api, schluessel: konto.schluessel, an: opt.an!,
      betrag: ysrInEinheiten(opt.betrag!),
      gebuehr: opt.gebuehr === undefined ? undefined : ysrInEinheiten(opt.gebuehr),
      fassung, memo: opt.memo, params,
    });
  } catch (e) {
    abbruch('Transfer not sent', (e as Error).message);
  }
  const a = ergebnis.antwort;
  console.log(`\n  Node          ${opt.api} (height ${nf(ergebnis.hoehe)}, next block ${nf(ergebnis.hoehe + 1)})`);
  console.log(`  From          ${konto.schluessel.address} (balance ${einheitenInYsr(ergebnis.guthaben)} YSR, nonce ${ergebnis.nonce})`);
  console.log(`  Version       ${ergebnis.fassung}${ergebnis.automatisch ? grau(' (chosen by height)') : gelb(' (forced)')}`);
  console.log(`  Transaction   ${ergebnis.txid}`);
  if (ergebnis.sendepause && ergebnis.automatisch) {
    console.log(gelb(`  Note          sending pause before the activation height -- a wallet would not send now.`));
  }
  if (a.accepted === true) console.log(`  Result        ${fett('accepted')}`);
  else console.log(`  Result        ${rot('rejected')}: ${String(a.reason ?? a.error ?? '?')}${a.detail ? ` (${String(a.detail)})` : ''}`);
  console.log('');
}

// --------------------------------------------------------------------- Hilfe

const HILFE = () => `
 ${fett('YSKAR Full Node')} ${grau(VERSION)} — checks every block itself${grau(' · consensus revision 6 from block 10,000')}

 ${fett('USAGE')}   yskar-node <command> [options]

 ${fett('COMMANDS')}
   ${cyan('sync     ')} download the chain and check every block ${grau('(default)')}
   ${cyan('mine     ')} also open the mining API so miners can work on this node
   ${cyan('status   ')} state of the local node, including the consensus revision
   ${cyan('chain    ')} the last blocks of the active chain
   ${cyan('tips     ')} all known branch tips
   ${cyan('mirror   ')} push missing blocks to the mirror ${grau('(was: spiegel — still works)')}
   ${cyan('testkey  ')} create or show a test key ${grau('(--regtest only; was: testkonto)')}
   ${cyan('send     ')} sign and send a test transfer ${grau('(--regtest only; was: ueberweisen)')}
   ${cyan('verify-message [file]')} check a signed message from a wallet ${grau('(JSON from the file or stdin)')}

 ${fett('GENERAL')}
   ${cyan('-d, --data <dir>      ')} data folder ${grau('(default: ./knoten)')}
   ${cyan('    --api <url>       ')} source for sync ${grau('(default: https://yskar.vercel.app)')}
   ${cyan('    --interval <s>    ')} seconds between sync rounds ${grau('(default: 60)')}
   ${cyan('    --once            ')} catch up once, then exit
   ${cyan('    --regtest         ')} private test network instead of the real chain
   ${cyan('    --v6-height <n>   ')} --regtest only: revision 6 from block n
   ${cyan('-h, --help            ')} show this help
   ${cyan('-v, --version         ')} show the version

 ${fett('MINING API')}
   ${cyan('    --bind <addr>     ')} address to listen on ${grau('(default: 127.0.0.1)')}
   ${cyan('    --port <n>        ')} port ${grau('(default: 8645)')}
   ${cyan('    --sender-ip <how> ')} limit per sender: proxy (X-Forwarded-For) or socket ${grau('(default: no limits)')}
   ${cyan('    --upstream <url>  ')} where found blocks go ${grau('(default: --api)')}
   ${cyan('    --no-upstream     ')} keep found blocks on this node and its peers
   ${cyan('    --mempool-mb <n>  ')} mempool limit in MB ${grau('(default: 32, ≈ 190,000 transfers)')}

 ${fett('POOL')}
   ${cyan('    --pool <name>     ')} run a pool; the name is written into its blocks
   ${cyan('    --pool-fee <bp>   ')} fee in basis points, 100 = 1.00% ${grau('(max 500)')}
   ${cyan('    --pool-payout <a> ')} address that receives the fee ${grau('(needed when the fee is above 0)')}
   ${cyan('    --pool-max <n>    ')} max addresses, 1–255 ${grau('(default: 64, or 63 with a fee; 255/254 from revision 6)')}

 ${fett('PEERS')}
   ${cyan('    --p2p-port <n>    ')} port for other nodes ${grau('(default: 8646)')}
   ${cyan('    --seed host:port  ')} a known node, can be given several times
   ${cyan('    --no-p2p          ')} run without other nodes

 ${fett('TEST TRANSFERS')} ${grau('(--regtest only)')}
   ${cyan('    --key <file>      ')} test key ${grau('(default: ./testkonto.json)')}
   ${cyan('    --to <ysr1…>      ')} recipient
   ${cyan('    --amount <ysr>    ')} amount in YSR, for example 10 or 0.5
   ${cyan('    --fee <ysr>       ')} fee in YSR ${grau('(default: 0.001)')}
   ${cyan('    --tx-version <n>  ')} force transfer version 1 or 2 ${grau('(default: by height)')}
   ${cyan('    --memo <text>     ')} note, at most 32 bytes

 ${fett('EXAMPLES')}
   yskar-node mine --data ./knoten --seed pool.yskar.app:8646 --seed yskar-seed2.dynv6.net:8646 --no-upstream
   yskar-node mine --data ./knoten --pool "My Pool" --pool-fee 100 --pool-payout ysr1…
   yskar-node status --data ./knoten
   yskar-node mine --regtest --data ./testnet        ${grau('# then: yskar-miner --address ysr1… --api http://127.0.0.1:8645')}

 ${grau(`Docs: ${DOKU}`)}
`;

// ------------------------------------------------------- Signierte Nachricht

/*
 * verify-message: Prueft das Ergebnis einer Wallet {address, publicKey,
 * signature, message} nach den Regeln aus src/lib/core/signedMessage.ts.
 * Der Full Node signiert selbst nichts -- er hat keine Wallet. Pruefen kann
 * aber jeder: Dafuer braucht es keinen Schluessel und keine Kette.
 * Rueckgabe: 0 gueltig, 1 ungueltig, 2 Eingabe nicht lesbar.
 */
async function pruefeNachrichtBefehl(rest: string[]): Promise<number> {
  const datei = rest.find(a => !a.startsWith('-'));
  let roh: string;
  try {
    if (datei) roh = readFileSync(datei, 'utf8');
    else if (process.stdin.isTTY) {
      console.error(`${rot('✗')} No input. Give a file, or pipe the JSON in: ${cyan('yskar-node verify-message result.json')}`);
      return 2;
    } else {
      const teile: Buffer[] = [];
      for await (const c of process.stdin) teile.push(c as Buffer);
      roh = Buffer.concat(teile).toString('utf8');
    }
  } catch (e) {
    console.error(`${rot('✗')} Cannot read ${datei}: ${(e as Error).message}`);
    return 2;
  }
  const ergebnis = liesErgebnis(roh);
  if (!ergebnis) {
    console.error(`${rot('✗')} This is not a wallet result. Expected JSON with address, publicKey, signature and message.`);
    return 2;
  }
  const p = pruefeNachricht(ergebnis);
  if (!p.gueltig) {
    console.log(`${rot('✗ Not valid.')} ${p.text}`);
    return 1;
  }
  console.log(`${gruen('✓ Valid.')} Signed by ${fett(p.address)}`);
  if (p.inhalt.art === 'login') {
    const a = p.inhalt.anmeldung;
    console.log(`  ${grau('purpose')}  login`);
    console.log(`  ${grau('domain ')}  ${a.domain}`);
    console.log(`  ${grau('issued ')}  ${a.issued}`);
    console.log(`  ${grau('expires')}  ${a.expires}`);
  } else {
    console.log(`  ${grau('purpose')}  text`);
    for (const z of p.inhalt.text.split('\n')) console.log(`  ${grau('│')} ${z}`);
  }
  return 0;
}

// --------------------------------------------------------------------- Lauf

async function main(): Promise<void> {
  const opt = argumente(process.argv.slice(2));
  if (opt.version) { console.log(VERSION); return; }
  if (opt.help) { console.log(HILFE()); return; }
  if (!BEFEHLE.includes(opt.befehl)) {
    abbruch(`Unknown command: ${opt.befehl}`, `Commands: ${BEFEHLE.join(', ')}. Help: yskar-node --help`);
  }

  if (opt.befehl === 'verify-message') { process.exitCode = await pruefeNachrichtBefehl(process.argv.slice(3)); return; }

  let params: ConsensusParams;
  try { params = netzParameter(opt); }
  catch (e) { abbruch((e as Error).message); }
  if (opt.befehl === 'testkey' || opt.befehl === 'send') {
    await testnetzBefehl(opt, params);
    return;
  }

  /*
    Die erwartete Kennung kommt aus den Parametern, nicht aus einer
    Konstante. Sonst liesse sich ein Testnetz-Ordner nur einmal oeffnen.
  */
  let store: ChainStore;
  try {
    store = new ChainStore(`${opt.daten}/chain.db`,
      { network: params.network, chainId: params.chainId });
  } catch (e) {
    const m = (e as Error).message;
    const netzFalsch = /^This data folder belongs to network=(\S+), expected (\S+)\./.exec(m);
    if (netzFalsch) {
      abbruch('The data folder cannot be used',
        `${opt.daten}/chain.db belongs to network ${netzFalsch[1]}, not ${netzFalsch[2]}.`,
        netzFalsch[1].includes('regtest') ? 'Start with --regtest, or use another folder with --data.'
          : 'Start without --regtest, or use another folder with --data.');
    }
    abbruch('The data folder cannot be used', m, `Remove the folder ${opt.daten} and synchronize again.`);
  }
  let chain: ChainManager;
  try {
    chain = new ChainManager(store, params);
  } catch (e) {
    if (e instanceof AktivierungsFehler) {
      // Die Ablage ist richtig, das Programm passt nicht zu ihr. Loeschen und
      // neu synchronisieren hiesse: mit der falschen Hoehe auf eine andere Kette.
      abbruch('The data folder does not match this program', (e as Error).message,
        `${fett('Do NOT delete the folder.')} Use the program version whose activation height matches this chain.`);
    }
    abbruch('The data folder cannot be used', (e as Error).message,
      `Remove the folder ${opt.daten} and synchronize again.`);
  }
  if (chain.alteBloeckeVerworfen > 0) {
    log('consensus', gelb, `${nf(chain.alteBloeckeVerworfen)} stored ${chain.alteBloeckeVerworfen === 1
      ? 'block' : 'blocks'} from block ${nf(params.v6Height)} on followed the old rules and ${
      chain.alteBloeckeVerworfen === 1 ? 'was' : 'were'} discarded.`);
    melde(grau(`${EINZUG}The correct blocks come from the peers.`));
  }

  if (opt.befehl === 'mine') { await mine(opt, store, chain); return; }
  if (opt.befehl === 'status') { status(store, chain, params); store.close(); return; }
  if (opt.befehl === 'chain') { chainListe(store); store.close(); return; }
  if (opt.befehl === 'tips') { tipsListe(store); store.close(); return; }
  if (opt.befehl === 'mirror') { await spiegel(opt, store, chain); store.close(); return; }

  // sync
  kopf('sync');
  zeile('NETWORK', netzName(params));
  zeile('SOURCE', opt.api);
  zeile('DATA', `${opt.daten}/chain.db`);
  zeile('HEIGHT', chain.height() < 0 ? grau('empty') : nf(chain.height()));
  console.log('');
  fassungsBlock(params, chain.height(), chain, true);
  linie();
  console.log('');

  let laeuft = true;
  const aufhoeren = () => { laeuft = false; };
  process.on('SIGINT', aufhoeren);
  process.on('SIGTERM', aufhoeren);
  const hinweise = fassungsHinweise(params, chain);

  for (;;) {
    try {
      const ok = await sync(opt, store, chain);
      hinweise();
      if (!ok) { store.close(); process.exit(2); }
    } catch (e) {
      log('sync', gelb, `${opt.api}: ${netzFehler(e)}`);
    }
    if (opt.einmal || !laeuft) break;
    await new Promise(r => setTimeout(r, opt.intervall * 1000));
  }

  console.log('');
  status(store, chain, params);
  store.close();
}

main().catch(e => { console.error(rot(`\n${(e as Error).stack ?? (e as Error).message}`)); process.exit(1); });
