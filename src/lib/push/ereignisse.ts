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

const kurz = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`;

/*
  Texte je Sprache des Geraets (push_geraete.sprache). Die App meldet ihre
  Oberflaechensprache; unbekannt heisst Englisch -- dieselbe Vorgabe wie in
  der App. Zahlen im Format der Sprache: "25,0000" gegen "25.0000".
*/
type Texte = {
  locale: string;
  poolAnteil: (h: string) => string;
  blockGefunden: (h: string) => string;
  aufAdresse: (b: string, sym: string) => string;
  erhalten: (b: string, sym: string) => string;
  vonBestaetigt: (von: string, h: string) => string;
  unterwegs: (b: string, sym: string) => string;
  vonNaechster: (von: string) => string;
};
const TEXTE: Record<'de' | 'en' | 'ru' | 'es' | 'tr' | 'pt', Texte> = {
  de: {
    locale: 'de-DE',
    poolAnteil: h => `Pool-Anteil aus Block #${h}`,
    blockGefunden: h => `Block #${h} gefunden`,
    aufAdresse: (b, sym) => `+${b} ${sym} sind auf deiner Adresse.`,
    erhalten: (b, sym) => `${b} ${sym} erhalten`,
    vonBestaetigt: (von, h) => `Von ${von} · bestätigt in Block #${h}`,
    unterwegs: (b, sym) => `${b} ${sym} unterwegs`,
    vonNaechster: von => `Von ${von} · kommt mit dem nächsten Block`,
  },
  en: {
    locale: 'en-US',
    poolAnteil: h => `Pool share from block #${h}`,
    blockGefunden: h => `Block #${h} found`,
    aufAdresse: (b, sym) => `+${b} ${sym} are on your address.`,
    erhalten: (b, sym) => `${b} ${sym} received`,
    vonBestaetigt: (von, h) => `From ${von} · confirmed in block #${h}`,
    unterwegs: (b, sym) => `${b} ${sym} on the way`,
    vonNaechster: von => `From ${von} · arrives with the next block`,
  },
  ru: {
    locale: 'ru-RU',
    poolAnteil: h => `Доля пула из блока #${h}`,
    blockGefunden: h => `Найден блок #${h}`,
    aufAdresse: (b, sym) => `+${b} ${sym} на твоём адресе.`,
    erhalten: (b, sym) => `Получено ${b} ${sym}`,
    vonBestaetigt: (von, h) => `От ${von} · подтверждено в блоке #${h}`,
    unterwegs: (b, sym) => `${b} ${sym} в пути`,
    vonNaechster: von => `От ${von} · придёт со следующим блоком`,
  },
  es: {
    locale: 'es-ES',
    poolAnteil: h => `Parte del pool del bloque #${h}`,
    blockGefunden: h => `Bloque #${h} encontrado`,
    aufAdresse: (b, sym) => `+${b} ${sym} están en tu dirección.`,
    erhalten: (b, sym) => `${b} ${sym} recibidos`,
    vonBestaetigt: (von, h) => `De ${von} · confirmado en el bloque #${h}`,
    unterwegs: (b, sym) => `${b} ${sym} en camino`,
    vonNaechster: von => `De ${von} · llega con el próximo bloque`,
  },
  tr: {
    locale: 'tr-TR',
    poolAnteil: h => `#${h} numaralı bloktan havuz payı`,
    blockGefunden: h => `#${h} numaralı blok bulundu`,
    aufAdresse: (b, sym) => `+${b} ${sym} adresinde.`,
    erhalten: (b, sym) => `${b} ${sym} alındı`,
    vonBestaetigt: (von, h) => `Gönderen ${von} · #${h} numaralı blokta onaylandı`,
    unterwegs: (b, sym) => `${b} ${sym} yolda`,
    vonNaechster: von => `Gönderen ${von} · bir sonraki blokla gelecek`,
  },
  pt: {
    locale: 'pt-BR',
    poolAnteil: h => `Parte do pool do bloco #${h}`,
    blockGefunden: h => `Bloco #${h} encontrado`,
    aufAdresse: (b, sym) => `+${b} ${sym} estão no seu endereço.`,
    erhalten: (b, sym) => `${b} ${sym} recebidos`,
    vonBestaetigt: (von, h) => `De ${von} · confirmado no bloco #${h}`,
    unterwegs: (b, sym) => `${b} ${sym} a caminho`,
    vonNaechster: von => `De ${von} · chega com o próximo bloco`,
  },
};
export function texteFuer(sprache?: string): Texte {
  const k = (sprache ?? '').toLowerCase().slice(0, 2);
  return k in TEXTE ? TEXTE[k as keyof typeof TEXTE] : TEXTE.en;
}
const ysr = (roh: string, locale: string, dec = 8) =>
  (Number(BigInt(roh)) / 10 ** dec).toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const hoehe = (h: number, locale: string) => h.toLocaleString(locale);

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
          const x = texteFuer(g.sprache);
          aus.push({
            token: g.token, schluessel: `block:${block.height}`,
            nachricht: {
              titel: pool ? x.poolAnteil(hoehe(block.height, x.locale))
                          : x.blockGefunden(hoehe(block.height, x.locale)),
              text: x.aufAdresse(ysr(e.amount, x.locale), symbol),
              daten: { art: 'block', height: String(block.height) }, kanal: 'wallet',
            },
          });
        }
      }
      continue;
    }
    if (!tx.to) continue;
    for (const g of nachAdresse.get(tx.to) ?? []) {
      const x = texteFuer(g.sprache);
      aus.push({
        token: g.token, schluessel: `ok:${tx.txid}`,
        nachricht: {
          titel: x.erhalten(ysr(tx.amount, x.locale), symbol),
          text: x.vonBestaetigt(kurz(tx.from ?? ''), hoehe(block.height, x.locale)),
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
      const x = texteFuer(g.sprache);
      aus.push({
        token: g.token, schluessel: `in:${w.txid}`,
        nachricht: {
          titel: x.unterwegs(ysr(w.amount, x.locale), symbol),
          text: x.vonNaechster(kurz(w.from)),
          daten: { art: 'in', txid: w.txid }, kanal: 'wallet',
        },
      });
    }
  }
  return aus;
}

/** Eine Neuigkeit an alle Geraete. */
export function ausNews(news: { id: number; titel: string; text: string; link?: string | null;
                                titel_en?: string | null; text_en?: string | null },
                        geraete: Geraet[]): Ereignis[] {
  const gesehen = new Set<string>();
  const aus: Ereignis[] = [];
  for (const g of geraete) {
    if (gesehen.has(g.token)) continue;
    gesehen.add(g.token);
    // Englische Fassung, wenn das Geraet englisch ist und es sie gibt.
    const en = texteFuer(g.sprache) !== TEXTE.de;
    const titel = (en && news.titel_en) || news.titel;
    const text = (en && news.text_en) || news.text;
    aus.push({
      token: g.token, schluessel: `news:${news.id}`,
      nachricht: {
        titel, text: text.length > 160 ? text.slice(0, 157) + '…' : text,
        daten: { art: 'news', id: String(news.id), ...(news.link ? { link: news.link } : {}) },
        kanal: 'news',
      },
    });
  }
  return aus;
}
