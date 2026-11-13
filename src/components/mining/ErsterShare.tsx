'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { Blatt } from '@/components/ui/Bausteine';
import { haptik } from '@/lib/telegram/webapp';

/**
 * Der erste Share eines neuen Nutzers ("Erstes Licht").
 *
 * Bis zum ersten Anteil kann es dauern. Der erste angenommene Share ist der
 * fruehere Moment, in dem etwas zurueckkommt -- hier steht in drei Saetzen,
 * was ein Share ist. Gezeigt wird das Blatt einmal je Geraet und nur, solange
 * das Konto noch keinen Eingang hat (wer schon Anteile bekommen hat, kennt
 * Shares).
 */
const MERKER = 'yskar.ersterShare';

export default function ErsterShare({ shares, mining, neu }: {
  shares: number; mining: boolean;
  /** Das Konto ist geladen und hat noch keinen Verlauf. */
  neu: boolean;
}) {
  const { t } = useT();
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    if (!mining || !neu || shares < 1) return;
    try {
      if (localStorage.getItem(MERKER)) return;
      localStorage.setItem(MERKER, '1');
    } catch { return; }
    haptik('erfolg');
    setOffen(true);
  }, [mining, neu, shares]);
  return (
    <Blatt offen={offen} onSchliessen={() => setOffen(false)}>
      <p className="flex items-center gap-2 text-[13.5px] font-medium text-lamp">
        <span className="h-[7px] w-[7px] rounded-full bg-lamp" aria-hidden="true" />{t.licht.ersterEtikett}
      </p>
      <h2 className="mt-3 text-[24px] font-[350] leading-[1.14] tracking-[-.026em]">{t.licht.ersterTitel}</h2>
      <p className="mt-3 text-[15px] leading-[1.5] text-lese">{t.licht.ersterText}</p>
      <button type="button" onClick={() => setOffen(false)}
              className="mt-7 flex min-h-[56px] w-full items-center justify-center rounded-full bg-lamp text-[17px] font-semibold tracking-[-.01em] text-lamp-ink active:scale-[.985]">
        {t.rd.w.verstanden}
      </button>
    </Blatt>
  );
}
