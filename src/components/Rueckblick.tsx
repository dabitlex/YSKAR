'use client';

import { useEffect, useState } from 'react';
import { Blatt } from '@/components/ui/Bausteine';
import { useT } from '@/i18n';
import { imTelegram } from '@/lib/telegram/webapp';
import { istNativ } from '@/lib/native/plattform';

/**
 * "Willkommen zurueck": In Telegram stoppt das Mining, wenn die Mini App
 * geschlossen wird. Beim naechsten Oeffnen zeigen wir einmal, was die
 * letzte Sitzung geschafft hat -- Dauer und angenommene Shares, beides
 * gemessen, nichts geschaetzt.
 *
 * Nur in Telegram, nicht in der Android-App (die minet im Hintergrund weiter).
 * Reine Anzeige; liest nur, was die App selbst mitschreibt.
 */
const SCHLUESSEL = 'yskar.rueckblick';
type Sitzung = { start: number; ende: number; shares: number };

export default function Rueckblick({ mining, seit, shares, onWeiter }: {
  mining: boolean; seit: number | null; shares: number; onWeiter: () => void;
}) {
  const { t, zahl } = useT();
  const [alt, setAlt] = useState<Sitzung | null>(null);

  // Beim Oeffnen: die letzte Sitzung einmal abholen und loeschen.
  useEffect(() => {
    if (!imTelegram() || istNativ()) return;
    try {
      const roh = localStorage.getItem(SCHLUESSEL);
      localStorage.removeItem(SCHLUESSEL);
      if (!roh) return;
      const s = JSON.parse(roh) as Sitzung;
      const dauer = s.ende - s.start;
      // Nur zeigen, wenn es sich lohnt: mindestens 2 Minuten, hoechstens 7 Tage her.
      if (dauer >= 120_000 && Date.now() - s.ende < 7 * 86_400_000) setAlt(s);
    } catch { /* privates Fenster */ }
  }, []);

  // Waehrend des Minens mitschreiben, damit es beim Schliessen schon da ist.
  useEffect(() => {
    if (!mining || !seit || !imTelegram() || istNativ()) return;
    const schreiben = () => {
      try { localStorage.setItem(SCHLUESSEL, JSON.stringify({ start: seit, ende: Date.now(), shares })); } catch { /* egal */ }
    };
    schreiben();
    const id = setInterval(schreiben, 10_000);
    return () => clearInterval(id);
  }, [mining, seit, shares]);

  const r = t.rd.zurueck;
  const min = alt ? Math.round((alt.ende - alt.start) / 60_000) : 0;
  const dauer = min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  return (
    <Blatt offen={!!alt} onSchliessen={() => setAlt(null)}>
      <p className="label">{r.etikett}</p>
      <h2 className="aussage mt-3 text-[33px] leading-[1.05] tracking-[-.036em]">{r.titel}</h2>
      <p className="mt-3 text-[15px] leading-[1.5] text-lese">{r.text}</p>
      <div className="mt-5 grid grid-cols-2 border-y border-line">
        <div className="flex flex-col gap-1.5 py-3.5">
          <span className="text-[12.5px] text-dim">{r.dauer}</span>
          <span className="tnum font-mono text-[16.5px]">{dauer}</span>
        </div>
        <div className="flex flex-col gap-1.5 border-l border-line py-3.5 pl-3.5">
          <span className="text-[12.5px] text-dim">{r.shares}</span>
          <span className="tnum font-mono text-[16.5px]">{alt ? zahl(alt.shares) : '—'}</span>
        </div>
      </div>
      <p className="mt-4 text-[13.5px] leading-[1.5] text-dim">{r.android}</p>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={() => { setAlt(null); onWeiter(); }}
                className="flex min-h-[56px] items-center justify-center rounded-full bg-lamp text-[15.5px] font-semibold text-lamp-ink active:scale-[.985]">
          {r.weiter}
        </button>
        <button type="button" onClick={() => setAlt(null)} className="h-11 text-[15.5px] font-medium text-text underline decoration-text/40 underline-offset-4">{r.nichtJetzt}</button>
      </div>
    </Blatt>
  );
}
