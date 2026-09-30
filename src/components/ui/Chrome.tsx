'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

/**
 * Rahmen der App: Navigationsleiste, Kopfzeile, Startbild.
 */

export type Tab = 'home' | 'mining' | 'wallet' | 'netz' | 'entdecken';

const PUNKTE: { key: Tab; label: string; pfad: React.ReactNode }[] = [
  { key: 'home', label: 'Home',
    pfad: <path d="M3 10.5 11 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1z" /> },
  { key: 'mining', label: 'Mining',
    pfad: <path d="M12 2 5 13h5l-1 7 8-11h-5l1-7z" /> },
  { key: 'wallet', label: 'Wallet',
    pfad: <><rect x="2.5" y="5.5" width="17" height="12" rx="3" /><path d="M15 11.5h2.5" /></> },
  { key: 'netz', label: 'Netz',
    pfad: <path d="M11 3 4 7v8l7 4 7-4V7zM4 7l7 4 7-4M11 11v8" /> },
  { key: 'entdecken', label: 'Entdecken',
    pfad: <><circle cx="11" cy="11" r="8.5" /><path d="m14 8-1.5 4.5L8 14l1.5-4.5z" /></> },
];

/**
 * Navigationsleiste.
 *
 * Der aktive Reiter bekommt Farbe UND kraeftigeren Strich. Farbe allein ist
 * auf kleinen Symbolen schwer zu erkennen -- und fuer Farbenblinde gar nicht.
 */
export function BottomNav({ aktiv, onWechsel }: {
  aktiv: Tab; onWechsel: (t: Tab) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line
                    rand-unten bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md gap-1 px-2 py-1.5">
        {PUNKTE.map(p => {
          const an = aktiv === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onWechsel(p.key)}
              aria-current={an ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-[12px] py-2
                          transition-colors ${an ? 'text-work' : 'text-faint active:bg-raised'}`}
            >
              <svg viewBox="0 0 22 22" width="22" height="22" fill="none"
                   stroke="currentColor" strokeWidth={an ? 2 : 1.7}
                   strokeLinecap="round" strokeLinejoin="round">
                {p.pfad}
              </svg>
              <span className="text-[10.5px] font-bold">{p.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Kopfzeile eines Reiters: Titel links, Zustand rechts. */
export function TopBar({ titel, rechts }: { titel: string; rechts?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between">
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">{titel}</h1>
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
 * Das Bild fuellt den ganzen Bildschirm. Es ist 858 x 1834 Pixel, also
 * schmaler als die meisten Telefone hoch sind; object-cover schneidet am
 * Rand ein wenig Berg ab, der Kristall und die Wortmarke bleiben in der
 * Mitte. Weiss dahinter, damit beim Laden nichts Dunkles aufblitzt.
 */
export function Splash() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <Image src="/marke/splash.jpg" alt="YSKAR — Gemeinsam. Dezentral. Stark."
             fill priority sizes="100vw"
             style={{ objectFit: 'cover', objectPosition: 'center 46%' }} />
      <div className="absolute inset-x-6 bottom-[calc(56px+var(--unten))]
                      flex flex-col items-center gap-3">
        <div className="relative h-[3px] w-[120px] overflow-hidden rounded-full bg-line">
          <div className="lade absolute left-0 top-0 h-[3px] w-10 rounded-full bg-work" />
        </div>
        <span className="text-[11px] font-bold tracking-[0.18em] text-faint">
          KETTE WIRD GELADEN
        </span>
      </div>
    </main>
  );
}
