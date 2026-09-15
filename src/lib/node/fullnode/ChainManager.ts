/**
 * Kettenverwaltung: Bloecke annehmen, Gabelungen erkennen, umschalten.
 *
 * Das ist der Kern eines Full Nodes und die Stelle, an der die meisten
 * Projekte Fehler machen. Drei Regeln, die hier nie gebrochen werden:
 *
 *  1. JEDER Block wird selbst vollstaendig geprueft. Dass ein Peer ihn
 *     geschickt hat, ist kein Argument.
 *  2. Ein gueltiger Block wird gespeichert, auch wenn er nicht zur aktiven
 *     Kette gehoert. Ohne das laesst sich eine Gabelung nicht aufloesen --
 *     man braucht beide Zweige, um sie vergleichen zu koennen.
 *  3. Die aktive Kette ist die mit der meisten kumulierten Arbeit, nicht
 *     die laengste und nicht die zuerst gesehene.
 *
 * Historische Bloecke werden nie veraendert oder geloescht. Ein Reorg
 * markiert nur um, welcher Zweig gerade gilt.
 */
import { deserializeBlock, headerHash, checkBlockStructure, type Block }
  from '../../core/block.ts';
import { validateBlock, type ValidationError } from '../../core/validate.ts';
import { emptyState, applyBlock, stateRoot, cloneState, type State }
  from '../../core/state.ts';
import { toHex } from '../../core/codec.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';

import { ChainStore, alsTip, type StoredBlock } from './ChainStore.ts';
import { blockWork, compareTips } from './ChainWork.ts';

/** Abstand zwischen Zustandsmarken auf der aktiven Kette. */
export const SNAPSHOT_INTERVAL = 200;

export type AcceptResult =
  | { ok: true; stored: true; reorg: boolean; height: number; tip: Uint8Array }
  | { ok: true; stored: false; grund: 'bekannt' }
  | { ok: false; grund: string; detail?: string };

export interface ChainState {
  state: State;
  height: number;
  tipHash: Uint8Array | null;
}

export class ChainManager {
  private store: ChainStore;
  private params: ConsensusParams;
  /** Zustand am Kopf der AKTIVEN Kette. Wird bei jedem Reorg neu gebaut. */
  private zustand: State = emptyState();
  private zustandHoehe = -1;
  private zustandHash: Uint8Array | null = null;

  /**
   * Ohne Angabe gilt das Mainnet. Die Parameter gibt es nur, damit Fork-
   * und Reorg-Tests im Testnetz durch die volle Validierung laufen koennen.
   */
  constructor(store: ChainStore, params: ConsensusParams = MAINNET) {
    this.store = store;
    this.params = params;
    this.zustandHerstellen();
  }

  tip(): StoredBlock | null { return this.store.mainTip(); }
  height(): number { return this.zustandHoehe; }
  state(): State { return this.zustand; }

