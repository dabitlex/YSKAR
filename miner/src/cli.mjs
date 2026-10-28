#!/usr/bin/env node
/**
 * YSKAR Miner — eigenstaendig, ohne Wallet.
 *
 * Braucht nur eine Adresse. Der Miner fasst NIE einen privaten Schluessel
 * an: Die Coinbase eines gefundenen Blocks geht an die angegebene Adresse,
 * und das ist alles, was er ueber dich wissen muss.
 *
 * Genau deshalb ist es unbedenklich, ihn auf einem fremden Rechner laufen
 * zu lassen -- und genau deshalb kann jemand auch fuer dich minen, ohne
 * dass du ihm etwas anvertraust.
 *
 * Ab 0.2.0 sind alle Ausgaben englisch (vorher deutsch). Die Kommentare im
 * Quelltext bleiben deutsch wie im ganzen Repository.
 *
 * ACHTUNG: HiveOS liest dieses Protokoll maschinell (hiveos/yskar-hiveos/
 * yskar-log.sh). Die Zeilen "] accepted  #<n>", "] rejected ", "BLOCK FOUND"
 * und "] stats     10s <rate>" sind dort Schnittstelle -- wer sie aendert,
 * passt den Parser und hiveos/test/paket.test.ts mit an.
 */
import { Worker } from 'node:worker_threads';
import { findeGpuProgramm, pruefeGpu, starteGpu } from './gpu.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { targetBytes, toHex } from './header.mjs';
import { ANFRAGE_MS, liesRumpf, pruefeJob, shareDifficulty as pruefeShareZiel } from './pruefung.mjs';
import { Kennzahlen, rate as fmtRate, hashes as fmtHashes, dauer, zahl, prozent }
  from './anzeige.mjs';
import * as konfig from './konfig.mjs';
import { jaNein, interaktiv, warteAufTaste, schliessen } from './frage.mjs';
import { zeigeKopf, zeigeSitzung } from './banner.mjs';
import { ADRESSE, frageAdresse, frageModus, ladePools } from './erststart.mjs';
import { Sensoren } from './sensoren.mjs';
import { FesterKopf } from './festerKopf.mjs';

/**
 * Eigener Ordner.
 *
 * Im Ordnerbetrieb laeuft der Miner als ES-Modul und kennt import.meta.url.
 * Eingepackt laeuft er als CommonJS -- dort gibt es import.meta nicht, wohl
 * aber __dirname. Die Reihenfolge ist wichtig: Der zweite Ausdruck wird nur
 * ausgewertet, wenn der erste nicht greift.
 */
const HIER = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));
const VERSION = '0.2.0';
const STRIDE = 4096;   // Nonce-Abstand zwischen den Threads
const WIEDER_MS = 15_000;   // Abstand zwischen zwei Anmeldeversuchen nach einer Unterbrechung
/** Knoten, wenn --api fehlt: der oeffentliche Hauptknoten (Pool YSKAR Main). */
const VORGABE_API = 'https://pool.yskar.app';
/** Explorer fuer Links zu Block und Adresse. */
const EXPLORER = 'https://yskar.app/explorer';

// --------------------------------------------------------------- Argumente

function argumente(argv) {
  /*
    Vorgabe: der oeffentliche Hauptknoten (Issue #8). Bisher war es
    https://yskar.vercel.app -- der Webserver vergibt aber seit dem Umzug
    auf die Full Nodes keine Mining-Arbeit mehr und antwortet auf /session
    mit 410.

    `mode` bleibt undefined, wenn --mode fehlt: Ab 0.2.0 waehlt der Nutzer
    beim ersten Start selbst (siehe erststart.mjs).
  */
  const a = { workers: 0, intensity: 100, api: VORGABE_API,
              rechner: 'cpu', device: 0 };
  for (let i = 0; i < argv.length; i++) {
    const [schluessel, direkt] = argv[i].split('=');
    const wert = direkt ?? argv[i + 1];
    const nimm = () => { if (direkt === undefined) i++; return wert; };
    switch (schluessel) {
      case '--address': case '-a': a.address = nimm(); break;
      case '--workers': case '-w': a.workers = Number(nimm()); a.workersGesetzt = true; break;
      case '--intensity': case '-i': a.intensity = Number(nimm()); a.intensityGesetzt = true; break;
      case '--api': a.api = String(nimm() ?? '').replace(/\/+$/, ''); a.apiGesetzt = true; break;
      // solo oder pool. Ein Knoten ohne Pool lehnt "pool" ab, statt die
      // Sitzung stillschweigend als solo zu fuehren.
      case '--mode': {
        const m = String(nimm() ?? '').toLowerCase();
        if (m === 'pool' || m === 'solo') a.mode = m; else a.falscherModus = m || '(empty)';
        break;
      }
      // Rechenwerk: cpu, gpu oder beides. Vorgabe bleibt cpu -- wer keine
      // Karte hat, soll nicht ueber eine Fehlermeldung stolpern.
      case '--gpu': a.rechner = 'gpu'; break;
      case '--cpu-gpu': a.rechner = 'beides'; break;
      case '--device': a.device = Math.max(0, Number(nimm()) || 0); break;
      case '--gpu-bin': a.gpuBin = nimm(); break;
      case '--forget': a.forget = true; break;
      // Fester Kopf aus. Er kostet den Verlauf: Zeilen, die aus dem
      // Scrollbereich laufen, sind bei den meisten Terminals weg.
      // --einfach ist der Name bis 0.1.0 und bleibt gueltig (HiveOS-Pakete,
      // Dienste, Verknuepfungen).
      case '--simple': case '--einfach': a.einfach = true; break;
      case '--help': case '-h': a.help = true; break;
      case '--version': case '-v': a.version = true; break;
      default:
        if (schluessel.startsWith('-')) { a.unbekannt = schluessel; }
    }
  }
  return a;
}

// ------------------------------------------------------------------ Format

const FARBE = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (code, s) => FARBE ? `\x1b[${code}m${s}\x1b[0m` : s;
const gelb = s => f('33', s), gruen = s => f('32', s);
const rot = s => f('31', s), grau = s => f('90', s), fett = s => f('1', s);
const cyan = s => f('36', s), blau = s => f('94', s);
/** Gebündelt für banner.mjs und erststart.mjs — dort sind die Helfer nicht definiert. */
const FARBEN = { gelb, gruen, rot, grau, fett, cyan, blau };

const HILFE = () => `
 ${fett('YSKAR Miner')} ${grau(VERSION)} — mine YSR with your CPU or an NVIDIA graphics card

 ${fett('USAGE')}
   yskar-miner [--address <ysr1…>] [options]
   ${grau('Without options the miner asks for your address and mining mode on first')}
   ${grau('start and can remember them in yskar-miner.json.')}

 ${fett('PAYOUT')}
   ${cyan('-a, --address <addr>   ')} address that receives the mined YSR
   ${cyan('    --forget           ')} delete the saved address and settings

 ${fett('POOL OR SOLO')}
   ${cyan('    --mode <pool|solo> ')} pool: a share of every block the pool finds
                           solo: the whole reward, only for blocks you find
   ${cyan('    --api <url>        ')} node or pool to connect to ${grau(`(default: ${VORGABE_API})`)}

 ${fett('COMPUTE')}
   ${cyan('-w, --workers <n>      ')} CPU threads ${grau('(default: all cores minus one)')}
   ${cyan('-i, --intensity <1-100>')} share of CPU time to use ${grau('(default: 100)')}
   ${cyan('    --gpu              ')} use the graphics card instead of the CPU
   ${cyan('    --cpu-gpu          ')} use CPU and graphics card together
   ${cyan('    --device <n>       ')} which graphics card ${grau('(default: 0)')}
   ${cyan('    --gpu-bin <path>   ')} path to yskar-cuda if it is not found next to the miner
   ${grau('GPU mining needs the program yskar-cuda (NVIDIA only), see node-core/gpu/README.md.')}

 ${fett('DISPLAY')}
   ${cyan('    --simple           ')} plain scrolling log without the fixed header
   ${cyan('-h, --help             ')} show this help
   ${cyan('-v, --version          ')} show the version

 ${fett('WHILE MINING')}
   ${blau('h')} hashrate   ${blau('s')} summary   ${blau('c')} connection   ${blau('q')} quit

 ${fett('EXAMPLES')}
   yskar-miner -a ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4 --mode pool
   yskar-miner -a ysr1… --mode solo --api http://127.0.0.1:8645   ${grau('# your own full node')}
   yskar-miner -a ysr1… -w 4 -i 75                                ${grau('# keep the PC usable')}
   yskar-miner -a ysr1… --gpu --device 1

 ${grau('The miner never needs a private key or your 12 words — only the payout address.')}
 ${grau('Docs: https://github.com/dabitlex/YSKAR/tree/main/miner')}
`;

