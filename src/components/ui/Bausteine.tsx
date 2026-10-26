'use client';

import { useEffect, useMemo, useState } from 'react';
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

/** Grosse Zahl mit gedimmten Nachkommastellen und Einheit. */
export function Zahl({ ganz, bruch, trenner = ',', einheit, size = 52, breite = 300, className = '' }: {
  ganz: string; bruch?: string; trenner?: string; einheit?: string; size?: number;
  /** Verfuegbare Breite in px -- die Schrift schrumpft, bis die Zahl hineinpasst. */
  breite?: number; className?: string;
}) {
  // Tabellenziffern in Manrope sind etwa 0,6 em breit. Ein grosses Guthaben
  // (1.325.744,6759) darf nie ueber den Rand laufen -- sonst scrollt die
  // ganze Seite quer, samt Navigationsleiste.
  const zeichen = ganz.length + (bruch !== undefined ? bruch.length + trenner.length : 0);
  const eff = Math.max(22, Math.min(size, Math.floor(breite / (zeichen * 0.6))));
  return (
    <span className={`flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 ${className}`}>
      <span className="zahl-gross whitespace-nowrap" style={{ fontSize: eff }}>
        {ganz}{bruch !== undefined && <span className="bruch">{trenner}{bruch}</span>}
      </span>
      {einheit && <span className="font-medium text-dim" style={{ fontSize: Math.max(15, Math.round(eff / 3)) }}>{einheit}</span>}
    </span>
  );
}

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

/** Kleine Kennzahl-Kachel: Etikett, Zahl. */
export function Kachel({ label, wert }: { label: string; wert: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-0.5 py-1">
      <span className="text-[12px] text-dim">{label}</span>
      <span className="tnum text-[18px] font-normal tracking-[-0.03em]">{wert}</span>
    </div>
  );
}

