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
  /**
   * Vom Knoten endgueltig abgelehnt (Grund), etwa `bad_version`: eine
   * Ueberweisung der alten Fassung nach der Aktivierung. Dieselben Bytes
   * werden nie mehr gueltig -- die Wallet bietet an, sie neu zu signieren.
   */
  abgelehnt?: string | null;
}

/** Was eine erneute Einreichung ergeben hat. */
export type Ergebnis =
  | { art: 'angenommen' }
  | { art: 'noetig'; noetig: string | null }
  | { art: 'erledigt' }
  | { art: 'abgelehnt'; grund: string }
  | { art: 'spaeter' };

/**
 * Antwort des Knotens auf eine erneute Einreichung einordnen.
 *
 *   angenommen  wartet wieder (oder wartete schon)
 *   noetig      Andrang: mit dieser Gebuehr (oder ohne Betrag) -> "Gebuehr erhoehen"
 *   erledigt    Nonce verbraucht: bestaetigt oder ersetzt -> vergessen
 *   abgelehnt   kann so nie mehr gueltig werden -> "neu senden"
 *   spaeter     voruebergehend (Vorgaenger fehlt, zu viele wartend, eine
 *               andere Zahlung mit dieser Nonce wartet) -> weiter versuchen
 */
export function einordnen(b: { accepted?: boolean; reason?: string; required?: string | null }): Ergebnis {
  if (b.accepted || b.reason === 'duplicate') return { art: 'angenommen' };
  switch (b.reason) {
    case 'pool_min_fee':
    case 'fee_too_low':
      return { art: 'noetig', noetig: typeof b.required === 'string' && /^\d+$/.test(b.required) ? b.required : null };
    case 'nonce_too_low':
      return { art: 'erledigt' };
    // Voruebergehend, und die Nonce bleibt richtig belegt: Der Vorgaenger
    // fehlt noch (er ist selbst gemerkt), zu viele warten, oder eine andere
    // Zahlung mit dieser Nonce wartet schon beim Knoten.
    case 'nonce_gap':
    case 'sender_limit':
    case 'fee_not_higher':
    case undefined:
      return { art: 'spaeter' };
    // Deckung fehlt (etwa nach einer Zahlung von einem anderen Geraet):
    // Die Bytes werden so nicht angenommen. Sichtbar machen, statt sie still
    // weiter zu schicken -- und die Nonce fuer eine neue Zahlung freigeben.
    case 'insufficient_funds':
    case 'unknown_account':
    default:
      return { art: 'abgelehnt', grund: b.reason };
  }
}

/**
 * Die Nonce fuer eine NEUE Zahlung.
 *
 * Der Knoten nennt `nextNonce` aus dem, was er kennt. Hat er eine eigene
 * Zahlung dieser Wallet verdraengt oder nach einem Neustart vergessen, laege
 * `nextNonce` auf deren Nonce -- die neue Zahlung ersetzte sie still. Deshalb
 * zaehlen die gemerkten eigenen Zahlungen mit, soweit ihre Nonce noch nicht
 * verbraucht ist. Endgueltig abgelehnte nicht -- deren Nonce darf die neue
 * Zahlung belegen.
 */
export function naechsteEigeneNonce(
  liste: EigeneZahlung[],
  konto: { nonce?: string; nextNonce?: string; pending?: { kind: string }[] } | null,
): bigint {
  const zustand = BigInt(konto?.nonce ?? '0');
  let n = konto?.nextNonce !== undefined
    ? BigInt(konto.nextNonce)
    : zustand + BigInt((konto?.pending ?? []).filter(p => p.kind === 'out').length);
  let ersteAbgelehnte: bigint | null = null;
  for (const z of liste) {
    const x = BigInt(z.nonce);
    if (x < zustand) continue;
    // Endgueltig abgelehnte zaehlen nicht: Sie werden nie gueltig.
    if (z.abgelehnt) { if (ersteAbgelehnte === null || x < ersteAbgelehnte) ersteAbgelehnte = x; continue; }
    if (x + 1n > n) n = x + 1n;
  }
  // Und alles HINTER der ersten abgelehnten haengt an ihrer Luecke: Die
  // neue Zahlung belegt deren Nonce -- danach werden die spaeteren wieder
  // gueltig. Eine hoehere Nonce bliebe selbst an der Luecke haengen.
  if (ersteAbgelehnte !== null && ersteAbgelehnte < n) n = ersteAbgelehnte;
  return n;
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
