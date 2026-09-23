/**
 * Gebuehrenmarkt.
 *
 * AUSDRUECKLICH KEINE KONSENSREGEL. Nichts hier entscheidet, ob ein Block
 * oder eine Transaktion gueltig ist -- das bleibt bei MIN_FEE und
 * checkTransfer(). Was hier steht, ist eine Auskunft: Wie lange wird es
 * voraussichtlich dauern, und was muesste ich zahlen, damit es schneller
 * geht?
 *
 * Wuerde eine Empfehlung zur Regel, haetten verschiedene Knoten
 * verschiedene Regeln -- und die Kette spaltete sich an einer Zahl, die
 * niemand festgeschrieben hat.
 *
 * ---------------------------------------------------------------------
 * WARUM KEIN SATZ JE BYTE
 *
 * Bei Bitcoin kostet eine Transaktion mit 50 Eingaengen zwanzigmal so viel
 * Blockraum wie eine kleine -- deshalb rechnet man dort je Byte.
 *
 * Eine YSKAR-Ueberweisung ist zwischen 168 und 200 Byte gross, also 19 %
 * Unterschied. Und die Blockgrenze zaehlt TRANSAKTIONEN (2000), nicht
 * Bytes. Knapp ist hier also ein PLATZ, nicht ein Byte -- und der Preis
 * eines Platzes ist genau die absolute Gebuehr, die es schon gibt.
 *
 * Sobald Transaktionen unterschiedlich gross werden UND die Blockgrenze in
 * Bytes zaehlt, wird ein Satz je Byte richtig. Beides waere eine
 * Konsensaenderung mit Aktivierungshoehe. Das Feld `fee` bliebe dabei
 * unveraendert -- die Rate ist nur die Rechnung fee / vbytes.
 * ---------------------------------------------------------------------
 */
import { serializeTx, txid, type Transfer } from './tx.ts';
import { toHex } from './codec.ts';
import { cloneState, getAccount, type State } from './state.ts';
import { selectTransactions } from './builder.ts';
import { MAX_TXS_PER_BLOCK, MIN_FEE } from './params.ts';

/** Wie viele Bloecke vorausgerechnet werden. Weiter waere geraten. */
export const VORSCHAU_BLOECKE = 8;

/**
 * Groesse einer Transaktion in Byte.
 *
 * Heute nur zur Anzeige. YSKAR hat keine Witness-Struktur, also gibt es
 * nichts zu gewichten -- vbytes waeren schlicht diese Zahl. Eine
 * kuenstliche Gewichtung waere erfunden.
 */
export const vbytes = (t: Transfer): number => serializeTx(t).length;

export interface PlatzImStau {
  txid: string;
  fee: bigint;
  /** 1 = naechster Block. null = passt in den naechsten Bloecken nicht. */
  block: number | null;
  /** Platz in der Warteschlange, 1-basiert. */
  rang: number;
}

export interface Stufe {
  /** Was zu zahlen waere. */
  fee: bigint;
  /** In welchem Block das voraussichtlich landet. */
  block: number;
}

export interface Marktlage {
  /** Wartende Transaktionen. */
  wartend: number;
  /** Plaetze je Block, ohne die Coinbase. */
  plaetzeJeBlock: number;
  /**
   * Was die schwaechste Transaktion zahlt, die es noch in den naechsten
   * Block schafft. Null, wenn der Block nicht voll wird.
   */
  kappung: bigint | null;
  /** Ist gerade ueberhaupt Andrang? */
  andrang: boolean;
  langsam: Stufe;
  normal: Stufe;
  schnell: Stufe;
  /** Voraussichtliche Verteilung: Zahl der Transaktionen je Block. */
  bloecke: { block: number; anzahl: number; minFee: bigint }[];
}

/**
 * Den Mempool vorausrechnen -- Block fuer Block.
 *
 * Benutzt dieselbe Auswahl wie der echte Blockbau (selectTransactions).
 * Das ist der Punkt: Eine nachgebaute Sortierung koennte anders entscheiden
 * als der Blockbau, und die Vorhersage waere systematisch falsch.
 *
 * Dabei wird die NONCE-REIHENFOLGE beachtet, weil selectTransactions sie
 * beachtet: Im Kontenmodell haengen die Transaktionen eines Absenders
 * aneinander. Nonce 5 kann nicht vor Nonce 4 in einen Block, egal wie viel
 * sie zahlt. Eine reine Gebuehrensortierung waere hier schlicht falsch.
 */
export function projiziere(
  state: State, mempool: Transfer[], hoehe: number,
  bloecke = VORSCHAU_BLOECKE,
  limit = MAX_TXS_PER_BLOCK - 1,
): Map<string, number> {
  const plaetze = new Map<string, number>();
  let rest = [...mempool];
  let zustand = cloneState(state);

  for (let b = 1; b <= bloecke && rest.length > 0; b++) {
    const { included } = selectTransactions(zustand, rest, hoehe + b - 1, limit);
    if (included.length === 0) break;

    const drin = new Set<string>();
    for (const t of included) {
      const id = toHex(txid(t));
      plaetze.set(id, b);
      drin.add(id);

      // Zustand fortschreiben, damit der naechste Block auf dem richtigen
      // Guthaben und der richtigen Nonce aufsetzt.
      const von = getAccount(zustand, t.from);
      zustand.set(toHex(t.from), {
        balance: von.balance - t.amount - t.fee, nonce: von.nonce + 1n,
      });
      const an = getAccount(zustand, t.to);
      zustand.set(toHex(t.to), { ...an, balance: an.balance + t.amount });
    }
    rest = rest.filter(t => !drin.has(toHex(txid(t))));
  }
  return plaetze;
}

