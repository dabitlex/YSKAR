'use client';

/**
 * Das Ufer -- die Buehne des Minen-Reiters ("Erstes Licht").
 *
 * Der Fjord der Website, am fernen Ufer ein Licht je aktivem Miner. Echt ist
 * die ZAHL der Lichter (activeMiners aus dem Netzstand); WO ein Licht steht,
 * ist Inszenierung: eine feste Zufallsfolge, damit die Lichter nicht bei
 * jedem Zeichnen springen. Das eigene Licht steht immer an derselben Stelle.
 * Rechnet das Telefon, brennt es warm und groesser; mit jedem angenommenen
 * Share laeuft ein Ring von ihm aus. Steht das Mining, ist dort ein leerer
 * Ring: der eigene Platz.
 */

const MEIN_X = 0.63;
/** Lose Gruppen wie Haeuser an einem Ufer, nicht wie eine Kette. */
const GRUPPEN = [0.13, 0.27, 0.36, 0.5, 0.58, 0.74, 0.86];
const HOECHSTENS = 60;

function folge(saat: number) {
  let s = saat;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** Die Uferlinie liegt an den Raendern etwas tiefer als in der Mitte. */
const dy = (x: number) => Math.abs(x - 0.5) * 2 * 8;

const LICHTER = (() => {
  const r = folge(7);
  const liste: { x: number; dy: number; g: number; o: number }[] = [];
  while (liste.length < HOECHSTENS) {
    const c = GRUPPEN[Math.floor(r() * GRUPPEN.length)];
    const x = r() < 0.3 ? 0.06 + 0.88 * r() : c + (r() - 0.5) * 0.1;
    const wackeln = (r() - 0.5) * 3, g = r() < 0.22 ? 3.4 : 2.4, o = 0.62 + r() * 0.38;
    if (Math.abs(x - MEIN_X) < 0.035) continue;
    liste.push({ x, dy: dy(x) + wackeln, g, o });
  }
  return liste;
})();

export default function Ufer({ lichter, mein, schild, share = 0 }: {
  /** Aktive Miner im Netz, das eigene Telefon mitgezaehlt, wenn es rechnet. */
  lichter: number;
  /** 'an' = das eigene Licht brennt, 'aus' = der eigene Platz ist leer, null = ohne eigenes Licht. */
  mein: 'an' | 'aus' | null;
  /** Wort am eigenen Licht ("Dein Licht" / "Dein Platz"). */
  schild?: string;
  /** Zahl der angenommenen Shares: Jede Aenderung laesst einen Ring vom eigenen Licht ausgehen. */
  share?: number;
}) {
  const andere = Math.max(0, Math.min(HOECHSTENS, lichter - (mein === 'an' ? 1 : 0)));
  const meinDy = dy(MEIN_X) + 1;
  return (
    <>
      <div className="ufer" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/buehne/fjord-nacht.webp" alt="" width={1152} height={2048} decoding="async" />
        {LICHTER.slice(0, andere).map((l, i) => (
          <i key={i} className="ufer-licht" style={{ left: `${l.x * 100}%`, opacity: l.o, ['--g' as string]: `${l.g}px`, ['--dy' as string]: `${l.dy}px` }} />
        ))}
        {mein === 'an' && <>
          {share > 0 && <i key={share} className="ufer-ring" style={{ left: `${MEIN_X * 100}%`, ['--dy' as string]: `${meinDy}px` }} />}
          <i className="ufer-licht mein" style={{ left: `${MEIN_X * 100}%`, ['--g' as string]: '6.5px', ['--dy' as string]: `${meinDy}px` }} />
        </>}
        {mein === 'aus' && <i className="ufer-platz" style={{ left: `${MEIN_X * 100}%`, ['--dy' as string]: `${meinDy}px` }} />}
      </div>
      {mein && schild && (
        <span className="ufer-schild" style={{ left: `${MEIN_X * 100}%`, ['--dy' as string]: `${meinDy}px` }}>{schild}</span>
      )}
    </>
  );
}
