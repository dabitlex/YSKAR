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
import { deserializeBlock, headerHash, checkBlockStructure, serializeBlock, type Block, type BlockHeader }
  from '../../core/block.ts';
import { validateBlock, checkDifficulty, checkEncoding, checkParentTimestamp, type ValidationError } from '../../core/validate.ts';
import { checkTimestamp, type BlockTiming } from '../../core/difficulty.ts';
import { emptyState, applyBlock, stateRoot, cloneState, type State }
  from '../../core/state.ts';
import { toHex } from '../../core/codec.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';
import { MEDIAN_TIME_BLOCKS } from '../../core/params.ts';

import { ChainStore, alsTip, type StoredBlock } from './ChainStore.ts';
import { blockWork, compareTips } from './ChainWork.ts';

/** Abstand zwischen Zustandsmarken auf der aktiven Kette. */
export const SNAPSHOT_INTERVAL = 200;

/**
 * Was die Zeit- und die Difficulty-Regel von der Vorgeschichte bekommen.
 *
 * Die Zeitregel bekommt die letzten 11 Zeitstempel (MEDIAN_TIME_BLOCKS),
 * die Difficulty-Regel die letzten lwmaWindow + 1 Loesungszeiten -- genau
 * die Ausschnitte, die der Knoten ihnen schon immer uebergeben hat. (Die
 * Difficulty-Regel liest davon lwmaWindow; uebergeben wird eine mehr, wie
 * bisher.) Deshalb geht diese Funktion nur so weit zurueck, wie dafuer
 * noetig ist: lwmaWindow + 2 Bloecke, denn jede Loesungszeit braucht den
 * Block davor -- mindestens aber so viele, wie die Zeitregel verlangt.
 *
 * Vorher lief der Knoten fuer jeden Block bis zum Genesis zurueck und warf
 * fast alles davon wieder weg. Das Ergebnis ist Stueck fuer Stueck dasselbe
 * (tests/kette-vorgeschichte.test.ts vergleicht es auf jeder Hoehe), nur
 * waechst die Arbeit nicht mehr mit der Laenge der Kette.
 *
 * Gelesen wird entlang der prev_hash-Verweise, nicht nach Hoehe: Der
 * Vorgaenger kann auf einem Nebenzweig liegen.
 */
export function vorgeschichte(
  store: ChainStore, vorgaenger: StoredBlock, params: ConsensusParams,
): { zeitstempel: bigint[]; timings: BlockTiming[] } {
  const noetig = Math.max(params.lwmaWindow + 2, MEDIAN_TIME_BLOCKS);
  const kette: StoredBlock[] = [];
  let aktuell: StoredBlock | null = vorgaenger;
  while (aktuell) {
    kette.push(aktuell);
    if (aktuell.height === 0 || kette.length >= noetig) break;
    aktuell = store.get(aktuell.prevHash);
  }
  kette.reverse();

  const zeitstempel = kette.map(b => b.blockTime).slice(-MEDIAN_TIME_BLOCKS);
  const timings = kette.slice(1).map((b, i) => ({
    solveSeconds: b.blockTime - kette[i].blockTime,
    difficulty: b.difficulty,
  })).slice(-params.lwmaWindow - 1);
  return { zeitstempel, timings };
}

export type AcceptResult =
  | { ok: true; stored: true; reorg: boolean; height: number; tip: Uint8Array;
      /**
       * Welche Bloecke durch diese Annahme aktiv wurden und welche ihren
       * Platz in der aktiven Kette verloren haben.
       *
       * WOFUER: Der Mempool muss nach jedem angenommenen Block aufgeraeumt
       * werden -- enthaltene Transaktionen raus, und bei einem Reorg die
       * Transaktionen der verdraengten Bloecke zurueck in die Warteschlange.
       * Vorher stand `reorg: boolean` hier und sonst nichts; wer aufraeumen
       * wollte, wusste zwar DASS umgeschaltet wurde, aber nicht WORAUF.
       *
       * Deshalb die Bloecke selbst und nicht ein Rueckruf: Der ChainManager
       * haelt die Kette. Er soll nichts vom Mempool wissen muessen.
       *
       * Bei einer blossen Verlaengerung steht in `neu` genau ein Block und
       * `verdraengt` ist leer.
       */
      neu: StoredBlock[]; verdraengt: StoredBlock[] }
  | { ok: true; stored: false; grund: 'bekannt' }
  | { ok: false; grund: string; detail?: string };

