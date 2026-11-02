'use client';

import { useT } from '@/i18n';
import { imTelegram } from '@/lib/telegram/webapp';

/**
 * Kopf einer Unterseite (Ebene 2): Zurueck links, Titel daneben.
 *
 * In Telegram zeigt der Client oben links seine eigene Zurueck-Taste
 * (BackButton, verdrahtet in AppShell ueber useZurueckTaste) -- ein zweiter
 * Pfeil daneben waere doppelt. In der Android-App steht der eigene Pfeil.
 */
export function SeitenKopf({ titel, onZurueck, rechts }: {
  titel: string; onZurueck: () => void; rechts?: React.ReactNode;
}) {
  const { t } = useT();
  const tg = imTelegram();
  return (
    <header className="mb-4 flex min-h-11 items-center gap-3">
      {!tg && (
        <button type="button" onClick={onZurueck} aria-label={t.allgemein.zurueck}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--haar)/.18)] text-text active:scale-95">
          <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 5l-6 6 6 6" /></svg>
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-ys-seite font-semibold">{titel}</h1>
      {rechts}
    </header>
  );
}
