'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Primitives';
import { Zahl, Etikett, Karte, Kachel, Aktion, Pille, Kurve } from '@/components/ui/Bausteine';
import { FARBE } from '@/components/Artikel';
import { inhalte } from '@/content/entdecken';
import { useT } from '@/i18n';
import { telegramNutzer, type TgNutzer } from '@/lib/telegram/webapp';
import type { Summary, Account } from '@/hooks/useMining';
import type { HistoryEintrag } from '@/components/tabs/WalletTab';

/**
 * Home.
 *
 * Die eine Zahl steht auf dem Grund: das Guthaben. Darunter die vier
 * Aktionen, dann eine Karte mit dem Puls des Minings (Kurve der letzten
 * 90 Sekunden), drei Kacheln zur Kette und die Tueren in den
 * Informationsbereich.
 */

export function rate(h: number): { wert: string; einheit: string } {
  if (h >= 1e6) return { wert: (h / 1e6).toFixed(2), einheit: 'MH/s' };
  if (h >= 1e3) return { wert: (h / 1e3).toFixed(1), einheit: 'kH/s' };
  return { wert: String(Math.round(h)), einheit: 'H/s' };
}

/** Eingaenge seit Mitternacht -- aus dem Verlauf, den das Konto mitbringt. */
function heuteEingang(history: HistoryEintrag[] | undefined, dec: number): number {
  if (!history) return 0;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return history
    .filter(e => e.kind !== 'out' && e.timestamp && Number(e.timestamp) * 1000 >= start.getTime())
    .reduce((s, e) => s + Number(e.amount), 0) / 10 ** dec;
}

