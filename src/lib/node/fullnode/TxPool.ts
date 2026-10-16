/**
 * Lokaler Mempool.
 *
 * Wartende Transaktionen, vollstaendig gegen den aktuellen Zustand
 * geprueft. Was hier liegt, hat dieser Knoten selbst nachgerechnet -- kein
 * Feld stammt aus einer fremden Zusage.
 *
 * Der Mempool ist eine ANGRIFFSFLAECHE, und das praegt fast jede
 * Entscheidung hier:
 *
 *  - Er nimmt Daten von Fremden entgegen, bevor sie in einem Block stehen.
 *  - Er haelt sie im Arbeitsspeicher. Ohne Obergrenze laesst sich ein Knoten
 *    mit wertlosen Transaktionen aushungern.
 *  - Er gibt sie weiter. Etwas Ungeprueftes weiterzureichen hiesse, den
 *    Angriff fuer den Angreifer zu verteilen.
 *
 * Deshalb: erst pruefen, dann aufnehmen, dann erst weitergeben. Nie
 * umgekehrt.
 */
import {
  checkSpend, txidHex, transferBytesAt, txBytes, senderRaw, spendTotal, type Spend,
} from '../../core/tx.ts';
import { MIN_FEE, RELAY_FEE_RATE, FEE_V3_HEIGHT } from '../../core/params.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';
import { toHex } from '../../core/codec.ts';
import type { State } from '../../core/state.ts';

/** Obergrenze. Bei 168 Byte je Transaktion (ohne Memo) sind das rund 840 KB. */
export const MAX_POOL_SIZE = 5_000;
/** Hoechstzahl wartender Transaktionen je Absender. */
export const MAX_PER_SENDER = 32;

export type RejectReason =
  | 'malformed' | 'bad_signature' | 'fee_too_low' | 'expired'
  | 'unknown_account' | 'insufficient_funds' | 'nonce_too_low'
  | 'nonce_gap' | 'duplicate' | 'fee_not_higher' | 'pool_full'
  | 'sender_limit';

export type AddResult =
  | { ok: true; txid: string; ersetzt?: string }
  | { ok: false; reason: RejectReason; detail?: string };

interface Eintrag {
  tx: Spend;
  txid: string;
  from: string;
  nonce: bigint;
  fee: bigint;
  seit: number;
}

export class TxPool {
  private nachId = new Map<string, Eintrag>();
  private params: ConsensusParams;
  /** Weiterleitungs-Satz in Einheiten je Byte -- Policy, kein Konsens. */
  readonly relayFeeRate: bigint;

  constructor(params: ConsensusParams = MAINNET, relayFeeRate: bigint = RELAY_FEE_RATE) {
    this.params = params;
    this.relayFeeRate = relayFeeRate;
  }

  /**
   * Was dieser Knoten mindestens verlangt, um eine Transaktion zu
   * behalten. Bis zur Aktivierung die alte Untergrenze; danach der
   * Satz je Byte -- ueber dem Konsens (1 je Byte), unter dem, was ein
   * Markt bei Andrang verlangt.
   */
  mindestGebuehr(height: number, memoBytes = 0): bigint {
    if (height < (this.params.feeV3Height ?? FEE_V3_HEIGHT)) return MIN_FEE;
    // 168 Byte bis Fassung 6, 174 ab v6Height (Ueberweisung Fassung 2).
    return BigInt(transferBytesAt(height, memoBytes, this.params.v6Height)) * this.relayFeeRate;
  }

  /** Dasselbe fuer eine konkrete Transaktion: ihre tatsaechliche Groesse zaehlt. */
  mindestGebuehrFuer(tx: Spend, height: number): bigint {
    if (height < (this.params.feeV3Height ?? FEE_V3_HEIGHT)) return MIN_FEE;
    return BigInt(txBytes(tx)) * this.relayFeeRate;
  }
  /** Je Absender die wartenden Nonces -- fuer Ersetzung und Luecken. */
  private nachAbsender = new Map<string, Map<string, Eintrag>>();

  /**
   * Zaehler, der sich bei JEDER Aenderung des Inhalts erhoeht.
   *
   * Daran erkennt der Blockbau, ob seine Vorarbeit (Auswahl und Zustand
   * nach den Ueberweisungen, siehe jobVorlage.ts) noch zum Mempool passt.
   * Ein Zaehler statt eines Vergleichs der Inhalte: Der kostet nichts und
   * kann sich nicht irren -- jede Aenderung geht durch add(), remove() oder
   * leeren().
   */
  private stand = 0;
  version(): number { return this.stand; }

