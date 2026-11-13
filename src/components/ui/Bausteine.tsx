'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n';
import { useScrollSperre } from '@/lib/ui/scrollSperre';

/**
 * Bausteine der zweiten Generation.
 *
 * Die Regel dahinter: Die eine Zahl, um die es auf einem Bildschirm geht,
 * steht gross auf dem Grund -- nicht in einer Karte. Karten sind fuer
 * Sekundaeres. Radien ab 16 px, Tiefe durch eine schwebende Leiste, Blaetter
 * von unten und einen Schein oben. Daten werden gezeichnet, nicht nur
 * aufgezaehlt.
 */

/** Kleine Ueberschrift ueber einer Zahl. */
export function Etikett({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`label ${className}`}>{children}</span>;
}

/** Karte: Flaeche fuer Sekundaeres. */
export function Karte({ children, className = '', onClick }: {
  children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  const K = onClick ? 'button' : 'div';
  return (
    <K onClick={onClick}
       className={`panel block w-full text-left ${onClick ? 'active:scale-[.99] transition-transform' : ''} ${className}`}>
      {children}
    </K>
  );
}

/** Zustandspille mit Punkt. */
export function Pille({ tone, children, puls = false }: {
  tone: 'work' | 'proof' | 'off' | 'risk'; children: React.ReactNode; puls?: boolean;
}) {
  const look = { work: 'text-cyan', proof: 'text-proof', off: 'text-dim', risk: 'text-risk' }[tone];
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] font-medium ${look}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${puls ? 'puls' : ''}`} />
      {children}
    </span>
  );
}

/** Segmentschalter. */
export function Segment<T extends string | number>({ werte, wert, onChange, label, disabled }: {
  werte: { v: T; text: string }[]; wert: T; onChange: (v: T) => void; label: string; disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full p-1 shadow-[inset_0_0_0_1px_rgb(170_198_255/.17)]">
      {werte.map(w => (
        <button key={String(w.v)} onClick={() => onChange(w.v)} aria-pressed={wert === w.v} disabled={disabled}
                className={`min-h-[44px] min-w-[44px] flex-1 rounded-full px-3 text-[15px] font-medium transition-colors disabled:opacity-60 ${
                  wert === w.v ? 'bg-text/[.14] font-semibold text-text' : 'text-lese'}`}>
          {w.text}
        </button>
      ))}
    </div>
  );
}

/**
 * Blatt von unten (Bottom-Sheet). Legt sich ueber den Reiter, der Rahmen
 * bleibt. Tipp auf den Grund oder Wischen am Griff schliesst.
 */
export function Blatt({ offen, onSchliessen, children, titel, rechts, grund = 'surface' }: {
  offen: boolean; onSchliessen: () => void; children: React.ReactNode;
  titel?: React.ReactNode; rechts?: React.ReactNode;
  /** 'ink': Blatt auf dem Seitengrund, der Inhalt sitzt auf Karten (Wallet). */
  grund?: 'surface' | 'ink';
}) {
  const { t } = useT();
  const [sichtbar, setSichtbar] = useState(offen);
  useEffect(() => { if (offen) setSichtbar(true); else { const id = setTimeout(() => setSichtbar(false), 220); return () => clearTimeout(id); } }, [offen]);
  // Die Seite dahinter steht still, solange das Blatt offen ist.
  useScrollSperre(offen);
  if (!sichtbar || typeof document === 'undefined') return null;
  // Kein transform und kein filter auf dem Blatt: beides macht es zum
  // Bezugsrahmen fuer fixierte Nachfahren -- der Scanner (fixed inset-0)
  // saesse sonst im Blatt statt auf dem Bildschirm.
  return createPortal(
    <div className={`fixed inset-0 z-40 flex flex-col justify-end transition-opacity duration-200 ${offen ? 'opacity-100' : 'opacity-0'}`}
         style={{ background: 'rgb(3 6 15 / .78)' }}
         onClick={onSchliessen} role="dialog" aria-modal="true">
      <div className={`mx-auto w-full max-w-md max-h-[calc(100dvh-var(--oben)-12px)] overflow-y-auto overscroll-contain rounded-t-[28px]
                       blatt px-[22px] pt-2.5
                       pb-[calc(24px+var(--unten))] ${grund === 'ink' ? 'bg-ink' : 'bg-sunk'}`}
           onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[rgb(140_170_255/.22)]" />
        {(titel || rechts) && (
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[24px] font-[350] tracking-[-0.026em]">{titel}</span>
            {rechts ?? (
              <button onClick={onSchliessen} aria-label={t.allgemein.schliessen}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(140_170_255/.22)] text-text">
                <svg viewBox="0 0 22 22" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l12 12M17 5 5 17" /></svg>
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
