'use client';

import { useEffect, useRef, useState } from 'react';
import { Blatt } from '@/components/ui/Bausteine';
import { useT } from '@/i18n';
import type { Suche } from '@/lib/api/suche';
import { type Zeitraum, IMMER, tage, tagText, tagAus } from '@/lib/wallet/zeitraum';

/*
  Suche und Zeitraum im Wallet-Verlauf.

  Die Lupe oeffnet ein Suchfeld und darunter die Zeitraum-Chips. "Datum …"
  oeffnet ein Blatt mit Schnellwahl und Von/Bis. Ist die Suche zu, stehen
  aktive Filter als Chips ueber der Liste -- man sieht immer, warum die
  Liste kuerzer ist als sonst.

  Gesucht wird auf dem Server im ganzen Verlauf (lib/api/suche.ts,
  Migration 00022). Hier ist nur die Bedienung.
*/

const Lupe = ({ g = 17 }: { g?: number }) => (
  <svg viewBox="0 0 24 24" width={g} height={g} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
  </svg>
);
const Kalender = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
const Kreuz = ({ g = 10 }: { g?: number }) => (
  <svg viewBox="0 0 24 24" width={g} height={g} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

/** Lupe neben "Alle / Eingänge / Ausgänge". Punkt = ein Filter ist aktiv. */
export function SuchKnopf({ offen, aktiv, onClick }: { offen: boolean; aktiv: boolean; onClick: () => void }) {
  const { t } = useT();
  return (
    <button onClick={onClick} aria-label={t.wallet.suchen} aria-expanded={offen}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
              offen ? 'bg-work/10 text-work' : 'bg-raised text-text'}`}>
      <Lupe g={19} />
      {aktiv && !offen && (
        <span className="absolute right-[9px] top-[9px] h-[8px] w-[8px] rounded-full bg-work ring-2 ring-surface" />
      )}
    </button>
  );
}

/** Beschriftung eines Zeitraums: Schnellwahl als Wort, sonst die Tage. */
export function useZeitraumText() {
  const { t, locale } = useT();
  return (z: Zeitraum): string => {
    switch (z.art) {
      case 'immer': return t.wallet.jederzeit;
      case 'heute': return t.wallet.heute;
      case 'tage7': return t.wallet.letzte7;
      case 'tage30': return t.wallet.letzte30;
      case 'monat': return t.wallet.dieserMonat;
      case 'eigen': {
        const [a, b] = tage(z);
        const f = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        if (a && b) {
          if (a.getTime() === b.getTime()) return f.format(a);
          const fr = (f as Intl.DateTimeFormat & { formatRange?: (x: Date, y: Date) => string }).formatRange;
          return fr ? fr.call(f, a, b) : `${f.format(a)} – ${f.format(b)}`;
        }
        if (a) return `${t.wallet.vonDatum} ${f.format(a)}`;
        if (b) return `${t.wallet.bisDatum} ${f.format(b)}`;
        return t.wallet.jederzeit;
      }
    }
  };
}

function Chip({ an, aktiv, onClick, children, label }: {
  an?: boolean; aktiv?: boolean; onClick: () => void; children: React.ReactNode; label?: string;
}) {
  return (
    <button onClick={onClick} aria-pressed={an} aria-label={label}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-1.5 text-[12px] font-extrabold transition-colors ${
              an ? 'bg-work text-white' : aktiv ? 'bg-work/10 text-work' : 'bg-raised text-dim'}`}>
      {children}
    </button>
  );
}

