/**
 * Kompakte Bloecke (Volllast-Konzept M2).
 *
 * Ein voller Block mit 5.000 Ueberweisungen ist rund 890 KB gross. Bisher
 * holte ihn sich jeder Peer ganz -- bei 37 Peers 33 MB je Block, obwohl
 * jeder Peer fast alle dieser Ueberweisungen schon in seiner Warteschlange
 * hat. Ein kompakter Block traegt nur Header, Coinbase und je Ueberweisung
 * die ersten KURZ_BYTES Bytes ihrer txid (rund 40 KB). Der Empfaenger setzt
 * den Block aus seiner Warteschlange zusammen und fragt nur nach, was ihm
 * fehlt.
 *
 * Nur zwischen Knoten, deren Kennung KOMPAKT_FAEHIG traegt. Aeltere Knoten
 * bekommen wie bisher eine inv-Nachricht und holen den vollen Block -- fuer
 * sie aendert sich nichts.
 *
 * WARUM DIE KURZ-ID EIN TXID-PRAEFIX IST UND KEIN GESALZENER HASH: Ein
 * gesalzener Hash muesste der Empfaenger fuer jede wartende Ueberweisung neu
 * rechnen -- gemessen 488 ms je Block bei 190.000 wartenden. Das Praefix
 * kennt er schon. Der Preis: Wer zwei Ueberweisungen mit gleichem Praefix
 * baut (rund 2^32 Versuche bei 8 Byte), stoert die Zuordnung. Mehr nicht:
 * Bevor ein zusammengesetzter Block angenommen wird, muss seine
 * Merkle-Wurzel zum Header passen, sonst wird der volle Block geholt -- also
 * genau das bisherige Verhalten. Ein falscher Block kann so nie durchgehen.
 */
import { Writer, Reader, toHex } from '../../core/codec.ts';
import {
  serializeHeader, deserializeHeader, serializeBlock, txMerkleRoot, HEADER_SIZE, type Block, type BlockHeader,
} from '../../core/block.ts';
import { serializeTx, deserializeTx, txid, TX_COINBASE, type Tx, type Spend } from '../../core/tx.ts';
import { MAX_TXS_PER_BLOCK_V6 } from '../../core/params.ts';

/** Kennungszusatz eines Knotens, der kompakte Bloecke versteht. */
export const KOMPAKT_FAEHIG = '+cmpct';

/** Laenge der Kurz-ID: so viele Bytes vom Anfang der txid. */
export const KURZ_BYTES = 8;

export interface KompakterBlock {
  header: BlockHeader;
  coinbase: Tx;
  /** Je Ueberweisung nach der Coinbase: Kurz-ID als Hex. */
  kurz: string[];
}

const kurzVon = (id: Uint8Array) => toHex(id.subarray(0, KURZ_BYTES));
/** Kurz-ID aus einer txid in Hex. */
export const kurzAusHex = (idHex: string) => idHex.slice(0, KURZ_BYTES * 2);

export function encodeKompakt(b: Block): Uint8Array {
  const cb = serializeTx(b.txs[0]);
  const w = new Writer().bytes(serializeHeader(b.header), HEADER_SIZE).u32(cb.length).bytes(cb).u32(b.txs.length - 1);
  for (let i = 1; i < b.txs.length; i++) w.bytes(txid(b.txs[i]).subarray(0, KURZ_BYTES), KURZ_BYTES);
  return w.finish();
}

export function decodeKompakt(payload: Uint8Array): KompakterBlock {
  const header = deserializeHeader(payload.slice(0, HEADER_SIZE));
  const r = new Reader(payload.slice(HEADER_SIZE));
  const coinbase = deserializeTx(r.bytes(r.u32()));
  if (coinbase.type !== TX_COINBASE) throw new Error('erste Transaktion ist keine Coinbase');
  const n = r.u32();
  if (n > MAX_TXS_PER_BLOCK_V6 - 1) throw new Error('zu viele Transaktionen');
  const kurz: string[] = [];
  for (let i = 0; i < n; i++) kurz.push(toHex(r.bytes(KURZ_BYTES)));
  if (r.rest !== 0) throw new Error('Restbytes');
  return { header, coinbase, kurz };
}

