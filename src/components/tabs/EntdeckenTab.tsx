'use client';

import { useEffect, useState } from 'react';
import { Panel, GroupTitle, Notice, Icon, SubHeader } from '@/components/ui/Primitives';
import { TopBar } from '@/components/ui/Chrome';
import Artikel, { FARBE } from '@/components/Artikel';
import { inhalte, type Neuigkeit } from '@/content/entdecken';
import { useT } from '@/i18n';
import { EPOCH_BLOCKS, SEASON_BLOCKS, INITIAL_REWARD } from '@/lib/core/params';
import type { Summary } from '@/hooks/useMining';
import { ExternLink, EXPLORER_URL } from '@/components/ui/ExternLink';
import NetzTab from '@/components/tabs/NetzTab';
import { hashrateText } from '@/lib/format/hashrate';
import { useZurueckTaste } from '@/lib/telegram/webapp';
import { MAX_SUPPLY, DECIMALS } from '@/lib/core/params';
import { COMMUNITY } from '@/lib/community';
import NetzStaerken from '@/components/netz/NetzStaerken';

/** V6 (naechste Konsensrevision) wird bei Block 10.000 aktiv -- so steht es auf yskar.app (FAQ). */
const V6_HOEHE = 10_000;
const V6_DOKU = 'https://github.com/dabitlex/YSKAR/blob/consensus-v6/docs/CONSENSUS_V6.md';

/**
 * Entdecken.
 *
 * Der Informationsbereich der App: Was YSKAR ist, wie es funktioniert, was
 * als Naechstes kommt. Fuehrt mit dem Halving-Fortschritt, weil der vom
 * ersten Tag an etwas erzaehlt -- eine Nachrichtenliste waere leer.
 */

type Ansicht = { art: 'liste' } | { art: 'artikel'; slug: string } | { art: 'faq'; i: number } | { art: 'netz' } | { art: 'staerken' };

export default function EntdeckenTab({ summary, decimals, symbol, onEinstellungen, meineAdresse }: {
  summary: Summary | null; decimals: number; symbol: string;
  onEinstellungen: () => void;
  meineAdresse: string | null;
}) {
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: 'liste' });
  useZurueckTaste(ansicht.art !== 'liste', () => setAnsicht({ art: 'liste' }));
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

  if (ansicht.art === 'netz') {
    return (
      <>
        <SubHeader titel={t.entdeckenNeu.details} onZurueck={() => setAnsicht({ art: 'liste' })} />
        <NetzTab summary={summary} meineAdresse={meineAdresse} decimals={decimals} symbol={symbol} ohneKopf />
      </>
    );
  }
  if (ansicht.art === 'staerken') return <NetzStaerken onZurueck={() => setAnsicht({ art: 'liste' })} />;
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
        <p className="rise rise-1 mt-4 text-[15px] font-medium leading-[1.65] text-lese">
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
      <TopBar titel={t.rd.netz.titel} rechts={
        <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-dim active:scale-95">{Icon.Zahnrad}</button>
      } />

      <NetzLive summary={summary} decimals={decimals} />

      {hoehe > 0 && hoehe < V6_HOEHE && (
        <ExternLink href={V6_DOKU} className="rise rise-1 mt-6 flex items-center gap-3.5 rounded-[20px] border border-work/30 bg-work/[.06] px-4 py-3.5">
          <span className="font-mono text-[13px] font-semibold text-cyan">V6</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-medium">{t.rd.netz.v6(zahl(V6_HOEHE))}</span>
            <span className="tnum text-[12.5px] text-dim">{t.rd.netz.v6Rest(zahl(V6_HOEHE - hoehe))}</span>
          </span>
          <span className="text-[16px] text-faint" aria-hidden="true">›</span>
        </ExternLink>
      )}

      <ul className="rise rise-1 mt-6 border-t border-line">
        <Zeile onClick={() => setAnsicht({ art: 'staerken' })} titel={t.rd.netz.wachsen} akzent
               icon={<><circle cx="11" cy="11" r="8.5" /><path d="M2.5 11h17M11 2.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S8.5 5.1 11 2.5z" /></>} />
        <Zeile onClick={() => setAnsicht({ art: 'netz' })} titel={t.entdeckenNeu.details}
               icon={<path d="M3 15l4-5 4 3 4-6 4 4" />} />
        <Zeile href={EXPLORER_URL} titel={t.rd.netz.explorer}
               icon={<path d="M3.5 3.5h6v6h-6zM12.5 3.5h6v6h-6zM3.5 12.5h6v6h-6zM9.5 6.5h3M6.5 9.5v3" />} />
        <Zeile href={COMMUNITY.whitepaper} titel={t.rd.netz.whitepaper}
               icon={<path d="M5.5 2.5h8l3 3v14h-11zM8.5 9.5h5M8.5 12.5h5M8.5 15.5h3" />} />
        <Zeile href={COMMUNITY.website} titel={t.rd.netz.website}
               icon={<><circle cx="11" cy="11" r="8.5" /><path d="M2.5 11h17" /></>} />
      </ul>

      <button onClick={() => setAnsicht({ art: 'artikel', slug: 'tokenomics' })}
              className="rise rise-2 mt-8 w-full text-left active:opacity-80">
        <div className="flex items-baseline justify-between">
          <span className="label">{t.entdecken.halving}</span>
          <span className="font-mono text-[11.5px] text-dim">
            {t.entdecken.season(Math.floor(hoehe / SEASON_BLOCKS) + 1)}
          </span>
        </div>
        <p className="mt-2.5 text-[16px] leading-snug text-lese">
          {t.entdecken.nochVor}<b className="tnum font-semibold text-text">{zahl(rest)}</b>{t.entdecken.nochNach(zahl(jetzt / 2), symbol)}
        </p>
        <div className="bar mt-3.5"><i style={{ width: `${Math.max(1.5, anteil)}%` }} /></div>
        <p className="tnum mt-2 font-mono text-[11.5px] text-faint">
          {t.entdecken.blockVon(zahl(inEpoche), zahl(EPOCH_BLOCKS))}{' · '}{anteil.toFixed(1)} %
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

