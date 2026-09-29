'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Panel, Status, Button, Icon, Kennzahl } from '@/components/ui/Primitives';
import { FARBE } from '@/components/Artikel';
import { ARTIKEL } from '@/content/entdecken';
import { telegramNutzer, type TgNutzer } from '@/lib/telegram/webapp';
import type { Summary, Account } from '@/hooks/useMining';

/**
 * Home.
 *
 * Ein Blick, drei Antworten: Wie viel habe ich, rechnet mein Geraet, was
 * macht die Kette. Danach zwei Tueren in den Informationsbereich -- wer die
 * App zum ersten Mal oeffnet, soll hier erfahren, worum es geht.
 */

function rate(h: number): { wert: string; einheit: string } {
  if (h >= 1e6) return { wert: (h / 1e6).toFixed(2), einheit: 'MH/s' };
  if (h >= 1e3) return { wert: (h / 1e3).toFixed(1), einheit: 'kH/s' };
  return { wert: String(Math.round(h)), einheit: 'H/s' };
}

export default function HomeTab({ account, summary, mining, hashrate, decimals, symbol,
                                  onSenden, onEmpfangen, onMining, onEntdecken, onArtikel }: {
  account: Account | null; summary: Summary | null;
  mining: boolean; hashrate: number; decimals: number; symbol: string;
  onSenden: () => void; onEmpfangen: () => void; onMining: () => void;
  onEntdecken: () => void; onArtikel: (slug: string) => void;
}) {
  // Der Name kommt aus dem Telegram-Client -- erst im Browser, nicht beim
  // Rendern auf dem Server.
  const [nutzer, setNutzer] = useState<TgNutzer | null>(null);
  useEffect(() => { setNutzer(telegramNutzer()); }, []);

  const guthaben = Number(account?.balance ?? 0) / 10 ** decimals;
  const [ganz, bruch] = guthaben.toFixed(4).split('.');
  const r = rate(hashrate);
  const online = !!summary?.height;

  const stunde = new Date().getHours();
  const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend';

  const teaser = [ARTIKEL[2], ARTIKEL[1]];

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {nutzer?.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={nutzer.foto} alt="" width={36} height={36}
                 className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <Image src="/marke/kristall.png" alt="" width={40} height={34}
                   style={{ width: 40, height: 34, objectFit: 'contain' }} />
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-semibold text-faint">{gruss}</span>
            <span className="text-[15px] font-extrabold">{nutzer?.vorname ?? 'bei YSKAR'}</span>
          </div>
        </div>
        <Status tone={online ? 'proof' : 'off'}>{online ? 'Netz synchron' : 'verbinde…'}</Status>
      </header>

      <section className="hero rise p-5">
        <span className="label !text-white/60">Guthaben</span>
        <div className="mt-2 flex items-baseline gap-2 leading-none">
          <span className="tnum text-[40px] font-extrabold tracking-[-0.03em]">
            {Number(ganz).toLocaleString('de-DE')}
            <span className="text-[24px] text-white/70">,{bruch}</span>
          </span>
          <span className="text-[15px] font-bold text-white/75">{symbol}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onSenden}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px]
                             bg-white text-[13.5px] font-bold text-text active:scale-[.98]">
            Senden
          </button>
          <button onClick={onEmpfangen}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px]
                             bg-white/15 text-[13.5px] font-bold text-white active:scale-[.98]">
            Empfangen
          </button>
        </div>
      </section>

      <Panel className="rise rise-1 mt-3.5">
        <div className="flex items-center justify-between">
          <span className="label">Mining</span>
          <Status tone={mining ? 'work' : 'off'}>{mining ? 'rechnet' : 'gestoppt'}</Status>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`tnum text-[30px] font-extrabold tracking-[-0.02em] ${
            mining ? 'text-work' : 'text-faint'}`}>{mining ? r.wert : '0'}</span>
          <span className="text-[14px] font-semibold text-faint">
            {mining ? r.einheit : 'H/s'} · {account?.blocksFound ?? 0} Blöcke gefunden
          </span>
        </div>
        <div className="mt-3.5">
          <Button onClick={onMining} variant={mining ? 'quiet' : 'primary'}>
            {Icon.Blitz}{mining ? 'Zum Mining' : 'Mining starten'}
          </Button>
        </div>
      </Panel>

      <Panel className="rise rise-2 mt-3.5 !py-4">
        <dl className="grid grid-cols-3 gap-3">
          <Kennzahl label="Block" wert={summary?.height != null ? `#${summary.height.toLocaleString('de-DE')}` : '—'} />
          <Kennzahl label="Miner" wert={summary?.activeMiners ?? '—'} />
          <Kennzahl label="Reward" wert={summary
            ? `${Math.round(Number(summary.nextReward) / 10 ** decimals)} ${symbol}` : '—'} />
        </dl>
      </Panel>

      <div className="mb-2.5 mt-6 flex items-baseline justify-between px-0.5">
        <h2 className="text-[16px] font-extrabold">YSKAR kennenlernen</h2>
        <button onClick={onEntdecken} className="text-[13px] font-bold text-work">Alle Themen</button>
      </div>
      <div className="rise rise-3 space-y-2">
        {teaser.map(a => (
          <button key={a.slug} onClick={() => onArtikel(a.slug)}
                  className="flex w-full items-center gap-3 rounded-[16px] border border-line
                             bg-surface px-3.5 py-3 text-left active:bg-raised">
            <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center
                              rounded-[11px] ${FARBE[a.farbe]}`}>{Icon[a.icon]}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-bold">{a.titel}</span>
              <span className="truncate text-[12.5px] font-semibold text-dim">{a.teaser}</span>
            </span>
            <span className="text-[18px] text-faint">›</span>
          </button>
        ))}
      </div>
    </>
  );
}
