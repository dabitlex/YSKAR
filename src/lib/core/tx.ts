import { Writer, Reader, toHex } from './codec.ts';
import { sha256d } from './hash.ts';
import { sign, verifySignature } from './wallet.ts';
import {
  addressFromPublicKey, rawAddress, isRawAddress, readAddress, writeAddress, compareAddressWire,
  ADDRESS_V1, SCRIPT_PROGRAM_BYTES,
} from './address.ts';
import {
  CHAIN_ID, MAX_MEMO_BYTES, MIN_FEE, ADDRESS_BYTES, FEE_V3_HEIGHT, DUST_LIMIT, minFeeAt,
  COINBASE_V2, MAX_COINBASE_OUTPUTS_V6, V6_HEIGHT, FORK_ID_V6, MAX_BATCH_OUTPUTS,
} from './params.ts';
import {
  decodeScript, decodeWitness, evaluateScript, scriptHash, witnessSigops, type ScriptNode,
} from './script.ts';

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
 *
 * KONSENSFASSUNG 6 (docs/CONSENSUS_V6.md, Abschnitt 6). Ab v6Height:
 *
 *   Typ 1, Fassung 2   Ueberweisung mit `flags`, `validFrom` und
 *                      versioniertem Empfaenger. Fassung 1 ist ab der Hoehe
 *                      ungueltig -- so kann keine alte Signatur auf der neuen
 *                      Kette wiederverwendet werden.
 *   Typ 2              Ausgabe aus einem Skript-Konto (Adressversion 1):
 *                      legt Skript und Witness offen.
 *   Typ 3              Sammelzahlung aus einem Schluessel-Konto an bis zu
 *                      MAX_BATCH_OUTPUTS Empfaenger.
 *
 * Jeder Sighash der Fassung 6 beginnt mit
 *   u8 typ | u32 FORK_ID_V6 | chainId(32) | u16 version | u8 flags
 * -- Typ zuerst (EIP-2718), dann die Fork-Kennung (ZIP 200), dann das Netz.
 *
 * Auf der Leitung bleibt die Reihenfolge `u16 version | u8 typ`, damit der
 * Leser wie bisher erst Version und Typ sieht und dann das Layout kennt.
 */

export const TX_COINBASE = 0;
export const TX_TRANSFER = 1;
export const TX_SCRIPT_SPEND = 2;
export const TX_BATCH = 3;

/** Fassung einer Ueberweisung bis Konsensfassung 6. */
export const TX_VERSION = 1;
/** Fassung einer Ueberweisung ab Konsensfassung 6. */
export const TRANSFER_V2 = 2;

export interface Transfer {
  type: typeof TX_TRANSFER;
  version: number;
  /** Ab Fassung 2; muss 0 sein. */
  flags?: number;
  from: Uint8Array;        // 20, Version 0
  /** Rohform des Empfaengers: 20 Byte (Version 0) oder 33 Byte (Version 1). Fassung 1: nur 20. */
  to: Uint8Array;
  amount: bigint;
  fee: bigint;
  nonce: bigint;
  /** Ab Fassung 2: erste Hoehe, 0 = keine Untergrenze. */
  validFrom?: number;
  validUntil: number;      // Blockhoehe, 0 = unbegrenzt
  memo: Uint8Array;        // 0..32
  publicKey: Uint8Array;   // 32
  signature: Uint8Array;   // 64
}

/** Ausgabe aus einem Skript-Konto -- Typ 2 (CONSENSUS_V6.md 6.5). */
export interface ScriptSpend {
  type: typeof TX_SCRIPT_SPEND;
  version: number;
  flags: number;
  /** Programm des Absenders (Skript-Hash, 32 Byte). Rohadresse = 0x01 | from. */
  from: Uint8Array;
  to: Uint8Array;          // Rohform, 20 oder 33
  amount: bigint;
  fee: bigint;
  nonce: bigint;
  validFrom: number;
  validUntil: number;
  memo: Uint8Array;
  script: Uint8Array;      // 1..MAX_SCRIPT_BYTES
  witness: Uint8Array;     // ein Slot je Blatt
}

export interface BatchOutput { to: Uint8Array; amount: bigint }

