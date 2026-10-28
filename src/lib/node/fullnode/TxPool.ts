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
 *
 * ---------------------------------------------------------------------
 * ANDRANG (docs/CONSENSUS_V6.md, Abschnitt 13b)
 *
 * Die Grenze zaehlt BYTES, nicht Transaktionen: Eine Sammelzahlung mit
 * 1.000 Empfaengern belegt so viel Speicher wie 200 Ueberweisungen.
 *
 * Ist die Grenze erreicht, wird NIE pauschal abgelehnt. Zahlt die neue
 * Transaktion je Byte mehr als die billigste wartende (plus einen kleinen
 * Aufschlag), verdraengt sie diese. Danach steigt die Untergrenze des
 * Knotens auf den verdraengten Satz plus Aufschlag und sinkt mit der Zeit
 * wieder (Halbwertszeit). /fees meldet diese Untergrenze, und jede Wallet
 * schlaegt damit eine Gebuehr vor, die angenommen wird.
 *
 * Verdraengt wird immer die LETZTE wartende Nonce eines Absenders: Faellt
 * eine mittlere heraus, waeren alle dahinter nie mehr ausfuehrbar.
 *
 * Welcher Absender weicht, entscheidet der WIRKSAME Satz seiner Kette: der
 * niedrigste Satz unter seinen wartenden Transaktionen. Zu diesem Satz kaeme
 * die Kette in einen Block -- der Blockbau nimmt je Absender immer die
 * naechste faellige Nonce, und eine billige vorn haelt alles dahinter auf.
 * Eine teure letzte Nonce hinter billigen schuetzt die Kette also nicht.
 * Fuer eine neue Transaktion zaehlt genauso der wirksame Satz: ihr eigener,
 * hoechstens der ihrer wartenden Vorgaenger.
 *
 * Eigene Transaktionen (lokal: die Wallet dieses Knotens, Auszahlungen
 * seines Pools) werden nie verdraengt und verfallen nicht.
 * ---------------------------------------------------------------------
 */
import {
  checkSpend, txidHex, transferBytesAt, senderRaw, spendTotal, spendOutputs, type Spend,
} from '../../core/tx.ts';
import { spendBytes, gebuehrJeByte, spendTxid, absenderHex } from '../../core/builder.ts';
import { MIN_FEE, RELAY_FEE_RATE, FEE_V3_HEIGHT } from '../../core/params.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';
import { toHex } from '../../core/codec.ts';
import { aktiviereZip215Wasm } from '../zip215.ts';
import type { State } from '../../core/state.ts';

/**
 * Obergrenze in Bytes (serialisiert). 32 MB sind rund 190.000 Ueberweisungen
 * -- ab Fassung 6 knapp 40 volle Bloecke Rueckstau. Im Arbeitsspeicher
 * belegt das ein Vielfaches (Objekte, Indizes); gemessen in
 * scripts/mempool-last/last.ts. Einstellbar mit --mempool-mb.
 */
export const MAX_POOL_BYTES = 32 * 1024 * 1024;
/** Hoechstzahl wartender Transaktionen je Absender. */
export const MAX_PER_SENDER = 32;
/**
 * Halbwertszeit der Untergrenze nach einer Verdraengung. Ist der Mempool
 * nur noch halb voll, sinkt sie viermal so schnell.
 */
export const UNTERGRENZE_HALBWERT_MS = 3 * 3600_000;

export type RejectReason =
  | 'malformed' | 'bad_signature' | 'fee_too_low' | 'expired'
  | 'unknown_account' | 'insufficient_funds' | 'nonce_too_low'
  | 'nonce_gap' | 'duplicate' | 'fee_not_higher'
  /** Unter der aktuellen Untergrenze des Knotens -- `noetig` sagt, was reicht. */
  | 'pool_min_fee'
  | 'sender_limit';

export type AddResult =
  | { ok: true; txid: string; ersetzt?: string; verdraengt?: number }
  | { ok: false; reason: RejectReason; detail?: string; noetig?: bigint };

export interface AddOptionen {
  /** Eigene Transaktion dieses Knotens: nie verdraengt, verfaellt nicht. */
  lokal?: boolean;
  /**
   * Aus einem Block, den ein Reorg verdraengt hat. Sie war schon einmal
   * angenommen und bezahlt; Untergrenze, Platz und die Grenze je Absender
   * halten sie nicht auf (siehe zurueck()).
   */
  reorg?: boolean;
}

export interface TxPoolOptionen {
  /** Obergrenze in Bytes. Vorgabe MAX_POOL_BYTES. */
  maxBytes?: number;
  /** Uhr, fuer Tests. */
  jetzt?: () => number;
}

