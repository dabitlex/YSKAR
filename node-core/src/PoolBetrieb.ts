/*
 * Einen Pool betreiben: Einstellungen und das Gedaechtnis des Pools.
 *
 * Der Pool selbst ist der PoolCoordinator aus src/lib/pool -- derselbe, der
 * im Kommandozeilen-Knoten laeuft. Hier steht nur, was Node Core dazu
 * braucht: die Einstellungen in einer eigenen Datei und das PPLNS-Fenster
 * ueber einen Neustart hinweg.
 *
 * WARUM DAS FENSTER GESPEICHERT WIRD: Bezahlt wird die Arbeit der letzten
 * Zeit, ueber Blockfunde hinweg. Ein kleiner Pool findet vielleicht einen
 * Block am Tag. Ginge das Fenster bei jedem Neustart verloren -- und ein PC
 * startet oefter neu als ein Server --, haetten alle umsonst gerechnet, die
 * seit dem letzten Fund dabei waren.
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

import { MAX_COINBASE_OUTPUTS } from '../../src/lib/core/params.ts';
import { MAX_FEE_BPS, MAX_MINERS_JE_BLOCK } from '../../src/lib/pool/settlement.ts';
import { nameToExtra } from '../../src/lib/chain/finderName.ts';
import { KernFehler } from './Programm.ts';

export interface BetriebEinstellung {
  /** Der Pool soll laufen, sobald der Knoten laeuft. */
  aktiv: boolean;
  /** Steht in jedem Block des Pools. Druckbares ASCII, 3 bis 32 Zeichen. */
  name: string;
  /** Gebuehr in Basispunkten, 0 bis 500. */
  feeBps: number;
  /** So viele Adressen nimmt der Pool hoechstens auf, 1 bis 64. */
  plaetze: number;
  /** Die Schnittstelle des Knotens auch fuer andere Geraete im eigenen Netz oeffnen. */
  heimnetz: boolean;
}

export const VORGABE_BETRIEB: BetriebEinstellung = {
  aktiv: false, name: '', feeBps: 0, plaetze: MAX_COINBASE_OUTPUTS, heimnetz: false,
};

/** Die Gebuehr laesst sich in Schritten von einem Viertelprozent einstellen. */
export const GEBUEHR_SCHRITT_BPS = 25;

/** Wie viele Adressen die Kette bei dieser Gebuehr je Block auszahlen kann. */
export function platzGrenze(feeBps: number): number {
  return feeBps > 0 ? MAX_MINERS_JE_BLOCK : MAX_COINBASE_OUTPUTS;
}

/** Ist das ein Name, der in einem Block stehen kann? Wirft mit dem Grund. */
export function pruefePoolName(name: string): string {
  const sauber = name.trim();
  if (sauber === '') throw new KernFehler('pool_name_fehlt', 'Der Pool braucht einen Namen.');
  try { nameToExtra(sauber); }
  catch (e) { throw new KernFehler('betrieb_name', `Name des Pools: ${(e as Error).message}`); }
  return sauber;
}

/**
 * Einstellungen uebernehmen -- Feld fuer Feld, auf `basis` aufbauend.
 *
 * `streng`: Eine Eingabe aus der Oberflaeche. Unzulaessiges wird dann mit
 * einer Meldung abgelehnt. Beim Laden der Datei (nicht streng) faellt es
 * still auf den bisherigen Wert zurueck: Eine beschaedigte Datei darf den
 * Start nicht verhindern.
 */
export function pruefeBetrieb(roh: unknown, basis: BetriebEinstellung, streng: boolean): BetriebEinstellung {
  const e = { ...basis };
  if (roh === null || typeof roh !== 'object') return e;
  const r = roh as Record<string, unknown>;
  const nein = (code: string, text: string, werte: (string | number)[] = []) => { if (streng) throw new KernFehler(code, text, werte); };

  if (typeof r.name === 'string') {
    if (r.name.trim() === '') e.name = '';
    else { try { e.name = pruefePoolName(r.name); } catch (f) { nein('betrieb_name', (f as Error).message); } }
  }
  if (r.feeBps !== undefined) {
    const n = Number(r.feeBps);
    if (Number.isInteger(n) && n >= 0 && n <= MAX_FEE_BPS && n % GEBUEHR_SCHRITT_BPS === 0) e.feeBps = n;
    else nein('betrieb_gebuehr', 'Die Gebühr liegt zwischen 0 und 5 %, in Schritten von 0,25 %.');
  }
  if (r.plaetze !== undefined) {
    const n = Number(r.plaetze);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_COINBASE_OUTPUTS) e.plaetze = n;
    else nein('betrieb_plaetze', `Die Zahl der Plätze liegt zwischen 1 und ${MAX_COINBASE_OUTPUTS}.`, [MAX_COINBASE_OUTPUTS]);
  }
  if (typeof r.heimnetz === 'boolean') e.heimnetz = r.heimnetz;
  if (typeof r.aktiv === 'boolean') e.aktiv = r.aktiv;
  return e;
}

export function ladeBetrieb(pfad: string): BetriebEinstellung {
  if (!existsSync(pfad)) return { ...VORGABE_BETRIEB };
  try { return pruefeBetrieb(JSON.parse(readFileSync(pfad, 'utf8')), VORGABE_BETRIEB, false); }
  catch { return { ...VORGABE_BETRIEB }; }
}

export function speichereBetrieb(pfad: string, e: BetriebEinstellung): void {
  const neben = pfad + '.neu';
  writeFileSync(neben, JSON.stringify(e, null, 2));
  renameSync(neben, pfad);
}

// ---------------------------------------------------------------- Fenster

// Liegt jetzt in src/lib/pool/fensterDatei.ts -- der Kommandozeilen-Knoten
// sichert sein Fenster mit demselben Code (Issue #7).
export { kuerze, schreibeFenster, schreibeFensterSofort, leseFenster, type FensterStand }
  from '../../src/lib/pool/fensterDatei.ts';

// ---------------------------------------------------------------- Heimnetz

/**
 * Unter welchen Adressen dieser PC im eigenen Netz zu erreichen ist.
 * Nur private IPv4-Adressen -- eine oeffentliche gehoert nicht in einen
 * Hinweis "im Heimnetz".
 */
export function heimnetzAdressen(): string[] {
  const aus: string[] = [];
  for (const liste of Object.values(networkInterfaces())) {
    for (const a of liste ?? []) {
      if (a.internal || a.family !== 'IPv4') continue;
      const [x, y] = a.address.split('.').map(Number);
      const privat = x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
      if (privat) aus.push(a.address);
    }
  }
  return aus;
}
