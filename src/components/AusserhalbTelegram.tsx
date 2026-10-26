'use client';

import { Muenze3D } from '@/components/ui/Marke';
import { useT } from '@/i18n';
import { COMMUNITY } from '@/lib/community';

/**
 * Jemand oeffnet die Adresse der Mini App im gewoehnlichen Browser -- etwa
 * ueber einen geteilten Link. Wallet und Mining brauchen Telegram; statt
 * einer Sackgasse fuehrt die Seite mit einem Tipp dorthin.
 *
 * Bewusst ohne ExternLink: Hier gibt es kein Telegram-Fenster, gewoehnliche
 * Links tun genau das Richtige (t.me oeffnet die Telegram-App).
 */
export default function AusserhalbTelegram() {
  const { t } = useT();
  return (
    <main className="thema-dunkel relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-6 pb-8 pt-5">
      <div className="pointer-events-none absolute -left-10 top-16 h-[470px] w-[470px] rounded-full"
           style={{ background: 'radial-gradient(circle, rgb(var(--work)/.22), transparent 68%)' }} />
      <div className="zoom relative mt-24 flex justify-center">
        <div className="buehne"><Muenze3D d={140} /></div>
      </div>
      <h1 className="relative mt-[30px] text-center text-[28px] font-semibold leading-[1.15] tracking-[-0.025em]">
        {t.browserNeu.titel}
      </h1>
      <p className="relative mt-3 text-center text-[14.5px] font-semibold leading-[1.5] text-dim">{t.browserNeu.text}</p>

      <div className="min-h-8 flex-1" />

      <div className="relative flex flex-col gap-2.5">
        <a href={COMMUNITY.bot}
           className="flex h-14 items-center justify-center gap-2 rounded-full bg-text text-[16px] font-semibold text-ink">
          <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 10 19.5 3.5l-3 15.5-5.5-4.5-3 3.5v-5.5l8.5-6.5" /></svg>
          {t.browserNeu.oeffnen}
        </a>
        <div className="grid grid-cols-2 gap-2.5">
          <a href={COMMUNITY.website}
             className="flex h-12 items-center justify-center rounded-full border border-line text-[14px] font-medium">
            {t.browserNeu.website}
          </a>
          <a href={COMMUNITY.explorer}
             className="flex h-12 items-center justify-center rounded-full border border-line text-[14px] font-medium">
            {t.browserNeu.explorer}
          </a>
        </div>
        <a href={COMMUNITY.releases} className="mt-1 text-center text-[13px] font-bold text-dim">{t.browserNeu.github}</a>
      </div>
    </main>
  );
}
