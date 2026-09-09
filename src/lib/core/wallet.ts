import { ed25519 } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { addressFor, addressFromPublicKey } from './address.ts';

/**
 * Wallet -- wiederherstellbar wie bei Bitcoin.
 *
 * Merkwoerter (BIP39) -> Seed -> Schluessel (SLIP-0010 fuer ed25519).
 *
 * Wer die zwoelf Woerter hat, hat das Guthaben -- auf jedem Geraet, in jeder
 * App, auch ohne diesen Server. Genau das ist der Unterschied zu vorher: Das
 * Eigentum haengt nicht mehr am Telegram-Konto.
 *
 * Die Kehrseite gehoert dazu und muss in der Oberflaeche stehen: Wer die
 * Woerter verliert, verliert das Guthaben endgueltig. Es gibt niemanden, der
 * sie zuruecksetzen kann.
 *
 * Ableitung nach SLIP-0010, weil BIP32 fuer ed25519 nicht funktioniert:
 * Ed25519-Schluessel lassen sich nicht linear addieren, deshalb sind
 * ausschliesslich gehaertete Pfade moeglich.
 *
 *   m/44'/9077'/konto'/0'/index'
 *
 * Der Coin-Type 9077 ist NICHT bei SLIP-0044 registriert. Fuer eine eigene
 * Kette ist das unkritisch, sollte aber bekannt sein, falls YSKAR spaeter in
 * fremde Wallets soll.
 */

export const COIN_TYPE = 9077;
export const DERIVATION_PURPOSE = 44;

export interface Keypair {
  privateKey: Uint8Array;   // 32 Byte, Seed des Ed25519-Schluessels
  publicKey: Uint8Array;    // 32
  address: string;          // bech32m
  addressRaw: Uint8Array;   // 20
  path: string;
}

interface Node { key: Uint8Array; chainCode: Uint8Array }

const ED25519_DOMAIN = new TextEncoder().encode('ed25519 seed');
const HARDENED = 0x80000000;

function masterNode(seed: Uint8Array): Node {
  const I = hmac(sha512, ED25519_DOMAIN, seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function derive(parent: Node, index: number): Node {
  // Nur gehaertete Ableitung -- SLIP-0010 laesst fuer ed25519 nichts anderes zu.
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0;
  data.set(parent.key, 1);
  new DataView(data.buffer).setUint32(33, (index >>> 0) + HARDENED, false);
  const I = hmac(sha512, parent.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

export function derivationPath(account = 0, index = 0): string {
  return `m/${DERIVATION_PURPOSE}'/${COIN_TYPE}'/${account}'/0'/${index}'`;
}

/** Neue Merkwoerter. 12 Woerter = 128 Bit, 24 Woerter = 256 Bit. */
export function createMnemonic(words: 12 | 24 = 12): string {
  return bip39.generateMnemonic(wordlist, words === 24 ? 256 : 128);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

/**
 * Eingabe entschaerfen: doppelte Leerzeichen, Grossschreibung und
 * Zeilenumbrueche aus dem Einfuegen sind der haeufigste Grund, warum eine
 * korrekt notierte Wiederherstellung scheitert.
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

/**
 * Optionale Passphrase ("25. Wort"). Sie erzeugt aus denselben Woertern eine
 * voellig andere Wallet und ist genauso wenig wiederherstellbar.
 */
export function seedFromMnemonic(mnemonic: string, passphrase = ''): Uint8Array {
  const clean = normalizeMnemonic(mnemonic);
  if (!bip39.validateMnemonic(clean, wordlist)) {
    throw new Error('Merkwoerter ungueltig -- Pruefsumme stimmt nicht');
  }
  return bip39.mnemonicToSeedSync(clean, passphrase);
}

export function keypairFromSeed(seed: Uint8Array, account = 0, index = 0): Keypair {
  let node = masterNode(seed);
  for (const level of [DERIVATION_PURPOSE, COIN_TYPE, account, 0, index]) {
    node = derive(node, level);
  }
  const privateKey = node.key;
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    address: addressFor(publicKey),
    addressRaw: addressFromPublicKey(publicKey),
    path: derivationPath(account, index),
  };
}

export function keypairFromMnemonic(
  mnemonic: string, passphrase = '', account = 0, index = 0,
): Keypair {
  return keypairFromSeed(seedFromMnemonic(mnemonic, passphrase), account, index);
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verifySignature(
  signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array,
): boolean {
  try { return ed25519.verify(signature, message, publicKey); }
  catch { return false; }
}
