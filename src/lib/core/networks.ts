/**
 * Netzparameter.
 *
 * Bis hierher waren alle Konsenswerte feste Konstanten. Das war richtig,
 * solange es nur ein Netz gab -- aber es machte Fork- und Reorg-Tests
 * unmoeglich: Bei Difficulty 24.576 kostet ein Testblock rund 1,6
 * Milliarden Hashes.
 *
 * Diese Datei aendert NICHTS am Mainnet. MAINNET enthaelt exakt die Werte
 * aus params.ts, und alles, was keine Parameter uebergibt, rechnet
 * weiterhin damit. Es kommt nur ein Weg dazu, sie zu ueberschreiben.
 *
 * REGTEST ist ein reines Werkzeug: eigene Chain-ID, Difficulty 1. Ein Block
 * kostet dort rund 65.536 Hashes statt 1,6 Milliarden -- Millisekunden
 * statt einer Viertelstunde. Damit lassen sich Gabelungen und Reorgs
 * endlich durch die VOLLE Validierung testen, und nicht nur die Mechanik
 * darunter.
 *
 * REGTEST darf niemals in einem ausgelieferten Pfad vorkommen. Es ist fuer
 * Tests da, und die Chain-ID stellt sicher, dass seine Bloecke im echten
 * Netz nicht einmal gelesen werden koennen.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import {
  NETWORK, CHAIN_ID, TARGET_BLOCK_TIME, MIN_DIFFICULTY, GENESIS_DIFFICULTY,
  LWMA_WINDOW, LWMA_CLAMP, SOLVETIME_CAP, COINBASE_V2_HEIGHT, FEE_V3_HEIGHT, V5_HEIGHT, V6_HEIGHT, V6_HEIGHT_UNSET,
} from './params.ts';

export interface ConsensusParams {
  /** Name des Netzes. Steht im Handshake und in der Ablage. */
  network: string;
  /** Geht in jede Signatur ein -- trennt die Netze auf Transaktionsebene. */
  chainId: Uint8Array;
  targetBlockTime: bigint;
  minDifficulty: bigint;
  /** Difficulty fuer Block 1, solange es keine Messwerte gibt. */
  genesisDifficulty: bigint;
  lwmaWindow: number;
  /** Groesster Faktor, um den sich die Difficulty je Block aendern darf. */
  lwmaClamp: bigint;
  /** Loesungszeiten werden auf dieses Vielfache der Zielzeit gedeckelt. */
  solvetimeCap: bigint;
  /**
   * Ab dieser Hoehe ist eine Coinbase mit mehreren Empfaengern zulaessig.
   *
   * Darunter gilt ausschliesslich die alte Fassung -- damit bleibt jeder
   * bisherige Block byteweise gueltig.
   */
  coinbaseV2Height: number;
  /** Ab dieser Hoehe: Gebuehr je Byte und Staubgrenze (Konsensfassung 3). */
  feeV3Height: number;
  /** Ab dieser Hoehe: die Regeln der Konsensfassung 5 (params.ts, V5_HEIGHT). */
  v5Height: number;
  /**
   * Ab dieser Hoehe: Konsensfassung 6, der Hard Fork (docs/CONSENSUS_V6.md).
   * Im Mainnet noch nicht gesetzt (V6_HEIGHT_UNSET).
   */
  v6Height: number;
}

/** Das laufende Netz. Exakt die Werte aus params.ts. */
export const MAINNET: ConsensusParams = {
  network: NETWORK,
  chainId: CHAIN_ID,
  targetBlockTime: TARGET_BLOCK_TIME,
  minDifficulty: MIN_DIFFICULTY,
  genesisDifficulty: GENESIS_DIFFICULTY,
  lwmaWindow: LWMA_WINDOW,
  lwmaClamp: LWMA_CLAMP,
  solvetimeCap: SOLVETIME_CAP,
  coinbaseV2Height: COINBASE_V2_HEIGHT,
  feeV3Height: FEE_V3_HEIGHT,
  v5Height: V5_HEIGHT,
  v6Height: V6_HEIGHT,
};

/**
 * Testnetz fuer Fork- und Reorg-Tests.
 *
 * Difficulty 1 heisst: target = 2^240, also trifft etwa jeder 65.536-ste
 * Hash. Alles andere bleibt wie im Mainnet -- Blockzeit, LWMA-Fenster,
 * Deckelung. Nur so pruefen die Tests dieselbe Regel, die auch im echten
 * Netz laeuft.
 */
export const REGTEST: ConsensusParams = {
  network: 'yskar-regtest',
  chainId: sha256(new TextEncoder().encode('yskar-regtest')),
  targetBlockTime: TARGET_BLOCK_TIME,
  minDifficulty: 1n,
  genesisDifficulty: 1n,
  lwmaWindow: LWMA_WINDOW,
  lwmaClamp: LWMA_CLAMP,
  solvetimeCap: SOLVETIME_CAP,
  // Im Testnetz von Anfang an -- sonst liessen sich die Pool-Regeln nicht
  // pruefen, ohne erst zweitausend Bloecke zu minen.
  coinbaseV2Height: 0,
  // Ebenso die Byte-Gebuehr: von Anfang an, damit die Tests die Regel
  // pruefen, die im Netz ab Hoehe 4.000 gilt.
  feeV3Height: 0,
  // Und die Regeln der Fassung 5 ebenso.
  v5Height: 0,
  // Fassung 6 NICHT: Dieses Netz prueft die Regeln bis Fassung 5 und bleibt
  // die Grundlage der bestehenden Tests. Fassung 6 testet REGTEST_V6.
  // Bewusst nicht V6_HEIGHT: Sobald das Mainnet eine Hoehe bekommt, bliebe
  // REGTEST sonst nicht bei Fassung 5 (CONSENSUS_V6.md 2.1).
  v6Height: V6_HEIGHT_UNSET,
};

/**
 * Regtest mit Konsensfassung 6 von Anfang an.
 *
 * Eigene Kennung und Chain-ID, damit sich Transaktionen und Bloecke der
 * beiden Testnetze nie verwechseln lassen. Alles andere wie REGTEST.
 */
export const REGTEST_V6: ConsensusParams = {
  ...REGTEST,
  network: 'yskar-regtest-v6',
  chainId: sha256(new TextEncoder().encode('yskar-regtest-v6')),
  v6Height: 0,
};

export function istMainnet(p: ConsensusParams): boolean {
  return p.network === NETWORK;
}
