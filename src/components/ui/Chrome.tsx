'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';

/**
 * Rahmen der App: Navigationsleiste, Kopfzeile, Startbild.
 */

export type Tab = 'mine' | 'wallet' | 'entdecken' | 'community';

const PUNKTE: { key: Tab; pfad: React.ReactNode }[] = [
  // Minen: ein Licht am Ufer -- das Bild, das der Reiter selbst zeigt.
  { key: 'mine', pfad: <><circle cx="12" cy="8.6" r="3.5" /><path d="M3.5 15.4h17M12 18.2v2.6" /></> },
  { key: 'wallet', pfad: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14.5h2" /></> },
  { key: 'entdecken', pfad: <><circle cx="6" cy="7" r="2.3" /><circle cx="18" cy="9" r="2.3" /><circle cx="11" cy="18" r="2.3" /><path d="M8.2 7.5 15.8 8.6M7 9.1l3 6.8M16.6 10.8l-4.2 5.6" /></> },
  { key: 'community', pfad: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.8-3.2 2.9-5 5.5-5s4.7 1.8 5.5 5" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.4c1.6.6 2.7 2.2 3 4.6" /></> },
];

/**
 * Navigationsleiste, gebaut wie die Mitmachen-Leiste der Website: eine
 * schwebende Glas-Pille. Alle vier Bereiche zeigen Symbol und Wort; der
 * aktive ist hell hinterlegt.
 */
export function BottomNav({ aktiv, onWechsel }: {
  aktiv: Tab; onWechsel: (t: Tab) => void;
}) {
  const { t } = useT();
  const name: Record<Tab, string> = { mine: t.rd.nav.mine, wallet: t.nav.wallet, entdecken: t.nav.netz, community: t.nav.community };
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 rand-unten">
      <div className="mx-auto max-w-md px-[14px] pb-5">
      <div className="tabs pointer-events-auto grid h-[66px] grid-cols-4 items-center gap-0.5 rounded-full px-[7px]">
        {PUNKTE.map(p => {
          const an = aktiv === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onWechsel(p.key)}
              aria-current={an ? 'page' : undefined}
              className={`flex h-[52px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-full text-[11.5px] leading-none tracking-[.01em]
                          transition-colors ${an ? 'bg-text/[.12] font-semibold text-text' : 'font-medium text-lese active:bg-text/[.06]'}`}
            >
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none"
                   stroke="currentColor" strokeWidth={an ? 1.7 : 1.5}
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {p.pfad}
              </svg>
              <span className="max-w-full truncate px-1">{name[p.key]}</span>
            </button>
          );
        })}
      </div>
      </div>
    </nav>
  );
}

/** Kopfzeile eines Reiters: Titel links, Zustand rechts. */
export function TopBar({ titel, rechts }: { titel: string; rechts?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{titel}</h1>
      {rechts}
    </header>
  );
}

/**
 * Startbild.
 *
 * Mit Mindestdauer: Ohne sie steht es nur einen Frame, weil Tresor und
 * Plattform synchron gelesen werden -- man saehe es nie. Das Startbild ist
 * der erste Eindruck der Marke, und der darf nicht auf die Rechenzeit des
 * Geraets angewiesen sein.
 */
export function useSplash(mindestensMs = 1100) {
  const [vorbei, setVorbei] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVorbei(true), mindestensMs);
    return () => clearTimeout(id);
  }, [mindestensMs]);
  return vorbei;
}

/**
 * Startbild: das Zeichen frei auf Nacht, ohne Kreis und ohne Schein, darunter
 * der Satz der Website. Unten eine Haarlinie, auf der das Band laeuft.
 */
export function Splash() {
  const { t } = useT();
  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink">
      <div className="absolute inset-x-7 top-[38%] flex -translate-y-1/2 flex-col gap-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marke/zeichen.svg" alt="YSKAR" width={72} height={72} className="atmen" style={{ width: 72, height: 72 }} />
        <p className="aussage licht-auf text-[46px]">Proof,<br />not promise.</p>
      </div>
      <div className="absolute inset-x-7 bottom-[calc(44px+var(--unten))] flex flex-col gap-3">
        <div className="relative h-px overflow-hidden bg-line">
          <div className="lade absolute left-0 top-0 h-px w-1/3" style={{ background: 'linear-gradient(90deg,#1B4FD1,#63D8FF)' }} />
        </div>
        <span className="text-[13.5px] text-lese">{t.splash.laedt}</span>
      </div>
    </main>
  );
}
