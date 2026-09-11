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
 */
import { Worker } from 'node:worker_threads';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { targetBytes, toHex } from './header.mjs';
import { Kennzahlen, rate as fmtRate2, hashes as fmtHashes, dauer, zahl as zahl2 }
  from './anzeige.mjs';
import * as konfig from './konfig.mjs';
import { frage, jaNein, interaktiv, warteAufTaste, schliessen } from './frage.mjs';

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
const VERSION = '0.1.0';
const STRIDE = 4096;   // Nonce-Abstand zwischen den Threads

// --------------------------------------------------------------- Argumente

function argumente(argv) {
  const a = { workers: 0, intensity: 100, api: 'https://yskar.vercel.app' };
  for (let i = 0; i < argv.length; i++) {
    const [schluessel, direkt] = argv[i].split('=');
    const wert = direkt ?? argv[i + 1];
    const nimm = () => { if (direkt === undefined) i++; return wert; };
    switch (schluessel) {
      case '--address': case '-a': a.address = nimm(); break;
      case '--workers': case '-w': a.workers = Number(nimm()); a.workersGesetzt = true; break;
      case '--intensity': case '-i': a.intensity = Number(nimm()); break;
      case '--api': a.api = nimm().replace(/\/+$/, ''); break;
      case '--forget': a.forget = true; break;
      case '--help': case '-h': a.help = true; break;
      case '--version': case '-v': a.version = true; break;
      default:
        if (schluessel.startsWith('-')) { a.unbekannt = schluessel; }
    }
  }
  return a;
}

const HILFE = `
YSKAR Miner ${VERSION}

  yskar-miner --address <ysr1…> [Optionen]

Optionen
  -a, --address <adr>    Zieladresse für den Blockreward (Pflicht)
  -w, --workers <n>      Rechen-Threads (Vorgabe: Kerne minus 1)
  -i, --intensity <1-100>  Anteil der Rechenzeit (Vorgabe: 100)
      --api <url>        Server (Vorgabe: https://yskar.vercel.app)
      --forget           Gespeicherte Adresse löschen
  -h, --help             Diese Hilfe
  -v, --version          Fassung

Beispiele
  yskar-miner -a ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4
  yskar-miner -a ysr1… -w 4 -i 75

Beim ersten Start fragt der Miner nach der Adresse und merkt sie sich auf
Wunsch in yskar-miner.json — danach genügt ein Doppelklick.

Der Miner braucht keinen privaten Schlüssel. Er kennt nur die Adresse, an
die der Reward gehen soll.
`;

const ADRESSE = /^ysr1[02-9ac-hj-np-z]{38,}$/;

// ------------------------------------------------------------------ Format

const uhr = () => new Date().toTimeString().slice(0, 8);
const zahl = n => Number(n).toLocaleString('de-DE');

const FARBE = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (code, s) => FARBE ? `\x1b[${code}m${s}\x1b[0m` : s;
const gelb = s => f('33', s), gruen = s => f('32', s);
const rot = s => f('31', s), grau = s => f('90', s), fett = s => f('1', s);

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

// -------------------------------------------------------------------- Netz

