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
 * WARUM JE BYTE
 *
 * Eine Ueberweisung ist 168 bis 206 Byte gross, eine Sammelzahlung bis
 * etwa 40.000 Byte -- belegt aber nur EINEN der 4.999 Plaetze eines Blocks.
 * Knapp sind zwei Dinge: Plaetze (bei Ueberweisungen) und Bytes (bei
 * Sammelzahlungen, und im Speicher des Mempools). Die Gebuehr je Byte
 * bewertet beides fair: Fuer zwei Ueberweisungen ist sie praktisch
 * dasselbe wie die absolute Gebuehr, und eine grosse Sammelzahlung zahlt
 * fuer den Raum, den sie belegt.
 *
 * Danach waehlt der Blockbau aus (builder.ts), danach verdraengt der
 * Mempool (TxPool.ts), und danach rechnet diese Vorschau. Alle drei
 * entscheiden gleich -- sonst stimmte die Vorhersage nicht.
 *
 * Die UNTERGRENZE ist seit Konsensfassung 3 (params.ts, FEE_V3_HEIGHT) ein
 * Satz je Byte -- Konsens 1 Einheit, Weiterleitung 10 Einheiten je Byte,
 * bei Andrang die gestiegene Untergrenze des Knotens. marktlage() nimmt
 * sie als `boden` entgegen, und keine Stufe faellt darunter.
 * ---------------------------------------------------------------------
 */
import { serializeTx, txid, senderRaw, type Spend } from './tx.ts';
import { toHex } from './codec.ts';
import { getAccount, type State } from './state.ts';
import { Auswahl, gebuehrJeByte, spendTxid, type AuswahlOptionen } from './builder.ts';
import { MAINNET, type ConsensusParams } from './networks.ts';
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
export const vbytes = (t: Spend): number => serializeTx(t).length;

export interface PlatzImStau {
  txid: string;
  fee: bigint;
  /** 1 = naechster Block. null = passt in den naechsten Bloecken nicht. */
  block: number | null;
  /** Platz in der Warteschlange, 1-basiert. */
  rang: number;
}

export interface Stufe {
  /** Was zu zahlen waere (fuer die Basisgroesse). */
  fee: bigint;
  /** Derselbe Preis je Byte -- fuer jede andere Groesse. */
  jeByte: number;
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
  bloecke: { block: number; anzahl: number; minFee: bigint; minJeByte: number }[];
  /** Die Vorschau, aus der das alles stammt. */
  vorschau: Vorschau;
}

/**
 * Den Mempool vorausrechnen -- Block fuer Block.
 *
 * Benutzt dieselbe Auswahl wie der echte Blockbau (builder.ts, Auswahl).
 * Das ist der Punkt: Eine nachgebaute Sortierung koennte anders entscheiden
 * als der Blockbau, und die Vorhersage waere systematisch falsch.
 *
 * Dabei wird die NONCE-REIHENFOLGE beachtet, weil die Auswahl sie
 * beachtet: Im Kontenmodell haengen die Transaktionen eines Absenders
 * aneinander. Nonce 5 kann nicht vor Nonce 4 in einen Block, egal wie viel
 * sie zahlt. Eine reine Gebuehrensortierung waere hier schlicht falsch.
 *
 * Eine einzige Auswahl laeuft ueber alle Bloecke weiter -- der Zustand
 * nach Block 1 ist der Ausgangspunkt fuer Block 2. Das kostet so viel wie
 * ein Blockbau, nicht wie acht.
 */
export interface Vorschau {
  /** txid -> Block (1 = naechster). Was fehlt, passt in die Vorschau nicht. */
  plaetze: Map<string, number>;
  /** Je Block: Anzahl, kleinste Gebuehr, kleinste Gebuehr je Byte. */
  bloecke: { block: number; anzahl: number; minFee: bigint; minJeByte: number }[];
}

export function vorschau(
  state: State, mempool: Spend[], hoehe: number,
  bloecke = VORSCHAU_BLOECKE,
  limit = MAX_TXS_PER_BLOCK - 1,
  params: ConsensusParams = MAINNET,
  opt: AuswahlOptionen = {},
): Vorschau {
  const plaetze = new Map<string, number>();
  const liste: Vorschau['bloecke'] = [];
  const a = new Auswahl(state, mempool, hoehe, params, opt);
  for (let b = 1; b <= bloecke && !a.leer(); b++) {
    const { included } = a.naechsterBlock(limit, hoehe + b - 1);
    if (included.length === 0) break;
    let minFee = included[0].fee, minJeByte = Infinity;
    for (const t of included) {
      plaetze.set(spendTxid(t), b);
      if (t.fee < minFee) minFee = t.fee;
      const r = gebuehrJeByte(t);
      if (r < minJeByte) minJeByte = r;
    }
    liste.push({ block: b, anzahl: included.length, minFee, minJeByte });
  }
  return { plaetze, bloecke: liste };
}

/** Nur die Zuordnung txid -> Block (fruehere Schnittstelle). */
export function projiziere(
  state: State, mempool: Spend[], hoehe: number,
  bloecke = VORSCHAU_BLOECKE,
  limit = MAX_TXS_PER_BLOCK - 1,
): Map<string, number> {
  return vorschau(state, mempool, hoehe, bloecke, limit).plaetze;
}

export interface MarktOptionen extends AuswahlOptionen {
  params?: ConsensusParams;
  /** Groesse, fuer die die Stufen als Betrag gelten (Ueberweisung ohne Notiz). */
  basisBytes?: number;
  /** Wie weit vorausgerechnet wird. */
  bloecke?: number;
  /** Fertige Vorschau, falls schon gerechnet. */
  vorschau?: Vorschau;
}

