/**
 * Kennzahlen: kleine Kachel (Name, Wert) und das Raster dazu, dazu die
 * grosse Anzeigezahl fuer die eine Zahl, um die es auf einem Bildschirm geht.
 *
 * Werte in Geist Mono mit Tabellenziffern, damit sie beim Aktualisieren
 * nicht springen.
 */
export function Kennzahl({ name, wert, ton }: {
  name: string; wert: React.ReactNode; ton?: 'erfolg' | 'akzent';
}) {
  const farbe = ton === 'erfolg' ? 'text-proof' : ton === 'akzent' ? 'text-cyan' : 'text-text';
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-sm border border-[rgb(var(--haar)/.12)] bg-surface p-3">
      <span className="truncate text-ys-meta text-dim">{name}</span>
      <span className={`tnum truncate font-mono text-ys-fliess ${farbe}`}>{wert}</span>
    </div>
  );
}

export function KennzahlRaster({ children, spalten = 3 }: { children: React.ReactNode; spalten?: 2 | 3 }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${spalten}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

/**
 * Die grosse Zahl. Ganzzahl hell, Nachkommastellen gedimmt, Einheit in
 * Mono daneben. Schrumpft bei langen Zahlen, statt ueber den Rand zu laufen
 * (360 px Bildschirm: 316 px Inhaltsbreite).
 */
export function Anzeige({ ganz, bruch, einheit, breite = 300 }: {
  ganz: string; bruch?: string; einheit?: string; breite?: number;
}) {
  const zeichen = ganz.length + (bruch?.length ?? 0) + (einheit ? einheit.length * 0.5 + 1 : 0);
  // Geist 300: Tabellenziffern etwa 0,58 em breit.
  const groesse = Math.max(28, Math.min(52, Math.floor(breite / (zeichen * 0.58))));
  return (
    <p className="tnum m-0 flex max-w-full items-baseline justify-center gap-2">
      <span className="whitespace-nowrap font-light leading-none tracking-[-0.05em]" style={{ fontSize: groesse }}>
        {ganz}{bruch && <span className="text-faint">{bruch}</span>}
      </span>
      {einheit && <span className="font-mono text-ys-klein text-dim">{einheit}</span>}
    </p>
  );
}
