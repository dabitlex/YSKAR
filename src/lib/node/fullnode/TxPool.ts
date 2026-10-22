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

/** Ein Kandidat im Haufen der Verdraengung (billigste Rate oben). */
interface Kandidat { rate: number; nr: number; txid: string }

export class TxPool {
  private nachId = new Map<string, Eintrag>();
  /** Je Absender die wartenden Nonces -- fuer Ersetzung, Luecken und die Verdraengung. */
  private nachAbsender = new Map<string, Map<string, Eintrag>>();
  /** Je Empfaenger die wartenden txids -- damit eine Kontenabfrage nicht den ganzen Pool liest. */
  private nachEmpfaenger = new Map<string, Set<string>>();
  private haufen: Kandidat[] = [];
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
  mindestGebuehr(height: number, memoBytes = 0): bigint {
    if (height < (this.params.feeV3Height ?? FEE_V3_HEIGHT)) return MIN_FEE;
    // 168 Byte bis Fassung 6, 174 ab v6Height (Ueberweisung Fassung 2).
    const bytes = transferBytesAt(height, memoBytes, this.params.v6Height);
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

    const bytes = spendBytes(tx);
    const mindest = this.mindestGebuehrFuer(tx, height);
    if (tx.fee < mindest) {
      return { ok: false, reason: 'fee_too_low', detail: `${tx.fee} < ${mindest}` };
    }
    // Die gestiegene Untergrenze -- vor allem anderen, damit eine Welle zu
    // billiger Transaktionen keine Signaturpruefung kostet.
    const abV3 = height >= (this.params.feeV3Height ?? FEE_V3_HEIGHT);
    if (abV3 && !lokal) {
      const g = this.grenzeFuer(bytes);
      if (tx.fee < g) {
        return { ok: false, reason: 'pool_min_fee', detail: `${tx.fee} < ${g}`, noetig: g };
      }
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
                 detail: `${tx.fee} < ${vorhanden.fee + mindest}`, noetig: vorhanden.fee + mindest };
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
    }

    // Deckung: Summe aller wartenden Betraege plus Gebuehren.
    let gebunden = 0n;
    for (const e of wartend.values()) {
      if (vorhanden && e.txid === vorhanden.txid) continue;
      gebunden += spendTotal(e.tx);
    }
    if (konto.balance < gebunden + spendTotal(tx)) {
      return { ok: false, reason: 'insufficient_funds',
               detail: `${konto.balance} deckt ${gebunden + spendTotal(tx)} nicht` };
    }

