'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

/**
 * Rahmen der App: Navigationsleiste, Kopfzeile, Startbild.
 */

export type Tab = 'mining' | 'wallet' | 'netz' | 'info';

const PUNKTE: { key: Tab; label: string; pfad: string }[] = [
  { key: 'mining', label: 'Mining', pfad: 'M11 2 4 12h5l-1 8 8-10h-5l1-8z' },
  { key: 'wallet', label: 'Wallet', pfad: 'M3 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3zM16 11h3' },
  { key: 'netz',   label: 'Netz',   pfad: 'M11 3 4 7v8l7 4 7-4V7zM4 7l7 4 7-4M11 11v8' },
  { key: 'info',   label: 'Info',   pfad: 'M11 7h.01M10 10h1v5h1M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
];

/**
 * Navigationsleiste.
 *
 * Der aktive Reiter bekommt eine gefuellte Plakette, nicht nur eine andere
 * Farbe. Farbe allein ist auf kleinen Symbolen im Halbdunkel schwer zu
 * erkennen -- und fuer Farbenblinde gar nicht.
 */
export function BottomNav({ aktiv, onWechsel }: {
  aktiv: Tab; onWechsel: (t: Tab) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70
                    bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md gap-1 px-3 py-2">
        {PUNKTE.map(p => {
          const an = aktiv === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onWechsel(p.key)}
              aria-current={an ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-sm py-2
                          transition-colors ${
                an ? 'bg-work/12 text-work' : 'text-faint active:bg-raised'}`}
            >
              <svg viewBox="0 0 22 22" width="21" height="21" fill="none"
                   stroke="currentColor" strokeWidth={an ? 1.9 : 1.6}
                   strokeLinecap="round" strokeLinejoin="round">
                <path d={p.pfad} />
              </svg>
              <span className="text-[10.5px]">{p.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Kopfzeile mit Zeichen links und freiem Platz rechts. */
export function TopBar({ rechts }: { rechts?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-center justify-between px-1">
      <Image src="/marke/zeichen.png" alt="YSKAR" width={62} height={38}
             priority style={{ height: 'auto' }} />
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

export function Splash() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink">
      <div className="zoom relative">
        <div className="absolute inset-0 -z-10 blur-3xl"
             style={{ background: 'radial-gradient(circle, rgb(var(--work)/.16), transparent 65%)' }} />
        <Image src="/marke/logo.png" alt="YSKAR" width={168} height={168} priority />
      </div>
      <p className="rise rise-2 text-[11.5px] tracking-[0.16em] text-faint">
        proof, not promise
      </p>
    </main>
  );
}
