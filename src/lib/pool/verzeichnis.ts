/**
 * Das Pool-Verzeichnis: welche Pools die App zur Auswahl anbietet.
 *
 * EINE GEPFLEGTE LISTE, KEINE ANMELDUNG. Ein Pool ist ein Knoten, den man
 * erreichen kann -- die Kette kennt kein Register dafuer, und jeder darf
 * einen betreiben (docs/POOL.md). Die App braucht trotzdem eine
 * Liste, sonst muss jeder die Adresse abtippen. Diese Liste steht hier.
 *
 * Wer nicht darauf steht, ist nicht ausgesperrt: In der App fuehrt "Eigene
 * Adresse" zu jedem Pool-Knoten.
 *
 * Soll die Liste spaeter aus einer Selbstanmeldung kommen, aendert sich nur
 * diese Datei (und woher POOLS stammt). Alles dahinter -- Abfrage, Anzeige,
 * Sperre bei "voll" -- arbeitet mit PoolEintrag und PoolStand.
 *
 * Was die Liste NICHT ist: eine Empfehlung oder eine Pruefung. Gebuehr,
 * Minerzahl und Leistung meldet der Pool selbst.
 */
import { MAX_COINBASE_OUTPUTS } from '../core/params.ts';
import { MAX_FEE_BPS } from './settlement.ts';

export interface PoolEintrag {
  /** Adresse des Pool-Knotens, ohne "https://". */
  host: string;
  /** Anzeigename in der App. */
  name: string;
  /**
   * Name, den der Pool in seine Bloecke schreibt (--pool <name>). Nur
   * noetig, solange der Knoten ihn nicht selbst meldet -- danach gilt, was
   * der Knoten sagt.
   */
  kette?: string;
}

/** Reihenfolge = Reihenfolge in der App. */
export const POOLS: PoolEintrag[] = [
  { host: 'yskar-main.dynv6.net', name: 'YSKAR Main', kette: 'yskar-main.dynv6.net' },
];

/**
 *   offen      nimmt neue Adressen an
 *   voll       alle Plaetze belegt -- gesperrt, ausser man ist schon dabei
 *   unbekannt  antwortet, meldet aber keine Plaetze (aelterer Knoten);
 *              waehlbar wie bisher, nur ohne Zahlen
 *   keinPool   unter der Adresse antwortet etwas, aber kein Pool
 *   aus        antwortet nicht
 */
export type PoolStatus = 'offen' | 'voll' | 'unbekannt' | 'keinPool' | 'aus';

export interface PoolStand {
  host: string;
  name: string;
  /** Name in den Bloecken dieses Pools; null, wenn nicht bekannt. */
  kette: string | null;
  status: PoolStatus;
  /** Belegte Plaetze (Adressen, nicht Geraete). */
  belegt: number | null;
  plaetze: number | null;
  frei: number | null;
  /** Summe der gemessenen Leistung, H/s. */
  hashrate: number | null;
  /** Gebuehr in Basispunkten. */
  feeBps: number | null;
  /** Gefundene Bloecke laut Kette, gezaehlt ueber den Namen. */
  bloecke: number | null;
  /** Nur bei einer Abfrage mit Adresse: Hat sie schon einen Platz? */
  dabei?: boolean;
}

const ganz = (x: unknown, min: number, max: number): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Finder-Name, wie er in einem Block stehen kann: druckbares ASCII, 3 bis 32. */
function kettenName(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const s = x.trim();
  return s.length >= 3 && s.length <= 32 && /^[\x20-\x7e]+$/.test(s) ? s : null;
}

/**
 * Aus der Antwort eines Pool-Knotens auf GET /api/v2/pool einen Stand machen.
 *
 * Die Antwort kommt von einem fremden Rechner. Jede Zahl wird deshalb
 * geprueft und sonst verworfen -- eine "Leistung" von 1e400 oder "-3 Plaetze
 * frei" soll nie auf dem Schirm landen.
 *
 * @param http  Statuscode, oder null, wenn gar keine Antwort kam
 * @param body  der gelesene JSON-Rumpf (oder irgendetwas anderes)
 */
