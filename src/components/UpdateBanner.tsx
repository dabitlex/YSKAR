'use client';

import { useEffect, useRef, useState } from 'react';
import { istNativ } from '@/lib/native/plattform';
import { updatePruefen, updateOeffnen, updateLaden, updateStand, updateInstallieren, type Update }
  from '@/lib/native/update';
import { useT } from '@/i18n';

/**
 * Hinweis auf eine neue App-Version (nur Android-App).
 *
 * Einmal je Start geprueft, einmal je Version weggewischt: Wer den Hinweis
 * schliesst, sieht ihn fuer DIESE Version nicht wieder -- fuer die naechste
 * schon.
 *
 * "Laden" holt die APK in der App und oeffnet den Installer; der Nutzer
 * bestaetigt nur noch. Fehlt das Plugin (aeltere Huelle) oder scheitert der
 * Download, bleibt der Browser-Weg.
 */
const MERKER = 'yskar.update.weg';

type Lauf = { art: 'ruhe' } | { art: 'laedt'; prozent: number } | { art: 'erlaubnis' }
  | { art: 'fertig' } | { art: 'fehler' };

export interface UpdateStand { u: Update | null; lauf: Lauf; laden: () => void; weg: () => void; }

/**
 * Der Stand wird einmal in der App gefuehrt: Die Meldung steht je nach Tab an
 * anderer Stelle, ein laufender Download soll dabei nicht von vorn anfangen.
 */
export function useUpdate(): UpdateStand {
  const [u, setU] = useState<Update | null>(null);
  const [lauf, setLauf] = useState<Lauf>({ art: 'ruhe' });
  const takt = useRef<number | null>(null);

  useEffect(() => {
    if (!istNativ()) return;
    updatePruefen().then(up => {
      if (!up) return;
      try { if (localStorage.getItem(MERKER) === up.version) return; } catch { /* egal */ }
      setU(up);
    });
    return () => { if (takt.current) clearInterval(takt.current); };
  }, []);

  const laden = async () => {
    if (!u) return;
    if (lauf.art === 'fertig') { await updateInstallieren(); return; }
    if (lauf.art === 'fehler') { updateOeffnen(u.url); return; }
    const r = await updateLaden(u);
    if (!r) { updateOeffnen(u.url); return; }
    if (r.status === 'erlaubnis') { setLauf({ art: 'erlaubnis' }); return; }
    setLauf({ art: 'laedt', prozent: 0 });
    takt.current = window.setInterval(async () => {
      const s = await updateStand();
      if (!s) return;
      if (s.status === 'laedt') setLauf({ art: 'laedt', prozent: s.prozent });
      else {
        if (takt.current) clearInterval(takt.current);
        setLauf({ art: s.status === 'fertig' ? 'fertig' : 'fehler' });
      }
    }, 700);
  };

  const weg = () => {
    if (!u) return;
    try { localStorage.setItem(MERKER, u.version); } catch { /* egal */ }
    setU(null);
  };
  return { u, lauf, laden, weg };
}

export default function UpdateBanner({ stand }: { stand: UpdateStand }) {
  const { t } = useT();
  const { u, lauf, laden, weg } = stand;
  if (!u) return null;
  const text = lauf.art === 'laedt' ? t.app.updateLaedt(lauf.prozent)
    : lauf.art === 'erlaubnis' ? t.app.updateErlaubnis
    : lauf.art === 'fertig' ? t.app.updateInstallieren
    : lauf.art === 'fehler' ? t.app.updateFehler
    : t.app.updateText(u.aktuell);

  return (
    <div className="glas rise relative z-[1] mb-4 flex items-center gap-2 rounded-[22px] py-2 pl-4 pr-2">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14.5px] font-medium leading-[1.3] text-text">{t.app.updateTitel(u.version)}</span>
        <span className="text-[13px] leading-[1.4] text-lese">{text}</span>
        {lauf.art === 'laedt' && (
          <span className="faden mt-1.5 block w-full" aria-hidden="true">
            <i className="transition-[width]" style={{ width: `${lauf.prozent}%` }} />
          </span>
        )}
      </span>
      <button onClick={laden} disabled={lauf.art === 'laedt'}
              className="h-11 shrink-0 rounded-full bg-lamp px-4 text-[14.5px] font-semibold text-lamp-ink active:scale-95 disabled:opacity-40">
        {t.app.updateLaden}
      </button>
      {lauf.art === 'ruhe' && (
        <button onClick={weg}
                aria-label={t.app.spaeter} className="flex h-11 w-9 shrink-0 items-center justify-center text-lese">
          <svg viewBox="0 0 22 22" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 5l12 12M17 5 5 17" /></svg>
        </button>
      )}
    </div>
  );
}