/** Runde Aktion mit Wort darunter. */
export function Aktion({ icon, label, onClick, primary = false }: {
  icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button onClick={onClick} className="group flex flex-1 flex-col items-center gap-2">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full border transition-transform
                        group-active:scale-95 ${primary
        ? 'border-transparent bg-work text-white'
        : 'border-[rgb(140_170_255/.22)] text-text'}`}>
        {icon}
      </span>
      <span className="text-[14px] font-medium text-lese">{label}</span>
    </button>
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
    <div role="group" aria-label={label} className="flex rounded-full border border-line bg-ink p-1">
      {werte.map(w => (
        <button key={String(w.v)} onClick={() => onChange(w.v)} aria-pressed={wert === w.v} disabled={disabled}
                className={`min-h-[36px] min-w-[44px] flex-1 rounded-full px-3 text-[13px] font-medium transition-colors disabled:opacity-60 ${
                  wert === w.v ? 'bg-text text-ink' : 'text-dim'}`}>
          {w.text}
        </button>
      ))}
    </div>
  );
}

/**
 * Kurve: Werte als Flaeche mit Linie, letzter Punkt markiert.
 * Bei weniger als zwei Werten eine ruhige Grundlinie -- kein leeres Loch.
 */
export function Kurve({ werte, hoehe = 64, className = '' }: { werte: number[]; hoehe?: number; className?: string }) {
  const B = 320;
  const pfad = useMemo(() => {
    const v = werte.length >= 2 ? werte : [0, 0];
    const max = Math.max(...v, 1), min = Math.min(...v, 0);
    const y = (x: number) => hoehe - 6 - ((x - min) / (max - min || 1)) * (hoehe - 14);
    const pts = v.map((x, i) => [i * (B / (v.length - 1)), y(x)] as const);
    const d = 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
    return { d, fill: `${d} L${B},${hoehe} L0,${hoehe} Z`, letzte: pts[pts.length - 1] };
  }, [werte, hoehe]);
  return (
    <svg viewBox={`0 0 ${B} ${hoehe}`} className={`block w-full ${className}`} style={{ height: hoehe }}
         preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="kurve-fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(var(--work))" stopOpacity=".3" /><stop offset="1" stopColor="rgb(var(--work))" stopOpacity="0" /></linearGradient></defs>
      <path d={pfad.fill} fill="url(#kurve-fl)" />
      <path d={pfad.d} fill="none" stroke="rgb(var(--cyan))" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Ring: Anteil 0..1, Text in der Mitte. */
export function Ring({ anteil, oben, unten, size = 116 }: {
  anteil: number; oben: React.ReactNode; unten: React.ReactNode; size?: number;
}) {
  const r = 52, u = 2 * Math.PI * r;
  const a = Math.max(0, Math.min(1, anteil));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(var(--raised))" strokeWidth="6" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(var(--work))" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={u} strokeDashoffset={u * (1 - a)} transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-[1.1]">
        <span className="tnum text-[21px] font-extrabold tracking-[-0.02em]">{oben}</span>
        <span className="text-[10.5px] font-bold text-faint">{unten}</span>
      </div>
    </div>
  );
}

/**
 * Identicon: Eine Adresse als Farbkachel. Vier Farben aus dem Hash der
 * Adresse, damit man eine Gegenseite wiedererkennt, ohne die Zeichen zu
 * lesen. Kein Sicherheitsmerkmal -- dafuer steht die volle Adresse daneben.
 */
const FARBEN = ['#1F5BF0', '#38BDF8', '#0B8A5C', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6', '#F97316'];
export function Identicon({ adresse, size = 40, className = '' }: { adresse: string | null; size?: number; className?: string }) {
  let h = 7;
  for (const c of adresse ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // >>> statt >>: h ist vorzeichenlos. Mit >> wurde der Index bei etwa
  // jeder zweiten Adresse negativ -- keine Farbe, die Kachel blieb leer.
  // Fuer alle anderen Adressen ergibt >>> genau dieselben Farben wie vorher.
  // Der Winkel bleibt bei >>: Ein negativer Winkel ist gueltiges CSS, und so
  // sieht keine Kachel, die schon richtig war, danach anders aus.
  const a = FARBEN[h % 8], b = FARBEN[(h >>> 3) % 8], c = FARBEN[(h >>> 6) % 8];
  const winkel = (h >> 9) % 360;
  return (
    <span aria-hidden="true" className={`inline-block shrink-0 ${className}`}
          style={{ width: size, height: size, borderRadius: Math.round(size * .3),
                   background: adresse ? `conic-gradient(from ${winkel}deg, ${a}, ${b}, ${c}, ${a})` : 'rgb(var(--raised))',
                   boxShadow: 'inset 0 0 0 3px rgb(var(--surface))' }} />
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
      <div className={`mx-auto w-full max-w-md max-h-[calc(100dvh-var(--oben)-12px)] overflow-y-auto overscroll-contain rounded-t-[30px]
                       border-t border-[rgb(140_170_255/.22)] px-[22px] pt-2.5
                       pb-[calc(24px+var(--unten))] ${grund === 'ink' ? 'bg-ink' : 'bg-sunk'}`}
           onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[rgb(140_170_255/.22)]" />
        {(titel || rechts) && (
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[22px] font-semibold tracking-[-0.03em]">{titel}</span>
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

/** Kopfzeile in einem Blatt: Titel links, rechts Zusatz, Zurueck oder Schliessen. */
export function BlattKopf({ titel, onZurueck, rechts, art = 'schliessen' }: {
  titel: string; onZurueck: () => void; rechts?: React.ReactNode; art?: 'schliessen' | 'zurueck';
}) {
  const { t } = useT();
  return (
    <div className="mb-4 flex items-center gap-3">
      {art === 'zurueck' && (
        <button onClick={onZurueck} aria-label={t.allgemein.zurueck}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(140_170_255/.22)] text-text">
          <svg viewBox="0 0 22 22" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 5l-6 6 6 6" /></svg>
        </button>
      )}
      <span className="flex-1 text-[22px] font-semibold tracking-[-0.03em]">{titel}</span>
      {rechts}
      {art === 'schliessen' && (
        <button onClick={onZurueck} aria-label={t.allgemein.schliessen}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(140_170_255/.22)] text-text">
          <svg viewBox="0 0 22 22" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l12 12M17 5 5 17" /></svg>
        </button>
      )}
    </div>
  );
}
