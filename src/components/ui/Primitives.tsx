'use client';

/**
 * Die wenigen Bausteine, aus denen die Oberflaeche besteht.
 *
 * Bewusst KEIN Karten-Baukasten: Der Inhalt laeuft als durchgehende Bahn mit
 * Haarlinien, wie ein Messstreifen. Erhoeht wird genau ein Element je
 * Bildschirm -- alles gleich zu betonen heisst, nichts zu betonen.
 */

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-24 pt-7">{children}</main>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-sm text-dim">{children}</p>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-3 text-2xl font-medium leading-tight tracking-tight">{children}</h1>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[15px] leading-relaxed text-dim">{children}</p>;
}

/** Zeile in der Messstreifen-Bahn. */
export function Row({ label, value, tone }: {
  label: string; value: React.ReactNode; tone?: 'work' | 'proof' | 'risk';
}) {
  const color = tone === 'work' ? 'text-work'
    : tone === 'proof' ? 'text-proof'
    : tone === 'risk' ? 'text-risk' : '';
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className={`tnum text-[15px] ${color}`}>{value}</dd>
    </div>
  );
}

export function Button({
  children, onClick, variant = 'primary', disabled, type = 'button',
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'primary' | 'quiet' | 'risk'; disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base = 'w-full rounded-lg py-4 text-[15px] font-medium transition-colors ' +
    'disabled:cursor-not-allowed disabled:opacity-40';
  const look = {
    primary: 'bg-work text-ink hover:bg-work/90',
    quiet: 'border border-line text-text hover:bg-surface',
    risk: 'border border-risk/50 text-risk hover:bg-risk/10',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${look}`}>
      {children}
    </button>
  );
}

/**
 * Ein Hash mit gedimmten fuehrenden Nullen.
 *
 * Das ist der zentrale Kniff dieser Oberflaeche: Die Nullen SIND die
 * geleistete Arbeit. Gedimmt kann man sie zaehlen statt lesen -- ein Blick
 * genuegt, um zu sehen, wie schwer ein Fund war.
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

/** Zustandspunkt. Farbe traegt Bedeutung, nicht Dekoration. */
export function Dot({ tone }: { tone: 'work' | 'proof' | 'off' }) {
  const c = tone === 'work' ? 'bg-work' : tone === 'proof' ? 'bg-proof' : 'bg-dim';
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${c}`} />;
}

export function Notice({ tone = 'dim', children }: {
  tone?: 'dim' | 'risk' | 'proof'; children: React.ReactNode;
}) {
  const look = {
    dim: 'border-line text-dim',
    risk: 'border-risk/40 text-risk',
    proof: 'border-proof/40 text-proof',
  }[tone];
  return (
    <p className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${look}`}>
      {children}
    </p>
  );
}
