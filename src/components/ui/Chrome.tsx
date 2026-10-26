'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';

/**
 * Rahmen der App: Navigationsleiste, Kopfzeile, Startbild.
 */

export type Tab = 'mine' | 'wallet' | 'entdecken' | 'community';

const PUNKTE: { key: Tab; pfad: React.ReactNode }[] = [
  { key: 'mine', pfad: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" /> },
  { key: 'wallet', pfad: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14.5h2" /></> },
  { key: 'entdecken', pfad: <path d="M3 12h4l3-7 4 14 3-7h4" /> },
  { key: 'community', pfad: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.8-3.2 2.9-5 5.5-5s4.7 1.8 5.5 5" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.4c1.6.6 2.7 2.2 3 4.6" /></> },
];

/**
 * Navigationsleiste wie in der YSKAR Wallet: eine schwebende Pille, der
 * aktive Bereich als blaue Pille mit Wort, die anderen nur als Symbol.
 */
export function BottomNav({ aktiv, onWechsel }: {
  aktiv: Tab; onWechsel: (t: Tab) => void;
}) {
  const { t } = useT();
  const name: Record<Tab, string> = { mine: t.rd.nav.mine, wallet: t.nav.wallet, entdecken: t.nav.netz, community: t.nav.community };
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 rand-unten">
      <div className="mx-auto max-w-md px-[18px] pb-[22px]">
      <div className="tabs pointer-events-auto flex h-16 items-center justify-between rounded-[32px] px-[7px]">
        {PUNKTE.map(p => {
          const an = aktiv === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onWechsel(p.key)}
              aria-current={an ? 'page' : undefined}
              aria-label={name[p.key]}
              className={`flex h-[50px] min-w-[56px] items-center justify-center gap-2 rounded-[25px] text-[14.5px] font-semibold
                          transition-colors ${an ? 'bg-work px-5 text-white' : 'text-dim active:bg-raised'}`}
            >
              <svg viewBox="0 0 24 24" width={an ? 20 : 22} height={an ? 20 : 22} fill="none"
                   stroke="currentColor" strokeWidth={an ? 1.8 : 1.6}
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {p.pfad}
              </svg>
              {an && <span>{name[p.key]}</span>}
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
 * Startbild wie in der YSKAR Wallet: nur das grosse Zeichen, es blendet weich
 * ein und waechst dabei leicht. Unten das Motto und ein Ladebalken.
 */
export function Splash() {
  const { t } = useT();
  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink">
      <div className="licht-auf pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
           style={{ background: '#2F7BFF', opacity: .18, filter: 'blur(90px)' }} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marke/zeichen.svg" alt="YSKAR" width={240} height={240} className="atmen"
             style={{ width: 240, height: 240, filter: 'drop-shadow(0 0 28px rgba(47,123,255,.45))' }} />
      </div>
      <p className="licht-auf absolute inset-x-0 bottom-[calc(150px+var(--unten))] text-center font-mono text-[11px] uppercase tracking-[.22em] text-dim">
        proof, not promise
      </p>
      <div className="absolute inset-x-0 bottom-[calc(72px+var(--unten))] flex flex-col items-center gap-3.5">
        <span className="text-[14px] font-semibold text-dim">{t.splash.laedt}</span>
        <div className="relative h-1 w-[208px] overflow-hidden rounded-full bg-raised">
          <div className="lade absolute left-0 top-0 h-1 w-16 rounded-full" style={{ background: 'linear-gradient(90deg,#1B4FD1,#63D8FF)' }} />
        </div>
      </div>
    </main>
  );
}
