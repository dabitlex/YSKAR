/**
 * Der Kopf beim Start -- was dieser Miner ist, worauf er laeuft, wohin er
 * auszahlt und wogegen er rechnet.
 *
 * Aufbau: Abschnitte (SYSTEM, ACCOUNT, NETWORK, SESSION), darin eine Spalte
 * Marken und eine Spalte Werte, jede Zeile mit einem Stern am Anfang. Das
 * liest sich in einem Blick und laesst sich aus einem Screenshot vorlesen --
 * beides zaehlt, wenn jemand fragt "warum findet mein Miner nichts".
 *
 * Ab 0.2.0 englisch (vorher deutsch) und mit mehr Netzangaben: Knoten,
 * Halbierung, Umlaufmenge. Alles kommt aus EINEM Aufruf von /api/v2/summary;
 * fehlt ein Feld (aeltere Knoten), faellt seine Zeile weg statt "—" zu zeigen.
 *
 * WAS BEWUSST FEHLT
 *
 * Keine Spendenzeile -- dieser Miner nimmt nichts. Keine Angabe zur
 * Kartenleistung und keine Ertragsschaetzung: Beides steht erst fest, wenn
 * gerechnet wird. Die Schaetzung steht deshalb im festen Kopf und unter s.
 */
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { zahl, zahlFest, dauer, rate } from './anzeige.mjs';

/** Feste Breite der Markenspalte -- danach beginnen alle Werte buendig. */
const MARKE = 13;
const LINIE = 88;

/** Blöcke je Halbierung -- EPOCH_BLOCKS in src/lib/core/params.ts. */
export const HALBIERUNG_ALLE = 12_000;

export function erzeugeZeile(farben, marke, wert) {
  const { grau, cyan } = farben;
  // Eine leere Marke setzt die Zeile unter die vorige -- fuer Fortsetzungen.
  const m = marke === '' ? ' '.repeat(MARKE) : cyan(marke.padEnd(MARKE));
  return ` ${grau('*')} ${m}${wert}`;
}

const gb = bytes => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/**
 * Der Prozessorname, wie ihn das Betriebssystem meldet.
 *
 * Intel haengt gern mehrere Leerzeichen und ein "(R)" hinein. Das ist
 * Markenpflege und kein Informationsgewinn.
 */