const uhr = () => new Date().toTimeString().slice(0, 8);

function zeile(text) {
  // Statuszeile ueberschreiben statt anhaengen, damit das Fenster nicht
  // vollaeuft. Ereignisse bekommen eine eigene Zeile.
  if (process.stdout.isTTY) {
    process.stdout.write('\r\x1b[2K' + text);
  }
}
function ereignis(text) {
  if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
  console.log(text);
}

/**
 * Eine Protokollzeile: Uhrzeit, Art (feste Breite), Text.
 *
 * Die Art steht immer an derselben Stelle, damit man das Protokoll
 * ueberfliegen kann -- und damit HiveOS es lesen kann (siehe Kopf der Datei).
 */
const ART = 9;
function log(art, farbe, text) {
  ereignis(`${grau('[' + uhr() + ']')} ${farbe(art.padEnd(ART))} ${text}`);
}
/** Fortsetzung unter einer Protokollzeile, buendig mit deren Text. */
const einzug = ' '.repeat(10 + 1 + ART + 1);

// ---------------------------------------------------------------- Rechnen

/**
 * Ertrag und Erwartung -- immer als Schaetzung.
 *
 * Grundlage ist die eigene Leistung gegen die Difficulty: Fuer einen Block
 * braucht es im Mittel difficulty * 2^16 Hashes. Daraus folgt der Anteil am
 * Netz und, mal Bloecke je Tag und Belohnung, der Ertrag. Glueck, Verluste
 * und Schwankungen der Netzleistung stecken darin nicht -- deshalb steht
 * ueberall "estimate".
 */
function schaetzung({ rate, netzRate, ziel, belohnung, gebuehrBps }) {
  if (!rate || !netzRate) return null;
  const anteil = rate / netzRate;
  const bloeckeJeTag = anteil * (86400 / ziel);
  const jeTag = belohnung != null
    ? bloeckeJeTag * belohnung * (1 - (gebuehrBps ?? 0) / 10_000) : null;
  return { anteil, netzRate, jeTag, blockAlle: 86400 / bloeckeJeTag };
}

const ysrTag = n => n >= 100 ? zahl(Math.round(n)) : n >= 1 ? n.toFixed(1) : n.toFixed(2);
const abstand = sek => sek < 86400 ? dauer(sek)
  : sek < 2 * 365 * 86400 ? `${(sek / 86400).toFixed(1)} days` : `${(sek / (365 * 86400)).toFixed(1)} years`;

// -------------------------------------------------------------------- Netz

