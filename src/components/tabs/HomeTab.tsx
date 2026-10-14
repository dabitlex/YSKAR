'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Primitives';
import { Zahl, Etikett, Karte, Kachel, Pille, Kurve } from '@/components/ui/Bausteine';
import { useT } from '@/i18n';
import { useGuthabenVerborgen } from '@/lib/wallet/verborgen';
import { useEinnahmen, heuteDazu } from '@/lib/wallet/useEinnahmen';
import { betragZahl } from '@/lib/wallet/betrag';
import { Zeichen } from '@/components/wallet/Teile';
import { hashrateTeile } from '@/lib/format/hashrate';
import { telegramNutzer, type TgNutzer } from '@/lib/telegram/webapp';
import { SicherungsHinweis } from '@/components/Sicherung';
import { ExternLink } from '@/components/ui/ExternLink';
import { COMMUNITY } from '@/lib/community';
import type { Summary, Account } from '@/hooks/useMining';
import type { HistoryEintrag } from '@/components/tabs/WalletTab';

/**
 * Home.
 *
 * Von oben nach unten, was jemand in den ersten Tagen braucht: die
 * Sicherung, solange sie fehlt; das Guthaben; das Mining mit eigenem
 * Start-/Stopp-Knopf; drei Zahlen zum Netz; der Weg in die Community.
 *
 * Senden und Empfangen stehen im Reiter "Wallet" -- auf Home waeren sie
 * fuer einen neuen Nutzer ohne Guthaben nur Knoepfe ohne Zweck.
 */

export function rate(h: number): { wert: string; einheit: string } {
  return hashrateTeile(h);
}

/** Eingaenge seit Mitternacht -- aus dem Verlauf, den das Konto mitbringt. */
function heuteEingang(history: HistoryEintrag[] | undefined, dec: number): number {
  if (!history) return 0;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return history
    .filter(e => e.kind !== 'out' && e.timestamp && Number(e.timestamp) * 1000 >= start.getTime())
    .reduce((s, e) => s + Number(e.amount), 0) / 10 ** dec;
}

