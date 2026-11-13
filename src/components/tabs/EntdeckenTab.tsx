'use client';

import { useEffect, useState } from 'react';
import { Notice, SubHeader } from '@/components/ui/Primitives';
import { Licht, ListenTitel, MarkenKopf, Werte, Zeile } from '@/components/ui/Zeilen';
import Kette, { type KettenBlock } from '@/components/netz/Kette';
import Artikel from '@/components/Artikel';
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

/** Erst ab diesem Anteil an der Netzleistung steht die Zeile zum eigenen Pool da. */
const POOL_AB = 0.001;

type Ansicht = { art: 'liste' } | { art: 'artikel'; slug: string } | { art: 'faq'; i: number } | { art: 'netz' } | { art: 'staerken' };

export default function EntdeckenTab({ summary, decimals, symbol, onEinstellungen, meineAdresse, poolName, poolRate, onMinen }: {
  summary: Summary | null; decimals: number; symbol: string;
  onEinstellungen: () => void;
  meineAdresse: string | null;
  /** Der gewaehlte Pool und seine Leistung -- fuer die Zeile "Dein Pool haelt ...". Solo: null. */
  poolName?: string | null; poolRate?: number | null;
  /** Zum Minen-Reiter wechseln. */
  onMinen?: () => void;
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
  // Die letzten Bloecke fuer die Kette oben: neu lesen, sobald die Hoehe steigt.
  const [bloecke, setBloecke] = useState<KettenBlock[]>([]);
  const spitze = summary?.height ?? null;
  useEffect(() => {
    if (spitze == null) return;
    let lebt = true;
    fetch('/api/v2/blocks?limit=10').then(r => r.json())
      .then(d => { if (lebt && Array.isArray(d.blocks)) setBloecke(d.blocks); })
      .catch(() => {});
    return () => { lebt = false; };
  }, [spitze]);
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
        <h1 className="rise text-[31px] font-light leading-[1.13] tracking-[-.034em] [text-wrap:pretty]">{f.frage}</h1>
        <p className="rise rise-1 mt-5 text-[16px] leading-[1.6] text-lese">
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
  // Was die Zahlen fuer den Nutzer heissen: der Anteil seines Pools an der Netzleistung.
  const netzRate = summary?.hashrate ?? null;
  const poolAnteil = poolName && poolRate && poolRate > 0 && netzRate && netzRate > 0 ? Math.min(1, poolRate / netzRate) : null;

  return (
    <>
      <MarkenKopf onEinstellungen={onEinstellungen} />
      <h1 className="sr-only">{t.rd.netz.titel}</h1>

      <NetzLive summary={summary} decimals={decimals} symbol={symbol} bloecke={bloecke} />

      <div className="rise rise-1">
        {hoehe > 0 && hoehe < V6_HOEHE && (
          <Zeile href={V6_DOKU} hoch={66}
                 vor={<span className="w-[26px] shrink-0 font-mono text-[13.5px] text-cyan">V6</span>}
                 titel={t.rd.netz.v6(zahl(V6_HOEHE))} text={<span className="tnum">{t.rd.netz.v6Rest(zahl(V6_HOEHE - hoehe))}</span>} />
        )}
        {poolAnteil !== null && poolAnteil >= POOL_AB && poolName && (
          <Zeile onClick={onMinen} hoch={66} vor={<Licht />}
                 titel={t.licht.poolHaelt(zahl(poolAnteil * 100, { maximumFractionDigits: 1 }))}
                 text={poolAnteil < 0.6 ? t.licht.poolFindet(poolName, zahl(Math.max(2, Math.round(1 / poolAnteil)))) : poolName} />
        )}
        <Zeile onClick={() => setAnsicht({ art: 'staerken' })} hoch={66} vor={<Licht />}
               titel={t.rd.netz.wachsen} text={t.licht.wachsenZeile} />
      </div>

      <button onClick={() => setAnsicht({ art: 'artikel', slug: 'tokenomics' })}
              className="rise rise-2 mt-9 w-full text-left active:opacity-80">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label">{t.entdecken.halving}</span>
          <span className="font-mono text-[12.5px] text-dim">
            {t.entdecken.season(Math.floor(hoehe / SEASON_BLOCKS) + 1)}
          </span>
        </div>
        <p className="mt-2.5 text-[24px] font-[350] leading-[1.14] tracking-[-.026em] [text-wrap:pretty]">
          {t.entdecken.nochVor}<span className="tnum">{zahl(rest)}</span>{t.entdecken.nochNach(zahl(jetzt / 2), symbol)}
        </p>
        <div className="faden mt-[18px]" aria-hidden="true">
          <i style={{ width: `${Math.max(1.5, anteil)}%` }} /><b style={{ left: `${Math.max(1.5, anteil)}%` }} />
        </div>
        <p className="tnum mt-2.5 font-mono text-[12.5px] text-dim">
          {t.entdecken.blockVon(zahl(inEpoche), zahl(EPOCH_BLOCKS))}{' · '}{anteil.toFixed(1)} %
        </p>
      </button>

      <div className="rise rise-2 mt-[22px]">
        <Zeile erste onClick={() => setAnsicht({ art: 'netz' })} hoch={60} titel={t.entdeckenNeu.details} text={t.licht.detailsText} />
        <Zeile href={EXPLORER_URL} hoch={60} titel={t.rd.netz.explorer} text={t.community.explorerText} />
        <Zeile href={COMMUNITY.whitepaper} hoch={52} titel={t.rd.netz.whitepaper} />
        <Zeile href={COMMUNITY.website} hoch={60} titel={t.rd.netz.website} text={t.community.websiteText} />
      </div>

      <ListenTitel className="mt-7">{t.entdecken.verstehen}</ListenTitel>
      <ThemenRaster onOeffnen={slug => setAnsicht({ art: 'artikel', slug })} />

      <ListenTitel className="mt-7">{t.entdecken.faq}</ListenTitel>
      <div className="rise rise-2">
        {FAQ.map((f, i) => (
          <Zeile key={i} onClick={() => setAnsicht({ art: 'faq', i })} hoch={56} titel={f.frage} />
        ))}
      </div>

      <ListenTitel className="mt-7">{t.entdecken.neuigkeiten}</ListenTitel>
      <ul className="rise rise-3">
        {news.map((n, k) => (
          <li key={k} className="border-b border-line py-3.5">
            <span className="tnum font-mono text-[12.5px] text-dim">{datumKurz(n.datum)}</span>
            <span className="mt-1 block text-[16px] font-medium leading-[1.3]">{n.titel}</span>
            <p className="mt-1 text-[14.5px] leading-[1.45] text-lese">{n.text}</p>
            {n.link && <a href={n.link} target="_blank" rel="noreferrer"
                          className="mt-0.5 inline-flex min-h-11 items-center text-[14.5px] font-medium text-text underline decoration-text/45 underline-offset-[.24em]">{t.entdecken.mehrLink}</a>}
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <Notice>{t.entdecken.hinweis}</Notice>
      </div>
    </>
  );
}

/** Die Themen als Zeilen: Titel und ein Satz dazu. Auch vor der Wallet-Erstellung nutzbar. */
export function ThemenRaster({ onOeffnen }: { onOeffnen: (slug: string) => void }) {
  const { sprache, locale } = useT();
  const { ARTIKEL } = inhalte(sprache, locale);
  return (
    <div className="rise rise-1">
      {ARTIKEL.map(a => (
        <Zeile key={a.slug} onClick={() => onOeffnen(a.slug)} hoch={64} titel={a.titel} text={a.teaser} />
      ))}
    </div>
  );
}

/**
 * Das Netz oben im Reiter, als Satz statt als Zahlentafel: welcher Block,
 * wann gefunden, wie viele Miner und Knoten. Darunter die Kette der letzten
 * Bloecke und drei Kennzahlen.
 */
function NetzLive({ summary, decimals, symbol, bloecke }: {
  summary: Summary | null; decimals: number; symbol: string; bloecke: KettenBlock[];
}) {
  const { t, zahl, vorZeit, locale } = useT();
  const gemint = Number(summary?.totalSupply ?? 0) / 10 ** decimals;
  const max = Number(MAX_SUPPLY) / 10 ** DECIMALS;
  const anteil = max > 0 ? gemint / max * 100 : 0;
  const live = summary?.height != null;
  const hoehe = summary?.height ?? null;
  // Zeitpunkt des obersten Blocks -- nur, wenn die Liste ihn schon enthaelt.
  const oberster = hoehe != null ? bloecke.find(b => b.height === hoehe) : undefined;
  const belohnung = summary?.nextReward != null ? Number(summary.nextReward) / 10 ** decimals : null;
  return (
    <section className="rise mt-6">
      <p className="flex items-center gap-[9px] text-[14px] font-medium text-lese">
        <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${live ? 'atmen bg-cyan' : 'shadow-[inset_0_0_0_1.5px_rgb(var(--lese))]'}`} />
        {t.rd.netz.titel} · {live ? t.rd.netz.live : t.home.verbinde}
      </p>
      <p className="mt-3 text-[31px] font-light leading-[1.13] tracking-[-.034em] [text-wrap:pretty]">
        {hoehe == null ? '—' : oberster ? t.licht.netzBlock(zahl(hoehe), vorZeit(oberster.timestamp)) : `${t.wallet.blockNr(zahl(hoehe))}.`}{' '}
        {summary && (
          <span className="text-lese">
            {t.licht.netzMiner(summary.activeMiners)}
            {typeof summary.knoten === 'number' && ` ${t.licht.netzKnoten(summary.knoten)}`}
          </span>
        )}
      </p>
      <div className="mt-[22px]"><Kette bloecke={bloecke} /></div>
      <Werte className="mt-[18px]" werte={[
        { name: t.rd.netz.hashrate, wert: hashrateText(summary?.hashrate ?? null, locale) },
        { name: t.rd.netz.gemint, wert: `${zahl(anteil, { maximumFractionDigits: 1 })} %` },
        { name: t.licht.belohnung, wert: belohnung != null ? `${zahl(belohnung, { maximumFractionDigits: 2 })} ${symbol}` : '—' },
      ]} />
    </section>
  );
}
