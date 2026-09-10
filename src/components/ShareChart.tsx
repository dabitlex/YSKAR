'use client';

/**
 * Share-Diagramm.
 *
 * Jeder Balken ist EIN Versuch, nicht ein Zeitfenster. Seine Hoehe ist die
 * tatsaechlich erreichte Difficulty im Verhaeltnis zur Block-Difficulty.
 * Damit beantwortet das Bild die Frage, die einen Miner wirklich
 * interessiert: Wie nah war ich dran?
 *
 * Die Linie ist die Block-Difficulty. Ein Balken, der sie erreicht, IST ein
 * Block -- das ist keine Metapher, sondern genau die Bedingung.
 *
 * Warum linear und nicht logarithmisch: Die erreichte Difficulty ist
 * pareto-verteilt. Der halbe Wert kommt doppelt so oft vor, das Zehnfache
 * ein Zehntel so oft. Linear liegen die meisten Balken deshalb im unteren
 * Fuenftel, einzelne ragen weit hinauf, und ganz selten reisst einer die
 * Linie. Genau dieses Bild entspricht der Wirklichkeit -- eine
 * logarithmische Achse wuerde jeden Versuch schmeichelhaft nah aussehen
 * lassen.
 */

export interface ShareEntry {
  /** Tatsaechlich erfuellte Difficulty dieses Hashes. */
  achieved: number;
  /** Was zu diesem Zeitpunkt verlangt war. */
  required: number;
  /** Block-Difficulty zum Zeitpunkt des Versuchs -- die Bezugsgroesse. */
  blockDifficulty: number;
  accepted: boolean;
  isBlock: boolean;
  at: number;
}

export const MAX_SHARES = 44;

const HOEHE = 96;      // Zeichenflaeche in Pixeln
const LINIE = 0.82;    // Block-Difficulty auf 82 % der Hoehe

function Rakete() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" role="img" aria-label="Block gefunden">
      <path d="M8 0.8c2.3 2 3.5 4.6 3.5 7.4l-1.7 1.7H6.2L4.5 8.2C4.5 5.4 5.7 2.8 8 0.8z"
            fill="currentColor" />
      <path d="M6.4 10.6 8 15.2l1.6-4.6z" fill="currentColor" opacity="0.55" />
      <circle cx="8" cy="6" r="1.15" fill="var(--ink)" />
    </svg>
  );
}

export default function ShareChart({ shares, active }: {
  shares: ShareEntry[]; active: boolean;
}) {
  const sichtbar = shares.slice(-MAX_SHARES);
  const leer = sichtbar.length === 0;

  return (
    <section className="mt-7" aria-label="Erreichte Difficulty je Versuch">
      <div className="mb-2 flex items-baseline justify-between text-xs text-dim">
        <span>Erreichte Difficulty je Share</span>
        <span className="tnum">
          {leer ? '—' : `${sichtbar.length} Versuche`}
        </span>
      </div>

      <div className="relative" style={{ height: HOEHE }} aria-hidden="true">
        {/* Block-Difficulty. Wer sie reisst, hat einen Block. */}
        <div
          className="absolute inset-x-0 border-t border-dashed border-dim/50"
          style={{ bottom: HOEHE * LINIE }}
        />
        <span
          className="absolute right-0 text-[10px] text-dim"
          style={{ bottom: HOEHE * LINIE + 3 }}
        >
          Block
        </span>

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {leer && (
            <p className="self-center text-xs text-dim">
              {active ? 'Warte auf den ersten Share…' : 'Noch keine Versuche.'}
            </p>
          )}

          {sichtbar.map((s, i) => {
            // Anteil an der Block-Difficulty. Ein Block erreicht die Linie.
            const anteil = s.blockDifficulty > 0 ? s.achieved / s.blockDifficulty : 0;
            const hoehe = Math.max(2, Math.min(1, anteil) * HOEHE * LINIE);
            const prozent = Math.round(anteil * 100);

            const farbe = s.isBlock ? 'bg-work'
              : s.accepted ? 'bg-dim/70'
              : 'bg-dim/25';

            return (
              <div key={s.at + '-' + i} className="relative flex-1"
                   style={{ height: HOEHE }}>
                {s.isBlock && (
                  <>
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-work"
                      style={{ bottom: HOEHE * LINIE + 16 }}
                    >
                      <Rakete />
                    </span>
                    <span
                      className="tnum absolute left-1/2 -translate-x-1/2 whitespace-nowrap
                                 text-[10px] font-medium text-work"
                      style={{ bottom: HOEHE * LINIE + 2 }}
                    >
                      {prozent}%
                    </span>
                  </>
                )}
                <div
                  className={`absolute bottom-0 w-full rounded-[1px] ${farbe}`}
                  style={{ height: hoehe }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Legende kurz und in derselben Sprache wie die Balken. Wer sie einmal
        liest, versteht das Bild dauerhaft.
      */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-dim">
        <Legende farbe="bg-dim/70">angenommen</Legende>
        <Legende farbe="bg-dim/25">ungültig</Legende>
        <Legende farbe="bg-work">Block</Legende>
        <span className="flex items-center gap-1.5">
          <span className="text-work"><Rakete /></span>
          Reward
        </span>
      </div>
    </section>
  );
}

function Legende({ farbe, children }: { farbe: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2 rounded-[1px] ${farbe}`} />
      {children}
    </span>
  );
}
