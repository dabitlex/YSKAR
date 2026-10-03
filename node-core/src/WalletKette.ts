/*
 * Was die Kette ueber eine Adresse sagt -- fuer die Wallet-Ansicht.
 *
 * Die Leseschnittstelle des Knotens (ReadApi.account) zeigt 40 Eintraege und
 * zaehlt jede Pool-Auszahlung einzeln. Wer im Pool mint, bekommt mit fast
 * jedem Block einen Anteil -- nach wenigen Stunden bestuende der Verlauf nur
 * noch daraus, und die eigenen Ueberweisungen waeren hinausgeschoben. Hier
 * werden Mining-Einnahmen deshalb je TAG zusammengefasst und Ueberweisungen
 * einzeln gefuehrt.
 *
 * Es gibt keinen Index nach Adresse; gelesen wird die Kette rueckwaerts bis
 * zur Tiefe VERLAUF_TIEFE. Das Ergebnis haelt der Aufrufer fest, bis ein
 * neuer Block kommt.
 */
import { deserializeBlock } from '../../src/lib/core/block.ts';
import { TX_COINBASE, txid } from '../../src/lib/core/tx.ts';
import { encodeAddress } from '../../src/lib/core/address.ts';
import { toHex } from '../../src/lib/core/codec.ts';
import { notizAusHex } from '../../src/lib/wallet/notiz.ts';
import { VERLAUF_TIEFE } from '../../src/lib/node/fullnode/ReadApi.ts';
import { finderName } from '../../src/lib/chain/finderName.ts';
import type { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';

/** Mehr einzelne Ueberweisungen zeigt die Ansicht nicht. */
export const UEBERWEISUNGEN_MAX = 200;

export interface Ueberweisung {
  txid: string;
  hoehe: number;
  zeit: number;            // Sekunden seit 1970
  art: 'ein' | 'aus';
  gegen: string;           // Adresse der Gegenseite
  betrag: string;
  gebuehr: string;
  notiz: string;
}

export interface MiningTag {
  /** Kalendertag in der Zeitzone dieses PCs, JJJJ-MM-TT. */
  tag: string;
  solo: number;
  pool: number;
  summe: string;
  letzteHoehe: number;
  letzteZeit: number;
}

/** Der juengste Block, der diese Adresse zusammen mit anderen ausgezahlt hat. */
export interface PoolAuszahlung {
  hoehe: number;
  zeit: number;
  betrag: string;
  /** Name im Block -- der Pool, der ihn gefunden hat; null, wenn keiner dasteht. */
  name: string | null;
}

export interface KettenVerlauf {
  ueberweisungen: Ueberweisung[];
  mining: MiningTag[];
  letztePool: PoolAuszahlung | null;
  /** An diese Adressen ging schon einmal etwas -- fuer die Warnung "neue Adresse". */
  gesendetAn: string[];
  durchsucht: number;
}

/** Kalendertag in der Zeitzone des PCs. */
export function tagVon(sekunden: number): string {
  const d = new Date(sekunden * 1000);
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

export function leseVerlauf(store: ChainStore, kopf: number, adresseHex: string,
                            tiefe: number = VERLAUF_TIEFE): KettenVerlauf {
  const ueberweisungen: Ueberweisung[] = [];
  const tage = new Map<string, { solo: number; pool: number; summe: bigint; letzteHoehe: number; letzteZeit: number }>();
  const gesendetAn = new Set<string>();
  let letztePool: PoolAuszahlung | null = null;
  const bis = Math.max(0, kopf - tiefe);
  let durchsucht = 0;

  for (let h = kopf; h >= bis; h--) {
    const b = store.mainAt(h);
    if (!b) continue;
    durchsucht++;
    const zeit = Number(b.blockTime);
    for (const t of deserializeBlock(b.body).txs) {
      if (t.type === TX_COINBASE) {
        const meiner = t.outputs.find(o => toHex(o.to) === adresseHex);
        if (!meiner) continue;
        const tag = tagVon(zeit);
        let e = tage.get(tag);
        if (!e) { e = { solo: 0, pool: 0, summe: 0n, letzteHoehe: h, letzteZeit: zeit }; tage.set(tag, e); }
        if (t.outputs.length === 1) e.solo++; else {
          e.pool++;
          // Rueckwaerts gelesen: Der erste Treffer ist der juengste.
          letztePool ??= { hoehe: h, zeit, betrag: meiner.amount.toString(), name: finderName(toHex(t.extra)) };
        }
        e.summe += meiner.amount;
        continue;
      }
      const ein = toHex(t.to) === adresseHex;
      const aus = toHex(t.from) === adresseHex;
      if (!ein && !aus) continue;
      if (aus) gesendetAn.add(encodeAddress(t.to));
      if (ueberweisungen.length >= UEBERWEISUNGEN_MAX) continue;
      ueberweisungen.push({
        txid: toHex(txid(t)), hoehe: h, zeit,
        art: aus ? 'aus' : 'ein',
        gegen: encodeAddress(aus ? t.to : t.from),
        betrag: t.amount.toString(), gebuehr: t.fee.toString(),
        notiz: notizAusHex(toHex(t.memo)),
      });
    }
  }

  return {
    ueberweisungen,
    mining: [...tage.entries()].map(([tag, e]) => ({
      tag, solo: e.solo, pool: e.pool, summe: e.summe.toString(),
      letzteHoehe: e.letzteHoehe, letzteZeit: e.letzteZeit,
    })),
    letztePool,
    gesendetAn: [...gesendetAn],
    durchsucht,
  };
}

/**
 * Wie viele Bloecke unter welchem Namen in der Kette stehen.
 *
 * Fuer die Pool-Liste: "Bloecke" eines Pools sind die Bloecke, die seinen
 * Namen tragen -- gezaehlt in der EIGENEN Kette, nicht vom Pool gemeldet.
 *
 * Die Kette waechst nur hinten. Gezaehlt wird deshalb einmal bis kurz vor
 * den Kopf und danach nur noch das Neue; die letzten FRISCH Bloecke koennen
 * sich noch aendern und werden jedes Mal neu gelesen.
 */
const FRISCH = 20;
/** So viele Bloecke je Durchgang -- der Knoten soll dabei nicht stocken. */
const JE_DURCHGANG = 400;

export class NamenZaehler {
  private fest = new Map<string, number>();
  /** Bis zu dieser Hoehe (einschliesslich) ist `fest` gezaehlt. */
  private bis = -1;
  private laeuft: Promise<void> | null = null;

  private static name(store: ChainStore, h: number): string | null {
    const b = store.mainAt(h);
    if (!b) return null;
    const cb = deserializeBlock(b.body).txs[0];
    return cb && cb.type === TX_COINBASE ? finderName(toHex(cb.extra)) : null;
  }

  /** Den festen Teil nachfuehren -- in Etappen, im Hintergrund. */
  private nachfuehren(store: ChainStore, kopf: () => number | null): Promise<void> {
    this.laeuft ??= (async () => {
      try {
        for (;;) {
          const k = kopf();
          if (k === null) return;
          const ziel = k - FRISCH;
          if (this.bis >= ziel) return;
          const ende = Math.min(ziel, this.bis + JE_DURCHGANG);
          for (let h = this.bis + 1; h <= ende; h++) {
            const n = NamenZaehler.name(store, h);
            if (n) this.fest.set(n, (this.fest.get(n) ?? 0) + 1);
          }
          this.bis = ende;
          await new Promise<void>(auf => setImmediate(auf));
        }
      } catch { /* Ablage geschlossen -- der naechste Start zaehlt neu */ }
      finally { this.laeuft = null; }
    })();
    return this.laeuft;
  }

  /**
   * Zahlen je Name. `null`, solange noch gezaehlt wird -- eine halbe Zahl
   * saehe aus wie eine ganze.
   */
  zahlen(store: ChainStore, kopf: () => number | null): Map<string, number> | null {
    const k = kopf();
    if (k === null) return null;
    if (this.bis < k - FRISCH) { void this.nachfuehren(store, kopf); return null; }
    const z = new Map(this.fest);
    for (let h = Math.max(0, this.bis + 1); h <= k; h++) {
      const n = NamenZaehler.name(store, h);
      if (n) z.set(n, (z.get(n) ?? 0) + 1);
    }
    return z;
  }

  /** Wartet, bis der feste Teil steht -- fuer Tests. */
  async fertig(store: ChainStore, kopf: () => number | null): Promise<void> {
    await this.nachfuehren(store, kopf);
  }
}
