/**
 * Knoepfe des YSKAR-Systems -- vier Arten, zwei Groessen.
 *
 * Regel aus Konzept C: Je Bildschirm genau EIN Knopf der Art "haupt" (Blau).
 * Alles andere ist "zweit" (Umriss), "leise" (nur Text) oder "gefahr".
 * Trefferflaeche immer mindestens 44 px.
 */
type Art = 'haupt' | 'zweit' | 'leise' | 'gefahr';

const ART: Record<Art, string> = {
  haupt: 'bg-work text-white',
  zweit: 'border border-[rgb(var(--haar)/.24)] bg-transparent text-text',
  leise: 'bg-transparent text-cyan',
  gefahr: 'border border-risk/40 bg-transparent text-risk',
};

export function Knopf({ children, onClick, art = 'haupt', groesse = 'gross', voll = true, disabled, type = 'button', className = '', ...aria }: {
  children: React.ReactNode; onClick?: () => void;
  art?: Art; groesse?: 'gross' | 'mittel'; voll?: boolean;
  disabled?: boolean; type?: 'button' | 'submit'; className?: string;
} & React.AriaAttributes) {
  const hoehe = groesse === 'gross' ? 'min-h-14 text-ys-fliess' : 'min-h-11 text-ys-klein';
  const breite = voll ? 'w-full' : '';
  const innen = art === 'leise' ? 'px-2' : groesse === 'gross' ? 'px-6' : 'px-5';
  return (
    <button type={type} onClick={onClick} disabled={disabled} {...aria}
            className={`flex items-center justify-center gap-2 rounded-full font-semibold transition-[transform,opacity]
                        active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100
                        ${hoehe} ${breite} ${innen} ${ART[art]} ${className}`}>
      {children}
    </button>
  );
}

/** Runder Aktionsknopf mit Wort darunter (Senden, Empfangen, Scannen). */
export function RundKnopf({ symbol, text, onClick, haupt = false, disabled }: {
  symbol: React.ReactNode; text: string; onClick: () => void; haupt?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
            className="flex w-[76px] flex-col items-center gap-2 active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full ${
        disabled ? 'bg-raised text-faint'
        : haupt ? 'bg-work text-white'
        : 'border border-[rgb(var(--haar)/.18)] bg-surface text-text'}`}>{symbol}</span>
      <span className={`max-w-full truncate text-ys-meta ${disabled ? 'text-faint' : 'text-dim'}`}>{text}</span>
    </button>
  );
}

/** Nur ein Symbol, rund, 44 px -- z. B. Einstellungen, Zurueck. Braucht ein label. */
export function SymbolKnopf({ symbol, label, onClick }: {
  symbol: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--haar)/.18)] text-text active:scale-95">
      {symbol}
    </button>
  );
}
