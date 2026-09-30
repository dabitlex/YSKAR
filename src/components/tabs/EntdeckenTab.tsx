'use client';

import { useEffect, useState } from 'react';
import { Panel, GroupTitle, Notice, Icon, SubHeader } from '@/components/ui/Primitives';
import { TopBar } from '@/components/ui/Chrome';
import Artikel, { FARBE } from '@/components/Artikel';
import { inhalte, type Neuigkeit } from '@/content/entdecken';
import { useT } from '@/i18n';
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
  const { t, sprache, locale, zahl } = useT();
  const { ARTIKEL, FAQ, NEUIGKEITEN } = inhalte(sprache, locale);
  // Neuigkeiten vom Server (Tabelle chain2.news); bis sie da sind, die aus dem Code.
  const [news, setNews] = useState<Neuigkeit[]>(NEUIGKEITEN);
  useEffect(() => {
    let lebt = true;
    setNews(NEUIGKEITEN);
    fetch(`/api/v2/news?sprache=${sprache}`).then(r => r.json())
      .then(d => { if (lebt && Array.isArray(d.news) && d.news.length) setNews(d.news); })
      .catch(() => {});
    return () => { lebt = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprache]);
  const datumKurz = (iso: string) => {
    const d = new Date(iso.slice(0, 10) + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (ansicht.art === 'artikel') {
    const a = ARTIKEL.find(x => x.slug === ansicht.slug);
    if (a) return <Artikel artikel={a} onZurueck={() => setAnsicht({ art: 'liste' })} />;
  }
  if (ansicht.art === 'faq') {
    const f = FAQ[ansicht.i];
    return (
      <>
        <SubHeader titel={t.entdecken.faq} onZurueck={() => setAnsicht({ art: 'liste' })} />
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
      <TopBar titel={t.entdecken.titel} rechts={
        <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                className="flex h-9 w-9 items-center justify-center rounded-full border
                           border-line bg-surface text-dim">{Icon.Zahnrad}</button>
      } />

      <button onClick={() => setAnsicht({ art: 'artikel', slug: 'tokenomics' })}
              className="hero rise w-full p-5 text-left active:scale-[.99]">
        <div className="flex items-baseline justify-between">
          <span className="label !text-white/60">{t.entdecken.halving}</span>
          <span className="text-[11.5px] font-bold text-white/70">
            {t.entdecken.season(Math.floor(hoehe / SEASON_BLOCKS) + 1)}
          </span>
        </div>
        <p className="mt-2 text-[17px] font-bold leading-snug">
          {t.entdecken.nochVor}<b className="tnum font-extrabold">{zahl(rest)}</b>{t.entdecken.nochNach(zahl(jetzt / 2), symbol)}
        </p>
        <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-[width] duration-700"
               style={{ width: `${Math.max(1.5, anteil)}%` }} />
        </div>
        <p className="tnum mt-2 text-[11.5px] font-semibold text-white/70">
          {t.entdecken.blockVon(zahl(inEpoche), zahl(EPOCH_BLOCKS))}
          {' · '}{anteil.toFixed(1)} %
        </p>
      </button>

      <GroupTitle>{t.entdecken.verstehen}</GroupTitle>
      <ThemenRaster onOeffnen={slug => setAnsicht({ art: 'artikel', slug })} />

      <GroupTitle>{t.entdecken.faq}</GroupTitle>
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

      <GroupTitle>{t.entdecken.neuigkeiten}</GroupTitle>
      <Panel className="rise rise-3 !p-0">
        <ul className="divide-y divide-line">
          {news.map((n, k) => (
            <li key={k} className="flex gap-3 px-4 py-3.5">
              <span className="tnum w-16 shrink-0 pt-0.5 text-[11px] font-bold text-faint">{datumKurz(n.datum)}</span>
              <span>
                <span className="block text-[14px] font-extrabold">{n.titel}</span>
                <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-dim">{n.text}</p>
                {n.link && <a href={n.link} target="_blank" rel="noreferrer"
                              className="mt-1 inline-block text-[12.5px] font-bold text-work">{t.entdecken.mehrLink}</a>}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <GroupTitle>{t.entdecken.mehr}</GroupTitle>
      <Panel className="!p-0">
        <ul className="divide-y divide-line">
          <li><a href="/explorer.html" className="flex items-center justify-between px-4 py-3.5 text-[14px] font-bold">
            {t.entdecken.explorer} <span className="text-faint">›</span></a></li>
          <li><a href="https://github.com/dabitlex/YSKAR" target="_blank" rel="noreferrer"
                 className="flex items-center justify-between px-4 py-3.5 text-[14px] font-bold">
            {t.entdecken.github} <span className="text-faint">›</span></a></li>
          <li><button onClick={onEinstellungen}
                      className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[14px] font-bold">
            {t.allgemein.einstellungen} <span className="text-faint">›</span></button></li>
        </ul>
      </Panel>

      <div className="mt-5">
        <Notice>{t.entdecken.hinweis}</Notice>
      </div>
    </>
  );
}

/** Die sechs Themen als Kacheln. Auch vor der Wallet-Erstellung nutzbar. */
export function ThemenRaster({ onOeffnen }: { onOeffnen: (slug: string) => void }) {
  const { sprache, locale } = useT();
  const { ARTIKEL } = inhalte(sprache, locale);
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
