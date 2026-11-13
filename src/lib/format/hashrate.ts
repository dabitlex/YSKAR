/**
 * Hashrate lesbar machen -- ohne Obergrenze.
 *
 * Bis Konsensfassung 4 endete die Netz-Hashrate praktisch bei rund 469 GH/s
 * (u32-Difficulty), und die Anzeigen hoerten bei MH/s oder GH/s auf. Jetzt
 * kann sie beliebig wachsen; die Einheiten gehen bis YH/s, darueber
 * Exponentschreibweise.
 *
 * Eine Stelle fuer alle Anzeigen, damit App, Mining-Tab, Netz-Tab und
 * Benachrichtigung dieselbe Zahl gleich schreiben.
 */
const STUFEN: [number, string][] = [
  [1e24, 'YH/s'], [1e21, 'ZH/s'], [1e18, 'EH/s'], [1e15, 'PH/s'],
  [1e12, 'TH/s'], [1e9, 'GH/s'], [1e6, 'MH/s'], [1e3, 'kH/s'],
];

/**
 * `locale` (z. B. "de-DE") schreibt die Zahl in der Sprache der Oberflaeche:
 * 74,03 statt 74.03. Ohne Angabe bleibt es beim Punkt -- so steht die Zahl
 * in Benachrichtigungen und Protokollen ueberall gleich.
 */
export function hashrateTeile(h: number, locale?: string): { wert: string; einheit: string } {
  if (!Number.isFinite(h) || h <= 0) return { wert: '0', einheit: 'H/s' };
  if (h >= 1e27) return { wert: h.toExponential(2), einheit: 'H/s' };
  for (const [ab, einheit] of STUFEN) {
    if (h >= ab) {
      const stellen = ab === 1e3 ? 1 : 2;
      const wert = locale
        ? (h / ab).toLocaleString(locale, { minimumFractionDigits: stellen, maximumFractionDigits: stellen, useGrouping: false })
        : (h / ab).toFixed(stellen);
      return { wert, einheit };
    }
  }
  return { wert: String(Math.round(h)), einheit: 'H/s' };
}

export function hashrateText(h: number | null | undefined, locale?: string): string {
  if (h == null || !Number.isFinite(h)) return '—';
  const { wert, einheit } = hashrateTeile(h, locale);
  return `${wert} ${einheit}`;
}

/**
 * Grosse Ganzzahl (z.B. Difficulty) kurz schreiben.
 *
 * Unter einer Billion ausgeschrieben wie bisher. Darueber kompakt, damit
 * eine Kachel nicht von einer 20-stelligen Zahl gesprengt wird.
 */
export function grosseZahl(n: number | null | undefined, locale = 'de-DE'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1e12) return Math.round(n).toLocaleString(locale);
  if (n < 1e15) {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat(locale, { notation: 'scientific', maximumFractionDigits: 2 }).format(n);
}
