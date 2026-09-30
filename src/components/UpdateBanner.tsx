'use client';

import { useEffect, useState } from 'react';
import { istNativ } from '@/lib/native/plattform';
import { updatePruefen, updateOeffnen, type Update } from '@/lib/native/update';
import { useT } from '@/i18n';

/**
 * Hinweis auf eine neue App-Version (nur Android-App).
 *
 * Einmal je Start geprueft, einmal je Version weggewischt: Wer den Hinweis
 * schliesst, sieht ihn fuer DIESE Version nicht wieder -- fuer die naechste
 * schon.
 */
const MERKER = 'yskar.update.weg';

export default function UpdateBanner() {
  const [u, setU] = useState<Update | null>(null);
  const { t } = useT();

  useEffect(() => {
    if (!istNativ()) return;
    updatePruefen().then(up => {
      if (!up) return;
      try { if (localStorage.getItem(MERKER) === up.version) return; } catch { /* egal */ }
      setU(up);
    });
  }, []);

  if (!u) return null;
  return (
    <div className="rise mb-4 flex items-center gap-3 rounded-[16px] border border-work/30
                    bg-work/10 px-4 py-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-extrabold text-work">{t.app.updateTitel(u.version)}</span>
        <span className="text-[12px] font-semibold text-dim">{t.app.updateText(u.aktuell)}</span>
      </span>
      <span className="flex-1" />
      <button onClick={() => updateOeffnen(u.url)}
              className="rounded-[10px] bg-work px-3 py-2 text-[12.5px] font-bold text-white">{t.app.updateLaden}</button>
      <button onClick={() => { try { localStorage.setItem(MERKER, u.version); } catch { /* egal */ } setU(null); }}
              aria-label={t.app.spaeter} className="px-1 text-[18px] text-faint">×</button>
    </div>
  );
}