/*
  Eine Anfrage an den Knoten (Issue #3): mit Frist, ohne Umleitung, mit
  Groessengrenze, und alle Texte der Antwort ohne Steuerzeichen -- siehe
  pruefung.mjs.
*/
async function api(basis, pfad, init) {
  const res = await fetch(`${basis}/api/v2${pfad}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(ANFRAGE_MS),
    redirect: 'error',
  });
  const body = await liesRumpf(res);
  if (!res.ok) {
    const fehler = new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
    fehler.code = body.error ?? `http_${res.status}`;
    fehler.daten = body;
    throw fehler;
  }
  return body;
}

/**
 * Ein Fehler in einem englischen Satz.
 *
 * Der Knoten schreibt in `detail` deutsche Saetze ("Der Knoten hat zu viele
 * offene Sitzungen."). Ein englischer Miner darf die nicht durchreichen --
 * deshalb zaehlt der Code, und der Knotentext ist nur noch Rueckfall fuer
 * Codes, die dieser Miner nicht kennt.
 */
function erklaere(e) {
  switch (e?.code) {
    case 'pool_unavailable': return 'this node does not run a pool';
    case 'pool_full': return 'the pool is full';
    case 'too_many_sessions': return 'too many open sessions';
    case 'bad_address': case 'missing_address': return 'the node does not accept this address';
    case 'session_inactive': return 'session expired';
    case 'keine_sitzung': return 'the node did not open a session';
    case 'rate_limited': return 'too many requests, slowing down';
  }
  if (e?.name === 'TimeoutError' || e?.cause?.name === 'TimeoutError') {
    return `no answer within ${ANFRAGE_MS / 1000} s`;
  }
  const c = e?.cause?.code;
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') return 'the node name could not be resolved';
  if (c === 'ECONNREFUSED') return 'the connection was refused';
  if (c === 'ECONNRESET') return 'the connection was reset';
  if (c === 'CERT_HAS_EXPIRED' || /certificate/i.test(e?.cause?.message ?? '')) return 'TLS certificate problem';
  if (typeof e?.code === 'string') return `node error: ${e.code}`;
  if (e?.message === 'fetch failed') return 'the node could not be reached';
  return e?.message ?? String(e);
}

// -------------------------------------------------------------------- Lauf

async function main() {
  const arg = argumente(process.argv.slice(2));

  if (arg.version) { console.log(VERSION); return; }
  if (arg.help) { console.log(HILFE()); return; }
  if (arg.unbekannt) {
    console.error(rot(` Unknown option: ${arg.unbekannt}`));
    console.log(HILFE()); process.exit(1);
  }
  if (arg.falscherModus) {
    console.error(rot(` --mode must be pool or solo, not ${arg.falscherModus}.`)); process.exit(1);
  }
  const WURZEL = join(HIER, '..');

  if (arg.forget) {
    const weg = konfig.vergessen(WURZEL);
    console.log(weg ? ` Deleted ${weg}` : ' Nothing was saved.');
    return;
  }

  // Reihenfolge: Argument schlaegt Datei, Datei schlaegt Nachfrage.
  const gespeichert = konfig.laden(WURZEL);
  let merken = false;
  let ausDatei = false;

  if (gespeichert) {
    if (!arg.address) { arg.address = gespeichert.address; ausDatei = true; }
    if (!arg.workersGesetzt && gespeichert.workers) arg.workers = gespeichert.workers;
    if (!arg.intensityGesetzt && gespeichert.intensity) arg.intensity = gespeichert.intensity;
    /*
      Modus und Knoten nur ZUSAMMEN aus der Datei: Wer einen eigenen Knoten
      angibt, meint nicht den gespeicherten Pool -- und ein gespeichertes
      "pool" gegen einen fremden Knoten endete mit "kein Pool".
    */
    if (!arg.apiGesetzt && arg.mode === undefined
        && (gespeichert.mode === 'pool' || gespeichert.mode === 'solo')) {
      arg.mode = gespeichert.mode;
      if (typeof gespeichert.api === 'string' && /^https?:\/\//.test(gespeichert.api)) {
        arg.api = gespeichert.api.replace(/\/+$/, '');
      }
      arg.poolName = typeof gespeichert.poolName === 'string' ? gespeichert.poolName : undefined;
    }
  }

  /*
    Erster Start: fragen, was fehlt.

    Ohne Terminal fragt niemand -- etwa als Dienst oder unter HiveOS. Dann
    ist die Adresse Pflicht, und ohne --mode bleibt es bei solo wie bis 0.1.0.
  */
  const frageAdresseNoetig = !arg.address;
  const frageModusNoetig = arg.mode === undefined;

  if ((frageAdresseNoetig || frageModusNoetig) && interaktiv()) {
    console.log(`\n ${fett('YSKAR Miner')} ${grau(VERSION)}`);
    console.log(grau(' ' + '─'.repeat(88)));
    console.log(frageAdresseNoetig
      ? ` First start — ${frageModusNoetig ? 'two questions' : 'one question'}, then mining begins.\n`
      : ' Choose how you want to mine.\n');
    let nr = 1;
    if (frageAdresseNoetig) {
      arg.address = await frageAdresse(FARBEN, String(nr++));
      if (!arg.address) {
        console.error(rot('\n No valid address. Stopping.'));
        await warteAufTaste();
        process.exit(1);
      }
    }
    if (frageModusNoetig) {
      const w = await frageModus(FARBEN, String(nr++),
        { api: arg.api, apiGesetzt: Boolean(arg.apiGesetzt), vorgabeApi: VORGABE_API });
      if (!w) { console.log(grau('\n Cancelled.')); process.exit(0); }
      arg.mode = w.mode; arg.api = w.api; arg.poolName = w.poolName ?? undefined;
    }
    merken = await jaNein(` Save ${frageAdresseNoetig ? 'address and mode' : 'this choice'} for next time?`);
    // Schliessen, sonst haelt die offene Eingabe den Prozess am Leben und
    // Strg+C verhaelt sich unerwartet.
    schliessen();
  } else if (frageAdresseNoetig) {
    // Kein Terminal, niemand der antworten koennte -- etwa als Dienst.
    console.error(rot(' The payout address is missing (--address).\n'));
    console.log(HILFE()); process.exit(1);
  }
  if (arg.mode === undefined) arg.mode = 'solo';

  // Grobpruefung, die endgueltige macht der Server. Ein Tippfehler soll
  // nicht erst nach dem ersten Share auffallen.
  if (!ADRESSE.test(arg.address)) {
    console.error(rot(' ✖ That does not look like a YSKAR address.'));
    console.error(grau('   Expected something like ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4'));
    await warteAufTaste();
    process.exit(1);
  }
  if (!(arg.intensity >= 1 && arg.intensity <= 100)) {
    console.error(rot(' --intensity must be between 1 and 100.')); process.exit(1);
  }

  // Bei reinem GPU-Betrieb laufen keine CPU-Threads. Sonst raubten sie der
  // Karte die Kerne, die sie zum Nachfuellen braucht.
  const threads = arg.rechner === 'gpu' ? 0 : arg.workers > 0
    ? arg.workers
    : Math.max(1, os.cpus().length - 1);   // einen Kern fuer das System lassen

  const wasm = ladeWasm();

  /*
    Netzangaben fuer den Kopf holen -- vor der Anmeldung.

    Ein zusaetzlicher Aufruf, und er darf scheitern: Ist der Knoten nicht
    erreichbar, sagt das der Kopf, und die Anmeldung gleich darauf sagt es
    noch einmal mit dem genauen Grund. Die Laufzeit der Anfrage ist die
    Antwortzeit des Knotens, die der Kopf zeigt.
  */
  let netz = null, latenz = null;
  {
    const t0 = Date.now();
    try { netz = await api(arg.api, '/summary'); latenz = Date.now() - t0; }
    catch { /* Der Kopf zeigt dann "not reachable". */ }
  }

  zeigeKopf({
    version: VERSION,
    adresse: arg.address,
    api: arg.api,
    modus: arg.mode,
    poolName: arg.poolName,
    threads,
    intensitaet: arg.intensity,
    rechner: arg.rechner,
    geraet: arg.device,
    netz,
    latenz,
    farben: FARBEN,
  });

  if (merken) {
    const pfad = konfig.speichern(WURZEL, {
      address: arg.address, mode: arg.mode, api: arg.api,
      ...(arg.poolName ? { poolName: arg.poolName } : {}),
      workers: threads, intensity: arg.intensity,
    });
    console.log(grau(` Saved to ${pfad} · change with --address or --mode, delete with --forget`));
  } else if (ausDatei) {
    console.log(grau(' Settings from yskar-miner.json · change with --address or --mode, delete with --forget'));
  }

  // ---- Session ----
  /*
    Anmelden -- beim Start und nach jeder Unterbrechung wieder.

    Der Knoten lehnt manche Anmeldung mit HTTP 200 ab und schreibt den
    Grund in `error` (kein Pool, zu viele Sitzungen). Eine Antwort ohne
    sessionId ist deshalb ein Fehler, egal mit welchem Status sie kam.
  */
  async function anmelden() {
    const s = await api(arg.api, '/session', {
      method: 'POST',
      body: JSON.stringify({
        address: arg.address, platform: `desktop/${process.platform}`,
        mode: arg.mode,
      }),
    });
    if (s?.error || typeof s?.sessionId !== 'string') {
      const fehler = new Error(s?.detail ?? s?.error ?? 'no session');
      fehler.code = s?.error ?? 'keine_sitzung';
      fehler.daten = s;
      throw fehler;
    }
    return s;
  }

  const fehlerKopf = t => console.error(`\n ${rot(fett('✖ ' + t))}`);
  const fehlerZeile = t => console.error(`   ${t}`);

  let session;
  try {
    session = await anmelden();
  } catch (e) {
    if (e.code === 'pool_unavailable') {
      fehlerKopf('This node does not run a pool');
      fehlerZeile(`${arg.api} accepts solo sessions only. Nothing is mined solo silently.`);
      fehlerZeile('Start with --mode solo, or choose a pool with --api <url>.');
    } else if (e.code === 'pool_full') {
      fehlerKopf(`${arg.poolName ? `Pool ${arg.poolName}` : 'The pool'} is full`);
      fehlerZeile(grau(arg.api));
      const plaetze = Number(e.daten?.plaetze);
      fehlerZeile(`${Number.isFinite(plaetze) ? `All ${zahl(plaetze)}` : 'All'} miner slots are taken. ` +
        'The miner does not switch to solo on its own.');
      const andere = (await ladePools()).filter(p => p.api !== arg.api).slice(0, 2);
      for (const p of andere) fehlerZeile(`${grau('·')} Another pool:  --api ${p.api} --mode pool   ${grau(`(${p.name})`)}`);
      fehlerZeile(`${grau('·')} Mine solo:     --mode solo`);
    } else if (e.code === 'too_many_sessions' && e.daten?.active !== undefined) {
      fehlerKopf('Too many miners on this address');
      fehlerZeile(`${e.daten?.active ?? '?'} of ${e.daten?.max ?? '?'} allowed sessions are already running.`);
      fehlerZeile('Stop another miner, or wait 5 minutes — sessions of crashed miners close by themselves.');
    } else if (e.code === 'too_many_sessions') {
      // Der Full Node zaehlt nicht je Adresse, sondern insgesamt.
      fehlerKopf('The node has too many open sessions');
      fehlerZeile('Try again in a few minutes, or choose another node with --api <url>.');
    } else if (e.code === 'bad_address' || e.code === 'missing_address') {
      // Nennt der Knoten ein gemeinsames Konto (ysr1p…), ist das der Grund.
      if (/ysr1p/.test(e.message ?? '')) {
        fehlerKopf('This address cannot receive mining rewards');
        fehlerZeile('It is a shared account (ysr1p…). Mining pays only to a normal wallet address');
        fehlerZeile('(ysr1…, 42 characters). Copy the Receive address from your wallet.');
      } else {
        fehlerKopf('The address checksum does not match');
        fehlerZeile(arg.address);
        fehlerZeile(grau('Usually a typo or a missing character. Copy the address again from your wallet.'));
      }
    } else if (e.daten !== undefined && !String(e.code).startsWith('http_')) {
      // Der Knoten hat geantwortet, aber abgelehnt -- kein Netzproblem.
      fehlerKopf('The node refused the session');
      fehlerZeile(`${arg.api}: ${erklaere(e)}`);
    } else {
      fehlerKopf('Cannot reach the node');
      fehlerZeile(`${arg.api}: ${erklaere(e)}.`);
      fehlerZeile(`${grau('·')} Check your internet connection and firewall.`);
      fehlerZeile(`${grau('·')} Network status: https://yskar.app`);
      fehlerZeile(`${grau('·')} Or connect to another pool with --api <url>.`);
    }
    await warteAufTaste();
    process.exit(1);
  }

  const k = new Kennzahlen();
  k.netzDifficulty = netz ? Number(netz.difficultyWert ?? netz.difficulty) || null : null;

  /*
    Erst HIER, nicht im Startkopf: Vorher gibt es keine Sitzung, kein
    Share-Ziel, und der Knoten hat noch nicht gesagt, ob er den Pool
    ueberhaupt betreibt.
  */
  zeigeSitzung({
    sitzung: session.sessionId,
    extranonce: session.extranonce,
    shareZiel: Number(session.shareDifficulty),
    netzDiff: k.netzDifficulty,
    pool: session.pool ?? null,
    poolGewuenscht: arg.mode === 'pool',
    parallel: session.concurrentSessions ?? 1,
    farben: FARBEN,
  });

  /*
    Abbrechen, NACHDEM die Sitzung schon offen ist.

    Zwischen Anmeldung und erstem Job kann es noch scheitern -- keine
    Karte gefunden, Selbsttest nicht bestanden. Wer dann einfach
    aussteigt, laesst die Sitzung beim Knoten offen stehen, bis sie nach
    Minuten von selbst verfaellt -- und laeuft beim dritten Versuch in
    "too many miners on this address".
  */
  async function abbrechen(code = 1) {
    await api(arg.api, '/session/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.sessionId }),
    }).catch(() => { /* Schon weg oder nicht erreichbar -- egal, wir gehen ohnehin. */ });
    await warteAufTaste();
    process.exit(code);
  }

  /*
    Sensoren im Hintergrund, alle zehn Sekunden.

    Nicht bei jeder Anzeige: Unter Windows kostet jede Messung einen
    PowerShell-Prozess.
  */
  const sensoren = new Sensoren();
  sensoren.start();

  const zustand = {
    raten: new Map(), jobId: null,
    shareDifficulty: pruefeShareZiel(session.shareDifficulty) ?? Number.NaN, laeuft: true,
    // Leistung der Karte, zuletzt gemeldet. null = keine Karte oder
    // laenger nichts gehoert.
    gpuRate: null,
    neuanmeldungen: 0,
    poolBloecke: 0,
  };

  /** Belohnung je Block in YSR, aus der letzten Netzabfrage. */
  const belohnung = () => netz?.nextReward ? Number(BigInt(netz.nextReward) / 100_000_000n) : null;
  const zielZeit = () => Number(netz?.targetBlockTime) || 600;
  const gebuehr = () => session?.pool ? Number(session.pool.feeBps) || 0 : 0;
  const imPool = () => Boolean(session?.pool);
  const poolName = () => session?.pool?.name ?? arg.poolName ?? null;
  /*
    Netzleistung: die, die der Knoten meldet (dieselbe Zahl wie im Startkopf),
    sonst aus der Difficulty. Beide Wege muessen dieselbe Zahl fuer Anteil,
    Ertrag und "network" liefern -- sonst passen die Angaben auf einem
    Schirm nicht zusammen.
  */
  const netzRate = () => Number(netz?.hashrate) > 0 ? Number(netz.hashrate)
    : k.netzDifficulty ? (k.netzDifficulty * 65536) / zielZeit() : null;
  const jetztSchaetzung = r => schaetzung({
    rate: r, netzRate: netzRate(), ziel: zielZeit(), belohnung: belohnung(), gebuehrBps: gebuehr(),
  });

  /*
    Fester Kopf.

    Drei Zeilen oben, die stehen bleiben, und eine Trennlinie: was gerade
    gerechnet wird, wie schnell, was es voraussichtlich bringt. Darunter
    laufen die Ereignisse durch.

    letzteSumme haelt die zuletzt gemessene Leistung: Der Kopf wird
    haeufiger gemalt als gemessen, und eine Zahl, die zwischen zwei
    Messungen auf null springt, waere falsch.
  */
  let letzteSumme = 0;
  let getrennt = false;        // true: Der Knoten kennt unsere Sitzung nicht mehr.
  const kurz = r => r ? fmtRate(r).replace(/ \S+$/, '') : '—';
  const kopfZeilen = () => {
    const p = grau(' · ');
    const zustandText = getrennt ? `${gelb('●')} ${fett('RECONNECTING')}` : `${gruen('●')} ${fett('MINING')}`;
    const art = imPool() ? `Pool ${poolName()}` : 'Solo';
    const s = jetztSchaetzung(letzteSumme);
    const nr = netzRate();
    const l1 = ` ${zustandText}   ${art}${p}block ${k.hoehe != null ? zahl(k.hoehe) : '—'}${p}difficulty ${
      k.netzDifficulty ? zahl(k.netzDifficulty) : '—'}${nr ? `${p}network ${fmtRate(nr)}` : ''}   ${grau('up')} ${dauer(k.laufzeit())}`;

    const quote = k.angenommen + k.abgelehnt > 0 ? (k.abgelehnt / (k.angenommen + k.abgelehnt)) * 100 : null;
    const l2 = ` ${cyan('HASHRATE')} ${gelb(fmtRate(letzteSumme))}  ${grau('10s')} ${kurz(k.rate(10))}  ${
      grau('60s')} ${kurz(k.rate(60))}  ${grau('15m')} ${kurz(k.rate(900))}     ${cyan('SHARES')} ${
      zahl(k.angenommen)} accepted${p}${zahl(k.abgelehnt)} rejected${quote !== null ? grau(` (${quote.toFixed(1)}%)`) : ''}${
      k.bloecke ? `${p}${gruen(`${k.bloecke} ${k.bloecke === 1 ? 'block' : 'blocks'}`)}` : ''}`;

    const temp = sensoren.zeile(FARBEN);
    let l3;
    if (imPool()) {
      const seit = k.letzterShare ? dauer((Date.now() - k.letzterShare) / 1000) + ' ago' : '—';
      l3 = ` ${cyan('EARNINGS')} ${s?.jeTag != null ? `≈ ${ysrTag(s.jeTag)} YSR/day` : '—'} ${
        grau(`(estimate${gebuehr() ? `, after ${(gebuehr() / 100).toFixed(gebuehr() % 100 ? 2 : 0)}% fee` : ''})`)}${
        s ? grau(` · ${prozent(s.anteil * 100)} of network`) : ''}   ${cyan('LAST SHARE')} ${seit}`;
    } else {
      const aufwand = k.aufwand();
      l3 = ` ${cyan('EXPECTED')} ${s ? `≈ 1 block every ${abstand(s.blockAlle)}` : '—'} ${grau('(estimate)')}${
        s ? grau(` · ${prozent(s.anteil * 100)} of network`) : ''}   ${cyan('EFFORT')} ${
        aufwand === null ? '—' : aufwand.toFixed(0) + '%'}`;
    }
    if (temp) l3 += `   ${temp}`;

    return [l1, l2, l3, grau(' ' + '─'.repeat((process.stdout.columns ?? 80) - 2))];
  };

  const festerKopf = (!arg.einfach && FesterKopf.moeglich())
    ? new FesterKopf({ hoehe: 4, zeichnen: kopfZeilen })
    : null;

  // ---- Threads ----
  const arbeiter = [];
  // Mit Karte: Die Threads rechnen in der oberen Haelfte der Nonce (ab 2^63),
  // die Karte von 0 an -- getrennte Bereiche, keine Duplikate (Issue #4).
  const cpuVersatz = arg.rechner === 'beides' ? 0x8000_0000 : 0;
  const hasherQuelle = globalThis.__YSKAR_HASHER_SRC;
  for (let slot = 0; slot < threads; slot++) {
    // In der eingepackten Fassung liegt der Rechen-Thread als Quelltext bei
    // -- eine Binaerdatei hat kein Dateisystem, aus dem sie ihn nachladen
    // koennte.
    const w = hasherQuelle
      ? new Worker(hasherQuelle, {
          eval: true,
          workerData: { wasm, extranonce: session.extranonce, slot, stride: STRIDE, versatz: cpuVersatz },
        })
      : new Worker(join(HIER, 'hasher.mjs'), {
          workerData: { wasm, extranonce: session.extranonce, slot, stride: STRIDE, versatz: cpuVersatz },
        });
    w.on('message', m => nachricht(m, w));
    w.on('error', e => log('error', rot, `CPU thread ${slot}: ${e.message}`));
    arbeiter.push(w);
  }

  let bereit = 0;
  function nachricht(m) {
    if (m.t === 'bereit') {
      if (++bereit === threads) holeJob();
      return;
    }
    if (m.t === 'fortschritt') {
      zustand.raten.set(m.slot,
        { rate: (m.hashes * 1000) / Math.max(1, m.ms), at: Date.now() });
      k.hashes(m.hashes);
      return;
    }
    if (m.t === 'fehler') { log('error', rot, `CPU thread ${m.slot}: ${m.message}`); return; }
    if (m.t === 'share') sendeShare(m);
  }

  /*
    Neu anmelden, wenn der Knoten die Sitzung nicht mehr kennt.

    Der Knoten schliesst eine Sitzung nach fuenf Minuten ohne Kontakt, und
    nach einem Neustart kennt er gar keine mehr. Solange keine Sitzung
    steht, ruhen die Threads: Arbeit ohne Sitzung wird nirgends
    gutgeschrieben. Im Pool wird NIE auf solo ausgewichen.
  */
  let anmeldungLaeuft = null;
  let letzterGrund = null;
  /*
    Abstand zwischen Anmeldungen (Issue #2): Folgt eine Neuanmeldung einer
    erfolgreichen in weniger als WIEDER_MS, wartet der Miner erst -- 2, 4,
    8 ... Sekunden, hoechstens eine Minute. Die alte Sitzung wird vorher
    abgemeldet, damit keine liegen bleibt.
  */
  let letzteAnmeldungAm = Date.now();
  let schnelleFolge = 0;
  const schlafe = ms => new Promise(r => setTimeout(r, ms));
  function neuAnmelden(grund) {
    if (anmeldungLaeuft) return anmeldungLaeuft;
    if (!getrennt) {
      getrennt = true;
      zustand.jobId = null;
      arbeiter.forEach(w => w.postMessage({ t: 'stop' }));
      log('node', gelb, `session closed by the node ${grau(`(${grund}) — reconnecting …`)}`);
    }
    anmeldungLaeuft = (async () => {
      if (Date.now() - letzteAnmeldungAm < WIEDER_MS) {
        schnelleFolge++;
        const pause = Math.min(60_000, 1000 * 2 ** Math.min(schnelleFolge, 6));
        if (schnelleFolge === 3) {
          log('node', grau, grau('the node keeps dropping the session — reconnects are slowed down (up to one minute apart)'));
        }
        await schlafe(pause);
      } else {
        schnelleFolge = 0;
      }
      // Die alte Sitzung abmelden -- kennt der Knoten sie noch, ist sie
      // sonst eine Leiche in seiner Tabelle. Fehler sind hier egal.
      const alt = session?.sessionId;
      if (typeof alt === 'string') {
        await api(arg.api, '/session/stop', { method: 'POST', body: JSON.stringify({ sessionId: alt }) })
          .catch(() => {});
      }
      try {
        const neu = await anmelden();
        letzteAnmeldungAm = Date.now();
        session = neu;
        zustand.shareDifficulty = pruefeShareZiel(neu.shareDifficulty) ?? zustand.shareDifficulty;
        zustand.neuanmeldungen++;
        getrennt = false;
        letzterGrund = null;
        log('connected', gruen, `new session ${String(neu.sessionId).slice(0, 8)}` +
          (neu.pool ? `${grau(' · ')}Pool ${neu.pool.name}` : ''));
      } catch (e) {
        // Denselben Grund nicht alle paar Sekunden wiederholen.
        const grundNeu = erklaere(e);
        if (grundNeu !== letzterGrund) {
          letzterGrund = grundNeu;
          log('node', grau, grau(`reconnect failed: ${grundNeu} — retrying every ${WIEDER_MS / 1000} s`));
        }
      } finally {
        anmeldungLaeuft = null;
      }
      if (!getrennt) await holeJob();
    })();
    return anmeldungLaeuft;
  }

  async function sendeShare(m) {
    // Ohne Sitzung gibt es nichts einzureichen -- der Treffer gehoert zu
    // einer Sitzung, die der Knoten nicht mehr kennt.
    if (getrennt) return;
    // Die Antwort gehoert zu DIESER Sitzung. Kommt sie erst an, nachdem
    // schon neu angemeldet wurde, darf sie keine zweite Anmeldung ausloesen.
    const sitzung = session.sessionId;
    try {
      const r = await api(arg.api, '/share', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sitzung, jobId: m.jobId, nonce: m.nonce }),
      });

      if (!r.accepted) {
        if (r.reason === 'session_inactive') {
          if (sitzung === session.sessionId) void neuAnmelden('session expired');
          return;
        }
        /*
          Die Arbeit ist veraltet -- sofort neue holen, statt bis zur
          naechsten Abfrage (45 s) weiter an ihr zu rechnen. job_unknown
          gehoert dazu: Nach JEDEM neuen Block verwirft der Knoten alle
          offenen Jobs. Das ist keine Ablehnung.
        */
        if (r.reason === 'job_expired' || r.reason === 'stale_job' || r.reason === 'job_unknown') {
          holeJob(); return;
        }
        k.abgelehnt++;
        // Vereinzelte Ablehnungen sind normal, wenn der Server das Ziel
        // gerade nachzieht. Nur die uebrigen sind eine Meldung wert.
        if (r.reason !== 'duplicate' && r.reason !== 'low_difficulty') {
          log('rejected', gelb, `${String(r.reason ?? 'unknown')}`);
        }
        return;
      }

      k.shareAngenommen();

      // Nur eine taugliche Zahl (ab 1, ganz) wird uebernommen -- siehe pruefung.mjs.
      const neuesZiel = pruefeShareZiel(r.shareDifficulty);
      if (neuesZiel !== null && neuesZiel !== zustand.shareDifficulty) {
        // VarDiff: Der Server passt das Share-Target an. Ohne Nachfuehrung
        // rechneten Threads und Karte weiter gegen den alten Wert -- die
        // Karte gegen ein LEICHTERES Ziel, und jeder Treffer waere
        // "low_difficulty".
        const vorher = zustand.shareDifficulty;
        zustand.shareDifficulty = neuesZiel;
        const t = toHex(targetBytes(zustand.shareDifficulty));
        arbeiter.forEach(w => w.postMessage({ t: 'target', target: t }));
        if (zustand.job) gpu?.job(zustand.job, t);
        log('target', grau, `share difficulty ${zahl(vorher)} ${grau('→')} ${zahl(zustand.shareDifficulty)}`);
      }

      if (r.block) {
        const aufwand = k.blockGefunden();
        const hoehe = Number(r.height);
        const link = `${EXPLORER}#block-${hoehe}`;
        ereignis('');
        if (r.pool || imPool()) {
          /*
            Im Pool gehoert der Block dem Pool: Die Belohnung wird im
            selben Block nach Arbeit auf alle Miner verteilt. Bis 0.1.0 stand
            hier "+875 YSR", als ginge alles an diese Adresse.
          */
          zustand.poolBloecke++;
          log('block', s => gruen(fett(s)), gruen(fett(`★ BLOCK FOUND FOR POOL ${poolName() ?? ''}  #${zahl(hoehe)}`)));
          const yr = r.reward ? zahl(Number(BigInt(r.reward) / 100_000_000n)) : null;
          ereignis(grau(`${einzug}The ${yr ? yr + ' YSR ' : ''}reward is split among the pool's miners by their work,`));
          ereignis(grau(`${einzug}${session.pool?.modus === 'batch' ? 'paid out by the pool.' : 'paid directly in this block.'}`));
        } else {
          const yr = r.reward ? zahl(Number(BigInt(r.reward) / 100_000_000n)) : '?';
          log('block', s => gruen(fett(s)), gruen(fett(`★ BLOCK FOUND  #${zahl(hoehe)}   +${yr} YSR`)));
          ereignis(`${einzug}${grau('paid to ')}${arg.address}`);
          if (aufwand !== null) {
            // Erst beim Fund steht fest, wie viel Arbeit es wirklich war.
            ereignis(`${einzug}${grau('effort  ')}${aufwand.toFixed(0)}% ${grau('—')} ${aufwand < 100
              ? `${gruen('luck')}${grau(', found faster than expected')}`
              : `${gelb('bad luck')}${grau(', took longer than expected')}`}`);
          }
        }
        if (r.hash) ereignis(`${einzug}${grau('hash    ')}${r.hash}`);
        ereignis(`${einzug}${grau('explorer')} ${link}`);
        ereignis('');
        holeJob();
        return;
      }

      /*
        Eine Zeile JE angenommenem Share. Gezeigt wird die TATSAECHLICH
        erreichte Difficulty und ihr Anteil an einem Block: Ein Share mit
        100 % IST ein Block -- das ist keine Analogie, sondern genau die
        Bedingung.

        Die Nummer bleibt OHNE Tausenderkomma: HiveOS liest sie als Zaehler.
      */
      const erreicht = Number(r.achieved ?? 0);
      const netzD = Number(r.blockDifficulty ?? k.netzDifficulty ?? 0);
      const anteil = netzD > 0 ? (erreicht / netzD) * 100 : null;
      log('accepted', gruen,
        `#${k.angenommen}${grau(' · diff ')}${zahl(erreicht)}${grau(' · ')}${prozent(anteil)}${grau(' of a block')}`);
    } catch (e) {
      log('error', grau, grau(`share not submitted: ${erklaere(e)}`));
    }
  }

  async function holeJob() {
    if (getrennt) return;
    const sitzung = session.sessionId;
    try {
      const job = await api(arg.api, `/job?session=${sitzung}`);
      /*
        Der Knoten antwortet auch im Fehlerfall mit HTTP 200 und schreibt
        den Grund in `error`. Eine solche Antwort ist KEIN Job.
      */
      if (job?.error === 'session_inactive') {
        if (sitzung === session.sessionId) void neuAnmelden('session expired');
        return;
      }
      // Eine Antwort fuer eine inzwischen abgeloeste Sitzung ist veraltet.
      if (sitzung !== session.sessionId) return;
      if (job?.error || typeof job?.jobId !== 'string') {
        log('node', grau, grau(`no work from the node: ${job?.error ? erklaere({ code: job.error }) : 'answer without a job'}`));
        return;
      }
      // Jedes Feld pruefen, bevor es an die Threads und die Karte geht (Issue #3).
      try { pruefeJob(job); }
      catch (e) {
        log('job', gelb, `job discarded: ${e.message}`);
        return;
      }
      if (job.jobId === zustand.jobId) return;
      const neueHoehe = job.height !== k.hoehe;
      /*
        job.difficulty ist das ROHE Header-Feld (Konsensfassung 4): Es geht
        unveraendert in den Header. Fuer Anzeige und Erwartungswerte zaehlt
        der echte Wert -- difficultyWert. Aeltere Knoten schicken ihn nicht;
        dort sind Feld und Wert ohnehin gleich.
      */
      const wert = Number(job.difficultyWert ?? job.difficulty);
      const neueDiff = wert !== k.netzDifficulty;
      zustand.jobId = job.jobId;
      zustand.shareDifficulty = pruefeShareZiel(job.shareDifficulty) ?? zustand.shareDifficulty;
      k.hoehe = job.height;
      k.netzDifficulty = wert;
      // Die Extranonce der AKTUELLEN Sitzung mitgeben: Nach einer
      // Neuanmeldung ist sie eine andere als beim Start der Threads.
      arbeiter.forEach(w => w.postMessage({ t: 'job', job: { ...job, extranonce: session.extranonce } }));
      // Den Job merken: Bei einer Ziel-Anpassung muss er der Karte erneut
      // geschickt werden -- sie kennt kein eigenes Ziel-Kommando.
      zustand.job = { ...job, extranonce: session.extranonce };
      gpu?.job(zustand.job, job.target);

      // Neue Arbeit melden -- so sieht man, dass die Kette weiterlaeuft,
      // auch wenn gerade kein eigener Share faellt.
      if (neueHoehe || neueDiff) {
        log('job', blau, `new work${grau(' · block ')}${zahl(job.height)}${grau(' · difficulty ')}${zahl(wert)}`);
      }
    } catch (e) {
      log('node', grau, grau(`could not fetch work: ${erklaere(e)}`));
    }
  }

  /*
    Grafikkarte.

    Erst hier, nach der Anmeldung: Vorher gibt es kein Share-Ziel, und ohne
    Ziel kann die Karte nicht rechnen.
  */
  let gpu = null;
  if (arg.rechner !== 'cpu') {
    const programm = findeGpuProgramm(arg.gpuBin);
    const weiterMitCpu = () => ereignis(grau(`   Continuing with ${threads} CPU ${threads === 1 ? 'thread' : 'threads'}.`));
    if (!programm) {
      ereignis(`\n ${gelb(fett('! GPU not available — yskar-cuda was not found'))}`);
      ereignis(`   Put ${process.platform === 'win32' ? 'yskar-cuda.exe' : 'yskar-cuda'} next to the miner, or pass --gpu-bin <path>. NVIDIA only.`);
      ereignis(grau('   How to build it: node-core/gpu/README.md'));
      if (arg.rechner === 'gpu') await abbrechen();
      weiterMitCpu();
    } else {
      /*
        Selbsttest VOR dem ersten Job. Eine falsch rechnende Karte liefert
        Nonces, die der Server ablehnt. Das sieht aus wie ein Netzproblem
        und kostet Stunden Suche.
      */
      ereignis(grau(`   Checking graphics card ${arg.device} …`));
      const p = pruefeGpu(programm, arg.device);
      if (!p.ok) {
        ereignis(`\n ${gelb(fett(`! GPU self-test failed on device ${arg.device}`))}`);
        ereignis(grau(`   ${p.grund} — the card would only produce rejected shares.`));
        if (arg.rechner === 'gpu') await abbrechen();
        weiterMitCpu();
      } else {
        ereignis(gruen(`   ✓ GPU ready: ${p.name ?? 'device ' + arg.device}`));
        gpu = starteGpu({
          programm, geraet: arg.device,
          onShare: (m) => {
            /*
              Treffer zu einem alten Job verwerfen, statt sie einzureichen.
              Die Karte arbeitet in Stapeln von 100 bis 250 ms; wechselt der
              Job, laeuft der angefangene Stapel zu Ende.
            */
            if (m.jobId !== zustand.jobId) { k.verworfen = (k.verworfen ?? 0) + 1; return; }
            sendeShare(m);
          },
          onRate: (r, roh) => {
            zustand.gpuRate = { rate: r, at: Date.now() };
            // Ohne das zaehlt der Aufwand nur die CPU -- siehe gpu.mjs.
            if (roh > 0) k.hashes(roh);
          },
          onLog: (t) => log('gpu', grau, t),
          onAus: (grund) => {
            gpu = null;
            zustand.gpuRate = null;
            log('gpu', rot, rot(`graphics card stopped: ${grund}`));
            if (threads === 0) {
              ereignis(rot(`${einzug}No CPU threads left to mine with — the miner stops.`));
              void abbrechen();
              return;
            }
            ereignis(grau(`${einzug}Continuing with the CPU.`));
          },
        });
      }
    }
  }

  // Tastenhinweis und fester Kopf -- nach den GPU-Meldungen, damit sie im
  // Verlauf stehen bleiben.
  if (process.stdin.isTTY) {
    console.log(` ${grau('Keys')}  ${blau('h')} hashrate   ${blau('s')} summary   ${blau('c')} connection   ${blau('q')} quit`);
    /*
      Der Hinweis auf --simple gehoert hierher und nicht in die Hilfe
      allein: Wer den festen Kopf stoerend findet, sitzt gerade davor.
    */
    if (festerKopf) {
      console.log(grau(' Fixed header is on — older lines above it cannot be scrolled back.'));
      console.log(grau(' Run with --simple for a plain, scrollable log. If the window looks broken after'));
      console.log(grau(` quitting, type ${process.platform === 'win32' ? 'cls' : 'reset'}.\n`));
    } else {
      console.log('');
    }
  }
  if (festerKopf) festerKopf.start();

  arbeiter.forEach(w => w.postMessage({ t: 'duty', value: arg.intensity }));

  /*
    Ohne CPU-Threads den ersten Job selbst holen. Sonst haengt der Start am
    Zaehler "alle Threads bereit" -- und der erreicht null nie.
  */
  if (threads === 0) await holeJob();

  // Job erneuern, bevor er nach 90 s ablaeuft.
  const jobTakt = setInterval(holeJob, 45_000);
  // Solange keine Sitzung steht, in kurzem Takt erneut anmelden.
  const wiederTakt = setInterval(() => { if (getrennt) void neuAnmelden('retry'); }, WIEDER_MS);
  /*
    Netzangaben alle fuenf Minuten erneuern -- fuer die Belohnung in der
    Ertragsschaetzung (sie halbiert sich alle 12.000 Bloecke). Darf
    scheitern; dann bleibt der letzte Stand.
  */
  const netzTakt = setInterval(() => {
    api(arg.api, '/summary').then(n => { netz = n; }).catch(() => {});
  }, 300_000);

  /*
    Statuszeile, die sich an Ort und Stelle erneuert. Mit festem Kopf gibt
    es keine eigene Statuszeile: Dieselben Zahlen stuenden zweimal auf dem
    Schirm. Der Kopf wird stattdessen neu gemalt.
  */
  const statusTakt = setInterval(() => {
    const jetzt = Date.now();
    let summe = 0;
    for (const [slot, r] of zustand.raten) {
      if (jetzt - r.at > 3000) zustand.raten.delete(slot);
      else summe += r.rate;
    }
    // Die Karte meldet seltener als die Threads -- deshalb ein groesseres Fenster.
    if (zustand.gpuRate) {
      if (jetzt - zustand.gpuRate.at > 10_000) zustand.gpuRate = null;
      else summe += zustand.gpuRate.rate;
    }
    k.probe(summe);
    letzteSumme = summe;

    if (festerKopf) { festerKopf.malen(); return; }

    const p = grau(' · ');
    const aufwand = k.aufwand();
    zeile(
      // Das Leerzeichen gehoert hinter das padEnd, nicht hinein -- sonst
      // klebt bei langen Werten das Trennzeichen an der Einheit.
      `${grau('[' + uhr() + ']')} ${gelb(fmtRate(summe).padEnd(11))} ` +
      `${p}${zahl(k.angenommen)}${grau('/')}${zahl(k.abgelehnt)} shares` +
      (imPool() ? '' : `${p}effort ${aufwand === null ? '—' : aufwand.toFixed(0) + '%'}`) +
      `${p}block ${k.hoehe != null ? zahl(k.hoehe) : '—'}` +
      `${p}up ${dauer(k.laufzeit())}` +
      (k.bloecke ? `${p}${gruen(k.bloecke + (k.bloecke === 1 ? ' block' : ' blocks'))}` : ''),
    );
  }, 1000);

  /*
    Uebersicht einmal je Minute.

    Drei Zeitfenster statt einer Momentaufnahme: Faellt der 15-Minuten-Wert
    deutlich unter den 10-Sekunden-Wert, drosselt das Geraet.

    Die Zeile beginnt mit "stats     10s <rate>" -- HiveOS liest daraus die
    Hashrate (yskar-log.sh). Eine Rate hat nie ein Tausenderkomma.
  */
  const uebersichtTakt = setInterval(() => {
    const abst = k.shareAbstand();
    log('stats', grau,
      `${grau('10s')} ${fmtRate(k.rate(10))} ${grau('60s')} ${fmtRate(k.rate(60))} ` +
      `${grau('15m')} ${fmtRate(k.rate(900))}${grau(' · ')}${fmtHashes(k.hashesGesamt)}${grau(' total')}` +
      `${grau(' · up ')}${dauer(k.laufzeit())}` +
      (abst ? `${grau(' · share every ')}${dauer(abst)}` : ''));
    // Beim festen Kopf steht die Temperatur dauerhaft oben.
    if (!festerKopf) {
      const temp = sensoren.zeile(FARBEN);
      if (temp) log('sensors', grau, temp);
    }
  }, 60_000);

  /*
    Tastenbefehle: h fuer Hashrate, s fuer eine Zusammenfassung, c fuer die
    Verbindung. Im Rohmodus liefert das System kein SIGINT mehr -- Strg+C
    muss deshalb selbst abgefangen werden.
  */
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', taste => {
      if (taste === '\u0003' || taste === 'q') { aufhoeren(); return; }
      const titel = (t, b) => { ereignis(''); ereignis(` ${blau(t)}  ${fett(b)}`); };
      const reihe = (m, w) => ereignis(`    ${cyan(m.padEnd(19))} ${w}`);
      const p = grau(' · ');

      if (taste === 'h') {
        titel('h', 'HASHRATE');
        reihe('10 s', fmtRate(k.rate(10)));
        reihe('60 s', fmtRate(k.rate(60)));
        reihe('15 min', `${fmtRate(k.rate(900))}     ${grau('a drop against 10 s usually means the device is throttling')}`);
        if (zustand.gpuRate) reihe('GPU', fmtRate(zustand.gpuRate.rate));
        const liste = [...zustand.raten].sort((x, y) => x[0] - y[0]);
        if (liste.length) {
          ereignis(grau('    per CPU thread (MH/s)'));
          for (let i = 0; i < liste.length; i += 8) {
            ereignis('     ' + liste.slice(i, i + 8)
              .map(([slot, r]) => `${grau(String(slot).padStart(2))} ${(r.rate / 1e6).toFixed(2)}`).join('   '));
          }
        }
        /*
          Temperatur gehoert zur Hashrate, nicht zur Verbindung: Wer sie
          nachschlaegt, fragt sich meistens, warum die Leistung faellt.
        */
        const t = sensoren.zeile(FARBEN);
        if (t) reihe('Sensors', t);
        else if (sensoren.verfuegbar === false) reihe('Sensors', grau('none available on this system'));
        ereignis('');
      } else if (taste === 's') {
        const r = k.rate(60) || k.rate(10);
        const sch = jetztSchaetzung(r);
        const aufwand = k.aufwand();
        const schnitt = k.aufwandVerlauf.length
          ? k.aufwandVerlauf.reduce((x, y) => x + y, 0) / k.aufwandVerlauf.length : null;
        const abst = k.shareAbstand();
        titel('s', 'SUMMARY');
        reihe('Runtime', dauer(k.laufzeit()));
        reihe('Hashes', fmtHashes(k.hashesGesamt));
        reihe('Shares', `${zahl(k.angenommen)} accepted${p}${zahl(k.abgelehnt)} rejected${
          abst ? grau(` · one every ${dauer(abst)}`) : ''}`);
        reihe('Blocks found', imPool() ? `${zahl(zustand.poolBloecke)} for the pool` : zahl(k.bloecke));
        if (sch) {
          reihe('Your network share', `${prozent(sch.anteil * 100)} ${grau(`(${fmtRate(r)} of ${fmtRate(sch.netzRate)})`)}`);
          if (sch.jeTag != null) {
            reihe(imPool() ? 'Pool earnings' : 'Solo earnings', `≈ ${ysrTag(sch.jeTag)} YSR/day ${grau(imPool() && gebuehr()
              ? `(estimate, after ${(gebuehr() / 100).toFixed(2)}% fee)` : '(estimate, on average)')}`);
          }
          reihe(imPool() ? 'Solo instead' : 'Next block', `≈ 1 block every ${abstand(sch.blockAlle)} ${grau('(estimate)')}`);
        }
        if (!imPool()) {
          reihe('Effort now', aufwand === null ? '—' : `${aufwand.toFixed(0)}%`);
          if (schnitt !== null) reihe('Effort average', `${schnitt.toFixed(0)}% ${grau(`over ${k.aufwandVerlauf.length} blocks`)}`);
        }
        ereignis(grau('    Estimates are averages, not a countdown — every hash has the same chance.'));
        ereignis('');
      } else if (taste === 'c') {
        titel('c', 'CONNECTION');
        reihe('Node', arg.api);
        reihe('Mode', imPool()
          ? [`Pool`, session.pool.name, `fee ${(gebuehr() / 100).toFixed(2)}%`,
              session.pool.belegt != null && session.pool.plaetze != null
                ? `${zahl(session.pool.belegt)} of ${zahl(session.pool.plaetze)} miners` : null]
              .filter(Boolean).join(p)
          : 'Solo');
        reihe('Payout address', arg.address);
        reihe('Session', `${session.sessionId}${zustand.neuanmeldungen
          ? grau(` (reconnected ${zustand.neuanmeldungen}×)`) : ''}`);
        reihe('Extranonce', String(session.extranonce ?? '—'));
        reihe('Block', k.hoehe != null ? zahl(k.hoehe) : '—');
        reihe('Network difficulty', k.netzDifficulty ? zahl(k.netzDifficulty) : '—');
        reihe('Share target', zahl(zustand.shareDifficulty));
        reihe('Compute', [
          threads ? `${threads} CPU ${threads === 1 ? 'thread' : 'threads'}` : null,
          gpu ? `graphics card ${arg.device}` : null,
          threads ? `intensity ${arg.intensity}%` : null,
        ].filter(Boolean).join(p));
        ereignis('');
      }
    });
  }

  // ---- Sauber beenden ----
  let beendet = false;
  async function aufhoeren() {
    if (beendet) return;
    beendet = true;
    clearInterval(jobTakt); clearInterval(wiederTakt); clearInterval(statusTakt);
    clearInterval(uebersichtTakt); clearInterval(netzTakt);
    sensoren.stop();
    gpu?.stop();
    festerKopf?.stop();
    if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch { /* egal */ } }
    ereignis('');
    ereignis(grau(' Stopping …'));
    arbeiter.forEach(w => { w.postMessage({ t: 'stop' }); w.terminate(); });
    // Session schliessen, damit sie nicht bis zum Zeitablauf offen bleibt
    await api(arg.api, '/session/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.sessionId }),
    }).catch(() => {});
    const sek = k.laufzeit();
    const schnitt = sek > 0 ? Number(k.hashesGesamt) / sek : 0;
    const quote = k.angenommen + k.abgelehnt > 0 ? (k.abgelehnt / (k.angenommen + k.abgelehnt)) * 100 : null;
    const r = (m, w) => console.log(`   ${cyan(m.padEnd(14))} ${w}`);
    console.log(`\n ${fett('SESSION SUMMARY')}`);
    console.log(grau(' ' + '─'.repeat(56)));
    r('Runtime', dauer(sek));
    r('Hashes', `${fmtHashes(k.hashesGesamt)} ${grau(`(average ${fmtRate(schnitt)})`)}`);
    r('Shares', `${zahl(k.angenommen)} accepted ${grau('·')} ${zahl(k.abgelehnt)} rejected${
      quote !== null ? grau(` (${quote.toFixed(1)}%)`) : ''}`);
    r('Blocks found', zustand.poolBloecke && zustand.poolBloecke === k.bloecke
      ? `${zahl(k.bloecke)} for the pool`
      : zustand.poolBloecke
        ? `${zahl(k.bloecke - zustand.poolBloecke)} solo ${grau('·')} ${zahl(zustand.poolBloecke)} for the pool`
        : zahl(k.bloecke));
    r('Payout address', arg.address);
    r('Balance', `${EXPLORER}#adr-${arg.address}`);
    console.log(grau(' ' + '─'.repeat(56)) + '\n');
    process.exit(0);
  }
  process.on('SIGINT', aufhoeren);
  process.on('SIGTERM', aufhoeren);
}

