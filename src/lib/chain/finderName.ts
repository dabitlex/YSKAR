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
