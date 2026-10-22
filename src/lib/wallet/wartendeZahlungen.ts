'use client';

/**
 * Eigene gesendete Zahlungen, bis sie bestaetigt sind.
 *
 * Bei Andrang kann ein Knoten eine wartende Zahlung verdraengen (eine
 * hoehere Gebuehr hat ihren Platz bekommen), und nach einem Neustart kennt
 * er sie nicht mehr. Die Wallet haelt deshalb die signierten Bytes jeder
 * eigenen Zahlung fest und reicht sie erneut ein, solange sie weder wartet
 * noch bestaetigt ist. Neu signiert wird dabei nichts: Es sind dieselben
 * Bytes, dieselbe Zahlung, dieselbe Nonce -- sie kann hoechstens einmal in
 * die Kette.
 *
 * Nimmt der Knoten sie nicht wieder an, weil die Untergrenze inzwischen
 * hoeher liegt, merkt sich die Wallet die noetige Gebuehr. Die Oberflaeche
 * bietet dann "Gebuehr erhoehen" an: dieselbe Zahlung mit hoeherer Gebuehr,
 * die die alte ersetzt.
 *
 * Liegt NUR auf diesem Geraet (localStorage). Geht der Speicher verloren,
 * geht nur diese Hilfe verloren -- nie Geld.
 */

export interface EigeneZahlung {
  txid: string;
  /** Signierte Transaktion, hex. */
  raw: string;
  nonce: string;
  an: string;
  betrag: string;
  gebuehr: string;
  notiz: string;
  /** Wann gesendet (ms). */
  um: number;
  /** Zuletzt erneut eingereicht (ms). */
  zuletzt?: number;
  /** Vom Knoten nicht mehr angenommen: die Gebuehr, die jetzt reichen wuerde. */
  noetig?: string | null;
}

/** Nach so langer Zeit gibt die Wallet eine Zahlung auf (der Knoten verwirft nach 72 h). */
export const AUFGEBEN_MS = 14 * 24 * 3600_000;
/** Abstand zwischen zwei erneuten Einreichungen derselben Zahlung. */
export const ERNEUT_MS = 60_000;

const schluessel = (adresse: string) => `yskar.wartend.${adresse}`;

export function eigeneLesen(adresse: string): EigeneZahlung[] {
  if (typeof window === 'undefined') return [];
  try {
    const roh = JSON.parse(localStorage.getItem(schluessel(adresse)) ?? '[]');
    if (!Array.isArray(roh)) return [];
    // Nach Nonce: Erneut eingereicht wird in dieser Reihenfolge, und eine
    // erhoehte Nonce 0 hinter Nonce 1 waere fuer den Knoten eine Luecke.
    return roh.filter(e => e && typeof e.txid === 'string' && /^[0-9a-f]{64}$/.test(e.txid)
      && typeof e.raw === 'string' && /^[0-9a-f]+$/.test(e.raw) && typeof e.nonce === 'string' && /^\d+$/.test(e.nonce))
      .sort((a, b) => (BigInt(a.nonce) < BigInt(b.nonce) ? -1 : BigInt(a.nonce) > BigInt(b.nonce) ? 1 : 0));
  } catch { return []; }
}

export function eigeneSchreiben(adresse: string, liste: EigeneZahlung[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(schluessel(adresse), JSON.stringify(liste.slice(-64))); } catch { /* voll oder gesperrt */ }
}

/** Eine gesendete Zahlung merken. Eine mit derselben Nonce ersetzt die alte (Gebuehr erhoeht). */
export function eigeneMerken(adresse: string, z: EigeneZahlung): void {
  const rest = eigeneLesen(adresse).filter(e => e.nonce !== z.nonce);
  eigeneSchreiben(adresse, [...rest, z]);
}

export type Lage = 'bestaetigt' | 'wartet' | 'ueberholt' | 'aufgegeben' | 'erneut' | 'abwarten';

/**
 * Was mit einer gemerkten Zahlung zu tun ist -- ohne Netz, nur aus dem
 * Konto, wie der Knoten es meldet.
 *
 *   bestaetigt  steht im Verlauf -> vergessen
 *   wartet      der Knoten fuehrt sie als wartend -> nichts tun
 *   ueberholt   die Nonce des Kontos ist schon darueber: Eine andere Zahlung
 *               mit dieser Nonce (etwa die erhoehte) ist bestaetigt -> vergessen
 *   aufgegeben  zu alt -> vergessen
 *   erneut      weder wartend noch bestaetigt -> erneut einreichen
 *   abwarten    wie erneut, aber gerade erst eingereicht
 */
export function lage(
  z: EigeneZahlung,
  konto: { nonce: string; pending?: { txid: string }[]; history?: { txid: string }[] },
  jetzt: number,
): Lage {
  if ((konto.history ?? []).some(h => h.txid === z.txid)) return 'bestaetigt';
  if ((konto.pending ?? []).some(p => p.txid === z.txid)) return 'wartet';
  if (BigInt(konto.nonce) > BigInt(z.nonce)) return 'ueberholt';
  if (jetzt - z.um > AUFGEBEN_MS) return 'aufgegeben';
  if (z.zuletzt !== undefined && jetzt - z.zuletzt < ERNEUT_MS) return 'abwarten';
  return 'erneut';
}