    // Platz: wer weichen muesste. Noch nichts entfernen -- erst muss die
    // Signatur stimmen.
    const zusaetzlich = bytes - (vorhanden?.bytes ?? 0);
    const rate = gebuehrJeByte(tx);
    let opfer: Eintrag[] = [];
    if (this.bytesBelegt + zusaetzlich > this.maxBytes) {
      const plan = this.planeVerdraengung(this.bytesBelegt + zusaetzlich - this.maxBytes, rate, absender, lokal);
      if ('fehlt' in plan) {
        if (plan.fehlt === null) {
          return { ok: false, reason: 'pool_min_fee', detail: 'voll: nichts verdraengbar' };
        }
        const noetig = BigInt(Math.ceil(plan.fehlt * bytes));
        return { ok: false, reason: 'pool_min_fee',
                 detail: `voll: ${tx.fee} < ${noetig}`, noetig };
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
      this.entferne(o.txid);
      if (o.rate > hoechste) hoechste = o.rate;
    }
    // Nur eine Verdraengung nach Preis hebt die Untergrenze. Eine eigene
    // Transaktion darf auch Teurere verdraengen -- das ist kein Andrang.
    if (opfer.length > 0 && !lokal) {
      const neu = hoechste + this.aufschlag;
      if (neu > this.untergrenzeJeByte()) { this.grenze = neu; this.grenzeUm = this.jetzt(); }
    }

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
   * Wer muesste weichen, damit `noetig` Bytes frei werden?
   *
   * Immer die billigste LETZTE Nonce eines fremden Absenders. Faellt sie,
   * wird dessen vorletzte zur letzten und steht ihrerseits zur Wahl. Der
   * eigene Absender der neuen Transaktion ist ausgenommen -- deren
   * Vorgaenger zu verdraengen, machte sie selbst zur Luecke. Lokale
   * Eintraege weichen nie.
   *
   * Liefert die Opfer, oder `fehlt`: die Rate je Byte, die die neue
   * Transaktion mindestens bieten muesste.
   */
  private planeVerdraengung(noetig: number, rate: number, absender: string, lokal: boolean):
    { opfer: Eintrag[] } | { fehlt: number | null } {
    const opfer: Eintrag[] = [];
    const zurueck: Kandidat[] = [];
    /** Simulierte letzte Nonce je Absender, nachdem Opfer weggefallen sind. */
    const letzte = new Map<string, bigint>();
    let frei = 0;
    let ergebnis: { opfer: Eintrag[] } | { fehlt: number | null } | null = null;

    while (frei < noetig) {
      const k = this.heraus();
      if (!k) {
        // Nichts mehr, das weichen koennte (nur lokale oder der eigene
        // Absender). Eine eigene Transaktion des Knotens darf die Grenze
        // dann ueberschreiten -- begrenzt durch MAX_PER_SENDER.
        // Fuer eine fremde Transaktion gibt es dann keinen Betrag, der jetzt
        // reicht -- `fehlt: null` statt einer Zahl, die nie genuegen wuerde.
        ergebnis = lokal ? { opfer } : { fehlt: null };
        break;
      }
      const e = this.nachId.get(k.txid);
      if (!e || e.lokal || e.nr !== k.nr) continue;   // veraltet: verwerfen
      const reihe = this.nachAbsender.get(e.from)!;
      const top = letzte.get(e.from) ?? this.hoechsteNonce(reihe);
      if (e.nonce !== top) continue;                  // nicht (mehr) die letzte
      zurueck.push(k);
      if (e.from === absender) continue;
      if (!lokal && rate < e.rate + this.aufschlag) {
        ergebnis = { fehlt: e.rate + this.aufschlag };
        break;
      }
      opfer.push(e);
      frei += e.bytes;
      // Die vorletzte Nonce wird zur letzten -- als Kandidat nachschieben.
      const davor = [...reihe.values()].find(x => x.nonce === e.nonce - 1n);
      letzte.set(e.from, e.nonce - 1n);
      if (davor) this.kandidat(davor);
    }
    for (const k of zurueck) this.haufen.push(k), this.hoch(this.haufen.length - 1);
    return ergebnis ?? { opfer };
  }

  private hoechsteNonce(reihe: Map<string, Eintrag>): bigint {
    let h = -1n;
    for (const e of reihe.values()) if (e.nonce > h) h = e.nonce;
    return h;
  }

  // ------------------------------------------------ Haufen (billigste oben)

  private vor(a: Kandidat, b: Kandidat): boolean {
    // Billiger zuerst; bei gleicher Rate die neuere (die aeltere wartet laenger).
    return a.rate !== b.rate ? a.rate < b.rate : a.nr > b.nr;
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
  private kandidat(e: Eintrag): void {
    if (e.lokal) return;
    this.haufen.push({ rate: e.rate, nr: e.nr, txid: e.txid });
    this.hoch(this.haufen.length - 1);
  }
  private heraus(): Kandidat | undefined {
    const h = this.haufen;
    if (h.length === 0) return undefined;
    const oben = h[0];
    const letzter = h.pop()!;
    if (h.length > 0) {
      h[0] = letzter;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && this.vor(h[l], h[m])) m = l;
        if (r < h.length && this.vor(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return oben;
  }
  /** Veraltete Kandidaten sammeln sich an; ab und zu frisch aufbauen. */
  private haufenPflegen(): void {
    if (this.haufen.length <= 4 * this.nachId.size + 1024) return;
    this.haufen = [];
    for (const reihe of this.nachAbsender.values()) {
      const top = this.hoechsteNonce(reihe);
      for (const e of reihe.values()) if (e.nonce === top) this.kandidat(e);
    }
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
    // Die neue ist die letzte Nonce ihres Absenders (Luecken gibt es nicht).
    if (e.nonce === this.hoechsteNonce(reihe)) this.kandidat(e);
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
      const warLetzte = e.nonce === this.hoechsteNonce(reihe);
      reihe.delete(id);
      if (reihe.size === 0) this.nachAbsender.delete(e.from);
      else if (warLetzte) {
        // Die vorletzte ist jetzt die letzte und kann verdraengt werden.
        const top = this.hoechsteNonce(reihe);
        for (const x of reihe.values()) if (x.nonce === top) this.kandidat(x);
      }
    }
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
      if (this.remove(txidHex(t))) entfernt++;
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
    this.bytesBelegt = 0;
  }
}