function prozessor() {
  const c = os.cpus();
  if (!c.length) return 'unknown';
  return c[0].model.replace(/\((R|TM)\)/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Das Betriebssystem so, wie es der Nutzer kennt.
 *
 * os.release() liefert unter Windows "10.0.26100" -- auch auf Windows 11.
 * os.version() kennt den Namen; unter Linux steht er in /etc/os-release.
 */
function system() {
  try {
    if (process.platform === 'win32') return `${os.version()} ${process.arch}`;
    if (process.platform === 'darwin') return `macOS ${os.release()} ${process.arch}`;
    if (process.platform === 'linux') {
      const name = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(readFileSync('/etc/os-release', 'utf8'))?.[1];
      if (name) return `${name} ${process.arch}`;
    }
  } catch { /* faellt auf die schlichte Angabe zurueck */ }
  return `${process.platform} ${process.arch} ${os.release()}`;
}

/** Basiseinheiten (8 Nachkommastellen) als ganze YSR. */
const ysr = basis => Number(BigInt(basis) / 100_000_000n);

/**
 * Den Kopf ausgeben.
 *
 * `netz` ist die Antwort von /api/v2/summary oder null, wenn der Knoten
 * nicht erreichbar war. Nicht erreichbar ist kein Grund, den Kopf
 * wegzulassen -- im Gegenteil: Dann ist er die einzige Stelle, an der
 * steht, welche Adresse ueberhaupt versucht wurde.
 */
export function zeigeKopf(opt) {
  const {
    version, adresse, api, modus, poolName, threads, intensitaet, rechner, geraet,
    netz, latenz, farben,
  } = opt;
  const { grau, fett, gelb, gruen } = farben;
  const z = (m, w) => console.log(erzeugeZeile(farben, m, w));
  const p = grau(' · ');
  const abschnitt = t => console.log(` ${fett(t)}`);

  const kerne = os.cpus().length;
  const belegt = os.totalmem() - os.freemem();
  const anteil = Math.round((belegt / os.totalmem()) * 100);

  console.log('');
  console.log(` ${fett('YSKAR Miner')} ${grau(version)}${' '.repeat(Math.max(2, LINIE - 32 - version.length))}${grau('Fair from block 0.')}`);
  console.log(grau(' ' + '─'.repeat(LINIE)));

  abschnitt('SYSTEM');
  z('VERSION', `yskar-miner ${version}${p}node ${process.version.slice(1)}${p}${system()}`);
  z('CPU', `${prozessor()}${p}${kerne} ${kerne === 1 ? 'thread' : 'threads'}`);
  z('MEMORY', `${gb(belegt)} of ${gb(os.totalmem())} in use ${grau(`(${anteil}%)`)}`);
  const werk = rechner === 'gpu' ? `graphics card ${geraet} only`
    : rechner === 'beides' ? `${threads} CPU threads + graphics card ${geraet}`
    : `${threads} CPU ${threads === 1 ? 'thread' : 'threads'}`;
  z('COMPUTE', `${werk}${rechner === 'gpu' ? '' : `${p}intensity ${intensitaet}%`}`);
  if (rechner !== 'cpu') z('', grau('the graphics card is checked before the first job'));
  z('ALGORITHM', `SHA-256d${p}136-byte block header`);
  console.log('');

  abschnitt('ACCOUNT');
  z('PAYOUT TO', adresse);
  z('NODE', `${api}${p}${netz
    ? `${gruen('reachable')}${latenz != null ? grau(` (${latenz} ms)`) : ''}`
    : gelb('not reachable — trying anyway')}`);
  z('MODE', modus === 'pool'
    ? `Pool${poolName ? `${p}${poolName}` : grau(' (confirmed when the session opens)')}`
    : `Solo${grau(' — you receive the full reward, but only for blocks you find yourself')}`);

  if (netz) {
    console.log('');
    abschnitt('NETWORK');
    const hoehe = Number(netz.height);
    const diff = netz.difficultyWert ?? netz.difficulty;
    z('HEIGHT', `${zahl(hoehe)}${p}difficulty ${zahl(diff)}`);
    const zusatz = [
      netz.hashrate ? rate(Number(netz.hashrate)) : null,
      netz.activeMiners != null ? `${zahl(netz.activeMiners)} active miners` : null,
      netz.knoten != null ? `${zahl(netz.knoten)} nodes` : null,
    ].filter(Boolean);
    if (zusatz.length) z('HASHRATE', zusatz.join(p));
    const ziel = Number(netz.targetBlockTime) || 600;
    if (netz.nextReward) {
      z('REWARD', `${zahl(ysr(netz.nextReward))} YSR per block${p}target ${dauer(ziel)} per block`);
    }
    if (Number.isFinite(hoehe)) {
      const naechste = (Math.floor(hoehe / HALBIERUNG_ALLE) + 1) * HALBIERUNG_ALLE;
      const rest = naechste - hoehe;
      z('HALVING', `at block ${zahl(naechste)}${p}${zahl(rest)} blocks to go ${
        grau(`(≈ ${dauer(rest * ziel)})`)}`);
    }
    if (netz.totalSupply && netz.maxSupply) {
      const im = ysr(netz.totalSupply), max = ysr(netz.maxSupply);
      z('SUPPLY', `${zahl(im)} of ${zahl(max)} YSR mined ${
        grau(`(${zahlFest((im / max) * 100, 1)}%)`)}`);
    }
  }

  console.log(grau(' ' + '─'.repeat(LINIE)));
}

/**
 * Der zweite Block: was nach der Anmeldung feststeht.
 *
 * Bewusst GETRENNT vom Kopf und nicht darin. Sitzungsnummer, Share-Ziel
 * und Pool-Angaben gibt es vor der Anmeldung schlicht nicht -- ein Kopf,
 * der sie enthielte, muesste sie beim Start leer lassen oder erfinden.
 */
export function zeigeSitzung(opt) {
  const { sitzung, extranonce, shareZiel, netzDiff, pool, poolGewuenscht, parallel, farben } = opt;
  const { grau, gelb, fett } = farben;
  const z = (m, w) => console.log(erzeugeZeile(farben, m, w));
  const p = grau(' · ');

  console.log(` ${fett('SESSION')}`);
  z('SESSION', `${String(sitzung).slice(0, 8)}${extranonce != null ? `${p}extranonce ${extranonce}` : ''}`);

  if (pool) {
    const teile = [pool.name, `fee ${(Number(pool.feeBps) / 100).toFixed(2)}%`];
    if (pool.belegt != null && pool.plaetze != null) teile.push(`${zahl(pool.belegt)} of ${zahl(pool.plaetze)} miners`);
    else if (pool.miner != null) teile.push(`${zahl(pool.miner)} miners`);
    teile.push(pool.modus === 'batch' ? 'paid out by the pool' : 'paid directly in each block');
    z('POOL', teile.join(p));
  } else if (poolGewuenscht) {
    z('POOL', gelb('This node does not run a pool — mining solo.'));
  }

  /*
    Das Share-Ziel ist NICHT die Netz-Difficulty.

    Ein Share ist ein Zwischenergebnis, das der Knoten als Arbeitsnachweis
    annimmt -- viel leichter zu treffen als ein Block. Wer die beiden Zahlen
    nebeneinander sieht, versteht, warum staendig Shares kommen und
    trotzdem kein Block: Das eine ist ein Bruchteil des anderen.
  */
  z('SHARE TARGET', `${zahl(shareZiel)} ${grau(netzDiff
    ? `— a share proves your work; a block needs ${zahl(netzDiff)}`
    : '— a share proves your work, it is not a block')}`);

  if (parallel > 1) {
    /*
      Ohne diesen Hinweis wundert man sich, warum das Guthaben schneller
      waechst, als die eigene Hashrate erklaert.
    */
    z('PARALLEL', `${zahl(parallel)} miners are running on this address`);
  }

  console.log(grau(' ' + '─'.repeat(LINIE)));
}
