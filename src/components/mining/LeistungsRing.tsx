/**
 * Der Ring auf der Mining-Hauptansicht (Paket 3).
 *
 * Nur noch Anzeige: Der Bogen zeigt die eingestellte Last, die Farbe den
 * Zustand (blau = minet, grau = steht). Eingestellt wird die Last an EINER
 * Stelle -- dem Segmentschalter darunter. Vorher liess sie sich am Ring
 * ziehen und zusaetzlich im Blatt "Erweitert" setzen; das Ziehen war kaum
 * zu entdecken (UX-Audit Nr. 2 und 3).
 */
export function LeistungsRing({ aktiv, last, children }: {
  aktiv: boolean;
  /** 25, 50, 75 oder 100 */
  last: number;
  children: React.ReactNode;
}) {
  const R = 88, U = 2 * Math.PI * R;
  return (
    <div className="relative mx-auto h-[200px] w-[200px]">
      <svg viewBox="0 0 200 200" width="200" height="200" className="absolute inset-0" aria-hidden="true">
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--haar) / .10)" strokeWidth="6" />
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
                stroke={aktiv ? 'rgb(var(--work))' : 'rgb(var(--haar) / .35)'}
                strokeDasharray={`${(U * last / 100).toFixed(1)} ${U.toFixed(1)}`}
                transform="rotate(-90 100 100)" style={{ transition: 'stroke-dasharray .25s ease, stroke .25s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">{children}</div>
    </div>
  );
}
