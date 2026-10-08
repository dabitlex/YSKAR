#!/usr/bin/env node
/**
 * YSKAR Full Node — Kommandozeile.
 *
 * Holt die Kette und prueft jeden Block SELBST: Header, Proof of Work,
 * Merkle-Wurzel, Signaturen, Guthaben, Zustandswurzel, Difficulty-Regel.
 * Gespeichert wird lokal in SQLite, mit Block-Index und Gabelungen.
 *
 * Unterschied zum Beobachter: Der Beobachter kennt nur eine Kette und legt
 * Bloecke nach Hoehe ab. Dieser Knoten haelt mehrere Bloecke je Hoehe,
 * rechnet kumulierte Arbeit und kann auf einen anderen Zweig umschalten.
 *
 * Was er NOCH NICHT kann: Bloecke annehmen (P2P), selbst minen, Pool. Die
 * Bloecke kommen bis dahin ueber die oeffentliche Leseschnittstelle --
 * geprueft werden sie trotzdem vollstaendig und ohne dem Server zu glauben.
 */
import { stateRoot, totalSupply } from '../../core/state.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import { NETWORK } from '../../core/params.ts';
import { ChainStore } from './ChainStore.ts';
import { spiegelKopf } from './spiegelKopf.ts';
import { ChainManager } from './ChainManager.ts';
import { TxPool } from './TxPool.ts';
import { MiningCoordinator } from './MiningCoordinator.ts';
import { MiningServer } from './MiningServer.ts';
import { MAINNET, REGTEST, type ConsensusParams } from '../../core/networks.ts';
import { PeerManager } from '../p2p/PeerManager.ts';
import type { PeerConnection } from '../p2p/PeerConnection.ts';
import { encodeStats, decodeStats, STATS_FAEHIG } from '../p2p/messages.ts';
import { NetzStatistik } from './NetzStatistik.ts';
import { PoolCoordinator } from '../../pool/PoolCoordinator.ts';
import { fensterGroesse } from '../../pool/pplns.ts';
import { leseFenster, schreibeFenster, schreibeFensterSofort, kuerze } from '../../pool/fensterDatei.ts';
import { nameToExtra } from '../../chain/finderName.ts';
import { decodeAddress } from '../../core/address.ts';
import { SyncManager } from '../p2p/SyncManager.ts';
import { mempoolNachziehen } from './mempoolPflege.ts';

const VERSION = '0.1.0';
/** Wie oft das Fenster des Pools gesichert wird (wie in Node Core). */
const FENSTER_TAKT_MS = 120_000;

/*
  Node warnt bei jedem Start, dass node:sqlite experimentell sei. Fuer den
  Nutzer ist das Rauschen -- er hat die Entscheidung nicht getroffen.

  Gefiltert wird NUR diese eine Warnung. Alle Warnungen abzuschalten wuerde
  auch die verstecken, die etwas bedeuten.
*/
// removeAllListeners zuerst: Node druckt Warnungen ueber einen eigenen
// Empfaenger, der bestehen bleibt, wenn man nur einen weiteren hinzufuegt.
// Ohne diese Zeile erscheint die Warnung trotz Filter -- so gesehen und
// korrigiert.
process.removeAllListeners('warning');
process.on('warning', w => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(`${w.name}: ${w.message}`);
});

interface Optionen {
  api: string; daten: string; befehl: string;
  einmal: boolean; intervall: number; help?: boolean;
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
  /** Wohin gefundene Bloecke gehen. Leer heisst: nirgends. */
  upstream?: string;
  /**
   * Woher der Absender einer Mining-Anfrage kommt (--sender-ip): 'proxy'
   * hinter einem Proxy wie Caddy, 'socket' ohne Proxy. Ohne Angabe gelten
   * keine Grenzen je Absender.
   */
  absender: 'proxy' | 'socket' | null;
}

function argumente(argv: string[]): Optionen {
  const o: Optionen = {
    api: 'https://yskar.vercel.app', daten: './knoten',
    befehl: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'sync',
    einmal: false, intervall: 60,
    bind: '127.0.0.1', port: 8645, regtest: false,
    p2pPort: 8646, seeds: [], keinP2P: false,
    poolName: '', poolFee: 0, poolAuszahlung: '', poolMax: null,
    absender: null,
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
      case '--sender-ip': {
        const w = nimm();
        if (w !== 'proxy' && w !== 'socket') {
          console.error(`  --sender-ip kennt "proxy" oder "socket", nicht "${w}".`);
          process.exit(1);
        }
        o.absender = w;
        break;
      }
      case '--help': case '-h': o.help = true; break;
    }
  }
  return o;
}

