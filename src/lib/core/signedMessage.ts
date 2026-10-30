/**
 * Signierte Nachrichten -- das Format, auf das sich YSKAR Wallet, Node Core,
 * Full Node und YSKAR Lab geeinigt haben (Konzept YSKAR Lab, 29.10.2026).
 *
 *   YSKAR Signed Message
 *   purpose: login                      oder   purpose: text
 *   domain: lab.yskar.app                       (Leerzeile)
 *   address: ysr1…                              <freier Text>
 *   nonce: <32 Hex, klein>
 *   issued: <YYYY-MM-DDTHH:MM:SSZ>
 *   expires: <YYYY-MM-DDTHH:MM:SSZ>
 *
 * Unterschrieben wird Ed25519 ueber die rohen UTF-8-Bytes der GANZEN
 * Nachricht, ohne weiteres Hashen. Geprueft wird nach derselben Regel wie in
 * der Kette (verifySignature, CONSENSUS_V6.md 7.8).
 *
 * WARUM DIE KOPFZEILE: Eine Transaktion ist ein Binaerformat und beginnt nie
 * mit "YSKAR Signed Message\n". Eine signierte Nachricht kann deshalb nie als
 * Ueberweisung gelten -- egal, was im Text steht. Wer etwas ohne Kopfzeile
 * signieren will, bekommt sie davorgesetzt und sieht vorher den ganzen Text.
 *
 * Nur Adressen der Version 0 gehoeren zu genau einem Schluessel; nur sie
 * koennen signieren.
 */
import { addressFor, decodeAddressAny, ADDRESS_V0 } from './address.ts';
import { sign, verifySignature, type Keypair } from './wallet.ts';
import { toHex, fromHex } from './codec.ts';

export const KOPFZEILE = 'YSKAR Signed Message';
/** Groesste Nachricht in Bytes. Mehr braucht keine Anmeldung und kein Beleg. */
export const NACHRICHT_MAX = 4096;
/** Eine Anmeldung darf hoechstens so lange in der Zukunft ablaufen. */
export const ANMELDUNG_MAX_MS = 15 * 60_000;
/** Spielraum fuer Uhren, die etwas vorgehen ("issued" in der Zukunft). */
const UHR_SPIEL_MS = 5 * 60_000;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export interface Anmeldung {
  domain: string;
  address: string;
  nonce: string;
  issued: string;
  expires: string;
}

export type Nachricht =
  | { art: 'login'; anmeldung: Anmeldung }
  | { art: 'text'; text: string };

export interface Signiert {
  address: string;
  publicKey: string;
  signature: string;
  message: string;
}

export class NachrichtFehler extends Error {
  code: string;
  constructor(code: string, text: string) { super(text); this.code = code; }
}

/** Adresse der Version 0 (ein Schluessel), sonst false. */
export function istSchluesselAdresse(text: string): boolean {
  try { return decodeAddressAny(text).version === ADDRESS_V0; } catch { return false; }
}

/** Darf eine Anmeldung fuer diese Domain unterschrieben werden? Nur yskar.app und Subdomains. */
export function erlaubteDomain(domain: string): boolean {
  return DOMAIN.test(domain) && (domain === 'yskar.app' || domain.endsWith('.yskar.app'));
}

function iso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function baueAnmeldung(a: Anmeldung): string {
  return [KOPFZEILE, 'purpose: login', `domain: ${a.domain}`, `address: ${a.address}`,
    `nonce: ${a.nonce}`, `issued: ${a.issued}`, `expires: ${a.expires}`].join('\n');
}

/** Freier Text mit Kopfzeile. */
export function baueText(text: string): string {
  return `${KOPFZEILE}\npurpose: text\n\n${text}`;
}

/**
 * Liest eine Nachricht streng: genau die Zeilen in genau der Reihenfolge.
 * Wirft NachrichtFehler, wenn das Format nicht stimmt.
 */
