'use client';
import { useCallback, useRef, useState } from 'react';
import { MINER_WASM_URL } from '@/lib/minerWasm';

/**
 * Geraete-Kalibrierung.
 *
 * Misst die tatsaechliche Hashrate fuer mehrere Workerzahlen und
 * Intensitaeten -- und waehlt danach, was auf DIESEM Geraet am meisten
 * bringt.
 *
 * Der Anlass: Die App startete bisher immer genau zwei Worker, unabhaengig
 * davon, wie viele Kerne das Geraet hat. Ein Telefon mit acht Kernen nutzte
 * ein Viertel davon. Das erklaert Leistungsunterschiede zwischen Geraeten
 * besser als jede Hardwarebesonderheit.
 *
 * Gemessen wird ueber dieselbe WASM-Engine und dieselbe Schleife wie beim
 * echten Mining. Vorher laeuft der Known-Answer-Test: Stimmt der
 * Genesis-Hash nicht, bricht der Benchmark ab, statt eine Zahl zu zeigen.
 */

export interface Messung {
  workers: number;
  duty: number;
  hashrate: number;
  /** Vielfaches der Leistung eines einzelnen Workers. */
  skalierung: number;
  hashes: number;
  dauerMs: number;
}

export interface BenchErgebnis {
  messungen: Messung[];
  besteWorker: number;
  besteDuty: number;
  besteRate: number;
  /** Logische Prozessoren, soweit die Umgebung sie meldet. */
  kerne: number | null;
  /** Nur gesetzt, wenn ein Dauertest gelaufen ist. */
  dauertest?: { start: number; ende: number; verlauf: number[]; anteil: number };
  zeitpunkt: number;
}

export type BenchPhase =
  | { t: 'aus' }
  | { t: 'pruefe' }
  | { t: 'messe'; workers: number; duty: number; schritt: number; von: number }
  | { t: 'dauertest'; sekunde: number; von: number }
  | { t: 'fertig'; ergebnis: BenchErgebnis }
  | { t: 'fehler'; meldung: string };

const SPEICHER = 'yskar.bench.v1';
/** Warmlaufzeit je Stufe -- die ersten Sekunden sind nicht aussagekraeftig. */
const WARMUP_MS = 1500;
/** Messzeit je Stufe. */
const MESS_MS = 4500;

/**
 * Welche Workerzahlen geprueft werden.
 *
 * Abgeleitet aus der Kernzahl, nicht aus einer festen Liste. Bei wenigen
 * Kernen werden alle geprueft, bei vielen nur sinnvolle Stufen -- sonst
 * dauert die Kalibrierung laenger, als sie einbringt.
 */
export function stufen(kerne: number): number[] {
  const n = Math.max(1, Math.min(32, kerne));
  if (n <= 4) return Array.from({ length: n }, (_, i) => i + 1);

  // Ueberall durch Set und Sortierung, nicht nur im letzten Zweig: Bei
  // sechs Kernen stand sonst die 6 zweimal drin, und eine Stufe waere
  // doppelt gemessen worden.
  const grob = n <= 8
    ? [1, 2, 4, n - 2, n]
    : [1, 2, 4, 8, Math.round(n * 0.75), n];
  return [...new Set(grob)].filter(x => x >= 1 && x <= n).sort((a, b) => a - b);
}

export function gespeichert(): BenchErgebnis | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const roh = localStorage.getItem(SPEICHER);
    return roh ? JSON.parse(roh) as BenchErgebnis : null;
  } catch { return null; }
}

export function speichern(e: BenchErgebnis): void {
  try { localStorage.setItem(SPEICHER, JSON.stringify(e)); } catch { /* egal */ }
}

export function verwerfen(): void {
  try { localStorage.removeItem(SPEICHER); } catch { /* egal */ }
}

