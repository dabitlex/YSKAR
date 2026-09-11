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

/**
 * Kopfzeile.
 *
 * Wortmarke als Text statt als Bild: Sie ist bei jeder Pixeldichte scharf,
 * laedt nichts nach und verschiebt das Layout nicht, waehrend ein Bild noch
 * unterwegs ist. Das Logo gehoert auf den Startbildschirm, nicht in jede
 * Kopfzeile.
 */
export function TopBar({ rechts }: { rechts?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-center justify-between px-1">
      <span className="text-[15px] font-medium tracking-[0.14em] text-dim">
        YSKAR
      </span>
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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink px-10">
      <div className="zoom relative">
        {/*
          Der Schein liegt HINTER dem Logo (-z-10) und laesst keine Tipps
          durch. Ein absolut positioniertes Element ueber dem Inhalt wuerde
          sonst Klicks schlucken -- genau das ist uns beim Blockfund passiert.
        */}
        <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl"
             style={{ background:
               'radial-gradient(circle, rgb(var(--work)/.18), transparent 62%)' }} />
        {/*
          Quelle ist 1024 px gross und wird bei 200 dargestellt. Auf Geraeten
          mit dreifacher Pixeldichte bleibt das Zeichen dadurch scharf --
          vorher waren 520 px die Grundlage, und die Kanten wurden weich.
        */}
        <Image src="/marke/logo.png" alt="YSKAR" width={200} height={200}
               priority sizes="200px" />
      </div>
      <p className="rise rise-2 mt-7 text-[11px] tracking-[0.22em] text-faint">
        PROOF, NOT PROMISE
      </p>
    </main>
  );
}
