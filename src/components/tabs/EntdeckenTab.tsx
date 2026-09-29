'use client';

import { useState } from 'react';
import { Panel, GroupTitle, Notice, Icon, SubHeader } from '@/components/ui/Primitives';
import { TopBar } from '@/components/ui/Chrome';
import Artikel, { FARBE } from '@/components/Artikel';
import { ARTIKEL, FAQ, NEUIGKEITEN } from '@/content/entdecken';
import { EPOCH_BLOCKS, SEASON_BLOCKS, INITIAL_REWARD } from '@/lib/core/params';
import type { Summary } from '@/hooks/useMining';

/**
 * Entdecken.
 *
 * Der Informationsbereich der App: Was YSKAR ist, wie es funktioniert, was
 * als Naechstes kommt. Fuehrt mit dem Halving-Fortschritt, weil der vom
 * ersten Tag an etwas erzaehlt -- eine Nachrichtenliste waere leer.
 */

type Ansicht = { art: 'liste' } | { art: 'artikel'; slug: string } | { art: 'faq'; i: number };

export default function EntdeckenTab({ summary, decimals, symbol, onEinstellungen }: {
  summary: Summary | null; decimals: number; symbol: string;
  onEinstellungen: () => void;
}) {
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: 'liste' });

  if (ansicht.art === 'artikel') {
    const a = ARTIKEL.find(x => x.slug === ansicht.slug);
    if (a) return <Artikel artikel={a} onZurueck={() => setAnsicht({ art: 'liste' })} />;
  }
  if (ansicht.art === 'faq') {
    const f = FAQ[ansicht.i];
    return (
      <>
        <SubHeader titel="Häufige Fragen" onZurueck={() => setAnsicht({ art: 'liste' })} />
        <h1 className="rise text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">{f.frage}</h1>
        <p className="rise rise-1 mt-4 text-[15px] font-medium leading-[1.65] text-[#2A3A55]">
          {f.antwort}
        </p>
      </>
    );
  }

  const hoehe = summary?.height ?? 0;
  const inEpoche = hoehe % EPOCH_BLOCKS;
  const rest = EPOCH_BLOCKS - inEpoche;
  const anteil = (inEpoche / EPOCH_BLOCKS) * 100;
  const jetzt = Number(summary?.nextReward ?? INITIAL_REWARD) / 10 ** decimals;

  return (
    <>
      <TopBar titel="Entdecken" rechts={
        <button onClick={onEinstellungen} aria-label="Einstellungen"
                className="flex h-9 w-9 items-center justify-center rounded-full border
                           border-line bg-surface text-dim">{Icon.Zahnrad}</button>
      } />

      <button onClick={() => setAnsicht({ art: 'artikel', slug: 'tokenomics' })}
              className="hero rise w-full p-5 text-left active:scale-[.99]">
        <div className="flex items-baseline justify-between">
          <span className="label !text-white/60">Halving</span>
          <span className="text-[11.5px] font-bold text-white/70">
            Season {Math.floor(hoehe / SEASON_BLOCKS) + 1}
          </span>
        </div>
        <p className="mt-2 text-[17px] font-bold leading-snug">
          Noch <b className="tnum font-extrabold">{rest.toLocaleString('de-DE')}</b> Blöcke
          bis zur Halbierung auf {(jetzt / 2).toLocaleString('de-DE')} {symbol}.
        </p>
        <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-[width] duration-700"
               style={{ width: `${Math.max(1.5, anteil)}%` }} />
        </div>
        <p className="tnum mt-2 text-[11.5px] font-semibold text-white/70">
          Block {inEpoche.toLocaleString('de-DE')} von {EPOCH_BLOCKS.toLocaleString('de-DE')}
          {' · '}{anteil.toFixed(1)} %
        </p>
      </button>

      <GroupTitle>YSKAR verstehen</GroupTitle>
      <ThemenRaster onOeffnen={slug => setAnsicht({ art: 'artikel', slug })} />

      <GroupTitle>Häufige Fragen</GroupTitle>
      <Panel className="rise rise-2 !p-0">
        <ul className="divide-y divide-line">
          {FAQ.map((f, i) => (
            <li key={i}>
              <button onClick={() => setAnsicht({ art: 'faq', i })}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5
                                 text-left text-[14px] font-bold active:bg-raised">
                {f.frage} <span className="text-[18px] text-faint">›</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <GroupTitle>Neuigkeiten</GroupTitle>
      <Panel className="rise rise-3 !p-0">
        <ul className="divide-y divide-line">
          {NEUIGKEITEN.map((n, k) => (
            <li key={k} className="flex gap-3 px-4 py-3.5">
              <span className="tnum w-16 shrink-0 pt-0.5 text-[11px] font-bold text-faint">{n.datum}</span>
              <span>
                <span className="block text-[14px] font-extrabold">{n.titel}</span>
                <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-dim">{n.text}</p>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <GroupTitle>Mehr</GroupTitle>
      <Panel className="!p-0">
        <ul className="divide-y divide-line">
          <li><a href="/explorer.html" className="flex items-center justify-between px-4 py-3.5 text-[14px] font-bold">
            Block Explorer öffnen <span className="text-faint">›</span></a></li>
          <li><a href="https://github.com/dabitlex/YSKAR" target="_blank" rel="noreferrer"
                 className="flex items-center justify-between px-4 py-3.5 text-[14px] font-bold">
            Quelltext auf GitHub <span className="text-faint">›</span></a></li>
          <li><button onClick={onEinstellungen}
                      className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[14px] font-bold">
            Einstellungen <span className="text-faint">›</span></button></li>
        </ul>
      </Panel>

      <div className="mt-5">
        <Notice>
          YSKAR ist ein Projekt, kein Zahlungsmittel. Die Arbeit ist echt und
          nachrechenbar — mehrere Knoten prüfen jeden Block unabhängig.
        </Notice>
      </div>
    </>
  );
}

/** Die sechs Themen als Kacheln. Auch vor der Wallet-Erstellung nutzbar. */
export function ThemenRaster({ onOeffnen }: { onOeffnen: (slug: string) => void }) {
  return (
    <div className="rise rise-1 grid grid-cols-2 gap-2.5">
      {ARTIKEL.map(a => (
        <button key={a.slug} onClick={() => onOeffnen(a.slug)}
                className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface
                           p-4 text-left active:bg-raised">
          <span className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${FARBE[a.farbe]}`}>
            {Icon[a.icon]}
          </span>
          <span className="text-[14px] font-extrabold leading-[1.3]">{a.titel}</span>
          <span className="text-[12px] font-semibold leading-[1.45] text-dim">{a.teaser}</span>
        </button>
      ))}
    </div>
  );
}