export function lies(nachricht: string): Nachricht {
  if (typeof nachricht !== 'string' || nachricht.length === 0) throw new NachrichtFehler('leer', 'The message is empty.');
  if (new TextEncoder().encode(nachricht).length > NACHRICHT_MAX) {
    throw new NachrichtFehler('zu_lang', `The message is longer than ${NACHRICHT_MAX} bytes.`);
  }
  if (nachricht.includes('\r')) throw new NachrichtFehler('zeilenende', 'Line endings must be \\n, not \\r\\n.');
  const zeilen = nachricht.split('\n');
  if (zeilen[0] !== KOPFZEILE) throw new NachrichtFehler('kopf', `The message does not start with "${KOPFZEILE}".`);
  if (zeilen[1] === 'purpose: text') {
    if (zeilen[2] !== '' || zeilen.length < 4) throw new NachrichtFehler('format', 'A text message needs an empty line after "purpose: text".');
    return { art: 'text', text: zeilen.slice(3).join('\n') };
  }
  if (zeilen[1] !== 'purpose: login') throw new NachrichtFehler('zweck', 'Unknown purpose. Only "login" and "text" are signed.');
  if (zeilen.length !== 7) throw new NachrichtFehler('format', 'A login message has exactly seven lines.');
  const felder = ['domain', 'address', 'nonce', 'issued', 'expires'] as const;
  const a: Partial<Anmeldung> = {};
  felder.forEach((f, i) => {
    const z = zeilen[i + 2];
    if (!z.startsWith(`${f}: `)) throw new NachrichtFehler('format', `Line ${i + 3} must start with "${f}: ".`);
    const wert = z.slice(f.length + 2);
    if (wert === '' || wert !== wert.trim()) throw new NachrichtFehler('format', `The value of "${f}" has spaces at the edge.`);
    a[f] = wert;
  });
  const an = a as Anmeldung;
  if (!DOMAIN.test(an.domain)) throw new NachrichtFehler('format', 'The domain is not valid.');
  if (!/^[0-9a-f]{32}$/.test(an.nonce)) throw new NachrichtFehler('format', 'The nonce must be 32 lower-case hex characters.');
  if (!ISO.test(an.issued) || !ISO.test(an.expires)) throw new NachrichtFehler('format', 'Times must look like 2026-11-02T11:50:00Z.');
  if (!istSchluesselAdresse(an.address)) throw new NachrichtFehler('format', 'The address cannot sign (ysr1… with one key).');
  return { art: 'login', anmeldung: an };
}

/**
 * Was eine Wallet vor dem Unterschreiben prueft. Text ohne Kopfzeile bekommt
 * sie davorgesetzt; eine Anmeldung muss fuer yskar.app (oder eine Subdomain)
 * sein, die eigene Adresse nennen und noch gelten -- hoechstens 15 Minuten.
 */
export function vorbereiten(eingabe: string, eigeneAdresse: string, jetzt = new Date()): { nachricht: string; inhalt: Nachricht } {
  const roh = typeof eingabe === 'string' ? eingabe.replace(/\r\n/g, '\n') : '';
  const nachricht = roh.startsWith(KOPFZEILE + '\n') ? roh : baueText(roh);
  const inhalt = lies(nachricht);
  if (inhalt.art === 'text') {
    if (inhalt.text.trim() === '') throw new NachrichtFehler('leer', 'There is no text to sign.');
    return { nachricht, inhalt };
  }
  const a = inhalt.anmeldung;
  if (!erlaubteDomain(a.domain)) {
    throw new NachrichtFehler('domain', `Sign-ins are only signed for yskar.app and its subdomains, not for "${a.domain}".`);
  }
  if (a.address !== eigeneAdresse) throw new NachrichtFehler('adresse', 'The message names a different address than this wallet.');
  const ab = Date.parse(a.issued), bis = Date.parse(a.expires), t = jetzt.getTime();
  if (bis <= t) throw new NachrichtFehler('abgelaufen', 'This sign-in has expired. Ask the website for a new one.');
  if (bis - t > ANMELDUNG_MAX_MS) throw new NachrichtFehler('zu_lange', 'This sign-in is valid for more than 15 minutes. It is not signed.');
  if (ab > t + UHR_SPIEL_MS || ab > bis) throw new NachrichtFehler('zeit', 'The times in this sign-in do not fit together.');
  return { nachricht, inhalt };
}

/** Unterschreibt eine (vorbereitete) Nachricht. Nur Text mit Kopfzeile, nie etwas anderes. */
export function unterschreibe(nachricht: string, schluessel: Keypair): Signiert {
  lies(nachricht);   // wirft, wenn es keine Nachricht im Format ist
  const sig = sign(new TextEncoder().encode(nachricht), schluessel.privateKey);
  return { address: schluessel.address, publicKey: toHex(schluessel.publicKey), signature: toHex(sig), message: nachricht };
}

export type Pruefung =
  | { gueltig: true; address: string; inhalt: Nachricht }
  | { gueltig: false; grund: 'format' | 'adresse' | 'schluessel' | 'signatur'; text: string };

/**
 * Prueft ein Ergebnis {address, publicKey, signature, message}: Format, Schluessel
 * passt zur Adresse, Signatur gueltig. Zeit und Domain prueft, wer die Anmeldung
 * ausgestellt hat -- hier geht es nur darum, ob die Unterschrift echt ist.
 */
