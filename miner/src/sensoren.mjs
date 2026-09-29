/**
 * Temperaturen von Prozessor und Grafikkarte.
 *
 * WARUM DAS UEBERHAUPT DRINSTEHT
 *
 * XMRig zeigt keine CPU-Temperatur, und das hat einen Grund: Ein Miner
 * kann nichts dagegen tun, das Drosseln macht das System selbst. Eine
 * Anzeige ohne Handlungsmoeglichkeit ist Dekoration.
 *
 * Hier ist das anders: Dieser Miner hat --intensity. Wer sieht, dass die
 * CPU bei 95 Grad haengt, kann auf 70 Prozent gehen und weiterrechnen,
 * statt dass das Geraet von selbst drosselt oder abschaltet. Damit ist die
 * Zahl eine Entscheidungsgrundlage und keine Zierde.
 *
 * WAS NICHT GEHT, UND WARUM ES TROTZDEM VERSUCHT WIRD
 *
 * Node hat keinen Zugriff auf Sensoren. Jede Quelle hier ist ein Umweg
 * ueber das Betriebssystem, und jede kann fehlen:
 *
 *   Linux      /sys/class/hwmon -- meist ohne besondere Rechte lesbar.
 *              Auf dem Raspberry zuverlaessig.
 *   Windows    WMI ueber PowerShell. Nach verbreiteter Erfahrung liefern
 *              viele Consumer-Mainboards hier nichts oder eine ACPI-Zone
 *              statt der Kerne. Ob es auf einem bestimmten Rechner
 *              funktioniert, zeigt erst der Versuch.
 *   macOS      ohne Zusatzprogramm nicht erreichbar. Wird nicht versucht.
 *   NVIDIA     nvidia-smi, sofern der Treiber da ist -- die verlaesslichste
 *              Quelle von allen, mit Temperatur, Verbrauch und Luefter.
 *
 * DIE REGEL FUER ALLE: Im Zweifel nichts anzeigen. Eine falsche Temperatur
 * ist schlimmer als keine -- nach ihr wuerde jemand seine Einstellungen
 * richten. Deshalb die Plausibilitaetsgrenzen unten: Was ausserhalb liegt,
 * gilt als nicht gemessen.
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ausserhalb dieser Spanne ist der Wert kein Messwert.
 *
 * Unter 10 Grad laeuft kein Rechner, ueber 120 laeuft er nicht mehr lange.
 * Beides deutet darauf hin, dass die Quelle etwas anderes meldet als eine
 * Temperatur -- Millivolt etwa, oder einen Fehlercode.
 */
const MIN_GRAD = 10;
const MAX_GRAD = 120;

const plausibel = t =>
  Number.isFinite(t) && t >= MIN_GRAD && t <= MAX_GRAD ? Math.round(t) : null;

/** Ein Programm aufrufen und seine Ausgabe holen. Nie werfen. */
function rufe(programm, args, msMax = 4000) {
  return new Promise(fertig => {
    let p;
    try { p = spawn(programm, args, { windowsHide: true }); }
    catch { return fertig(null); }

    let aus = '';
    const schluss = setTimeout(() => { try { p.kill(); } catch { /* egal */ } }, msMax);

    p.stdout?.on('data', d => { aus += d; });
    p.on('error', () => { clearTimeout(schluss); fertig(null); });
    p.on('close', code => {
      clearTimeout(schluss);
      fertig(code === 0 && aus.trim() ? aus : null);
    });
  });
}

// ------------------------------------------------------------------ Linux

/**
 * Prozessortemperatur aus /sys/class/hwmon.
 *
 * Die Namen unterscheiden sich je nach Hersteller: k10temp bei AMD,
 * coretemp bei Intel, cpu_thermal auf dem Raspberry. Deshalb wird nach
 * dem Namen des hwmon-Geraets gesucht und nicht nach einer festen Nummer --
 * die verschiebt sich zwischen Kerneln.
 */
function cpuLinux() {
  const wurzel = '/sys/class/hwmon';
  if (!existsSync(wurzel)) return null;

  const gesucht = ['k10temp', 'coretemp', 'cpu_thermal', 'zenpower', 'acpitz'];
  let ersatz = null;

  let geraete;
  try { geraete = readdirSync(wurzel); } catch { return null; }

  for (const g of geraete) {
    const ordner = join(wurzel, g);
    let name = '';
    try { name = readFileSync(join(ordner, 'name'), 'utf8').trim(); } catch { continue; }

    let dateien;
    try { dateien = readdirSync(ordner); } catch { continue; }
    const eingaenge = dateien.filter(d => /^temp\d+_input$/.test(d)).sort();
    if (eingaenge.length === 0) continue;

    /*
      Den heissesten Wert des Geraets nehmen, nicht den ersten.

      Ein Prozessor meldet mehrere Zonen; die erste ist nicht zwingend die
      relevante. Wer kuehlen muss, interessiert sich fuer die heisseste.
    */
    let heiss = null;
    for (const d of eingaenge) {
      try {
        const roh = Number(readFileSync(join(ordner, d), 'utf8').trim());
        const grad = plausibel(roh / 1000);
        if (grad !== null && (heiss === null || grad > heiss)) heiss = grad;
      } catch { /* diese Zone eben nicht */ }
    }
    if (heiss === null) continue;

    if (gesucht.includes(name)) return { grad: heiss, quelle: name };
    if (ersatz === null) ersatz = { grad: heiss, quelle: name };
  }
  return ersatz;
}