/**
 * Das Netz oben im Reiter: Hashrate gross, darunter eine Zeile Kennzahlen
 * und der Anteil der bisher geschuerften Menge. Keine Karte, nur Haarlinien.
 */
function NetzLive({ summary, decimals }: { summary: Summary | null; decimals: number }) {
  const { t, zahl } = useT();
  const gemint = Number(summary?.totalSupply ?? 0) / 10 ** decimals;
  const max = Number(MAX_SUPPLY) / 10 ** DECIMALS;
  const anteil = max > 0 ? gemint / max * 100 : 0;
  const live = summary?.height != null;
  const [hr, ...einheit] = hashrateText(summary?.hashrate ?? null).split(' ');
  return (
    <section className="rise flex flex-col items-center pt-3 text-center">
      <span className="flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[.12em] text-dim">
        <span className={`h-[7px] w-[7px] rounded-full ${live ? 'atmen bg-proof' : 'bg-faint'}`} />
        {live ? t.rd.netz.live : t.home.verbinde}{live && ` · #${zahl(summary?.height ?? 0)}`}
      </span>
      <p className="tnum mt-4 flex items-baseline gap-2">
        <span className="text-[56px] font-light leading-none tracking-[-0.045em]">{hr}</span>
        <span className="font-mono text-[14px] text-dim">{einheit.join(' ')}</span>
      </p>
      <span className="label mt-2">{t.rd.netz.hashrate}</span>

      <div className="mt-7 grid w-full grid-cols-3 border-y border-line">
        <Wert zahl={typeof summary?.knoten === 'number' ? zahl(summary.knoten) : '—'} name={t.entdeckenNeu.knoten} />
        <Wert zahl={summary ? zahl(summary.activeMiners) : '—'} name={t.entdeckenNeu.miner} rand />
        <Wert zahl={zahl(anteil, { maximumFractionDigits: 1 }) + ' %'} name={t.rd.netz.gemint} rand />
      </div>
    </section>
  );
}

function Wert({ zahl, name, rand }: { zahl: string; name: string; rand?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col items-center gap-1 py-3.5 ${rand ? 'border-l border-line' : ''}`}>
      <span className="tnum truncate font-mono text-[17px] text-text">{zahl}</span>
      <span className="truncate text-[11.5px] text-dim">{name}</span>
    </div>
  );
}

function Zeile({ titel, icon, href, onClick, akzent }: {
  titel: string; icon: React.ReactNode; href?: string; onClick?: () => void; akzent?: boolean;
}) {
  const inhalt = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${akzent ? 'border-work/40 text-cyan' : 'border-line text-text'}`}>
        <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
      </span>
      <span className="flex-1 text-[15px] font-medium">{titel}</span>
      <span className="text-[16px] text-faint" aria-hidden="true">{href ? '↗' : '›'}</span>
    </>
  );
  const cls = 'flex w-full items-center gap-3.5 py-[13px] text-left active:bg-surface';
  return (
    <li className="border-b border-line">
      {href ? <ExternLink href={href} className={cls}>{inhalt}</ExternLink>
            : <button type="button" onClick={onClick} className={cls}>{inhalt}</button>}
    </li>
  );
}
