'use client';

import { Panel, SubHeader, Notice, Icon } from '@/components/ui/Primitives';
import type { Artikel as ArtikelDaten, Baustein } from '@/content/entdecken';
import { useT } from '@/i18n';

/**
 * Ein Artikel aus „Entdecken". Reine Darstellung der Datenbausteine --
 * die Inhalte liegen in src/content/entdecken.ts.
 */

export const FARBE = {
  work:  'bg-work/10 text-work',
  proof: 'bg-proof/10 text-proof',
  amber: 'warte',
  ink:   'bg-raised text-text',
} as const;

export default function Artikel({ artikel, onZurueck, unten }: {
  artikel: ArtikelDaten; onZurueck: () => void; unten?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <>
      <SubHeader titel="" onZurueck={onZurueck}
                 rechts={<span className="ys-etikett !text-cyan">
                   {t.entdecken.lesezeit(artikel.lesezeit)}</span>} />

      <div className="rise relative">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-sm
                          ${FARBE[artikel.farbe]}`}>{Icon[artikel.icon]}</span>
        <h1 className="mt-4 text-ys-seite font-semibold leading-[1.15]">
          {artikel.titel}
        </h1>
        <p className="mt-3 text-ys-fliess leading-[1.65] text-dim">
          {artikel.einleitung}
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {artikel.bausteine.map((b, i) => <Stein key={i} b={b} i={i} />)}
      </div>

      {unten && <div className="mt-6">{unten}</div>}
    </>
  );
}

function Stein({ b, i }: { b: Baustein; i: number }) {
  const rise = `rise rise-${Math.min(3, i)}`;
  switch (b.art) {
    case 'absatz':
      return <p className={`${rise} px-0.5 text-ys-fliess leading-[1.65] text-lese`}>
        {b.text}</p>;
    case 'kennzahlen':
      return (
        <dl className={`${rise} grid grid-cols-2 gap-2.5`}>
          {b.werte.map(k => (
            <div key={k.label} className="rounded-sm border border-[rgb(var(--haar)/.12)] bg-surface px-4 py-3.5">
              <dt className="ys-etikett">{k.label}</dt>
              <dd className="tnum mt-1 font-mono text-ys-fliess">{k.wert}</dd>
            </div>
          ))}
        </dl>
      );
    case 'schritte':
      return (
        <Panel className={rise}>
          <h2 className="text-ys-fliess font-semibold">{b.titel}</h2>
          <ol className="mt-3.5 space-y-3">
            {b.punkte.map((p, k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="tnum flex h-[26px] w-[26px] shrink-0 items-center justify-center
                                 rounded-full bg-work/10 text-ys-meta font-semibold text-work">
                  {k + 1}
                </span>
                <span className="text-ys-klein leading-[1.5] text-lese">{p}</span>
              </li>
            ))}
          </ol>
        </Panel>
      );
    case 'balken': {
      const toene = ['bg-work', 'bg-[#5A8AF3]', 'bg-[#8FB0F5]', 'bg-[#B9CCF8]', 'bg-[#DCE6FB]', 'bg-[#DCE6FB]'];
      return (
        <Panel className={rise}>
          <h2 className="text-ys-fliess font-semibold">{b.titel}</h2>
          <div className="mt-4 flex h-[90px] items-end gap-1.5">
            {b.werte.map((w, k) => (
              <div key={k} className={`flex-1 rounded-t-[6px] ${toene[k] ?? toene[5]}`}
                   style={{ height: `${Math.max(3, w.anteil * 100)}%` }} />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-ys-meta text-faint">
            {b.werte.filter(w => w.label).map(w => <span key={w.label}>{w.label}</span>)}
          </div>
          <p className="mt-3 text-ys-klein leading-[1.55] text-dim">{b.fuss}</p>
        </Panel>
      );
    }
    case 'hinweis':
      return <div className={rise}><Notice tone={b.tone ?? 'dim'}>{b.text}</Notice></div>;
  }
}