/**
 * Die Marktlage aus dem tatsaechlichen Mempool.
 *
 * Ohne Andrang sind alle drei Stufen die Mindestgebuehr -- und das soll die
 * Anzeige auch sagen, statt drei erfundene Preise zu zeigen.
 */
export function marktlage(
  state: State, mempool: Transfer[], hoehe: number,
  limit = MAX_TXS_PER_BLOCK - 1,
): Marktlage {
  const plaetze = projiziere(state, mempool, hoehe, VORSCHAU_BLOECKE, limit);

  const jeBlock = new Map<number, bigint[]>();
  for (const t of mempool) {
    const b = plaetze.get(toHex(txid(t)));
    if (b === undefined) continue;
    const l = jeBlock.get(b) ?? [];
    l.push(t.fee);
    jeBlock.set(b, l);
  }

  const bloecke = [...jeBlock.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([block, fees]) => ({
      block, anzahl: fees.length,
      minFee: fees.reduce((m, f) => (f < m ? f : m), fees[0]),
    }));

  const ersterBlock = bloecke.find(b => b.block === 1);
  const blockVoll = (ersterBlock?.anzahl ?? 0) >= limit;
  const kappung = blockVoll ? ersterBlock!.minFee : null;
  const andrang = mempool.length > limit || blockVoll;

  if (!andrang) {
    /*
      Kein Andrang: Die Mindestgebuehr genuegt fuer den naechsten Block.
      Drei verschiedene Preise anzubieten, waere eine Erfindung -- der
      Nutzer wuerde mehr zahlen, ohne irgendetwas dafuer zu bekommen.
    */
    const s: Stufe = { fee: MIN_FEE, block: 1 };
    return {
      wartend: mempool.length, plaetzeJeBlock: limit, kappung: null,
      andrang: false, langsam: s, normal: s, schnell: s, bloecke,
    };
  }

  // Mit Andrang: Preise aus den tatsaechlichen Grenzen ablesen.
  const grenze = (block: number): bigint => {
    const b = bloecke.find(x => x.block === block);
    return b ? b.minFee : MIN_FEE;
  };
  // Ein Schritt ueber die Kappung -- sonst landet man gleichauf mit der
  // schwaechsten Transaktion und haengt vom Zufall der Reihenfolge ab.
  const schritt = MIN_FEE / 10n > 0n ? MIN_FEE / 10n : 1n;

  return {
    wartend: mempool.length,
    plaetzeJeBlock: limit,
    kappung,
    andrang: true,
    schnell: { fee: (kappung ?? MIN_FEE) + schritt, block: 1 },
    normal: { fee: grenze(2), block: 2 },
    langsam: { fee: MIN_FEE, block: bloecke.length > 0 ? bloecke[bloecke.length - 1].block : 1 },
    bloecke,
  };
}

/**
 * Wo landet eine Gebuehr in der Warteschlange?
 *
 * Fuer die Anzeige "Platz 1.847 von 3.400". Gezaehlt wird, wie viele
 * wartende Transaktionen mindestens so viel zahlen.
 *
 * VORBEHALT, der mitgesagt gehoert: Die Zahl gilt unter der Annahme, dass
 * nichts Neues dazukommt. Kommt gleich jemand mit hoeherer Gebuehr, rutscht
 * man nach hinten. Auch Bitcoin-Explorer koennen das nicht garantieren.
 */
export function position(mempool: Transfer[], fee: bigint): { rang: number; von: number } {
  let besser = 0;
  for (const t of mempool) if (t.fee > fee) besser++;
  return { rang: besser + 1, von: mempool.length + 1 };
}

/**
 * Haengt eine fruehere Transaktion desselben Absenders fest?
 *
 * Im Kontenmodell haengen die Transaktionen eines Absenders an ihrer Nonce.
 * Steckt Nonce 4, steckt Nonce 5 mit -- egal, was sie zahlt. Wer das nicht
 * weiss, zahlt eine hohe Gebuehr und wundert sich, dass nichts passiert.
 */
export function blockiertDurch(
  state: State, mempool: Transfer[], absender: Uint8Array, nonce: bigint,
): { txid: string; nonce: bigint; fee: bigint }[] {
  const key = toHex(absender);
  const naechste = getAccount(state, absender).nonce;
  return mempool
    .filter(t => toHex(t.from) === key && t.nonce >= naechste && t.nonce < nonce)
    .sort((a, b) => (a.nonce < b.nonce ? -1 : 1))
    .map(t => ({ txid: toHex(txid(t)), nonce: t.nonce, fee: t.fee }));
}