interface Eintrag {
  tx: Spend;
  txid: string;
  from: string;
  /** Empfaenger als Hex der Rohadresse -- fuer die Kontenabfrage. */
  an: string[];
  nonce: bigint;
  fee: bigint;
  bytes: number;
  /** Gebuehr je Byte. */
  rate: number;
  seit: number;
  /** Laufende Nummer der Aufnahme; bei gleicher Rate geht die neuere zuerst. */
  nr: number;
  lokal: boolean;
  /** Regelstand, fuer den checkSpend bestanden ist (siehe regelstand()). */
  regel: string;
}

/**
 * Ein Absender im Haufen der Verdraengung (niedrigster wirksamer Satz oben).
 * `fassung` gilt nur, solange sie der aktuellen des Absenders entspricht --
 * aendert sich seine Reihe, kommt ein neuer Eintrag, und der alte ist
 * veraltet.
 */
interface Kandidat { rate: number; nr: number; from: string; fassung: number }

/** Wie viele bestaetigte eigene Transaktionen gemerkt werden, fuer einen Reorg. */
const LOKAL_BESTAETIGT_MAX = 4_096;

export class TxPool {
  private nachId = new Map<string, Eintrag>();
  /** Je Absender die wartenden Nonces -- fuer Ersetzung, Luecken und die Verdraengung. */
  private nachAbsender = new Map<string, Map<string, Eintrag>>();
  /** Je Empfaenger die wartenden txids -- damit eine Kontenabfrage nicht den ganzen Pool liest. */
  private nachEmpfaenger = new Map<string, Set<string>>();
  private haufen: Kandidat[] = [];
  /** Aktuelle Fassung je Absender -- gegen veraltete Eintraege im Haufen. */
  private fassungJe = new Map<string, number>();
  private naechsteFassung = 1;
  /** Eigene Transaktionen, die ein Block enthielt -- kommt er per Reorg weg, bleiben sie eigen. */
  private lokalBestaetigt = new Set<string>();
  private bytesBelegt = 0;
  private naechsteNr = 0;
  /** Untergrenze je Byte nach der letzten Verdraengung, und wann sie gesetzt wurde. */
  private grenze = 0;
  private grenzeUm = 0;

  private params: ConsensusParams;
  /** Weiterleitungs-Satz in Einheiten je Byte -- Policy, kein Konsens. */
  readonly relayFeeRate: bigint;
  readonly maxBytes: number;
  /** Aufschlag je Byte beim Verdraengen und Ersetzen der Untergrenze. */
  readonly aufschlag: number;
  private jetzt: () => number;

  constructor(params: ConsensusParams = MAINNET, relayFeeRate: bigint = RELAY_FEE_RATE,
              opt: TxPoolOptionen = {}) {
    // Signaturen nach der Regel aus 7.8 ueber das WASM-Modul pruefen;
    // dieselbe Regel wie noble, nur schneller. Mehrfacher Aufruf ist harmlos.
    aktiviereZip215Wasm();
    this.params = params;
    this.relayFeeRate = relayFeeRate;
    this.maxBytes = opt.maxBytes ?? MAX_POOL_BYTES;
    this.jetzt = opt.jetzt ?? Date.now;
    this.aufschlag = Math.max(1, Number(relayFeeRate) / 10);
  }

  /**
   * Zaehler, der sich bei JEDER Aenderung des Inhalts erhoeht.
   *
   * Daran erkennt der Blockbau, ob seine Vorarbeit (Auswahl und Zustand
   * nach den Ueberweisungen, siehe jobVorlage.ts) noch zum Mempool passt.
   * Ein Zaehler statt eines Vergleichs der Inhalte: Der kostet nichts und
   * kann sich nicht irren -- jede Aenderung geht durch einfuegen() oder
   * entferne().
   */
  private stand = 0;
  version(): number { return this.stand; }

  size(): number { return this.nachId.size; }
  belegt(): number { return this.bytesBelegt; }
  has(id: string): boolean { return this.nachId.has(id); }
  get(id: string): Spend | null { return this.nachId.get(id)?.tx ?? null; }
  istLokal(id: string): boolean { return this.nachId.get(id)?.lokal ?? false; }

  /** Alle wartenden Transaktionen, in der Reihenfolge der Aufnahme. */
  alle(): Spend[] {
    return [...this.nachId.values()].map(e => e.tx);
  }

  /**
   * Die eigenen Transaktionen dieses Knotens (zum erneuten Ankuendigen und
   * Sichern) -- je Absender nach Nonce sortiert. In Aufnahmereihenfolge
   * stuende eine erhoehte Nonce 0 hinter Nonce 1 und 2, und beim Wiederladen
   * nach einem Neustart scheiterten 1 und 2 an der Luecke.
   */
  lokale(): Spend[] {
    return [...this.nachId.values()].filter(e => e.lokal)
      .sort((a, b) => (a.from === b.from ? (a.nonce < b.nonce ? -1 : 1) : (a.from < b.from ? -1 : 1)))
      .map(e => e.tx);
  }

