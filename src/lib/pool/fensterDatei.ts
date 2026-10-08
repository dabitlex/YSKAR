/**
 * Das PPLNS-Fenster eines Pools auf der Platte -- damit ein Neustart die
 * geleistete Arbeit nicht verwirft.
 *
 * Gemeinsam fuer Node Core und den Kommandozeilen-Knoten (Issue #7). Bis
 * dahin konnte nur Node Core sein Fenster sichern; der oeffentliche Pool
 * laeuft aber auf dem Kommandozeilen-Knoten und begann nach jedem Neustart
 * mit einem leeren Fenster: Der erste Block ging ganz an die Sitzung, die
 * den ersten Job geholt hatte.
 *
 * Inhalt unveraendert aus node-core/src/PoolBetrieb.ts uebernommen; dieselbe
 * Dateifassung (1), damit vorhandene Dateien lesbar bleiben.
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { writeFile, rename, unlink } from 'node:fs/promises';

import { MAX_FEE_BPS } from './settlement.ts';
import type { ShareEintrag } from './pplns.ts';


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
