/**
 * Was der Mining-Bildschirm anzeigt -- reine Funktionen, ohne React.
 *
 * Beide stammen unveraendert aus dem alten MiningTab.tsx (Paket 3 hat nur
 * den Ort geaendert, nicht die Regeln) und sind so testbar. Sie lesen nur;
 * am Mining selbst aendern sie nichts.
 */

/**
 * Geschaetzter eigener Anteil je Pool-Block in YSR: eigene Leistung geteilt
 * durch Pool-Leistung, mal Belohnung, abzueglich Gebuehr. Keine Zusage --
 * deshalb steht in der App ein ≈ davor. null, solange es nichts zu
 * schaetzen gibt.
 */
export function anteilJeBlock({ mining, hashrate, poolRate, belohnung, feeBps }: {
  mining: boolean;
  /** eigene Leistung in H/s */
  hashrate: number;
  /** Leistung des Pools in H/s (Selbstauskunft des Pools) */
  poolRate: number | null;
  /** Belohnung des naechsten Blocks in YSR */
  belohnung: number;
  /** Gebuehr des Pools in Basispunkten (100 = 1 %) */
  feeBps: number | null;
}): number | null {
  if (!mining || !poolRate || poolRate <= 0 || hashrate <= 0) return null;
  return Math.min(1, hashrate / poolRate) * belohnung * (1 - (feeBps ?? 0) / 10_000);
}

export type FehlerAnzeige = { art: 'voll' } | { art: 'text'; text: string } | null;

/**
 * Welche Fehlermeldung unter dem Start-Knopf steht.
 *
 *  - "Pool voll" nur, wenn das Pool-Feld es nicht schon sagt -- und nach
 *    dem Anhalten gar nicht mehr, wenn der Pool inzwischen wieder offen ist.
 *  - Eine verlorene Sitzung (session_inactive) nach dem Anhalten im Pool
 *    ist kein Fehler, den der Nutzer sehen muss.
 *  - Alles andere so, wie der Miner es meldet.
 */
export function fehlerAnzeige({ fehler, mining, modus, vollGezeigt, ueberholt, poolOffen }: {
  fehler: string | null;
  mining: boolean;
  modus: 'pool' | 'solo';
  /** Pool-Feld zeigt "voll" schon an */
  vollGezeigt: boolean;
  /** Der Fehler, den die Pool-Auswahl als ueberholt markiert hat */
  ueberholt: string | null;
  /** Der gewaehlte Pool meldet gerade "offen" */
  poolOffen: boolean;
}): FehlerAnzeige {
  if (!fehler) return null;
  const erledigt = modus === 'solo' || vollGezeigt || (ueberholt === fehler && poolOffen);
  if (/pool_full/.test(fehler)) return !mining && erledigt ? null : { art: 'voll' };
  if (!mining && modus === 'pool' && /session_inactive/.test(fehler)) return null;
  return { art: 'text', text: fehler };
}
