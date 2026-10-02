'use client';

import { useT } from '@/i18n';
import type { Taste } from '@/lib/wallet/ziffern';
import { Zeichen } from '@/components/wallet/Teile';

/**
 * Ziffernfeld fuer Betraege: 1 bis 9, Dezimalzeichen, 0, Loeschen.
 *
 * Die Logik liegt in lib/wallet/ziffern.ts; hier sind nur die Tasten. Das
 * Dezimalzeichen ist das der gewaehlten Sprache -- Komma im Deutschen,
 * Punkt im Englischen.
 */
const REIHE: Taste[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'komma', '0', 'loeschen'];

export default function Ziffernfeld({ onTaste, zeichen }: {
  onTaste: (t: Taste) => void; zeichen: string;
}) {
  const { t } = useT();
  return (
    <div role="group" aria-label={t.senden.ziffern} className="grid grid-cols-3 gap-2">
      {REIHE.map(k => (
        <button key={k} type="button" onClick={() => onTaste(k)}
                aria-label={k === 'komma' ? t.senden.komma : k === 'loeschen' ? t.senden.loeschen : undefined}
                className="panel flex h-[50px] items-center justify-center !rounded-[16px] !shadow-none text-[22px] font-bold
                           transition-transform active:scale-95 active:bg-raised"
                style={{ height: 'clamp(42px, 6.2dvh, 50px)' }}>
          {k === 'komma' ? zeichen : k === 'loeschen' ? Zeichen.Loeschen() : k}
        </button>
      ))}
    </div>
  );
}
