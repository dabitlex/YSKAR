'use client';

import { haptik } from '@/lib/telegram/webapp';

/**
 * Segmentschalter: zwei bis vier gleich breite Wahlmoeglichkeiten
 * (Leistung 25/50/75/100 %, Pool/Solo, Filter). Die Wahl ist blau, der Rest
 * leise. Rolle radiogroup, Pfeiltasten wechseln. Die Spur ist halb
 * durchsichtig, damit sie auf dem Grund UND auf einer Flaeche sichtbar ist.
 * Innenradius 10 px = 14 − 4 (Abstand), damit die Ecken parallel laufen.
 */
export function Segment<T extends string | number>({ werte, wert, onChange, label, disabled }: {
  werte: { v: T; text: string }[];
  wert: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  const i = werte.findIndex(w => w.v === wert);
  const setze = (v: T) => { if (v !== wert) { onChange(v); haptik('auswahl'); } };
  return (
    <div role="radiogroup" aria-label={label}
         className="grid gap-1 rounded-sm border border-[rgb(var(--haar)/.12)] bg-[rgb(var(--haar)/.05)] p-1"
         style={{ gridTemplateColumns: `repeat(${werte.length}, minmax(0, 1fr))` }}
         onKeyDown={e => {
           if (disabled) return;
           if (e.key === 'ArrowRight') setze(werte[Math.min(werte.length - 1, i + 1)].v);
           if (e.key === 'ArrowLeft') setze(werte[Math.max(0, i - 1)].v);
         }}>
      {werte.map(w => {
        const an = w.v === wert;
        return (
          <button key={String(w.v)} type="button" role="radio" aria-checked={an} disabled={disabled}
                  tabIndex={an ? 0 : -1} onClick={() => setze(w.v)}
                  className={`min-h-11 rounded-[10px] text-ys-klein font-medium transition-colors disabled:opacity-40
                              ${an ? 'bg-work text-white' : 'text-dim active:bg-raised'}`}>
            {w.text}
          </button>
        );
      })}
    </div>
  );
}
