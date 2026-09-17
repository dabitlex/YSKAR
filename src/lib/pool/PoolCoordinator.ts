/**
 * Pool-Koordinator.
 *
 * Verbindet die beiden geprueften Teile: PPLNS waehlt aus, WELCHE Arbeit
 * zaehlt, die Abrechnung teilt den Betrag auf. Hier kommt dazu, was der
 * Betreiber einstellen darf und was er nicht mehr aendern kann.
 *
 * SOLO BLEIBT GLEICHBERECHTIGT. Wer allein mint, bekommt weiterhin eine
 * Coinbase der Fassung 1 mit genau einem Empfaenger. Der Pool ist ein
 * Angebot, keine Voraussetzung -- und beide Modi laufen am selben Knoten
 * nebeneinander.
 */
import { toHex } from '../core/codec.ts';
import { buildCoinbaseV2 } from '../core/builder.ts';
import { rewardAt } from '../core/params.ts';
import type { Coinbase } from '../core/tx.ts';
import { abrechnen, MAX_FEE_BPS, type Abrechnung } from './settlement.ts';
import { ShareLog, fensterGroesse, PPLNS_FAKTOR, type ShareEintrag } from './pplns.ts';

export type MiningModus = 'solo' | 'pool';

export interface PoolEinstellungen {
  /** Anzeigename. */
  name: string;
  /** Gebuehr in Basispunkten: 0 bis 500, also 0,00 % bis 5,00 %. */
  feeBps: number;
  /** Adresse fuer die Gebuehr. Bei feeBps = 0 nicht noetig. */
  payoutAddress: Uint8Array | null;
  /** Fenstergroesse als Vielfaches der Netz-Difficulty. */
  pplnsFaktor?: bigint;
}

export interface BlockAbrechnung extends Abrechnung {
  coinbase: Coinbase;
  /** Arbeit im Fenster, auf der die Aufteilung beruht. */
  fensterArbeit: bigint;
  /** Gebuehr, die bei diesem Block galt. */
  feeBps: number;
}

export class PoolCoordinator {
  private log = new ShareLog();
  private name: string;
  private feeBps: number;
  private payoutAddress: Uint8Array | null;
  private faktor: bigint;

  /**
   * Gebuehr, die ab dem naechsten Block gilt.
   *
   * Eine Aenderung wirkt NIE auf Arbeit, die bereits geleistet wurde. Wer
   * mitgemint hat, hat das unter der Gebuehr getan, die zu diesem Zeitpunkt
   * galt -- sie nachtraeglich zu erhoehen waere ein Griff in fremde Taschen.
   */
  private feeBpsNaechster: number | null = null;
  private payoutNaechster: Uint8Array | null = null;

  constructor(e: PoolEinstellungen) {
    this.name = e.name;
    this.feeBps = pruefeGebuehr(e.feeBps);
    this.payoutAddress = e.payoutAddress;
    this.faktor = e.pplnsFaktor ?? PPLNS_FAKTOR;
    if (this.feeBps > 0 && !this.payoutAddress) {
      throw new Error('Gebuehr ohne Auszahlungsadresse des Betreibers');
    }
  }

  einstellungen(): { name: string; feeBps: number; faktor: bigint;
                     feeBpsAbNaechstem: number | null } {
    return {
      name: this.name, feeBps: this.feeBps, faktor: this.faktor,
      feeBpsAbNaechstem: this.feeBpsNaechster,
    };
  }

  /**
   * Gebuehr aendern -- wirksam ab dem naechsten Block.
   *
   * Sofort zu wirken waere die naheliegende Umsetzung und die falsche: Die
   * Arbeit im aktuellen Fenster wurde unter der alten Gebuehr geleistet.
   */
  setzeGebuehr(feeBps: number, payoutAddress?: Uint8Array | null): void {
    const geprueft = pruefeGebuehr(feeBps);
    if (geprueft > 0 && !(payoutAddress ?? this.payoutAddress)) {
      throw new Error('Gebuehr ohne Auszahlungsadresse des Betreibers');
    }
    this.feeBpsNaechster = geprueft;
    if (payoutAddress !== undefined) this.payoutNaechster = payoutAddress;
  }

  /**
   * Arbeit eines Miners eintragen.
   *
   * Die Auszahlungsadresse wird HIER festgeschrieben, nicht erst bei der
   * Abrechnung nachgeschlagen. Sonst liesse sich Arbeit nachtraeglich
   * umleiten -- vom Miner selbst oder vom Betreiber.
   */
  share(payoutAddress: Uint8Array, work: bigint): void {
    this.log.add(payoutAddress, work);
  }

  /** Arbeit im aktuellen Fenster, nach Adresse. */
  fenster(netzDifficulty: bigint) {
    return this.log.anteile(fensterGroesse(netzDifficulty, this.faktor));
  }

  arbeitGesamt(): bigint { return this.log.gesamt(); }
  eintraege(): number { return this.log.laenge(); }

  /**
   * Die Coinbase fuer einen Block bauen.
   *
   * Findet sich keine Arbeit im Fenster -- etwa direkt nach dem Start --,
   * wird null geliefert. Der Aufrufer baut dann eine gewoehnliche Coinbase
   * der Fassung 1; ein Block ohne Empfaenger waere ungueltig.
   */
  coinbase(height: number, fees: bigint, netzDifficulty: bigint,
           extra?: Uint8Array): BlockAbrechnung | null {
    const groesse = fensterGroesse(netzDifficulty, this.faktor);
    const anteile = this.log.anteile(groesse);
    if (anteile.length === 0) return null;

    let fensterArbeit = 0n;
    for (const a of anteile) fensterArbeit += a.work;

    const brutto = rewardAt(height) + fees;
    const r = abrechnen(brutto, anteile, this.feeBps, this.payoutAddress);

    return {
      ...r,
      feeBps: this.feeBps,
      fensterArbeit,
      coinbase: buildCoinbaseV2(height, r.outputs, fees, extra),
    };
  }

  /**
   * Nach einem gefundenen Block.
   *
   * Das Fenster wird NICHT geleert -- genau das ist der Unterschied zur
   * proportionalen Verteilung. Es wandert weiter, und deshalb bringt es
   * nichts, nur direkt nach einem Fund mitzumachen.
   *
   * Aufgeraeumt wird nur, was das Fenster ohnehin nicht mehr erreichen
   * kann.
   */
  nachBlock(netzDifficulty: bigint): void {
    if (this.feeBpsNaechster !== null) {
      this.feeBps = this.feeBpsNaechster;
      this.feeBpsNaechster = null;
      if (this.payoutNaechster !== null) {
        this.payoutAddress = this.payoutNaechster;
        this.payoutNaechster = null;
      }
    }
    this.log.aufraeumen(fensterGroesse(netzDifficulty, this.faktor));
  }

  /** Fuer Sicherung und Wiederherstellung ueber Neustarts hinweg. */
  exportieren(): ShareEintrag[] { return this.log.exportieren(); }
  laden(e: ShareEintrag[]): void { this.log.laden(e); }
}

function pruefeGebuehr(feeBps: number): number {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) {
    throw new Error(
      `Gebuehr ${feeBps} liegt nicht zwischen 0 und ${MAX_FEE_BPS} Basispunkten ` +
      `(0,00 % bis 5,00 %)`);
  }
  return feeBps;
}

/** Gebuehr als Prozenttext, fuer Anzeigen. */
export function gebuehrText(feeBps: number): string {
  return (feeBps / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + ' %';
}
