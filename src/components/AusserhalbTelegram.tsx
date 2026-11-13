'use client';

import { Zeichen } from '@/components/ui/Marke';
import { Zeile } from '@/components/ui/Zeilen';
import Ufer from '@/components/mining/Ufer';
import { vorgeladen } from '@/lib/vorladen';
import { useT } from '@/i18n';
import { COMMUNITY } from '@/lib/community';

/**
 * Jemand oeffnet die Adresse der Mini App im gewoehnlichen Browser -- etwa
 * ueber einen geteilten Link. Wallet und Mining brauchen Telegram; statt
 * einer Sackgasse fuehrt die Seite mit einem Tipp dorthin.
 *
 * Dieselbe Buehne wie im Einstieg: der Fjord, ein Licht je aktivem Miner.
 *
 * Der Knopf nach Telegram bewusst ohne ExternLink: Hier gibt es kein
 * Telegram-Fenster, ein gewoehnlicher Link tut genau das Richtige (t.me
 * oeffnet die Telegram-App).
 */
export default function AusserhalbTelegram() {
  const { t } = useT();
  return (
    <main className="thema-dunkel buehne-voll rand-oben relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-6 pb-8">
      <Ufer lichter={vorgeladen().summary?.activeMiners ?? 0} mein={null} />
      <div className="relative flex h-11 items-center gap-2.5">
        <Zeichen g={28} />
        <span className="pt-px text-[14px] font-semibold tracking-[.2em]">YSKAR</span>
      </div>

      <div className="min-h-8 flex-1" />

      <div className="relative">
        <h1 className="rise aussage text-[clamp(38px,12.6vw,50px)] [text-wrap:balance]">{t.browserNeu.titel}</h1>
        <p className="rise rise-1 mt-3.5 max-w-[340px] text-[15.5px] leading-[1.45] text-lese">{t.browserNeu.text}</p>

        <a href={COMMUNITY.bot}
           className="rise rise-1 mt-[22px] flex h-14 items-center justify-center gap-[9px] rounded-full bg-lamp px-6 text-[17px] font-semibold tracking-[-.01em] text-lamp-ink active:scale-[.985]">
          {t.browserNeu.oeffnen}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </a>

        <div className="rise rise-2 mt-5">
          <Zeile erste href={COMMUNITY.website} hoch={56} titel={t.browserNeu.website} />
          <Zeile href={COMMUNITY.explorer} hoch={56} titel={t.browserNeu.explorer} />
          <Zeile href={COMMUNITY.releases} hoch={56} titel={t.browserNeu.github} />
        </div>
      </div>
    </main>
  );
}