/** Offene Suche: Eingabefeld und Zeitraum-Chips. */
export function SuchLeiste({ eingabe, onEingabe, zeitraum, onZeitraum, onDatum }: {
  eingabe: string; onEingabe: (s: string) => void;
  zeitraum: Zeitraum; onZeitraum: (z: Zeitraum) => void; onDatum: () => void;
}) {
  const { t } = useT();
  const text = useZeitraumText();
  const feld = useRef<HTMLInputElement>(null);
  // Beim Oeffnen gleich tippen koennen.
  useEffect(() => { feld.current?.focus({ preventScroll: true }); }, []);
  const eigen = zeitraum.art === 'heute' || zeitraum.art === 'monat' || zeitraum.art === 'eigen';

  return (
    <div className="pb-1.5 pt-2">
      <label className="flex items-center gap-2 rounded-[14px] border-[1.5px] border-work bg-sunk px-3 py-[9px] text-faint">
        <Lupe g={16} />
        <input ref={feld} value={eingabe} onChange={e => onEingabe(e.target.value)}
               placeholder={t.wallet.suchePlatzhalter} enterKeyHint="search"
               autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={100}
               className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-text outline-none focus-visible:outline-none placeholder:font-sans placeholder:text-[13px] placeholder:font-semibold placeholder:text-faint" />
        {eingabe && (
          <button onClick={() => { onEingabe(''); feld.current?.focus(); }} aria-label={t.wallet.sucheLeeren}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-raised text-dim">
            <Kreuz />
          </button>
        )}
      </label>
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
        <Chip an={zeitraum.art === 'immer'} onClick={() => onZeitraum(IMMER)}>{t.wallet.jederzeit}</Chip>
        <Chip an={zeitraum.art === 'tage7'} onClick={() => onZeitraum({ art: 'tage7' })}>{t.wallet.tage7}</Chip>
        <Chip an={zeitraum.art === 'tage30'} onClick={() => onZeitraum({ art: 'tage30' })}>{t.wallet.tage30}</Chip>
        <Chip an={eigen} onClick={onDatum}><Kalender />{eigen ? text(zeitraum) : t.wallet.datumWaehlen}</Chip>
      </div>
    </div>
  );
}

/** Geschlossene Suche mit aktiven Filtern: je Filter ein Chip mit ✕. */
export function FilterChips({ eingabe, zeitraum, onSucheWeg, onZeitWeg, onOeffnen }: {
  eingabe: string; zeitraum: Zeitraum;
  onSucheWeg: () => void; onZeitWeg: () => void; onOeffnen: () => void;
}) {
  const { t } = useT();
  const text = useZeitraumText();
  const q = eingabe.trim();
  if (!q && zeitraum.art === 'immer') return null;
  const Weg = ({ onClick }: { onClick: () => void }) => (
    <span role="button" tabIndex={0} aria-label={t.wallet.filterEntfernen}
          onClick={e => { e.stopPropagation(); onClick(); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onClick(); } }}
          className="-mr-1 ml-0.5 flex h-4 w-4 items-center justify-center rounded-full"><Kreuz g={9} /></span>
  );
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pt-2 [scrollbar-width:none]">
      {zeitraum.art !== 'immer' && (
        <Chip aktiv onClick={onOeffnen}><Kalender />{text(zeitraum)}<Weg onClick={onZeitWeg} /></Chip>
      )}
      {q && (
        <Chip aktiv onClick={onOeffnen}>
          <span className="max-w-[160px] truncate">„{q}“</span><Weg onClick={onSucheWeg} />
        </Chip>
      )}
    </div>
  );
}

