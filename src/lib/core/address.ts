import { sha256 } from '@noble/hashes/sha2.js';
import { bech32m } from '@scure/base';
import { ADDRESS_BYTES, ADDRESS_HRP } from './params.ts';
import { type Writer, type Reader } from './codec.ts';

/**
 * Adressen.
 *
 * Version 0 (seit Genesis):
 *   programm = sha256(pubkey)[0..20]
 *   text     = bech32m(hrp='ysr', programm)          42 Zeichen, KEIN Versionszeichen
 *   roh      = programm                               20 Byte
 *
 * Version 1 (Konsensfassung 6, docs/CONSENSUS_V6.md Abschnitt 4):
 *   programm = sha256(script)                         32 Byte
 *   text     = bech32m(hrp, [1] | programm)           63 Zeichen, beginnt mit "<hrp>1p"
 *   roh      = 0x01 | programm                        33 Byte
 *
 * Alt und neu unterscheiden sich NUR UEBER DIE LAENGE, nie ueber das
 * Praefix: Eine Adresse der Version 0 beginnt ebenfalls mit "ysr1p", wenn
 * die ersten fuenf Bits ihres Hashes 00001 sind. Wer das erste Zeichen
 * auswertet, baut einen Fehler.
 *
 * Die Rohform ist der Schluessel im Zustand und steht in Transaktionsfeldern,
 * die beide Versionen erlauben (`u8 version | programm` auf der Leitung).
 * Beide Rohformen koennen nicht kollidieren: 20 gegen 33 Byte.
 *
 * Warum nicht der oeffentliche Schluessel direkt: Er steckt ohnehin in jeder
 * Transaktion, weil die Signatur sonst nicht pruefbar waere. Ein Hash macht
 * die Adresse kuerzer, ohne etwas zu verlieren.
 *
 * 20 Byte fuer Version 0 wie bei Bitcoin und Ethereum: Was hier zaehlt, ist
 * Zweitbild-Sicherheit. 32 Byte fuer Version 1, weil in einem Skript
 * mehrere Parteien Schluessel waehlen und 20 Byte dann nur 80 Bit
 * Kollisionsschutz gegeneinander boeten (BIP 341).
 *
 * bech32m statt bech32: Es korrigiert den bekannten Schwachpunkt von bech32
 * bei Pruefsummen und erkennt Tippfehler zuverlaessig.
 */

export const ADDRESS_V0 = 0;
export const ADDRESS_V1 = 1;
export const SCRIPT_PROGRAM_BYTES = 32;
export const MAX_ADDRESS_VERSION = 15;

/** Praefixe je Netz. Nur Kodierungsregel, kein Konsens: die Kette kennt Rohbytes. */
export const HRP_MAINNET = ADDRESS_HRP;
export const HRP_TESTNET = 'tysr';
export const HRP_REGTEST = 'rysr';

export interface VersionedAddress { version: number; program: Uint8Array }

/** Programmlaenge je Version; null fuer Versionen, die es (noch) nicht gibt. */
export function programLength(version: number): number | null {
  if (version === ADDRESS_V0) return ADDRESS_BYTES;
  if (version === ADDRESS_V1) return SCRIPT_PROGRAM_BYTES;
  return null;
}

export function addressFromPublicKey(pubkey: Uint8Array): Uint8Array {
  if (pubkey.length !== 32) {
    throw new Error(`pubkey muss 32 Byte sein, ist ${pubkey.length}`);
  }
  return sha256(pubkey).slice(0, ADDRESS_BYTES);
}

/** Programm einer Version-1-Adresse: der Hash des Skripts. */
export function programFromScript(script: Uint8Array): Uint8Array {
  return sha256(script);
}

// ---------------------------------------------------------------- Rohform

/** Rohform aus Version und Programm. */
export function rawAddress(version: number, program: Uint8Array): Uint8Array {
  const len = programLength(version);
  if (len === null) throw new Error(`unbekannte Adressversion ${version}`);
  if (program.length !== len) {
    throw new Error(`Programm der Version ${version} muss ${len} Byte sein, ist ${program.length}`);
  }
  if (version === ADDRESS_V0) return program;
  const raw = new Uint8Array(1 + len);
  raw[0] = version;
  raw.set(program, 1);
  return raw;
}

/** Version und Programm aus der Rohform. Wirft bei unbekannter Form. */
export function splitRaw(raw: Uint8Array): VersionedAddress {
  if (raw.length === ADDRESS_BYTES) return { version: ADDRESS_V0, program: raw };
  if (raw.length === 1 + SCRIPT_PROGRAM_BYTES && raw[0] === ADDRESS_V1) {
    return { version: ADDRESS_V1, program: raw.slice(1) };
  }
  throw new Error(`keine gueltige Rohadresse (${raw.length} Byte)`);
}

