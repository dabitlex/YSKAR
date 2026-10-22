import { ed25519 } from '@noble/curves/ed25519.js';
import { toHex } from './codec.ts';

/**
 * Signaturpruefung -- die eine Stelle, an der der Konsens Ed25519 prueft
 * (docs/CONSENSUS_V6.md, Abschnitt 7.8).
 *
 * DIE REGEL (7.8): Punkte duerfen nicht-kanonisch kodiert sein,
 * S muss kleiner als die Gruppenordnung sein, und es gilt die Gleichung mit
 * Kofaktor [8][S]B = [8]R + [8][k]A. Genau das prueft @noble/curves mit seiner
 * Vorgabe (zip215: true) -- und das hat YSKAR seit Genesis geprueft. Diese
 * Datei aendert die Regel nicht, sie macht sie nur ausdruecklich.
 *
 * Wie geprueft wird, ist austauschbar, was gilt, nicht: Ohne weiteres prueft
 * noble (reines JavaScript, langsam, laeuft ueberall -- auch in der Mini App).
 * Knoten setzen mit setzePruefer() das WASM-Modul (crypto/zip215) ein
 * (src/lib/node/zip215.ts), das dieselbe Regel rund zehnmal schneller prueft
 * und Stapel pruefen kann. Dass beide gleich entscheiden, belegen die
 * Testvektoren in tests/zip215.test.ts, darunter 196 veroeffentlichte Grenzfaelle.
 *
 * NICHT erlaubt ist ein Pruefer, der eine andere Regel umsetzt -- etwa
 * OpenSSL/node:crypto. Er entscheidet in Grenzfaellen anders, und ein
 * Angreifer kann solche Grenzfaelle gezielt bauen; Knoten mit verschiedenen
 * Pruefern stritten dann ueber die Gueltigkeit eines Blocks.
 */

export interface SignaturTripel {
  signature: Uint8Array;
  message: Uint8Array;
  publicKey: Uint8Array;
}

export interface Pruefer {
  name: string;
  /** Eine Signatur nach der Regel aus 7.8. Wirft nie. */
  einzeln(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
  /**
   * Alle oder keine: true nur, wenn JEDE Signatur nach der Regel aus 7.8 gueltig ist.
   * Fehlt die Funktion, wird einzeln geprueft.
   */
  stapel?(eintraege: SignaturTripel[]): boolean;
}

export const NOBLE: Pruefer = {
  name: 'noble',
  einzeln(signature, message, publicKey) {
    try { return ed25519.verify(signature, message, publicKey, { zip215: true }); }
    catch { return false; }
  },
};

let aktiv: Pruefer = NOBLE;

export function setzePruefer(p: Pruefer): void { aktiv = p; }
export function pruefer(): Pruefer { return aktiv; }

/**
 * Bereits als gueltig erkannte Tripel -- nur waehrend mitVorpruefung().
 * Der Schluessel ist das ganze Tripel, nicht nur die Signatur: Dieselbe
 * Signatur ueber eine andere Nachricht oder mit anderem Schluessel ist eine
 * andere Pruefung.
 */
let vorgeprueft: Set<string> | null = null;
const tripelSchluessel = (s: Uint8Array, m: Uint8Array, p: Uint8Array) =>
  `${toHex(s)}${toHex(p)}${toHex(m)}`;

export function verifySignature(
  signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) return false;
  if (vorgeprueft?.has(tripelSchluessel(signature, message, publicKey))) return true;
  return aktiv.einzeln(signature, message, publicKey);
}

/**
 * Einen Block mit vorab geprueften Signaturen anwenden.
 *
 * Alle Tripel des Blocks werden in einem Stapel geprueft. Geht der Stapel
 * durch, gilt jedes Tripel als gueltig, und verifySignature() antwortet fuer
 * sie ohne erneute Rechnung. Faellt er durch, wird nichts vorgemerkt: Dann
 * prueft die Blockpruefung wie bisher jede Signatur einzeln, findet die
 * falsche und meldet denselben Fehler wie ohne Stapel. Das Ergebnis eines
 * Blocks haengt damit nie davon ab, ob gestapelt wurde -- nur die Zeit.
 *
 * Ohne Stapel-Pruefer (noble) geschieht nichts Besonderes.
 */
export function mitVorpruefung<T>(tripel: SignaturTripel[], fn: () => T): T {
  const stapel = aktiv.stapel;
  if (!stapel || tripel.length < 2 || vorgeprueft) return fn();
  const brauchbar = tripel.filter(t => t.signature.length === 64 && t.publicKey.length === 32);
  let ok = false;
  try { ok = stapel(brauchbar); } catch { ok = false; }
  if (!ok) return fn();
  vorgeprueft = new Set(brauchbar.map(t => tripelSchluessel(t.signature, t.message, t.publicKey)));
  try { return fn(); }
  finally { vorgeprueft = null; }
}
