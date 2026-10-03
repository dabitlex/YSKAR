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
import { writeFile, rename, unlink } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';

import { MAX_COINBASE_OUTPUTS } from '../../src/lib/core/params.ts';
import { MAX_FEE_BPS, MAX_MINERS_JE_BLOCK } from '../../src/lib/pool/settlement.ts';
import { nameToExtra } from '../../src/lib/chain/finderName.ts';
import type { ShareEintrag } from '../../src/lib/pool/pplns.ts';

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
  if (sauber === '') throw new Error('Der Pool braucht einen Namen.');
  nameToExtra(sauber);
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
  const nein = (text: string) => { if (streng) throw new Error(text); };

  if (typeof r.name === 'string') {
    if (r.name.trim() === '') e.name = '';
    else { try { e.name = pruefePoolName(r.name); } catch (f) { nein(`Name des Pools: ${(f as Error).message}`); } }
  }
  if (r.feeBps !== undefined) {
    const n = Number(r.feeBps);
    if (Number.isInteger(n) && n >= 0 && n <= MAX_FEE_BPS && n % GEBUEHR_SCHRITT_BPS === 0) e.feeBps = n;
    else nein('Die Gebühr liegt zwischen 0 und 5 %, in Schritten von 0,25 %.');
  }
  if (r.plaetze !== undefined) {
    const n = Number(r.plaetze);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_COINBASE_OUTPUTS) e.plaetze = n;
    else nein(`Die Zahl der Plätze liegt zwischen 1 und ${MAX_COINBASE_OUTPUTS}.`);
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

/** Mehr Eintraege werden nie geladen -- eine aufgeblaehte Datei soll den Start nicht bremsen. */
const EINTRAEGE_MAX = 500_000;

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/**
 * Nur behalten, was das Fenster noch erreichen kann: von hinten so viele
 * Eintraege, bis `behalten` Arbeit beisammen ist.
 *
 * Der Verlauf im PoolCoordinator raeumt erst nach einem eigenen Blockfund
 * auf. Ein kleiner Pool, der lange keinen findet, wuechse sonst immer weiter.
 */
export function kuerze(eintraege: ShareEintrag[], behalten: bigint): ShareEintrag[] {
  let summe = 0n;
  let ab = eintraege.length;
  while (ab > 0 && summe < behalten) { ab--; summe += eintraege[ab].work; }
  return ab === 0 ? eintraege : eintraege.slice(ab);
}

/**
 * Was vom Pool ueber einen Neustart bleibt.
 *
 * `feeBps`: die Gebuehr, die zuletzt GALT. Eine Aenderung wirkt erst ab dem
 * naechsten Block -- und das soll auch gelten, wenn dazwischen neu gestartet
 * wird. Sonst liesse sich die Gebuehr fuer schon geleistete Arbeit anheben,
 * indem man den Pool einmal aus- und wieder einschaltet.
 */
export interface FensterStand {
  eintraege: ShareEintrag[];
  feeBps: number | null;
  /** Was beim Lesen auffiel -- fuer das Protokoll. */
  hinweis?: string;
}

function alsText(netz: string, feeBps: number, eintraege: ShareEintrag[]): string {
  // Aufeinanderfolgende Shares derselben Adresse stehen in EINER Zeile --
  // die Reihenfolge bleibt, die Datei wird klein.
  const zeilen: [string, string[]][] = [];
  for (const e of eintraege) {
    const adr = hex(e.to);
    const letzte = zeilen[zeilen.length - 1];
    if (letzte && letzte[0] === adr) letzte[1].push(e.work.toString());
    else zeilen.push([adr, [e.work.toString()]]);
  }
  return JSON.stringify({ fassung: 1, netz, feeBps, eintraege: zeilen });
}

/**
 * Das Fenster sichern. Erst daneben schreiben, dann umbenennen.
 *
 * `gilt` wird unmittelbar vor dem Umbenennen gefragt: Hat inzwischen jemand
 * einen neueren Stand geschrieben (beim Anhalten des Pools geschieht das in
 * einem Zug), bleibt der liegen und diese Sicherung wird verworfen.
 *
 * @returns ob die Datei ersetzt wurde
 */
