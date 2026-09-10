'use client';

import Image from 'next/image';

/**
 * Rahmen der App: Navigationsleiste und Kopfzeile.
 *
 * Vier Reiter, jeder beantwortet eine eigene Frage:
 *   Mining -- arbeitet mein Geraet?
 *   Wallet -- was habe ich?
 *   Netz   -- was macht die Kette?
 *   Info   -- was ist neu?
 *
 * Die Leiste bleibt stehen, waehrend das Mining weiterlaeuft: Der Miner-Hook
 * lebt im Rahmen, nicht im Reiter. Sonst wuerde ein Tabwechsel die Session
 * beenden.
 */

export type Tab = 'mining' | 'wallet' | 'netz' | 'info';

const PUNKTE: { key: Tab; label: string; pfad: string }[] = [
  { key: 'mining', label: 'Mining', pfad: 'M11 2 4 12h5l-1 8 8-10h-5l1-8z' },
  { key: 'wallet', label: 'Wallet', pfad: 'M3 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3zM16 11h3' },
  { key: 'netz',   label: 'Netz',   pfad: 'M11 3 4 7v8l7 4 7-4V7zM4 7l7 4 7-4M11 11v8' },
  { key: 'info',   label: 'Info',   pfad: 'M11 7h.01M10 10h1v5h1M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
];

export function BottomNav({ aktiv, onWechsel }: {
  aktiv: Tab; onWechsel: (t: Tab) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface
                    pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md">
        {PUNKTE.map(p => (
          <button
            key={p.key}
            onClick={() => onWechsel(p.key)}
            aria-current={aktiv === p.key ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 pb-3
                        transition-colors ${
              aktiv === p.key ? 'text-work' : 'text-dim'}`}
          >
            <svg viewBox="0 0 22 22" width="20" height="20" fill="none"
                 stroke="currentColor" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d={p.pfad} />
            </svg>
            <span className="text-[10px]">{p.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Zeichen({ groesse = 64 }: { groesse?: number }) {
  return (
    <Image src="/marke/zeichen.png" alt="YSKAR" width={groesse}
           height={Math.round(groesse * 0.62)} priority
           style={{ height: 'auto' }} />
  );
}

export function Splash() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Image src="/marke/logo.png" alt="YSKAR" width={150} height={150} priority />
      <p className="text-xs tracking-[0.14em] text-dim">proof, not promise</p>
    </main>
  );
}
