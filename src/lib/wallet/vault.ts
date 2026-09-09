/**
 * Schluesselverwahrung im Geraet.
 *
 * Die Merkwoerter werden NICHT im Klartext abgelegt. Sie liegen mit einer
 * vom Nutzer gewaehlten PIN verschluesselt im localStorage:
 *
 *   PIN -> PBKDF2-SHA256, 250.000 Runden, 16 Byte Salz -> AES-256-GCM
 *
 * Warum ueberhaupt eine PIN: localStorage einer Mini App ist fuer andere
 * Webinhalte nicht lesbar, wohl aber fuer jeden, der Zugriff auf das
 * entsperrte Geraet hat -- und fuer jedes Backup-Werkzeug, das den
 * WebView-Speicher mitnimmt. Eine sechsstellige PIN ist kein starkes
 * Geheimnis, aber sie verwandelt "abschreiben" in "brechen muessen".
 *
 * WIE STARK IST DAS WIRKLICH -- ohne Schoenrechnerei:
 *
 * Sechs Ziffern sind eine Million Moeglichkeiten. Bei 400.000 Runden
 * kostet ein Versuch auf einem schnellen Rechner grob 20 ms, ein
 * vollstaendiger Durchlauf also rund sechs Stunden auf einem Kern. Wer den
 * Tresor in die Hand bekommt und es darauf anlegt, knackt ihn.
 *
 * Was die PIN leistet: Sie schuetzt gegen jemanden, der ein entsperrtes
 * Geraet in die Hand nimmt, und gegen Sicherungswerkzeuge, die den
 * WebView-Speicher mitnehmen. Aus "abschreiben" wird "brechen muessen".
 *
 * Was sie nicht leistet: Schutz vor einem entschlossenen Angreifer mit
 * Zugriff auf die Datei. Der eigentliche Schutz sind und bleiben die
 * aufgeschriebenen zwoelf Woerter -- und, solange das so ist, keine
 * groesseren Betraege auf einem Telefon zu lagern.
 *
 * Mehr Runden wuerden das Entsperren fuer den Besitzer spuerbar verzoegern
 * und den Angreifer nur linear bremsen. Der Hebel liegt nicht in der
 * Rundenzahl, sondern in der Laenge des Geheimnisses.
 */

const STORAGE_KEY = 'yskar.vault.v1';
const PBKDF2_ROUNDS = 400_000;

export interface Vault {
  version: 1;
  salt: string;        // base64
  iv: string;          // base64
  ciphertext: string;  // base64
  address: string;     // im Klartext -- die Adresse ist oeffentlich
  createdAt: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(mnemonic: string, pin: string, address: string): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(mnemonic),
  ));
  return {
    version: 1,
    salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(ciphertext),
    address, createdAt: new Date().toISOString(),
  };
}

export type UnsealResult =
  | { ok: true; mnemonic: string }
  | { ok: false; reason: 'wrong_pin' | 'corrupt' };

export async function unseal(vault: Vault, pin: string): Promise<UnsealResult> {
  try {
    const key = await deriveKey(pin, fromB64(vault.salt));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(vault.iv) as BufferSource },
      key, fromB64(vault.ciphertext) as BufferSource,
    );
    return { ok: true, mnemonic: dec.decode(plain) };
  } catch {
    // AES-GCM prueft die Echtheit mit. Eine falsche PIN und beschaedigte
    // Daten sind hier nicht unterscheidbar -- beides schlaegt fehl, bevor
    // irgendetwas entschluesselt wird.
    return { ok: false, reason: 'wrong_pin' };
  }
}

export function load(): Vault | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Vault;
    return v.version === 1 && v.ciphertext ? v : null;
  } catch { return null; }
}

export function save(vault: Vault): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
}

export function wipe(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasWallet(): boolean {
  return load() !== null;
}
