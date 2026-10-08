/**
 * Verzeichnis der aktiven Kette: welche Transaktion in welchem Block steht,
 * und in welchen Bloecken eine Adresse vorkommt.
 *
 * WARUM ES DAS GIBT
 *
 * /account, /tx und /search lasen bisher bei JEDEM Aufruf bis zu 5.000
 * Bloecke aus der Ablage und zerlegten jeden davon -- auch fuer eine
 * Adresse, die in keinem einzigen vorkommt (Befund S5). Die Mini App fragt
 * /account regelmaessig ab; jeder Aufruf war ein Durchlauf ueber die halbe
 * Kette.
 *
 * Mit dem Verzeichnis liest /account nur noch die Bloecke, in denen die
 * Adresse vorkommt (und davon hoechstens so viele, wie der Verlauf zeigt),
 * /tx genau einen.
 *
 * WIE ES AKTUELL BLEIBT
 *
 * Ohne Rueckruf aus dem ChainManager: Vor jeder Abfrage vergleicht
 * nachziehen() den eigenen obersten Block mit der aktiven Kette. Passt er,
 * kostet das eine Abfrage. Passt er nicht (neuer Block oder Reorg), werden
 * oben Bloecke abgebaut, bis es wieder passt, und dann die neuen angebaut.
 * Ein Reorg ist damit kein Sonderfall -- er ist "oben passt etwas nicht
 * mehr", wie jeder andere neue Block auch.
 *
 * Die Antworten bleiben dieselben wie vorher, Feld fuer Feld --
 * tests/kettenindex.test.ts vergleicht beide Wege, auch ueber Reorgs.
 */
import { deserializeBlock, type Block } from '../../core/block.ts';
import { txid, TX_COINBASE } from '../../core/tx.ts';
import { toHex, fromHex } from '../../core/codec.ts';

import type { ChainManager } from './ChainManager.ts';
import type { ChainStore } from './ChainStore.ts';

/** Art eines Eintrags je Adresse -- genau die Unterscheidung, die /account zaehlt. */
export const ART_FUND = 0;        // Coinbase mit einem Empfaenger: Block gefunden
export const ART_POOL = 1;        // Coinbase mit mehreren Empfaengern: Pool-Anteil
export const ART_UEBERWEISUNG = 2;

/*
  Ein Eintrag ist eine Zahl: (Hoehe * 4096 + Stelle im Block) * 4 + Art.
  Stelle < 4096 (MAX_TXS_PER_BLOCK ist 2000), Art < 4. Bis Hoehe 2^39 bleibt
  das unter 2^53 und damit exakt. Zahlen statt Objekte: Ein Eintrag je
  Empfaenger jeder Pool-Coinbase kommen schnell Hunderttausende zusammen.
*/
const packe = (hoehe: number, stelle: number, art: number) => (hoehe * 4096 + stelle) * 4 + art;
export const hoeheVon = (e: number) => Math.floor(e / 16384);
export const stelleVon = (e: number) => Math.floor(e / 4) % 4096;
export const artVon = (e: number) => e % 4;

export class KettenIndex {
  private store: ChainStore;
  private chain: ChainManager;
  /** Hash je Hoehe, so wie er beim Eintragen auf der aktiven Kette stand. */
  private hashes: string[] = [];
  private txHoehe = new Map<string, number>();
  private nachAdresse = new Map<string, number[]>();

  constructor(store: ChainStore, chain: ChainManager) {
    this.store = store;
    this.chain = chain;
  }

  /** Auf den Stand der aktiven Kette bringen. */
  nachziehen(): void {
    const tip = this.chain.tip();
    const tipHoehe = tip?.height ?? -1;
    if (tip && this.hashes.length === tipHoehe + 1 && this.hashes[tipHoehe] === toHex(tip.hash)) return;
    if (!tip && this.hashes.length === 0) return;

    // Oben abbauen, was nicht mehr zur aktiven Kette gehoert.
    while (this.hashes.length > 0) {
      const h = this.hashes.length - 1;
      const aktiv = h <= tipHoehe ? this.store.mainAt(h) : null;
      if (aktiv && toHex(aktiv.hash) === this.hashes[h]) break;
      this.abbauen(h);
    }
    // Und anbauen bis zum Kopf.
    for (let h = this.hashes.length; h <= tipHoehe; h++) {
      const b = this.store.mainAt(h);
      if (!b) break;
      this.anbauen(h, toHex(b.hash), deserializeBlock(b.body));
    }
  }

  /** Hoehe des Blocks mit dieser Transaktion auf der aktiven Kette, sonst null. */
  hoeheVonTx(txidHex: string): number | null {
    return this.txHoehe.get(txidHex) ?? null;
  }

  /** Eintraege einer Adresse, aufsteigend nach Hoehe und Stelle. Nicht veraendern. */
  eintraege(adresseHex: string): readonly number[] {
    return this.nachAdresse.get(adresseHex) ?? [];
  }

  /** Wie viele Bloecke eingetragen sind -- fuer Tests und Anzeige. */
  hoehe(): number { return this.hashes.length - 1; }

  private anbauen(h: number, hashHex: string, block: Block): void {
    block.txs.forEach((t, stelle) => {
      this.txHoehe.set(toHex(txid(t)), h);
      if (t.type === TX_COINBASE) {
        const art = t.outputs.length === 1 ? ART_FUND : ART_POOL;
        const gesehen = new Set<string>();
        for (const o of t.outputs) {
          const k = toHex(o.to);
          if (gesehen.has(k)) continue;
          gesehen.add(k);
          this.dazu(k, packe(h, stelle, art));
        }
        return;
      }
      const von = toHex(t.from), an = toHex(t.to);
      this.dazu(von, packe(h, stelle, ART_UEBERWEISUNG));
      if (an !== von) this.dazu(an, packe(h, stelle, ART_UEBERWEISUNG));
    });
    this.hashes.push(hashHex);
  }

  private abbauen(h: number): void {
    const gespeichert = this.store.get(fromHex(this.hashes[h]));
    if (gespeichert) {
      const block = deserializeBlock(gespeichert.body);
      for (const t of block.txs) {
        const id = toHex(txid(t));
        if (this.txHoehe.get(id) === h) this.txHoehe.delete(id);
        const beteiligt = t.type === TX_COINBASE
          ? t.outputs.map(o => toHex(o.to))
          : [toHex(t.from), toHex(t.to)];
        for (const k of beteiligt) this.wegOben(k, h);
      }
    } else {
      // Der Block ist aus der Ablage verschwunden -- das passiert nicht,
      // Bloecke werden nie geloescht. Falls doch: alles neu, statt falsch.
      this.txHoehe.clear();
      this.nachAdresse.clear();
      this.hashes = [];
      return;
    }
    this.hashes.pop();
  }

  private dazu(adresse: string, eintrag: number): void {
    const liste = this.nachAdresse.get(adresse);
    if (liste) liste.push(eintrag); else this.nachAdresse.set(adresse, [eintrag]);
  }

  /** Alle Eintraege dieser Hoehe vom Ende der Liste nehmen (sie liegen oben). */
  private wegOben(adresse: string, h: number): void {
    const liste = this.nachAdresse.get(adresse);
    if (!liste) return;
    while (liste.length && hoeheVon(liste[liste.length - 1]) === h) liste.pop();
    if (liste.length === 0) this.nachAdresse.delete(adresse);
  }
}