/** Blatt "Zeitraum": Schnellwahl oder Von/Bis mit dem Kalender des Geraets. */
export function ZeitraumBlatt({ offen, zeitraum, onSchliessen, onAnwenden }: {
  offen: boolean; zeitraum: Zeitraum; onSchliessen: () => void; onAnwenden: (z: Zeitraum) => void;
}) {
  const { t } = useT();
  const [wahl, setWahl] = useState<Zeitraum>(zeitraum);
  // Beim Oeffnen mit dem aktuellen Zeitraum beginnen.
  useEffect(() => { if (offen) setWahl(zeitraum); }, [offen, zeitraum]);

  const heute = tagText(new Date());
  const [von, bis] = tage(wahl);
  const vonText = wahl.art === 'eigen' ? wahl.von : von ? tagText(von) : '';
  const bisText = wahl.art === 'eigen' ? wahl.bis : bis ? tagText(bis) : '';
  const setzeTag = (feld: 'von' | 'bis', wert: string) => setWahl({
    art: 'eigen',
    von: feld === 'von' ? wert : vonText,
    bis: feld === 'bis' ? wert : bisText,
  });
  const gueltig = wahl.art !== 'eigen' || !!tagAus(wahl.von) || !!tagAus(wahl.bis);

  const schnell: { z: Zeitraum; text: string }[] = [
    { z: { art: 'heute' }, text: t.wallet.heute },
    { z: { art: 'tage7' }, text: t.wallet.letzte7 },
    { z: { art: 'tage30' }, text: t.wallet.letzte30 },
    { z: { art: 'monat' }, text: t.wallet.dieserMonat },
  ];

  return (
    <Blatt offen={offen} onSchliessen={onSchliessen} titel={t.wallet.zeitraum}
           rechts={
             <button onClick={() => { onAnwenden(IMMER); }} className="text-[13.5px] font-extrabold text-work">
               {t.wallet.zuruecksetzen}
             </button>
           }>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {schnell.map(s => (
          <button key={s.z.art} onClick={() => setWahl(s.z)} aria-pressed={wahl.art === s.z.art}
                  className={`rounded-[14px] px-2 py-3 text-[13.5px] font-extrabold transition-colors ${
                    wahl.art === s.z.art ? 'bg-work/10 text-work ring-[1.5px] ring-inset ring-work' : 'bg-raised text-dim'}`}>
            {s.text}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {(['von', 'bis'] as const).map(feld => (
          <label key={feld} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-faint">
              {feld === 'von' ? t.wallet.vonDatum : t.wallet.bisDatum}
            </span>
            <input type="date" max={heute}
                   value={feld === 'von' ? vonText : bisText}
                   onChange={e => setzeTag(feld, e.target.value)}
                   className="sunk w-full min-w-0 px-3 py-[11px] text-[14px] font-bold text-text outline-none focus:border-work" />
          </label>
        ))}
      </div>
      <p className="mb-4 mt-2.5 text-[12px] font-semibold leading-relaxed text-faint">{t.wallet.zeitraumHinweis}</p>
      <button onClick={() => onAnwenden(wahl)} disabled={!gueltig}
              className="w-full rounded-[16px] bg-work py-3.5 text-[15px] font-extrabold text-white disabled:opacity-50">
        {t.wallet.anwenden}
      </button>
    </Blatt>
  );
}

/** Teil eines Textes hervorheben (erstes Vorkommen, Gross/klein egal). */
function hervor(text: string, teil: string, vonAnfang: boolean): React.ReactNode {
  const i = text.toLowerCase().indexOf(teil.toLowerCase());
  if (i < 0 || (vonAnfang && i !== 0)) return text;
  return <>{text.slice(0, i)}<mark className="rounded-[3px] bg-[#FFE9A8] px-px text-[#0E1A2F]">{text.slice(i, i + teil.length)}</mark>{text.slice(i + teil.length)}</>;
}

const memoText = (hex: string | null | undefined) => {
  if (!hex) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16)));
  } catch { return ''; }
};

/**
 * Untere Zeile eines Treffers: zeigt, WARUM er gefunden wurde -- die
 * passende TxID, Adresse, Notiz oder Blocknummer, mit der Stelle markiert.
 * null = nichts Besonderes, die normale Zeile bleibt.
 */
export function trefferGrund(
  e: { txid: string; height: number; kind: string; counterparty: string | null; memo?: string | null },
  q: string, suche: Suche | null,
  t: { wallet: { block: (h: number) => string; notizKurz: (n: string) => string } },
): React.ReactNode | null {
  if (!suche) return null;
  const klein = q.trim().toLowerCase().replace(/^#/, '');
  if (suche.hoehe !== null && e.height === suche.hoehe) {
    return hervor(t.wallet.block(e.height), String(e.height), false);
  }
  if (suche.txLo && e.txid.startsWith(klein)) {
    const kurz = e.txid.length > 20 ? `${e.txid.slice(0, Math.max(16, klein.length))}…` : e.txid;
    return <>TxID {hervor(kurz, klein, true)}</>;
  }
  if (suche.gegenLo && e.counterparty && e.counterparty.startsWith(klein)) {
    const a = e.counterparty;
    const kurz = klein.length >= a.length - 4 ? a : `${a.slice(0, Math.max(14, klein.length))}…${a.slice(-4)}`;
    return hervor(kurz, klein, true);
  }
  if (suche.memo && (e.kind === 'in' || e.kind === 'out')) {
    const m = memoText(e.memo);
    if (m.toLowerCase().includes(suche.memo.toLowerCase())) {
      const vorlage = t.wallet.notizKurz('\u0000');
      const [vor, nach] = vorlage.split('\u0000');
      return <>{vor}{hervor(m, suche.memo, false)}{nach}</>;
    }
  }
  return null;
}