export function pruefe(s: Partial<Signiert>): Pruefung {
  let inhalt: Nachricht;
  try { inhalt = lies(String(s.message ?? '')); }
  catch (e) { return { gueltig: false, grund: 'format', text: (e as Error).message }; }
  const pk = typeof s.publicKey === 'string' && /^[0-9a-fA-F]{64}$/.test(s.publicKey) ? fromHex(s.publicKey.toLowerCase()) : null;
  const sig = typeof s.signature === 'string' && /^[0-9a-fA-F]{128}$/.test(s.signature) ? fromHex(s.signature.toLowerCase()) : null;
  if (!pk || !sig) return { gueltig: false, grund: 'format', text: 'Public key (64 hex) or signature (128 hex) is missing.' };
  const adresse = addressFor(pk);
  if (typeof s.address !== 'string' || s.address.trim() !== adresse) {
    return { gueltig: false, grund: 'schluessel', text: 'The public key does not belong to this address.' };
  }
  if (inhalt.art === 'login' && inhalt.anmeldung.address !== adresse) {
    return { gueltig: false, grund: 'adresse', text: 'The message names a different address.' };
  }
  if (!verifySignature(sig, new TextEncoder().encode(String(s.message)), pk)) {
    return { gueltig: false, grund: 'signatur', text: 'The signature is not valid for this message.' };
  }
  return { gueltig: true, address: adresse, inhalt };
}

/** Liest ein eingefuegtes Ergebnis (JSON). Tolerant bei Leerraum, streng beim Inhalt. */
export function liesErgebnis(text: string): Partial<Signiert> | null {
  try {
    const v = JSON.parse(String(text).trim()) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return null;
    const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : undefined);
    return { address: s('address')?.trim(), publicKey: s('publicKey')?.trim(), signature: s('signature')?.trim(), message: s('message') };
  } catch { return null; }
}

// -------------------------------------------------------------- Anmelden per Link

export interface Link { nachricht: string; ruf: string }

/**
 * Liest einen Link yskar:login?msg=<base64url>&cb=<base64url>.
 * Der Rueckruf muss https sein und genau auf die Domain der Nachricht zeigen
 * (ohne Port, ohne Benutzer), sonst wird nichts unterschrieben.
 */
export function liesLink(link: string): Link {
  if (typeof link !== 'string' || link.length > 8192) throw new NachrichtFehler('link', 'This is not a YSKAR sign-in link.');
  const m = /^yskar:(?:\/\/)?login\?(.*)$/.exec(link.trim());
  if (!m) throw new NachrichtFehler('link', 'This is not a YSKAR sign-in link.');
  const p = new URLSearchParams(m[1]);
  const b64 = (s: string | null) => {
    if (!s || !/^[A-Za-z0-9_-]+={0,2}$/.test(s)) throw new NachrichtFehler('link', 'The sign-in link is damaged.');
    return Buffer.from(s, 'base64url').toString('utf8');
  };
  const nachricht = b64(p.get('msg'));
  const ruf = b64(p.get('cb'));
  const inhalt = lies(nachricht);
  if (inhalt.art !== 'login') throw new NachrichtFehler('link', 'A sign-in link must contain a login message.');
  let u: URL;
  try { u = new URL(ruf); } catch { throw new NachrichtFehler('ruf', 'The sign-in link has no valid return address.'); }
  if (u.protocol !== 'https:' || u.port !== '' || u.username || u.password || u.hostname !== inhalt.anmeldung.domain) {
    throw new NachrichtFehler('ruf', `The return address does not belong to ${inhalt.anmeldung.domain}.`);
  }
  if (!erlaubteDomain(u.hostname)) {
    throw new NachrichtFehler('domain', `Sign-ins are only signed for yskar.app and its subdomains, not for "${u.hostname}".`);
  }
  return { nachricht, ruf };
}

/**
 * Schickt das Ergebnis an den Rueckruf. Vereinbart: genau ein POST, 2xx mit
 * {"ok":true} ist Erfolg, 4xx mit {"ok":false,"error":"<Text>"} ein Fehler,
 * eine Weiterleitung gilt als Fehler, nach 15 Sekunden wird abgebrochen.
 */
export async function sendeAnRuf(ruf: string, s: Signiert, holen: typeof fetch = fetch): Promise<{ ok: boolean; text: string }> {
  let antwort: Response;
  try {
    antwort = await holen(ruf, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, text: 'The website could not be reached.' };
  }
  if ((antwort.status >= 300 && antwort.status < 400) || antwort.type === 'opaqueredirect') {
    return { ok: false, text: 'The website answered with a redirect. Nothing was sent further.' };
  }
  type Antwort = { ok?: unknown; error?: unknown };
  const daten: Antwort | null = await antwort.json().then(v => (v && typeof v === 'object' ? v as Antwort : null), () => null);
  if (antwort.ok && daten?.ok === true) return { ok: true, text: '' };
  const text = typeof daten?.error === 'string' ? daten.error.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200) : `The website answered ${antwort.status}.`;
  return { ok: false, text };
}

export const _fuerTests = { iso };
