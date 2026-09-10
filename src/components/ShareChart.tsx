'use client';

/**
 * Share-Diagramm.
 *
 * Jeder Balken ist EIN Versuch, kein Zeitfenster. Seine Hoehe ist die
 * tatsaechlich erreichte Difficulty. Die Linie ist die Network Difficulty
 * zum Zeitpunkt des jeweiligen Versuchs -- sie ist gestuft, weil sie sich
 * mit jedem Block neu einstellt.
 *
 * Ein Balken, der die Linie erreicht, IST ein Block. Das ist keine Metapher,
 * sondern genau die Bedingung.
 *
 * Gemeinsame, absolute Skala fuer Balken UND Linie. Jeden Balken an seiner
 * eigenen Difficulty zu messen waere bequemer, wuerde die Linie aber flach
 * machen und damit die Aussage zerstoeren: Man saehe nicht mehr, dass das
 * Ziel selbst wandert.
 *
 * Warum linear und nicht logarithmisch: Die erreichte Difficulty ist
 * pareto-verteilt -- der halbe Wert kommt doppelt so oft vor. Linear liegen
 * die meisten Balken deshalb unten, einzelne ragen weit hinauf, und ganz
 * selten reisst einer die Linie. Eine logarithmische Achse wuerde jeden
 * Versuch schmeichelhaft nah aussehen lassen.
 */

export interface ShareEntry {
  /** Tatsaechlich erfuellte Difficulty dieses Hashes. */
  achieved: number;
  /** Was zu diesem Zeitpunkt verlangt war. */
  required: number;
  /** Network Difficulty zum Zeitpunkt des Versuchs. */
  blockDifficulty: number;
  accepted: boolean;
  isBlock: boolean;
  at: number;
}

export const MAX_SHARES = 44;

const HOEHE = 104;      // Zeichenflaeche in Pixeln
const KOPF = 18;        // Platz oben fuer Rakete und Prozentwert

export default function ShareChart({ shares, active }: {
  shares: ShareEntry[]; active: boolean;
}) {
  const sichtbar = shares.slice(-MAX_SHARES);
  const leer = sichtbar.length === 0;

  // Gemeinsame Obergrenze. Etwas Luft ueber der Difficulty, damit die Linie
  // nicht am Rand klebt -- und wenn ein Balken sie reisst, waechst die Skala
  // mit, statt den Treffer abzuschneiden.
  const maxDiff = Math.max(1, ...sichtbar.map(s => s.blockDifficulty));
  const maxErreicht = Math.max(0, ...sichtbar.map(s => s.achieved));
  const obergrenze = Math.max(maxDiff * 1.18, maxErreicht * 1.05);

  const y = (wert: number) => (wert / obergrenze) * (HOEHE - KOPF);

  // Gestufte Linie als Polylinie: je Versuch ein waagerechtes Stueck auf
  // Hoehe seiner Difficulty, dazwischen der senkrechte Sprung.
  const punkte: string[] = [];
  sichtbar.forEach((s, i) => {
    const yPos = HOEHE - y(s.blockDifficulty);
    punkte.push(`${i},${yPos}`, `${i + 1},${yPos}`);
  });

  return (
    <section className="mt-7" aria-label="Erreichte Difficulty je Versuch">
      <div className="mb-2 flex items-baseline justify-between text-xs text-dim">
        <span>Erreichte Difficulty je Share</span>
        <span className="tnum">
          {leer ? '—' : `${sichtbar.length} Versuche · Ziel ${maxDiff.toLocaleString('de-DE')}`}
        </span>
      </div>

      <div className="relative" style={{ height: HOEHE }} aria-hidden="true">
        {leer ? (
          <p className="absolute inset-0 flex items-center text-xs text-dim">
            {active ? 'Warte auf den ersten Share…' : 'Noch keine Versuche.'}
          </p>
        ) : (
          <>
            {/* Balken */}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {sichtbar.map((s, i) => {
                const hoehe = Math.max(2, y(s.achieved));
                const anteil = s.blockDifficulty > 0
                  ? Math.round((s.achieved / s.blockDifficulty) * 100) : 0;

                return (
                  <div key={`${s.at}-${i}`} className="relative flex-1" style={{ height: HOEHE }}>
                    {s.isBlock && (
                      <>
                        <span className="absolute left-1/2 -translate-x-1/2 text-work"
                              style={{ bottom: hoehe + 16 }}>
                          <Rakete />
                        </span>
                        <span className="tnum absolute left-1/2 -translate-x-1/2 whitespace-nowrap
                                         text-[10px] font-medium text-work"
                              style={{ bottom: hoehe + 2 }}>
                          {anteil}%
                        </span>
                      </>
                    )}
                    <div
                      className={`absolute bottom-0 w-full rounded-[1px] ${
                        s.isBlock ? 'bg-work' : s.accepted ? 'bg-dim/75' : 'bg-dim/25'}`}
                      style={{ height: hoehe }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Network Difficulty. Ueber den Balken, damit der Bezug sichtbar
                bleibt, auch wenn ein Balken sie durchbricht. */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${sichtbar.length} ${HOEHE}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={punkte.join(' ')}
                fill="none"
                stroke="rgb(var(--text))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.85"
              />
            </svg>
            <span className="absolute right-0 text-[10px] text-dim"
                  style={{ bottom: y(sichtbar[sichtbar.length - 1].blockDifficulty) + 4 }}>
              Network Difficulty
            </span>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-dim">
        <Legende farbe="bg-dim/75">angenommen</Legende>
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

function Rakete() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" role="img" aria-label="Block gefunden">
      <path d="M8 0.8c2.3 2 3.5 4.6 3.5 7.4l-1.7 1.7H6.2L4.5 8.2C4.5 5.4 5.7 2.8 8 0.8z"
            fill="currentColor" />
      <path d="M6.4 10.6 8 15.2l1.6-4.6z" fill="currentColor" opacity="0.55" />
      <circle cx="8" cy="6" r="1.15" fill="rgb(var(--ink))" />
    </svg>
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
