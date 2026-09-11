'use client';

/**
 * Share-Diagramm.
 *
 * Jeder Balken ist EIN Versuch, kein Zeitfenster. Seine Hoehe ist die
 * tatsaechlich erreichte Difficulty im Verhaeltnis zur Network Difficulty.
 * Ein Balken, der die Linie reisst, IST ein Block -- das ist keine Metapher,
 * sondern genau die Bedingung.
 *
 * FESTE SKALA. Frueher wuchs die Obergrenze mit dem hoechsten Treffer, damit
 * man sah, wie weit er das Ziel ueberragte. Das war ein Denkfehler: Ein
 * Block mit 522 % drueckte alle gewoehnlichen Balken auf ein bis zwei Pixel,
 * und der haeufige Fall wurde unlesbar -- gerade der, den man staendig
 * anschaut. Die genaue Zahl steht ohnehin am Balken; dafuer muss die Skala
 * nicht herhalten.
 *
 * Balken jenseits der Obergrenze werden gekappt und oben mit einer Kerbe
 * gekennzeichnet. Sie sind dann alle gleich hoch, und der Prozentwert sagt,
 * wie hoch wirklich.
 *
 * FESTE BREITE. Alle Plaetze werden immer gezeichnet, auch die leeren. Sonst
 * begaennen die Balken breit und wuerden mit jedem Share schmaler -- eine
 * Bewegung, die nichts bedeutet und trotzdem auffaellt.
 *
 * Warum linear und nicht logarithmisch: Die erreichte Difficulty ist
 * pareto-verteilt -- der halbe Wert kommt doppelt so oft vor. Linear liegen
 * die meisten Balken unten, einzelne ragen hinauf, und ganz selten reisst
 * einer die Linie. Eine logarithmische Achse wuerde jeden Versuch
 * schmeichelhaft nah aussehen lassen.
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

/** So viele Balken passen nebeneinander. */
export const MAX_SHARES = 44;

const HOEHE = 112;      // gesamte Zeichenflaeche
const KOPF = 26;        // oben frei fuer Rakete und Prozentwert
const NUTZ = HOEHE - KOPF;
const LUFT = 1.15;      // Obergrenze = Network Difficulty mal diesem Wert

export default function ShareChart({ shares, active }: {
  shares: ShareEntry[]; active: boolean;
}) {
  const sichtbar = shares.slice(-MAX_SHARES);
  const leer = sichtbar.length === 0;

  /*
    Bezugsgroesse ist die AKTUELLE Network Difficulty -- die des letzten
    Versuchs, nicht das Maximum der sichtbaren.

    Am Maximum verankert hatte dieselbe Krankheit wie die alte, mitwachsende
    Skala: Faellt die Difficulty stark, bleibt die Obergrenze am alten
    Hoechstwert haengen, bis er aus dem Fenster gewandert ist. Die Linie
    rutschte dabei auf ein Achtel der Hoehe und die gewoehnlichen Balken auf
    ein bis zwei Pixel -- fuer bis zu 44 Versuche lang.

    Am aktuellen Wert verankert liegt die juengste Stufe der Linie IMMER bei
    rund 87 % der Hoehe. Das ist der feste Bezugspunkt, den das Auge braucht.
    Aeltere Stufen liegen darueber oder darunter und zeigen damit genau das,
    was passiert ist: dass sich das Ziel bewegt hat.
  */
  const ziel = Math.max(1, sichtbar[sichtbar.length - 1]?.blockDifficulty ?? 1);
  const obergrenze = ziel * LUFT;
  const y = (wert: number) => Math.min(NUTZ, (wert / obergrenze) * NUTZ);

  // Gestufte Linie: je Versuch ein waagerechtes Stueck auf Hoehe seiner
  // Difficulty, dazwischen der Sprung. Sie liegt ueber den Balken, damit der
  // Bezug sichtbar bleibt, auch wenn ein Balken sie durchbricht.
  const punkte: string[] = [];
  sichtbar.forEach((s, i) => {
    const yPos = HOEHE - y(s.blockDifficulty || ziel);
    punkte.push(`${i},${yPos}`, `${i + 1},${yPos}`);
  });

  return (
    <section className="mt-1" aria-label="Erreichte Difficulty je Versuch">
      <div className="mb-2 flex items-baseline justify-between text-xs text-dim">
        <span>Erreichte Difficulty je Share</span>
        <span className="tnum">
          {leer ? '—' : `${sichtbar.length} Versuche · Ziel ${ziel.toLocaleString('de-DE')}`}
        </span>
      </div>

      <div className="relative" style={{ height: HOEHE }} aria-hidden="true">
        {leer ? (
          <p className="absolute inset-0 flex items-center text-xs text-dim">
            {active ? 'Warte auf den ersten Share…' : 'Noch keine Versuche.'}
          </p>
        ) : (
          <>
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {/*
                Immer MAX_SHARES Plaetze. Belegte zuerst, danach leere -- so
                fuellt sich das Bild von links, ohne dass sich die Breite je
                aendert.
              */}
              {Array.from({ length: MAX_SHARES }, (_, i) => {
                const s = sichtbar[i];
                if (!s) {
                  return <div key={`leer-${i}`} className="flex-1"
                              style={{ height: HOEHE }} />;
                }

                const anteil = s.blockDifficulty > 0
                  ? s.achieved / s.blockDifficulty : 0;
                const prozent = Math.round(anteil * 100);
                const roh = y(s.achieved);
                const hoehe = Math.max(2, roh);
                const gekappt = s.achieved > obergrenze;

                const farbe = s.isBlock ? 'bg-work'
                  : s.accepted ? 'bg-dim/75' : 'bg-dim/25';

                return (
                  <div key={`${s.at}-${i}`} className="relative flex-1"
                       style={{ height: HOEHE }}>
                    {s.isBlock && (
                      <>
                        <span className="absolute left-1/2 -translate-x-1/2 text-work"
                              style={{ bottom: Math.min(hoehe + 15, NUTZ + 12) }}>
                          <Rakete />
                        </span>
                        <span className="tnum absolute left-1/2 -translate-x-1/2
                                         whitespace-nowrap text-[10px] font-medium text-work"
                              style={{ bottom: Math.min(hoehe + 2, NUTZ) }}>
                          {prozent}%
                        </span>
                      </>
                    )}
                    <div
                      className={`absolute bottom-0 w-full rounded-[1px] ${farbe}`}
                      style={{
                        height: hoehe,
                        // Kerbe oben: Der Balken ist abgeschnitten, sein
                        // wahrer Wert steht daneben.
                        clipPath: gekappt
                          ? 'polygon(0 0, 35% 6px, 65% 0, 100% 6px, 100% 100%, 0 100%)'
                          : undefined,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${MAX_SHARES} ${HOEHE}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={punkte.join(' ')}
                fill="none" stroke="rgb(var(--text))" strokeWidth="1"
                vectorEffect="non-scaling-stroke" opacity="0.85"
              />
            </svg>
          </>
        )}
      </div>

      {/*
        Die Linie wird in der Legende benannt statt im Bild. Beschriftet man
        sie dort, ueberdeckt sie genau die Prozentwerte der Bloecke -- und die
        stehen immer in ihrer Naehe.
      */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-dim">
        <Legende farbe="bg-dim/75">angenommen</Legende>
        <Legende farbe="bg-dim/25">ungültig</Legende>
        <Legende farbe="bg-work">Block</Legende>
        <span className="flex items-center gap-1.5">
          <span className="text-work"><Rakete /></span>
          Reward
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-3 bg-text" />
          Network Difficulty
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
