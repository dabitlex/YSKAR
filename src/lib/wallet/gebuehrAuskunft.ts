/**
 * Gebuehrenauskunft fuer das Senden in der Wallet.
 *
 * Quelle ist /api/v2/fees der App, die die Antwort des Full Nodes
 * durchreicht. Antwortet sie nicht, fragt die Wallet denselben Knoten
 * direkt, an den sie die Zahlung ohnehin schickt (NEXT_PUBLIC_MINING_BASE).
 * Seine Antwort hat dasselbe Format (ReadApi.fees) und nennt die Fassung des
 * naechsten Blocks und die Sendepause vor der Aktivierungshoehe.
 *
 * Gesperrt wird nur, wenn der Knoten die Sendepause meldet (die drei Bloecke
 * vor der Hoehe, tx.ts WECHSEL_PAUSE_BLOECKE) oder wenn eine Hoehe gesetzt
 * ist und keine Quelle antwortet: Dann ist unbekannt, welche Fassung der
 * naechste Block verlangt, und eine falsch gewaehlte lehnt jeder Knoten ab.
 */
import { V6_HEIGHT_UNSET } from '../core/params.ts';

/** Die Felder der Antwort, auf die es hier ankommt. */
export interface GebuehrAuskunft {
  /** Fassung der Ueberweisung fuer den naechsten Block; aeltere Knoten nennen sie nicht. */
  fassung?: number;
  /** Die letzten Bloecke vor der Aktivierung von Fassung 6: jetzt nichts einreichen. */
  sendepause?: boolean;
  /** Hoehe des naechsten Blocks. */
  hoehe?: number;
  error?: unknown;
}

/** So lange wartet die Wallet auf eine Quelle, bevor sie die naechste fragt. */
export const AUSKUNFT_FRIST_MS = 10_000;

async function lies<T>(url: string, abruf: typeof fetch): Promise<T | null> {
  try {
    const frist = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? { signal: AbortSignal.timeout(AUSKUNFT_FRIST_MS) } : undefined;
    const d = await (await abruf(url, frist)).json() as T & { error?: unknown };
    return d && typeof d === 'object' && !d.error ? d : null;
  } catch {
    return null;
  }
}

/** Erst die Route der App, dann der Knoten. null: keine Quelle hat geantwortet. */
export async function auskunftHolen<T extends GebuehrAuskunft>(
  knotenBasis: string, abruf: typeof fetch = (...a) => fetch(...a),
): Promise<T | null> {
  const app = await lies<T>('/api/v2/fees', abruf);
  if (app) return app;
  const basis = knotenBasis.trim().replace(/\/+$/, '');
  if (!basis) return null;
  return lies<T>(`${basis}/api/v2/fees`, abruf);
}

export interface SendeStand {
  /** Fassung der Ueberweisung, die jetzt zu bauen ist. */
  fassung: 1 | 2;
  /** Sendepause vor der Aktivierungshoehe. */
  pause: boolean;
  /** Keine Auskunft, aber eine Hoehe gesetzt: nicht raten, nicht senden. */
  unbekannt: boolean;
}

export function sendeStand(auskunft: GebuehrAuskunft | null, v6Height: number): SendeStand {
  if (!auskunft) return { fassung: 1, pause: false, unbekannt: v6Height !== V6_HEIGHT_UNSET };
  return { fassung: auskunft.fassung === 2 ? 2 : 1, pause: auskunft.sendepause === true, unbekannt: false };
}
