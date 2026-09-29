import { isValidAddress } from '../core/address.ts';

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
