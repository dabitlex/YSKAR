'use client';

import type { Summary, Account } from '@/hooks/useMining';

/**
 * Vorladen waehrend des Startbilds.
 *
 * Ohne das erschien die App mit Guthaben "0,0000" und "verbinde…" und
 * sprang eine Sekunde spaeter auf die echten Zahlen. Das Startbild steht
 * ohnehin gut eine Sekunde -- Zeit genug, Kennzahlen und Konto schon zu
 * holen. Die Adresse ist auch bei gesperrtem Tresor bekannt, deshalb geht
 * das vor der PIN-Eingabe.
 *
 * useMining startet mit diesen Werten und liest danach wie gewohnt weiter.
 * Ein Fehlschlag hier ist keiner: Dann sieht die App aus wie vorher.
 */
interface Vorrat {
  summary: Summary | null;
  account: Account | null;
  /** Fuer welche Adresse account gilt. */
  adresse: string | null;
}

const vorrat: Vorrat = { summary: null, account: null, adresse: null };
let laufend: Promise<void> | null = null;

async function hole<T>(pfad: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`/api/v2${pfad}`, { signal, headers: { 'content-type': 'application/json' } });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

/**
 * Kennzahlen und (wenn bekannt) Konto laden. Loest nach spaetestens
 * `hoechstensMs` auf, damit das Startbild nie an einem langsamen Netz
 * haengt. Mehrfache Aufrufe waehrend eines Laufs teilen sich den Lauf.
 */
export function vorladen(adresse: string | null, hoechstensMs = 4000): Promise<void> {
  if (laufend) return laufend;
  const ab = new AbortController();
  const wecker = setTimeout(() => ab.abort(), hoechstensMs);
  laufend = (async () => {
    const [s, a] = await Promise.all([
      hole<Summary>('/summary', ab.signal),
      adresse ? hole<Account>(`/account/${adresse}`, ab.signal) : Promise.resolve(null),
    ]);
    if (s) vorrat.summary = s;
    if (a && adresse) { vorrat.account = a; vorrat.adresse = adresse; }
  })().finally(() => { clearTimeout(wecker); laufend = null; });
  return laufend;
}

export function vorgeladen(): Readonly<Vorrat> { return vorrat; }
