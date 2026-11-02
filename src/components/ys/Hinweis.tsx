/**
 * Hinweis und Fortschrittsbalken.
 *
 * Hinweis: Punkt, Titel, ein Satz. Farbe nach Bedeutung, wie ueberall:
 *   info     blau   -- zur Kenntnis
 *   warnung  bernstein -- bitte tun / gerade eingeschraenkt (Sendepause)
 *   gefahr   rot    -- unwiderruflich oder fehlgeschlagen
 *   erfolg   gruen  -- von der Kette bestaetigt
 */
type Ton = 'info' | 'warnung' | 'gefahr' | 'erfolg';

const TON: Record<Ton, { punkt: string; rahmen: string }> = {
  info: { punkt: 'bg-work', rahmen: 'border-work/30 bg-work/[.05]' },
  warnung: { punkt: 'bg-amber', rahmen: 'border-amber/30 bg-amber/[.06]' },
  gefahr: { punkt: 'bg-risk', rahmen: 'border-risk/30 bg-risk/[.06]' },
  erfolg: { punkt: 'bg-proof', rahmen: 'border-proof/30 bg-proof/[.05]' },
};

export function Hinweis({ ton = 'info', titel, children, rechts }: {
  ton?: Ton; titel?: string; children?: React.ReactNode; rechts?: React.ReactNode;
}) {
  const t = TON[ton];
  return (
    <div role={ton === 'gefahr' || ton === 'warnung' ? 'alert' : 'status'}
         className={`flex items-start gap-3 rounded-sm border px-4 py-3 ${t.rahmen}`}>
      <span aria-hidden="true" className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${t.punkt}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {titel && <span className="text-ys-klein font-medium text-text">{titel}</span>}
        {children && <span className="text-ys-meta text-lese">{children}</span>}
      </span>
      {rechts}
    </div>
  );
}

export function Fortschritt({ anteil, label, verlauf = false }: {
  /** 0 bis 1 */
  anteil: number; label: string; verlauf?: boolean;
}) {
  const p = Math.max(0, Math.min(1, anteil)) * 100;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)}
         className="h-1.5 overflow-hidden rounded-full bg-raised">
      <div className="h-full rounded-full transition-[width] duration-300"
           style={{ width: `${Math.max(1.5, p)}%`, background: verlauf ? 'linear-gradient(90deg, rgb(var(--work)), rgb(var(--cyan)))' : 'rgb(var(--work))' }} />
    </div>
  );
}
