'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Primitives';
import { Flaeche, Abschnitt, Etikett, Hinweis, Fortschritt, Kennzahl, KennzahlRaster, Liste, Zeile } from '@/components/ys';
import { SeitenKopf } from '@/components/ys/SeitenKopf';
import BlockKette from '@/components/netz/BlockKette';
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
const V6_DOKU = 'https://github.com/dabitlex/YSKAR/blob/main/docs/CONSENSUS_V6.md';

/**
 * Entdecken.
 *
 * Der Informationsbereich der App: Was YSKAR ist, wie es funktioniert, was
 * als Naechstes kommt. Fuehrt mit dem Halving-Fortschritt, weil der vom
 * ersten Tag an etwas erzaehlt -- eine Nachrichtenliste waere leer.
 */

type Ansicht = { art: 'liste' } | { art: 'artikel'; slug: string } | { art: 'faq'; i: number } | { art: 'netz' } | { art: 'staerken' };

export default function EntdeckenTab({ summary, decimals, symbol, kopfzeile, meineAdresse }: {
  summary: Summary | null; decimals: number; symbol: string;
  /** Gemeinsame Kopfzeile (Statuszeichen, Titel, Zahnrad) aus AppShell. */
  kopfzeile: React.ReactNode;
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
        <SeitenKopf titel={t.entdeckenNeu.details} onZurueck={() => setAnsicht({ art: 'liste' })} />
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
        <SeitenKopf titel={t.entdecken.faq} onZurueck={() => setAnsicht({ art: 'liste' })} />
        <h2 className="rise text-ys-abschnitt font-semibold leading-[1.25]">{f.frage}</h2>
        <p className="rise rise-1 mt-4 text-ys-fliess leading-[1.65] text-lese">
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

  const symbol18 = (pfad: React.ReactNode, akzent = false) => (
    <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${akzent ? 'border-work/40 text-cyan' : 'border-[rgb(var(--haar)/.18)] text-text'}`}>
      <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{pfad}</svg>
    </span>
  );

  return (
    <>
      {kopfzeile}

      <div className="flex flex-col gap-4">
        <NetzLive summary={summary} decimals={decimals} />

        <BlockKette onDetails={() => setAnsicht({ art: 'netz' })} />

        {hoehe > 0 && hoehe < V6_HOEHE && (
          <ExternLink href={V6_DOKU} className="ys-flaeche-akzent flex min-h-[64px] items-center gap-3.5 px-4 py-3 active:opacity-80">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-work/[.12] font-mono text-ys-klein text-cyan">V6</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-ys-fliess">{t.rd.netz.v6(zahl(V6_HOEHE))}</span>
              <span className="tnum text-ys-meta text-dim">{t.rd.netz.v6Rest(zahl(V6_HOEHE - hoehe))}</span>
            </span>
            <span className="text-faint" aria-hidden="true">↗</span>
          </ExternLink>
        )}

        <Liste>
          <Zeile onClick={() => setAnsicht({ art: 'staerken' })} titel={t.rd.netz.wachsen}
                 symbol={symbol18(<><circle cx="11" cy="11" r="8.5" /><path d="M2.5 11h17M11 2.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S8.5 5.1 11 2.5z" /></>, true)} />
          <Zeile onClick={() => setAnsicht({ art: 'netz' })} titel={t.entdeckenNeu.details}
                 symbol={symbol18(<path d="M3 15l4-5 4 3 4-6 4 4" />)} />
          <Zeile href={EXPLORER_URL} titel={t.rd.netz.explorer}
                 symbol={symbol18(<path d="M3.5 3.5h6v6h-6zM12.5 3.5h6v6h-6zM3.5 12.5h6v6h-6zM9.5 6.5h3M6.5 9.5v3" />)} />
          <Zeile href={COMMUNITY.whitepaper} titel={t.rd.netz.whitepaper}
                 symbol={symbol18(<path d="M5.5 2.5h8l3 3v14h-11zM8.5 9.5h5M8.5 12.5h5M8.5 15.5h3" />)} />
          <Zeile href={COMMUNITY.website} titel={t.rd.netz.website}
                 symbol={symbol18(<><circle cx="11" cy="11" r="8.5" /><path d="M2.5 11h17" /></>)} />
        </Liste>

        <button type="button" onClick={() => setAnsicht({ art: 'artikel', slug: 'tokenomics' })}
                className="ys-flaeche flex w-full flex-col gap-3 p-4 text-left active:opacity-80">
          <span className="flex w-full items-baseline justify-between gap-3">
            <Etikett>{t.entdecken.halving}</Etikett>
            <span className="font-mono text-ys-meta text-dim">{t.entdecken.season(Math.floor(hoehe / SEASON_BLOCKS) + 1)}</span>
          </span>
          <span className="text-ys-fliess leading-snug text-lese">
            {t.entdecken.nochVor}<b className="tnum font-semibold text-text">{zahl(rest)}</b>{t.entdecken.nochNach(zahl(jetzt / 2), symbol)}
          </span>
          <Fortschritt anteil={anteil / 100} label={t.entdecken.halving} verlauf />
          <span className="tnum font-mono text-ys-meta text-faint">
            {t.entdecken.blockVon(zahl(inEpoche), zahl(EPOCH_BLOCKS))}{' · '}{zahl(anteil, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
          </span>
        </button>

        <section aria-label={t.entdecken.verstehen} className="flex flex-col">
          <Abschnitt titel={t.entdecken.verstehen} />
          <ThemenRaster onOeffnen={slug => setAnsicht({ art: 'artikel', slug })} />
        </section>

        <section aria-label={t.entdecken.faq} className="flex flex-col">
          <Abschnitt titel={t.entdecken.faq} />
          <Liste>
            {FAQ.map((f, i) => (
              <Zeile key={i} titel={f.frage} onClick={() => setAnsicht({ art: 'faq', i })} />
            ))}
          </Liste>
        </section>

        <section aria-label={t.entdecken.neuigkeiten} className="flex flex-col">
          <Abschnitt titel={t.entdecken.neuigkeiten} />
          <ul className="ys-flaeche px-4 [&>li:not(:first-child)]:border-t [&>li]:border-[rgb(var(--haar)/.12)]">
            {news.map((n, k) => (
              <li key={k} className="flex flex-col gap-1 py-3.5">
                <span className="tnum font-mono text-ys-meta text-faint">{datumKurz(n.datum)}</span>
                <span className="text-ys-fliess font-medium">{n.titel}</span>
                <p className="text-ys-meta leading-relaxed text-dim">{n.text}</p>
                {n.link && <a href={n.link} target="_blank" rel="noreferrer"
                              className="inline-flex min-h-11 items-center text-ys-klein text-cyan">{t.entdecken.mehrLink}</a>}
              </li>
            ))}
          </ul>
        </section>

        <Hinweis>{t.entdecken.hinweis}</Hinweis>
      </div>
    </>
  );
}

/** Die sechs Themen als Kacheln. Auch vor der Wallet-Erstellung nutzbar. */
export function ThemenRaster({ onOeffnen }: { onOeffnen: (slug: string) => void }) {
  const { sprache, locale } = useT();
  const { ARTIKEL } = inhalte(sprache, locale);
  return (
    <div className="grid grid-cols-2 gap-2">
      {ARTIKEL.map(a => (
        <button key={a.slug} type="button" onClick={() => onOeffnen(a.slug)}
                className="ys-flaeche flex flex-col gap-2.5 p-4 text-left active:opacity-80">
          <span className={`flex h-10 w-10 items-center justify-center rounded-sm ${FARBE[a.farbe]}`}>
            {Icon[a.icon]}
          </span>
          <span className="text-ys-klein font-medium leading-[1.3]">{a.titel}</span>
          <span className="text-ys-meta leading-[1.45] text-dim">{a.teaser}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Das Netz oben im Reiter: Hashrate gross auf einer Flaeche, darunter
 * Knoten, Miner und der Anteil der bisher geschuerften Menge.
 */
function NetzLive({ summary, decimals }: { summary: Summary | null; decimals: number }) {
  const { t, zahl, locale } = useT();
  const gemint = Number(summary?.totalSupply ?? 0) / 10 ** decimals;
  const max = Number(MAX_SUPPLY) / 10 ** DECIMALS;
  const anteil = max > 0 ? gemint / max * 100 : 0;
  const live = summary?.height != null;
  const [hr, ...einheit] = hashrateText(summary?.hashrate ?? null, locale).split(' ');
  return (
    <>
      <section aria-label={t.rd.netz.hashrate}
               className="ys-flaeche flex flex-col items-center !rounded-lg px-4 pb-6 pt-4 text-center [background:radial-gradient(120%_90%_at_50%_0%,rgb(var(--work)/.14),rgb(var(--surface))_60%)]">
        <span className="flex min-h-8 items-center gap-2 font-mono text-ys-etikett uppercase text-dim">
          <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${live ? 'atmen bg-proof' : 'bg-faint'}`} />
          {live ? t.rd.netz.live : t.home.verbinde}{live && ` · #${zahl(summary?.height ?? 0)}`}
        </span>
        <p className="tnum mt-3 flex items-baseline gap-2">
          <span className="text-ys-anzeige font-light leading-none tracking-[-0.05em]">{hr}</span>
          <span className="font-mono text-ys-klein text-dim">{einheit.join(' ')}</span>
        </p>
        <Etikett className="mt-2">{t.rd.netz.hashrate}</Etikett>
      </section>
      <KennzahlRaster>
        <Kennzahl name={t.entdeckenNeu.knoten} wert={typeof summary?.knoten === 'number' ? zahl(summary.knoten) : '—'} />
        <Kennzahl name={t.entdeckenNeu.miner} wert={summary ? zahl(summary.activeMiners) : '—'} />
        <Kennzahl name={t.rd.netz.gemint} wert={zahl(anteil, { maximumFractionDigits: 1 }) + ' %'} />
      </KennzahlRaster>
    </>
  );
}
