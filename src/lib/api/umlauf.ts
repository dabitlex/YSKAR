/**
 * Umlaufmenge fuer Datenseiten wie CoinMarketCap.
 *
 * Erzeugt ist, was die Kette laut Full Node ausgegeben hat. Davon ab geht das
 * Guthaben der Null-Adresse (20 Null-Bytes): Zu ihr gehoert kein bekannter
 * Schluessel, was dort liegt, kann niemand mehr bewegen -- darunter die rund
 * 1,07 Mio. YSR aus der Anfangszeit (Bloecke 3.973 und 3.974).
 *
 * Reine Rechnung ohne Netz, damit sie sich testen laesst.
 */
import { MAX_SUPPLY, UNIT } from '../core/params.ts';
import { encodeAddress } from '../core/address.ts';

export const NULL_ADRESSE = encodeAddress(new Uint8Array(20));

export interface Mengen {
  /** Von der Kette erzeugt (atomare Einheiten). */
  erzeugt: bigint;
  /** Dauerhaft gesperrt auf der Null-Adresse. */
  gesperrt: bigint;
  /** erzeugt - gesperrt; nie negativ. */
  umlauf: bigint;
  /** Obergrenze laut Konsens. */
  hoechst: bigint;
}

export function mengenBerechnen(erzeugt: bigint, gesperrt: bigint): Mengen {
  if (erzeugt < 0n || gesperrt < 0n) throw new RangeError('negative Menge');
  if (gesperrt > erzeugt) throw new RangeError('gesperrt > erzeugt');
  return { erzeugt, gesperrt, umlauf: erzeugt - gesperrt, hoechst: MAX_SUPPLY };
}

/** Atomare Einheiten als Dezimalzahl in YSR: Punkt, keine Tausendertrennung, Nullen am Ende weg. */
export function ysrText(atomar: bigint): string {
  if (atomar < 0n) throw new RangeError('negative Menge');
  const ganz = atomar / UNIT;
  const rest = (atomar % UNIT).toString().padStart(8, '0').replace(/0+$/, '');
  return rest ? `${ganz}.${rest}` : `${ganz}`;
}

/** Eine Zahl aus der Knotenantwort (String oder Zahl in atomaren Einheiten) lesen. */
export function atomarLesen(wert: unknown, feld: string): bigint {
  if (typeof wert === 'string' && /^\d+$/.test(wert)) return BigInt(wert);
  if (typeof wert === 'number' && Number.isSafeInteger(wert) && wert >= 0) return BigInt(wert);
  throw new TypeError(`${feld} fehlt oder ist keine ganze Zahl`);
}