  size(): number { return this.nachId.size; }
  has(id: string): boolean { return this.nachId.has(id); }
  get(id: string): Spend | null { return this.nachId.get(id)?.tx ?? null; }

  /** Alle wartenden Transaktionen, fuer den Blockbau. */
  alle(): Spend[] {
    return [...this.nachId.values()].map(e => e.tx);
  }

  /**
   * Eine Transaktion aufnehmen.
   *
   * Reihenfolge: billig vor teuer. Struktur und Gebuehr kosten
   * Mikrosekunden, die Signaturpruefung Millisekunden. Wer das umdreht,
   * laedt jeden ein, den Knoten mit Muell zu beschaeftigen.
   */
  add(tx: Spend, state: State, height: number): AddResult {
    const id = txidHex(tx);
    if (this.nachId.has(id)) return { ok: false, reason: 'duplicate' };

    // Kostenlose Pruefungen zuerst. checkSpend kommt ganz zum Schluss,
    // weil es die Signatur prueft -- und eine Ed25519-Pruefung ist rund
    // tausendmal teurer als ein Kartenzugriff. Wer sie vorn ansetzt, laedt
    // jeden ein, den Knoten mit Muell zu beschaeftigen.
    const mindest = this.mindestGebuehrFuer(tx, height);
    if (tx.fee < mindest) {
      return { ok: false, reason: 'fee_too_low', detail: `${tx.fee} < ${mindest}` };
    }
    if (spendTotal(tx) - tx.fee <= 0n) {
      return { ok: false, reason: 'malformed', detail: 'bad_amount' };
    }
    if (tx.validUntil !== 0 && height > tx.validUntil) {
      return { ok: false, reason: 'expired', detail: `gueltig bis ${tx.validUntil}` };
    }
    // Noch nicht faellig (validFrom in der Zukunft): nicht aufnehmen -- der
    // Mempool haelt nur, was in den NAECHSTEN Block passt. Wer eine
    // Rueckzahlung nach Ablauf will, reicht sie ab der Hoehe ein.
    const validFrom = 'validFrom' in tx ? (tx.validFrom ?? 0) : 0;
    if (validFrom !== 0 && height < validFrom) {
      return { ok: false, reason: 'malformed', detail: `not_yet_valid:${validFrom}` };
    }

    // Schluessel ist die Rohadresse des Absenders -- bei einem Skript-Konto
    // 0x01 | Skript-Hash. Mempool und Wallets arbeiten mit (Absender, Nonce),
    // nicht mit der txid (CONSENSUS_V6.md 7.6).
    const absender = toHex(senderRaw(tx));
    const konto = state.get(absender);
    if (!konto) return { ok: false, reason: 'unknown_account' };

    // Nonce gegen den bestaetigten Stand UND die wartenden Transaktionen.
    // Ohne die wartenden liesse sich dieselbe Nonce beliebig oft einreichen.
    const wartend = this.nachAbsender.get(absender) ?? new Map<string, Eintrag>();
    if (tx.nonce < konto.nonce) {
      return { ok: false, reason: 'nonce_too_low',
               detail: `${tx.nonce} < ${konto.nonce}` };
    }

    const vorhanden = [...wartend.values()].find(e => e.nonce === tx.nonce);
    if (vorhanden) {
      // Ersetzung nur mit hoeherer Gebuehr -- und zwar um mindestens die
      // Weiterleitungsgebuehr (Bitcoins incremental relay fee). Sonst
      // liesse sich eine wartende Transaktion fuer eine Einheit mehr
      // beliebig oft neu verteilen.
      if (tx.fee < vorhanden.fee + mindest) {
        return { ok: false, reason: 'fee_not_higher',
                 detail: `${tx.fee} <= ${vorhanden.fee}` };
      }
    } else {
      // Keine Luecken: Nonce muss lueckenlos an das anschliessen, was schon
      // wartet. Sonst fuellt sich der Pool mit Transaktionen, die nie
      // ausfuehrbar werden.
      const naechste = konto.nonce + BigInt(wartend.size);
      if (tx.nonce > naechste) {
        return { ok: false, reason: 'nonce_gap',
                 detail: `${tx.nonce}, erwartet bis ${naechste}` };
      }
      if (wartend.size >= MAX_PER_SENDER) {
        return { ok: false, reason: 'sender_limit' };
      }
      if (this.nachId.size >= MAX_POOL_SIZE) {
        return { ok: false, reason: 'pool_full' };
      }
    }

    // Deckung: Summe aller wartenden Betraege plus Gebuehren.
    const andere = [...wartend.values()]
      .filter(e => !(vorhanden && e.txid === vorhanden.txid));
    let gebunden = 0n;
    for (const e of andere) gebunden += spendTotal(e.tx);
    if (konto.balance < gebunden + spendTotal(tx)) {
      return { ok: false, reason: 'insufficient_funds',
               detail: `${konto.balance} deckt ${gebunden + spendTotal(tx)} nicht` };
    }

    // Teuerste Pruefung zuletzt: Struktur, Adressableitung und Signatur(en).
    const strukturell = checkSpend(tx, height, this.params);
    if (strukturell) {
      return {
        ok: false,
        reason: strukturell === 'bad_signature' ? 'bad_signature'
          : strukturell === 'expired' ? 'expired'
          : strukturell === 'fee_too_low' ? 'fee_too_low' : 'malformed',
        detail: strukturell,
      };
    }

    const eintrag: Eintrag = {
      tx, txid: id, from: absender, nonce: tx.nonce, fee: tx.fee, seit: Date.now(),
    };

    let ersetzt: string | undefined;
    if (vorhanden) {
      this.nachId.delete(vorhanden.txid);
      wartend.delete(vorhanden.txid);
      ersetzt = vorhanden.txid;
    }
    this.nachId.set(id, eintrag);
    wartend.set(id, eintrag);
    this.nachAbsender.set(absender, wartend);
    this.stand++;

    return { ok: true, txid: id, ersetzt };
  }

