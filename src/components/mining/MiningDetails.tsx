'use client';

import { useT } from '@/i18n';
import { Flaeche, Abschnitt, Etikett, Segment, Fortschritt, Knopf } from '@/components/ys';
import { SeitenKopf } from '@/components/ys/SeitenKopf';
import { Hash } from '@/components/ui/Primitives';
import ShareChart from '@/components/ShareChart';
import type { useMining } from '@/hooks/useMining';
import type { PoolAuswahl } from '@/hooks/usePoolAuswahl';
import type { BenchErgebnis } from '@/hooks/useBenchmark';

type Mining = ReturnType<typeof useMining>;

/**
 * Mining-Details (Ebene 2, Paket 3).
 *
 * Alles, was fuer den Start nicht noetig ist, aber zeigt, dass das Telefon
 * wirklich rechnet: Weg zum Block, die letzten Shares als Kette (aus
 * Konzept B), das Share-Diagramm, der letzte Hash, die Aktivitaet. Darunter
 * die Einstellungen, die vorher im Blatt "Erweitert" lagen: Modus und
 * Worker (nur aenderbar, solange das Mining steht) und der Benchmark.
 *
 * Die Last steht NICHT hier -- sie gibt es nur einmal, auf der Hauptansicht.
 */
export default function MiningDetails({ m, pool, worker, setWorker, kerne, workerStufen, bench, onBenchmark, onZurueck }: {
  m: Mining; pool: PoolAuswahl;
  worker: number; setWorker: (v: number) => void;
  kerne: number | null; workerStufen: number[];
  bench: BenchErgebnis | null;
  onBenchmark: () => void; onZurueck: () => void;
}) {
  const { t, zahl, locale } = useT();
  const y = t.ys.mining;

  // Fortschritt zum Ziel: bester Share der Sitzung gegen die Block-Difficulty.
  const bester = m.shares.reduce((b, s) => Math.max(b, s.achieved), 0);
  const blockDiff = m.summary?.difficulty ?? 0;
  const zumZiel = blockDiff > 0 ? Math.min(1, bester / blockDiff) : 0;
  const prozent = `${zahl(zumZiel * 100, { maximumFractionDigits: zumZiel < 0.01 ? 2 : 1 })} %`;
  const kette = m.shares.slice(-5);
  const aktiv = [...m.shares].slice(-4).reverse();
  const kompakt = (n: number) => zahl(n, { notation: 'compact', maximumFractionDigits: 1 });

  return (
    <>
      <SeitenKopf titel={y.details} onZurueck={onZurueck} />

      <div className="flex flex-col gap-4">
        <Flaeche className="flex flex-col gap-3 p-4">
          <Abschnitt titel={y.wegZumBlock} rechts={t.mining.bloecke(m.account?.blocksFound ?? 0)} />
          <p className="text-ys-fliess">{y.besterShare(prozent)}</p>
          <Fortschritt anteil={zumZiel} label={y.wegZumBlock} verlauf />
          {blockDiff > 0 && <p className="text-ys-meta text-dim">{y.blockziel(zahl(blockDiff))}</p>}
        </Flaeche>

        <Flaeche className="flex flex-col gap-3 p-4">
          <Abschnitt titel={y.letzteShares} rechts={y.angenommen(zahl(m.sharesZahl))} />
          {kette.length > 0 && (
            <ol aria-label={y.letzteShares} className="flex items-center overflow-x-auto [scrollbar-width:none]">
              {kette.map((s, i) => {
                const neu = i === kette.length - 1;
                return (
                  <li key={s.at + '-' + i} className="flex shrink-0 items-center">
                    {i > 0 && <span aria-hidden="true" className="h-px w-2 bg-[rgb(var(--haar)/.35)]" />}
                    <span className={`tnum rounded-sm border px-2.5 py-2 font-mono text-ys-meta ${
                      s.isBlock ? 'border-proof text-proof'
                      : !s.accepted ? 'border-risk/50 text-risk'
                      : neu ? 'border-cyan text-cyan' : 'border-[rgb(var(--haar)/.16)] bg-raised text-dim'}`}>
                      {kompakt(s.achieved)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <ShareChart shares={m.shares} active={m.mining} />
          {m.lastShare && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Etikett>{t.mining.letzterShare}</Etikett>
                <span className="text-ys-meta text-dim">{t.mining.difficulty(zahl(Number(m.lastShare.difficulty)))}</span>
              </div>
              <Hash value={m.lastShare.hash} className="text-ys-meta leading-[1.7]" />
            </div>
          )}
        </Flaeche>

        <section aria-label={t.mining.aktivitaet}>
          <Abschnitt titel={t.mining.aktivitaet} />
          {aktiv.length === 0 ? (
            <p className="py-3 text-ys-klein text-dim">{t.mining.nochKeine}</p>
          ) : (
            <ul>
              {aktiv.map((sh, i) => (
                <li key={sh.at + '-' + i} className="flex min-h-[52px] items-center gap-3 border-t border-[rgb(var(--haar)/.12)] py-2">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${sh.isBlock ? 'bg-proof' : sh.accepted ? 'bg-work' : 'bg-risk'}`} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-ys-fliess">{sh.isBlock ? t.fund.titel : sh.accepted ? t.mining.shareAngenommen : y.abgelehnt}</span>
                    <span className="text-ys-meta text-dim">
                      {t.mining.difficulty(zahl(Math.round(sh.achieved)))}{sh.achieved >= sh.required ? ` · ${t.mining.ueberZiel}` : ''}
                    </span>
                  </span>
                  <span className="tnum font-mono text-ys-meta text-dim">
                    {new Date(sh.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Flaeche className="flex flex-col gap-5 p-4">
          <Abschnitt titel={y.einstellungen} />
          <div className="flex flex-col gap-2">
            <span className="text-ys-fliess font-medium">{t.miningNeu.modus}</span>
            <Segment<'pool' | 'solo'> label={t.miningNeu.modus} wert={pool.modus} onChange={v => pool.setModus(v)}
                     werte={[{ v: 'pool', text: t.mining.pool }, { v: 'solo', text: t.mining.solo }]}
                     disabled={m.mining || pool.prueft} />
            <p className="text-ys-meta text-dim">{t.miningNeu.modusText}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-ys-fliess font-medium">
              {t.miningNeu.worker}{kerne && <span className="ml-1.5 font-normal text-dim">{t.miningNeu.vonKernen(kerne)}</span>}
            </span>
            <Segment label={t.miningNeu.worker} wert={worker} onChange={v => setWorker(v)}
                     werte={workerStufen.map(v => ({ v, text: String(v) }))} disabled={m.mining} />
            {!m.mining && (
              <Knopf art="leise" voll={false} groesse="mittel" onClick={onBenchmark} className="self-start !justify-start !px-0 text-left">
                {bench ? t.mining.kalibrierung(bench.besteWorker) : t.mining.kalibrieren}
              </Knopf>
            )}
          </div>
          {m.mining && <p className="text-ys-meta text-dim">{t.miningNeu.gesperrtBeimMinen}</p>}
        </Flaeche>


        {m.stumm && (
          <div className="rounded-sm bg-raised px-4 py-3">
            {Object.entries(m.etappen).map(([slot, e]) => (
              <p key={slot} className="font-mono text-ys-meta text-faint">{t.mining.workerZeile(slot, e)}</p>
            ))}
            {Object.keys(m.etappen).length === 0 && <p className="font-mono text-ys-meta text-faint">{t.mining.keineMeldung}</p>}
          </div>
        )}
      </div>
    </>
  );
}
