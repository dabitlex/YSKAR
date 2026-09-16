import { Writer, Reader, toHex } from './codec.ts';
import { sha256d } from './hash.ts';
import { sign, verifySignature } from './wallet.ts';
import { addressFromPublicKey } from './address.ts';
import { CHAIN_ID, MAX_MEMO_BYTES, MIN_FEE, ADDRESS_BYTES,
         COINBASE_V2, MAX_COINBASE_OUTPUTS } from './params.ts';

/**
 * Transaktionen -- Kontomodell, nicht UTXO.
 *
 * Fuer eine Wallet auf dem Handy ist das Kontomodell deutlich einfacher: kein
 * Auswaehlen von Eingaengen, kleinere Transaktionen, verstaendliche Salden.
 *
 * Wiederholungsschutz ueber eine fortlaufende Nonce je Absender. Jede
 * Transaktion muss genau die naechste Nonce des Kontos tragen; damit ist sie
 * ausserdem in eine feste Reihenfolge gebracht.
 *
 * Die Signatur deckt CHAIN_ID mit ab. Eine auf dem Testnet gueltige
 * Transaktion ist damit auf dem Mainnet wertlos.
 */

export const TX_TRANSFER = 1;
export const TX_COINBASE = 0;
export const TX_VERSION = 1;

export interface Transfer {
  type: typeof TX_TRANSFER;
  version: number;
  from: Uint8Array;        // 20
  to: Uint8Array;          // 20
  amount: bigint;
  fee: bigint;
  nonce: bigint;
  validUntil: number;      // Blockhoehe, 0 = unbegrenzt
  memo: Uint8Array;        // 0..32
  publicKey: Uint8Array;   // 32
  signature: Uint8Array;   // 64
}

/** Ein Empfaenger der Coinbase. */
export interface CoinbaseOutput {
  to: Uint8Array;          // 20
  amount: bigint;
}

/**
 * Coinbase -- der Block zahlt sich selbst aus.
 *
 * ZWEI FASSUNGEN, und das ist Konsens:
 *
 *   version 1  genau ein Empfaenger. Die urspruengliche Fassung, fuer immer
 *              gueltig, byteweise unveraendert.
 *   version 2  ein bis MAX_COINBASE_OUTPUTS Empfaenger. Erst ab der
 *              Aktivierungshoehe zulaessig. Grundlage fuer Pool Mining, bei
 *              dem der Block selbst alle Beteiligten auszahlt und der
 *              Betreiber nie fremdes Geld haelt.
 *
 * Intern immer eine Liste. Fassung 1 ist der Sonderfall mit genau einem
 * Eintrag -- so gibt es nur einen Pfad fuer Zustand und Pruefung, statt
 * zweier, die auseinanderlaufen koennen.
 */
export interface Coinbase {
  type: typeof TX_COINBASE;
  version: number;
  height: number;
  outputs: CoinbaseOutput[];
  extra: Uint8Array;       // 0..32, macht den txid eindeutig
}

/** Summe aller Empfaenger. Das ist der Betrag, der neu entsteht. */
export function coinbaseTotal(cb: Coinbase): bigint {
  let summe = 0n;
  for (const o of cb.outputs) summe += o.amount;
  return summe;
}

export type Tx = Transfer | Coinbase;

/** Die signierten Felder. Enthaelt CHAIN_ID, aber nicht die Signatur. */
export function signingBytes(t: Omit<Transfer, 'signature' | 'publicKey'>): Uint8Array {
  if (t.memo.length > MAX_MEMO_BYTES) throw new Error('memo zu lang');
  return new Writer()
    .bytes(CHAIN_ID, 32)
    .u16(t.version)
    .u8(TX_TRANSFER)
    .bytes(t.from, ADDRESS_BYTES)
    .bytes(t.to, ADDRESS_BYTES)
    .u64(t.amount)
    .u64(t.fee)
    .u64(t.nonce)
    .u32(t.validUntil)
    .u8(t.memo.length)
    .bytes(t.memo)
    .finish();
}

export function sighash(t: Omit<Transfer, 'signature' | 'publicKey'>): Uint8Array {
  return sha256d(signingBytes(t));
}

