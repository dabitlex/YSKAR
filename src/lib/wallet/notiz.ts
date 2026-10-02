/**
 * Notiz einer Zahlung.
 *
 * Die Kette erlaubt 32 BYTE, nicht 32 Zeichen: "ä" belegt zwei, ein Emoji
 * vier. Gekuerzt wird deshalb nach Bytes -- und nie mitten in einem
 * Zeichen, sonst stuende am Ende ein kaputtes.
 */

export const NOTIZ_BYTES = 32;

const kodierer = new TextEncoder();

export function notizBytes(text: string): number {
  return kodierer.encode(text).length;
}

/** Auf hoechstens `max` Byte kuerzen, an einer Zeichengrenze. */
export function notizKuerzen(text: string, max = NOTIZ_BYTES): string {
  let aus = '';
  let bytes = 0;
  for (const zeichen of text) {
    const n = kodierer.encode(zeichen).length;
    if (bytes + n > max) break;
    aus += zeichen;
    bytes += n;
  }
  return aus;
}

/**
 * Notiz aus den Bytes der Kette (Hex). Leer, wenn es kein gueltiger Text
 * ist -- eine Notiz sind beliebige Bytes, nicht jede ist lesbar.
 */
export function notizAusHex(hex: string | null | undefined): string {
  if (!hex) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16)))
      // Steuerzeichen haben in einer Zeile nichts verloren.
      .replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  } catch { return ''; }
}
