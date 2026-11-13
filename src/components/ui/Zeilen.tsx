'use client';

import { Zeichen } from '@/components/ui/Marke';
import { Icon } from '@/components/ui/Primitives';
import { ExternLink } from '@/components/ui/ExternLink';
import { useT } from '@/i18n';

/**
 * Bausteine des Designs "Erstes Licht" fuer die Reiter Netz und Community:
 * der Kopf mit dem Zeichen, Zeilen zwischen Haarlinien, Kennzahlen in einer
 * Reihe, ein Foto als Buehne. Zeilen statt Karten -- eine Zeile ist ganz
 * antippbar und hat mindestens 44 px Hoehe.
 */

/** Kopf eines Reiters: Zeichen und Name links, rechts wahlweise das Zahnrad. */
export function MarkenKopf({ onEinstellungen, rechts }: { onEinstellungen?: () => void; rechts?: React.ReactNode }) {
  const { t } = useT();
  return (
    <header className="relative flex h-11 items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Zeichen g={26} />
        <span className="pt-px text-[14px] font-semibold tracking-[.2em]">YSKAR</span>
      </div>
      <div className="flex items-center gap-2.5">
        {rechts}
        {onEinstellungen && (
          <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-text shadow-[inset_0_0_0_1px_rgb(238_244_255/.26)] active:scale-95">
            {Icon.Zahnrad}
          </button>
        )}
      </div>
    </header>
  );
}

const strich = {
  viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};
export const PfeilRechts = () => <svg {...strich}><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>;
export const PfeilHinaus = () => <svg {...strich}><path d="M8 16 16.5 7.5M9.5 7.5h7v7" /></svg>;

/** Warmes Licht vor einer Zeile: etwas, das Menschen tun koennen. */
export const Licht = () => (
  <span aria-hidden="true" className="flex w-[26px] shrink-0">
    <span className="ml-0.5 h-2 w-2 rounded-full bg-lamp shadow-[0_0_10px_2px_rgb(255_186_110/.7)]" />
  </span>
);

/**
 * Zeile zwischen Haarlinien. `ende`: 'pfeil' fuehrt in der App weiter,
 * 'hinaus' oeffnet etwas ausserhalb, 'ohne' ist nur Anzeige.
 */
export function Zeile({ titel, text, vor, rechts, ende, href, onClick, hoch = 62, ton = '', erste = false }: {
  titel: React.ReactNode; text?: React.ReactNode; vor?: React.ReactNode; rechts?: React.ReactNode;
  ende?: 'pfeil' | 'hinaus' | 'ohne'; href?: string; onClick?: () => void;
  /** Mindesthoehe in px. */
  hoch?: number;
  /** Farbklasse des Titels, z. B. 'text-lamp'. */
  ton?: string;
  /** Erste Zeile einer Liste: Haarlinie auch oben. */
  erste?: boolean;
}) {
  const schluss = ende ?? (href ? 'hinaus' : onClick ? 'pfeil' : 'ohne');
  const inhalt = (
    <>
      {vor}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[16px] font-medium leading-[1.3] tracking-[-.008em] ${ton}`}>{titel}</span>
        {text && <span className="text-[13.5px] leading-[1.4] text-dim">{text}</span>}
      </span>
      {rechts && <span className="shrink-0 text-right text-[14px] text-lese">{rechts}</span>}
      {schluss !== 'ohne' && <span className="-mr-1 shrink-0 text-dim">{schluss === 'hinaus' ? <PfeilHinaus /> : <PfeilRechts />}</span>}
    </>
  );
  const cls = `flex w-full items-center gap-3.5 border-b border-line py-[11px] text-left ${erste ? 'border-t' : ''} ${
    href || onClick ? 'active:opacity-70' : ''}`;
  const stil = { minHeight: hoch };
  if (href) return <ExternLink href={href} className={cls} stil={stil}>{inhalt}</ExternLink>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} style={stil}>{inhalt}</button>;
  return <div className={cls} style={stil}>{inhalt}</div>;
}

/** Kennzahlen nebeneinander, oben und unten eine Haarlinie. Zahlen aus der Kette stehen in Mono. */
export function Werte({ werte, className = '' }: {
  werte: { name: string; wert: React.ReactNode; ton?: string; wort?: boolean }[]; className?: string;
}) {
  return (
    <div className={`grid border-y border-line ${className}`} style={{ gridTemplateColumns: `repeat(${werte.length}, minmax(0, 1fr))` }}>
      {werte.map(w => (
        <div key={w.name} className="flex min-w-0 flex-col gap-1.5 py-3.5 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-line [&:not(:first-child)]:pl-3.5">
          <span className="truncate text-[12.5px] text-dim">{w.name}</span>
          <span className={`tnum truncate ${w.wort ? 'text-[15.5px] font-medium' : 'font-mono text-[16.5px]'} ${w.ton ?? ''}`}>{w.wert}</span>
        </div>
      ))}
    </div>
  );
}

/** Ueberschrift ueber einer Liste von Zeilen: Etikett mit Haarlinie darunter. */
export function ListenTitel({ children, rechts, className = '' }: {
  children: React.ReactNode; rechts?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex min-h-9 items-end justify-between gap-3 border-b border-line pb-2.5 ${className}`}>
      <h2 className="text-[13.5px] font-medium leading-[1.3] text-dim">{children}</h2>
      {rechts}
    </div>
  );
}

/**
 * Foto als Buehne am Kopf einer Seite (Hochformat 4:5). Liegt hinter dem
 * Inhalt und laeuft unten in die Nacht aus; die Seite beginnt mit
 * <div className="foto-platz" />, damit die Ueberschrift im Auslauf steht.
 */
export function Foto({ src, alt, hoehe = 'hoch' }: { src: string; alt: string; hoehe?: 'hoch' | 'flach' }) {
  return (
    <div className={`foto ${hoehe === 'flach' ? 'foto-flach' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={902} height={1128} decoding="async" />
    </div>
  );
}