/**
 * Die Marktlage aus dem tatsaechlichen Mempool.
 *
 * Ohne Andrang sind alle drei Stufen die Mindestgebuehr -- und das soll die
 * Anzeige auch sagen, statt drei erfundene Preise zu zeigen.
 *
 * Mit Andrang gelten die Stufen je Byte: Wer eine Notiz anhaengt, zahlt fuer
 * denselben Platz entsprechend mehr. `fee` ist der Betrag fuer `basisBytes`,
 * `jeByte` der Satz fuer jede andere Groesse.
 */
export function marktlage(
  state: State, mempool: Spend[], hoehe: number,
  limit = MAX_TXS_PER_BLOCK - 1,
  /** Untergrenze, unter die keine Stufe faellt (Untergrenze des Knotens fuer basisBytes). */
  boden: bigint = MIN_FEE,
  opt: MarktOptionen = {},
): Marktlage {
  const basis = opt.basisBytes ?? 168;
  const v = opt.vorschau ?? vorschau(state, mempool, hoehe, opt.bloecke ?? VORSCHAU_BLOECKE, limit,
    opt.params ?? MAINNET, opt);
  const bloecke = v.bloecke;
  const bodenJeByte = Number(boden) / basis;

  const ersterBlock = bloecke.find(b => b.block === 1);
  const blockVoll = (ersterBlock?.anzahl ?? 0) >= limit;
  const kappung = blockVoll ? ersterBlock!.minFee : null;
  const andrang = mempool.length > limit || blockVoll;

  const stufe = (jeByte: number, block: number): Stufe => {
    const r = jeByte > bodenJeByte ? jeByte : bodenJeByte;
    const fee = BigInt(Math.ceil(r * basis));
    return { fee: fee > boden ? fee : boden, block, jeByte: r };
  };

  if (!andrang) {
    /*
      Kein Andrang: Die Mindestgebuehr genuegt fuer den naechsten Block.
      Drei verschiedene Preise anzubieten, waere eine Erfindung -- der
      Nutzer wuerde mehr zahlen, ohne irgendetwas dafuer zu bekommen.
    */
    const s = stufe(bodenJeByte, 1);
    return {
      wartend: mempool.length, plaetzeJeBlock: limit, kappung: null,
      andrang: false, langsam: s, normal: s, schnell: s, bloecke, vorschau: v,
    };
  }

  // Mit Andrang: Preise aus den tatsaechlichen Grenzen ablesen. Ein Schritt
  // ueber die Kappung -- sonst landet man gleichauf mit der schwaechsten
  // Transaktion und haengt vom Zufall der Reihenfolge ab.
  const schritt = Math.max(bodenJeByte / 10, 1 / basis);
  const grenze = (block: number): number => bloecke.find(x => x.block === block)?.minJeByte ?? bodenJeByte;
  const kappungJeByte = blockVoll ? ersterBlock!.minJeByte : bodenJeByte;

  return {
    wartend: mempool.length,
    plaetzeJeBlock: limit,
    kappung,
    andrang: true,
    schnell: stufe(kappungJeByte + schritt, 1),
    normal: stufe(grenze(2), 2),
    langsam: stufe(bodenJeByte, bloecke.length > 0 ? bloecke[bloecke.length - 1].block : 1),
    bloecke,
    vorschau: v,
  };
}

/**
 * In welchem Block landet eine Gebuehr je Byte voraussichtlich? Der erste
 * Block, dessen schwaechste Transaktion nicht mehr zahlt -- oder null, wenn
 * die Vorschau dafuer nicht reicht.
 */
export function blockFuerSatz(v: Vorschau, jeByte: number, limit: number,
                              bloeckeMax = VORSCHAU_BLOECKE): number | null {
  for (const b of v.bloecke) {
    if (b.anzahl < limit || jeByte > b.minJeByte) return b.block;
  }
  // Alle vorausgerechneten Bloecke sind voll und zahlen mehr. Endete die
  // Vorschau, weil nichts mehr wartet, kommt der Satz danach dran; endete
  // sie an ihrer Reichweite, ist der Block unbekannt.
  if (v.bloecke.length < bloeckeMax) return v.bloecke.length + 1;
  return null;
}

/**
 * Wo landet eine Gebuehr in der Warteschlange?
 *
 * Fuer die Anzeige "Platz 1.847 von 3.400". Gezaehlt wird, wie viele
 * wartende Transaktionen mindestens so viel zahlen.
 *
 * VORBEHALT, der mitgesagt gehoert: Die Zahl gilt unter der Annahme, dass
 * nichts Neues dazukommt. Kommt gleich jemand mit hoeherer Gebuehr, rutscht
 * man nach hinten. Das kann keine Vorschau garantieren.
 */
export function position(mempool: Spend[], fee: bigint): { rang: number; von: number } {
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
  state: State, mempool: Spend[], absender: Uint8Array, nonce: bigint,
): { txid: string; nonce: bigint; fee: bigint }[] {
  const key = toHex(absender);
  const naechste = getAccount(state, absender).nonce;
  return mempool
    .filter(t => toHex(senderRaw(t)) === key && t.nonce >= naechste && t.nonce < nonce)
    .sort((a, b) => (a.nonce < b.nonce ? -1 : 1))
    .map(t => ({ txid: toHex(txid(t)), nonce: t.nonce, fee: t.fee }));
}
