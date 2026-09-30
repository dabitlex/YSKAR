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

export default function UpdateBanner() {
  const [u, setU] = useState<Update | null>(null);
  const [lauf, setLauf] = useState<Lauf>({ art: 'ruhe' });
  const takt = useRef<number | null>(null);
  const { t } = useT();

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

  if (!u) return null;
  const text = lauf.art === 'laedt' ? t.app.updateLaedt(lauf.prozent)
    : lauf.art === 'erlaubnis' ? t.app.updateErlaubnis
    : lauf.art === 'fertig' ? t.app.updateInstallieren
    : lauf.art === 'fehler' ? t.app.updateFehler
    : t.app.updateText(u.aktuell);

  return (
    <div className="rise mb-4 flex items-center gap-3 rounded-[16px] border border-work/30
                    bg-work/10 px-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13.5px] font-extrabold text-work">{t.app.updateTitel(u.version)}</span>
        <span className="text-[12px] font-semibold text-dim">{text}</span>
        {lauf.art === 'laedt' && (
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-work/20">
            <span className="block h-full rounded-full bg-work transition-[width]" style={{ width: `${lauf.prozent}%` }} />
          </span>
        )}
      </span>
      <span className="flex-1" />
      <button onClick={laden} disabled={lauf.art === 'laedt'}
              className="shrink-0 rounded-[10px] bg-work px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
        {t.app.updateLaden}
      </button>
      {lauf.art === 'ruhe' && (
        <button onClick={() => { try { localStorage.setItem(MERKER, u.version); } catch { /* egal */ } setU(null); }}
                aria-label={t.app.spaeter} className="px-1 text-[18px] text-faint">×</button>
      )}
    </div>
  );
}
