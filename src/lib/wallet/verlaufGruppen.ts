/**
 * Verlauf in Tage gliedern und Mining-Ertraege buendeln.
 *
 * Wer im Pool mint, bekommt mit jedem Block des Pools einen Eintrag -- an
 * einem Tag leicht zehn oder mehr. Zwischen ihnen gehen Ueberweisungen
 * unter. Deshalb stehen die Mining-Ertraege eines Tages in EINER Zeile
 * (Anzahl und Summe), aufklappbar bis zum einzelnen Block. Ueberweisungen
 * bleiben einzeln.
 *
 * Reine Rechnung, ohne Oberflaeche -- damit sie sich pruefen laesst.
 */

export interface Posten {
  txid: string;
  height: number;
  idx?: number;
  timestamp: string | null;
  kind: 'reward' | 'pool' | 'in' | 'out';
  amount: string;
  /** Pool-Anteil: wie viele sich den Block geteilt haben. */
  shares?: number;
}

export type Zeile<T extends Posten> =
  | { art: 'einzeln'; eintrag: T }
  | { art: 'mining'; schluessel: string; eintraege: T[]; summe: bigint; pool: number; solo: number };

export interface Tag<T extends Posten> {
  /** "JJJJ-MM-TT" in Ortszeit; "" fuer Eintraege ohne Zeit. */
  schluessel: string;
  zeilen: Zeile<T>[];
}

const istMining = (e: Posten) => e.kind === 'reward' || e.kind === 'pool';

/** Ortszeit-Tag eines Unix-Zeitstempels in Sekunden. */
export function tagSchluessel(ts: string | number | null): string {
  if (ts == null || ts === '') return '';
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

function betrag(e: Posten): bigint {
  try { return BigInt(e.amount); } catch { return 0n; }
}

/**
 * @param eintraege  neueste zuerst (so liefert sie der Server)
 * @param tagVon     Tag eines Zeitstempels; austauschbar, damit Tests nicht
 *                   von der Zeitzone des Rechners abhaengen
 *
 * @param buendeln   false: nur nach Tagen gliedern (Suchtreffer -- wer nach
 *                   einem Block sucht, will ihn sehen, nicht aufklappen)
 *
 * Ein einzelner Mining-Ertrag an einem Tag bleibt eine gewoehnliche Zeile:
 * Ein Buendel aus einem Eintrag waere nur ein Tipp mehr.
 */
export function gruppiere<T extends Posten>(
  eintraege: T[], tagVon: (ts: string | number | null) => string = tagSchluessel,
  buendeln = true,
): Tag<T>[] {
  const tage: Tag<T>[] = [];
  const mining = new Map<string, T[]>();

  for (const e of eintraege) {
    const schluessel = tagVon(e.timestamp);
    let tag = tage[tage.length - 1];
    if (!tag || tag.schluessel !== schluessel) {
      tag = { schluessel, zeilen: [] };
      tage.push(tag);
    }
    if (!buendeln || !istMining(e)) { tag.zeilen.push({ art: 'einzeln', eintrag: e }); continue; }

    // Tage koennen in der Liste nur am Stueck stehen (sortiert nach Block),
    // der Schluessel je Tag-Abschnitt ist deshalb eindeutig.
    const k = `${tage.length}:${schluessel}`;
    const liste = mining.get(k);
    if (liste) { liste.push(e); continue; }
    const neu = [e];
    mining.set(k, neu);
    // Platzhalter an der Stelle des neuesten Ertrags; unten aufgeloest.
    tag.zeilen.push({ art: 'mining', schluessel: `mining-${schluessel}`, eintraege: neu, summe: 0n, pool: 0, solo: 0 });
  }

  for (const tag of tage) {
    tag.zeilen = tag.zeilen.map(z => {
      if (z.art !== 'mining') return z;
      if (z.eintraege.length === 1) return { art: 'einzeln', eintrag: z.eintraege[0] };
      let summe = 0n, pool = 0, solo = 0;
      for (const e of z.eintraege) {
        summe += betrag(e);
        // Ein Block, den man sich mit niemandem geteilt hat, ist ein eigener Fund.
        if (e.kind === 'pool' && (e.shares ?? 2) > 1) pool++; else solo++;
      }
      return { ...z, summe, pool, solo };
    });
  }
  return tage;
}
