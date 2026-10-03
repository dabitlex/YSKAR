import { db } from '@/lib/db/service';
import { POOLS, type PoolStand } from '@/lib/pool/verzeichnis';
import { poolFragen } from '@/lib/pool/abfrage';

/**
 * Stand aller Pools der Liste -- fuer die Pool-Auswahl in der App.
 *
 * Miner, Plaetze, Leistung und Gebuehr meldet jeder Pool-Knoten selbst
 * (GET /api/v2/pool). Die gefundenen Bloecke kommen aus der Kette, gezaehlt
 * ueber den Namen, den der Pool in seine Bloecke schreibt (Migration 00025).
 *
 * Abgefragt wird VOM SERVER, nicht vom Telefon: Sonst fragte jede geoeffnete
 * App jeden Pool einzeln, und ein langsamer Pool hielte die Liste auf. So
 * gibt es eine Antwort fuer alle.
 *
 * WIE ALT DIE ANTWORT SEIN KANN: bis zu 10 Sekunden hier, dazu bis zu 10
 * Sekunden im Zwischenspeicher vor dem Server (route.ts) -- zusammen rund 20.
 * Fuer "ist noch Platz?" reicht das nicht; deshalb fragt die App den
 * gewaehlten Pool unmittelbar vor dem Start selbst (usePoolAuswahl.ts).
 *
 * Die Adressen stehen fest in der Liste (verzeichnis.ts). Von aussen laesst
 * sich hier kein Ziel angeben -- der Server ruft also nie eine fremde
 * Adresse auf, die ihm jemand unterschiebt.
 */

/** So lange wartet der Server auf einen Pool. */
const WARTEN_MS = 4_000;
/** So lange gilt eine Antwort der Pools. */
const GILT_MS = 10_000;
/** So lange wartet der Server auf die Blockzahlen ... */
const BLOECKE_WARTEN_MS = 3_000;
/** ... und so lange gelten sie. Ein Block kommt alle paar Minuten. */
const BLOECKE_GILT_MS = 60_000;

export interface PoolListe {
  /** Zeitpunkt der Abfrage, Unix-Sekunden. */
  stand: number;
  pools: PoolStand[];
}

let bloeckeMerker: { bis: number; zahlen: Map<string, number> } | null = null;
let bloeckeLaeuft: Promise<Map<string, number> | null> | null = null;

/** Die Zaehlung selbst. Legt ihr Ergebnis ab, wann immer es kommt. */
function bloeckeZaehlen(): Promise<Map<string, number> | null> {
  // Solange eine Zaehlung unterwegs ist, keine zweite daneben: Ein langsamer
  // Spiegel bekaeme sonst alle zehn Sekunden eine weitere Abfrage dazu.
  bloeckeLaeuft ??= (async () => {
    try {
      const { data, error } = await db().schema('chain2').rpc('finder_namen');
      if (error || !Array.isArray(data)) return null;
      const zahlen = new Map<string, number>();
      for (const z of data as { name?: unknown; bloecke?: unknown }[]) {
        const n = Number(z.bloecke);
        if (typeof z.name === 'string' && Number.isSafeInteger(n) && n >= 0) zahlen.set(z.name, n);
      }
      bloeckeMerker = { bis: Date.now() + BLOECKE_GILT_MS, zahlen };
      return zahlen;
    } catch {
      return null;
    } finally {
      bloeckeLaeuft = null;
    }
  })();
  return bloeckeLaeuft;
}

/**
 * Bloecke je Finder-Name.
 *
 * Faellt der Spiegel aus oder braucht zu lange, fehlen nur diese Zahlen --
 * die Liste selbst darf daran nicht haengen. Gewartet wird hoechstens
 * BLOECKE_WARTEN_MS; kommt die Antwort spaeter, gilt sie ab der naechsten
 * Liste. Bis dahin steht die letzte bekannte Zaehlung da: Eine Zahl von vor
 * zehn Minuten ist besser als keine.
 */
async function bloeckeJeName(): Promise<Map<string, number> | null> {
  if (bloeckeMerker && bloeckeMerker.bis > Date.now()) return bloeckeMerker.zahlen;
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const frist = new Promise<null>(auf => { uhr = setTimeout(() => auf(null), BLOECKE_WARTEN_MS); });
  try {
    return await Promise.race([bloeckeZaehlen(), frist]) ?? bloeckeMerker?.zahlen ?? null;
  } finally {
    clearTimeout(uhr);
  }
}

let merker: { bis: number; liste: PoolListe } | null = null;
let laeuft: Promise<PoolListe> | null = null;

/** Wirft nie: poolFragen() und bloeckeJeName() fangen ihre Fehler selbst. */
export async function poolListe(): Promise<PoolListe> {
  if (merker && merker.bis > Date.now()) return merker.liste;
  // Kommen mehrere Anfragen zugleich, fragt nur eine die Pools.
  if (laeuft) return laeuft;
  laeuft = (async () => {
    try {
      const [staende, bloecke] = await Promise.all([
        Promise.all(POOLS.map(p => poolFragen(p, { wartenMs: WARTEN_MS }))),
        bloeckeJeName(),
      ]);
      const liste: PoolListe = {
        stand: Math.floor(Date.now() / 1000),
        pools: staende.map(s => ({
          ...s,
          // Ohne Namen gibt es nichts zu zaehlen. Mit Namen und ohne
          // Treffer sind es null Bloecke -- das ist eine Aussage.
          bloecke: bloecke && s.kette ? bloecke.get(s.kette) ?? 0 : null,
        })),
      };
      merker = { bis: Date.now() + GILT_MS, liste };
      return liste;
    } finally {
      laeuft = null;
    }
  })();
  return laeuft;
}
