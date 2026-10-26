'use client';

import { useEffect } from 'react';
import FundBild from '@/components/FundBild';
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
export default function PoolAuszahlung({ hoehe, betrag, symbol, onWeiter, onWallet }: {
  hoehe: number; betrag: number; symbol: string; onWeiter: () => void; onWallet?: () => void;
}) {
  const { t, zahl } = useT();
  useEffect(() => { haptik('erfolg'); }, []);
  const text = zahl(betrag, { maximumFractionDigits: betrag < 1 ? 6 : 4 });
  return (
    <FundBild etikett={t.auszahlung.titel} betrag={text} symbol={symbol} muenzen={3}
              unter={<><span className="font-mono text-text">#{zahl(hoehe)}</span> · {t.auszahlung.text}</>}
              knopf={t.rd.fund.zurWallet} onKnopf={onWallet ?? onWeiter}
              darunter={<>
                <button type="button" onClick={onWeiter} className="h-11 text-[13.5px] text-dim">{t.auszahlung.weiter}</button>
                <ExternLink href={`${EXPLORER_URL}#block-${hoehe}`} className="text-[13px] text-cyan">{t.auszahlung.explorer}</ExternLink>
              </>} />
  );
}
