/**
 * Mehrere Grafikkarten zugleich.
 *
 * Je Karte ein eigener GpuMiner -- und damit ein eigenes yskar-cuda, ein
 * eigener Selbsttest und eine eigene Extranonce. Im Pool bekommt jede Karte
 * zusaetzlich eine eigene Sitzung (der Aufrufer legt sie an). Zwei Karten
 * pruefen also nie dieselbe Nonce: Ihre Header unterscheiden sich schon an
 * Byte 120, genau wie bei CPU und GPU.
 *
 * EINE KARTE FAELLT AUS, DIE ANDEREN RECHNEN WEITER. Besteht eine Karte den
 * Selbsttest nicht oder stuerzt ihr Programm ab, betrifft das nur sie. Der
 * Grund steht in ihrem Status; die Gruppe laeuft, solange eine Karte laeuft.
 *
 * Nach aussen sieht die Gruppe aus wie ein einzelner GpuMiner: status()
 * liefert die Summen in denselben Feldern und dazu die Karten einzeln.
 */
import { GpuMiner, type GpuGeraet, type GpuMinerOptionen, type GpuMinerStatus } from './GpuMiner.ts';
import type { Arbeitsquelle } from './PoolQuelle.ts';

export interface GpuKarteStatus extends GpuMinerStatus {
  id: number;
}

export interface GpuGruppeStatus extends GpuMinerStatus {
  /** Jede gewaehlte Karte einzeln, auch eine, die nicht (mehr) laeuft. */
  karten: GpuKarteStatus[];
}

export interface GpuStartErgebnis {
  gestartet: GpuGeraet[];
  fehlgeschlagen: { geraet: GpuGeraet; grund: string }[];
}

export class GpuGruppe {
  private optionen: GpuMinerOptionen;
  /** Ein Miner je Kartennummer. Er bleibt bestehen -- sein Selbsttest gilt fuer die ganze Sitzung. */
  private miner = new Map<number, GpuMiner>();
  /** Die Karten des letzten Starts, in dieser Reihenfolge. */
  private gewaehlt: number[] = [];
  private extra: Uint8Array = new Uint8Array(0);

  constructor(o: GpuMinerOptionen) {
    this.optionen = o;
  }

  private minerFuer(id: number): GpuMiner {
    let m = this.miner.get(id);
    if (!m) {
      m = new GpuMiner(this.optionen);
      m.setExtra(this.extra);
      this.miner.set(id, m);
    }
    return m;
  }

  /**
   * Die gewaehlten Karten starten, eine nach der anderen.
   *
   * `quelleFuer` liefert die Arbeitsquelle je Karte: null fuer den eigenen
   * Knoten, sonst eine eigene Pool-Sitzung. Scheitert eine Karte, steht sie
   * in `fehlgeschlagen`; die anderen laufen trotzdem. `nachFehlschlag`
   * bekommt dann die Quelle dieser Karte zurueck, damit der Aufrufer etwa
   * die Pool-Sitzung wieder abmeldet.
   */
  async start(
    adresse: Uint8Array,
    geraete: GpuGeraet[],
    quelleFuer: (g: GpuGeraet) => Promise<Arbeitsquelle | null>,
    nachFehlschlag?: (g: GpuGeraet, q: Arbeitsquelle | null) => Promise<void>,
  ): Promise<GpuStartErgebnis> {
    await this.stop();
    // Jede Karte nur einmal, in der gewaehlten Reihenfolge.
    const karten = geraete.filter((g, i) => geraete.findIndex(x => x.id === g.id) === i);
    this.gewaehlt = karten.map(g => g.id);
    const ergebnis: GpuStartErgebnis = { gestartet: [], fehlgeschlagen: [] };
    for (const g of karten) {
      const m = this.minerFuer(g.id);
      let q: Arbeitsquelle | null = null;
      try {
        q = await quelleFuer(g);
        m.setzeQuelle(q);
        await m.start(adresse, g);
        ergebnis.gestartet.push(g);
      } catch (e) {
        await m.stop();
        m.setzeQuelle(null);
        await nachFehlschlag?.(g, q);
        ergebnis.fehlgeschlagen.push({ geraet: g, grund: (e as Error).message });
      }
    }
    return ergebnis;
  }

  async stop(): Promise<void> {
    await Promise.all([...this.miner.values()].map(m => m.stop()));
  }

  /** Zurueck zum eigenen Knoten -- der naechste Start entscheidet neu. */
  setzeQuelle(q: null): void {
    for (const m of this.miner.values()) m.setzeQuelle(q);
  }

  setExtra(e: Uint8Array): void {
    this.extra = e;
    for (const m of this.miner.values()) m.setExtra(e);
  }

  notifyChainChanged(): void {
    for (const m of this.miner.values()) m.notifyChainChanged();
  }

  /** Wie viele Karten gerade rechnen. */
  laufend(): number {
    let n = 0;
    for (const m of this.miner.values()) if (m.status().running) n++;
    return n;
  }

  status(): GpuGruppeStatus {
    const karten: GpuKarteStatus[] = this.gewaehlt
      .filter(id => this.miner.has(id))
      .map(id => ({ id, ...this.miner.get(id)!.status() }));
    const laufen = karten.filter(k => k.running);
    const summe = (f: (k: GpuKarteStatus) => number) => karten.reduce((n, k) => n + f(k), 0);
    const hoehen = laufen.map(k => k.height).filter((h): h is number => h !== null);
    return {
      running: laufen.length > 0,
      // Fuer alles, was nur EINE Karte kennt: die erste, die rechnet.
      device: laufen[0]?.device ?? karten[0]?.device ?? null,
      hashrate: laufen.reduce((n, k) => n + (Number.isFinite(k.hashrate) ? Math.max(0, k.hashrate) : 0), 0),
      hashes: summe(k => k.hashes),
      shares: summe(k => k.shares),
      blocks: summe(k => k.blocks),
      errors: summe(k => k.errors),
      height: hoehen.length ? Math.max(...hoehen) : null,
      lastError: karten.find(k => k.lastError !== null)?.lastError ?? null,
      selftest: karten.find(k => k.selftest !== null)?.selftest ?? null,
      uptimeSeconds: laufen.length ? Math.max(...laufen.map(k => k.uptimeSeconds)) : 0,
      karten,
    };
  }
}