/** Sammelzahlung -- Typ 3 (CONSENSUS_V6.md 6.4). */
export interface Batch {
  type: typeof TX_BATCH;
  version: number;
  flags: number;
  from: Uint8Array;        // 20, Version 0
  outputs: BatchOutput[];  // 1..MAX_BATCH_OUTPUTS, streng aufsteigend nach Rohadresse
  fee: bigint;
  nonce: bigint;
  validFrom: number;
  validUntil: number;
  memo: Uint8Array;
  publicKey: Uint8Array;
  signature: Uint8Array;
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
 *   version 2  ein bis MAX_COINBASE_OUTPUTS Empfaenger (255 ab Fassung 6).
 *              Erst ab der Aktivierungshoehe zulaessig. Grundlage fuer Pool
 *              Mining, bei dem der Block selbst alle Beteiligten auszahlt
 *              und der Betreiber nie fremdes Geld haelt.
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

export type Tx = Transfer | Coinbase | ScriptSpend | Batch;
/** Alles, was ein Konto belastet. */
export type Spend = Transfer | ScriptSpend | Batch;

export function isSpend(t: Tx): t is Spend {
  return t.type !== TX_COINBASE;
}

/** Rohadresse des Absenders -- der Schluessel seines Kontos im Zustand. */
export function senderRaw(t: Spend): Uint8Array {
  return t.type === TX_SCRIPT_SPEND ? rawAddress(ADDRESS_V1, t.from) : t.from;
}

/** Alle Empfaenger einer Ausgabe mit Betrag -- bei Typ 1 und 2 genau einer. */
export function spendOutputs(t: Spend): { to: Uint8Array; amount: bigint }[] {
  return t.type === TX_BATCH ? t.outputs : [{ to: t.to, amount: t.amount }];
}

/** Summe der Betraege ohne Gebuehr. */
export function spendAmount(t: Spend): bigint {
  if (t.type !== TX_BATCH) return t.amount;
  let s = 0n;
  for (const o of t.outputs) s += o.amount;
  return s;
}

/** Was der Absender insgesamt hergibt: Betraege plus Gebuehr. */
export function spendTotal(t: Spend): bigint {
  if (t.type === TX_BATCH) {
    let s = t.fee;
    for (const o of t.outputs) s += o.amount;
    return s;
  }
  return t.amount + t.fee;
}

// ------------------------------------------------------------ Sighash

/** Die signierten Felder einer Ueberweisung. Enthaelt CHAIN_ID, aber nicht die Signatur. */
export function signingBytes(t: Omit<Transfer, 'signature' | 'publicKey'>, chainId: Uint8Array = CHAIN_ID): Uint8Array {
  if (t.memo.length > MAX_MEMO_BYTES) throw new Error('memo zu lang');
  if (t.version === TX_VERSION) {
    return new Writer()
      .bytes(chainId, 32)
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
  const w = v6Prefix(TX_TRANSFER, t.version, t.flags ?? 0, chainId)
    .bytes(t.from, ADDRESS_BYTES);
  writeAddress(w, t.to);
  return w.u64(t.amount).u64(t.fee).u64(t.nonce)
    .u32(t.validFrom ?? 0).u32(t.validUntil)
    .u8(t.memo.length).bytes(t.memo)
    .finish();
}

function v6Prefix(type: number, version: number, flags: number, chainId: Uint8Array): Writer {
  return new Writer().u8(type).u32(FORK_ID_V6).bytes(chainId, 32).u16(version).u8(flags);
}

export function sighash(t: Omit<Transfer, 'signature' | 'publicKey'>, chainId: Uint8Array = CHAIN_ID): Uint8Array {
  return sha256d(signingBytes(t, chainId));
}

export function scriptSpendSigningBytes(t: Omit<ScriptSpend, 'witness'>, chainId: Uint8Array = CHAIN_ID): Uint8Array {
  const w = v6Prefix(TX_SCRIPT_SPEND, t.version, t.flags, chainId)
    .bytes(t.from, SCRIPT_PROGRAM_BYTES);
  writeAddress(w, t.to);
  return w.u64(t.amount).u64(t.fee).u64(t.nonce)
    .u32(t.validFrom).u32(t.validUntil)
    .u8(t.memo.length).bytes(t.memo)
    .u16(t.script.length).bytes(t.script)
    .finish();
}

export function scriptSpendSighash(t: Omit<ScriptSpend, 'witness'>, chainId: Uint8Array = CHAIN_ID): Uint8Array {
  return sha256d(scriptSpendSigningBytes(t, chainId));
}

export function batchSigningBytes(t: Omit<Batch, 'signature' | 'publicKey'>, chainId: Uint8Array = CHAIN_ID): Uint8Array {
  const w = v6Prefix(TX_BATCH, t.version, t.flags, chainId)
    .bytes(t.from, ADDRESS_BYTES)
    .u16(t.outputs.length);
  for (const o of t.outputs) { writeAddress(w, o.to); w.u64(o.amount); }
  return w.u64(t.fee).u64(t.nonce)
    .u32(t.validFrom).u32(t.validUntil)
    .u8(t.memo.length).bytes(t.memo)
    .finish();
}

export function batchSighash(t: Omit<Batch, 'signature' | 'publicKey'>, chainId: Uint8Array = CHAIN_ID): Uint8Array {
  return sha256d(batchSigningBytes(t, chainId));
}

/** Sighash einer beliebigen Ausgabe -- fuer Wallets, Mempool und Tests. */
export function spendSighash(t: Spend, chainId: Uint8Array = CHAIN_ID): Uint8Array {
  switch (t.type) {
    case TX_TRANSFER: { const { signature, publicKey, ...u } = t; return sighash(u, chainId); }
    case TX_SCRIPT_SPEND: { const { witness, ...u } = t; return scriptSpendSighash(u, chainId); }
    case TX_BATCH: { const { signature, publicKey, ...u } = t; return batchSighash(u, chainId); }
  }
}

// ------------------------------------------------------------ Leitung

/** Groesse einer Ueberweisung der Fassung 1 auf der Leitung: 168 Byte plus Notiz. */
export const TRANSFER_BASE_BYTES = 2 + 1 + ADDRESS_BYTES * 2 + 8 + 8 + 8 + 4 + 1 + 32 + 64;
export const transferBytes = (memoLength: number): number => TRANSFER_BASE_BYTES + memoLength;
/** Fassung 2 mit Empfaenger der Version 0: 174 Byte plus Notiz (flags, validFrom, Versionsbyte). */
export const TRANSFER_V2_BASE_BYTES = TRANSFER_BASE_BYTES + 1 + 4 + 1;
/** Groesse einer gewoehnlichen Ueberweisung an der Hoehe -- fuer Gebuehrenauskuenfte. */
export function transferBytesAt(height: number, memoLength: number, v6Height = V6_HEIGHT): number {
  return (height >= v6Height ? TRANSFER_V2_BASE_BYTES : TRANSFER_BASE_BYTES) + memoLength;
}

/** Uebertragungsformat. CHAIN_ID steckt nur im Sighash, nicht auf der Leitung. */
export function serializeTx(t: Tx): Uint8Array {
  const w = new Writer().u16(t.version).u8(t.type);
  switch (t.type) {
    case TX_COINBASE: {
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
    case TX_TRANSFER: {
      if (t.version === TX_VERSION) {
        return w
          .bytes(t.from, ADDRESS_BYTES).bytes(t.to, ADDRESS_BYTES)
          .u64(t.amount).u64(t.fee).u64(t.nonce).u32(t.validUntil)
          .u8(t.memo.length).bytes(t.memo)
          .bytes(t.publicKey, 32).bytes(t.signature, 64)
          .finish();
      }
      w.u8(t.flags ?? 0).bytes(t.from, ADDRESS_BYTES);
      writeAddress(w, t.to);
      return w.u64(t.amount).u64(t.fee).u64(t.nonce)
        .u32(t.validFrom ?? 0).u32(t.validUntil)
        .u8(t.memo.length).bytes(t.memo)
        .bytes(t.publicKey, 32).bytes(t.signature, 64)
        .finish();
    }
    case TX_SCRIPT_SPEND: {
      w.u8(t.flags).bytes(t.from, SCRIPT_PROGRAM_BYTES);
      writeAddress(w, t.to);
      return w.u64(t.amount).u64(t.fee).u64(t.nonce)
        .u32(t.validFrom).u32(t.validUntil)
        .u8(t.memo.length).bytes(t.memo)
        .u16(t.script.length).bytes(t.script)
        .bytes(t.witness)
        .finish();
    }
    case TX_BATCH: {
      w.u8(t.flags).bytes(t.from, ADDRESS_BYTES).u16(t.outputs.length);
      for (const o of t.outputs) { writeAddress(w, o.to); w.u64(o.amount); }
      return w.u64(t.fee).u64(t.nonce)
        .u32(t.validFrom).u32(t.validUntil)
        .u8(t.memo.length).bytes(t.memo)
        .bytes(t.publicKey, 32).bytes(t.signature, 64)
        .finish();
    }
  }
}

/**
 * Lesen. Der Leser kennt das strukturelle Maximum ALLER Fassungen (Typen 0
 * bis 3, Ueberweisung Fassung 1 und 2, Coinbase bis 255 Empfaenger); ob
 * etwas an einer Hoehe zulaessig ist, entscheidet die Pruefung, nicht der
 * Leser (CONSENSUS_V6.md 6.1). Skript und Witness werden hier als Bytes
 * uebernommen und erst bei der Pruefung zerlegt.
 */
export function deserializeTx(bytes: Uint8Array): Tx {
  const r = new Reader(bytes);
  const version = r.u16();
  const type = r.u8();
  switch (type) {
    case TX_COINBASE: {
      const height = r.u32();
      const outputs: CoinbaseOutput[] = [];
      if (version === COINBASE_V2) {
        const anzahl = r.u8();
        if (anzahl < 1 || anzahl > MAX_COINBASE_OUTPUTS_V6) {
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
    case TX_TRANSFER: {
      if (version === TX_VERSION) {
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
      const flags = r.u8();
      const from = r.bytes(ADDRESS_BYTES);
      const to = readAddress(r);
      const amount = r.u64();
      const fee = r.u64();
      const nonce = r.u64();
      const validFrom = r.u32();
      const validUntil = r.u32();
      const memo = r.bytes(r.u8());
      const publicKey = r.bytes(32);
      const signature = r.bytes(64);
      return { type: TX_TRANSFER, version, flags, from, to, amount, fee, nonce,
               validFrom, validUntil, memo, publicKey, signature };
    }
    case TX_SCRIPT_SPEND: {
      const flags = r.u8();
      const from = r.bytes(SCRIPT_PROGRAM_BYTES);
      const to = readAddress(r);
      const amount = r.u64();
      const fee = r.u64();
      const nonce = r.u64();
      const validFrom = r.u32();
      const validUntil = r.u32();
      const memo = r.bytes(r.u8());
      // Laenge nur durch den Rahmen begrenzt; ob sie zulaessig ist, sagt
      // die Pruefung (bad_script), nicht der Leser (6.1).
      const script = r.bytes(r.u16());
      const witness = r.bytes(r.rest);
      return { type: TX_SCRIPT_SPEND, version, flags, from, to, amount, fee, nonce,
               validFrom, validUntil, memo, script, witness };
    }
    case TX_BATCH: {
      const flags = r.u8();
      const from = r.bytes(ADDRESS_BYTES);
      // Anzahl nur durch den Rahmen begrenzt; die Grenze prueft checkBatch
      // (bad_output_count), nicht der Leser (6.1).
      const count = r.u16();
      const outputs: BatchOutput[] = [];
      for (let i = 0; i < count; i++) outputs.push({ to: readAddress(r), amount: r.u64() });
      const fee = r.u64();
      const nonce = r.u64();
      const validFrom = r.u32();
      const validUntil = r.u32();
      const memo = r.bytes(r.u8());
      const publicKey = r.bytes(32);
      const signature = r.bytes(64);
      return { type: TX_BATCH, version, flags, from, outputs, fee, nonce,
               validFrom, validUntil, memo, publicKey, signature };
    }
    default:
      throw new Error(`unbekannter Transaktionstyp ${type}`);
  }
}

export function txid(t: Tx): Uint8Array {
  return sha256d(serializeTx(t));
}

export function txidHex(t: Tx): string {
  return toHex(txid(t));
}

/** Groesse auf der Leitung -- Grundlage der Mindestgebuehr. */
export function txBytes(t: Tx): number {
  return serializeTx(t).length;
}

// ---------------------------------------------------------- Bauen

export function buildTransfer(params: {
  from: Uint8Array; to: Uint8Array; amount: bigint; fee: bigint;
  nonce: bigint; validUntil?: number; validFrom?: number; memo?: Uint8Array;
  publicKey: Uint8Array; privateKey: Uint8Array;
  /** Chain-ID des Netzes; Vorgabe ist das Mainnet. */
  chainId?: Uint8Array;
  /** Fassung 1 (bis v6Height) oder 2 (ab v6Height); Vorgabe 1. */
  version?: number;
}): Transfer {
  // Typannotation statt "as const": In einem veraenderlichen Objektliteral
  // weitet TypeScript den Literaltyp 1 sonst zu number, und das passt dann
  // nicht mehr zu Transfer. Die Annotation gibt den Kontext vor.
  const version = params.version ?? TX_VERSION;
  const base: Omit<Transfer, 'publicKey' | 'signature'> = {
    type: TX_TRANSFER,
    version,
    from: params.from, to: params.to,
    amount: params.amount, fee: params.fee, nonce: params.nonce,
    validUntil: params.validUntil ?? 0,
    memo: params.memo ?? new Uint8Array(0),
  };
  if (version !== TX_VERSION) {
    base.flags = 0;
    base.validFrom = params.validFrom ?? 0;
  }
  return {
    ...base,
    publicKey: params.publicKey,
    signature: sign(sighash(base, params.chainId ?? CHAIN_ID), params.privateKey),
  };
}

export function buildBatch(params: {
  from: Uint8Array; outputs: BatchOutput[]; fee: bigint; nonce: bigint;
  validFrom?: number; validUntil?: number; memo?: Uint8Array;
  publicKey: Uint8Array; privateKey: Uint8Array; chainId?: Uint8Array;
}): Batch {
  // Streng aufsteigend nach Rohadresse -- die einzige Kodierung, die die
  // Kette annimmt (6.4). Doppelte Empfaenger vorher zusammenfassen.
  const outputs = [...params.outputs].sort((a, b) => compareAddressWire(a.to, b.to));
  const base: Omit<Batch, 'publicKey' | 'signature'> = {
    type: TX_BATCH, version: 1, flags: 0,
    from: params.from, outputs,
    fee: params.fee, nonce: params.nonce,
    validFrom: params.validFrom ?? 0, validUntil: params.validUntil ?? 0,
    memo: params.memo ?? new Uint8Array(0),
  };
  return {
    ...base,
    publicKey: params.publicKey,
    signature: sign(batchSighash(base, params.chainId ?? CHAIN_ID), params.privateKey),
  };
}

/**
 * Ausgabe aus einem Skript-Konto bauen. Der Aufrufer liefert den Witness,
 * weil die Signaturen von mehreren Geraeten kommen koennen; `unsignedScriptSpend`
 * plus `scriptSpendSighash` geben ihm, was er dafuer braucht.
 */
export function unsignedScriptSpend(params: {
  script: Uint8Array; to: Uint8Array; amount: bigint; fee: bigint; nonce: bigint;
  validFrom?: number; validUntil?: number; memo?: Uint8Array;
}): Omit<ScriptSpend, 'witness'> {
  return {
    type: TX_SCRIPT_SPEND, version: 1, flags: 0,
    from: scriptHash(params.script), to: params.to,
    amount: params.amount, fee: params.fee, nonce: params.nonce,
    validFrom: params.validFrom ?? 0, validUntil: params.validUntil ?? 0,
    memo: params.memo ?? new Uint8Array(0),
    script: params.script,
  };
}

// ---------------------------------------------------------- Pruefung

export type TxError =
  | 'bad_version' | 'bad_flags' | 'unknown_tx_type' | 'bad_amount' | 'dust' | 'fee_too_low'
  | 'memo_too_long' | 'pubkey_mismatch' | 'bad_signature' | 'self_transfer' | 'expired'
  | 'not_yet_valid' | 'bad_validity_window' | 'unknown_address_version' | 'bad_address_length'
  | 'bad_output_count' | 'outputs_unsorted' | 'script_mismatch' | 'bad_script' | 'bad_witness'
  | 'script_unsatisfied' | 'witness_excess';

/** Netzabhaengige Teile der Pruefung. Vorgabe: Mainnet. */
export interface CheckParams { chainId?: Uint8Array; feeV3Height?: number; v6Height?: number }

/**
 * Pruefungen einer Ueberweisung, die ohne Kenntnis des Kontostands moeglich
 * sind. Guthaben und Nonce prueft erst state.ts beim Anwenden.
 *
 * Gebuehr und Staub haengen an der Hoehe (Konsensfassung 3, params.ts).
 * Ohne Hoehe gilt die alte, strengere Regel -- nie die lockere raten. Ohne
 * Hoehe gilt ausserdem Fassung 1, weil Fassung 2 ohne Hoehe nicht einzuordnen
 * ist; Aufrufer vor dem Fork uebergeben die Hoehe.
 */
export function checkTransfer(t: Transfer, atHeight?: number, params: CheckParams = {}): TxError | null {
  const feeV3 = params.feeV3Height ?? FEE_V3_HEIGHT;
  const v6 = params.v6Height ?? V6_HEIGHT;
  const chainId = params.chainId ?? CHAIN_ID;
  const abV6 = atHeight !== undefined && atHeight >= v6;

  if (abV6) {
    if (t.version !== TRANSFER_V2) return 'bad_version';
    if ((t.flags ?? 0) !== 0) return 'bad_flags';
    const adr = checkAddress(t.to);
    if (adr) return adr;
  } else {
    if (t.version !== TX_VERSION) return 'bad_version';
    if (t.to.length !== ADDRESS_BYTES) return 'bad_address_length';
  }
  if (t.amount <= 0n) return 'bad_amount';
  if (t.memo.length > MAX_MEMO_BYTES) return 'memo_too_long';
  if (atHeight !== undefined && atHeight >= feeV3) {
    if (t.amount < DUST_LIMIT) return 'dust';
    const groesse = abV6 ? txBytes(t) : transferBytes(t.memo.length);
    if (t.fee < minFeeAt(atHeight, groesse, feeV3)) return 'fee_too_low';
  } else if (t.fee < MIN_FEE) return 'fee_too_low';
  const fenster = checkWindow(t.validFrom ?? 0, t.validUntil, atHeight);
  if (fenster) return fenster;

  const derived = addressFromPublicKey(t.publicKey);
  if (toHex(derived) !== toHex(t.from)) return 'pubkey_mismatch';
  if (toHex(t.from) === toHex(t.to)) return 'self_transfer';

  const { signature, publicKey, ...unsigned } = t;
  if (!verifySignature(signature, sighash(unsigned, chainId), publicKey)) return 'bad_signature';
  return null;
}

function checkAddress(raw: Uint8Array): TxError | null {
  if (!isRawAddress(raw)) {
    return raw.length === 1 + SCRIPT_PROGRAM_BYTES || raw.length === ADDRESS_BYTES
      ? 'unknown_address_version' : 'bad_address_length';
  }
  return null;
}

function checkWindow(validFrom: number, validUntil: number, atHeight?: number): TxError | null {
  if (validFrom !== 0 && validUntil !== 0 && validFrom > validUntil) return 'bad_validity_window';
  if (atHeight === undefined) return null;
  if (validFrom !== 0 && atHeight < validFrom) return 'not_yet_valid';
  if (validUntil !== 0 && atHeight > validUntil) return 'expired';
  return null;
}

/** Gemeinsame Regeln der Fassung-6-Typen: Fassung, Flags, Notiz, Gebuehr, Fenster. */
function checkV6Common(
  t: ScriptSpend | Batch, atHeight: number, params: CheckParams,
): TxError | null {
  const v6 = params.v6Height ?? V6_HEIGHT;
  const feeV3 = params.feeV3Height ?? FEE_V3_HEIGHT;
  if (atHeight < v6) return 'unknown_tx_type';
  if (t.version !== 1) return 'bad_version';
  if (t.flags !== 0) return 'bad_flags';
  if (t.memo.length > MAX_MEMO_BYTES) return 'memo_too_long';
  if (t.fee < minFeeAt(atHeight, txBytes(t), feeV3)) return 'fee_too_low';
  return checkWindow(t.validFrom, t.validUntil, atHeight);
}

/** Ausgabe aus einem Skript-Konto (6.5). Ohne Hoehe nicht pruefbar. */
export function checkScriptSpend(t: ScriptSpend, atHeight: number, params: CheckParams = {}): TxError | null {
  const chainId = params.chainId ?? CHAIN_ID;
  // Adressen zuerst: Alles Weitere serialisiert die Transaktion und braucht
  // dafuer lesbare Adressen.
  if (t.from.length !== SCRIPT_PROGRAM_BYTES) return 'bad_address_length';
  const adr = checkAddress(t.to);
  if (adr) return adr;
  const gemeinsam = checkV6Common(t, atHeight, params);
  if (gemeinsam) return gemeinsam;
  if (t.amount <= 0n) return 'bad_amount';
  if (t.amount < DUST_LIMIT) return 'dust';
  if (toHex(scriptHash(t.script)) !== toHex(t.from)) return 'script_mismatch';
  const script = decodeScript(t.script);
  if (!script) return 'bad_script';
  if (toHex(senderRaw(t)) === toHex(t.to)) return 'self_transfer';
  const slots = decodeWitness(script, t.witness);
  if (!slots) return 'bad_witness';
  const { witness, ...unsigned } = t;
  return evaluateScript(script, slots, {
    sighash: scriptSpendSighash(unsigned, chainId),
    validFrom: t.validFrom, validUntil: t.validUntil,
  });
}

/** Sammelzahlung (6.4). Ohne Hoehe nicht pruefbar. */
export function checkBatch(t: Batch, atHeight: number, params: CheckParams = {}): TxError | null {
  const chainId = params.chainId ?? CHAIN_ID;
  if (t.from.length !== ADDRESS_BYTES) return 'bad_address_length';
  if (t.outputs.length < 1 || t.outputs.length > MAX_BATCH_OUTPUTS) return 'bad_output_count';
  for (const o of t.outputs) {
    const adr = checkAddress(o.to);
    if (adr) return adr;
  }
  const gemeinsam = checkV6Common(t, atHeight, params);
  if (gemeinsam) return gemeinsam;
  let summe = 0n;
  const fromHex = toHex(t.from);
  for (let i = 0; i < t.outputs.length; i++) {
    const o = t.outputs[i];
    if (o.amount <= 0n) return 'bad_amount';
    if (o.amount < DUST_LIMIT) return 'dust';
    if (toHex(o.to) === fromHex) return 'self_transfer';
    // Streng aufsteigend in der Leitungsform `u8 version | programm` (6.4).
    if (i > 0 && compareAddressWire(t.outputs[i - 1].to, o.to) >= 0) return 'outputs_unsorted';
    summe += o.amount;
    if (summe > 0xffff_ffff_ffff_ffffn) return 'bad_amount';
  }
  if (summe + t.fee > 0xffff_ffff_ffff_ffffn) return 'bad_amount';
  const derived = addressFromPublicKey(t.publicKey);
  if (toHex(derived) !== fromHex) return 'pubkey_mismatch';
  const { signature, publicKey, ...unsigned } = t;
  if (!verifySignature(signature, batchSighash(unsigned, chainId), publicKey)) return 'bad_signature';
  return null;
}

/** Zustandsfreie Pruefung jeder Ausgabe -- was applyBlock und der Mempool rufen. */
export function checkSpend(t: Spend, atHeight: number, params: CheckParams = {}): TxError | null {
  switch (t.type) {
    case TX_TRANSFER: return checkTransfer(t, atHeight, params);
    case TX_SCRIPT_SPEND: return checkScriptSpend(t, atHeight, params);
    case TX_BATCH: return checkBatch(t, atHeight, params);
  }
}

/**
 * Signaturoperationen einer Ausgabe fuer das Blockbudget (7.7). Zaehlt
 * belegte PK-Slots OHNE eine Signatur zu pruefen; ein unlesbares Skript
 * oder Witness zaehlt als 0 und faellt spaeter in der Pruefung durch.
 */
export function spendSigops(t: Spend): number {
  if (t.type !== TX_SCRIPT_SPEND) return 1;
  const script = decodeScript(t.script);
  if (!script) return 0;
  const slots = decodeWitness(script, t.witness);
  return slots ? witnessSigops(slots) : 0;
}

export type { ScriptNode };