  /** Eine einzelne Transaktion entfernen. */
  remove(id: string): boolean {
    const e = this.nachId.get(id);
    if (!e) return false;
    this.nachId.delete(id);
    this.stand++;
    const wartend = this.nachAbsender.get(e.from);
    if (wartend) {
      wartend.delete(id);
      if (wartend.size === 0) this.nachAbsender.delete(e.from);
    }
    return true;
  }

  /**
   * Nach einem angenommenen Block aufraeumen.
   *
   * Entfernt wird, was im Block steht -- und alles, was durch ihn ungueltig
   * geworden ist: zu niedrige Nonce oder keine Deckung mehr.
   */
  nachBlock(enthalten: Spend[], state: State, naechsteHoehe?: number): { entfernt: number; ungueltig: number } {
    let entfernt = 0;
    for (const t of enthalten) {
      if (this.remove(txidHex(t))) entfernt++;
    }

    let ungueltig = 0;
    for (const [absender, wartend] of [...this.nachAbsender]) {
      const konto = state.get(absender);
      let gebunden = 0n;
      for (const e of [...wartend.values()].sort((a, b) => a.nonce < b.nonce ? -1 : 1)) {
        /*
          Mit der Hoehe des naechsten Blocks faellt auch heraus, was die
          Regeln dort nicht mehr zulassen -- vor allem eine Ueberweisung der
          Fassung 1 an der Aktivierungshoehe von Fassung 6 (CONSENSUS_V6.md
          3). Der Blockbau liesse sie ohnehin liegen; hier verschwindet sie
          aus der Warteliste, statt eine Stunde als "wartend" zu stehen.
        */
        const regelbruch = naechsteHoehe !== undefined
          && checkSpend(e.tx, naechsteHoehe, this.params) !== null;
        const weg = !konto
          || regelbruch
          || e.nonce < konto.nonce
          || konto.balance < gebunden + spendTotal(e.tx);
        if (weg) { this.remove(e.txid); ungueltig++; continue; }
        gebunden += spendTotal(e.tx);
      }
    }
    return { entfernt, ungueltig };
  }

  /**
   * Nach einem Reorg: Transaktionen aus verdraengten Bloecken
   * zuruecknehmen.
   *
   * Sie waren einmal gueltig und gehoeren wieder in die Warteschlange --
   * sonst verschwindet eine bezahlte Ueberweisung, weil an anderer Stelle
   * ein Block gewonnen hat. Geprueft wird dabei erneut: Der neue Zweig kann
   * dieselbe Nonce anders belegt haben.
   */
  zurueck(txs: Spend[], state: State, height: number): number {
    let aufgenommen = 0;
    for (const t of txs) {
      if (this.add(t, state, height).ok) aufgenommen++;
    }
    return aufgenommen;
  }

  /** Aeltere Eintraege als `sekunden` verwerfen. */
  aufraeumen(sekunden = 3600): number {
    const grenze = Date.now() - sekunden * 1000;
    let weg = 0;
    for (const e of [...this.nachId.values()]) {
      if (e.seit < grenze) { this.remove(e.txid); weg++; }
    }
    return weg;
  }

  leeren(): void {
    this.stand++;
    this.nachId.clear();
    this.nachAbsender.clear();
  }
}
