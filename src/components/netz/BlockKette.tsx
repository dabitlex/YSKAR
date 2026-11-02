'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { Flaeche, Abschnitt, Fortschritt } from '@/components/ys';

/**
 * Die Kette als Bild (Markenelement aus Konzept B): die letzten zwei Bloecke
 * als Glieder, rechts der naechste, der gerade entsteht -- gestrichelt, mit
 * der Zeit seit dem letzten Block. Darunter der Weg zur Zielzeit (10 min).
 *
 * Reine Anzeige aus /api/v2/blocks (derselbe Abruf wie die Netz-Details,
 * nur kuerzer). Antippen fuehrt zu den Netz-Details.
 */
interface Glied { height: number; timestamp: string }

const ZIEL_SEK = 600;

export default function BlockKette({ onDetails }: { onDetails: () => void }) {
  const { t, zahl, vorZeit } = useT();
  const [bloecke, setBloecke] = useState<Glied[]>([]);
  const [jetzt, setJetzt] = useState(() => Date.now());

  useEffect(() => {
    let lebt = true;
    const hole = () => fetch('/api/v2/blocks?limit=2')
      .then(r => r.json()).then(d => { if (lebt) setBloecke(d.blocks ?? []); }).catch(() => {});
    hole();
    const id = setInterval(hole, 15_000);
    // Die Minuten seit dem letzten Block zaehlen weiter, auch ohne neuen Abruf.
    const uhr = setInterval(() => setJetzt(Date.now()), 30_000);
    return () => { lebt = false; clearInterval(id); clearInterval(uhr); };
  }, []);

  const letzter = bloecke[0];
  const seit = letzter ? Math.max(0, jetzt / 1000 - Number(letzter.timestamp)) : null;
  const minuten = seit == null ? null : Math.round(seit / 60);
  const kette = [...bloecke].reverse();

  return (
    <Flaeche as="section" className="flex flex-col gap-3 p-4" aria-label={t.ys.netz.ketteAria}>
      <Abschnitt titel={t.netz.letzte} rechts={
        <button type="button" onClick={onDetails} className="-mr-2 flex min-h-11 items-center px-2 text-ys-klein text-cyan">
          {t.entdeckenNeu.details} ›
        </button>} />
      {bloecke.length === 0 ? (
        <p className="py-2 text-ys-meta text-dim">{t.netz.laedt}</p>
      ) : (
        <ol className="flex items-stretch">
          {kette.map((b, i) => (
            <li key={b.height} className="flex min-w-0 flex-1 items-center">
              {i > 0 && <span aria-hidden="true" className="h-px w-1.5 shrink-0 bg-[rgb(var(--haar)/.35)]" />}
              <span className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm border px-2 py-2 ${
                i === kette.length - 1 ? 'border-work/60 bg-work/[.08]' : 'border-[rgb(var(--haar)/.16)] bg-raised'}`}>
                <span className="tnum truncate font-mono text-ys-meta text-text">#{zahl(b.height)}</span>
                <span className="truncate text-[11px] leading-tight text-dim">{vorZeit(b.timestamp)}</span>
              </span>
            </li>
          ))}
          <li className="flex min-w-0 flex-1 items-center">
            <span aria-hidden="true" className="h-px w-1.5 shrink-0 bg-[rgb(var(--haar)/.35)]" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm border border-dashed border-cyan/50 px-2 py-2">
              <span className="truncate font-mono text-ys-meta text-cyan">{t.ys.netz.naechster}</span>
              <span className="tnum truncate text-[11px] leading-tight text-dim">
                {minuten == null ? '—' : t.ys.netz.laeuft(minuten)}
              </span>
            </span>
          </li>
        </ol>
      )}
      <Fortschritt anteil={seit == null ? 0 : seit / ZIEL_SEK} label={t.netz.zielzeit} verlauf />
      <p className="text-ys-meta text-dim">
        {t.netz.zielzeit}
      </p>
    </Flaeche>
  );
}
