'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POOLS, vorschlag, waehlbar, type PoolStand } from '@/lib/pool/verzeichnis';
import { poolFragen } from '@/lib/pool/abfrage';

/**
 * Pool-Auswahl der App: welcher Pool gewaehlt ist, wie es um ihn steht, und
 * die Pruefung unmittelbar vor dem Start.
 *
 * Sitzt NEBEN dem Mining, nicht darin. useMining bekommt wie bisher nur eine
 * Adresse (`m.start(worker, 'pool', host)`) und weiss von alledem nichts --
 * dort aendert sich keine Zeile.
 *
 *   Liste       GET /api/v2/pools (eigener Server, fragt die Pools der Liste)
 *   Vor Start   GET https://<pool>/api/v2/pool?address=…  (direkt am Pool)
 *
 * Die zweite Abfrage ist die, auf die es ankommt: Sie ist frisch, und nur
 * sie weiss, ob die eigene Adresse schon einen Platz hat. Die eigentliche
 * Sperre sitzt ohnehin im Pool-Knoten -- ein voller Pool lehnt die
 * Anmeldung selbst ab. Hier wird nur dafuer gesorgt, dass man das VOR dem
 * Start erfaehrt, und in der eigenen Sprache.
 */

export interface PoolWahl {
  host: string;
  /** Von Hand eingetragene Adresse, nicht aus der Liste. */
  eigen: boolean;
}

const WAHL = 'yskar.pool';
const MODUS = 'yskar.mining.modus';
/** Abstand zwischen zwei Abfragen der Liste, solange sie zu sehen ist. */
const TAKT_MS = 20_000;
/** So lange wartet die App auf einen Pool, bevor sie ohne Antwort weitermacht. */
const WARTEN_MS = 4_000;

function wahlLesen(): PoolWahl | null {
  try {
    const w = JSON.parse(localStorage.getItem(WAHL) ?? 'null');
    return w && typeof w.host === 'string' && w.host.trim() !== ''
      ? { host: w.host, eigen: w.eigen === true } : null;
  } catch { return null; }
}

function merken(schluessel: string, wert: string | null): void {
  try {
    if (wert === null) localStorage.removeItem(schluessel);
    else localStorage.setItem(schluessel, wert);
  } catch { /* privates Fenster: dann eben nur fuer diese Sitzung */ }
}

/** Einen Pool direkt fragen. Kommt keine Antwort, ist der Stand "aus". */
export const poolDirekt = (host: string, address: string | null): Promise<PoolStand> =>
  poolFragen({ host, name: host }, { address, wartenMs: WARTEN_MS });

export type PoolHinweis = null | 'voll' | 'keinPool';

/** Sofort und dann alle TAKT_MS -- aber nur, solange die App zu sehen ist. */
function takt(an: boolean, tun: () => void): (() => void) | undefined {
  if (!an) return;
  const tick = () => { if (!document.hidden) tun(); };
  tick();
  const id = setInterval(tick, TAKT_MS);
  document.addEventListener('visibilitychange', tick);
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
}