/** getblocktxn: Block-Hash und die Stellen (1-basiert, Coinbase ist 0), die fehlen. */
export function encodeFehlende(hash: Uint8Array, stellen: number[]): Uint8Array {
  const w = new Writer().bytes(hash, 32).u32(stellen.length);
  for (const s of stellen) w.u32(s);
  return w.finish();
}
export function decodeFehlende(payload: Uint8Array): { hash: Uint8Array; stellen: number[] } {
  const r = new Reader(payload);
  const hash = r.bytes(32);
  const n = r.u32();
  if (n > MAX_TXS_PER_BLOCK_V6) throw new Error('zu viele Stellen');
  const stellen: number[] = [];
  for (let i = 0; i < n; i++) stellen.push(r.u32());
  if (r.rest !== 0) throw new Error('Restbytes');
  return { hash, stellen };
}

/** blocktxn: Block-Hash und die angefragten Transaktionen in derselben Reihenfolge. */
export function encodeNachgereicht(hash: Uint8Array, txs: Tx[]): Uint8Array {
  const w = new Writer().bytes(hash, 32).u32(txs.length);
  for (const t of txs) { const roh = serializeTx(t); w.u32(roh.length).bytes(roh); }
  return w.finish();
}
export function decodeNachgereicht(payload: Uint8Array): { hash: Uint8Array; txs: Tx[] } {
  const r = new Reader(payload);
  const hash = r.bytes(32);
  const n = r.u32();
  if (n > MAX_TXS_PER_BLOCK_V6) throw new Error('zu viele Transaktionen');
  const txs: Tx[] = [];
  for (let i = 0; i < n; i++) txs.push(deserializeTx(r.bytes(r.u32())));
  if (r.rest !== 0) throw new Error('Restbytes');
  return { hash, txs };
}

/**
 * Aus der Warteschlange zuordnen. `wartend` liefert die wartenden
 * Ueberweisungen mit ihrer txid (Hex). Mehrdeutige Kurz-IDs (zwei wartende
 * mit gleichem Praefix) gelten als fehlend und werden nachgefragt.
 */
export function ordneZu(k: KompakterBlock, wartend: Iterable<{ id: string; tx: Spend }>):
  { txs: (Tx | null)[]; fehlt: number[] } {
  const gebraucht = new Set(k.kurz);
  const gefunden = new Map<string, Spend | null>();
  for (const { id, tx } of wartend) {
    const s = kurzAusHex(id);
    if (!gebraucht.has(s)) continue;
    gefunden.set(s, gefunden.has(s) ? null : tx);   // zweimal: mehrdeutig
  }
  const txs: (Tx | null)[] = [k.coinbase];
  const fehlt: number[] = [];
  k.kurz.forEach((s, i) => {
    const t = gefunden.get(s) ?? null;
    txs.push(t);
    if (!t) fehlt.push(i + 1);
  });
  return { txs, fehlt };
}

/**
 * Den Block zusammensetzen -- nur wenn die Merkle-Wurzel stimmt. null heisst:
 * Zuordnung falsch (Praefix-Kollision), den vollen Block holen.
 */
export function setzeZusammen(header: BlockHeader, txs: (Tx | null)[]): { block: Block; body: Uint8Array } | null {
  if (txs.some(t => t === null)) return null;
  const voll = txs as Tx[];
  if (voll.length !== header.txCount) return null;
  if (toHex(txMerkleRoot(voll)) !== toHex(header.merkleRoot)) return null;
  const block = { header, txs: voll };
  return { block, body: serializeBlock(block) };
}

export { kurzVon };
