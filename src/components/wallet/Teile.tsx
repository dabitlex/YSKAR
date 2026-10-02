'use client';

import { vierer } from '@/lib/wallet/adresse';
import { Identicon } from '@/components/ui/Bausteine';
import { useT } from '@/i18n';

/**
 * Gemeinsame Teile der Wallet: Kopf eines Blatts, Adresse in Vierergruppen,
 * Schrittanzeige, Kachel einer Gegenseite. Senden, Empfangen, Verlauf und
 * die Einzelheiten einer Transaktion setzen sich daraus zusammen -- damit
 * dieselbe Sache ueberall gleich aussieht.
 */

const strich = {
  viewBox: '0 0 22 22', fill: 'none', stroke: 'currentColor',
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

/** Zeichen, die nur die Wallet braucht. `g` ist die Kantenlaenge in px. */
export const Zeichen = {
  Auge: (g = 19) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><path d="M1.5 11s3.5-6.5 9.5-6.5S20.5 11 20.5 11s-3.5 6.5-9.5 6.5S1.5 11 1.5 11z" /><circle cx="11" cy="11" r="2.8" /></svg>,
  AugeZu: (g = 19) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><path d="M3 3l16 16M8.9 5A9.6 9.6 0 0 1 11 4.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M14.7 15.9A8.7 8.7 0 0 1 11 17.5c-6 0-9.5-6.5-9.5-6.5A16.3 16.3 0 0 1 5.3 7M9.1 9.1a2.8 2.8 0 0 0 3.9 3.9" /></svg>,
  Kopieren: (g = 17) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><rect x="7" y="7" width="11" height="11" rx="2" /><path d="M4 14V5a1 1 0 0 1 1-1h9" /></svg>,
  Hoch: (g = 14, w = 2.4) => <svg {...strich} width={g} height={g} strokeWidth={w}><path d="M11 17V5M11 5 6 10M11 5l5 5" /></svg>,
  Runter: (g = 14, w = 2.4) => <svg {...strich} width={g} height={g} strokeWidth={w}><path d="M11 5v12M11 17l5-5M11 17l-5-5" /></svg>,
  Uhr: (g = 14, w = 2.2) => <svg {...strich} width={g} height={g} strokeWidth={w}><path d="M11 6v5l3 2M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" /></svg>,
  Scan: (g = 22) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><path d="M3 8V5a2 2 0 0 1 2-2h3M14 3h3a2 2 0 0 1 2 2v3M19 14v3a2 2 0 0 1-2 2h-3M8 19H5a2 2 0 0 1-2-2v-3M3 11h16" /></svg>,
  Extern: (g = 15) => <svg {...strich} width={g} height={g} strokeWidth={2.1}><path d="M9 5H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3M13 4h5v5M18 4l-8 8" /></svg>,
  Wuerfel: (g = 21) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><path d="M11 3 4 7v8l7 4 7-4V7zM4 7l7 4 7-4M11 11v8" /></svg>,
  Rechts: (g = 16) => <svg {...strich} width={g} height={g} strokeWidth={2.2}><path d="m8 5 6 6-6 6" /></svg>,
  Unten: (g = 16) => <svg {...strich} width={g} height={g} strokeWidth={2.2}><path d="m5 8 6 6 6-6" /></svg>,
  Zurueck: (g = 18) => <svg {...strich} width={g} height={g} strokeWidth={2.2}><path d="m13 5-6 6 6 6" /></svg>,
  Kreuz: (g = 17) => <svg {...strich} width={g} height={g} strokeWidth={2.2}><path d="M5 5l12 12M17 5 5 17" /></svg>,
  Haken: (g = 15, w = 2.6) => <svg {...strich} width={g} height={g} strokeWidth={w}><path d="M5 11.5l4 4 8-9" /></svg>,
  Warnung: (g = 14) => <svg {...strich} width={g} height={g} strokeWidth={2.2}><path d="M11 7v5M11 15h.01M10.1 3.6 2.6 17a1 1 0 0 0 .9 1.5h15a1 1 0 0 0 .9-1.5L11.9 3.6a1 1 0 0 0-1.8 0z" /></svg>,
  Info: (g = 19) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><circle cx="11" cy="11" r="8.5" /><path d="M11 10v5M11 7h.01" /></svg>,
  Loeschen: (g = 22) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><path d="M8 5h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-6-6 6-6zM11 9l5 5M16 9l-5 5" /></svg>,
  Person: (g = 20) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><circle cx="9" cy="7.5" r="3.5" /><path d="M2.5 19a6.5 6.5 0 0 1 13 0M17.5 7v6M14.5 10h6" /></svg>,
  Stift: (g = 16) => <svg {...strich} width={g} height={g} strokeWidth={2}><path d="M14.5 4.5l3 3L7 18l-4 1 1-4z" /></svg>,
  Finger: (g = 21) => <svg {...strich} width={g} height={g} strokeWidth={1.8}><path d="M5.5 8.5a5.5 5.5 0 0 1 11 0v2.2M3.8 14.8c.7-1.7 1-3.5 1-5.4M8.3 19c.9-2.2 1.4-4.6 1.4-7.2a1.3 1.3 0 0 1 2.6 0c0 3-.5 5.6-1.5 8M8.6 8.2a2.5 2.5 0 0 1 4.9.8v1.2M15.4 13.3c-.1 2.1-.5 4.1-1.1 6M17.6 13c0 1.4-.1 2.7-.4 4" /></svg>,
  Muenze: (g = 20) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><circle cx="11" cy="11" r="8.5" /><path d="M11 6.5v9M8.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></svg>,
  Teilen: (g = 19) => <svg {...strich} width={g} height={g} strokeWidth={1.9}><path d="M11 3v11M11 3 7 7M11 3l4 4M4 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>,
};

/** Kleine Ueberschrift in Grossbuchstaben -- ueber Listen und Zahlen. */
export function Kappe({ children, className = '', als: Als = 'span' }: {
  children: React.ReactNode; className?: string; als?: 'span' | 'h2' | 'h3';
}) {
  return (
    <Als className={`text-[11.5px] font-bold uppercase tracking-[.08em] text-dim ${className}`}>{children}</Als>
  );
}

/** Runde Taste im Kopf eines Blatts: 44 px Trefferflaeche. */
export function RundTaste({ onClick, label, children }: {
  onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-text active:scale-95">
      {children}
    </button>
  );
}

/** Schrittanzeige: drei Striche, die gefuellten sind erledigt oder dran. */
export function Schritte({ schritt, von = 3 }: { schritt: number; von?: number }) {
  const { t } = useT();
  return (
    <div role="img" aria-label={t.senden.schritt(schritt, von)} className="flex gap-[5px]">
      {Array.from({ length: von }, (_, i) => (
        <span key={i} className={`h-1 w-5 rounded-full ${i < schritt ? 'bg-work' : 'bg-line'}`} />
      ))}
    </div>
  );
}

/**
 * Kopf eines Wallet-Blatts. Links wahlweise "Zurueck", rechts die
 * Schrittanzeige oder "Schliessen".
 */
export function WKopf({ titel, oben, vor, onZurueck, onSchliessen, rechts }: {
  titel: React.ReactNode;
  /** Kleine Zeile ueber dem Titel ("Empfangen von"). */
  oben?: React.ReactNode;
  /** Vor dem Titel, z. B. die Kachel der Gegenseite. */
  vor?: React.ReactNode;
  onZurueck?: () => void; onSchliessen?: () => void; rechts?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <header className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {onZurueck && <RundTaste onClick={onZurueck} label={t.allgemein.zurueck}>{Zeichen.Zurueck()}</RundTaste>}
        {vor}
        <div className="flex min-w-0 flex-col gap-0.5">
          {oben && <span className="truncate text-[12.5px] font-bold text-dim">{oben}</span>}
          {/* Lange Titel (Russisch: "Проверить и отправить") brechen um, statt abzureissen. */}
          <h1 className="line-clamp-2 break-words text-[20px] font-extrabold leading-[1.15] tracking-[-0.01em]">{titel}</h1>
        </div>
      </div>
      {(rechts || onSchliessen) && (
        <div className="flex shrink-0 items-center gap-3.5">
          {rechts}
          {onSchliessen && <RundTaste onClick={onSchliessen} label={t.allgemein.schliessen}>{Zeichen.Kreuz()}</RundTaste>}
        </div>
      )}
    </header>
  );
}

/**
 * Adresse in Vierergruppen. Die ersten und die letzten beiden Gruppen sind
 * hervorgehoben -- das Auge findet Anfang und Ende, die Mitte bleibt
 * trotzdem ganz lesbar. Fuer Vorleseprogramme steht die Adresse am Stueck.
 */
export function AdresseVierer({ adresse, className = '', mittig = false, gross = false }: {
  adresse: string; className?: string; mittig?: boolean; gross?: boolean;
}) {
  const g = vierer(adresse);
  return (
    <div role="group" aria-label={adresse}
         className={`flex flex-wrap font-mono leading-[1.35] ${gross ? 'gap-x-3 gap-y-1.5 text-[15px]' : 'gap-x-[11px] gap-y-1 text-[14.5px]'} ${
           mittig ? 'justify-center' : ''} ${className}`}>
      {g.map((teil, i) => (
        <span key={i} aria-hidden="true"
              className={i < 2 || i >= g.length - 2 ? 'font-medium text-text' : 'text-dim'}>{teil}</span>
      ))}
    </div>
  );
}

/**
 * Kachel einer Gegenseite: Farbkachel aus der Adresse, mit kleinem Pfeil
 * fuer die Richtung. Mining hat keine Gegenseite -- dort ein Wuerfel.
 */
export function Gegenkachel({ adresse, richtung, size = 44 }: {
  adresse: string | null; richtung?: 'ein' | 'aus' | 'wartet'; size?: number;
}) {
  return (
    <span aria-hidden="true" className="relative shrink-0" style={{ width: size, height: size }}>
      <Identicon adresse={adresse} size={size} />
      {richtung && (
        <span className={`absolute -bottom-[5px] -right-[5px] flex h-[21px] w-[21px] items-center justify-center rounded-full bg-surface ${
          richtung === 'ein' ? 'text-proof' : richtung === 'wartet' ? 'warte-text' : 'text-text'}`}>
          {richtung === 'ein' ? Zeichen.Runter(12, 2.8) : richtung === 'wartet' ? Zeichen.Uhr(12, 2.6) : Zeichen.Hoch(12, 2.8)}
        </span>
      )}
    </span>
  );
}

export function MiningKachel({ size = 44 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center justify-center bg-work/10 text-work"
          style={{ width: size, height: size, borderRadius: Math.round(size * .32) }}>
      {Zeichen.Wuerfel(Math.round(size * .48))}
    </span>
  );
}

/** Zeile "Etikett … Wert" in einer Karte, mit Linie darueber. */
export function WertZeile({ label, children, stark = false, ohneLinie = false }: {
  label: string; children: React.ReactNode; stark?: boolean; ohneLinie?: boolean;
}) {
  return (
    <div className={`flex min-h-[44px] items-center justify-between gap-3 py-1.5 text-[13.5px] ${ohneLinie ? '' : 'border-t border-line'}`}>
      <span className="shrink-0 font-semibold text-dim">{label}</span>
      <span className={`tnum min-w-0 break-words text-right ${stark ? 'font-extrabold' : 'font-bold'}`}>{children}</span>
    </div>
  );
}

/** Platzhalter fuer einen verborgenen Betrag. */
export const PUNKTE = '••••';