export async function schreibeFenster(pfad: string, netz: string, feeBps: number, eintraege: ShareEintrag[],
                                      gilt: () => boolean = () => true): Promise<boolean> {
  // Eigene Zwischendatei -- nie dieselbe wie schreibeFensterSofort().
  const neben = pfad + '.neu';
  await writeFile(neben, alsText(netz, feeBps, neueste(eintraege)));
  if (!gilt()) { try { await unlink(neben); } catch { /* schon weg */ } return false; }
  await rename(neben, pfad);
  return true;
}

/** Dasselbe in einem Zug -- beim Anhalten, wenn nichts mehr warten kann. */
export function schreibeFensterSofort(pfad: string, netz: string, feeBps: number, eintraege: ShareEintrag[]): void {
  const neben = pfad + '.ende';
  writeFileSync(neben, alsText(netz, feeBps, neueste(eintraege)));
  renameSync(neben, pfad);
}

/** Hoechstens EINTRAEGE_MAX -- und zwar die juengsten: Sie zaehlen zuerst. */
function neueste(eintraege: ShareEintrag[]): ShareEintrag[] {
  return eintraege.length > EINTRAEGE_MAX ? eintraege.slice(eintraege.length - EINTRAEGE_MAX) : eintraege;
}

/**
 * Das gesicherte Fenster lesen. Ein Fenster aus einem anderen Netz gilt nicht.
 *
 * Laesst sich die Datei nicht lesen, bleibt das Fenster leer -- lieber das
 * als eines mit erfundener Arbeit. Die Datei wird dann NICHT ueberschrieben,
 * sondern beiseitegelegt (".unlesbar"), und der Grund steht im Protokoll.
 */
export function leseFenster(pfad: string, netz: string): FensterStand {
  const leer: FensterStand = { eintraege: [], feeBps: null };
  if (!existsSync(pfad)) return leer;
  const verwirf = (grund: string): FensterStand => {
    try { renameSync(pfad, pfad + '.unlesbar'); } catch { /* bleibt liegen */ }
    return { ...leer, hinweis: `gesicherte Arbeit nicht übernommen (${grund}); die Datei liegt als pool-fenster.json.unlesbar daneben.` };
  };
  try {
    const d = JSON.parse(readFileSync(pfad, 'utf8')) as { fassung?: unknown; netz?: unknown; feeBps?: unknown; eintraege?: unknown };
    if (d === null || typeof d !== 'object') return verwirf('kein gültiger Inhalt');
    if (d.fassung !== 1 || !Array.isArray(d.eintraege)) return verwirf('unbekannte Fassung');
    // Ein anderes Netz ist kein Schaden an der Datei -- sie gehoert nur nicht hierher.
    if (d.netz !== netz) return leer;
    const aus: ShareEintrag[] = [];
    for (const z of d.eintraege) {
      if (!Array.isArray(z) || typeof z[0] !== 'string' || !/^[0-9a-f]{40}$/.test(z[0]) || !Array.isArray(z[1])) return verwirf('unlesbarer Eintrag');
      const to = Uint8Array.from(Buffer.from(z[0], 'hex'));
      for (const w of z[1]) {
        if (typeof w !== 'string' || !/^[1-9]\d{0,29}$/.test(w)) return verwirf('unlesbarer Eintrag');
        aus.push({ to, work: BigInt(w) });
      }
    }
    const fee = typeof d.feeBps === 'number' && Number.isInteger(d.feeBps) && d.feeBps >= 0 && d.feeBps <= MAX_FEE_BPS
      ? d.feeBps : null;
    return aus.length > EINTRAEGE_MAX
      ? { eintraege: neueste(aus), feeBps: fee, hinweis: `nur die jüngsten ${EINTRAEGE_MAX} Einträge übernommen.` }
      : { eintraege: aus, feeBps: fee };
  } catch { return verwirf('kein gültiger Inhalt'); }
}

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
