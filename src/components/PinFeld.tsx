'use client';

import { useEffect, useRef } from 'react';
import { useT } from '@/i18n';
import { Zeichen } from '@/components/wallet/Teile';
import { haptik } from '@/lib/telegram/webapp';

/**
 * PIN-Eingabe mit eigenem Ziffernfeld: sechs Punkte, darunter 1 bis 0.
 *
 * Kein Eingabefeld, also keine Systemtastatur -- so wie in der Wallet aus
 * dem Play Store. Die Tastatur des Telefons zeigt ueber den Ziffern oft
 * Vorschlaege an, und manche Tastaturen merken sich, was getippt wurde.
 *
 * Auf dem Rechner (Telegram Desktop) gehen auch die Zifferntasten: Solange
 * das Feld zu sehen ist, hoert es auf 0-9 und die Ruecktaste.
 */
export const PIN_LAENGE = 6;

const TASTEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'loeschen'] as const;

export default function PinFeld({ wert, onChange, gesperrt = false, fehler = false }: {
  wert: string;
  onChange: (v: string) => void;
  /** Waehrend geprueft oder verschluesselt wird. */
  gesperrt?: boolean;
  /** Kurz rot, nach einer falschen PIN. */
  fehler?: boolean;
}) {
  const { t } = useT();
  const ref = useRef({ wert, onChange, gesperrt });
  ref.current = { wert, onChange, gesperrt };

  const tippen = (k: string) => {
    const { wert: w, onChange: setzen, gesperrt: aus } = ref.current;
    if (aus) return;
    if (k === 'loeschen') { setzen(w.slice(0, -1)); return; }
    if (w.length >= PIN_LAENGE) return;
    haptik('tipp');
    setzen(w + k);
  };

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tippen(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); tippen('loeschen'); }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-0">
      <div role="status" aria-label={t.einstieg.eingegeben(wert.length)}
           className={`flex justify-center gap-4 ${fehler ? 'zittern' : ''}`}>
        {Array.from({ length: PIN_LAENGE }, (_, i) => (
          <span key={i}
                className={`h-3.5 w-3.5 rounded-full transition-colors ${
                  fehler ? 'bg-risk' : i < wert.length ? 'bg-work' : 'border-2 border-line'}`} />
        ))}
      </div>
    </div>
  );
}

/** Das Ziffernfeld allein -- steht unten auf dem Bildschirm, die Punkte oben. */
export function PinTasten({ wert, onChange, gesperrt = false }: {
  wert: string; onChange: (v: string) => void; gesperrt?: boolean;
}) {
  const { t } = useT();
  const tippen = (k: string) => {
    if (gesperrt) return;
    if (k === 'loeschen') { onChange(wert.slice(0, -1)); return; }
    if (wert.length >= PIN_LAENGE) return;
    haptik('tipp');
    onChange(wert + k);
  };
  return (
    <div role="group" aria-label={t.einstieg.ziffern} className="grid grid-cols-3 gap-2.5">
      {TASTEN.map((k, i) => k === '' ? <span key={i} /> : (
        <button key={i} type="button" onClick={() => tippen(k)} disabled={gesperrt}
                aria-label={k === 'loeschen' ? t.einstieg.loeschen : undefined}
                className={`flex items-center justify-center rounded-[18px] text-[24px] font-bold
                            transition-transform active:scale-95 disabled:opacity-50 ${
                  k === 'loeschen' ? 'text-dim' : 'bg-surface text-text active:bg-raised'}`}
                style={{ height: 'clamp(48px, 7.2dvh, 60px)' }}>
          {k === 'loeschen' ? Zeichen.Loeschen() : k}
        </button>
      ))}
    </div>
  );
}