const HILFE = `
YSKAR Full Node ${VERSION}

  yskar-node <befehl> [Optionen]

Befehle
  sync      Kette holen und jeden Block selbst prüfen (Vorgabe)
  spiegel   liegengebliebene Blöcke an die Gegenstelle nachschieben
  mine      Mining-Schnittstelle öffnen, damit Miner hier arbeiten können
  status    Stand des lokalen Knotens
  chain     die letzten Blöcke der aktiven Kette
  tips      alle bekannten Zweigenden

Optionen
  -d, --data <ordner>   Ablage (Vorgabe: ./knoten)
      --api <url>       Quelle (Vorgabe: https://yskar.vercel.app)
      --interval <sek>  Abstand zwischen Abfragen (Vorgabe: 60)
      --once            einmal aufholen und beenden
      --bind <adresse>  für "mine" (Vorgabe: 127.0.0.1)
      --port <nummer>   für "mine" (Vorgabe: 8645)
      --regtest         eigenes Testnetz statt der echten Kette
      --upstream <url>  wohin gefundene Blöcke gehen (Vorgabe: --api)
      --no-upstream     gefundene Blöcke nur lokal behalten
      --p2p-port <nr>   Lauschport für andere Knoten (Vorgabe: 8646)
      --seed host:port  ein bekannter Knoten, mehrfach angebbar
      --no-p2p          ohne Knotennetz laufen

Spiegel nachziehen
  yskar-node spiegel --data ./knoten

  Vergleicht die Höhe der Gegenstelle mit der eigenen und schiebt jeden
  fehlenden Block einzeln nach -- in der richtigen Reihenfolge, denn die
  Gegenstelle nimmt immer nur den nächsten an. Bricht beim ersten Fehler ab
  und sagt, welcher Block ihn ausgelöst hat.
      --pool <name>     Pool betreiben, Name steht im Block
      --pool-fee <bp>   Gebühr in Basispunkten (100 = 1,00 %, höchstens 500)
      --pool-payout <a> Adresse für die Gebühr (nötig ab --pool-fee > 0)
      --pool-max <n>    höchstens so viele Adressen aufnehmen (Vorgabe: 64,
                        mit Gebühr 63 -- mehr zahlt ein Block nicht aus)
      --sender-ip <q>   Absender von Mining-Anfragen erkennen und je
                        Absender begrenzen: "proxy" hinter Caddy o. ä.
                        (letzter Eintrag von X-Forwarded-For), "socket"
                        ohne Proxy. Vorgabe: keine Grenzen je Absender.

Pool betreiben
  yskar-node mine --data ./knoten --pool pool.yskar.net --pool-fee 100 \
                  --pool-payout ysr1…

  Miner melden sich dann mit mode=pool an. Der Block selbst zahlt alle
  Beteiligten aus — der Betreiber hält zu keinem Zeitpunkt fremdes Guthaben.

  Ein voller Pool lehnt neue Adressen ab; wer schon dabei ist, darf weitere
  Geräte anmelden. Stand für alle lesbar unter /api/v2/pool.

Mit anderen Knoten verbinden
  yskar-node mine --data ./knoten --seed 203.0.113.5:8646

  Jeder Block, der über das Netz kommt, wird vollständig selbst geprüft --
  Header, Proof of Work, Signaturen, Guthaben, Zustandswurzel. Ein Peer
  liefert Daten, sonst nichts.

Mining gegen den eigenen Knoten
  yskar-node mine --regtest --data ./testnetz
  yskar-miner --address ysr1… --api http://127.0.0.1:8645

  Der bestehende Miner läuft unverändert -- der Knoten spricht dasselbe
  Protokoll wie der Server. Nur die Adresse ist eine andere.
`;

// ----------------------------------------------------------------- Ausgabe

/**
 * Meldung ausgeben, ohne die laufende Statuszeile zu zerreissen.
 *
 * Die Statuszeile wird mit \r an Ort und Stelle erneuert. Wer daneben
 * einfach console.log benutzt, haengt seinen Text an ihren Rest an -- so
 * entstand "Mempool 0[06:20:58] 1 Bloecke geprueft". Erst loeschen, dann
 * drucken.
 */
function melde(text: string): void {
  if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
  console.log(text);
}

const FARBE = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (c: string, s: string) => FARBE ? `\x1b[${c}m${s}\x1b[0m` : s;
const gruen = (s: string) => f('32', s), rot = (s: string) => f('31', s);
const gelb = (s: string) => f('33', s), grau = (s: string) => f('90', s);
const fett = (s: string) => f('1', s);
const uhr = () => new Date().toTimeString().slice(0, 8);
const nf = (n: number | bigint) => Number(n).toLocaleString('de-DE');

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

// ------------------------------------------------------------------ Befehle

/**
 * Liegengebliebene Bloecke an die Gegenstelle nachschieben.
 *
 * WOZU: Die Gegenstelle nimmt immer nur den NAECHSTEN Block an. Scheitert
 * einer -- durch einen Ausfall, einen Netzfehler oder einen Fehler wie den
 * mit den u64-Spalten --, blockiert er alle weiteren. Der Spiegel bleibt
 * stehen, waehrend die Kette weiterlaeuft.
 *
 * Diese Funktion schliesst die Luecke, ohne dass die Kette angefasst wird:
 * Sie liest die Bloecke aus der eigenen Ablage und schickt sie einzeln in
 * der richtigen Reihenfolge.
 *
 * Beim ERSTEN Fehler wird abgebrochen. Weitermachen waere sinnlos -- der
 * naechste Block braucht den vorigen -- und wuerde den eigentlichen Grund
 * unter einer Fehlerlawine begraben.
 */
