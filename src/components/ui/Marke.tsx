'use client';

/**
 * Die Marke und die Bilder des Redesigns (Oktober 2026).
 *
 *  - Zeichen: das Y aus drei Baendern (public/marke/zeichen.svg), wie auf
 *    yskar.app und in der YSKAR Wallet. Der Kristall ist das alte Logo.
 *  - Muenze: dunkle Scheibe, blauer Ring, das Zeichen -- nur auf dem Einstieg
 *    und der Community, als 3D-Muenze, die sich um die eigene Achse dreht.
 *  - Boerse: die schlanke Geldboerse fuer "Wallet erstellen" und die
 *    Popups, wenn ein Block gefunden wurde.
 *  - Schild: Sicherheit ("Gut zu wissen").
 *
 * Alles ohne Bilddateien ausser dem Zeichen: SVG und CSS, damit es scharf
 * bleibt und nichts nachlaedt.
 */

const ZEICHEN = '/marke/zeichen.svg';

export function Zeichen({ g = 32, className = '' }: { g?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ZEICHEN} alt="" width={g} height={g} className={`block shrink-0 ${className}`} style={{ width: g, height: g }} />;
}

/** Flache Muenze. */
export function Muenze({ d = 84 }: { d?: number }) {
  return (
    <div className="muenze" style={{ ['--d' as string]: `${d}px` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ZEICHEN} alt="" />
    </div>
  );
}

/**
 * Muenze in 3D: Rand aus duennen Lagen, Vorder- und Rueckseite, Glanz.
 * `schnell` dreht sie durchgehend (fallende Muenzen in den Popups).
 */
export function Muenze3D({ d = 150, schnell = false }: { d?: number; schnell?: boolean }) {
  const dicke = Math.max(2, Math.round(d * 0.068));
  const lagen = [];
  for (let z = 0; z <= dicke * 2; z++) {
    lagen.push(<i key={z} style={{ transform: `translateZ(${(z / 2 - dicke / 2).toFixed(1)}px)` }} />);
  }
  const h = dicke / 2;
  return (
    <div className={`m3d ${schnell ? 'schnell' : ''}`} style={{ ['--d' as string]: `${d}px` }} role="img" aria-label="YSKAR">
      {lagen}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="muenze" style={{ transform: `translateZ(${h}px)` }}><img src={ZEICHEN} alt="" /></div>
      <div className="glanz" style={{ transform: `translateZ(${h + 0.2}px)` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="muenze" style={{ transform: `rotateY(180deg) translateZ(${h}px)` }}><img src={ZEICHEN} alt="" /></div>
    </div>
  );
}

/**
 * Die schlanke Boerse. `muenzen` faellt hinein (Anzahl), sonst ruht sie.
 * Die Boerse federt bei jeder Muenze leicht nach.
 */
export function Boerse({ muenzen = 0, breite = 220 }: { muenzen?: number; breite?: number }) {
  const s = breite / 220;
  const fall = [50, 36, 62, 44, 56].slice(0, muenzen);
  const takt = muenzen > 0 ? (muenzen <= 3 ? 2.4 : 2.75) : 0;
  return (
    <div className={`boerse ${muenzen ? 'stoss' : ''}`} style={{ width: 250 * s, height: 280 * s, ['--s' as string]: s }} aria-hidden="true">
      <svg className="boerse-teil" viewBox="0 0 220 200" width={220 * s} height={200 * s} style={{ zIndex: 1 }}>
        <defs><linearGradient id="bh-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#202A42" /><stop offset=".6" stopColor="#141B2D" /><stop offset="1" stopColor="#0C111D" /></linearGradient></defs>
        <rect x="5" y="40" width="210" height="150" rx="30" fill="url(#bh-l)" stroke="rgba(140,170,255,.22)" />
        <rect x="34" y="60" width="152" height="16" rx="8" fill="#02040A" />
      </svg>
      {fall.map((x, i) => (
        <div key={i} className="boerse-fall" style={{ left: `${x}%` }}>
          <div style={{ animationDelay: `${(-i * takt / muenzen).toFixed(2)}s`, animationDuration: `${takt}s` }}>
            <Muenze3D d={Math.round(46 * s)} schnell />
          </div>
        </div>
      ))}
      <svg className="boerse-teil" viewBox="0 0 220 200" width={220 * s} height={200 * s} style={{ zIndex: 3 }}>
        <defs>
          <linearGradient id="bv-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#202A42" /><stop offset=".6" stopColor="#141B2D" /><stop offset="1" stopColor="#0C111D" /></linearGradient>
          <linearGradient id="bv-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#63D8FF" /><stop offset=".5" stopColor="#2F7BFF" /><stop offset="1" stopColor="#1B4FD1" /></linearGradient>
        </defs>
        <path d="M5 69 H215 V160 Q215 190 185 190 H35 Q5 190 5 160 Z" fill="url(#bv-l)" />
        <path d="M34 69 H186" stroke="rgba(159,230,255,.45)" strokeWidth="1.5" />
        <rect x="148" y="104" width="68" height="40" rx="20" fill="url(#bv-b)" />
        <circle cx="168" cy="124" r="6" fill="#03060F" opacity=".55" /><circle cx="168" cy="124" r="3" fill="#F2F6FF" />
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ZEICHEN} alt="" className="absolute" style={{ zIndex: 4, left: 62 * s, bottom: 50 * s, width: 44 * s, height: 44 * s, opacity: .9 }} />
    </div>
  );
}

/** Grosses Schild mit Schloss: Sicherheit. */
export function Schild({ hoehe = 120 }: { hoehe?: number }) {
  const s = hoehe / 150;
  return (
    <div className="schild" style={{ width: 132 * s, height: 150 * s }} role="img" aria-hidden="true">
      <svg viewBox="0 0 132 150" width={132 * s} height={150 * s}>
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2F7BFF" /><stop offset=".55" stopColor="#1B4FD1" /><stop offset="1" stopColor="#0B1F57" /></linearGradient>
          <linearGradient id="sr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9FE6FF" /><stop offset="1" stopColor="#2F7BFF" stopOpacity=".3" /></linearGradient>
        </defs>
        <path d="M66 6 L120 26 V74 C120 112 96 138 66 148 C36 138 12 112 12 74 V26 Z" fill="url(#sg)" stroke="url(#sr)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M66 18 L109 34 V74 C109 105 90 126 66 135 C42 126 23 105 23 74 V34 Z" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.2" />
        <rect x="47" y="70" width="38" height="31" rx="7" fill="#F2F6FF" />
        <path d="M53 70 V61 a13 13 0 0 1 26 0 V70" fill="none" stroke="#F2F6FF" strokeWidth="6" strokeLinecap="round" />
        <circle cx="66" cy="83" r="4.2" fill="#1B4FD1" /><rect x="64.2" y="85" width="3.6" height="8" rx="1.8" fill="#1B4FD1" />
      </svg>
      <div className="schild-glanz" />
    </div>
  );
}

/** Funken, die bei einem Blockfund fallen. Fest verteilt, damit Server und Browser gleich zeichnen. */
const FUNKEN = Array.from({ length: 26 }, (_, i) => {
  const r = (n: number) => ((Math.sin((i + 1) * 12.9898 * n) * 43758.5453) % 1 + 1) % 1;
  return {
    left: 2 + r(1) * 96,
    farbe: ['#63D8FF', '#2F7BFF', '#F2F6FF', '#3BE59A'][Math.floor(r(2) * 4)],
    delay: -(r(3) * 3.2), dauer: 2.6 + r(4) * 1.6,
  };
});
export function Funken() {
  return (
    <div className="funken" aria-hidden="true">
      {FUNKEN.map((f, i) => (
        <i key={i} style={{ left: `${f.left}%`, background: f.farbe, animationDelay: `${f.delay.toFixed(2)}s`, animationDuration: `${f.dauer.toFixed(2)}s` }} />
      ))}
    </div>
  );
}