  /** Was von dieser Rohadresse (Hex) wartet oder an sie unterwegs ist. */
  zuKonto(key: string): Spend[] {
    const ids = new Set<string>();
    for (const id of this.nachAbsender.get(key)?.keys() ?? []) ids.add(id);
    for (const id of this.nachEmpfaenger.get(key) ?? []) ids.add(id);
    const out: Eintrag[] = [];
    for (const id of ids) { const e = this.nachId.get(id); if (e) out.push(e); }
    return out.sort((a, b) => a.nr - b.nr).map(e => e.tx);
  }

  // ------------------------------------------------------------ Gebuehren

  /**
   * Der Regelstand an einer Hoehe. checkSpend haengt von der Hoehe nur
   * ueber zwei Schwellen ab (Satz je Byte ab Fassung 3, Fassung 6) und
   * ueber das Gueltigkeitsfenster der Transaktion. Solange der Regelstand
   * gleich bleibt, genuegt fuer eine schon gepruefte Transaktion also der
   * Blick aufs Fenster -- die Signatur aendert sich nicht.
   */
  private regelstand(height: number): string {
    return `${height >= (this.params.feeV3Height ?? FEE_V3_HEIGHT) ? 1 : 0}${height >= this.params.v6Height ? 1 : 0}`;
  }

  /** Die Untergrenze je Byte jetzt -- mindestens der Weiterleitungs-Satz. */
  untergrenzeJeByte(): number {
    const relay = Number(this.relayFeeRate);
    if (this.grenze <= relay) return relay;
    const jetzt = this.jetzt();
    const halbwert = this.bytesBelegt <= this.maxBytes / 2
      ? UNTERGRENZE_HALBWERT_MS / 4 : UNTERGRENZE_HALBWERT_MS;
    const vergangen = Math.max(0, jetzt - this.grenzeUm);
    this.grenze = this.grenze * Math.pow(0.5, vergangen / halbwert);
    this.grenzeUm = jetzt;
    // Nahe am Weiterleitungs-Satz: ganz zuruecksetzen, statt ewig um eine
    // Nachkommastelle darueber zu schweben.
    if (this.grenze < relay + this.aufschlag / 2) { this.grenze = 0; return relay; }
    return this.grenze;
  }

  /** Untergrenze fuer eine Groesse in Bytes, gerundet auf ganze Einheiten nach oben. */
  private grenzeFuer(bytes: number): bigint {
    return BigInt(Math.ceil(this.untergrenzeJeByte() * bytes));
  }

  /**
   * Was dieser Knoten mindestens verlangt, um eine Ueberweisung dieser
   * Notizlaenge an dieser Hoehe zu behalten. Bis zur Aktivierung von
   * Fassung 3 die alte Untergrenze; danach der Satz je Byte, bei Andrang die
   * gestiegene Untergrenze.
   */
  mindestGebuehr(height: number, memoBytes = 0, empfaengerBytes?: number): bigint {
    if (height < (this.params.feeV3Height ?? FEE_V3_HEIGHT)) return MIN_FEE;
    // 168 Byte bis Fassung 6, ab v6Height 174 (Empfaenger Version 0) bzw.
    // 186 (Version 1, ysr1p…).
    const bytes = transferBytesAt(height, memoBytes, this.params.v6Height, empfaengerBytes);
    const relay = BigInt(bytes) * this.relayFeeRate;
    const g = this.grenzeFuer(bytes);
    return g > relay ? g : relay;
  }

  /** Dasselbe fuer eine konkrete Transaktion: ihre tatsaechliche Groesse zaehlt. */
  mindestGebuehrFuer(tx: Spend, height: number): bigint {
    if (height < (this.params.feeV3Height ?? FEE_V3_HEIGHT)) return MIN_FEE;
    return BigInt(spendBytes(tx)) * this.relayFeeRate;
  }

  // ------------------------------------------------------------ Aufnehmen

