/**
 * Der selbst gewaehlte Name eines Blockfinders.
 *
 * Er steht im extra-Feld der Coinbase. Das Feld hat eigentlich einen
 * anderen Zweck -- es macht den txid eindeutig -- und enthaelt deshalb
 * fast immer Zufallsbytes.
 *
 * DIE UNTERSCHEIDUNG: Zufallsbytes sehen praktisch nie wie Text aus. Bei
 * acht zufaelligen Bytes liegt die Wahrscheinlichkeit, dass alle im
 * druckbaren ASCII-Bereich landen, bei etwa 0,003 Prozent. Gegen die
 * echte Kette geprueft: Von 1841 vorhandenen extra-Feldern war genau
 * EINES durchgehend druckbar -- der Genesis-Block mit seiner Inschrift.
 *
 * WAS DAS IST UND WAS NICHT: Eine Selbstauskunft, mehr nicht. Wer einen
 * Block findet, darf sich nennen, wie er will. Nachpruefbar ist nur, DASS
 * dieser Finder Bloecke gefunden hat -- nicht, dass der Name stimmt. Die
 * Anzeige darf daraus also keine Zusicherung machen.
 */
export function finderName(extraHex: string | null | undefined): string | null {
  if (!extraHex) return null;
  const hex = extraHex.replace(/^\\x/, '');
  if (hex.length < 6 || hex.length > 64 || hex.length % 2 !== 0) return null;

  let text = '';
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    if (!Number.isFinite(b) || b < 0x20 || b > 0x7e) return null;
    text += String.fromCharCode(b);
  }
  const sauber = text.trim();
  // Mindestens ein Buchstabe oder eine Ziffer -- reine Satzzeichen sind
  // kein Name.
  if (sauber.length < 3 || !/[a-zA-Z0-9]/.test(sauber)) return null;
  return sauber;
}

/** Hoechstlaenge des Namens in Byte. */
export const MAX_FINDER_BYTES = 32;

/**
 * Einen Namen in das extra-Feld der Coinbase umwandeln.
 *
 * Spiegelbild von finderName(): Was hier hineingeht, muss dort wieder
 * herauskommen. Deshalb dieselben Regeln -- druckbares ASCII, mindestens
 * drei Zeichen, mindestens ein Buchstabe oder eine Ziffer.
 *
 * WARUM SO STRENG: Was einmal in einem Block steht, steht dort fuer immer.
 * Ein Steuerzeichen, ein Zeilenumbruch oder ein Umlaut liesse sich nicht
 * mehr entfernen -- und wuerde beim Lesen ohnehin verworfen, sodass der
 * Name unsichtbar bliebe. Lieber beim Schreiben ablehnen.
 *
 * Ein leerer Name ergibt ein leeres Feld. Das ist kein Fehler: Wer sich
 * nicht nennen will, muss nicht.
 */
export function nameToExtra(name: string): Uint8Array {
  const sauber = (name ?? '').trim();
  if (sauber.length === 0) return new Uint8Array(0);

  const bytes: number[] = [];
  for (const zeichen of sauber) {
    const c = zeichen.codePointAt(0)!;
    if (c < 0x20 || c > 0x7e) {
      throw new Error(`Nur einfache Zeichen erlaubt -- "${zeichen}" geht nicht.`);
    }
    bytes.push(c);
  }
  if (bytes.length > MAX_FINDER_BYTES) {
    throw new Error(`Hoechstens ${MAX_FINDER_BYTES} Zeichen, nicht ${bytes.length}.`);
  }
  if (bytes.length < 3) throw new Error('Mindestens drei Zeichen.');
  if (!/[a-zA-Z0-9]/.test(sauber)) {
    throw new Error('Mindestens ein Buchstabe oder eine Ziffer.');
  }
  return new Uint8Array(bytes);
}
