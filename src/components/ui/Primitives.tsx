'use client';

/**
 * Bausteine der Oberflaeche.
 *
 * Heller Grund, weisse Karten, ein Akzent. Was zusammengehoert, sitzt auf
 * einer Karte -- was Eingabe ist, hat eine Linie. Die Namen sind dieselben
 * wie vor dem Redesign, damit jeder Bildschirm ohne Umbau darauf aufsetzt.
 */

export function Screen({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-md px-5 pb-32 pt-5">{children}</main>;
}

export function Panel({ children, tone, className = '' }: {
  children: React.ReactNode;
  tone?: 'work' | 'proof';
  className?: string;
}) {
  const schein = tone === 'work' ? 'glow-work' : tone === 'proof' ? 'glow-proof' : '';
  return (
    <section className={`panel overflow-hidden p-5 ${schein} ${className}`}>
      <div className="relative z-10">{children}</div>
    </section>
  );
}

/** Ueberschrift einer Gruppe. Kraeftig, mit Luft darueber. */
export function GroupTitle({ children, aside }: {
  children: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 mt-6 flex items-baseline justify-between px-0.5">
      <h2 className="text-[16px] font-extrabold tracking-[-0.01em]">{children}</h2>
      {aside && <span className="text-[12.5px] font-semibold text-faint">{aside}</span>}
    </div>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-[-0.02em]">{children}</h1>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] font-medium leading-[1.6] text-dim">{children}</p>;
}

/** Kopfzeile eines Unterbildschirms: Zurueck, Titel, rechts optional. */
export function SubHeader({ titel, onZurueck, rechts }: {
  titel: string; onZurueck: () => void; rechts?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <button onClick={onZurueck} aria-label="Zurück"
              className="flex h-9 w-9 items-center justify-center rounded-full border
                         border-line bg-surface text-text active:scale-95">
        <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 5l-6 6 6 6" />
        </svg>
      </button>
      <span className="text-[17px] font-extrabold">{titel}</span>
      <span className="flex min-w-9 justify-end">{rechts}</span>
    </div>
  );
}

/** Zeile in einem Panel. Trennlinien nur zwischen Zeilen, nicht aussen. */
export function Row({ label, value, tone }: {
  label: string; value: React.ReactNode; tone?: 'work' | 'proof' | 'risk';
}) {
  const color = tone === 'work' ? 'text-work'
    : tone === 'proof' ? 'text-proof' : tone === 'risk' ? 'text-risk' : '';
  return (
    <div className="flex items-baseline justify-between gap-4 py-3
                    [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
      <dt className="text-[13.5px] font-semibold text-dim">{label}</dt>
      <dd className={`tnum text-[14.5px] font-bold ${color}`}>{value}</dd>
    </div>
  );
}

export function Button({
  children, onClick, variant = 'primary', disabled, type = 'button', className = '',
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'primary' | 'quiet' | 'risk'; disabled?: boolean;
  type?: 'button' | 'submit'; className?: string;
}) {
  const base = 'flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 ' +
    'text-[15px] font-bold transition-[transform,opacity,background-color] ' +
    'active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-35 ' +
    'disabled:active:scale-100';
  const look = {
    primary: 'bg-work text-white shadow-[0_10px_24px_-10px_rgb(var(--work)/.6)]',
    quiet: 'border border-line bg-surface text-text',
    risk: 'bg-risk/10 text-risk',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
            className={`${base} ${look} ${className}`}>
      {children}
    </button>
  );
}

/**
 * Runde Aktionstaste mit Beschriftung darunter -- das Muster aus jeder
 * Bank- und Wallet-App: grosse Trefferflaeche, Symbol und Wort zusammen.
 */
export function ActionButton({ icon, label, onClick, tone = 'quiet' }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  tone?: 'work' | 'quiet';
}) {
  return (
    <button onClick={onClick} className="group flex flex-1 flex-col items-center gap-2">
      <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-full
                        transition-transform group-active:scale-95 ${
        tone === 'work'
          ? 'bg-work text-white shadow-[0_10px_20px_-10px_rgb(var(--work)/.6)]'
          : 'bg-raised text-text'}`}>
        {icon}
      </span>
      <span className="text-[12px] font-bold text-text">{label}</span>
    </button>
  );
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline justify-between px-0.5">
        <span className="text-[13px] font-bold text-dim">{label}</span>
        {hint && <span className="text-[11px] font-semibold text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export const eingabe =
  'sunk w-full px-4 py-3.5 text-[15px] outline-none transition-colors ' +
  'focus:border-work placeholder:text-faint';

/**
 * Hash mit gedimmten fuehrenden Nullen -- der zentrale Kniff dieser
 * Oberflaeche. Die Nullen sind die geleistete Arbeit; gedimmt kann man sie
 * zaehlen statt lesen.
 */
export function Hash({ value, className = '' }: { value: string; className?: string }) {
  const lead = value.length - value.replace(/^0+/, '').length;
  return (
    <span className={`break-all font-mono ${className}`}>
      <span className="hash-lead">{value.slice(0, lead)}</span>
      <span className="hash-sig">{value.slice(lead)}</span>
    </span>
  );
}

/** Zustandsplakette. Farbe traegt Bedeutung, nicht Dekoration. */
export function Status({ tone, children }: {
  tone: 'work' | 'proof' | 'off'; children: React.ReactNode;
}) {
  const look = tone === 'work' ? 'text-work bg-work/10'
    : tone === 'proof' ? 'text-proof bg-proof/10' : 'text-dim bg-raised';
  const punkt = tone === 'work' ? 'bg-work puls'
    : tone === 'proof' ? 'bg-proof' : 'bg-faint';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1
                      text-[12px] font-bold ${look}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${punkt}`} />
      {children}
    </span>
  );
}

export function Notice({ tone = 'dim', children }: {
  tone?: 'dim' | 'risk' | 'proof' | 'work'; children: React.ReactNode;
}) {
  const look = {
    dim: 'bg-raised text-dim',
    risk: 'bg-risk/10 text-risk',
    proof: 'bg-proof/10 text-proof',
    work: 'bg-work/10 text-work',
  }[tone];
  return (
    <p className={`rounded-[14px] px-4 py-3 text-[13px] font-semibold leading-[1.55] ${look}`}>
      {children}
    </p>
  );
}

/** Leerzustand. Kein blasser Platzhalter, sondern ein Satz, der weiterhilft. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel px-5 py-8 text-center">
      <p className="text-[13.5px] font-semibold leading-relaxed text-dim">{children}</p>
    </div>
  );
}

/** Kennzahl: kleine Ueberschrift, grosse Zahl. */
export function Kennzahl({ label, wert }: { label: string; wert: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label">{label}</dt>
      <dd className="tnum text-[17px] font-extrabold tracking-[-0.01em]">{wert}</dd>
    </div>
  );
}

const strich = {
  viewBox: '0 0 22 22', width: 20, height: 20, fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export const Icon = {
  Senden:    <svg {...strich}><path d="M11 17V5M11 5 6 10M11 5l5 5" /></svg>,
  Empfangen: <svg {...strich}><path d="M11 5v12M11 17l5-5M11 17l-5-5" /></svg>,
  Verlauf:   <svg {...strich}><path d="M11 6v5l3 2M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" /></svg>,
  Scan:      <svg {...strich}><path d="M3 8V5a2 2 0 0 1 2-2h3M14 3h3a2 2 0 0 1 2 2v3M19 14v3a2 2 0 0 1-2 2h-3M8 19H5a2 2 0 0 1-2-2v-3M3 11h16" /></svg>,
  Blitz:     <svg {...strich}><path d="M12 2 5 13h5l-1 7 8-11h-5l1-7z" /></svg>,
  Schloss:   <svg {...strich}><rect x="4" y="9.5" width="14" height="10" rx="2.5" /><path d="M7.5 9.5V7a3.5 3.5 0 0 1 7 0v2.5" /></svg>,
  Haken:     <svg {...strich}><circle cx="11" cy="11" r="8.5" /><path d="M7.5 11.5l2.3 2.3 4.7-5" /></svg>,
  Muenze:    <svg {...strich}><circle cx="11" cy="11" r="8.5" /><path d="M11 6.5v9M8.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></svg>,
  Wuerfel:   <svg {...strich}><path d="M11 3 4 7v8l7 4 7-4V7zM4 7l7 4 7-4M11 11v8" /></svg>,
  Pfeil:     <svg {...strich}><path d="M4 11h14M13 6l5 5-5 5" /></svg>,
  Tabelle:   <svg {...strich}><rect x="3" y="4" width="16" height="14" rx="3" /><path d="M3 9h16M7 13h4" /></svg>,
  Zahnrad:   <svg {...strich}><circle cx="11" cy="11" r="2.5" /><path d="M11 2.5v2M11 17.5v2M2.5 11h2M17.5 11h2M5 5l1.4 1.4M15.6 15.6 17 17M5 17l1.4-1.4M15.6 6.4 17 5" /></svg>,
  Info:      <svg {...strich}><circle cx="11" cy="11" r="8.5" /><path d="M11 10v5M11 7h.01" /></svg>,
  Warnung:   <svg {...strich}><path d="M11 7v5M11 15h.01M10.1 3.6 2.6 17a1 1 0 0 0 .9 1.5h15a1 1 0 0 0 .9-1.5L11.9 3.6a1 1 0 0 0-1.8 0z" /></svg>,
  Kopieren:  <svg {...strich}><rect x="7" y="7" width="11" height="11" rx="2" /><path d="M4 14V5a1 1 0 0 1 1-1h9" /></svg>,
  Teilen:    <svg {...strich}><path d="M11 3v11M11 3 7 7M11 3l4 4M4 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>,
};