  /**
   * Eine Transaktion aufnehmen.
   *
   * Reihenfolge: billig vor teuer. Struktur und Gebuehr kosten
   * Mikrosekunden, die Signaturpruefung Millisekunden. Wer das umdreht,
   * laedt jeden ein, den Knoten mit Muell zu beschaeftigen. Verdraengt wird
   * erst, wenn die neue Transaktion jede Pruefung bestanden hat.
   */
  add(tx: Spend, state: State, height: number, opt: AddOptionen = {}): AddResult {
    const id = spendTxid(tx);
    if (this.nachId.has(id)) return { ok: false, reason: 'duplicate' };
    const lokal = opt.lokal === true;
    const reorg = opt.reorg === true;

    const bytes = spendBytes(tx);
    const mindest = this.mindestGebuehrFuer(tx, height);
    if (tx.fee < mindest) {
      return { ok: false, reason: 'fee_too_low', detail: `${tx.fee} < ${mindest}` };
    }
    // Die gestiegene Untergrenze -- vor allem anderen, damit eine Welle zu
    // billiger Transaktionen keine Signaturpruefung kostet.
    const abV3 = height >= (this.params.feeV3Height ?? FEE_V3_HEIGHT);
    const boden = abV3 && !lokal && !reorg ? this.grenzeFuer(bytes) : 0n;
    if (tx.fee < boden) {
      return { ok: false, reason: 'pool_min_fee', detail: `${tx.fee} < ${boden}`,
               noetig: this.genugBeiAndrang(tx, bytes, boden, mindest) };
    }
    if (spendTotal(tx) - tx.fee <= 0n) {
      return { ok: false, reason: 'malformed', detail: 'bad_amount' };
    }
    if (tx.validUntil !== 0 && height > tx.validUntil) {
      return { ok: false, reason: 'expired', detail: `valid until ${tx.validUntil}` };
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
    const absender = absenderHex(tx);
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
      // Weiterleitungsgebuehr der neuen Transaktion. Sonst liesse sich eine
      // wartende Transaktion fuer eine Einheit mehr beliebig oft neu
      // verteilen, und jede Verteilung kostet alle Knoten Bandbreite.
      if (tx.fee < vorhanden.fee + mindest) {
        return { ok: false, reason: 'fee_not_higher',
                 detail: `${tx.fee} < ${vorhanden.fee + mindest}`,
                 noetig: lokal ? vorhanden.fee + mindest : this.genugBeiAndrang(tx, bytes, boden, mindest) };
      }
    } else {
      // Keine Luecken: Nonce muss lueckenlos an das anschliessen, was schon
      // wartet. Sonst fuellt sich der Pool mit Transaktionen, die nie
      // ausfuehrbar werden.
      const naechste = konto.nonce + BigInt(wartend.size);
      if (tx.nonce > naechste) {
        return { ok: false, reason: 'nonce_gap',
                 detail: `${tx.nonce}, expected at most ${naechste}` };
      }
      if (wartend.size >= MAX_PER_SENDER && !reorg) {
        return { ok: false, reason: 'sender_limit' };
      }
    }

    // Deckung: Summe aller wartenden Betraege plus Gebuehren.
    let gebunden = 0n;
    for (const e of wartend.values()) {
      if (vorhanden && e.txid === vorhanden.txid) continue;
      gebunden += spendTotal(e.tx);
    }
    if (konto.balance < gebunden + spendTotal(tx)) {
      return { ok: false, reason: 'insufficient_funds',
               detail: `${konto.balance} does not cover ${gebunden + spendTotal(tx)}` };
    }

    // Platz: wer weichen muesste. Noch nichts entfernen -- erst muss die
    // Signatur stimmen. Die Planung veraendert nichts am Mempool.
    const zusaetzlich = bytes - (vorhanden?.bytes ?? 0);
    const rate = gebuehrJeByte(tx);
    let opfer: Eintrag[] = [];
    if (!reorg && this.bytesBelegt + zusaetzlich > this.maxBytes) {
      // Wirksamer Satz: hoechstens der der wartenden Vorgaenger.
      let vorn = Infinity;
      for (const e of wartend.values()) {
        if (e.nonce < tx.nonce && e.rate < vorn) vorn = e.rate;
      }
      const wirksam = Math.min(rate, vorn);
      const plan = this.planeVerdraengung(this.bytesBelegt + zusaetzlich - this.maxBytes, wirksam, absender, lokal);
      if ('fehlt' in plan) {
        if (plan.fehlt === null) {
          return { ok: false, reason: 'pool_min_fee', detail: 'full: nothing can be replaced' };
        }
        if (vorn < plan.fehlt) {
          // Mehr Gebuehr HIER hilft nicht: Ein wartender Vorgaenger ist zu
          // billig. Erst ihn erhoehen -- kein Betrag fuer diese hier.
          return { ok: false, reason: 'pool_min_fee', detail: 'full: a waiting predecessor pays too little' };
        }
        const noetig = this.genugBeiAndrang(tx, bytes, boden, mindest);
        return { ok: false, reason: 'pool_min_fee',
                 detail: `full: ${tx.fee} < ${noetig ?? '?'}`, noetig };
      }
      opfer = plan.opfer;
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

    // Jetzt erst verdraengen. Die Untergrenze steigt auf den hoechsten
    // verdraengten Satz plus Aufschlag -- sonst kaeme das Verdraengte beim
    // naechsten Weiterreichen sofort wieder herein.
    let hoechste = 0;
    for (const o of opfer) {
      const w = this.wirksamerSatz(o.from);
      this.entferne(o.txid);
      if (w > hoechste) hoechste = w;
    }
    // Nur eine Verdraengung nach Preis hebt die Untergrenze. Eine eigene
    // Transaktion darf auch Teurere verdraengen -- das ist kein Andrang.
    if (opfer.length > 0 && !lokal) this.grenzeHeben(hoechste);

    let ersetzt: string | undefined;
    if (vorhanden) {
      this.entferne(vorhanden.txid);
      ersetzt = vorhanden.txid;
    }
    this.einfuegen({
      tx, txid: id, from: absender,
      an: [...new Set(spendOutputs(tx).map(o => toHex(o.to)))],
      nonce: tx.nonce, fee: tx.fee, bytes, rate,
      seit: this.jetzt(), nr: this.naechsteNr++, lokal, regel: this.regelstand(height),
    });

    return { ok: true, txid: id, ersetzt, verdraengt: opfer.length || undefined };
  }

  /**
   * Die Gebuehr, mit der DIESE Transaktion jetzt angenommen wuerde --
   * alles zusammen: Untergrenze, Ersetzung (alte Gebuehr plus
   * Weiterleitungsgebuehr) und, bei vollem Mempool, alle noetigen
   * Verdraengungen. undefined, wenn keine Gebuehr auf dieser Transaktion
   * hilft (nichts verdraengbar, oder ein wartender Vorgaenger ist zu billig).
   * Veraendert nichts.
   */
  private genugBeiAndrang(tx: Spend, bytes: number, boden: bigint, mindest: bigint): bigint | undefined {
    let noetig = boden > mindest ? boden : mindest;
    const absender = absenderHex(tx);
    const wartend = this.nachAbsender.get(absender);
    const vorhanden = wartend ? [...wartend.values()].find(e => e.nonce === tx.nonce) : undefined;
    if (vorhanden && vorhanden.fee + mindest > noetig) noetig = vorhanden.fee + mindest;
    const ueber = this.bytesBelegt + bytes - (vorhanden?.bytes ?? 0) - this.maxBytes;
    if (ueber > 0) {
      let vorn = Infinity;
      for (const e of wartend?.values() ?? []) if (e.nonce < tx.nonce && e.rate < vorn) vorn = e.rate;
      // Mit einem Satz, der nie reicht: Die Planung laeuft dann ganz durch
      // und nennt den Satz, der fuer alle noetigen Verdraengungen reicht.
      const plan = this.planeVerdraengung(ueber, -Infinity, absender, false);
      if ('fehlt' in plan) {
        if (plan.fehlt === null || vorn < plan.fehlt) return undefined;
        // Verglichen wird als Gleitkomma-Satz (Gebuehr / Bytes): Aufrunden
        // allein kann knapp darunter landen (588 / 350 < 1,6800000000000002).
        let n = BigInt(Math.ceil(plan.fehlt * bytes));
        while (Number(n) / bytes < plan.fehlt) n++;
        if (n > noetig) noetig = n;
      }
    }
    return noetig;
  }

  /** Die Untergrenze nach einer Verdraengung zum wirksamen Satz `satz`. */
  private grenzeHeben(satz: number): void {
    const neu = satz + this.aufschlag;
    if (neu > this.untergrenzeJeByte()) { this.grenze = neu; this.grenzeUm = this.jetzt(); }
  }

  /** Niedrigster Satz unter den wartenden eines Absenders (Infinity ohne). */
  private wirksamerSatz(from: string): number {
    let m = Infinity;
    for (const e of this.nachAbsender.get(from)?.values() ?? []) if (e.rate < m) m = e.rate;
    return m;
  }

  /** Die Reihe eines Absenders, nach Nonce aufsteigend. */
  private reiheSortiert(from: string): Eintrag[] {
    return [...(this.nachAbsender.get(from)?.values() ?? [])]
      .sort((a, b) => (a.nonce < b.nonce ? -1 : a.nonce > b.nonce ? 1 : 0));
  }

  /**
   * Ueber der Grenze (nur nach einem Reorg moeglich, zurueck() vor
   * nachBlock()): die billigsten fremden Enden verdraengen, bis es wieder
   * passt. Eigene weichen nie.
   */
  private kuerzen(): void {
    let hoechste = 0;
    let verdraengt = false;
    while (this.bytesBelegt > this.maxBytes) {
      const k = this.oben();
      if (!k) break;
      const reihe = this.reiheSortiert(k.from);
      const letzte = reihe[reihe.length - 1];
      if (k.rate > hoechste) hoechste = k.rate;
      this.entferne(letzte.txid);
      verdraengt = true;
    }
    if (verdraengt) this.grenzeHeben(hoechste);
  }

  /**
   * Wer muesste weichen, damit `noetig` Bytes frei werden?
   *
   * Immer die LETZTE Nonce des Absenders mit dem niedrigsten wirksamen Satz
   * (fremd, nicht der Absender der neuen Transaktion -- deren Vorgaenger zu
   * verdraengen, machte sie selbst zur Luecke). Faellt sie, steigt der
   * wirksame Satz des Absenders hoechstens, und seine neue letzte steht
   * ihrerseits zur Wahl. Lokale Eintraege weichen nie.
   *
   * Die Planung laeuft vollstaendig, auch wenn schon das erste Opfer zu teuer
   * ist: `fehlt` ist der Satz, der fuer ALLE noetigen Opfer reicht.
   *
   * Veraendert nichts: Was aus dem Haufen genommen wird, kommt zurueck, und
   * Zwischenstaende liegen in einem eigenen kleinen Haufen. Eine danach
   * abgelehnte Transaktion (etwa wegen ihrer Signatur) hinterlaesst nichts.
   *
   * Liefert die Opfer, oder `fehlt`: den wirksamen Satz je Byte, den die neue
   * Transaktion mindestens bieten muesste (null: es gibt keinen).
   */
  private planeVerdraengung(noetig: number, wirksam: number, absender: string, lokal: boolean):
    { opfer: Eintrag[] } | { fehlt: number | null } {
    const opfer: Eintrag[] = [];
    const genommen: Kandidat[] = [];
    const zwischen: Kandidat[] = [];
    /** Simulierte Reihe je Absender (nach Nonce), nachdem Opfer weggefallen sind. */
    const rest = new Map<string, Eintrag[]>();
    let frei = 0;
    let teuerste = 0;
    let keiner = false;

    while (frei < noetig) {
      // Veraltete Eintraege oben im echten Haufen duerfen weg -- sie sind
      // ohnehin ungueltig. Gueltige werden gemerkt und zurueckgelegt.
      while (this.haufen.length > 0 && !this.aktuell(this.haufen[0])) this.heraus();
      const echt = this.haufen[0];
      const sim = zwischen[0];
      let k: Kandidat | undefined;
      if (echt && (!sim || this.vor(echt, sim))) { k = this.heraus()!; genommen.push(k); }
      else if (sim) k = haufenHeraus(zwischen, (a, b) => this.vor(a, b));
      if (!k) { keiner = true; break; }
      if (k.from === absender) continue;

      const reihe = rest.get(k.from) ?? this.reiheSortiert(k.from);
      const letzte = reihe[reihe.length - 1];
      if (!letzte || letzte.lokal) continue;
      opfer.push(letzte);
      frei += letzte.bytes;
      if (k.rate > teuerste) teuerste = k.rate;
      const uebrig = reihe.slice(0, -1);
      rest.set(k.from, uebrig);
      const neu = uebrig.length > 0 ? kandidatFuer(uebrig, k.from, -1) : null;
      if (neu) haufenRein(zwischen, neu, (a, b) => this.vor(a, b));
    }
    for (const k of genommen) { this.haufen.push(k); this.hoch(this.haufen.length - 1); }

    if (keiner) return lokal ? { opfer } : { fehlt: null };
    if (!lokal && wirksam < teuerste + this.aufschlag) return { fehlt: teuerste + this.aufschlag };
    return { opfer };
  }

  // ------------------------------------------------ Haufen (billigste oben)

  private vor(a: Kandidat, b: Kandidat): boolean {
    // Billiger zuerst; bei gleicher Rate die neuere (die aeltere wartet laenger).
    return a.rate !== b.rate ? a.rate < b.rate : a.nr > b.nr;
  }
  private aktuell(k: Kandidat): boolean {
    return this.fassungJe.get(k.from) === k.fassung;
  }
  private hoch(i: number): void {
    const h = this.haufen;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.vor(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  /**
   * Die Reihe eines Absenders hat sich geaendert: neue Fassung, neuer
   * Eintrag im Haufen (sofern seine letzte Nonce verdraengt werden darf).
   */
  private absenderNeu(from: string): void {
    const reihe = this.reiheSortiert(from);
    if (reihe.length === 0) { this.fassungJe.delete(from); return; }
    const fassung = this.naechsteFassung++;
    this.fassungJe.set(from, fassung);
    const k = kandidatFuer(reihe, from, fassung);
    if (k) { this.haufen.push(k); this.hoch(this.haufen.length - 1); }
  }
  private heraus(): Kandidat | undefined {
    return haufenHeraus(this.haufen, (a, b) => this.vor(a, b));
  }
  /** Der oberste aktuelle Kandidat, aus dem Haufen genommen. */
  private oben(): Kandidat | undefined {
    for (;;) {
      const k = this.heraus();
      if (!k) return undefined;
      if (this.aktuell(k)) return k;
    }
  }
  /** Veraltete Kandidaten sammeln sich an; ab und zu frisch aufbauen. */
  private haufenPflegen(): void {
    if (this.haufen.length <= 2 * this.fassungJe.size + 1024) return;
    this.haufen = this.haufen.filter(k => this.aktuell(k));
    // Floyd: von der Mitte abwaerts einsortieren.
    const h = this.haufen;
    for (let i = (h.length >> 1) - 1; i >= 0; i--) senke(h, i, (a, b) => this.vor(a, b));
  }

  // ------------------------------------------------ Einfuegen und Entfernen

  private einfuegen(e: Eintrag): void {
    this.nachId.set(e.txid, e);
    let reihe = this.nachAbsender.get(e.from);
    if (!reihe) { reihe = new Map(); this.nachAbsender.set(e.from, reihe); }
    reihe.set(e.txid, e);
    for (const k of e.an) {
      let s = this.nachEmpfaenger.get(k);
      if (!s) { s = new Set(); this.nachEmpfaenger.set(k, s); }
      s.add(e.txid);
    }
    this.bytesBelegt += e.bytes;
    this.absenderNeu(e.from);
    this.stand++;
    this.haufenPflegen();
  }

  private entferne(id: string): Eintrag | null {
    const e = this.nachId.get(id);
    if (!e) return null;
    this.nachId.delete(id);
    this.bytesBelegt -= e.bytes;
    this.stand++;
    for (const k of e.an) {
      const s = this.nachEmpfaenger.get(k);
      if (s) { s.delete(id); if (s.size === 0) this.nachEmpfaenger.delete(k); }
    }
    const reihe = this.nachAbsender.get(e.from);
    if (reihe) {
      reihe.delete(id);
      if (reihe.size === 0) this.nachAbsender.delete(e.from);
    }
    this.absenderNeu(e.from);
    this.haufenPflegen();
    return e;
  }

  /** Eine Transaktion und alle spaeteren Nonces desselben Absenders entfernen. */
  private entferneAb(e: Eintrag): number {
    const reihe = this.nachAbsender.get(e.from);
    if (!reihe) return 0;
    const weg = [...reihe.values()].filter(x => x.nonce >= e.nonce)
      .sort((a, b) => (a.nonce > b.nonce ? -1 : 1));   // von hinten: keine Zwischen-Luecken
    for (const x of weg) this.entferne(x.txid);
    return weg.length;
  }

  /** Eine einzelne Transaktion entfernen. */
  remove(id: string): boolean {
    return this.entferne(id) !== null;
  }

  // ------------------------------------------------ Fuer den Blockbau

  /** Kann `e` an dieser Hoehe in einen Block? Ohne Signatur, wenn sie schon geprueft ist. */
  private gueltigAn(e: Eintrag, height: number): boolean {
    const regel = this.regelstand(height);
    const t = e.tx;
    if (e.regel === regel) {
      const von = 'validFrom' in t ? (t.validFrom ?? 0) : 0;
      if (von !== 0 && height < von) return false;
      if (t.validUntil !== 0 && height > t.validUntil) return false;
      return true;
    }
    // Neuer Regelstand (Aktivierungshoehe): einmal voll pruefen.
    if (checkSpend(t, height, this.params) !== null) return false;
    e.regel = regel;
    return true;
  }

  /**
   * Was an dieser Hoehe in einen Block darf -- jede davon besteht
   * checkSpend(t, height). Fuer die Auswahl mit `vorgeprueft: true`.
   */
  fuerBlock(height: number): Spend[] {
    const out: Spend[] = [];
    for (const e of this.nachId.values()) if (this.gueltigAn(e, height)) out.push(e.tx);
    return out;
  }

  /**
   * Nach einem angenommenen Block aufraeumen.
   *
   * Entfernt wird, was im Block steht -- und alles, was durch ihn ungueltig
   * geworden ist: zu niedrige Nonce, keine Deckung mehr oder nicht mehr
   * zulaessig an der naechsten Hoehe. Faellt eine Nonce heraus, fallen die
   * spaeteren desselben Absenders mit: Sie waeren nie mehr ausfuehrbar.
   */
  nachBlock(enthalten: Spend[], state: State, naechsteHoehe?: number): { entfernt: number; ungueltig: number } {
    let entfernt = 0;
    for (const t of enthalten) {
      const id = txidHex(t);
      if (this.nachId.get(id)?.lokal) this.merkeLokalBestaetigt(id);
      if (this.remove(id)) entfernt++;
    }

    let ungueltig = 0;
    for (const [absender, wartend] of [...this.nachAbsender]) {
      const konto = state.get(absender);
      let gebunden = 0n;
      let erwartet = konto?.nonce ?? 0n;
      const reihe = [...wartend.values()].sort((a, b) => (a.nonce < b.nonce ? -1 : 1));
      for (let i = 0; i < reihe.length; i++) {
        const e = reihe[i];
        if (konto && e.nonce < konto.nonce) { this.entferne(e.txid); ungueltig++; continue; }
        /*
          Mit der Hoehe des naechsten Blocks faellt auch heraus, was die
          Regeln dort nicht mehr zulassen -- vor allem eine Ueberweisung der
          Fassung 1 an der Aktivierungshoehe von Fassung 6 (CONSENSUS_V6.md
          3). Der Blockbau liesse sie ohnehin liegen; hier verschwindet sie
          aus der Warteliste, statt als "wartend" zu stehen.
        */
        const weg = !konto
          || e.nonce !== erwartet
          || (naechsteHoehe !== undefined && !this.gueltigAn(e, naechsteHoehe))
          || konto.balance < gebunden + spendTotal(e.tx);
        if (weg) { ungueltig += this.entferneAb(e); break; }
        gebunden += spendTotal(e.tx);
        erwartet++;
      }
    }
    // Ueber der Grenze kann der Mempool nur nach einem Reorg sein (zurueck()).
    this.kuerzen();
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
    /*
      Ohne Untergrenze, Platz- und Absendergrenze (reorg: true): Sonst
      liesse die Ablehnung eine Luecke vor den spaeteren Nonces desselben
      Absenders, und nachBlock() verwuerfe sie alle -- bis zu 32 bezahlte
      Transaktionen, nur weil ein anderer Zweig gewonnen hat. Signatur,
      Nonce und Deckung werden weiter geprueft. Je Absender nach Nonce, damit
      keine kuenstliche Luecke entsteht. Was danach ueber der Grenze liegt,
      raeumt kuerzen() von den billigsten fremden Enden.
    */
    const sortiert = [...txs].sort((a, b) => {
      const x = absenderHex(a), y = absenderHex(b);
      if (x !== y) return x < y ? -1 : 1;
      return a.nonce < b.nonce ? -1 : a.nonce > b.nonce ? 1 : 0;
    });
    let aufgenommen = 0;
    for (const t of sortiert) {
      const id = spendTxid(t);
      const lokal = this.lokalBestaetigt.has(id);
      if (this.add(t, state, height, { reorg: true, lokal }).ok) aufgenommen++;
    }
    // Gekuerzt wird erst in nachBlock(): Bis dahin zaehlen noch die
    // Transaktionen mit, die der neue Zweig bestaetigt hat. Jetzt zu kuerzen,
    // verdraengte ehrliche Transaktionen und hoebe die Untergrenze -- fuer
    // Platz, der gleich ohnehin frei wird.
    return aufgenommen;
  }

  private merkeLokalBestaetigt(id: string): void {
    this.lokalBestaetigt.delete(id);
    this.lokalBestaetigt.add(id);
    if (this.lokalBestaetigt.size > LOKAL_BESTAETIGT_MAX) {
      const aeltester = this.lokalBestaetigt.values().next().value;
      if (aeltester !== undefined) this.lokalBestaetigt.delete(aeltester);
    }
  }

  /**
   * Aeltere Eintraege als `sekunden` verwerfen -- samt ihrer spaeteren
   * Nonces. Eigene (lokale) bleiben.
   */
  aufraeumen(sekunden: number): number {
    const grenze = this.jetzt() - sekunden * 1000;
    let weg = 0;
    for (const e of [...this.nachId.values()]) {
      if (e.lokal || e.seit >= grenze || !this.nachId.has(e.txid)) continue;
      // Haengt an dieser Nonce eine eigene spaetere, bleibt sie: Sonst
      // verfiele die eigene mit, und eigene verfallen nie.
      const reihe = this.nachAbsender.get(e.from);
      if (reihe && [...reihe.values()].some(x => x.lokal && x.nonce > e.nonce)) continue;
      weg += this.entferneAb(e);
    }
    return weg;
  }

  leeren(): void {
    this.stand++;
    this.nachId.clear();
    this.nachAbsender.clear();
    this.nachEmpfaenger.clear();
    this.haufen = [];
    this.fassungJe.clear();
    this.bytesBelegt = 0;
  }
}

/** Kandidat fuer einen Absender aus seiner Reihe (nach Nonce), oder null, wenn seine letzte eigen ist. */
function kandidatFuer(reihe: Eintrag[], from: string, fassung: number): Kandidat | null {
  const letzte = reihe[reihe.length - 1];
  if (!letzte || letzte.lokal) return null;
  let rate = Infinity;
  for (const e of reihe) if (e.rate < rate) rate = e.rate;
  return { rate, nr: letzte.nr, from, fassung };
}

function senke(h: Kandidat[], i: number, vor: (a: Kandidat, b: Kandidat) => boolean): void {
  for (;;) {
    const l = 2 * i + 1, r = l + 1;
    let m = i;
    if (l < h.length && vor(h[l], h[m])) m = l;
    if (r < h.length && vor(h[r], h[m])) m = r;
    if (m === i) return;
    [h[i], h[m]] = [h[m], h[i]];
    i = m;
  }
}
function haufenHeraus(h: Kandidat[], vor: (a: Kandidat, b: Kandidat) => boolean): Kandidat | undefined {
  if (h.length === 0) return undefined;
  const oben = h[0];
  const letzter = h.pop()!;
  if (h.length > 0) { h[0] = letzter; senke(h, 0, vor); }
  return oben;
}
function haufenRein(h: Kandidat[], k: Kandidat, vor: (a: Kandidat, b: Kandidat) => boolean): void {
  h.push(k);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!vor(h[i], h[p])) break;
    [h[i], h[p]] = [h[p], h[i]];
    i = p;
  }
}
