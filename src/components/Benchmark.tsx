'use client';
import { useState } from 'react';
import { hashrateText } from '@/lib/format/hashrate';
import { GroupTitle } from '@/components/ui/Primitives';
import { Flaeche, Knopf } from '@/components/ys';
import { SeitenKopf } from '@/components/ys/SeitenKopf';
import {
  useBenchmark, gespeichert, verwerfen, type BenchErgebnis, type Messung,
} from '@/hooks/useBenchmark';
import { useT, type Woerterbuch } from '@/i18n';

/**
 * Gerätekalibrierung.
 *
 * Misst die tatsächliche Hashrate für mehrere Workerzahlen und
 * Intensitäten. Gerechnet wird über dieselbe WASM-Engine wie beim Mining,
 * und vorher läuft der Known-Answer-Test — stimmt der Genesis-Hash nicht,
 * bricht der Benchmark ab, statt eine Zahl zu zeigen.
 */

function rate(h: number, locale?: string): string {
  if (!h || !Number.isFinite(h)) return '—';
  return hashrateText(h, locale);
}

export default function Benchmark({ onZurueck, onUebernehmen, onErgebnis }: {
  onZurueck: () => void;
  onUebernehmen: (worker: number) => void;
  onErgebnis: (e: BenchErgebnis | null) => void;
}) {
  const { phase, starten, abbrechen } = useBenchmark();
  const [alt] = useState<BenchErgebnis | null>(() => gespeichert());
  const [dauertest, setDauertest] = useState(false);
  const { t, locale } = useT();

  const laeuft = phase.t === 'pruefe' || phase.t === 'messe' || phase.t === 'dauertest';
  const ergebnis = phase.t === 'fertig' ? phase.ergebnis : alt;

  const kerne = typeof navigator !== 'undefined'
    ? (navigator.hardwareConcurrency || null) : null;

  return (
    <>
      <SeitenKopf titel={t.ys.mining.benchmark} onZurueck={onZurueck} />

      <GroupTitle>{t.bench.geraet}</GroupTitle>
      <Flaeche className="mb-5 p-4">
        <dl className="grid gap-0">
          <Zeile label={t.bench.prozessoren} wert={kerne ? String(kerne) : t.bench.nichtErmittelbar} />
          <Zeile label={t.bench.engine} wert="WebAssembly SHA-256" />
          <Zeile label={t.bench.plattform}
                 wert={typeof navigator !== 'undefined' ? kurzePlattform(t.bench.unbekannt) : '—'} />
        </dl>
        {!kerne && (
          <p className="mt-3 text-[12px] text-faint">{t.bench.keineKerne}</p>
        )}
      </Flaeche>

      {/* ---------------------------------------------------------- Lauf */}
      {laeuft && (
        <Flaeche className="mb-5 p-4">
          <p className="mb-3 text-[13px] text-dim">
            {phase.t === 'pruefe' && t.bench.prueft}
            {phase.t === 'messe' && t.bench.messe(phase.workers, phase.duty, phase.schritt, phase.von)}
            {phase.t === 'dauertest' && t.bench.dauertestLauf(phase.sekunde, phase.von)}
          </p>
          <div className="bar"><i style={{ width: fortschritt(phase) }} /></div>
          <p className="mt-3 text-[12px] text-faint">{t.bench.warm}</p>
          <Knopf art="zweit" groesse="mittel" onClick={abbrechen} className="mt-4">{t.allgemein.abbrechen}</Knopf>
        </Flaeche>
      )}

      {/* --------------------------------------------------------- Fehler */}
      {phase.t === 'fehler' && (
        <Flaeche className="mb-5 p-4">
          <p className="mb-2 text-[13px] text-risk">{t.bench.abgebrochen}</p>
          <p className="text-[12.5px] text-dim">{phase.meldung}</p>
          <p className="mt-3 text-[12px] text-faint">{t.bench.keineZahl}</p>
        </Flaeche>
      )}

      {/* -------------------------------------------------------- Ergebnis */}
      {ergebnis && !laeuft && (
        <>
          <GroupTitle>{t.bench.messung}</GroupTitle>
          <Flaeche className="mb-5 p-4">
            <div className="mb-1 grid grid-cols-[auto_1fr_auto] gap-x-3 text-[11px]
                            text-faint">
              <span>{t.bench.worker}</span><span>{t.bench.hashrate}</span><span>{t.bench.skalierung}</span>
            </div>
            <div className="mono grid gap-0">
              {ergebnis.messungen.filter(x => x.duty === 100).map(x => (
                <MessZeile key={`w${x.workers}`} m={x}
                           best={x.workers === ergebnis.besteWorker} />
              ))}
            </div>

            {ergebnis.messungen.some(x => x.duty !== 100) && (
              <>
                <p className="mb-1 mt-4 text-[11px] text-faint">
                  {t.bench.anteilBei(ergebnis.besteWorker)}
                </p>
                <div className="mono grid gap-0">
                  {ergebnis.messungen.filter(x => x.duty !== 100).map(x => (
                    <div key={`d${x.duty}`}
                         className="flex justify-between border-b border-line/50 py-1.5
                                    text-[13px] last:border-0">
                      <span className="text-dim">{x.duty} %</span>
                      <span>{rate(x.hashrate, locale)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Flaeche>

          <GroupTitle>{t.bench.empfehlung}</GroupTitle>
          <Flaeche className="mb-5 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[26px] font-medium tracking-tight">
                {t.bench.workerN(ergebnis.besteWorker)}
              </span>
              <span className="mono text-[15px] text-work">{rate(ergebnis.besteRate, locale)}</span>
            </div>
            <p className="mt-2 text-[12.5px] text-dim">
              {hinweis(ergebnis, t)}
            </p>
            <Knopf className="mt-4"
                   onClick={() => { onErgebnis(ergebnis); onUebernehmen(ergebnis.besteWorker); }}>
              {t.bench.uebernehmen}
            </Knopf>
          </Flaeche>

          {ergebnis.dauertest && (
            <>
              <GroupTitle>{t.bench.dauertest}</GroupTitle>
              <Flaeche className="mb-5 p-4">
                <dl className="grid gap-0">
                  <Zeile label={t.bench.start} wert={rate(ergebnis.dauertest.start, locale)} />
                  <Zeile label={t.bench.ende} wert={rate(ergebnis.dauertest.ende, locale)} />
                  <Zeile label={t.bench.gehalten}
                         wert={`${(ergebnis.dauertest.anteil * 100).toFixed(1)} %`} />
                </dl>
                <p className="mt-3 text-[12px] text-faint">
                  {ergebnis.dauertest.anteil < 0.9 ? t.bench.gesunken : t.bench.stabil}
                </p>
              </Flaeche>
            </>
          )}
        </>
      )}

      {/* ----------------------------------------------------------- Start */}
      {!laeuft && (
        <Flaeche className="p-4">
          <label className="mb-4 flex min-h-11 items-center justify-between">
            <span className="text-[13px] text-dim">{t.bench.dauertestAn}</span>
            <input type="checkbox" checked={dauertest}
                   onChange={e => setDauertest(e.target.checked)}
                   className="h-5 w-5 accent-[rgb(var(--work))]" />
          </label>
          <Knopf art={ergebnis ? 'zweit' : 'haupt'} onClick={() => starten({ dauertestSek: dauertest ? 60 : 0 })}>
            {ergebnis ? t.bench.erneut : t.bench.starten}
          </Knopf>
          <p className="mt-3 text-center text-[12px] text-faint">
            {dauertest ? t.bench.zweiMin : t.bench.sekunden}
          </p>
          {ergebnis && (
            <Knopf art="leise" groesse="mittel" className="mt-2"
                   onClick={() => { verwerfen(); onErgebnis(null); onZurueck(); }}>
              {t.bench.verwerfen}
            </Knopf>
          )}
        </Flaeche>
      )}
    </>
  );
}

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/50
                    py-2.5 last:border-0">
      <dt className="text-[13px] text-dim">{label}</dt>
      <dd className="mono text-[13.5px]">{wert}</dd>
    </div>
  );
}

function MessZeile({ m, best }: { m: Messung; best: boolean }) {
  const { locale } = useT();
  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3
                     border-b border-line/50 py-1.5 text-[13px] last:border-0 ${
                   best ? 'text-work' : ''}`}>
      <span className="w-10 tabular-nums">{m.workers}</span>
      <span className="tabular-nums">{rate(m.hashrate, locale)}</span>
      <span className="tabular-nums text-faint">{m.skalierung.toFixed(2)}×</span>
    </div>
  );
}

function fortschritt(p: { t: string; schritt?: number; von?: number;
                          sekunde?: number }): string {
  if (p.t === 'pruefe') return '4%';
  if (p.t === 'messe' && p.schritt && p.von) {
    return `${Math.round((p.schritt / p.von) * 100)}%`;
  }
  if (p.t === 'dauertest' && p.sekunde && p.von) {
    return `${Math.round((p.sekunde / p.von) * 100)}%`;
  }
  return '0%';
}

/**
 * Was die Messung bedeutet.
 *
 * Bewusst zurückhaltend: Warum ein Gerät schlecht skaliert, lässt sich aus
 * dem Browser heraus nicht feststellen. Behauptet wird deshalb nur, was in
 * den Zahlen steht.
 */
function hinweis(e: BenchErgebnis, t: Woerterbuch): string {
  const beste = e.messungen.filter(x => x.duty === 100)
    .find(x => x.workers === e.besteWorker);
  const max = Math.max(...e.messungen.filter(x => x.duty === 100).map(x => x.workers));

  if (beste && e.kerne && e.besteWorker < e.kerne) {
    return t.bench.h1(e.besteWorker, e.kerne);
  }
  if (beste && beste.skalierung < max * 0.6) return t.bench.h2;
  return t.bench.h3;
}

function kurzePlattform(unbekannt: string): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return unbekannt;
}
