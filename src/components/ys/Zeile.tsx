'use client';

import { ExternLink } from '@/components/ui/ExternLink';

/**
 * Liste und Zeile -- fuer Einstellungen, Links, Verlauf.
 *
 * Eine Zeile ist entweder ein Knopf (onClick), ein externer Link (href,
 * oeffnet ueber Telegram bzw. den Systembrowser) oder reine Anzeige.
 * Rechts steht ein Wert und ein Zeichen: › fuer "geht tiefer", ↗ fuer
 * "verlaesst die App". Mindesthoehe 52 px.
 */
export function Liste({ children, flaeche = true, className = '' }: {
  children: React.ReactNode; flaeche?: boolean; className?: string;
}) {
  return (
    <ul className={`${flaeche ? 'ys-flaeche px-4' : ''} [&>li:not(:first-child)]:border-t [&>li]:border-[rgb(var(--haar)/.12)] ${className}`}>
      {children}
    </ul>
  );
}

export function Zeile({ titel, unter, wert, symbol, onClick, href, gefahr, ohnePfeil, ...aria }: {
  titel: React.ReactNode;
  unter?: React.ReactNode;
  wert?: React.ReactNode;
  /** Links ein Symbol (40 px), z. B. eine Kachel oder ein Band. */
  symbol?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  gefahr?: boolean;
  ohnePfeil?: boolean;
} & React.AriaAttributes) {
  const zeichen = ohnePfeil ? null : href ? '↗' : onClick ? '›' : null;
  const inhalt = (
    <>
      {symbol && <span className="flex shrink-0 items-center">{symbol}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-ys-fliess ${gefahr ? 'text-risk' : 'text-text'}`}>{titel}</span>
        {unter && <span className="truncate text-ys-meta text-dim">{unter}</span>}
      </span>
      {(wert || zeichen) && (
        <span className="flex min-w-0 shrink items-center gap-2 text-ys-klein text-dim">
          {wert && <span className="truncate">{wert}</span>}
          {zeichen && <span aria-hidden="true" className="text-faint">{zeichen}</span>}
        </span>
      )}
    </>
  );
  const klasse = 'flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left';
  return (
    <li>
      {href ? (
        <ExternLink href={href} className={`${klasse} active:opacity-70`}>{inhalt}</ExternLink>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={`${klasse} active:opacity-70`} {...aria}>{inhalt}</button>
      ) : (
        <div className={klasse}>{inhalt}</div>
      )}
    </li>
  );
}
