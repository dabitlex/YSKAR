'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useT } from '@/i18n';
import { ExternLink, EXPLORER_URL } from '@/components/ui/ExternLink';
import { haptik } from '@/lib/telegram/webapp';

/**
 * Der Pool hat einen Block gefunden, und ein Teil davon gehoert dieser
 * Adresse. Fuer jemanden, der gerade angefangen hat, ist das der Moment,
 * in dem aus "das Telefon rechnet" ein Guthaben wird -- deshalb eine
 * Vollflaeche, wie beim eigenen Blockfund.
 *
 * Die Zahl kommt aus dem Verlauf des Kontos, also aus der Kette -- nicht
 * aus einer Schaetzung.
 */
export default function PoolAuszahlung({ hoehe, betrag, symbol, onWeiter }: {
  hoehe: number; betrag: number; symbol: string; onWeiter: () => void;
}) {
  const { t, zahl } = useT();
  useEffect(() => { haptik('erfolg'); }, []);
  const text = zahl(betrag, { maximumFractionDigits: betrag < 1 ? 6 : 4 });
  return (
    <div className="thema-dunkel fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center">
      <div className="pointer-events-none absolute left-1/2 top-[45%] h-[510px] w-[510px] -translate-x-1/2 -translate-y-1/2 rounded-full"
           style={{ background: 'radial-gradient(circle, rgb(var(--proof)/.28), transparent 65%)' }} />
      <Image src="/marke/kristall.png" alt="" width={96} height={62} className="zoom relative"
             style={{ width: 96, height: 62, objectFit: 'contain' }} />
      <p className="rise relative mt-6 text-[13px] font-extrabold tracking-[.14em] text-proof">{t.auszahlung.titel}</p>
      <p className="zoom tnum relative mt-3.5 text-[60px] font-extrabold leading-none tracking-[-0.04em]">#{zahl(hoehe)}</p>
      <p className="rise rise-2 relative mt-3.5 text-[24px] font-extrabold text-proof">{t.auszahlung.betrag(text, symbol)}</p>
      <p className="rise rise-3 relative mt-2.5 max-w-[320px] text-[13.5px] font-semibold leading-[1.5] text-dim">{t.auszahlung.text}</p>
      <div className="relative mt-9 flex w-full max-w-xs flex-col gap-2.5">
        <button type="button" onClick={onWeiter}
                className="flex h-[52px] items-center justify-center rounded-[18px] border border-line bg-surface text-[15px] font-extrabold">
          {t.auszahlung.weiter}
        </button>
        <ExternLink href={`${EXPLORER_URL}#block-${hoehe}`} className="text-[13px] font-bold text-work">
          {t.auszahlung.explorer}
        </ExternLink>
      </div>
    </div>
  );
}
