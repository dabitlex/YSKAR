'use client';

/**
 * Bausteine der Oberflaeche.
 *
 * Drei Ebenen statt einer Flaeche: Grund, Panel, Vertiefung. Was
 * zusammengehoert, sitzt auf einem Blatt -- was Eingabe ist, liegt darin.
 * Das ersetzt die Haarlinien, mit denen vorher alles getrennt war.
 */

export function Screen({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-md px-4 pb-32 pt-5">{children}</main>;
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

/** Ueberschrift einer Gruppe. Klein, ruhig, mit Luft darueber. */
export function GroupTitle({ children, aside }: {
  children: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 mt-7 flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-medium text-dim">{children}</h2>
      {aside && <span className="text-xs text-faint">{aside}</span>}
    </div>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[26px] font-medium leading-[1.2] tracking-[-0.015em]">{children}</h1>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-[1.6] text-dim">{children}</p>;
}

/** Zeile in einem Panel. Trennlinien nur zwischen Zeilen, nicht aussen. */
export function Row({ label, value, tone }: {
  label: string; value: React.ReactNode; tone?: 'work' | 'proof' | 'risk';
}) {
  const color = tone === 'work' ? 'text-work'
    : tone === 'proof' ? 'text-proof' : tone === 'risk' ? 'text-risk' : '';
  return (
    <div className="flex items-baseline justify-between gap-4 py-3
                    [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line/70">
      <dt className="text-[13px] text-dim">{label}</dt>
      <dd className={`tnum text-[15px] ${color}`}>{value}</dd>
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
  const base = 'w-full rounded-sm py-3.5 text-[15px] font-medium ' +
    'transition-[transform,opacity,background-color] active:scale-[.985] ' +
    'disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100';
  const look = {
    primary: 'bg-work text-ink shadow-[0_2px_10px_rgb(var(--work)/.22)]',
    quiet: 'bg-raised text-text shadow-[inset_0_1px_0_rgb(var(--edge)/.055)]',
    risk: 'bg-risk/12 text-risk',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
            className={`${base} ${look} ${className}`}>
      {children}
    </button>
  );
}

/**
 * Runde Aktionstaste mit Beschriftung darunter -- das Muster, das man aus
 * jeder Bank- und Wallet-App kennt. Es ist verbreitet, weil es funktioniert:
 * grosse Trefferflaeche, Symbol und Wort zusammen.
 */
export function ActionButton({ icon, label, onClick, tone = 'quiet' }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  tone?: 'work' | 'quiet';
}) {
  return (
    <button onClick={onClick} className="group flex flex-1 flex-col items-center gap-2">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full
                        transition-transform group-active:scale-95 ${
        tone === 'work'
          ? 'bg-work text-ink shadow-[0_2px_12px_rgb(var(--work)/.28)]'
          : 'bg-raised text-text shadow-[inset_0_1px_0_rgb(var(--edge)/.06)]'}`}>
        {icon}
      </span>
      <span className="text-[11.5px] text-dim">{label}</span>
    </button>
  );
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline justify-between px-0.5">
        <span className="text-[13px] text-dim">{label}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export const eingabe =
  'sunk w-full border border-transparent px-4 py-3.5 text-[15px] outline-none ' +
  'transition-colors focus:border-work/60 placeholder:text-faint';

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
    : tone === 'proof' ? 'text-proof bg-proof/10' : 'text-faint bg-raised';
  const punkt = tone === 'work' ? 'bg-work puls'
    : tone === 'proof' ? 'bg-proof' : 'bg-faint';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1
                      text-[11.5px] ${look}`}>
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
    <p className={`rounded-sm px-4 py-3 text-[13.5px] leading-[1.55] ${look}`}>
      {children}
    </p>
  );
}

/** Leerzustand. Kein blasser Platzhalter, sondern ein Satz, der weiterhilft. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel px-5 py-8 text-center">
      <p className="text-[13.5px] leading-relaxed text-dim">{children}</p>
    </div>
  );
}

export const Icon = {
  Senden: (
    <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 17V5M11 5 6 10M11 5l5 5" />
    </svg>
  ),
  Empfangen: (
    <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5v12M11 17l5-5M11 17l-5-5" />
    </svg>
  ),
  Verlauf: (
    <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 6v5l3 2M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
    </svg>
  ),
};