/**
 * Engine besorgen.
 *
 * Eingepackt liegt sie als base64 bei; aus dem Ordner heraus wird sie neben
 * dem Miner oder im public-Verzeichnis des Projekts gesucht. Der Dateiname
 * enthaelt den Inhalts-Hash, damit nie eine veraltete Fassung erwischt wird.
 */
function ladeWasm() {
  const eingebettet = globalThis.__YSKAR_WASM_B64;
  if (eingebettet) return Buffer.from(eingebettet, 'base64');
  return readFileSync(wasmPfad());
}

function wasmPfad() {
  // Neben dem Miner zuerst -- so laeuft er eigenstaendig. Faellt zurueck auf
  // public/ des Projekts, damit er auch aus dem Repo heraus startet.
  const orte = [join(HIER, '..'), join(HIER, '..', '..', 'public')];
  for (const ort of orte) {
    if (!existsSync(ort)) continue;
    const treffer = readdirSync(ort).find(n => /^miner\.[0-9a-f]{10}\.wasm$/.test(n));
    if (treffer) return join(ort, treffer);
  }
  console.error(rot(' miner.<hash>.wasm not found.'));
  console.error(grau(' Expected next to the miner or in public/ of the project.'));
  process.exit(1);
}

main().catch(async e => {
  console.error(rot(`\n${e.stack ?? e.message}`));
  await warteAufTaste();
  process.exit(1);
});