async function api(basis, pfad, init) {
  const res = await fetch(`${basis}/api/v2${pfad}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fehler = new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
    fehler.code = body.error;
    fehler.daten = body;
    throw fehler;
  }
  return body;
}

// -------------------------------------------------------------------- Lauf

async function main() {
  const arg = argumente(process.argv.slice(2));

  if (arg.version) { console.log(VERSION); return; }
  if (arg.help) { console.log(HILFE); return; }
  if (arg.unbekannt) {
    console.error(rot(`Unbekannte Option: ${arg.unbekannt}`));
    console.log(HILFE); process.exit(1);
  }
  const WURZEL = join(HIER, '..');

  if (arg.forget) {
    const weg = konfig.vergessen(WURZEL);
    console.log(weg ? `Gelöscht: ${weg}` : 'Es war nichts gespeichert.');
    return;
  }

  // Reihenfolge: Argument schlaegt Datei, Datei schlaegt Nachfrage.
  const gespeichert = konfig.laden(WURZEL);
  let merken = false;

  if (!arg.address && gespeichert) {
    arg.address = gespeichert.address;
    if (!arg.workersGesetzt && gespeichert.workers) arg.workers = gespeichert.workers;
    if (arg.intensity === 100 && gespeichert.intensity) arg.intensity = gespeichert.intensity;
  }

  if (!arg.address) {
    if (!interaktiv()) {
      // Kein Terminal, niemand der antworten koennte -- etwa als Dienst.
      console.error(rot('Es fehlt die Adresse.\n'));
      console.log(HILFE); process.exit(1);
    }
    console.log(fett('\nYSKAR Miner') + grau(` ${VERSION}`));
    console.log(grau('─'.repeat(52)));
    console.log('Der Reward eines gefundenen Blocks geht an diese Adresse.');
    console.log(grau('Zu finden in der Telegram Mini App unter Wallet → Empfangen.\n'));

    for (let versuch = 0; versuch < 3 && !arg.address; versuch++) {
      const roh = await frage('YSKAR-Adresse: ');
      if (roh === null) { console.log(grau('\nAbgebrochen.')); process.exit(0); }
      const eingabe = roh.replace(/\s+/g, '');
      if (ADRESSE.test(eingabe)) { arg.address = eingabe; break; }
      console.log(rot('  Das sieht nicht nach einer YSKAR-Adresse aus.'));
      console.log(grau('  Sie beginnt mit ysr1 und ist rund 42 Zeichen lang.\n'));
    }
    if (!arg.address) {
      console.error(rot('\nKeine gültige Adresse. Abbruch.'));
      await warteAufTaste();
      process.exit(1);
    }
    merken = await jaNein('\nAdresse merken, damit die Frage künftig entfällt?');
    // Schliessen, sonst haelt die offene Eingabe den Prozess am Leben und
    // Strg+C verhaelt sich unerwartet.
    schliessen();
  }

  // Grobpruefung, die endgueltige macht der Server. Ein Tippfehler soll
  // nicht erst nach dem ersten Share auffallen.
  if (!ADRESSE.test(arg.address)) {
    console.error(rot('Das sieht nicht nach einer YSKAR-Adresse aus.'));
    console.error(grau('Erwartet wird etwas wie ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4'));
    await warteAufTaste();
    process.exit(1);
  }
  if (!(arg.intensity >= 1 && arg.intensity <= 100)) {
    console.error(rot('--intensity muss zwischen 1 und 100 liegen.')); process.exit(1);
  }

  const threads = arg.workers > 0
    ? arg.workers
    : Math.max(1, os.cpus().length - 1);   // einen Kern fuer das System lassen

  const wasm = ladeWasm();

  console.log(fett(`\nYSKAR Miner ${VERSION}`));
  console.log(grau('─'.repeat(52)));
  console.log(`  Adresse     ${arg.address}`);
  console.log(`  Server      ${arg.api}`);
  console.log(`  Threads     ${threads} von ${os.cpus().length} Kernen`);
  console.log(`  Intensität  ${arg.intensity} %`);
  console.log(grau('─'.repeat(52)));
  if (merken) {
    const pfad = konfig.speichern(WURZEL, {
      address: arg.address, workers: threads, intensity: arg.intensity,
    });
    console.log(grau(`  Gemerkt in ${pfad}`));
    console.log(grau('  Löschen mit --forget'));
  } else if (gespeichert) {
    console.log(grau('  Adresse aus yskar-miner.json · ändern mit --address'));
  }
  console.log('');

  // ---- Session ----
  let session;
  try {
    session = await api(arg.api, '/session', {
      method: 'POST',
      body: JSON.stringify({ address: arg.address, platform: `desktop/${process.platform}` }),
    });
  } catch (e) {
    if (e.code === 'too_many_sessions') {
      console.error(rot(`Zu viele Miner auf dieser Adresse.`));
      console.error(grau(
        `  Es laufen bereits ${e.daten?.active ?? '?'} von höchstens ` +
        `${e.daten?.max ?? '?'} gleichzeitig.\n` +
        `  Beende einen anderen Miner, oder warte fünf Minuten — ` +
        `abgestürzte Sitzungen\n  werden dann von selbst geschlossen.`));
    } else {
      console.error(rot(`Verbindung fehlgeschlagen: ${e.message}`));
      console.error(grau(`Erreichbar? ${arg.api}/api/v2/summary`));
    }
    await warteAufTaste();
    process.exit(1);
  }

  // Erst hier bekannt: Laeuft anderswo noch ein Miner auf derselben Adresse?
  // Ohne den Hinweis wundert man sich, warum das Guthaben schneller waechst
  // als die eigene Hashrate erklaert.
  if (session.concurrentSessions > 1) {
    console.log(grau(
      `  Parallel: ${session.concurrentSessions} Miner auf dieser Adresse\n`));
  }

  const k = new Kennzahlen();
  const zustand = {
    raten: new Map(), jobId: null,
    shareDifficulty: Number(session.shareDifficulty), laeuft: true,
  };

  // ---- Threads ----
  const arbeiter = [];
  const hasherQuelle = globalThis.__YSKAR_HASHER_SRC;
  for (let slot = 0; slot < threads; slot++) {
    // In der eingepackten Fassung liegt der Rechen-Thread als Quelltext bei
    // -- eine Binaerdatei hat kein Dateisystem, aus dem sie ihn nachladen
    // koennte.
    const w = hasherQuelle
      ? new Worker(hasherQuelle, {
          eval: true,
          workerData: { wasm, extranonce: session.extranonce, slot, stride: STRIDE },
        })
      : new Worker(join(HIER, 'hasher.mjs'), {
          workerData: { wasm, extranonce: session.extranonce, slot, stride: STRIDE },
        });
    w.on('message', m => nachricht(m, w));
    w.on('error', e => ereignis(rot(`Thread ${slot}: ${e.message}`)));
    arbeiter.push(w);
  }

  let bereit = 0;
  function nachricht(m, w) {
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
    if (m.t === 'fehler') { ereignis(rot(`Thread ${m.slot}: ${m.message}`)); return; }
    if (m.t === 'share') sendeShare(m);
  }

  async function sendeShare(m) {
    try {
      const r = await api(arg.api, '/share', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.sessionId, jobId: m.jobId, nonce: m.nonce }),
      });

      if (!r.accepted) {
        if (r.reason === 'job_expired' || r.reason === 'stale_job') { holeJob(); return; }
        k.abgelehnt++;
        // Vereinzelte Ablehnungen sind normal, wenn der Server das Ziel
        // gerade nachzieht. Nur die uebrigen sind eine Meldung wert.
        if (r.reason !== 'duplicate' && r.reason !== 'low_difficulty') {
          ereignis(`${grau('[' + uhr() + ']')} ${gelb('abgelehnt')} ${grau(r.reason)}`);
        }
        return;
      }

      k.shareAngenommen();

      if (r.shareDifficulty && Number(r.shareDifficulty) !== zustand.shareDifficulty) {
        // VarDiff: Der Server passt das Share-Target an. Ohne Nachfuehrung
        // rechneten die Threads weiter gegen den alten Wert.
        const vorher = zustand.shareDifficulty;
        zustand.shareDifficulty = Number(r.shareDifficulty);
        const t = toHex(targetBytes(zustand.shareDifficulty));
        arbeiter.forEach(w => w.postMessage({ t: 'target', target: t }));
        ereignis(`${grau('[' + uhr() + ']')} ${grau('Ziel angepasst')} ` +
          `${zahl2(vorher)} ${grau('→')} ${zahl2(zustand.shareDifficulty)}`);
      }

      if (r.block) {
        const aufwand = k.blockGefunden();
        const reward = (Number(r.reward) / 1e8).toFixed(0);
        ereignis('');
        ereignis(gruen(fett(`[${uhr()}] BLOCK GEFUNDEN  #${r.height}   +${reward} YSR`)));
        ereignis(grau(`           ${r.hash}`));
        if (aufwand !== null) {
          // Erst beim Fund steht fest, wie viel Arbeit es wirklich war.
          const urteil = aufwand < 100 ? gruen('Glück') : gelb('Pech');
          ereignis(grau(`           Aufwand ${aufwand.toFixed(0)} % — `) + urteil +
            grau(aufwand < 100 ? ', schneller als erwartet' : ', länger als erwartet'));
        }
        ereignis('');
        holeJob();
        return;
      }

      /*
        Eine Zeile JE angenommenem Share. Vorher passierte stundenlang
        sichtbar nichts, obwohl durchgehend gerechnet wurde.

        Gezeigt wird die TATSAECHLICH erreichte Difficulty, nicht die
        verlangte. Die verlangte ist eine Servereinstellung und keine
        Leistung -- sie nebeneinander zu zeigen liest sich wie dieselbe
        Groesse in zwei Zustaenden und verwirrt mehr, als sie erklaert.
        Aendert sie sich, wird das ohnehin eigens gemeldet, und unter der
        Taste c steht sie jederzeit.

        Der Prozentwert ist die Aussage, um die es geht: Ein Share mit
        100 % IST ein Block -- das ist keine Analogie, sondern genau die
        Bedingung.
      */
      const erreicht = Number(r.achieved ?? 0);
      const netz = Number(r.blockDifficulty ?? k.netzDifficulty ?? 0);
      const anteil = netz > 0 ? (erreicht / netz) * 100 : 0;
      ereignis(
        `${grau('[' + uhr() + ']')} ${gruen('angenommen')} ` +
        `${grau('#')}${k.angenommen}` +
        `${grau(' · Difficulty ')}${zahl2(erreicht)}` +
        `${grau(' · ')}${anteil.toFixed(anteil < 10 ? 1 : 0)} %${grau(' eines Blocks')}`);
    } catch (e) {
      ereignis(grau(`[${uhr()}] Einreichen fehlgeschlagen: ${e.message}`));
    }
  }

  async function holeJob() {
    try {
      const job = await api(arg.api, `/job?session=${session.sessionId}`);
      if (job.jobId === zustand.jobId) return;
      const neueHoehe = job.height !== k.hoehe;
      const neueDiff = job.difficulty !== k.netzDifficulty;
      zustand.jobId = job.jobId;
      zustand.shareDifficulty = Number(job.shareDifficulty);
      k.hoehe = job.height;
      k.netzDifficulty = job.difficulty;
      arbeiter.forEach(w => w.postMessage({ t: 'job', job }));

      // Neue Arbeit melden -- so sieht man, dass die Kette weiterlaeuft,
      // auch wenn gerade kein eigener Share faellt.
      if (neueHoehe || neueDiff) {
        ereignis(`${grau('[' + uhr() + ']')} ${grau('neue Arbeit · Block')} ` +
          `${job.height}${grau(' · Difficulty ')}${zahl2(job.difficulty)}`);
      }
    } catch (e) {
      ereignis(grau(`[${uhr()}] Job holen fehlgeschlagen: ${e.message}`));
    }
  }

  arbeiter.forEach(w => w.postMessage({ t: 'duty', value: arg.intensity }));

  // Job erneuern, bevor er nach 90 s ablaeuft
  const jobTakt = setInterval(holeJob, 45_000);

  /*
    Statuszeile, die sich an Ort und Stelle erneuert.

    Sie zeigt nur, was sich staendig aendert. Alles Uebrige steht in der
    Uebersicht einmal je Minute oder laesst sich per Taste abrufen -- eine
    Zeile, die alles enthaelt, liest niemand mehr.
  */
  const statusTakt = setInterval(() => {
    const jetzt = Date.now();
    let summe = 0;
    for (const [slot, r] of zustand.raten) {
      if (jetzt - r.at > 3000) zustand.raten.delete(slot);
      else summe += r.rate;
    }
    k.probe(summe);

    const aufwand = k.aufwand();
    zeile(
      `${grau('[' + uhr() + ']')} ${gelb(fmtRate2(summe).padEnd(10))}` +
      `${grau('·')} ${k.angenommen}${grau('/')}${k.abgelehnt} ` +
      `${grau('·')} Aufwand ${aufwand === null ? '—' : aufwand.toFixed(0) + ' %'} ` +
      `${grau('·')} Block ${k.hoehe != null ? '#' + k.hoehe : '—'} ` +
      `${grau('·')} Diff ${k.netzDifficulty ? zahl2(k.netzDifficulty) : '—'}` +
      (k.bloecke ? ` ${grau('·')} ${gruen(k.bloecke + ' Blöcke')}` : ''),
    );
  }, 1000);

  /*
    Uebersicht einmal je Minute.

    Drei Zeitfenster statt einer Momentaufnahme: Eine einzelne Zahl
    schwankt, drei zeigen, ob die Leistung stabil ist. Faellt der
    15-Minuten-Wert deutlich unter den 10-Sekunden-Wert, drosselt das Geraet.
  */
  const uebersichtTakt = setInterval(() => {
    const abstand = k.shareAbstand();
    ereignis(
      `${grau('[' + uhr() + ']')} ${grau('10s')} ${fmtRate2(k.rate(10))} ` +
      `${grau('60s')} ${fmtRate2(k.rate(60))} ` +
      `${grau('15m')} ${fmtRate2(k.rate(900))} ` +
      `${grau('·')} ${fmtHashes(k.hashesGesamt)} ${grau('gesamt')} ` +
      `${grau('· Laufzeit')} ${dauer(k.laufzeit())}` +
      (abstand ? ` ${grau('· Share alle')} ${dauer(abstand)}` : ''));
  }, 60_000);

  /*
    Tastenbefehle, uebernommen von etablierten Minern: h fuer Hashrate,
    s fuer eine Zusammenfassung, c fuer die Verbindung.

    Im Rohmodus liefert das System kein SIGINT mehr -- Strg+C muss deshalb
    selbst abgefangen werden, sonst liesse sich das Programm nicht beenden.
  */
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', taste => {
      if (taste === '\u0003' || taste === 'q') { aufhoeren(); return; }

      if (taste === 'h') {
        ereignis('');
        ereignis(fett('  Hashrate'));
        ereignis(`    10 s    ${fmtRate2(k.rate(10))}`);
        ereignis(`    60 s    ${fmtRate2(k.rate(60))}`);
        ereignis(`    15 min  ${fmtRate2(k.rate(900))}`);
        ereignis(grau('    je Thread'));
        for (const [slot, r] of [...zustand.raten].sort((x, y) => x[0] - y[0])) {
          ereignis(grau(`      ${String(slot).padStart(2)}    `) + fmtRate2(r.rate));
        }
        ereignis('');
      } else if (taste === 's') {
        const aufwand = k.aufwand();
        const schnitt = k.aufwandVerlauf.length
          ? k.aufwandVerlauf.reduce((x, y) => x + y, 0) / k.aufwandVerlauf.length : null;
        ereignis('');
        ereignis(fett('  Zusammenfassung'));
        ereignis(`    Laufzeit          ${dauer(k.laufzeit())}`);
        ereignis(`    Hashes gesamt     ${fmtHashes(k.hashesGesamt)}`);
        ereignis(`    Shares            ${k.angenommen} angenommen, ${k.abgelehnt} abgelehnt`);
        ereignis(`    Blöcke            ${k.bloecke}`);
        ereignis(`    Aufwand jetzt     ${aufwand === null ? '—' : aufwand.toFixed(0) + ' %'}`);
        if (schnitt !== null) {
          ereignis(`    Aufwand im Mittel ${schnitt.toFixed(0)} % ` +
            grau(`über ${k.aufwandVerlauf.length} Blöcke`));
        }
        ereignis(`    Nächster Block    ${grau('erwartet in')} ${dauer(k.erwarteteZeit())}`);
        ereignis(grau('    Die Erwartung ist ein Mittelwert, kein Countdown —'));
        ereignis(grau('    Mining ist gedächtnislos.'));
        ereignis('');
      } else if (taste === 'c') {
        ereignis('');
        ereignis(fett('  Verbindung'));
        ereignis(`    Server            ${arg.api}`);
        ereignis(`    Adresse           ${arg.address}`);
        ereignis(`    Session           ${session.sessionId}`);
        ereignis(`    Extranonce        ${session.extranonce}`);
        ereignis(`    Block             ${k.hoehe ?? '—'}`);
        ereignis(`    Netz-Difficulty   ${k.netzDifficulty ? zahl2(k.netzDifficulty) : '—'}`);
        ereignis(`    Share-Ziel        ${zahl2(zustand.shareDifficulty)}`);
        ereignis(`    Threads           ${threads}, Intensität ${arg.intensity} %`);
        ereignis('');
      }
    });

    console.log(grau('  Tasten: h Hashrate · s Zusammenfassung · c Verbindung · q Ende\n'));
  }

  // ---- Sauber beenden ----
  let beendet = false;
  async function aufhoeren() {
    if (beendet) return;
    beendet = true;
    clearInterval(jobTakt); clearInterval(statusTakt); clearInterval(uebersichtTakt);
    if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch { /* egal */ } }
    ereignis('');
    ereignis(grau('Beende…'));
    arbeiter.forEach(w => { w.postMessage({ t: 'stop' }); w.terminate(); });
    // Session schliessen, damit sie nicht bis zum Zeitablauf offen bleibt
    await api(arg.api, '/session/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.sessionId }),
    }).catch(() => {});
    console.log(`\n  Laufzeit      ${dauer(k.laufzeit())}`);
    console.log(`  Hashes        ${fmtHashes(k.hashesGesamt)}`);
    console.log(`  Angenommen    ${k.angenommen}`);
    console.log(`  Abgelehnt     ${k.abgelehnt}`);
    console.log(`  Blöcke        ${k.bloecke}\n`);
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
  console.error(rot('miner.<hash>.wasm nicht gefunden.'));
  console.error(grau('Erwartet neben dem Miner oder in public/ des Projekts.'));
  process.exit(1);
}

main().catch(async e => {
  console.error(rot(`\n${e.stack ?? e.message}`));
  await warteAufTaste();
  process.exit(1);
});