export function usePoolAuswahl({ address, sichtbar, mining, fehler, stop }: {
  address: string | null;
  /** Der Mining-Reiter ist zu sehen. */
  sichtbar: boolean;
  mining: boolean;
  /** Fehlertext des Minings -- nur gelesen. */
  fehler: string | null;
  stop: () => void | Promise<void>;
}) {
  const [modus, setModusRoh] = useState<'solo' | 'pool'>('solo');
  const [wahl, setWahl] = useState<PoolWahl | null>(null);
  const [liste, setListe] = useState<PoolStand[] | null>(null);
  const [stand, setStand] = useState<number | null>(null);
  const [listeFehler, setListeFehler] = useState(false);
  /** Stand eines Pools, den die App selbst fragt: eigene Adresse, oder die Liste fehlt. */
  const [eigen, setEigen] = useState<PoolStand | null>(null);
  /** Frische Antwort des gewaehlten Pools (Pruefung vor dem Start). */
  const [frisch, setFrisch] = useState<PoolStand | null>(null);
  const [hinweis, setHinweis] = useState<PoolHinweis>(null);
  const [prueft, setPrueft] = useState(false);
  /**
   * Die Fehlermeldung des Minings, die schon da war, als zuletzt ein neuer
   * Stand kam. Eine Ablehnung "Pool voll" von vorhin sagt nichts mehr, wenn
   * der Pool seither freie Plaetze meldet.
   */
  const [ueberholt, setUeberholt] = useState<string | null>(null);
  const fehlerRef = useRef(fehler); fehlerRef.current = fehler;
  useEffect(() => { if (!fehler) setUeberholt(null); }, [fehler]);

  // Gemerkte Wahl erst im Browser lesen, nicht beim Rendern auf dem Server.
  useEffect(() => {
    setWahl(wahlLesen());
    try { if (localStorage.getItem(MODUS) === 'pool') setModusRoh('pool'); } catch { /* solo */ }
  }, []);

  const setModus = useCallback((v: 'solo' | 'pool') => {
    setModusRoh(v);
    setHinweis(null);
    merken(MODUS, v);
  }, []);

  const adr = useRef(address); adr.current = address;

  const listeRef = useRef(liste); listeRef.current = liste;
  /** Der Pool, um den es gerade geht (gewaehlt oder vorgeschlagen) -- unten gesetzt. */
  const zielRef = useRef<string | null>(null);
  /** Die Liste ist aufgeklappt: Der Nutzer sucht sich gerade einen Pool aus. */
  const [blatt, setBlatt] = useState(false);
  const blattRef = useRef(blatt); blattRef.current = blatt;

  /**
   * Pools selbst fragen und die Antwort ueber den Listenstand legen.
   *
   * Die eigene Adresse geht dabei nur an den Pool, den man gewaehlt hat --
   * und, solange die Liste aufgeklappt ist, an die vollen: Nur so erfaehrt
   * man, dass man dort mit einem anderen Geraet schon dabei ist und den Pool
   * waehlen darf. Im Hintergrund bekommt kein fremder Pool die Adresse.
   *
   * @param alle  false: nur Pools, die laut Liste voll sind oder nicht
   *              antworten. true: jeden -- die Liste selbst ist nicht zu haben.
   */
  const nachfragen = useCallback((pools: PoolStand[], alle: boolean) => Promise.all(pools.map(async p => {
    if (!alle && p.status !== 'voll' && p.status !== 'aus') return p;
    const mitAdresse = p.host === zielRef.current || (blattRef.current && p.status === 'voll');
    const d = await poolDirekt(p.host, mitAdresse ? adr.current : null);
    if (d.status !== 'aus') return { ...p, ...d, name: p.name, kette: d.kette ?? p.kette, bloecke: p.bloecke };
    // Antwortet er auch dem Telefon nicht, bleibt der Listenstand -- es sei
    // denn, es gibt keinen aktuellen: Dann ist "antwortet nicht" die Wahrheit.
    return alle ? { ...p, status: 'aus' as const, belegt: null, plaetze: null, frei: null,
                    hashrate: null, feeBps: null, dabei: undefined } : p;
  })), []);

  /**
   * Liste holen. Wo sie "voll" oder "antwortet nicht" sagt, fragt die App den
   * Pool selbst noch einmal:
   *
   * - voll: Die Liste ist bis zu 20 Sekunden alt. Ein Pool, der laengst
   *   wieder Platz hat, darf nicht gesperrt bleiben.
   * - antwortet nicht: Das heisst nur, dass der SERVER ihn nicht erreicht
   *   hat. Das Telefon erreicht ihn vielleicht -- und dorthin geht das Mining.
   *
   * Antwortet der Pool dem Telefon, gilt seine Antwort.
   *
   * Faellt der eigene Server aus, wird die Liste von vorhin nicht
   * weitergezeigt, als waere sie frisch: Dann fragt die App jeden ihrer Pools
   * selbst. Sonst bliebe ein "voll" von vorhin stehen, bis der Server
   * zurueck ist -- und mit ihm die Sperre.
   */
  const laden = useCallback(async () => {
    const uebernehmen = (pools: PoolStand[], sekunden: number) => {
      setListe(pools);
      setStand(sekunden);
      // Ab hier traegt die Liste den Stand; eine aeltere Einzelantwort und
      // der Hinweis dazu gelten nicht mehr.
      setFrisch(null);
      setHinweis(null);
      setUeberholt(fehlerRef.current);
    };
    try {
      const res = await fetch('/api/v2/pools', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json() as { stand?: number; pools?: PoolStand[] };
      if (!Array.isArray(body.pools)) throw new Error('keine Liste');
      const pools = await nachfragen(body.pools, false);
      uebernehmen(pools, typeof body.stand === 'number' ? body.stand : Math.floor(Date.now() / 1000));
      setListeFehler(false);
    } catch {
      setListeFehler(true);
      const alt = listeRef.current;
      if (alt) uebernehmen(await nachfragen(alt, true), Math.floor(Date.now() / 1000));
    }
  }, [nachfragen]);

  const aktiv = sichtbar && modus === 'pool';
  /*
    "Eigene Adresse" ist, was NICHT in der Liste steht -- egal, wie die Wahl
    einmal gemerkt wurde. Wer eine Adresse der Liste von Hand eintippt,
    waehrend die Liste gerade fehlt, hat den Pool aus der Liste gewaehlt.
  */
  const wahlEigen = !!wahl && wahl.eigen
    && !liste?.some(p => p.host === wahl.host) && !POOLS.some(p => p.host === wahl.host);
  /*
    Wen die App selbst fragen muss: eine von Hand eingetragene Adresse -- und
    den gemerkten Pool, wenn es (noch) gar keine Liste gibt und der eigene
    Server fehlt. Ohne das Zweite stuende dort nur "wird geprueft".
  */
  const eigenHost = wahl && (wahlEigen || (liste === null && listeFehler)) ? wahl.host : null;

  const eigenRef = useRef(eigenHost); eigenRef.current = eigenHost;
  const eigenLaden = useCallback(async () => {
    if (!eigenHost) { setEigen(null); return; }
    const s = await poolDirekt(eigenHost, adr.current);
    // Inzwischen eine andere Adresse eingetragen? Dann ist das die Antwort
    // auf eine Frage, die niemand mehr stellt.
    if (eigenRef.current !== eigenHost) return;
    setEigen(s);
    setFrisch(null);
    setHinweis(null);
    setUeberholt(fehlerRef.current);
  }, [eigenHost]);

  // Zwei Takte, getrennt: Aendert sich, wen die App selbst fragen muss, soll
  // das nicht die Liste ein weiteres Mal holen.
  useEffect(() => takt(aktiv, laden), [aktiv, laden]);
  // Klappt die Liste auf, soll sie nicht bis zu 20 Sekunden alt sein.
  useEffect(() => { if (blatt) laden(); }, [blatt, laden]);
  useEffect(() => takt(aktiv && !!eigenHost, eigenLaden), [aktiv, eigenHost, eigenLaden]);

  // Wechselt die eigene Adresse, gilt der alte Stand nicht mehr.
  useEffect(() => { setEigen(null); setFrisch(null); }, [eigenHost]);

  /**
   * Der Pool, um den es geht: der gewaehlte -- oder, solange niemand gewaehlt
   * hat, der erste offene der Liste.
   */
  const gewaehlt = useMemo((): {
    host: string; eigen: boolean;
    /** Anzeigename: aus der Liste; bei einer eigenen Adresse die Adresse selbst. */
    name: string;
    stand: PoolStand | null;
  } | null => {
    if (wahl) {
      const ausListe = wahlEigen ? null : liste?.find(p => p.host === wahl.host) ?? null;
      let s = ausListe ?? (eigen && eigen.host === wahl.host ? eigen : null);
      // Die Pruefung vor dem Start ist frischer als die Liste.
      if (frisch && frisch.host === wahl.host) {
        s = s ? { ...s, ...frisch, name: s.name, kette: frisch.kette ?? s.kette, bloecke: s.bloecke } : frisch;
      }
      const name = wahlEigen ? wahl.host
        : ausListe?.name ?? POOLS.find(p => p.host === wahl.host)?.name ?? wahl.host;
      return { host: wahl.host, eigen: wahlEigen, name, stand: s };
    }
    const v = liste ? vorschlag(liste) : null;
    return v ? { host: v.host, eigen: false, name: v.name, stand: v } : null;
  }, [wahl, wahlEigen, liste, eigen, frisch]);
  zielRef.current = gewaehlt?.host ?? null;

  const waehlen = useCallback((w: PoolWahl) => {
    setWahl(w);
    setFrisch(null);
    setHinweis(null);
    merken(WAHL, JSON.stringify(w));
  }, []);

  /**
   * Unmittelbar vor dem Start: Ist noch Platz?
   *
   * true  = starten. Auch dann, wenn der Pool nicht antwortet oder ein
   *         aelterer Knoten die Frage nicht kennt -- dann laeuft es wie
   *         bisher, und der Pool entscheidet beim Anmelden.
   * false = nicht starten; `hinweis` sagt, warum.
   */
  const pruefen = useCallback(async (): Promise<boolean> => {
    if (!gewaehlt) return false;
    setHinweis(null);
    setPrueft(true);
    try {
      const s = await poolDirekt(gewaehlt.host, adr.current);
      if (s.status !== 'aus') setFrisch(s);
      if (s.status === 'keinPool') { setHinweis('keinPool'); return false; }
      if (s.status === 'voll' && !waehlbar(s)) { setHinweis('voll'); return false; }
      // Wer mit einem Pool anfaengt, hat ihn gewaehlt -- auch den vorgeschlagenen.
      if (!wahl) waehlen({ host: gewaehlt.host, eigen: gewaehlt.eigen });
      return true;
    } finally {
      setPrueft(false);
    }
  }, [gewaehlt, wahl, waehlen]);

  /*
    Der Pool hat abgelehnt -- oder die Sitzung ist weg.

    Zwei Faelle, eine Frage an den Pool:

    1. Die Anmeldung wurde mit "pool_full" abgelehnt. Das passiert, wenn der
       letzte Platz zwischen Pruefung und Anmeldung vergeben wurde. Dann soll
       das Feld den wahren Stand zeigen, nicht mehr "offen".
    2. Waehrend des Minings ist die Sitzung verloren gegangen und der Pool
       inzwischen voll. Dann rechnet das Geraet ins Leere -- Shares werden
       abgelehnt, ausgezahlt wird nichts.

    Angehalten wird NUR, wenn der Pool es ausdruecklich bestaetigt: voll und
    diese Adresse nicht dabei. Antwortet er nicht, bleibt alles, wie es ist.
  */
  const stopRef = useRef(stop); stopRef.current = stop;
  const host = gewaehlt?.host ?? null;
  useEffect(() => {
    if (modus !== 'pool' || !host || !fehler) return;
    const abgelehnt = /pool_full/.test(fehler);
    if (!abgelehnt && !(mining && /session_inactive/.test(fehler))) return;
    let abgebrochen = false;
    const fragen = () => poolDirekt(host, adr.current).then(s => {
      if (abgebrochen || s.status !== 'voll' || s.dabei !== false) return;
      setFrisch(s);
      setHinweis('voll');
      if (mining) stopRef.current();
    });
    fragen();
    // Solange das Geraet ins Leere rechnet, weiter nachfragen: Eine einzige
    // Abfrage, die im Netz haengen bleibt, darf nicht die letzte gewesen sein.
    const id = mining ? setInterval(fragen, 30_000) : null;
    return () => { abgebrochen = true; if (id) clearInterval(id); };
  }, [mining, modus, host, fehler]);

  return {
    modus, setModus,
    /** null, solange weder gewaehlt noch ein Vorschlag da ist. */
    gewaehlt,
    waehlen,
    liste, stand, listeFehler, eigen,
    neuLaden: laden,
    /** Die Liste (das Blatt "Pool waehlen") ist aufgeklappt. */
    blatt, setBlatt,
    pruefen, prueft,
    hinweis,
    ueberholt,
    /** Start gesperrt: Der gewaehlte Pool ist bekanntermassen voll oder betreibt keinen Pool. */
    gesperrt: !!gewaehlt?.stand && !waehlbar(gewaehlt.stand) && gewaehlt.stand.status !== 'aus',
  };
}

export type PoolAuswahl = ReturnType<typeof usePoolAuswahl>;