  /**
   * Einen Block annehmen.
   *
   * Reihenfolge ist Absicht: erst billige Pruefungen, dann teure. Ein
   * kaputter Header kostet Mikrosekunden, eine Signaturpruefung
   * Millisekunden. Wer das umdreht, macht sich angreifbar.
   */
  accept(roh: Uint8Array): AcceptResult {
    let block: Block;
    try { block = deserializeBlock(roh); }
    catch (e) { return { ok: false, grund: 'unlesbar', detail: String((e as Error).message) }; }

    const hash = headerHash(block.header);
    if (this.store.has(hash)) return { ok: true, stored: false, grund: 'bekannt' };

    const strukturfehler = checkBlockStructure(block);
    if (strukturfehler) return { ok: false, grund: 'struktur', detail: strukturfehler };

    // Genesis hat keinen Vorgaenger; alles andere braucht einen bekannten.
    const istGenesis = block.header.height === 0;
    let vorgaenger: StoredBlock | null = null;

    if (!istGenesis) {
      vorgaenger = this.store.get(block.header.prevHash);
      if (!vorgaenger) {
        // Kein Fehler des Blocks -- uns fehlt nur seine Vorgeschichte.
        return { ok: false, grund: 'vorgaenger_fehlt',
                 detail: toHex(block.header.prevHash) };
      }
      if (vorgaenger.status !== 'valid') {
        return { ok: false, grund: 'vorgaenger_ungueltig' };
      }
      if (block.header.height !== vorgaenger.height + 1) {
        return { ok: false, grund: 'hoehe_passt_nicht',
                 detail: `${block.header.height} nach ${vorgaenger.height}` };
      }
    }

    // Zustand und Vorgeschichte AN DIESEM ZWEIG, nicht am aktiven Tip.
    // Genau hier entscheidet sich, ob Gabelungen funktionieren: Ein Block
    // auf einem Nebenzweig muss gegen dessen Zustand geprueft werden.
    let ausgangszustand: State;
    let zeitstempel: bigint[];
    let timings: { difficulty: bigint; solveSeconds: bigint }[];

    try {
      const kontext = this.zweigKontext(vorgaenger);
      ausgangszustand = kontext.state;
      zeitstempel = kontext.zeitstempel;
      timings = kontext.timings;
    } catch (e) {
      return { ok: false, grund: 'zweig_unlesbar', detail: String((e as Error).message) };
    }

    const fehler: ValidationError | null = validateBlock(block, {
      previous: vorgaenger ? deserializeBlock(vorgaenger.body).header : null,
      state: ausgangszustand,
      recentTimestamps: zeitstempel.slice(-11),
      recentTimings: timings.slice(-this.params.lwmaWindow - 1),
      now: BigInt(Math.floor(Date.now() / 1000)),
      params: this.params,
    });
    if (fehler) return { ok: false, grund: fehler.code, detail: fehler.detail };

    const nachher = cloneState(ausgangszustand);
    const angewandt = applyBlock(nachher, block);
    if (!angewandt.ok) {
      return { ok: false, grund: 'anwenden', detail: angewandt.error?.reason };
    }

    // Der Pruefstein: Der selbst errechnete Zustand muss zu der Wurzel
    // passen, die IM BLOCK steht.
    const meine = stateRoot(nachher);
    if (toHex(meine) !== toHex(block.header.stateRoot)) {
      return { ok: false, grund: 'state_root',
               detail: `errechnet ${toHex(meine).slice(0, 16)}…` };
    }

    const arbeit = (vorgaenger?.chainWork ?? 0n) + blockWork(block.header.difficulty);

    this.store.put({
      hash, height: block.header.height, prevHash: block.header.prevHash,
      chainWork: arbeit, difficulty: block.header.difficulty,
      blockTime: block.header.timestamp,
      merkleRoot: block.header.merkleRoot, stateRoot: block.header.stateRoot,
      txCount: block.txs.length, body: roh,
      status: 'valid', mainChain: false,
    });

    const reorg = this.besteKetteWaehlen();
    return { ok: true, stored: true, reorg,
             height: this.zustandHoehe,
             tip: this.zustandHash ?? new Uint8Array(32) };
  }

  /**
   * Die Kette mit der meisten Arbeit zur aktiven machen.
   *
   * Rueckgabe: true, wenn dafuer umgeschaltet werden musste.
   */
  besteKetteWaehlen(): boolean {
    const best = this.store.bestTip();
    if (!best) return false;

    const aktuell = this.store.mainTip();
    if (aktuell && toHex(aktuell.hash) === toHex(best.hash)) return false;
    if (aktuell && compareTips(alsTip(best), alsTip(aktuell)) <= 0) return false;

    const warVorhanden = aktuell !== null;
    this.umschalten(best);
    // Eine blosse Verlaengerung ist kein Reorg -- nur ein Zweigwechsel.
    return warVorhanden && toHex(best.prevHash) !== toHex(aktuell!.hash);
  }

  /**
   * Auf einen anderen Zweig umschalten.
   *
   * Schritte: gemeinsamen Vorfahren finden, alte Kette abmarkieren, neue
   * markieren, Zustand neu aufbauen, Wurzel gegenpruefen. Nichts wird
   * geloescht -- der alte Zweig bleibt vollstaendig erhalten und koennte
   * spaeter wieder gewinnen.
   */
  private umschalten(neuerTip: StoredBlock): void {
    const neuerPfad = this.pfadZumVerankerten(neuerTip);
    const gabel = neuerPfad.length > 0 ? neuerPfad[0].height - 1 : -1;

    this.store.transaktion(() => {
      // Alles oberhalb der Gabelung aus der aktiven Kette nehmen.
      let h = this.store.height();
      while (h > gabel) {
        const alt = this.store.mainAt(h);
        if (alt) this.store.setMainChain(alt.hash, false);
        h--;
      }
      for (const b of neuerPfad) this.store.setMainChain(b.hash, true);

      // Marken oberhalb der Gabelung gehoeren zum alten Zweig.
      this.store.dropSnapshotsAbove(gabel);
    });

    this.zustandHerstellen();
  }

