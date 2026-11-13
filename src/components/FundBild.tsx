'use client';

import type { ReactNode } from 'react';

/**
 * Vollflaeche fuer einen Fund ("Erstes Licht").
 *
 * Eigener Block (muenzen 5): das Morgengrauen der Website -- derselbe Fjord,
 * hell, mit dunkler Schrift und dunklem Knopf. Anteil aus einem Pool-Block
 * (muenzen 3): der Fjord bei Nacht, der Betrag gross, der Knopf warm.
 */
export default function FundBild({ etikett, betrag, symbol, unter, muenzen, knopf, onKnopf, darunter }: {
  etikett: string; betrag: string; symbol: string; unter?: ReactNode; muenzen: 3 | 5;
  knopf: string; onKnopf: () => void; darunter?: ReactNode;
}) {
  const tag = muenzen === 5;
  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${tag ? 'bg-[#EDF1F7]' : 'bg-ink'}`}
         role="dialog" aria-modal="true" aria-label={etikett}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tag ? '/buehne/fjord-daemmerung.webp' : '/buehne/fjord-nacht.webp'} alt=""
           className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" aria-hidden="true" style={{ background: tag
        ? 'linear-gradient(180deg, rgb(10 21 48 / .42) 0%, rgb(10 21 48 / 0) 40%, rgb(237 241 247 / 0) 58%, rgb(237 241 247 / .86) 78%, #EDF1F7 100%)'
        : 'linear-gradient(180deg, rgb(2 5 15 / .55) 0%, rgb(2 5 15 / 0) 30%, rgb(4 10 26 / 0) 46%, rgb(4 10 26 / .82) 64%, rgb(4 10 26) 82%)' }} />
      <div className="relative mx-auto flex h-full max-w-md flex-col px-6 pb-[calc(28px+var(--unten))] pt-[calc(64px+var(--oben))]">
        <p className={`rise text-[14.5px] font-medium tracking-[.02em] ${tag ? 'text-white' : 'text-lamp'}`}>{etikett}</p>
        <p className="zoom tnum mt-2 flex flex-wrap items-baseline gap-x-3 text-white">
          <span className={`aussage leading-[.9] tracking-[-.06em] ${tag ? 'text-[clamp(84px,30vw,132px)]' : 'text-[clamp(56px,19vw,80px)]'}`}>{tag ? betrag : `+${betrag}`}</span>
          <span className="font-mono text-[17px]">{symbol}</span>
        </p>
        {unter && <div className={`rise rise-2 mt-3 max-w-[330px] text-[14.5px] leading-[1.5] ${tag ? 'text-white [&_*]:!text-white' : 'text-lese'}`}>{unter}</div>}
        <div className={`mt-auto flex flex-col items-center gap-2 ${tag ? 'tag-unten' : ''}`}>
          <button type="button" onClick={onKnopf}
                  className={`flex min-h-[56px] w-full items-center justify-center rounded-full text-[17px] font-semibold tracking-[-.01em] active:scale-[.985] ${tag ? 'tag-knopf' : 'bg-lamp text-lamp-ink'}`}>
            {knopf}
          </button>
          {darunter}
        </div>
      </div>
    </div>
  );
}
