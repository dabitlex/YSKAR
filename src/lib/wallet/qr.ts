import { isValidAddress } from '../core/address.ts';
import { notizKuerzen } from './notiz.ts';

/**
 * Adresse aus dem Text eines QR-Codes ziehen.
 *
 * Akzeptiert die rohe Adresse sowie die Schreibweisen "ysr:<adresse>" und
 * "yskar:<adresse>", jeweils auch mit Anhang ("?amount=…"). Gross- und
 * Kleinschreibung ist egal -- bech32m ist ohnehin kleingeschrieben definiert.
 * Alles andere ist kein YSKAR-Code und wird als null gemeldet.
 */
export function adresseAusCode(text: string): string | null {
  const t = text.trim();
  const kandidaten = [t, t.replace(/^(yskar|ysr):(\/\/)?/i, '')];
  for (const k of kandidaten) {
    const adr = k.split(/[?#]/)[0].trim().toLowerCase();
    if (isValidAddress(adr)) return adr;
  }
  return null;
}

/**
 * Zahlungsanforderung: Adresse, dazu wahlweise Betrag und Notiz.
 *
 *   yskar:<adresse>?amount=25.5&memo=Danke
 *
 * Der Betrag steht in YSR mit Punkt, unabhaengig von der Sprache -- ein
 * Code muss auf jedem Geraet dasselbe bedeuten. Aeltere Fassungen der App
 * lesen aus so einem Code die Adresse und lassen den Rest weg
 * (adresseAusCode oben schneidet ab "?" ab); sie verstehen ihn also auch.
 *
 * Ein Code ist ein Vorschlag, kein Auftrag: Die Wallet traegt Betrag und
 * Notiz nur ein. Gesendet wird erst nach dem Pruefschritt.
 */
export interface Zahlung {
  adresse: string;
  /** In ganzen Einheiten; null, wenn der Code keinen (gueltigen) Betrag nennt. */
  betrag: bigint | null;
  notiz: string | null;
}

/** Hoechstens zwoelf Stellen vor dem Punkt -- wie die Eingabe in der Wallet. */
const BETRAG = /^(\d{1,12})(?:\.(\d{1,18}))?$/;

export function zahlungAusCode(text: string, decimals = 8): Zahlung | null {
  const adresse = adresseAusCode(text);
  if (!adresse) return null;
  // Nur was VOR einem "#" steht, sind Angaben zur Zahlung.
  const ohneAnker = text.split('#')[0];
  const frage = ohneAnker.indexOf('?');
  if (frage < 0) return { adresse, betrag: null, notiz: null };

  let p: URLSearchParams;
  try { p = new URLSearchParams(ohneAnker.slice(frage + 1)); }
  catch { return { adresse, betrag: null, notiz: null }; }

  let betrag: bigint | null = null;
  const m = BETRAG.exec((p.get('amount') ?? '').trim());
  // Mehr Nachkommastellen, als die Kette kennt, waeren ein anderer Betrag
  // als der gemeinte -- dann lieber keiner.
  if (m && (m[2] ?? '').length <= decimals) {
    const wert = BigInt(m[1]) * 10n ** BigInt(decimals)
      + BigInt((m[2] ?? '').padEnd(decimals, '0') || '0');
    if (wert > 0n) betrag = wert;
  }

  const roh = (p.get('memo') ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const notiz = roh ? notizKuerzen(roh) : null;
  return { adresse, betrag, notiz: notiz || null };
}

/**
 * Zahlung aus beliebigem Text -- fuer "Einfuegen".
 *
 * Wer eine Anforderung per Nachricht bekommt, kopiert oft die ganze
 * Nachricht ("Bitte sende mir 5 YSR an ysr1…"). Gesucht wird deshalb erst
 * der Text als Ganzes, dann ein Code darin, dann eine blanke Adresse darin.
 * Stehen mehrere Adressen im Text, gilt keine: Raten waere hier gefaehrlich.
 */
export function zahlungAusText(text: string, decimals = 8): Zahlung | null {
  // Als Ganzes nur, wenn es EIN Stueck ist. Sonst koennte hinter einem Code
  // noch eine zweite Adresse stehen, die niemand gezaehlt hat.
  if (!/\s/.test(text.trim())) {
    const ganz = zahlungAusCode(text, decimals);
    if (ganz) return ganz;
  }
  const codes = text.match(/(?:yskar|ysr):(?:\/\/)?ysr1[0-9a-z]+(?:\?[^\s]*)?/gi) ?? [];
  const blank = text.match(/ysr1[0-9a-z]{20,}/gi) ?? [];
  const adressen = new Set(blank.map(a => a.toLowerCase()).filter(isValidAddress));
  if (adressen.size !== 1) return null;
  for (const c of codes) {
    const z = zahlungAusCode(c, decimals);
    if (z) return z;
  }
  return { adresse: [...adressen][0], betrag: null, notiz: null };
}

/** Text fuer den QR-Code. Ohne Betrag und Notiz: die blanke Adresse, wie bisher. */
export function zahlungsCode(adresse: string, betrag?: bigint | null, notiz?: string | null,
                             decimals = 8): string {
  const teile: string[] = [];
  if (betrag && betrag > 0n) {
    const basis = 10n ** BigInt(decimals);
    const bruch = (betrag % basis).toString().padStart(decimals, '0').replace(/0+$/, '');
    teile.push(`amount=${betrag / basis}${bruch ? '.' + bruch : ''}`);
  }
  const n = notizKuerzen((notiz ?? '').trim());
  if (n) teile.push(`memo=${encodeURIComponent(n)}`);
  return teile.length ? `yskar:${adresse}?${teile.join('&')}` : adresse;
}
