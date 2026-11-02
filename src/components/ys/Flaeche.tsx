/**
 * Flaeche: die eine Kartenart des YSKAR-Systems (ersetzt .panel, Karte,
 * .hero und Kachel in neuen Bildschirmen).
 *
 *   normal  Grund #0A1122, Haarlinie
 *   akzent  dieselbe Flaeche, Linie in Blau -- fuer das eine Element, das
 *           auf einem Bildschirm hervorgehoben werden soll (z. B. Aktion)
 *
 * Abstand innen kommt vom Aufrufer (p-4 Standard, p-5 fuer grosse Flaechen),
 * weil Listen in einer Flaeche ihren eigenen Rand haben.
 */
export function Flaeche({ children, art = 'normal', as = 'section', className = '', ...rest }: {
  children: React.ReactNode;
  art?: 'normal' | 'akzent';
  as?: 'section' | 'div' | 'article';
  className?: string;
} & React.AriaAttributes & { role?: string }) {
  const K = as;
  return (
    <K className={`${art === 'akzent' ? 'ys-flaeche-akzent' : 'ys-flaeche'} ${className}`} {...rest}>
      {children}
    </K>
  );
}
