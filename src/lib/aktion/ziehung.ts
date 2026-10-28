import { createHash } from 'node:crypto';
import { PREISE_USD } from './regeln.ts';

/** Gewinncode: kurz, ohne 0/O/1/I, aus Blockhash und Platz abgeleitet. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function gewinnCode(hash: string, platz: number, versuch: number): string {
  const d = createHash('sha256').update(`${hash}:code:${platz}:${versuch}`).digest();
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[d[i]! % ALPHABET.length];
  return `W-${s}`;
}

/**
 * Die Ziehung -- nachpruefbar, ohne Zufall auf dem Server.
 *
 *   Losliste:  Zeilen "adresse anzahl", nach Adresse sortiert, mit \n
 *              verbunden. Ihr SHA-256 wird VOR der Ziehung veroeffentlicht.
 *   Startwert: Hash des ersten YSKAR-Blocks nach dem Ziehungszeitpunkt.
 *   Ziehung k (1..10): z = SHA-256("<blockhash>:<k>") als Zahl,
 *              Los Nr. z mod (verbleibende Lose). Alle Lose dieser Adresse
 *              fallen heraus. Ziehung k ergibt Platz k.
 */
export interface Eintrag { adresse: string; lose: number }
export interface Gewinner { platz: number; adresse: string; betrag_usd: number; code: string }

export function losliste(eintraege: Eintrag[]): { text: string; hash: string } {
  const text = eintraege.filter(e => e.lose > 0)
    .sort((a, b) => (a.adresse < b.adresse ? -1 : a.adresse > b.adresse ? 1 : 0))
    .map(e => `${e.adresse} ${e.lose}`).join('\n');
  return { text, hash: createHash('sha256').update(text).digest('hex') };
}

export function ziehen(eintraege: Eintrag[], blockHash: string, plaetze = PREISE_USD.length): Gewinner[] {
  const hash = blockHash.toLowerCase().replace(/^0x/, '');
  let rest = eintraege.filter(e => e.lose > 0)
    .sort((a, b) => (a.adresse < b.adresse ? -1 : a.adresse > b.adresse ? 1 : 0));
  const out: Gewinner[] = [];
  const codes = new Set<string>();
  for (let k = 1; k <= plaetze && rest.length > 0; k++) {
    const summe = rest.reduce((s, e) => s + e.lose, 0);
    const z = BigInt('0x' + createHash('sha256').update(`${hash}:${k}`).digest('hex'));
    let n = Number(z % BigInt(summe));
    let i = 0;
    while (n >= rest[i]!.lose) { n -= rest[i]!.lose; i++; }
    const w = rest[i]!;
    let code = gewinnCode(hash, k, 0);
    for (let j = 1; codes.has(code); j++) code = gewinnCode(hash, k, j);
    codes.add(code);
    out.push({ platz: k, adresse: w.adresse, betrag_usd: PREISE_USD[k - 1]!, code });
    rest = rest.filter(e => e.adresse !== w.adresse);
  }
  return out;
}