export function standAusAntwort(eintrag: PoolEintrag, http: number | null, body: unknown): PoolStand {
  const leer: PoolStand = {
    host: eintrag.host, name: eintrag.name, kette: eintrag.kette ?? null,
    status: 'aus', belegt: null, plaetze: null, frei: null,
    hashrate: null, feeBps: null, bloecke: null,
  };
  if (http === null) return leer;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  if (http === 404) {
    // Ein Knoten ohne Pool sagt "pool_unavailable". Ein aelterer Knoten
    // kennt die Route nicht und sagt "not_found" -- er kann trotzdem einen
    // Pool betreiben, nur erfaehrt man es erst beim Anmelden.
    if (b.error === 'pool_unavailable') return { ...leer, status: 'keinPool' };
    if (b.error === 'not_found') return { ...leer, status: 'unbekannt' };
    return leer;
  }
  if (http !== 200) return leer;

  const plaetze = ganz(b.plaetze, 1, MAX_COINBASE_OUTPUTS);
  // `belegt` kann kurz ueber `plaetze` liegen (Gebuehr angekuendigt: ein
  // Platz weniger). Angezeigt wird hoechstens "voll".
  const belegtRoh = ganz(b.belegt, 0, 1_000_000);
  const feeBps = ganz(b.feeBps, 0, MAX_FEE_BPS);
  const hashrate = typeof b.hashrate === 'number' && Number.isFinite(b.hashrate) && b.hashrate >= 0
    ? b.hashrate : null;
  const kette = kettenName(b.name) ?? eintrag.kette ?? null;

  if (plaetze === null || belegtRoh === null) {
    // 200, aber keine Plaetze: Das ist kein Pool-Knoten -- eher irgendein
    // Webserver unter dieser Adresse. (Ein aelterer Knoten antwortet mit
    // 404, siehe oben; einen, der 200 ohne Plaetze liefert, gab es nie.)
    return { ...leer, status: 'keinPool' };
  }
  const belegt = Math.min(belegtRoh, plaetze);
  const stand: PoolStand = {
    ...leer, kette,
    status: belegt >= plaetze ? 'voll' : 'offen',
    belegt, plaetze, frei: plaetze - belegt, hashrate, feeBps,
  };
  if (typeof b.dabei === 'boolean') stand.dabei = b.dabei;
  return stand;
}

/** Darf man diesen Pool waehlen und dort anfangen? */
export function waehlbar(s: Pick<PoolStand, 'status' | 'dabei'>): boolean {
  if (s.status === 'offen' || s.status === 'unbekannt') return true;
  return s.status === 'voll' && s.dabei === true;
}

/**
 * Welchen Pool die App vorschlaegt, solange niemand gewaehlt hat: den ersten
 * offenen der Liste, sonst den ersten, der wenigstens antwortet.
 */
export function vorschlag(pools: PoolStand[]): PoolStand | null {
  return pools.find(p => p.status === 'offen')
      ?? pools.find(p => p.status === 'unbekannt')
      ?? null;
}

/**
 * Eine eingetippte Pool-Adresse saeubern: ohne "https://", ohne Schraegstrich
 * am Ende, Rechnername klein. Liefert null, wenn das keine Adresse sein kann.
 *
 * Angenommen wird, was useMining auch bisher annahm: Rechnername oder
 * IP-Adresse (auch IPv6 in eckigen Klammern), wahlweise mit Port und mit
 * einem Pfad davor ("pool.example.net/yskar"). "http://" bleibt erhalten --
 * fuer einen Pool im eigenen Netz; alles andere laeuft ueber HTTPS.
 */
export function hostAusEingabe(roh: string): string | null {
  const t = roh.trim().replace(/\/+$/, '');
  if (t === '' || /\s/.test(t)) return null;
  const m = /^(https?:\/\/)?(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:\d{1,5})?((?:\/[A-Za-z0-9._~%-]+)*)$/i.exec(t);
  if (!m) return null;
  // "." und ".." als Pfadabschnitt wuerde der Browser stillschweigend
  // aufloesen -- dann ginge die Anfrage woandershin, als dasteht.
  if ((m[5] ?? '').split('/').some(a => a === '.' || a === '..')) return null;
  const schema = (m[1] ?? '').toLowerCase();
  const rest = m[2].toLowerCase() + (m[4] ?? '') + (m[5] ?? '');
  return schema === 'http://' ? schema + rest : rest;
}

/** Basis-URL eines Pools, wie useMining sie bildet. */
export function poolBasis(host: string): string {
  const t = host.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(t) ? t : 'https://' + t;
}
