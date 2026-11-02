/**
 * Schrift-Bausteine: Etikett (Mono, Grossbuchstaben) und Abschnittskopf.
 *
 * Mono-Etiketten kommen aus Konzept B, aber sparsam: ueber Kennzahlen und
 * Abschnitten, nie fuer Fliesstext.
 */
export function Etikett({ children, className = '', as = 'span' }: {
  children: React.ReactNode; className?: string; as?: 'span' | 'h2' | 'h3' | 'p';
}) {
  const K = as;
  return <K className={`ys-etikett ${className}`}>{children}</K>;
}

/** Kopf eines Abschnitts: Etikett links, optional etwas rechts (Link, Zahl). */
export function Abschnitt({ titel, rechts, className = '' }: {
  titel: string; rechts?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex min-h-11 items-center justify-between gap-3 ${className}`}>
      <Etikett as="h2">{titel}</Etikett>
      {rechts && <span className="flex shrink-0 items-center text-ys-meta text-dim">{rechts}</span>}
    </div>
  );
}
