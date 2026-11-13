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
    <div role="group" aria-label={t.senden.ziffern} className="-mx-2 grid grid-cols-3">
      {REIHE.map(k => (
        <button key={k} type="button" onClick={() => onTaste(k)}
                aria-label={k === 'komma' ? t.senden.komma : k === 'loeschen' ? t.senden.loeschen : undefined}
                className="flex items-center justify-center rounded-[16px] text-[29px] font-light text-text
                           transition-[transform,background-color] active:scale-95 active:bg-text/10"
                style={{ height: 'clamp(40px, 6.5dvh, 62px)' }}>
          {k === 'komma' ? zeichen : k === 'loeschen' ? Zeichen.Loeschen(26) : k}
        </button>
      ))}
    </div>
  );
}