export default function HomeTab({ account, summary, mining, hashrate, hashVerlauf, worker, shares, ziel,
                                  decimals, symbol,
                                  onSenden, onEmpfangen, onScannen, onExplorer, onMining, onEntdecken, onArtikel }: {
  account: (Account & { history?: HistoryEintrag[] }) | null; summary: Summary | null;
  mining: boolean; hashrate: number; hashVerlauf: number[]; worker: number; shares: number; ziel: number;
  decimals: number; symbol: string;
  onSenden: () => void; onEmpfangen: () => void; onScannen: () => void; onExplorer: () => void;
  onMining: () => void; onEntdecken: () => void; onArtikel: (slug: string) => void;
}) {
  const [nutzer, setNutzer] = useState<TgNutzer | null>(null);
  useEffect(() => { setNutzer(telegramNutzer()); }, []);
  const { t, sprache, locale, zahl, betrag } = useT();

  const g = betrag(Number(account?.balance ?? 0) / 10 ** decimals);
  const r = rate(hashrate);
  const online = !!summary?.height;
  const heute = heuteEingang(account?.history, decimals);

  const stunde = new Date().getHours();
  const gruss = stunde < 11 ? t.home.morgen : stunde < 18 ? t.home.tag : t.home.abend;

  const { ARTIKEL } = inhalte(sprache, locale);
  const teaser = [ARTIKEL[2], ARTIKEL[1], ARTIKEL[3]];

  return (
    <>
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />

      <header className="relative mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {nutzer?.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={nutzer.foto} alt="" width={36} height={36}
                 className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <Image src="/marke/kristall.png" alt="" width={36} height={24}
                   style={{ width: 36, height: 24, objectFit: 'contain' }} />
          )}
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[12px] font-semibold text-dim">{gruss}</span>
            <span className="text-[15px] font-extrabold">{nutzer?.vorname ?? t.home.beiYskar}</span>
          </div>
        </div>
        <Pille tone={online ? 'proof' : 'off'}>{online ? t.home.synchron : t.home.verbinde}</Pille>
      </header>

      <section className="relative rise px-0.5">
        <Etikett>{t.home.guthaben}</Etikett>
        <div className="mt-1.5">
          {account
            ? <Zahl ganz={g.ganz} bruch={g.bruch} trenner={g.trenner} einheit={symbol} size={52} />
            : <Zahl ganz="—" einheit={symbol} size={52} />}
        </div>
        <p className="mt-2 flex items-center gap-2 text-[13px] font-bold text-dim">
          {heute > 0 && <><span className="text-proof">{t.home.heute(heute.toFixed(2), symbol)}</span><span className="text-faint">·</span></>}
          <span>{t.home.bloecke(account?.blocksFound ?? 0)}</span>
        </p>
      </section>

      <div className="rise rise-1 mt-6 flex gap-1.5 px-1">
        <Aktion icon={Icon.Senden} label={t.home.senden} onClick={onSenden} primary />
        <Aktion icon={Icon.Empfangen} label={t.home.empfangen} onClick={onEmpfangen} />
        <Aktion icon={Icon.Scan} label={t.wallet.scannen} onClick={onScannen} />
        <Aktion icon={Icon.Verlauf} label={t.wallet.explorer} onClick={onExplorer} />
      </div>

      <Karte className="rise rise-2 mt-6 p-[18px] pb-4" onClick={onMining}>
        <div className="flex items-center justify-between">
          <Etikett>{t.home.mining}</Etikett>
          <Pille tone={mining ? 'work' : 'off'} puls={mining}>{mining ? t.home.laeuft(worker) : t.home.gestoppt}</Pille>
        </div>
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Zahl ganz={mining ? r.wert : '0'} einheit={mining ? r.einheit : 'H/s'} size={30} />
            <span className="text-[12px] font-bold text-dim">
              {mining ? t.home.sharesZiel(shares, ziel ? zahl(Math.round(ziel)) : '—') : `${t.home.naechster} · #${summary?.height != null ? zahl(summary.height + 1) : '—'}`}
            </span>
          </div>
          <div className="w-[150px] shrink-0"><Kurve werte={hashVerlauf} hoehe={48} /></div>
        </div>
        {mining ? (
          <div className="mt-3 flex items-center justify-between text-[11.5px] font-bold text-faint">
            <span>{t.home.naechster} · #{summary?.height != null ? zahl(summary.height + 1) : '—'}</span>
            <span className="text-work">{t.home.zumMining} ›</span>
          </div>
        ) : (
          <div className="mt-3.5 flex h-11 items-center justify-center gap-2 rounded-[14px] bg-work text-[14px] font-extrabold text-white
                          shadow-[0_10px_24px_-10px_rgb(var(--work)/.7)]">
            {Icon.Blitz}{t.home.starten}
          </div>
        )}
      </Karte>

      <div className="rise rise-3 mt-3 grid grid-cols-3 gap-2.5">
        <Kachel label={t.home.block} wert={summary?.height != null ? `#${zahl(summary.height)}` : '—'} />
        <Kachel label={t.home.miner} wert={summary?.activeMiners ?? '—'} />
        <Kachel label={t.home.reward} wert={summary
          ? `${Math.round(Number(summary.nextReward) / 10 ** decimals)} ${symbol}` : '—'} />
      </div>

      <div className="mb-3 mt-7 flex items-baseline justify-between px-0.5">
        <h2 className="text-[16px] font-extrabold tracking-[-0.01em]">{t.home.kennenlernen}</h2>
        <button onClick={onEntdecken} className="text-[13px] font-extrabold text-work">{t.home.alleThemen}</button>
      </div>
      <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {teaser.map(a => (
          <button key={a.slug} onClick={() => onArtikel(a.slug)}
                  className="panel flex w-[172px] shrink-0 flex-col gap-2.5 !rounded-[20px] p-3.5 text-left
                             active:scale-[.98] transition-transform">
            <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-[12px] ${FARBE[a.farbe]}`}>{Icon[a.icon]}</span>
            <span className="text-[13.5px] font-extrabold leading-[1.2]">{a.titel}</span>
            <span className="line-clamp-2 text-[12px] font-semibold leading-[1.4] text-dim">{a.teaser}</span>
          </button>
        ))}
      </div>
    </>
  );
}
