/**
 * Watcher: Was ist passiert, und wer will es wissen?
 *
 * Reine Entscheidungslogik ohne Netz und Datenbank, damit sie sich testen
 * laesst. Der Aufrufer (scripts/push-watcher.ts) holt Bloecke und Mempool
 * vom Knoten, die Geraeteliste aus Supabase, und schickt, was hier
 * herauskommt, ueber FCM.
 *
 * Drei Ereignisse je Adresse:
 *
 *   in     eine Zahlung an mich wartet im Mempool      "25,0000 YSR unterwegs"
 *   ok     eine Zahlung an mich steht im Block         "25,0000 YSR erhalten"
 *   block  ich habe einen Block gefunden / Pool-Anteil "Block #2188 · +875 YSR"
 *
 * Ausgehende Zahlungen werden nicht gemeldet: Wer sendet, weiss es.
 */
import type { Nachricht } from './fcm.ts';

export interface Geraet { token: string; address: string; sprache?: string }

export interface BlockTx {
  txid: string;
  type: 'coinbase' | 'transfer';
  from: string | null;
  to: string | null;
  amount: string;
  memo?: string | null;
  recipients: { address: string; amount: string }[] | null;
}

export interface BlockAnsicht { height: number; txs: BlockTx[] }

export interface Wartend { txid: string; kind: 'in' | 'out'; from: string; amount: string }

export interface Ereignis {
  token: string;
  /** Schluessel fuer push_versendet -- einmal je Geraet. */
  schluessel: string;
  nachricht: Nachricht;
}

const ysr = (roh: string, dec = 8) =>
  (Number(BigInt(roh)) / 10 ** dec).toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const kurz = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`;

/** Ereignisse aus einem fertigen Block. */
export function ausBlock(block: BlockAnsicht, geraete: Geraet[], symbol = 'YSR'): Ereignis[] {
  if (!geraete.length) return [];
  const nachAdresse = new Map<string, Geraet[]>();
  for (const g of geraete) {
    const l = nachAdresse.get(g.address) ?? [];
    l.push(g); nachAdresse.set(g.address, l);
  }
  const aus: Ereignis[] = [];
  for (const tx of block.txs) {
    if (tx.type === 'coinbase') {
      const empf = tx.recipients ?? (tx.to ? [{ address: tx.to, amount: tx.amount }] : []);
      const pool = empf.length > 1;
      for (const e of empf) {
        for (const g of nachAdresse.get(e.address) ?? []) {
          aus.push({
            token: g.token, schluessel: `block:${block.height}`,
            nachricht: {
              titel: pool ? `Pool-Anteil aus Block #${block.height.toLocaleString('de-DE')}`
                          : `Block #${block.height.toLocaleString('de-DE')} gefunden`,
              text: `+${ysr(e.amount)} ${symbol} sind auf deiner Adresse.`,
              daten: { art: 'block', height: String(block.height) }, kanal: 'wallet',
            },
          });
        }
      }
      continue;
    }
    if (!tx.to) continue;
    for (const g of nachAdresse.get(tx.to) ?? []) {
      aus.push({
        token: g.token, schluessel: `ok:${tx.txid}`,
        nachricht: {
          titel: `${ysr(tx.amount)} ${symbol} erhalten`,
          text: `Von ${kurz(tx.from ?? '')} · bestätigt in Block #${block.height.toLocaleString('de-DE')}`,
          daten: { art: 'ok', txid: tx.txid, height: String(block.height) }, kanal: 'wallet',
        },
      });
    }
  }
  return aus;
}

/** Ereignisse aus den wartenden Zahlungen einer Adresse. */
export function ausMempool(address: string, wartend: Wartend[], geraete: Geraet[], symbol = 'YSR'): Ereignis[] {
  const meine = geraete.filter(g => g.address === address);
  if (!meine.length) return [];
  const aus: Ereignis[] = [];
  for (const w of wartend) {
    if (w.kind !== 'in') continue;
    for (const g of meine) {
      aus.push({
        token: g.token, schluessel: `in:${w.txid}`,
        nachricht: {
          titel: `${ysr(w.amount)} ${symbol} unterwegs`,
          text: `Von ${kurz(w.from)} · kommt mit dem nächsten Block`,
          daten: { art: 'in', txid: w.txid }, kanal: 'wallet',
        },
      });
    }
  }
  return aus;
}

/** Eine Neuigkeit an alle Geraete. */
export function ausNews(news: { id: number; titel: string; text: string; link?: string | null },
                        geraete: Geraet[]): Ereignis[] {
  const gesehen = new Set<string>();
  const aus: Ereignis[] = [];
  for (const g of geraete) {
    if (gesehen.has(g.token)) continue;
    gesehen.add(g.token);
    aus.push({
      token: g.token, schluessel: `news:${news.id}`,
      nachricht: {
        titel: news.titel, text: news.text.length > 160 ? news.text.slice(0, 157) + '…' : news.text,
        daten: { art: 'news', id: String(news.id), ...(news.link ? { link: news.link } : {}) },
        kanal: 'news',
      },
    });
  }
  return aus;
}