  /**
   * Der Weg vom neuen Tip abwaerts bis zum ersten Block, der schon zur
   * aktiven Kette gehoert. Von dort aufwaerts sortiert.
   */
  private pfadZumVerankerten(tip: StoredBlock): StoredBlock[] {
    const pfad: StoredBlock[] = [];
    let aktuell: StoredBlock | null = tip;
    while (aktuell && !aktuell.mainChain) {
      pfad.push(aktuell);
      if (aktuell.height === 0) break;
      aktuell = this.store.get(aktuell.prevHash);
    }
    return pfad.reverse();
  }

  /**
   * Zustand der aktiven Kette herstellen.
   *
   * Von der juengsten brauchbaren Marke aus vorwaerts rechnen. Gibt es
   * keine, von Block 0 an. Bei einigen hundert Bloecken dauert das
   * Millisekunden; die Marken sind fuer spaeter, wenn es zehntausende sind.
   */
  private zustandHerstellen(): void {
    const tip = this.store.mainTip();
    if (!tip) {
      this.zustand = emptyState();
      this.zustandHoehe = -1;
      this.zustandHash = null;
      return;
    }

    const marke = this.store.snapshotAtOrBelow(tip.height);
    let zustand = emptyState();
    let ab = 0;

    if (marke) {
      for (const [adr, k] of marke.accounts) zustand.set(adr, { ...k });
      // Der Marke nicht blind glauben: Passt ihre Wurzel nicht, ist die
      // Ablage beschaedigt, und dann wird von vorn gerechnet.
      if (toHex(stateRoot(zustand)) === toHex(marke.stateRoot)) {
        ab = marke.height + 1;
      } else {
        zustand = emptyState();
      }
    }

    for (let h = ab; h <= tip.height; h++) {
      const b = this.store.mainAt(h);
      if (!b) throw new Error(`Aktive Kette hat eine Luecke bei Hoehe ${h}`);
      const block = deserializeBlock(b.body);
      const r = applyBlock(zustand, block);
      if (!r.ok) {
        throw new Error(`Block ${h} laesst sich nicht anwenden: ${r.error?.reason}`);
      }
      if (h % SNAPSHOT_INTERVAL === 0) {
        this.store.putSnapshot({
          hash: b.hash, height: h, stateRoot: stateRoot(zustand),
          accounts: [...zustand].map(([a, k]) => [a, { ...k }]),
        });
      }
    }

    const wurzel = stateRoot(zustand);
    if (toHex(wurzel) !== toHex(tip.stateRoot)) {
      throw new Error(
        `Zustandswurzel weicht ab: errechnet ${toHex(wurzel).slice(0, 16)}…, ` +
        `im Block ${toHex(tip.stateRoot).slice(0, 16)}…`);
    }

    this.zustand = zustand;
    this.zustandHoehe = tip.height;
    this.zustandHash = tip.hash;
  }

  /**
   * Zustand und Vorgeschichte an einem beliebigen Punkt der Kette.
   *
   * Fuer den aktiven Tip ist das der gehaltene Zustand. Fuer einen
   * Nebenzweig muss gerechnet werden -- das ist selten und darf deshalb
   * teuer sein.
   */
  private zweigKontext(vorgaenger: StoredBlock | null): {
    state: State;
    zeitstempel: bigint[];
    timings: { difficulty: bigint; solveSeconds: bigint }[];
  } {
    if (!vorgaenger) return { state: emptyState(), zeitstempel: [], timings: [] };

    const kette: StoredBlock[] = [];
    let aktuell: StoredBlock | null = vorgaenger;
    while (aktuell) {
      kette.push(aktuell);
      if (aktuell.height === 0) break;
      aktuell = this.store.get(aktuell.prevHash);
    }
    kette.reverse();

    const amAktivenTip = this.zustandHash
      && toHex(this.zustandHash) === toHex(vorgaenger.hash);

    let state: State;
    if (amAktivenTip) {
      state = cloneState(this.zustand);
    } else {
      state = emptyState();
      for (const b of kette) {
        const r = applyBlock(state, deserializeBlock(b.body));
        if (!r.ok) throw new Error(`Zweig bei ${b.height}: ${r.error?.reason}`);
      }
    }

    const zeitstempel = kette.map(b => b.blockTime);
    const timings = kette.slice(1).map((b, i) => ({
      solveSeconds: b.blockTime - kette[i].blockTime,
      difficulty: b.difficulty,
    }));
    return { state, zeitstempel, timings };
  }
}
