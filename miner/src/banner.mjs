/**
 * Der Kopf beim Start -- was dieser Miner ist, worauf er laeuft, wogegen
 * er rechnet.
 *
 * Aufbau nach dem Vorbild von XMRig: eine Spalte Marken, eine Spalte
 * Werte, jede Zeile mit einem Stern am Anfang. Das liest sich in einem
 * Blick und laesst sich aus einem Screenshot vorlesen -- beides zaehlt,
 * wenn jemand fragt "warum findet mein Miner nichts".
 *
 * WAS BEWUSST DRINSTEHT
 *
 * Die Netzangaben (Hoehe, Difficulty, erwartete Zeit) kosten einen
 * zusaetzlichen Aufruf vor der Anmeldung. Das ist es wert: Ohne sie sieht
 * jeder Start gleich aus, egal ob der Knoten bei Hoehe 2.600 steht oder
 * bei 12. Und die erwartete Zeit bis zum naechsten Block ist die einzige
 * Zahl, die der Frage "ist das normal, dass stundenlang nichts passiert"
 * vorbeugt.
 *
 * WAS BEWUSST FEHLT
 *
 * Keine Spendenzeile -- dieser Miner nimmt nichts. Keine Angabe zur
 * Kartenleistung: Die steht erst nach dem Selbsttest fest, und eine Zahl,
 * die beim Start geraten waere, ist schlimmer als keine.
 */
import os from 'node:os';

/** Feste Breite der Markenspalte -- danach beginnen alle Werte buendig. */
const MARKE = 12;

export function erzeugeZeile(farben, marke, wert) {
  const { grau, cyan } = farben;
  // Eine leere Marke setzt die Zeile unter die vorige -- fuer Fortsetzungen.
  const m = marke === '' ? ' '.repeat(MARKE) : cyan(marke.padEnd(MARKE));
  return `${grau(' *')} ${m}${wert}`;
}

/**
 * "31,3 GB" aus Bytes -- mit Komma.
 *
 * toFixed liefert immer einen Punkt, unabhaengig von der Sprache. In einer
 * sonst deutschen Ausgabe faellt das auf, und zwar unangenehm: Es sieht
 * nach halb uebersetzt aus.
 */
function gb(bytes) {
  return `${(bytes / 1024 ** 3).toLocaleString('de-DE', {
    minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
}

/** Wie gb, fuer die Hashrate-Nachkommastellen. */
const komma = (n, stellen) => n.toLocaleString('de-DE', {
  minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/**
 * Der Prozessorname, wie ihn das Betriebssystem meldet.
 *
 * Intel haengt gern mehrere Leerzeichen und ein "(R)" hinein. Das ist
 * Markenpflege und kein Informationsgewinn.
 */
function prozessor() {
  const c = os.cpus();
  if (!c.length) return 'unbekannt';
  return c[0].model.replace(/\((R|TM)\)/g, '').replace(/\s+/g, ' ').trim();
}

/** Zahl mit deutschen Tausenderpunkten, oder ein Strich. */
const nf = n => (n === null || n === undefined || !Number.isFinite(Number(n)))
  ? '—' : Number(n).toLocaleString('de-DE');

/** Sekunden als "10 min" oder "2 h 5 min". */
function dauer(sek) {
  if (sek === null || !Number.isFinite(sek)) return '—';
  const s = Math.round(sek);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  return `${h} h ${Math.round((s % 3600) / 60)} min`;
}

/** Hashrate lesbar. */
function rate(h) {
  if (!h) return '—';
  if (h >= 1e9) return `${komma(h / 1e9, 2)} GH/s`;
  if (h >= 1e6) return `${komma(h / 1e6, 2)} MH/s`;
  if (h >= 1e3) return `${komma(h / 1e3, 1)} kH/s`;
  return `${nf(Math.round(h))} H/s`;
}

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
    version, adresse, api, modus, threads, intensitaet, rechner, geraet,
    netz, farben,
  } = opt;
  const { grau, fett, gelb } = farben;
  const z = (m, w) => console.log(erzeugeZeile(farben, m, w));

  const kerne = os.cpus().length;
  const belegt = os.totalmem() - os.freemem();
  const anteil = Math.round((belegt / os.totalmem()) * 100);

  console.log('');
  console.log(fett(' YSKAR Miner'));
  console.log(grau(' ' + '─'.repeat(62)));

  z('ÜBER', `YSKAR Miner/${version}  node/${process.version.slice(1)}`);
  z('SYSTEM', `${process.platform} ${process.arch}  ·  ${os.release()}`);
  z('CPU', prozessor());
  z('', grau(`${kerne} ${kerne === 1 ? 'Kern' : 'Kerne'}`));
  z('SPEICHER', `${gb(belegt)} / ${gb(os.totalmem())}  ${grau(`(${anteil} %)`)}`);
  z('ALGO', 'SHA-256d  ·  Header 136 Byte');

  const werk = rechner === 'gpu' ? 'nur Grafikkarte'
    : rechner === 'beides' ? `${threads} CPU-Threads + Grafikkarte`
    : `${threads} von ${kerne} Kernen`;
  z('RECHENWERK', `${werk}  ·  Intensität ${intensitaet} %`);
  if (rechner !== 'cpu') {
    z('', grau(`Gerät ${geraet} — wird vor dem ersten Job geprüft`));
  }

  console.log(grau(' ' + '─'.repeat(62)));

  z('ADRESSE', adresse);
  z('KNOTEN', api);
  z('MODUS', modus === 'pool' ? 'Pool (wird beim Anmelden bestätigt)' : 'Solo');

  if (netz) {
    z('NETZ', `Höhe ${nf(netz.height)}  ·  Difficulty ${nf(netz.difficulty)}`);
    z('', grau(
      `${nf(netz.activeMiners ?? 0)} Miner aktiv  ·  Netzleistung ${
        rate(netz.hashrate)}  ·  Ziel ${dauer(netz.targetBlockTime)} je Block`));

    /*
      Die ehrlichste Zahl im ganzen Kopf.

      Sie sagt: Wenn du die gesamte Netzleistung haettest, kaeme alle
      soundso lange ein Block. Was DEIN Anteil daran ist, steht erst fest,
      wenn gerechnet wird -- deshalb hier nur das Netz und keine
      Hochrechnung auf diesen Rechner.
    */
    if (netz.nextReward) {
      z('REWARD', `${(Number(netz.nextReward) / 1e8).toLocaleString('de-DE')} YSR je Block`);
    }
  } else {
    z('NETZ', gelb('nicht erreichbar — es wird trotzdem versucht'));
  }

  console.log(grau(' ' + '─'.repeat(62)));
  console.log('');
}
