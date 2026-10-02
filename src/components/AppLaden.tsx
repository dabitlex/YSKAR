'use client';

import { useEffect, useState } from 'react';
import { plattform } from '@/lib/native/plattform';
import { neuesteApk, RELEASE_SEITE, type Apk } from '@/lib/native/update';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Primitives';
import { useScrollSperre } from '@/lib/ui/scrollSperre';

/**
 * Hinweis auf die Android-App -- fuer Nutzer, die YSKAR in Telegram oder im
 * Browser auf einem Android-Geraet benutzen.
 *
 * Erscheint einmal von selbst (nach dem ersten Entsperren der Sitzung);
 * "Spaeter" verschiebt ihn um sieben Tage, "Nicht mehr zeigen" fuer immer.
 * Dazu ein fester Eintrag in den Einstellungen, damit er jederzeit
 * wiederzufinden ist.
 *
 * Der Kern ist die Anleitung: Ohne Play Store verlangt Android die Freigabe
 * "Unbekannte Apps installieren" -- fuer die App, aus der der Download
 * kommt. Deshalb steht in Schritt 2 "Telegram" oder "Chrome", je nachdem,
 * wo wir gerade laufen.
 */
const MERKER = 'yskar.apk.hinweis';
const SPAETER_MS = 7 * 24 * 60 * 60 * 1000;

/** Android-Geraet, aber nicht die App selbst? */
export function apkSinnvoll(): boolean {
  if (typeof navigator === 'undefined') return false;
  return plattform() !== 'nativ' && /Android/i.test(navigator.userAgent);
}

function hinweisFaellig(): boolean {
  if (!apkSinnvoll()) return false;
  try {
    const m = localStorage.getItem(MERKER);
    if (m === 'nie') return false;
    if (m && Date.now() < Number(m)) return false;
  } catch { /* egal */ }
  return true;
}

function merken(wert: string) {
  try { localStorage.setItem(MERKER, wert); } catch { /* egal */ }
}

/** Link im System-Browser oeffnen -- in Telegram nicht im eingebauten. */
function oeffnen(url: string) {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  if (tg?.openLink) { tg.openLink(url, { try_instant_view: false }); return; }
  window.open(url, '_blank', 'noopener');
}

/** Von selbst erscheinender Hinweis. Einmal je Faelligkeit. */
export default function AppLadenHinweis() {
  const [offen, setOffen] = useState(false);
  useEffect(() => { if (hinweisFaellig()) setOffen(true); }, []);
  if (!offen) return null;
  return <AppLaden onSchliessen={() => setOffen(false)} auto />;
}

/** Der Hinweis selbst -- auch aus den Einstellungen aufrufbar. */
export function AppLaden({ onSchliessen, auto = false }: { onSchliessen: () => void; auto?: boolean }) {
  const { t } = useT();
  const [apk, setApk] = useState<Apk | null | undefined>(undefined);
  useEffect(() => { neuesteApk().then(setApk); }, []);
  // Die Seite dahinter steht still, solange der Hinweis offen ist.
  useScrollSperre(true);

  const quelle = plattform() === 'telegram' ? 'Telegram' : 'Chrome';
  const url = apk?.url ?? RELEASE_SEITE;

  const spaeter = () => { merken(String(Date.now() + SPAETER_MS)); onSchliessen(); };
  const nie = () => { merken('nie'); onSchliessen(); };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(15,27,46,.45)] p-3 sm:items-center"
         role="dialog" aria-modal="true" aria-labelledby="apk-titel"
         onClick={auto ? spaeter : onSchliessen}>
      <div className="rise max-h-[92vh] w-full max-w-[440px] overflow-y-auto overscroll-contain rounded-[24px] bg-surface p-5 shadow-[0_18px_50px_rgba(15,27,46,.25)]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <img src="/marke/kristall.png" alt="" width={52} height={34} style={{ objectFit: 'contain' }} />
          <div className="min-w-0">
            <h2 id="apk-titel" className="text-[19px] font-extrabold leading-tight tracking-tight">{t.apk.titel}</h2>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-dim">{t.apk.text}</p>
          </div>
        </div>

        <p className="mt-3 text-[12px] font-semibold text-faint">
          {apk === undefined ? t.apk.versionSucht : apk ? t.apk.version(apk.version, apk.mb) : ''}
        </p>

        <p className="label mt-4 mb-2">{t.apk.anleitung}</p>
        <ol className="space-y-2.5">
          {[t.apk.schritt1, t.apk.schritt2(quelle), t.apk.schritt3].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-work/10 text-[12px] font-extrabold text-work">{i + 1}</span>
              <span className="text-[13.5px] font-medium leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-[14px] bg-raised px-3.5 py-3 text-[12px] font-medium leading-relaxed text-dim">
          {t.apk.warum}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={() => oeffnen(url)}>{apk ? t.apk.laden : t.apk.seite}</Button>
          <div className="flex gap-2">
            <Button variant="quiet" className="flex-1" onClick={auto ? spaeter : onSchliessen}>{t.apk.spaeter}</Button>
            {auto && <Button variant="quiet" className="flex-1" onClick={nie}>{t.apk.nie}</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