export function useBenchmark() {
  const [phase, setPhase] = useState<BenchPhase>({ t: 'aus' });
  const abbruch = useRef(false);

  /** Eine Stufe messen: n Worker mit gegebener Intensitaet. */
  const stufeMessen = useCallback(async (n: number, duty: number): Promise<{
    hashrate: number; hashes: number; dauerMs: number;
  }> => {
    const workers: Worker[] = [];
    try {
      for (let i = 0; i < n; i++) {
        workers.push(new Worker(new URL('../workers/bench.worker.ts', import.meta.url)));
      }

      // Alle hochfahren und den Known-Answer-Test abwarten.
      await Promise.all(workers.map((w, i) => new Promise<void>((auf, ab) => {
        const zeit = setTimeout(() => ab(new Error('Worker antwortet nicht')), 15_000);
        w.onmessage = ev => {
          if (ev.data.t === 'ready') { clearTimeout(zeit); auf(); }
          if (ev.data.t === 'error') { clearTimeout(zeit); ab(new Error(ev.data.message)); }
        };
        w.postMessage({ t: 'init', slot: i, wasmUrl: MINER_WASM_URL });
      })));

      let hashes = 0;
      let fenster = 0;
      let zaehlen = false;
      let fehler: string | null = null;

      for (const w of workers) {
        w.onmessage = ev => {
          if (ev.data.t === 'error') { fehler = ev.data.message; return; }
          if (ev.data.t !== 'progress' || !zaehlen) return;
          hashes += ev.data.hashes;
          fenster += ev.data.ms;
        };
        w.postMessage({ t: 'start', duty });
      }

      // Warmlaufen: Die ersten Sekunden verzerren, weil die Engine erst
      // uebersetzt wird und die Chunkgroesse sich noch einregelt.
      await new Promise(r => setTimeout(r, WARMUP_MS));
      if (fehler) throw new Error(fehler);

      zaehlen = true;
      const t0 = performance.now();
      await new Promise(r => setTimeout(r, MESS_MS));
      zaehlen = false;
      const dauerMs = performance.now() - t0;

      if (fehler) throw new Error(fehler);

      /*
        Die Rate aus der SUMME der Fenster, nicht aus der Wanduhr.

        Jeder Worker meldet, ueber welche Zeitspanne seine Hashes entstanden
        sind. Durch die Wanduhr zu teilen waere falsch, sobald ein Worker
        kurz haengt -- dann faende sich der Ausfall in der Zahl wieder,
        obwohl die anderen normal weiterliefen.
      */
      const rate = fenster > 0 ? (hashes * 1000 * n) / fenster : 0;
      return { hashrate: rate, hashes, dauerMs };
    } finally {
      for (const w of workers) { try { w.postMessage({ t: 'stop' }); w.terminate(); } catch { /* egal */ } }
    }
  }, []);

  const starten = useCallback(async (opt: { dauertestSek?: number } = {}) => {
    abbruch.current = false;
    const kerne = typeof navigator !== 'undefined'
      ? (navigator.hardwareConcurrency || null) : null;

    try {
      setPhase({ t: 'pruefe' });
      const liste = stufen(kerne ?? 2);
      const dutyStufen = [100];           // erst die Workerzahl, dann Intensitaet
      const gesamt = liste.length + 2;    // + zwei Intensitaetsstufen

      const messungen: Messung[] = [];
      let basis = 0;
      let schritt = 0;

      for (const n of liste) {
        if (abbruch.current) { setPhase({ t: 'aus' }); return null; }
        schritt++;
        setPhase({ t: 'messe', workers: n, duty: 100, schritt, von: gesamt });
        const r = await stufeMessen(n, dutyStufen[0]);
        if (n === liste[0]) basis = r.hashrate;
        messungen.push({
          workers: n, duty: 100, hashrate: r.hashrate,
          skalierung: basis > 0 ? r.hashrate / basis : 1,
          hashes: r.hashes, dauerMs: r.dauerMs,
        });
      }

      const bestWorker = messungen.reduce((a, b) => b.hashrate > a.hashrate ? b : a);

      // Intensitaet nur fuer die beste Workerzahl -- alles andere zu
      // durchlaufen kostet Minuten und bringt nichts.
      for (const d of [75, 50]) {
        if (abbruch.current) { setPhase({ t: 'aus' }); return null; }
        schritt++;
        setPhase({ t: 'messe', workers: bestWorker.workers, duty: d, schritt, von: gesamt });
        const r = await stufeMessen(bestWorker.workers, d);
        messungen.push({
          workers: bestWorker.workers, duty: d, hashrate: r.hashrate,
          skalierung: basis > 0 ? r.hashrate / basis : 1,
          hashes: r.hashes, dauerMs: r.dauerMs,
        });
      }

      const ergebnis: BenchErgebnis = {
        messungen,
        besteWorker: bestWorker.workers,
        besteDuty: 100,
        besteRate: bestWorker.hashrate,
        kerne,
        zeitpunkt: Date.now(),
      };

      // Dauertest: zeigt, ob die Leistung unter Last nachlaesst. Ob das an
      // Waerme liegt, laesst sich im Browser nicht feststellen -- also wird
      // es auch nicht behauptet.
      if (opt.dauertestSek && opt.dauertestSek > 0) {
        const verlauf = await dauertest(bestWorker.workers, opt.dauertestSek,
          s => setPhase({ t: 'dauertest', sekunde: s, von: opt.dauertestSek! }));
        if (verlauf.length >= 2) {
          const start = verlauf[0];
          const ende = verlauf[verlauf.length - 1];
          ergebnis.dauertest = {
            start, ende, verlauf,
            anteil: start > 0 ? ende / start : 1,
          };
        }
      }

      speichern(ergebnis);
      setPhase({ t: 'fertig', ergebnis });
      return ergebnis;
    } catch (e) {
      setPhase({ t: 'fehler', meldung: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }, [stufeMessen]);

  const dauertest = useCallback(async (
    n: number, sekunden: number, melde: (s: number) => void,
  ): Promise<number[]> => {
    const workers: Worker[] = [];
    const verlauf: number[] = [];
    try {
      for (let i = 0; i < n; i++) {
        workers.push(new Worker(new URL('../workers/bench.worker.ts', import.meta.url)));
      }
      await Promise.all(workers.map((w, i) => new Promise<void>((auf, ab) => {
        const zeit = setTimeout(() => ab(new Error('Worker antwortet nicht')), 15_000);
        w.onmessage = ev => {
          if (ev.data.t === 'ready') { clearTimeout(zeit); auf(); }
          if (ev.data.t === 'error') { clearTimeout(zeit); ab(new Error(ev.data.message)); }
        };
        w.postMessage({ t: 'init', slot: i, wasmUrl: MINER_WASM_URL });
      })));

      let hashes = 0, fenster = 0;
      for (const w of workers) {
        w.onmessage = ev => {
          if (ev.data.t !== 'progress') return;
          hashes += ev.data.hashes;
          fenster += ev.data.ms;
        };
        w.postMessage({ t: 'start', duty: 100 });
      }

      // In Schritten von fuenf Sekunden, damit der Verlauf sichtbar wird
      // und nicht nur Anfang und Ende.
      const schritte = Math.max(1, Math.round(sekunden / 5));
      for (let s = 1; s <= schritte; s++) {
        hashes = 0; fenster = 0;
        await new Promise(r => setTimeout(r, 5000));
        verlauf.push(fenster > 0 ? (hashes * 1000 * n) / fenster : 0);
        melde(s * 5);
        if (abbruch.current) break;
      }
      return verlauf;
    } finally {
      for (const w of workers) { try { w.postMessage({ t: 'stop' }); w.terminate(); } catch { /* egal */ } }
    }
  }, []);

  const abbrechen = useCallback(() => { abbruch.current = true; }, []);
  const zuruecksetzen = useCallback(() => setPhase({ t: 'aus' }), []);

  return { phase, starten, abbrechen, zuruecksetzen };
}
