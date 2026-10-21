/**
 * Ueberweisungen im Testnetz -- fuer den Uebergangstest (CONSENSUS_V6.md 14,
 * "Fork behaviour": eine nach Fassung 5 signierte Ueberweisung wird ab der
 * Hoehe abgelehnt, eine nach Fassung 6 signierte davor).
 *
 * Nur fuer --regtest. Der Schluessel liegt UNVERSCHLUESSELT in einer Datei:
 * Das ist fuer wertlose Testnetz-Coins in Ordnung und fuer echte Coins
 * nicht. Deshalb gibt es hier keinen Weg ins Mainnet -- weder ueber die
 * Chain-ID (immer die des Testnetzes) noch ueber den Aufruf (cli.ts lehnt
 * die Befehle ohne --regtest ab).
 *
 * Gesendet wird an die HTTP-Schnittstelle eines laufenden Knotens
 * (POST /api/v2/tx). Die gibt es bei alten und neuen Knoten; so laesst sich
 * dieselbe Ueberweisung an beide Seiten schicken.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { keypairFromSeed, type Keypair } from '../../core/wallet.ts';
import { decodeAddress } from '../../core/address.ts';
import { buildTransfer, serializeTx, txidHex, transferVersionAt, sendepause, TX_VERSION, TRANSFER_V2 } from '../../core/tx.ts';
import { UNIT } from '../../core/params.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import type { ConsensusParams } from '../../core/networks.ts';

/** Gebuehr, wenn keine angegeben ist: 0,001 YSR -- ueber jeder Untergrenze einer Ueberweisung. */
export const TEST_GEBUEHR = 100_000n;

interface Schluesseldatei { hinweis: string; seed: string; adresse: string }

/**
 * Testschluessel laden oder anlegen.
 *
 * Gibt es die Datei, wird sie gelesen -- nie ueberschrieben. Sonst wird ein
 * neuer Schluessel aus 32 Zufallsbytes erzeugt und gespeichert.
 */
export function testkonto(datei: string): { schluessel: Keypair; neu: boolean } {
  if (existsSync(datei)) {
    const roh = JSON.parse(readFileSync(datei, 'utf8')) as Partial<Schluesseldatei>;
    if (typeof roh.seed !== 'string' || !/^[0-9a-f]{64}$/i.test(roh.seed)) {
      throw new Error(`${datei} ist keine Testschluessel-Datei`);
    }
    return { schluessel: keypairFromSeed(fromHex(roh.seed)), neu: false };
  }
  const seed = new Uint8Array(randomBytes(32));
  const schluessel = keypairFromSeed(seed);
  const inhalt: Schluesseldatei = {
    hinweis: 'Testnetz-Schluessel, unverschluesselt. Nicht fuer echte Coins verwenden.',
    seed: toHex(seed),
    adresse: schluessel.address,
  };
  writeFileSync(datei, JSON.stringify(inhalt, null, 2) + '\n', { flag: 'wx' });
  return { schluessel, neu: true };
}

/** "1.5" -> 150.000.000 Einheiten. Hoechstens acht Nachkommastellen, nichts Negatives. */
export function ysrInEinheiten(text: string): bigint {
  const m = text.trim().replace(',', '.').match(/^(\d+)(?:\.(\d{1,8}))?$/);
  if (!m) throw new Error(`"${text}" ist kein Betrag in YSR (z. B. 10 oder 0.5)`);
  return BigInt(m[1]) * UNIT + BigInt((m[2] ?? '').padEnd(8, '0'));
}

/** 150.000.000 Einheiten -> "1.5". */
export function einheitenInYsr(e: bigint): string {
  const ganz = e / UNIT, rest = e % UNIT;
  return rest === 0n ? ganz.toString() : `${ganz}.${rest.toString().padStart(8, '0').replace(/0+$/, '')}`;
}

export interface UeberweisungsAuftrag {
  api: string;
  schluessel: Keypair;
  an: string;
  betrag: bigint;
  gebuehr?: bigint;
  /** Fassung der Ueberweisung erzwingen (1 oder 2). Sonst nach der Hoehe. */
  fassung?: number;
  memo?: string;
  params: ConsensusParams;
}

export interface UeberweisungsErgebnis {
  hoehe: number;
  fassung: number;
  automatisch: boolean;
  sendepause: boolean;
  nonce: bigint;
  guthaben: bigint;
  txid: string;
  antwort: Record<string, unknown>;
}

async function holeJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let r: Response;
  try { r = await fetch(url, init); }
  catch {
    throw new Error(`kein Knoten erreichbar unter ${new URL(url).origin} -- laeuft er, und stimmt --api?`);
  }
  const text = await r.text();
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`${url}: keine JSON-Antwort (HTTP ${r.status})`); }
}

/**
 * Ueberweisung bauen, signieren und an den Knoten schicken.
 *
 * Hoehe und Nonce kommen vom Knoten selbst (/status, /account/<adresse>).
 * Die Fassung richtet sich nach der Hoehe des NAECHSTEN Blocks -- dort
 * landet die Ueberweisung -- und den Parametern dieses Laufs (--v6-height).
 * Mit `fassung` laesst sie sich fuer den Test erzwingen.
 */
export async function ueberweise(a: UeberweisungsAuftrag): Promise<UeberweisungsErgebnis> {
  const basis = a.api.replace(/\/+$/, '') + '/api/v2';
  const an = decodeAddress(a.an);

  const stand = await holeJson(`${basis}/status`);
  if (stand.network !== a.params.network) {
    throw new Error(`Der Knoten unter ${a.api} gehoert zu "${String(stand.network)}", nicht zu "${a.params.network}"`);
  }
  const hoehe = typeof stand.height === 'number' ? stand.height : -1;
  const naechste = hoehe + 1;

  const konto = await holeJson(`${basis}/account/${a.schluessel.address}`);
  const nonce = BigInt(String(konto.nextNonce ?? konto.nonce ?? '0'));
  const guthaben = BigInt(String(konto.balance ?? '0'));

  const automatisch = a.fassung === undefined;
  const fassung = a.fassung ?? transferVersionAt(naechste, a.params.v6Height);
  if (fassung !== TX_VERSION && fassung !== TRANSFER_V2) {
    throw new Error(`Fassung ${fassung} gibt es nicht -- 1 oder 2`);
  }

  const tx = buildTransfer({
    from: a.schluessel.addressRaw, to: an,
    amount: a.betrag, fee: a.gebuehr ?? TEST_GEBUEHR, nonce,
    memo: new TextEncoder().encode(a.memo ?? ''),
    publicKey: a.schluessel.publicKey, privateKey: a.schluessel.privateKey,
    chainId: a.params.chainId, version: fassung,
  });

  const antwort = await holeJson(`${basis}/tx`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw: toHex(serializeTx(tx)) }),
  });

  return {
    hoehe, fassung, automatisch,
    sendepause: sendepause(naechste, a.params.v6Height),
    nonce, guthaben, txid: txidHex(tx), antwort,
  };
}