/** Raspberry und andere ohne hwmon: die Thermalzone. */
function cpuThermalZone() {
  const wurzel = '/sys/class/thermal';
  if (!existsSync(wurzel)) return null;
  try {
    for (const z of readdirSync(wurzel).filter(d => d.startsWith('thermal_zone'))) {
      try {
        const grad = plausibel(
          Number(readFileSync(join(wurzel, z, 'temp'), 'utf8').trim()) / 1000);
        if (grad === null) continue;
        let typ = z;
        try { typ = readFileSync(join(wurzel, z, 'type'), 'utf8').trim(); } catch { /* egal */ }
        return { grad, quelle: typ };
      } catch { /* naechste Zone */ }
    }
  } catch { /* egal */ }
  return null;
}

// ---------------------------------------------------------------- Windows

/**
 * Prozessortemperatur ueber WMI.
 *
 * Die Klasse meldet Zehntel-Kelvin. Sie ist die einzige Quelle, die ohne
 * zusaetzliche Software erreichbar ist -- und sie fehlt auf vielen
 * Consumer-Mainboards schlicht. Dann kommt hier null zurueck und es steht
 * nichts in der Anzeige. Das ist die richtige Antwort: lieber keine Zahl
 * als eine, die etwas anderes misst als die Kerne.
 */
async function cpuWindows() {
  const aus = await rufe('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    '(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature ' +
    '-ErrorAction SilentlyContinue).CurrentTemperature',
  ], 6000);
  if (!aus) return null;

  let heiss = null;
  for (const zeile of aus.split(/\r?\n/)) {
    const roh = Number(zeile.trim());
    if (!Number.isFinite(roh) || roh === 0) continue;
    const grad = plausibel(roh / 10 - 273.15);
    if (grad !== null && (heiss === null || grad > heiss)) heiss = grad;
  }
  return heiss === null ? null : { grad: heiss, quelle: 'ACPI' };
}

// ----------------------------------------------------------------- NVIDIA

/** Karten ueber nvidia-smi: Temperatur, Verbrauch, Luefter. */
async function karten() {
  const aus = await rufe('nvidia-smi', [
    '--query-gpu=name,temperature.gpu,power.draw,fan.speed,utilization.gpu',
    '--format=csv,noheader,nounits',
  ]);
  if (!aus) return [];

  const liste = [];
  for (const zeile of aus.split(/\r?\n/)) {
    const teile = zeile.split(',').map(t => t.trim());
    if (teile.length < 2) continue;
    const grad = plausibel(Number(teile[1]));
    if (grad === null) continue;
    liste.push({
      name: teile[0],
      grad,
      watt: Number.isFinite(Number(teile[2])) ? Math.round(Number(teile[2])) : null,
      luefter: Number.isFinite(Number(teile[3])) ? Math.round(Number(teile[3])) : null,
      last: Number.isFinite(Number(teile[4])) ? Math.round(Number(teile[4])) : null,
    });
  }
  return liste;
}

// -------------------------------------------------------------------- API

/**
 * Sensoren im Hintergrund lesen.
 *
 * Bewusst NICHT bei jedem Aufruf der Anzeige: Unter Windows kostet jede
 * Messung einen PowerShell-Prozess. Einmal je Takt reicht -- Temperaturen
 * aendern sich in Sekunden, nicht in Millisekunden. Die Anzeige liest
 * immer den zuletzt gemessenen Wert und wartet nie.
 */
export class Sensoren {
  constructor(taktMs = 10_000) {
    this.cpu = null;        // { grad, quelle } oder null
    this.gpus = [];
    this.verfuegbar = null; // null = noch nicht gemessen
    this._takt = taktMs;
    this._timer = null;
  }

  async messen() {
    if (process.platform === 'win32') {
      this.cpu = await cpuWindows();
    } else if (process.platform === 'linux') {
      this.cpu = cpuLinux() ?? cpuThermalZone();
    } else {
      this.cpu = null;   // macOS: ohne Zusatzprogramm nicht erreichbar
    }
    this.gpus = await karten();
    this.verfuegbar = this.cpu !== null || this.gpus.length > 0;
  }

  start() {
    void this.messen();
    this._timer = setInterval(() => void this.messen(), this._takt);
    // Der Takt darf das Programm nicht am Beenden hindern.
    if (this._timer.unref) this._timer.unref();
  }

  stop() { if (this._timer) clearInterval(this._timer); }

  /**
   * Eine Zeile fuer die Anzeige, oder null wenn nichts messbar ist.
   *
   * Ab 85 Grad gelb, ab 95 rot -- das sind die Schwellen, ab denen ein
   * Prozessor ueblicherweise von selbst drosselt. Wer die Farbe sieht,
   * kann die Intensitaet senken, bevor das Geraet es fuer ihn tut.
   */
  zeile(farben) {
    const { grau, gelb, rot } = farben;
    const teile = [];

    const faerbe = g => g >= 95 ? rot(`${g} °C`) : g >= 85 ? gelb(`${g} °C`) : `${g} °C`;

    if (this.cpu) teile.push(`${grau('CPU')} ${faerbe(this.cpu.grad)}`);

    for (const g of this.gpus) {
      const zusatz = [
        g.watt !== null ? `${g.watt} W` : null,
        g.luefter !== null ? `Lüfter ${g.luefter} %` : null,
      ].filter(Boolean).join(' ');
      teile.push(`${grau('GPU')} ${faerbe(g.grad)}${zusatz ? grau(` (${zusatz})`) : ''}`);
    }

    return teile.length ? teile.join(grau('  ·  ')) : null;
  }
}
