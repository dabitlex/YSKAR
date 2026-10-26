'use client';

import type { ReactNode } from 'react';
import { Boerse, Funken } from '@/components/ui/Marke';

/**
 * Gemeinsame Vollflaeche fuer einen Blockfund: eigener Block (5 Muenzen)
 * oder Anteil aus einem Pool-Block (3 Muenzen). Die Muenzen fallen
 * senkrecht in den Schlitz der schlanken Boerse.
 */
export default function FundBild({ etikett, betrag, symbol, unter, muenzen, knopf, onKnopf, darunter }: {
  etikett: string; betrag: string; symbol: string; unter?: ReactNode; muenzen: 3 | 5;
  knopf: string; onKnopf: () => void; darunter?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-ink px-8 pb-[var(--unten)] pt-[var(--oben)] text-center"
         role="dialog" aria-modal="true" aria-label={etikett}>
      <div className="pointer-events-none absolute left-1/2 top-[40%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
           style={{ background: 'radial-gradient(circle, rgb(var(--work)/.22), transparent 65%)' }} />
      <Funken />
      <p className="rise relative font-mono text-[12px] uppercase tracking-[.16em] text-proof">{etikett}</p>
      <div className="relative mt-4"><Boerse muenzen={muenzen} breite={200} /></div>
      <p className="zoom tnum relative mt-2 flex items-baseline gap-2">
        <span className="text-[52px] font-light leading-none tracking-[-0.04em]">+{betrag}</span>
        <span className="font-mono text-[14px] text-dim">{symbol}</span>
      </p>
      {unter && <div className="rise rise-2 relative mt-3 max-w-[320px] text-[13.5px] leading-[1.5] text-dim">{unter}</div>}
      <div className="relative z-10 mt-9 flex w-full max-w-xs flex-col items-center gap-3">
        <button type="button" onClick={onKnopf}
                className="flex min-h-[56px] w-full items-center justify-center rounded-full bg-text text-[15.5px] font-semibold text-ink active:scale-[.985]">
          {knopf}
        </button>
        {darunter}
      </div>
    </div>
  );
}
