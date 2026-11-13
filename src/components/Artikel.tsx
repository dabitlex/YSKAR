'use client';

import { SubHeader, Notice } from '@/components/ui/Primitives';
import type { Artikel as ArtikelDaten, Baustein } from '@/content/entdecken';
import { useT } from '@/i18n';

/**
 * Ein Artikel aus „Entdecken". Reine Darstellung der Datenbausteine --
 * die Inhalte liegen in src/content/entdecken.ts.
 */

export default function Artikel({ artikel, onZurueck, unten }: {
  artikel: ArtikelDaten; onZurueck: () => void; unten?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <>
      <SubHeader titel="" onZurueck={onZurueck}
                 rechts={<span className="text-[13px] text-dim">
                   {t.entdecken.lesezeit(artikel.lesezeit)}</span>} />

      <div className="rise relative">
        <h1 className="aussage text-[38px] leading-[1.04] [text-wrap:balance]">
          {artikel.titel}
        </h1>
        <p className="mt-4 text-[18px] leading-[1.45] tracking-[-.008em] text-lese">
          {artikel.einleitung}
        </p>
      </div>

      <div className="mt-6 space-y-5">
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
      return <p className={`${rise} text-[16px] leading-[1.6] text-lese`}>
        {b.text}</p>;
    case 'kennzahlen':
      return (
        <dl className={`${rise} grid grid-cols-2 border-t border-line`}>
          {b.werte.map((k, n) => (
            <div key={k.label} className={`flex min-w-0 flex-col gap-1.5 border-b border-line py-3.5 ${n % 2 ? 'border-l pl-3.5' : 'pr-3'}`}>
              <dt className="text-[12.5px] text-dim">{k.label}</dt>
              <dd className="tnum font-mono text-[16.5px]">{k.wert}</dd>
            </div>
          ))}
        </dl>
      );
    case 'schritte':
      return (
        <section className={`${rise} pt-2`}>
          <h2 className="text-[24px] font-[350] leading-[1.14] tracking-[-.026em]">{b.titel}</h2>
          <ol className="mt-3.5 border-t border-line">
            {b.punkte.map((p, k) => (
              <li key={k} className="flex items-start gap-3.5 border-b border-line py-3.5">
                <span className="tnum w-[26px] shrink-0 pt-[3px] font-mono text-[13px] text-cyan">
                  {String(k + 1).padStart(2, '0')}
                </span>
                <span className="text-[15.5px] leading-[1.5] text-lese">{p}</span>
              </li>
            ))}
          </ol>
        </section>
      );
    case 'balken': {
      // Das Band der Kette, von hell nach dunkel: jede Halbierung ist ein Schritt weiter.
      const toene = ['bg-[#63D8FF]', 'bg-[#2F7BFF]', 'bg-[#1B4FD1]', 'bg-[#1B4FD1]/70', 'bg-[#1B4FD1]/45', 'bg-[#1B4FD1]/30'];
      return (
        <section className={`${rise} pt-2`}>
          <h2 className="text-[24px] font-[350] leading-[1.14] tracking-[-.026em]">{b.titel}</h2>
          <div className="mt-5 flex h-[96px] items-end gap-1.5 border-b border-line">
            {b.werte.map((w, k) => (
              <div key={k} className={`flex-1 rounded-t-[3px] ${toene[k] ?? toene[5]}`}
                   style={{ height: `${Math.max(3, w.anteil * 100)}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[12px] text-dim">
            {b.werte.filter(w => w.label).map(w => <span key={w.label} className="tnum whitespace-nowrap">{w.label}</span>)}
          </div>
          <p className="mt-3 text-[14.5px] leading-[1.45] text-lese">{b.fuss}</p>
        </section>
      );
    }
    case 'hinweis':
      return <div className={rise}><Notice tone={b.tone ?? 'dim'}>{b.text}</Notice></div>;
  }
}