export default function HomeTab({ account, summary, mining, hashrate, hashVerlauf, shares,
                                  decimals, symbol, poolName, gesichert,
                                  onStartStopp, onMining, onSichern, onEinstellungen }: {
  account: (Account & { history?: HistoryEintrag[] }) | null; summary: Summary | null;
  mining: boolean; hashrate: number; hashVerlauf: number[]; shares: number;
  decimals: number; symbol: string;
  /** Name des Pools, wenn im Pool gemint wird; sonst null (Solo). */
  poolName: string | null;
  gesichert: boolean;
  onStartStopp: () => void; onMining: () => void; onSichern: () => void; onEinstellungen: () => void;
}) {
  const [nutzer, setNutzer] = useState<TgNutzer | null>(null);
  useEffect(() => { setNutzer(telegramNutzer()); }, []);
  const { t, zahl, betrag } = useT();
  // "Guthaben verbergen" aus der Wallet gilt auch hier.
  const [verborgen, verbergen] = useGuthabenVerborgen();

  const g = betrag(Number(account?.balance ?? 0) / 10 ** decimals);
  const r = rate(hashrate);
  const genau = heuteDazu(useEinnahmen(account?.address ?? null,
    account?.history?.[0] ? `${account.history[0].txid}:${account.history[0].kind}` : ''));
  const heute = genau !== null ? betragZahl(genau, decimals) : heuteEingang(account?.history, decimals);

  const stunde = new Date().getHours();
  const gruss = stunde < 11 ? t.home.morgen : stunde < 18 ? t.home.tag : t.home.abend;

  return (
    <>
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />

      <header className="relative mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {nutzer?.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={nutzer.foto} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <Image src="/marke/kristall.png" alt="" width={36} height={24} style={{ width: 36, height: 24, objectFit: 'contain' }} />
          )}
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[12px] font-semibold text-dim">{gruss}</span>
            <span className="text-[15px] font-extrabold">{nutzer?.vorname ?? t.home.beiYskar}</span>
          </div>
        </div>
        <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                className="panel flex h-9 w-9 items-center justify-center !rounded-full text-text active:scale-95">{Icon.Zahnrad}</button>
      </header>

      {!gesichert && <div className="rise relative mb-4"><SicherungsHinweis onClick={onSichern} /></div>}

      <section className="rise relative px-0.5">
        <div className="flex items-center gap-0.5">
          <Etikett>{t.home.guthaben}</Etikett>
          <button type="button" onClick={verbergen} aria-pressed={verborgen}
                  aria-label={verborgen ? t.wallet.zeigen : t.wallet.verbergen}
                  className="-my-3 flex h-10 w-10 items-center justify-center text-faint active:scale-95">
            {verborgen ? Zeichen.AugeZu(17) : Zeichen.Auge(17)}
          </button>
        </div>
        <div className="mt-1">
          {!account ? <Zahl ganz="—" einheit={symbol} size={46} />
            : verborgen ? <Zahl ganz="••••••" einheit={symbol} size={46} />
            : <Zahl ganz={g.ganz} bruch={g.bruch} trenner={g.trenner} einheit={symbol} size={46} />}
        </div>
        <p className="mt-1.5 text-[12.5px] font-bold text-dim">
          {heute > 0 && !verborgen
            ? <span className="text-proof">{t.home.heute(zahl(heute, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), symbol)}</span>
            : poolName ? t.homeNeu.poolHinweis : t.home.bloecke(account?.blocksFound ?? 0)}
        </p>
      </section>

      <Karte className="rise rise-1 mt-4 p-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onMining} className="text-left"><Etikett>{t.home.mining}</Etikett></button>
          <Pille tone={mining ? 'work' : 'off'} puls={mining}>
            {mining ? (poolName ? t.homeNeu.imPool(poolName) : t.homeNeu.solo) : t.home.gestoppt}
          </Pille>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <button type="button" onClick={onMining} className="flex min-w-0 flex-col gap-1 text-left">
            {mining
              ? <Zahl ganz={r.wert} einheit={r.einheit} size={28} />
              : <span className="text-[19px] font-extrabold">{t.homeNeu.bereit}</span>}
            <span className="text-[12px] font-bold text-dim">
              {mining
                ? `${t.mining.shares(shares)} · ${t.home.naechster} #${summary?.height != null ? zahl(summary.height + 1) : '—'}`
                : `${t.home.naechster} · #${summary?.height != null ? zahl(summary.height + 1) : '—'}`}
            </span>
          </button>
          <button type="button" onClick={onStartStopp}
                  className={`flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] px-4 text-[13.5px] font-extrabold
                              active:scale-95 ${mining ? 'border border-line bg-raised text-text'
                                : 'bg-work text-white shadow-[0_10px_24px_-10px_rgb(var(--work)/.7)]'}`}>
            {!mining && Icon.Blitz}{mining ? t.homeNeu.stopp : t.homeNeu.start}
          </button>
        </div>
        {mining && <div className="mt-3"><Kurve werte={hashVerlauf} hoehe={40} /></div>}
      </Karte>

      <div className="rise rise-2 mt-3 grid grid-cols-3 gap-2.5">
        <Kachel label={t.home.block} wert={summary?.height != null ? `#${zahl(summary.height)}` : '—'} />
        <Kachel label={t.home.miner} wert={summary?.activeMiners ?? '—'} />
        <Kachel label={t.home.reward} wert={summary
          ? `${Math.round(Number(summary.nextReward) / 10 ** decimals)} ${symbol}` : '—'} />
      </div>

      <section className="thema-dunkel rise rise-3 mt-3 flex flex-col gap-3 rounded-[22px] border border-line p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-extrabold">{t.community.homeTitel}</span>
          <span className="text-[12.5px] font-semibold leading-[1.45] text-dim">{t.community.homeText}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ExternLink href={COMMUNITY.kanal}
                      className="flex h-[42px] items-center justify-center rounded-[12px] bg-work text-[13.5px] font-extrabold text-white">
            {t.community.homeKanal}
          </ExternLink>
          <ExternLink href={COMMUNITY.gruppe}
                      className="flex h-[42px] items-center justify-center rounded-[12px] bg-raised text-[13.5px] font-extrabold text-text">
            {t.community.homeChat}
          </ExternLink>
        </div>
      </section>
    </>
  );
}