/** Was ein Zweigwechsel bewegt hat. */
export interface Zweigwechsel {
  reorg: boolean;
  neu: StoredBlock[];
  verdraengt: StoredBlock[];
}

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
   * Zustand nach dem zuletzt angenommenen Block, der NICHT Kopf der aktiven
   * Kette wurde.
   *
   * Ein konkurrierender Zweig kommt Block fuer Block an. Ohne diesen Merker
   * muesste fuer jeden seiner Bloecke der Zustand neu von der letzten Marke
   * aus gerechnet werden. Der Zustand nach einem Block haengt nur von
   * dessen eigener Vorgeschichte ab und aendert sich nie -- er darf deshalb
   * stehen bleiben, egal was mit der aktiven Kette geschieht.
   */
  private zweigMerker: { hash: Uint8Array; state: State } | null = null;

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
    let hash: Uint8Array;
    let kanonisch: Uint8Array;
    /*
      Gespeichert und weitergegeben wird der Block in SEINER EIGENEN
      Kodierung, nicht in den empfangenen Bytes (Issue #10).

      Der Blockhash deckt nur den Header ab, die Merkle-Wurzel nur die
      Transaktions-IDs -- beide aus den gelesenen Feldern. Bytes hinter der
      letzten Transaktion oder in einem zu langen Transaktionsrahmen liest
      deserializeBlock nicht und aendern keinen Hash. Bisher wurden sie mit
      gespeichert: Ein Peer konnte einen fremden, gueltigen Block mit bis zu
      2 MiB Muell zuerst zustellen, und der Knoten hielt und verteilte diese
      Fassung -- auch an den Spiegel, der ueber 1 MiB ablehnt. Die saubere
      Fassung galt danach als "bekannt".

      Neu kodiert ist der Block derselbe: gleicher Hash, gleiche
      Transaktionen, gleiche Gueltigkeit. Das ist keine Konsensaenderung.

      headerHash und serializeBlock stehen mit im try: Beide kodieren den
      Header neu und werfen bei einem Feld, das sich so nicht schreiben
      laesst (etwa Difficulty 0). Das ist ein unlesbarer Block, kein Absturz.
    */
    try {
      block = deserializeBlock(roh);
      hash = headerHash(block.header);
      kanonisch = serializeBlock(block);
    } catch (e) { return { ok: false, grund: 'unlesbar', detail: String((e as Error).message) }; }

    if (this.store.has(hash)) return { ok: true, stored: false, grund: 'bekannt' };

    /*
      Ab Konsensfassung 5 muss der Block so ankommen, wie er kodiert gehoert
      (validate.ts, checkEncoding). Abgelehnt wird nur DIESE Kopie: Es wird
      nichts gespeichert und nichts als ungueltig vorgemerkt -- dieselbe
      Kopie sauber kodiert hat denselben Hash und wird angenommen.
    */
    const kodierung = checkEncoding(roh, block, this.params);
    if (kodierung) return { ok: false, grund: 'kodierung', detail: kodierung };

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

    // Vorgeschichte AN DIESEM ZWEIG, nicht am aktiven Tip: die letzten
    // Zeitstempel und Loesungszeiten vor dem Block.
    const jetzt = BigInt(Math.floor(Date.now() / 1000));
    let vorKopf: BlockHeader | null = null;
    let zeitstempel: bigint[] = [];
    let timings: BlockTiming[] = [];

    if (vorgaenger) {
      // Ein Vorgaenger, der sich nicht mehr lesen laesst, ist ein Schaden in
      // der Ablage -- dann wird abgelehnt, nicht abgestuerzt.
      try {
        vorKopf = deserializeBlock(vorgaenger.body).header;
        ({ zeitstempel, timings } = vorgeschichte(this.store, vorgaenger, this.params));
      } catch (e) {
        return { ok: false, grund: 'zweig_unlesbar', detail: String((e as Error).message) };
      }

      /*
        Zeit und Difficulty ZUERST -- vor dem Zustand.

        Beides kostet Mikrosekunden. Der Zustand eines Nebenzweigs dagegen
        muss gerechnet werden. Ein Block mit falscher Zeit oder falscher
        Difficulty soll abgewiesen sein, bevor diese Arbeit anfaellt.

        Es sind dieselben zwei Funktionen mit denselben Eingaben, die
        validateBlock weiter unten noch einmal aufruft, in derselben
        Reihenfolge. Die Regel aendert sich dadurch nicht: Hier wird nichts
        abgelehnt, was validateBlock nicht mit demselben Grund ablehnen
        wuerde, und angenommen wird ein Block nur dort.
      */
      const zeitFehler = checkTimestamp(block.header.timestamp, zeitstempel, jetzt)
        ?? checkParentTimestamp(block.header, vorKopf, this.params);
      if (zeitFehler) return { ok: false, grund: 'timestamp', detail: zeitFehler };
      const diffFehler = checkDifficulty(block.header, vorKopf, timings, this.params);
      if (diffFehler) return { ok: false, grund: 'difficulty', detail: diffFehler };
    }

    // Zustand AN DIESEM ZWEIG. Genau hier entscheidet sich, ob Gabelungen
    // funktionieren: Ein Block auf einem Nebenzweig muss gegen dessen
    // Zustand geprueft werden.
    let ausgangszustand: State;
    try {
      ausgangszustand = this.zustandNach(vorgaenger);
    } catch (e) {
      return { ok: false, grund: 'zweig_unlesbar', detail: String((e as Error).message) };
    }

    const fehler: ValidationError | null = validateBlock(block, {
      previous: vorKopf,
      state: ausgangszustand,
      recentTimestamps: zeitstempel,
      recentTimings: timings,
      now: jetzt,
      params: this.params,
    });
    if (fehler) return { ok: false, grund: fehler.code, detail: fehler.detail };

    const nachher = cloneState(ausgangszustand);
    const angewandt = applyBlock(nachher, block, this.params);
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
      txCount: block.txs.length, body: kanonisch,
      status: 'valid', mainChain: false,
    });

    const wechsel = this.besteKetteWaehlen({ hash, state: nachher });
    // Wurde der Block nicht Kopf der aktiven Kette, ist er der juengste
    // Block eines Nebenzweigs -- sein Zustand wird fuer den naechsten Block
    // dieses Zweigs gebraucht. Als Kopf wird `nachher` nicht gemerkt: Nach
    // einer Verlaengerung ist es der gehaltene Zustand, nach einem
    // Zweigwechsel wurde dieser neu gerechnet. Zweimal vergeben wird das
    // Objekt nie.
    if (!this.zustandHash || toHex(this.zustandHash) !== toHex(hash)) {
      this.zweigMerker = { hash, state: nachher };
    }
    return { ok: true, stored: true, reorg: wechsel.reorg,
             neu: wechsel.neu, verdraengt: wechsel.verdraengt,
             height: this.zustandHoehe,
             tip: this.zustandHash ?? new Uint8Array(32) };
  }

  /**
   * Die Kette mit der meisten Arbeit zur aktiven machen.
   *
   * Rueckgabe: was sich dabei bewegt hat. reorg ist true, wenn dafuer auf
   * einen anderen Zweig umgeschaltet werden musste -- eine blosse
   * Verlaengerung ist keiner.
   *
   * @param frisch  Der gerade angenommene Block und der Zustand NACH ihm,
   *                wie accept() ihn eben errechnet und gegen die Wurzel im
   *                Block geprueft hat. Haengt genau dieser Block die aktive
   *                Kette um eins an, wird der Zustand uebernommen statt
   *                neu gerechnet.
   */
  besteKetteWaehlen(frisch?: { hash: Uint8Array; state: State }): Zweigwechsel {
    const nichts: Zweigwechsel = { reorg: false, neu: [], verdraengt: [] };
    const best = this.store.bestTip();
    if (!best) return nichts;

    const aktuell = this.store.mainTip();
    if (aktuell && toHex(aktuell.hash) === toHex(best.hash)) return nichts;
    if (aktuell && compareTips(alsTip(best), alsTip(aktuell)) <= 0) return nichts;

    const warVorhanden = aktuell !== null;
    /*
      Blosse Verlaengerung um den eben geprueften Block?

      Dann ist nichts umzuschalten: Kein Block verliert seinen Platz, und
      der neue Zustand liegt schon vor. Alles andere -- ein Zweigwechsel,
      ein Aufruf ohne frischen Block, ein gehaltener Zustand, der nicht am
      bisherigen Kopf steht -- geht den vollen Weg wie bisher.
    */
    const verlaengert = frisch !== undefined
      && toHex(best.hash) === toHex(frisch.hash)
      && (aktuell === null
        ? best.height === 0 && this.zustandHash === null
        : best.height === aktuell.height + 1
          && toHex(best.prevHash) === toHex(aktuell.hash)
          && this.zustandHash !== null
          && toHex(this.zustandHash) === toHex(aktuell.hash));
    const { neu, verdraengt } = verlaengert
      ? this.verlaengern(best, frisch.state)
      : this.umschalten(best);
    // Eine blosse Verlaengerung ist kein Reorg -- nur ein Zweigwechsel.
    const reorg = warVorhanden && toHex(best.prevHash) !== toHex(aktuell!.hash);
    return { reorg, neu, verdraengt };
  }

  /**
   * Die aktive Kette um genau einen Block verlaengern.
   *
   * Der haeufigste Fall ueberhaupt: beim Laden der Kette jeder Block, im
   * Betrieb fast jeder. Vorher lief auch er durch umschalten() und damit
   * durch zustandHerstellen() -- der Zustand wurde von der letzten Marke
   * aus neu gerechnet, bis zu 199 Bloecke samt ihrer Signaturen, obwohl
   * accept() ihn gerade erst errechnet hatte.
   *
   * Was in der Ablage geschieht, ist bei einer vollstaendigen Ablage
   * dasselbe wie in umschalten() fuer einen Pfad aus einem Block: Block als
   * aktiv markieren, Marken ab seiner Hoehe verwerfen, auf einer
   * Markenhoehe eine neue Marke schreiben.
   *
   * Was hier NICHT mehr geschieht: Der volle Weg las bei jedem Block die
   * juengste Marke, pruefte sie und schrieb fehlende oder beschaedigte
   * Marken neu. Das passiert jetzt nur noch beim Start und bei einem
   * Zweigwechsel. Eine beschaedigte Marke bleibt bis dahin liegen; benutzt
   * wird sie trotzdem nicht ungeprueft (zustandDerAktivenKette).
   *
   * `state` ist bereits geprueft: accept() hat seine Wurzel mit der im
   * Block verglichen, bevor der Block gespeichert wurde.
   */
  private verlaengern(
    tip: StoredBlock, state: State,
  ): { neu: StoredBlock[]; verdraengt: StoredBlock[] } {
    this.store.transaktion(() => {
      this.store.setMainChain(tip.hash, true);
      this.store.dropSnapshotsAbove(tip.height - 1);
    });

    if (tip.height % SNAPSHOT_INTERVAL === 0) {
      this.store.putSnapshot({
        hash: tip.hash, height: tip.height, stateRoot: stateRoot(state),
        accounts: [...state].map(([a, k]) => [a, { ...k }]),
      });
    }

    this.zustand = state;
    this.zustandHoehe = tip.height;
    this.zustandHash = tip.hash;
    return { neu: [tip], verdraengt: [] };
  }

  /**
   * Auf einen anderen Zweig umschalten.
   *
   * Schritte: gemeinsamen Vorfahren finden, alte Kette abmarkieren, neue
   * markieren, Zustand neu aufbauen, Wurzel gegenpruefen. Nichts wird
   * geloescht -- der alte Zweig bleibt vollstaendig erhalten und koennte
   * spaeter wieder gewinnen.
   *
   * Rueckgabe: die Bloecke, die aktiv wurden, und die, die ihren Platz
   * verloren haben. Die verdraengten kannte diese Funktion schon immer --
   * die Schleife unten laeuft genau ueber sie --, sie hat sie nur
   * weggeworfen. Der Mempool braucht sie: Deren Transaktionen sind nicht
   * mehr in der Kette und muessen zurueck in die Warteschlange.
   */
  private umschalten(neuerTip: StoredBlock): { neu: StoredBlock[]; verdraengt: StoredBlock[] } {
    const neuerPfad = this.pfadZumVerankerten(neuerTip);
    const gabel = neuerPfad.length > 0 ? neuerPfad[0].height - 1 : -1;
    const verdraengt: StoredBlock[] = [];

    this.store.transaktion(() => {
      // Alles oberhalb der Gabelung aus der aktiven Kette nehmen.
      let h = this.store.height();
      while (h > gabel) {
        const alt = this.store.mainAt(h);
        if (alt) {
          verdraengt.push(alt);
          this.store.setMainChain(alt.hash, false);
        }
        h--;
      }
      for (const b of neuerPfad) this.store.setMainChain(b.hash, true);

      // Marken oberhalb der Gabelung gehoeren zum alten Zweig.
      this.store.dropSnapshotsAbove(gabel);
    });

    this.zustandHerstellen();

    // Aufsteigend, wie neuerPfad -- die Schleife oben lief abwaerts.
    verdraengt.reverse();
    return { neu: neuerPfad, verdraengt };
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
      const r = applyBlock(zustand, block, this.params);
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
   * Zustand NACH einem beliebigen Block der Ablage.
   *
   * Drei Faelle, vom billigsten zum teuersten:
   *
   *  1. Der Block ist der Kopf der aktiven Kette: der gehaltene Zustand.
   *  2. Der Block ist der zuletzt angenommene eines Nebenzweigs: der
   *     gemerkte Zustand.
   *  3. Sonst wird gerechnet -- vom Vorgaenger rueckwaerts bis zum ersten
   *     Block, der zur aktiven Kette gehoert, und von dessen Zustand aus
   *     die Bloecke des Zweigs vorwaerts.
   *
   * Vorher wurde im dritten Fall jeder Block seit dem Genesis neu
   * angewandt. Das Ergebnis ist dasselbe: Der Zustand nach einem Block
   * haengt nur von den Bloecken davor ab, und ob man bei Block 0 beginnt
   * oder bei einem geprueften Zwischenstand, aendert ihn nicht.
   *
   * Die Rueckgabe gehoert dem Aufrufer -- immer eine eigene Kopie.
   */
  private zustandNach(vorgaenger: StoredBlock | null): State {
    if (!vorgaenger) return emptyState();

    if (this.zustandHash && toHex(this.zustandHash) === toHex(vorgaenger.hash)) {
      return cloneState(this.zustand);
    }
    if (this.zweigMerker && toHex(this.zweigMerker.hash) === toHex(vorgaenger.hash)) {
      return cloneState(this.zweigMerker.state);
    }

    // Rueckwaerts bis zum ersten Block der aktiven Kette (dem Anker).
    const zweig: StoredBlock[] = [];
    let anker: StoredBlock | null = vorgaenger;
    while (anker && !anker.mainChain) {
      zweig.push(anker);
      if (anker.height === 0) { anker = null; break; }
      const davor = this.store.get(anker.prevHash);
      if (!davor) throw new Error(`Zweig hat eine Luecke unter Hoehe ${anker.height}`);
      anker = davor;
    }
    zweig.reverse();

    const state = anker ? this.zustandDerAktivenKette(anker) : emptyState();
    for (const b of zweig) {
      const r = applyBlock(state, deserializeBlock(b.body), this.params);
      if (!r.ok) throw new Error(`Zweig bei ${b.height}: ${r.error?.reason}`);
    }
    return state;
  }

  /**
   * Zustand nach einem Block der AKTIVEN Kette, der nicht ihr Kopf ist.
   *
   * Von der juengsten Marke an oder unter seiner Hoehe aus vorwaerts
   * gerechnet -- mit einer passenden Marke hoechstens
   * SNAPSHOT_INTERVAL - 1 Bloecke.
   *
   * Der Marke wird nicht blind geglaubt, und DAS ist der Schutz: Ihre
   * Wurzel muss zu der passen, die IM BLOCK steht, zu dem sie gehoert.
   * Diese Wurzel hat der Knoten selbst nachgerechnet, als er den Block
   * annahm, und sie ist vom Proof of Work des Blocks gedeckt. Eine Marke
   * mit dieser Wurzel IST der Zustand nach diesem Block. Passt die Marke
   * nicht oder fehlt sie, wird von Block 0 an gerechnet, wie frueher immer.
   *
   * Auf die Pruefung am Ende von accept() allein waere kein Verlass: Dort
   * wird die errechnete Wurzel mit der im NEUEN Block verglichen, und die
   * waehlt dessen Verfasser. Wer eine falsche Marke kennte, koennte einen
   * Block bauen, der genau zu ihr passt.
   */
  private zustandDerAktivenKette(anker: StoredBlock): State {
    if (this.zustandHash && toHex(this.zustandHash) === toHex(anker.hash)) {
      return cloneState(this.zustand);
    }

    const marke = this.store.snapshotAtOrBelow(anker.height);
    let state = emptyState();
    let ab = 0;

    if (marke) {
      for (const [adr, k] of marke.accounts) state.set(adr, { ...k });
      const block = this.store.get(marke.hash);
      const passt = block !== null && block.mainChain && block.height === marke.height
        && toHex(stateRoot(state)) === toHex(block.stateRoot);
      if (passt) ab = marke.height + 1;
      else state = emptyState();
    }

    for (let h = ab; h <= anker.height; h++) {
      const b = this.store.mainAt(h);
      if (!b) throw new Error(`Aktive Kette hat eine Luecke bei Hoehe ${h}`);
      const r = applyBlock(state, deserializeBlock(b.body), this.params);
      if (!r.ok) throw new Error(`Block ${h} laesst sich nicht anwenden: ${r.error?.reason}`);
    }
    return state;
  }
}
