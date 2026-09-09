'use client';

/**
 * Leistungsstreifen -- ein Balken je 30 Sekunden.
 *
 * Quelle ist der gemeldete Nonce-Fortschritt der Worker, also tatsaechlich
 * gerechnete Hashes. Das ist eine LOKALE Messung deines Geraets, keine
 * serverseitig verifizierte Groesse. Die belohnungsrelevanten Zahlen stehen
 * darueber und kommen aus validierten Shares.
 *
 * Warum nicht die Shares selbst als Balken: Bei einem Share alle 30 Sekunden
 * waere jeder Balken 0 oder 1. Das zeigt die Streuung des Zufalls, nicht die
 * Leistung des Geraets.
 *
 * Die Marker unter den Balken zeigen, in welchem Fenster ein Share vom Server
 * angenommen wurde -- so sieht man, ob geleistete Arbeit auch ankommt.
 */

import { BUCKET_MS, MAX_BARS, type BlockMark } from '@/lib/strip';

interface Props {
  /** Hashes je 30-Sekunden-Fenster, aeltestes zuerst. */
  samples: number[];
  /** Angenommene Shares je Fenster, gleiche Laenge wie samples. */
  shares: number[];
  /** Blockfunde je Fenster. Eigene Funde verdraengen fremde. */
  blocks: BlockMark[];
  /** Laeuft gerade eine Messung? Der letzte Balken ist dann unvollstaendig. */
  active: boolean;
}

/**
 * Rakete fuer den eigenen Blockfund. Bewusst als SVG und nicht als Emoji:
 * Emojis werden auf Android und iOS voellig unterschiedlich gezeichnet, und
 * bei 13 Pixeln faellt das sofort auf.
 */
function Rocket() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" role="img" aria-label="Block gefunden">
      <path d="M8 0.8c2.3 2 3.5 4.6 3.5 7.4l-1.7 1.7H6.2L4.5 8.2C4.5 5.4 5.7 2.8 8 0.8z"
            fill="currentColor" />
      <path d="M6.4 10.6 8 15.2l1.6-4.6z" fill="currentColor" opacity="0.55" />
      <circle cx="8" cy="6" r="1.15" fill="var(--ink)" />
    </svg>
  );
}

function formatRate(hps: number): string {
  if (hps >= 1e6) return `${(hps / 1e6).toFixed(2)} MH/s`;
  if (hps >= 1e3) return `${(hps / 1e3).toFixed(1)} kH/s`;
  return `${Math.round(hps)} H/s`;
}

function median(values: number[]): number {
  const clean = values.filter(v => v > 0).sort((a, b) => a - b);
  if (clean.length === 0) return 0;
  return clean[Math.floor(clean.length / 2)];
}

export default function PerformanceStrip({ samples, shares, blocks, active }: Props) {
  const peak = Math.max(...samples, 1);
  const mid = median(samples);
  const bars = Array.from({ length: MAX_BARS }, (_, i) => {
    const offset = i - (MAX_BARS - samples.length);
    return offset >= 0 ? samples[offset] : null;
  });

  return (
    <section className="mt-7" aria-label="Leistungsverlauf">
      <div className="mb-2 flex items-baseline justify-between text-xs text-dim">
        <span>Rechenleistung, je Balken 30 s</span>
        <span className="tabular-nums">
          {mid > 0 ? `Median ${formatRate(mid / (BUCKET_MS / 1000))}` : '—'}
        </span>
      </div>

      {/* Blockfunde ueber den Balken */}
      <div className="flex h-[18px] items-end gap-[3px]" aria-hidden="true">
        {bars.map((_, i) => {
          const offset = i - (MAX_BARS - blocks.length);
          const mark = offset >= 0 ? blocks[offset] : null;
          const isNewest = i === MAX_BARS - 1;
          return (
            <span key={i} className="flex flex-1 items-end justify-center">
              {mark === 'own' ? (
                <span
                  className={`text-proof ${
                    isNewest ? 'motion-safe:animate-[liftoff_600ms_ease-out]' : ''
                  }`}
                >
                  <Rocket />
                </span>
              ) : mark === 'other' ? (
                // Fremder Fund: nur ein feiner Strich. Bei 10-Minuten-Bloecken
                // liegt sonst auf jedem zweiten Streifen eine Rakete und der
                // eigene Treffer geht darin unter.
                <span className="block h-2 w-px bg-dim/50" />
              ) : null}
            </span>
          );
        })}
      </div>

      <div className="flex h-16 items-end gap-[3px]" aria-hidden="true">
        {bars.map((value, i) => {
          const isCurrent = active && i === MAX_BARS - 1 && value !== null;
          // Ein Einbruch von mehr als einem Viertel gegenüber dem Median ist
          // der sichtbare Hinweis auf Drosselung.
          const weak = value !== null && mid > 0 && value < mid * 0.75;
          const height = value === null ? 2 : Math.max(2, (value / peak) * 64);

          return (
            <i
              key={i}
              className={[
                'flex-1 rounded-sm transition-[height,background-color] duration-200 motion-reduce:transition-none',
                value === null ? 'bg-line/60'
                  : isCurrent ? 'bg-work/40'
                  : weak ? 'bg-risk'
                  : 'bg-work',
              ].join(' ')}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>

      {/* Marker: in welchem Fenster wurde ein Share angenommen */}
      <div className="mt-1 flex gap-[3px]" aria-hidden="true">
        {bars.map((_, i) => {
          const offset = i - (MAX_BARS - shares.length);
          const count = offset >= 0 ? (shares[offset] ?? 0) : 0;
          return (
            <span key={i} className="flex flex-1 justify-center">
              <span
                className={`block h-1 w-1 rounded-full ${
                  count > 0 ? 'bg-work' : 'bg-transparent'
                }`}
              />
            </span>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-dim">
        {samples.length === 0
          ? 'Noch keine Messwerte.'
          : `Spitze ${formatRate(peak / (BUCKET_MS / 1000))}. Punkte zeigen angenommene Shares, die Rakete deinen Block.`}
      </p>
    </section>
  );
}
