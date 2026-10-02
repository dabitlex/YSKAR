/**
 * Betraege fuer die Anzeige in der Wallet.
 *
 * Zwei bis vier Nachkommastellen, in der Schreibweise der gewaehlten
 * Sprache: "5,00", "1,2857", "1.284,5512". Vorher stand im Verlauf
 * "-5.0000" mit Punkt neben einem Guthaben mit Komma.
 *
 * ABGESCHNITTEN, nie gerundet: Die Anzeige darf nicht mehr versprechen,
 * als da ist. 0,99999 YSR sind "0,9999", nicht "1,00". Gerechnet wird in
 * ganzen Einheiten (BigInt), erst die fertige Zahl geht an Intl.
 */

function einheiten(wert: bigint | string | number | null | undefined): bigint {
  if (typeof wert === 'bigint') return wert;
  try { return BigInt(wert ?? 0); } catch { return 0n; }
}

/** Betrag als Zahl, auf vier Nachkommastellen abgeschnitten. */
export function betragZahl(wert: bigint | string | number | null | undefined, decimals = 8): number {
  const e = einheiten(wert);
  const abs = e < 0n ? -e : e;
  const teiler = 10n ** BigInt(Math.max(0, decimals - 4));
  const n = Number(abs / teiler) / 10 ** Math.min(4, decimals);
  return e < 0n ? -n : n;
}

/**
 * Betrag als Text, ohne Vorzeichen und ohne Einheit.
 *
 * Ein Betrag, der groesser als null ist, aber kleiner als die kleinste
 * gezeigte Stelle, erscheint als "< 0,0001" -- nicht als "0,00".
 */
export function betragText(wert: bigint | string | number | null | undefined, locale: string,
                           decimals = 8): string {
  const e = einheiten(wert);
  const n = Math.abs(betragZahl(e, decimals));
  const f = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (n === 0 && e !== 0n) return `< ${f.format(0.0001)}`;
  return f.format(n);
}

/**
 * Betrag EXAKT, bis zur letzten Stelle der Kette: "25,50", "25,50000226".
 *
 * Fuer den Pruefschritt beim Senden und fuer Gebuehren: Dort darf nichts
 * abgeschnitten sein -- "Gesamt" muss die Gebuehr zeigen, auch wenn sie in
 * der sechsten Nachkommastelle liegt. Mindestens `min` Nachkommastellen,
 * Nullen am Ende darueber hinaus fallen weg.
 */
export function betragGenau(wert: bigint | string | number | null | undefined, locale: string,
                            decimals = 8, min = 2): string {
  const e = einheiten(wert);
  const abs = e < 0n ? -e : e;
  const basis = 10n ** BigInt(decimals);
  let bruch = (abs % basis).toString().padStart(decimals, '0').replace(/0+$/, '');
  if (bruch.length < min) bruch = bruch.padEnd(min, '0');
  const ganz = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(abs / basis);
  return bruch ? `${ganz}${dezimalZeichen(locale)}${bruch}` : ganz;
}

/** Dezimaltrennzeichen der Sprache -- fuer das Ziffernfeld beim Senden. */
export function dezimalZeichen(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal')?.value ?? '.';
}

/**
 * Eingabe ("25,5" oder "25.5") in ganze Einheiten. Unsinn und Negatives
 * ergeben 0. Exakt: Ziffern werden gezaehlt, nicht ueber Gleitkomma
 * gerechnet -- 0,1 + 0,2 ist dort nicht 0,3.
 */
export function eingabeEinheiten(text: string, decimals = 8): bigint {
  const m = /^(\d{0,12})(?:[.,](\d{0,18}))?$/.exec(text.trim());
  if (!m || (m[1] === '' && !m[2])) return 0n;
  const ganz = BigInt(m[1] || '0');
  const bruch = (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  return ganz * 10n ** BigInt(decimals) + BigInt(bruch || '0');
}

/** Einheiten als Eingabetext mit dem Trennzeichen der Sprache, ohne Nullen am Ende. */
export function einheitenEingabe(wert: bigint, zeichen: string, decimals = 8, stellen = 4): string {
  if (wert <= 0n) return '';
  const basis = 10n ** BigInt(decimals);
  const ganz = wert / basis;
  const bruch = (wert % basis).toString().padStart(decimals, '0').slice(0, stellen).replace(/0+$/, '');
  return bruch ? `${ganz}${zeichen}${bruch}` : `${ganz}`;
}