export function isRawAddress(raw: Uint8Array): boolean {
  try { splitRaw(raw); return true; } catch { return false; }
}

export function rawVersion(raw: Uint8Array): number {
  return splitRaw(raw).version;
}

/** Rohform der Version 1 aus einem Skript. */
export function rawAddressFromScript(script: Uint8Array): Uint8Array {
  return rawAddress(ADDRESS_V1, programFromScript(script));
}

// ------------------------------------------------------------- Leitung

/**
 * Versioniertes Adressfeld auf der Leitung: `u8 version | programm`.
 * Ohne Laengenbyte -- der Leser kennt die Laengen der Versionen 0 und 1,
 * jede andere Version ist nicht lesbar (CONSENSUS_V6.md 4.3).
 */
export function writeAddress(w: Writer, raw: Uint8Array): Writer {
  const { version, program } = splitRaw(raw);
  return w.u8(version).bytes(program);
}

export function readAddress(r: Reader): Uint8Array {
  const version = r.u8();
  const len = programLength(version);
  if (len === null) throw new Error(`unknown_address_version:${version}`);
  return rawAddress(version, r.bytes(len));
}

/** Groesse des Feldes auf der Leitung. */
export function addressWireBytes(raw: Uint8Array): number {
  return 1 + splitRaw(raw).program.length;
}

// ------------------------------------------------------------- Textform

/** Textform der Version 0 -- unveraendert seit Genesis. */
export function encodeAddress(raw: Uint8Array, hrp: string = ADDRESS_HRP): string {
  const { version, program } = splitRaw(raw);
  if (version === ADDRESS_V0) {
    return bech32m.encode(hrp, bech32m.toWords(program));
  }
  return bech32m.encode(hrp, [version, ...bech32m.toWords(program)]);
}

/**
 * Textform lesen. Liefert die Rohform; wirft bei falschem Praefix, falscher
 * Laenge oder einer Version, die es nicht gibt.
 *
 * Wer eine Adresse einer spaeteren Fassung nur ANZEIGEN will, nimmt
 * decodeAddressAny(): Sie liest Versionen 2 bis 15 syntaktisch mit.
 */
export function decodeAddress(text: string, hrp: string = ADDRESS_HRP): Uint8Array {
  const { version, program } = decodeAddressAny(text, hrp);
  const len = programLength(version);
  if (len === null) throw new Error(`unbekannte Adressversion ${version}`);
  if (program.length !== len) {
    throw new Error(`Adresse der Version ${version} hat ${program.length} Byte, erwartet ${len}`);
  }
  return rawAddress(version, program);
}

/**
 * Textform lesen, ohne die Version zu bewerten. Version 0 erkennt sich an
 * genau 32 Datenzeichen; alles andere ist `[v] | programm` mit v = 1..15 und
 * ganzen Bytes. 32 Datenzeichen koennen nie eine versionierte Adresse sein:
 * 31 Zeichen sind 155 Bit, keine ganzen Bytes.
 */
export function decodeAddressAny(text: string, hrp: string = ADDRESS_HRP): VersionedAddress {
  const { prefix, words } = bech32m.decode(text as `${string}1${string}`, 90);
  if (prefix !== hrp) {
    throw new Error(`falsches Praefix: ${prefix}, erwartet ${hrp}`);
  }
  if (words.length === 32) {
    return { version: ADDRESS_V0, program: Uint8Array.from(bech32m.fromWords(words)) };
  }
  const version = words[0];
  if (version === undefined || version < 1 || version > MAX_ADDRESS_VERSION) {
    throw new Error(`unzulaessige Adressversion ${version}`);
  }
  // fromWords prueft das Padding (kuerzer als 5 Bit, nur Nullen) und wirft sonst.
  const program = Uint8Array.from(bech32m.fromWords(words.slice(1)));
  return { version, program };
}

export function isValidAddress(text: string, hrp: string = ADDRESS_HRP): boolean {
  try { decodeAddress(text, hrp); return true; } catch { return false; }
}

export function addressFor(pubkey: Uint8Array, hrp: string = ADDRESS_HRP): string {
  return encodeAddress(addressFromPublicKey(pubkey), hrp);
}

/** Textform einer Version-1-Adresse aus einem Skript. */
export function addressForScript(script: Uint8Array, hrp: string = ADDRESS_HRP): string {
  return encodeAddress(rawAddressFromScript(script), hrp);
}

/** Nullkonto -- Empfaenger fuer verbrannte Betraege, hat keinen Schluessel. */
export const ZERO_ADDRESS = new Uint8Array(ADDRESS_BYTES);
