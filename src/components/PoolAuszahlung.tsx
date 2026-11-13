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
export default function PoolAuszahlung({ hoehe, betrag, symbol, onWeiter, onWallet, erster }: {
  hoehe: number; betrag: number; symbol: string; onWeiter: () => void; onWallet?: () => void;
  /** Der allererste Mining-Ertrag dieser Wallet: Dann steht das auch da. */
  erster?: boolean;
}) {
  const { t, zahl } = useT();
  useEffect(() => { haptik('erfolg'); }, []);
  const text = zahl(betrag, { maximumFractionDigits: betrag < 1 ? 6 : 4 });
  return (
    <FundBild etikett={erster ? t.licht.ersterAnteil : t.auszahlung.titel} betrag={text} symbol={symbol} muenzen={3}
              unter={<><span className="font-mono text-text">#{zahl(hoehe)}</span> · {t.auszahlung.text}</>}
              knopf={t.rd.fund.zurWallet} onKnopf={onWallet ?? onWeiter}
              darunter={<>
                <button type="button" onClick={onWeiter} className="inline-flex min-h-11 items-center gap-2 text-[14.5px] font-medium text-text underline decoration-text/45 underline-offset-[.24em]">{t.auszahlung.weiter}</button>
                <ExternLink href={`${EXPLORER_URL}#block-${hoehe}`} className="inline-flex min-h-11 items-center text-[13.5px] text-lese">{t.auszahlung.explorer}</ExternLink>
              </>} />
  );
}