/** Uebertragungsformat. CHAIN_ID steckt nur im Sighash, nicht auf der Leitung. */
export function serializeTx(t: Tx): Uint8Array {
  const w = new Writer().u16(t.version).u8(t.type);
  if (t.type === TX_COINBASE) {
    w.u32(t.height);
    if (t.version === COINBASE_V2) {
      // Anzahl voran, danach die Empfaenger. Fassung 1 hat kein Zaehlfeld --
      // nur so bleiben alte Bloecke byteweise identisch.
      w.u8(t.outputs.length);
      for (const o of t.outputs) w.bytes(o.to, ADDRESS_BYTES).u64(o.amount);
    } else {
      const einziger = t.outputs[0];
      if (!einziger || t.outputs.length !== 1) {
        throw new Error('Coinbase der Fassung 1 hat genau einen Empfaenger');
      }
      w.bytes(einziger.to, ADDRESS_BYTES).u64(einziger.amount);
    }
    return w.u8(t.extra.length).bytes(t.extra).finish();
  }
  return w
    .bytes(t.from, ADDRESS_BYTES).bytes(t.to, ADDRESS_BYTES)
    .u64(t.amount).u64(t.fee).u64(t.nonce).u32(t.validUntil)
    .u8(t.memo.length).bytes(t.memo)
    .bytes(t.publicKey, 32).bytes(t.signature, 64)
    .finish();
}

export function deserializeTx(bytes: Uint8Array): Tx {
  const r = new Reader(bytes);
  const version = r.u16();
  const type = r.u8();
  if (type === TX_COINBASE) {
    const height = r.u32();
    const outputs: CoinbaseOutput[] = [];
    if (version === COINBASE_V2) {
      const anzahl = r.u8();
      if (anzahl < 1 || anzahl > MAX_COINBASE_OUTPUTS) {
        throw new Error(`Coinbase mit ${anzahl} Empfaengern ist unzulaessig`);
      }
      for (let i = 0; i < anzahl; i++) {
        outputs.push({ to: r.bytes(ADDRESS_BYTES), amount: r.u64() });
      }
    } else {
      outputs.push({ to: r.bytes(ADDRESS_BYTES), amount: r.u64() });
    }
    const extra = r.bytes(r.u8());
    return { type: TX_COINBASE, version, height, outputs, extra };
  }
  if (type !== TX_TRANSFER) throw new Error(`unbekannter Transaktionstyp ${type}`);
  const from = r.bytes(ADDRESS_BYTES);
  const to = r.bytes(ADDRESS_BYTES);
  const amount = r.u64();
  const fee = r.u64();
  const nonce = r.u64();
  const validUntil = r.u32();
  const memo = r.bytes(r.u8());
  const publicKey = r.bytes(32);
  const signature = r.bytes(64);
  return { type: TX_TRANSFER, version, from, to, amount, fee, nonce,
           validUntil, memo, publicKey, signature };
}

export function txid(t: Tx): Uint8Array {
  return sha256d(serializeTx(t));
}

export function txidHex(t: Tx): string {
  return toHex(txid(t));
}

export function buildTransfer(params: {
  from: Uint8Array; to: Uint8Array; amount: bigint; fee: bigint;
  nonce: bigint; validUntil?: number; memo?: Uint8Array;
  publicKey: Uint8Array; privateKey: Uint8Array;
}): Transfer {
  // Typannotation statt "as const": In einem veraenderlichen Objektliteral
  // weitet TypeScript den Literaltyp 1 sonst zu number, und das passt dann
  // nicht mehr zu Transfer. Die Annotation gibt den Kontext vor.
  const base: Omit<Transfer, 'publicKey' | 'signature'> = {
    type: TX_TRANSFER,
    version: TX_VERSION,
    from: params.from, to: params.to,
    amount: params.amount, fee: params.fee, nonce: params.nonce,
    validUntil: params.validUntil ?? 0,
    memo: params.memo ?? new Uint8Array(0),
  };
  return {
    ...base,
    publicKey: params.publicKey,
    signature: sign(sighash(base), params.privateKey),
  };
}

export type TxError =
  | 'bad_version' | 'bad_amount' | 'fee_too_low' | 'memo_too_long'
  | 'pubkey_mismatch' | 'bad_signature' | 'self_transfer' | 'expired';

/**
 * Pruefungen, die ohne Kenntnis des Kontostands moeglich sind. Guthaben und
 * Nonce prueft erst state.ts beim Anwenden.
 */
export function checkTransfer(t: Transfer, atHeight?: number): TxError | null {
  if (t.version !== TX_VERSION) return 'bad_version';
  if (t.amount <= 0n) return 'bad_amount';
  if (t.fee < MIN_FEE) return 'fee_too_low';
  if (t.memo.length > MAX_MEMO_BYTES) return 'memo_too_long';
  if (t.validUntil !== 0 && atHeight !== undefined && atHeight > t.validUntil) return 'expired';

  const derived = addressFromPublicKey(t.publicKey);
  if (toHex(derived) !== toHex(t.from)) return 'pubkey_mismatch';
  if (toHex(t.from) === toHex(t.to)) return 'self_transfer';

  const { signature, publicKey, ...unsigned } = t;
  if (!verifySignature(signature, sighash(unsigned), publicKey)) return 'bad_signature';
  return null;
}