async function spiegel(
  opt: Optionen, store: ChainStore, chain: ChainManager,
): Promise<void> {
  const ziel = opt.upstream || opt.api;
  console.log(fett(`\nYSKAR Spiegel`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Gegenstelle  ${ziel}`);

  const eigene = chain.height();
  if (eigene === null) {
    console.error(rot('  Die eigene Kette ist leer -- erst "sync" laufen lassen.'));
    process.exit(1);
  }

  let dort: number;
  try {
    /*
      WARUM NICHT /api/v2/summary

      Seit der Umstellung reicht die Gegenstelle ihr summary an DIESEN
      Knoten durch. Gefragt, wie hoch sie stehe, antwortete sie also mit
      unserer eigenen Hoehe -- und der Vergleich unten saehe immer
      "gleichauf". Bei einem vollstaendig geleerten Spiegel hiesse das:
      "Nichts nachzuschieben", waehrend in Wahrheit alles fehlt. Ein
      Fehler, der sich als Erfolg meldet, ist schlimmer als ein Abbruch.

      /api/v2/blocks liest dagegen aus dem Spiegel selbst. Eine leere
      Liste ist die ehrliche Antwort "ich habe nichts" und wird zu -1,
      damit die Schleife unten bei Hoehe 0 anfaengt.
    */
    const res = await fetch(`${ziel}/api/v2/blocks?limit=1`, { signal: AbortSignal.timeout(ANFRAGE_FRIST_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /*
      Erst pruefen, DANN auswerten. Antwortet dort ein Vorschaltserver mit
      einer Fehlerseite, kaeme aus json() ein Parserfehler -- und der
      verdeckt, was wirklich los ist.
    */
    const text = await res.text();
    let r: { blocks?: { height?: number }[] };
    try { r = JSON.parse(text); }
    catch { throw new Error(`keine JSON-Antwort: ${text.slice(0, 60)}`); }
    if (!Array.isArray(r.blocks)) throw new Error('Antwort ohne Blockliste');
    // Leerer Spiegel -> -1, damit unten bei Hoehe 0 begonnen wird.
    dort = r.blocks.length === 0 ? -1 : Number(r.blocks[0].height ?? -1);
    if (!Number.isFinite(dort)) throw new Error('Antwort ohne Höhe');
  } catch (e) {
    console.error(rot(`  Gegenstelle nicht erreichbar: ${(e as Error).message}`));
    process.exit(1);
  }

  console.log(`  dort         ${nf(dort)}`);
  console.log(`  hier         ${nf(eigene)}`);

  if (dort >= eigene) {
    console.log(gruen('\n  Nichts nachzuschieben -- der Spiegel ist aktuell.\n'));
    return;
  }
  console.log(grau(`\n  ${nf(eigene - dort)} Blöcke nachzuschieben.\n`));

  let geschafft = 0;
  for (let h = dort + 1; h <= eigene; h++) {
    const b = store.mainAt(h);
    if (!b) {
      console.error(rot(`  Block ${nf(h)} fehlt in der eigenen Ablage.`));
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
        console.error(rot(`  Block ${nf(h)} abgelehnt: ${
          body.detail ?? body.reason ?? `HTTP ${res.status}`}`));
        console.error(grau('  Abgebrochen -- die folgenden brauchen diesen Block.\n'));
        break;
      }
      geschafft++;
      if (geschafft % 10 === 0 || h === eigene) {
        console.log(grau(`  ${nf(h)} …`));
      }
    } catch (e) {
      console.error(rot(`  Block ${nf(h)}: ${(e as Error).message}`));
      break;
    }
  }

  console.log(geschafft === eigene - dort
    ? gruen(`\n  ${nf(geschafft)} Blöcke nachgeschoben. Spiegel ist aktuell.\n`)
    : gelb(`\n  ${nf(geschafft)} von ${nf(eigene - dort)} nachgeschoben.\n`));
}

function status(store: ChainStore, chain: ChainManager): void {
  const tip = chain.tip();
  console.log(fett(`\nYSKAR Full Node ${VERSION}`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Netz            ${NETWORK}`);
  console.log(`  Höhe            ${tip ? nf(tip.height) : '—'}`);
  console.log(`  Bester Block    ${tip ? toHex(tip.hash) : '—'}`);
  console.log(`  Chain Work      ${tip ? nf(tip.chainWork) : '—'}`);
  console.log(`  Difficulty      ${tip ? nf(tip.difficulty) : '—'}`);
  console.log(`  Blöcke gespeichert ${nf(store.count())}`);
  console.log(`  Zweigenden      ${store.tips().length}`);
  if (tip) {
    console.log(`  Zustandswurzel  ${toHex(stateRoot(chain.state()))}`);
    console.log(`  Im Umlauf       ${nf(Number(totalSupply(chain.state())) / 1e8)} YSR`);
    const alter = Math.round(Date.now() / 1000 - Number(tip.blockTime));
    console.log(`  Letzter Block   vor ${alter < 90 ? alter + ' s' : Math.round(alter / 60) + ' min'}`);
  }
  console.log(grau('─'.repeat(56)) + '\n');
}

function chainListe(store: ChainStore): void {
  const tip = store.mainTip();
  if (!tip) { console.log('Noch keine Blöcke.'); return; }
  console.log('');
  for (let h = Math.max(0, tip.height - 14); h <= tip.height; h++) {
    const b = store.mainAt(h);
    if (!b) continue;
    const andere = store.atHeight(h).length - 1;
    console.log(
      `  ${grau('#' + String(h).padStart(6))}  ${toHex(b.hash).slice(0, 32)}…  ` +
      `${grau('Diff')} ${String(nf(b.difficulty)).padStart(9)}` +
      (andere > 0 ? gelb(`  +${andere} Zweig${andere > 1 ? 'e' : ''}`) : ''));
  }
  console.log('');
}

function tipsListe(store: ChainStore): void {
  const alle = store.tips();
  console.log('');
  if (alle.length === 0) { console.log('  Keine.'); return; }
  for (const t of alle) {
    const aktiv = t.mainChain;
    console.log(
      `  ${aktiv ? gruen('aktiv ') : grau('Zweig ')} ` +
      `${grau('#' + String(t.height).padStart(6))}  ${toHex(t.hash).slice(0, 32)}…  ` +
      `${grau('Arbeit')} ${nf(t.chainWork)}`);
  }
  console.log('');
  if (alle.length > 1) {
    console.log(grau('  Mehrere Zweigenden heißt: Es gab eine Gabelung. Aktiv ist der\n' +
                     '  mit der meisten kumulierten Arbeit.\n'));
  }
}

/**
 * Kette aufholen.
 *
 * Stapelweise, weil ein Aufruf je Block bei zehntausenden Bloecken
 * unzumutbar waere. Jeder Block wird einzeln geprueft -- der Stapel ist
 * nur die Transportform.
 */
/**
 * `pool` ist optional, weil dieselbe Funktion zwei Rollen spielt: beim
 * Start den Erstabgleich (da gibt es noch keinen Mempool) und im Betrieb
 * den Takt alle 30 Sekunden (da gibt es einen, und er muss gepflegt
 * werden). Ohne ihn blieben ueber sync hereingeholte Bloecke die letzte
 * Luecke, durch die eine erledigte Ueberweisung in der Warteschlange
 * stehen bleibt.
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
    ("vorgaenger_fehlt"). Bisher endete der Abgleich dort -- im Betrieb alle
    30 Sekunden mit BLOCK ABGELEHNT, und der Knoten blieb auf seinem Zweig
    (Issue #11). Jetzt geht er schrittweise zurueck (1, 2, 4, ... Bloecke),
    bis die Gegenstelle einen Block liefert, dessen Vorgaenger wir kennen.
    Ab dort werden ihre Bloecke normal geprueft; hat ihr Zweig mehr Arbeit,
    wechselt die Kette (Reorg) wie bei Bloecken aus dem Knotennetz.
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
        // Abzweigung: weiter zurueck fragen. Nie unter Hoehe 0 -- passt auch
        // der Genesis nicht, ist es eine andere Kette, und das meldet accept()
        // dann selbst.
        schritt = schritt === 0 ? 1 : schritt * 2;
        const zurueck = Math.max(0, b.height - schritt);
        if (schritt === 1) {
          melde(`${grau('[' + uhr() + ']')} ${gelb('Abzweigung')} ` +
            `bei Höhe ${nf(b.height)}: Gegenstelle folgt einem anderen Zweig, suche den gemeinsamen Vorgänger…`);
        }
        von = zurueck;
        continue abgleich;
      }
      if (!r.ok) {
        // Der Zweck dieses Programms. Ab hier ist jede weitere Aussage wertlos.
        melde('');
        melde(rot(fett('BLOCK ABGELEHNT')));
        melde(rot(`  Höhe ${b.height}: ${r.grund}`));
        if (r.detail) melde(rot(`  ${r.detail}`));
        melde('');
        melde(grau('  Der Server liefert etwas, das der Kette widerspricht.'));
        melde(grau(`  Lokal geprüft bis Höhe ${chain.height()}.`));
        return false;
      }
      if (r.stored) {
        geprueft++;
        if (pool) mempoolNachziehen(r, pool, chain.state(), chain.height());
        if (r.reorg) {
          melde(`${grau('[' + uhr() + ']')} ${gelb('Reorg')} ` +
            `auf Höhe ${r.height}, neuer Tip ${toHex(r.tip).slice(0, 16)}…`);
        }
      }
      von = b.height + 1;
    }
  }

  if (geprueft > 0) {
    const tip = chain.tip()!;
    melde(
      `${grau('[' + uhr() + ']')} ${gruen('✓')} ${geprueft} Blöcke geprüft ` +
      `${grau('·')} Höhe ${nf(tip.height)} ` +
      `${grau('·')} Arbeit ${nf(tip.chainWork)} ` +
      `${grau('·')} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } else if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[2K${grau('[' + uhr() + ']')} ` +
      `auf Höhe ${nf(chain.height())}, warte…`);
  }
  return true;
}

/**
 * Mining-Schnittstelle oeffnen.
 *
 * Der Knoten baut die Jobs selbst und nimmt gefundene Bloecke selbst an --
 * ohne Server. Der bestehende Miner spricht dasselbe Protokoll und laeuft
 * unveraendert dagegen.
 */
async function mine(opt: Optionen, store: ChainStore, chain: ChainManager): Promise<void> {
  const params: ConsensusParams = opt.regtest ? REGTEST : MAINNET;
  const pool = new TxPool(params);
  const koordinator = new MiningCoordinator(chain, store, pool, params);
  const server = new MiningServer({ chain, store, pool, mining: koordinator }, {
    host: opt.bind, port: opt.port, params, absender: opt.absender,
  });
  // Weicht ein Job aus der Vorarbeit je vom vollen Blockbau ab, schaltet
  // sich die Vorarbeit ab -- und das gehoert ins Protokoll.
  koordinator.onFehler = (wo, e) => melde(rot(`[${uhr()}] ${wo}: ${e.message}`));

  // Ohne Weitergabe laege ein gefundener Block nur hier und wuerde beim
  // naechsten Block der anderen Seite verdraengt. Im Testnetz gibt es
  // niemanden, dem man ihn geben koennte.
  const nachOben = opt.upstream !== undefined
    ? opt.upstream
    : (opt.regtest ? '' : opt.api);
  if (nachOben) server.upstream = nachOben;

  /*
    Eine ueber die Schnittstelle eingereichte Ueberweisung an die Peers
    ankuendigen.

    Der SyncManager entsteht erst weiter unten -- deshalb die Closure und
    nicht die Referenz: Sie liest `abgleich` erst, wenn tatsaechlich eine
    Ueberweisung hereinkommt. Ohne P2P ist er nie gesetzt, dann passiert
    hier nichts, und das ist richtig so.
  */
  server.onNeueTx = hash => { abgleich?.kuendigeAnTx(hash); };

  server.onUpstream = e => {
    melde(e.ok
      ? grau(`           weitergegeben, dort als Höhe ${nf(e.hoehe ?? 0)} angenommen`)
      : gelb(`           nicht weitergegeben: ${e.grund}`));
  };

  server.onFehler = (wo, e) => {
    melde(rot(`[${uhr()}] Fehler bei ${wo}: ${e.message}`));
    if (e.stack) melde(grau(e.stack.split('\n').slice(1, 4).join('\n')));
  };

  server.onBlock = (h, hash, adresse) => {
    melde('');
    melde(gruen(fett(`[${uhr()}] BLOCK GEFUNDEN  #${nf(h)}`)));
    melde(grau(`           ${hash}`));
    melde(grau(`           an ${adresse.slice(0, 16)}…`));
  };

  /*
    Das Knotennetz.

    Es laeuft neben der Mining-Schnittstelle und unabhaengig von ihr: Ein
    Knoten ohne Miner ist ein vollwertiger Teilnehmer, und ein Miner ohne
    Peers arbeitet weiter. Faellt das Netz aus, prueft der Knoten seine
    Kette trotzdem.
  */
  let netz: PeerManager | null = null;
  let abgleich: SyncManager | null = null;
  let statsTakt: ReturnType<typeof setInterval> | null = null;

  /*
    Miner-Statistik ueber die Knoten hinweg (NetzStatistik.ts).

    Gesendet wird NUR an Peers, deren Kennung "+stats" traegt. Ein Knoten
    aelterer Fassung kennt den Befehl nicht und wuerde die Verbindung
    trennen -- er bekommt deshalb nie eine Meldung und sieht auch sonst
    keinen Unterschied.
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

  if (!opt.keinP2P) {
    const seeds = opt.seeds.map(s => {
      const i = s.lastIndexOf(':');
      if (i < 1) throw new Error(`Seed "${s}" muss host:port sein`);
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
        melde(`${grau('[' + uhr() + ']')} ${grau('Peer')} ${p.host} ` +
          `${grau('· Höhe')} ${nf(p.fremdeHoehe())}`);
        abgleich?.aufPeer(p);
        meldeStats(p);
      },
      onMessage: (p, f) => {
        if (f.command === 'stats') {
          try { statistik.aufnehmen(decodeStats(f.payload), `v:${p.id}`); }
          catch (e) { p.close(`stats_unlesbar:${(e as Error).message}`); }
          return;
        }
        abgleich?.aufNachricht(p, f);
      },
      onClose: (p, g) => {
        if (p.ready) melde(grau(`[${uhr()}] Peer ${p.host} weg: ${g}`));
      },
      onLog: t => melde(grau(`[${uhr()}] ${t}`)),
    });

    abgleich = new SyncManager({
      chain, store, peers: netz, params, pool,
      onBlock: (h, hash, von) => {
        koordinator.invalidate();
        melde(`${grau('[' + uhr() + ']')} ${gruen('Block')} ${grau('#')}${nf(h)} ` +
          `${grau('von')} ${von} ${grau(hash.slice(0, 16) + '…')}`);

        /*
          Auch Bloecke aus dem Netz in den Spiegel geben.

          Bisher ging nur der SELBST gefundene Block nach oben -- das
          genuegte, solange Supabase die Wahrheit war und die Bloecke
          ohnehin dort entstanden. Sobald der Knoten die Wahrheit ist, muss
          jeder angenommene Block dorthin, sonst bleibt der Spiegel stehen,
          waehrend die Kette weiterlaeuft.

          Fehler werden nur gemeldet, nicht behandelt: Der Spiegel darf die
          Kette nicht aufhalten. Faellt er aus, holt ihn der naechste Block
          nicht ein -- dafuer gibt es "sync" von der anderen Seite.
        */
        void server.weitergeben(hash);
      },
      onLog: t => melde(grau(`[${uhr()}] ${t}`)),
    });

    try {
      await netz.start();
      abgleich.start();
      statsTakt = setInterval(() => meldeStats(), 30_000);
    } catch (e) {
      melde(gelb(`  Knotennetz konnte nicht starten: ${(e as Error).message}`));
      netz = null; abgleich = null;
    }
  }

  // Selbst gefundene Bloecke ins Netz geben.
  const vorherOnBlock = server.onBlock;
  server.onBlock = (h, hash, adresse) => {
    vorherOnBlock?.(h, hash, adresse);
    if (abgleich) {
      const n = abgleich.kuendigeAn(fromHex(hash));
      if (n > 0) melde(grau(`           an ${n} Peer${n > 1 ? 's' : ''} gemeldet`));
    }
  };

  /*
    Pool einschalten, wenn ein Name angegeben ist.

    Die Pruefung passiert HIER und nicht erst beim ersten Block: Ein Pool,
    der Gebuehr nimmt, muss sagen wohin -- sonst startet er nicht. Und der
    Name wandert in die Coinbase jedes Pool-Blocks, also gelten dieselben
    Regeln wie ueberall: druckbares ASCII, hoechstens 32 Zeichen.
  */
  const fensterPfad = `${opt.daten}/pool-fenster.json`;
  let fensterAusLauf = 0;
  if (opt.poolName) {
    let auszahlung: Uint8Array | null = null;
    if (opt.poolFee > 0) {
      if (!opt.poolAuszahlung) {
        console.error('  --pool-fee ohne --pool-payout: Wohin soll die Gebühr gehen?');
        process.exit(1);
      }
      try { auszahlung = decodeAddress(opt.poolAuszahlung); }
      catch { console.error('  --pool-payout ist keine gültige YSKAR-Adresse.'); process.exit(1); }
    }
    try {
      /*
        Das gesicherte Fenster vom letzten Lauf (Issue #7). Liegt darin noch
        Arbeit, gilt fuer sie die Gebuehr von damals -- eine geaenderte
        --pool-fee erst ab dem naechsten Block, wie im laufenden Betrieb und
        wie in Node Core. Sonst liesse sich die Gebuehr fuer schon geleistete
        Arbeit anheben, indem man den Knoten neu startet.
      */
      const stand = leseFenster(fensterPfad, params.network);
      if (stand.hinweis) console.log(gelb(`  Fenster des Pools: ${stand.hinweis}`));
      let fee = opt.poolFee;
      if (stand.eintraege.length > 0 && stand.feeBps !== null && stand.feeBps !== fee) {
        fee = stand.feeBps > 0 && !auszahlung ? 0 : stand.feeBps;
      }
      const pk = new PoolCoordinator({
        name: opt.poolName, feeBps: fee, payoutAddress: auszahlung,
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
      console.error(`  Pool konnte nicht starten: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  await server.listen(opt.bind, opt.port);

  /** Die geltende Gebuehr -- und eine angekuendigte, falls das Fenster noch unter der alten steht. */
  const gebuehrJetzt = () => {
    const e = server.poolKoordinator?.einstellungen();
    if (!e) return `${(opt.poolFee / 100).toFixed(2)} %`;
    const jetzt = `${(e.feeBps / 100).toFixed(2)} %`;
    return e.feeBpsAbNaechstem !== null && e.feeBpsAbNaechstem !== e.feeBps
      ? `${jetzt} (ab dem nächsten Block ${(e.feeBpsAbNaechstem / 100).toFixed(2)} %)` : jetzt;
  };

  console.log(fett(`\nYSKAR Full Node ${VERSION}  ${grau('Mining')}`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Netz     ${params.network}`);
  console.log(`  Ablage   ${opt.daten}/chain.db`);
  console.log(`  Kette    ${chain.height() < 0 ? '—' : 'Höhe ' + nf(chain.height())}`);
  console.log(`  Lauscht  http://${opt.bind}:${opt.port}`);
  console.log(`  Blöcke   ${nachOben ? '→ ' + nachOben : 'bleiben lokal'}`);
  console.log(`  Sync     ${nachOben ? 'alle 30 s von ' + opt.api : 'aus'}`);
  console.log(`  Pool     ${opt.poolName
    ? `${opt.poolName} · Gebühr ${gebuehrJetzt()} · ${
        server.poolKoordinator?.plaetze() ?? '?'} Plätze${
        fensterAusLauf ? ` · ${nf(fensterAusLauf)} Shares aus dem letzten Lauf` : ''}`
    : 'aus (nur Solo-Mining)'}`);
  console.log(`  Absender ${opt.absender === 'proxy' ? 'aus X-Forwarded-For (hinter Proxy)'
    : opt.absender === 'socket' ? 'aus der Verbindung' : 'nicht erkannt (keine Grenzen je Absender)'}`);
  console.log(`  Knoten   ${netz
    ? (opt.p2pPort > 0 ? `lauscht auf ${opt.p2pPort}` : 'nur ausgehend') +
      (opt.seeds.length ? `, ${opt.seeds.length} Seed${opt.seeds.length > 1 ? 's' : ''}` : '')
    : 'aus'}`);
  console.log(grau('─'.repeat(56)));

  /*
    Einmal aufholen, bevor der erste Miner einen Job bekommt.

    Ohne das baut der Knoten die ersten Jobs auf dem Stand vom letzten
    Beenden -- und jeder Fund waere "stale", bis der Takt nach 30 Sekunden
    das erste Mal greift. Bei einer halben Stunde je Block waere das
    verlorene Arbeit.
  */
  if (nachOben) {
    melde(grau('  Hole auf…'));
    try {
      await sync({ ...opt, einmal: true }, store, chain);
      const tip = chain.tip();
      melde(grau(`  Stand: Höhe ${nf(chain.height())}`) +
        (tip ? grau(`, Difficulty ${nf(tip.difficulty)}`) : ''));
    } catch (e) {
      melde(gelb(`  Nicht erreichbar: ${(e as Error).message}`));
      melde(gelb('  Es wird auf dem lokalen Stand weitergebaut.'));
    }
  }

  console.log(grau('\n  Miner verbinden mit:'));
  console.log(`    yskar-miner --address ysr1… --api http://${opt.bind}:${opt.port}\n`);
  if (opt.bind !== '127.0.0.1') {
    console.log(gelb('  Diese Schnittstelle ist nicht nur lokal erreichbar.'));
    console.log(gelb('  Sie nimmt Arbeit entgegen und baut Blöcke -- nicht ' +
                     'ungeschützt ins Netz.\n'));
  }

  /*
    Das Fenster des Pools sichern (Issue #7): alle zwei Minuten, wenn sich
    etwas geaendert hat, und beim Beenden in einem Zug. Nach einem Absturz
    fehlt so hoechstens die Arbeit der letzten zwei Minuten.
  */
  let fensterGesichert = '';
  let fensterFolge = 0;
  const sichereFenster = async () => {
    const pk = server.poolKoordinator;
    if (!pk) return;
    // Kuerzen, wenn das Fenster weit ueber das hinausgewachsen ist, was zaehlen
    // kann -- nur mit einer Kette, die auf dem Stand ist.
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
    } catch (e) { melde(gelb(`  Fenster des Pools nicht gesichert: ${(e as Error).message}`)); }
  };
  const fensterTakt = server.poolKoordinator ? setInterval(() => { void sichereFenster(); }, FENSTER_TAKT_MS) : null;
  fensterTakt?.unref?.();

  let laeuft = true;
  const aufhoeren = async () => {
    if (!laeuft) return;
    laeuft = false;
    clearInterval(syncTakt);
    clearInterval(takt);
    if (statsTakt) clearInterval(statsTakt);
    if (fensterTakt) clearInterval(fensterTakt);
    const pk = server.poolKoordinator;
    if (pk) {
      fensterFolge++;
      try { schreibeFensterSofort(fensterPfad, params.network, pk.einstellungen().feeBps, pk.exportieren()); }
      catch (e) { console.error(`  Fenster des Pools nicht gesichert: ${(e as Error).message}`); }
    }
    abgleich?.stop();
    await netz?.stop();
    await server.close();
    console.log('');
    status(store, chain);
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', aufhoeren);
  process.on('SIGTERM', aufhoeren);

  /*
    Waehrend des Minens weiter synchronisieren.

    Ohne das steht der Knoten auf der Hoehe, die er beim Start hatte, und
    baut dort weiter -- waehrend die andere Seite laengst weiter ist. Jeder
    gefundene Block kaeme als "stale" zurueck, und die ganze Rechenarbeit
    waere verloren.

    Nach jedem neuen Block muessen die offenen Jobs verworfen werden: Sie
    zeigen auf einen Vorgaenger, den es als Kettenkopf nicht mehr gibt.
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
        const tip = chain.tip();
        melde(`${grau('[' + uhr() + ']')} ${grau('Kette weiter:')} ` +
          `Höhe ${nf(chain.height())}${grau(', Jobs neu gebaut')}`);
      }
    } catch (e) {
      melde(`${grau('[' + uhr() + ']')} ${gelb('!')} Sync: ${(e as Error).message}`);
    } finally { syncLaeuft = false; }
  }, 30_000);
  syncTakt.unref();

  const takt = setInterval(() => {
    if (!process.stdout.isTTY) return;
    const tip = chain.tip();
    // Gezeigt wird, WORAN GEARBEITET WIRD -- also der naechste Block, nicht
    // der letzte fertige. Beide haben verschiedene Difficulties, und die
    // Verwechslung ist naheliegend: Block 839 kann 63.980 haben, waehrend
    // an 840 mit 65.736 gearbeitet wird.
    const arbeit = koordinator.aktuelleArbeit();
    const naechste = arbeit ? arbeit.height : (tip ? tip.height + 1 : 0);
    process.stdout.write(`\r\x1b[2K${grau('[' + uhr() + ']')} ` +
      `${grau('Kette')} ${tip ? nf(tip.height) : '—'} ` +
      `${grau('· baut an')} ${nf(naechste)} ` +
      `${grau('· Diff')} ${arbeit ? nf(arbeit.difficulty) : grau('—')} ` +
      `${grau('·')} ${server.aktiveSessions()} Miner ` +
      `${grau('·')} Mempool ${pool.size()}` +
      (netz ? `${grau(' · ')}${netz.bereite().length} Peers` : ''));
  }, 1000);
  takt.unref();

  await new Promise(() => { /* bis Strg+C */ });
}

// --------------------------------------------------------------------- Lauf

async function main(): Promise<void> {
  const opt = argumente(process.argv.slice(2));
  if (opt.help) { console.log(HILFE); return; }

  const params: ConsensusParams = opt.regtest ? REGTEST : MAINNET;
  /*
    Die erwartete Kennung kommt aus den Parametern, nicht aus einer
    Konstante. Sonst liesse sich ein Testnetz-Ordner nur einmal oeffnen:
    Beim zweiten Start stuende network=yskar-regtest darin, erwartet wuerde
    yskar-main-1, und der Knoten braeche ab.

    Die Pruefung bleibt scharf -- Testnetz- und Mainnet-Bloecke koennen nach
    wie vor nicht in derselben Ablage landen.
  */
  const store = new ChainStore(`${opt.daten}/chain.db`,
    { network: params.network, chainId: params.chainId });
  let chain: ChainManager;
  try {
    chain = new ChainManager(store, params);
  } catch (e) {
    console.error(rot(`\nDie lokale Ablage ist nicht verwendbar:`));
    console.error(rot(`  ${(e as Error).message}\n`));
    console.error(grau(`  Ordner ${opt.daten} entfernen und neu synchronisieren.\n`));
    process.exit(1);
  }

  if (opt.befehl === 'mine') { await mine(opt, store, chain); return; }
  if (opt.befehl === 'status') { status(store, chain); store.close(); return; }
  if (opt.befehl === 'chain') { chainListe(store); store.close(); return; }
  if (opt.befehl === 'tips') { tipsListe(store); store.close(); return; }
  if (opt.befehl === 'spiegel') { await spiegel(opt, store, chain); store.close(); return; }
  if (opt.befehl !== 'sync') {
    console.error(rot(`Unbekannter Befehl: ${opt.befehl}`));
    console.log(HILFE); process.exit(1);
  }

  console.log(fett(`\nYSKAR Full Node ${VERSION}`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Netz     ${NETWORK}`);
  console.log(`  Quelle   ${opt.api}`);
  console.log(`  Ablage   ${opt.daten}/chain.db`);
  console.log(`  Stand    Höhe ${chain.height() < 0 ? '—' : nf(chain.height())}`);
  console.log(grau('─'.repeat(56)) + '\n');

  let laeuft = true;
  const aufhoeren = () => { laeuft = false; };
  process.on('SIGINT', aufhoeren);
  process.on('SIGTERM', aufhoeren);

  for (;;) {
    try {
      const ok = await sync(opt, store, chain);
      if (!ok) { store.close(); process.exit(2); }
    } catch (e) {
      console.log(`${grau('[' + uhr() + ']')} ${gelb('!')} ${(e as Error).message}`);
    }
    if (opt.einmal || !laeuft) break;
    await new Promise(r => setTimeout(r, opt.intervall * 1000));
  }

  console.log('');
  status(store, chain);
  store.close();
}

main().catch(e => { console.error(rot(`\n${e.stack ?? e.message}`)); process.exit(1); });
