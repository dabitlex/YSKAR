import { sha256 } from '@noble/hashes/sha2.js';
import { bech32m } from '@scure/base';
import { ADDRESS_BYTES, ADDRESS_HRP } from './params.ts';

/**
 * Adressen.
 *
 * addr = bech32m(hrp='ysr', sha256(pubkey)[0..20])
 *
 * Warum nicht der oeffentliche Schluessel direkt: Er steckt ohnehin in jeder
 * Transaktion, weil die Signatur sonst nicht pruefbar waere. Ein Hash macht
 * die Adresse kuerzer, ohne etwas zu verlieren.
 *
 * 20 Byte wie bei Bitcoin und Ethereum. Was hier zaehlt, ist Zweitbild-
 * Sicherheit -- einen Schluessel zu finden, der auf EINE bestimmte fremde
 * Adresse fuehrt, kostet 2^160.
 *
 * bech32m statt bech32: Es korrigiert den bekannten Schwachpunkt von bech32
 * bei Pruefsummen und erkennt Tippfehler zuverlaessig. Kleinbuchstaben, kein
 * "1", "b", "i" oder "o" -- Verwechslungen fallen auf.
 */

export function addressFromPublicKey(pubkey: Uint8Array): Uint8Array {
  if (pubkey.length !== 32) {
    throw new Error(`pubkey muss 32 Byte sein, ist ${pubkey.length}`);
  }
  return sha256(pubkey).slice(0, ADDRESS_BYTES);
}

export function encodeAddress(raw: Uint8Array): string {
  if (raw.length !== ADDRESS_BYTES) {
    throw new Error(`Adresse muss ${ADDRESS_BYTES} Byte sein, ist ${raw.length}`);
  }
  return bech32m.encode(ADDRESS_HRP, bech32m.toWords(raw));
}

export function decodeAddress(text: string): Uint8Array {
  const { prefix, words } = bech32m.decode(text as `${string}1${string}`);
  if (prefix !== ADDRESS_HRP) {
    throw new Error(`falsches Praefix: ${prefix}, erwartet ${ADDRESS_HRP}`);
  }
  const raw = bech32m.fromWords(words);
  if (raw.length !== ADDRESS_BYTES) {
    throw new Error(`Adresse hat ${raw.length} Byte, erwartet ${ADDRESS_BYTES}`);
  }
  return Uint8Array.from(raw);
}

export function isValidAddress(text: string): boolean {
  try { decodeAddress(text); return true; } catch { return false; }
}

export function addressFor(pubkey: Uint8Array): string {
  return encodeAddress(addressFromPublicKey(pubkey));
}

/** Nullkonto -- Empfaenger fuer verbrannte Betraege, hat keinen Schluessel. */
export const ZERO_ADDRESS = new Uint8Array(ADDRESS_BYTES);
