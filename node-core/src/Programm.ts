/*
 * Was zum Programm gehoert und nicht zum Knoten: die Verbindung zur
 * Windows-Huelle, die Suche nach einer neuen Version, die Protokolldatei.
 */
import { appendFile } from 'node:fs/promises';
import { existsSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fehler mit Kuerzel. Der Text ist deutsch; die Oberflaeche zeigt zu einem
 * bekannten Kuerzel ihren eigenen Text in der gewaehlten Sprache und setzt
 * `werte` in die Platzhalter ein.
 */
export class KernFehler extends Error {
  code: string;
  werte: (string | number)[];
  constructor(code: string, text: string, werte: (string | number)[] = []) {
    super(text); this.code = code; this.werte = werte;
  }
}

/**
 * Was nur die Desktop-Huelle (Electron) kann: Dialoge von Windows, den
 * Explorer oeffnen, den Start mit Windows einrichten.
 *
 * Die Oberflaeche spricht NICHT direkt mit der Huelle. Sie fragt den lokalen
 * Server -- geschuetzt wie alles andere durch den Zugangsschluessel --, und
 * der reicht die Bitte weiter. So bleibt das Fenster eine gewoehnliche,
 * abgeschottete Seite ohne Zugriff auf das System.
 *
 * Ohne Huelle (Tests, Start aus dem Quellbaum) fehlen diese Dinge einfach,
 * und die Oberflaeche zeigt sie nicht an.
 */
export interface Huelle {
  /** Einen Ordner waehlen lassen. null = abgebrochen. */
  waehleOrdner(start: string): Promise<string | null>;
  /** Einen Ordner im Explorer oeffnen. */
  oeffneOrdner(pfad: string): Promise<void>;
  /** Eine Adresse im Browser des Nutzers oeffnen. */
  oeffneLink(url: string): Promise<void>;
  /** Startet das Programm mit Windows? */
  autostart(): boolean;
  setzeAutostart(an: boolean): void;
  /** Kann das Fenster in den Infobereich verschwinden? Nur dann gilt "beim Schliessen weiterlaufen". */
  infobereich(): boolean;
  /** Das Programm ordentlich beenden. */
  beenden(): void;
}

/**
 * Adressen, die das Programm im Browser oeffnen darf.
 *
 * Eine feste Liste, keine Pruefung "sieht harmlos aus": Die Oberflaeche zeigt
 * auch Texte, die aus dem Netz stammen. Kaeme darueber je eine Adresse in
 * einen Link, soll sie nicht aufgehen.
 */
export function linkErlaubt(roh: unknown): string | null {
  if (typeof roh !== 'string' || roh.length > 300) return null;
  let u: URL;
  try { u = new URL(roh); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  if (u.hostname === 'github.com') {
    return /^\/dabitlex\/YSKAR(\/|$)/.test(u.pathname) ? u.href : null;
  }
  return ['www.yskar.app', 'yskar.app', 'yskar.vercel.app'].includes(u.hostname) ? u.href : null;
}

// ------------------------------------------------------------- Neue Version

export const RELEASES_SEITE = 'https://github.com/dabitlex/YSKAR/releases';
export const RELEASES_ABFRAGE = 'https://api.github.com/repos/dabitlex/YSKAR/releases?per_page=30';
/** So heissen die Veroeffentlichungen des Node Core: node-core-v1.2.3 */
const MARKE = /^node-core-v(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
const ANTWORT_MAX = 1024 * 1024;

export interface UpdateStand {
  /** Wann zuletzt gesucht wurde; null = noch nie. */
  geprueft: number | null;
  /** Neueste veroeffentlichte Version; null, wenn keine gefunden wurde. */
  neueste: string | null;
  /** Ist sie neuer als die installierte? */
  neuer: boolean;
  /** Seite zum Herunterladen. */
  url: string;
  fehler: string | null;
}

/**
 * Nur eine Seite unter den Veroeffentlichungen dieses Projekts -- nach dem
 * Aufloesen von "..": Ein Pfad, der mit dem richtigen Anfang beginnt und
 * dann hinausklettert, zaehlt nicht.
 */
function releaseSeite(roh: unknown): string | null {
  const url = linkErlaubt(roh);
  if (!url) return null;
  const u = new URL(url);
  return u.hostname === 'github.com' && u.pathname.startsWith('/dabitlex/YSKAR/releases/') && !u.search && !u.hash
    ? u.href : null;
}

function teile(v: string): number[] | null {
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** > 0: a ist neuer als b. */
export function vergleiche(a: string, b: string): number {
  const x = teile(a), y = teile(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * Bei GitHub nachsehen, ob es eine neuere Version gibt.
 *
 * Es wird nur NACHGESEHEN. Heruntergeladen oder installiert wird nichts --
 * das macht der Nutzer selbst, mit dem Installer von der Seite der
 * Veroeffentlichungen. Wirft nie; ein Fehler steht im Ergebnis.
 */
export async function sucheUpdate(installiert: string, quelle: string, agent: string): Promise<UpdateStand> {
  const stand: UpdateStand = { geprueft: Date.now(), neueste: null, neuer: false, url: RELEASES_SEITE, fehler: null };
  try {
    const res = await fetch(quelle, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': agent },
      signal: AbortSignal.timeout(8_000),
      redirect: 'error',
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const teileRoh: Uint8Array[] = [];
    let laenge = 0;
    const leser = res.body!.getReader();
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      laenge += value.length;
      if (laenge > ANTWORT_MAX) { try { await leser.cancel(); } catch { /* schon zu */ } throw new Error('Antwort zu groß'); }
      teileRoh.push(value);
    }
    const liste: unknown = JSON.parse(Buffer.concat(teileRoh).toString('utf8'));
    if (!Array.isArray(liste)) throw new Error('unerwartete Antwort');

    for (const e of liste) {
      if (e === null || typeof e !== 'object') continue;
      const r = e as Record<string, unknown>;
      // Entwuerfe und Vorabversionen zaehlen nicht.
      if (r.draft === true || r.prerelease === true || typeof r.tag_name !== 'string') continue;
      const m = MARKE.exec(r.tag_name);
      if (!m) continue;
      const version = `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}`;
      if (stand.neueste !== null && vergleiche(version, stand.neueste) <= 0) continue;
      stand.neueste = version;
      // Nur eine Adresse auf der Seite der Veroeffentlichungen dieses Projekts.
      stand.url = releaseSeite(r.html_url) ?? RELEASES_SEITE;
    }
    stand.neuer = stand.neueste !== null && vergleiche(stand.neueste, installiert) > 0;
    if (!stand.neuer) stand.url = RELEASES_SEITE;
  } catch (e) {
    stand.fehler = (e as Error).message;
  }
  return stand;
}

// ---------------------------------------------------------------- Protokoll

const PROTOKOLL_MAX = 2 * 1024 * 1024;

/**
 * Protokoll als Datei -- fuer den Fall, dass jemand Hilfe braucht und zeigen
 * soll, was geschah. Wird sie zu gross, beginnt eine neue; die vorige bleibt
 * als ".alt" liegen. Ein Schreibfehler haelt nie etwas auf.
 */
export class Protokoll {
  readonly pfad: string;
  private kette: Promise<void> = Promise.resolve();
  private geschrieben = 0;

  constructor(pfad: string) {
    this.pfad = pfad;
    try {
      if (existsSync(pfad)) {
        this.geschrieben = statSync(pfad).size;
        if (this.geschrieben > PROTOKOLL_MAX) this.wechsle();
      }
    } catch { /* dann eben ohne Vorgeschichte */ }
  }

  private wechsle(): void {
    try { renameSync(this.pfad, this.pfad + '.alt'); } catch { /* bleibt liegen */ }
    this.geschrieben = 0;
  }

  schreibe(zeile: string): void {
    const text = `${new Date().toISOString()} ${zeile.replace(/[\r\n]+/g, ' ')}\n`;
    this.kette = this.kette.then(async () => {
      if (this.geschrieben + text.length > PROTOKOLL_MAX) this.wechsle();
      await appendFile(this.pfad, text);
      this.geschrieben += Buffer.byteLength(text);
    }).catch(() => { /* Platte voll, Ordner weg -- das Programm laeuft weiter */ });
  }

  /** Wartet, bis alles geschrieben ist -- fuer Tests und das Beenden. */
  fertig(): Promise<void> { return this.kette; }
}

/** Wie viel Platz die Dateien in einem Ordner belegen -- ohne Unterordner. */
export function ordnerBytes(ordner: string): number | null {
  try {
    let summe = 0;
    for (const name of readdirSync(ordner)) {
      try { const s = statSync(join(ordner, name)); if (s.isFile()) summe += s.size; } catch { /* gerade geloescht */ }
    }
    return summe;
  } catch { return null; }
}
