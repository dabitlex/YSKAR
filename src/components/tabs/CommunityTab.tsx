'use client';

import { useState } from 'react';
import Image from 'next/image';
import { TopBar } from '@/components/ui/Chrome';
import { ExternLink } from '@/components/ui/ExternLink';
import { COMMUNITY, einladungsLink } from '@/lib/community';
import { teilen } from '@/lib/telegram/webapp';
import { useT } from '@/i18n';

/**
 * Community: alle Wege nach draussen an einer Stelle.
 *
 * Kanal und Gruppe zuerst -- dort bekommt ein neuer Nutzer Antworten. Dann
 * X, Website, Explorer und Quelltext. Zuletzt "Einladen": ein Link in die
 * Mini App mit einer Kennung (startapp=ref_...), die nur aus einem Stueck
 * der eigenen, ohnehin oeffentlichen Adresse besteht.
 */
export default function CommunityTab({ adresse }: { adresse: string | null }) {
  const { t } = useT();
  const [kopiert, setKopiert] = useState(false);

  const eintraege: { href: string; titel: string; text: string; aktion?: string; icon: React.ReactNode; akzent?: boolean }[] = [
    { href: COMMUNITY.kanal, titel: t.community.kanal, text: COMMUNITY.kanalName, aktion: t.community.oeffnen, akzent: true,
      icon: <path d="M2.5 10 19.5 3.5l-3 15.5-5.5-4.5-3 3.5v-5.5l8.5-6.5" /> },
    { href: COMMUNITY.gruppe, titel: t.community.gruppe, text: t.community.gruppeText, aktion: t.community.beitreten, akzent: true,
      icon: <path d="M3.5 4.5h15v10h-10l-5 4zM7.5 8.5h7M7.5 11.5h4.5" /> },
    { href: COMMUNITY.x, titel: t.community.x, text: COMMUNITY.xName,
      icon: <path d="M4 4l14 14M18 4 4 18" /> },
    { href: COMMUNITY.website, titel: t.community.website, text: t.community.websiteText,
      icon: <><circle cx="11" cy="11" r="8.5" /><path d="M2.5 11h17M11 2.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S8.5 5.1 11 2.5z" /></> },
    { href: COMMUNITY.explorer, titel: t.community.explorer, text: t.community.explorerText,
      icon: <path d="M3.5 3.5h6v6h-6zM12.5 3.5h6v6h-6zM3.5 12.5h6v6h-6zM9.5 6.5h3M6.5 9.5v3" /> },
    { href: COMMUNITY.github, titel: t.community.code, text: t.community.codeText,
      icon: <path d="M7 7l-4 4 4 4M15 7l4 4-4 4M12.5 4.5l-3 13" /> },
  ];

  const einladen = async () => {
    const r = await teilen(einladungsLink(adresse), t.community.teilenText);
    if (r === 'kopiert') { setKopiert(true); setTimeout(() => setKopiert(false), 2000); }
  };

  return (
    <>
      <TopBar titel={t.community.titel} />

      <section className="thema-dunkel rise relative flex items-center gap-3.5 overflow-hidden rounded-[22px] border border-line p-[18px]">
        <div className="pointer-events-none absolute -right-14 -top-14 h-[200px] w-[200px] rounded-full"
             style={{ background: 'radial-gradient(circle, rgb(var(--work)/.35), transparent 70%)' }} />
        <Image src="/marke/kristall.png" alt="" width={58} height={38} className="relative"
               style={{ width: 58, height: 38, objectFit: 'contain' }} />
        <div className="relative flex flex-col gap-1">
          <span className="text-[16px] font-extrabold">{t.community.heroTitel}</span>
          <span className="text-[12.5px] font-semibold leading-[1.45] text-dim">{t.community.heroText}</span>
        </div>
      </section>

      <ul className="panel rise rise-1 mt-3 !rounded-[20px] !p-0">
        {eintraege.map((e, i) => (
          <li key={e.href} className={i < eintraege.length - 1 ? 'border-b border-line' : ''}>
            <ExternLink href={e.href} className="flex items-center gap-3 px-4 py-[13px] active:bg-raised">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${
                e.akzent ? 'bg-work/10 text-work' : 'bg-raised text-text'}`}>
                <svg viewBox="0 0 22 22" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{e.icon}</svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-extrabold">{e.titel}</span>
                <span className="truncate text-[12px] font-semibold text-dim">{e.text}</span>
              </span>
              {e.aktion
                ? <span className="text-[12.5px] font-extrabold text-work">{e.aktion}</span>
                : <span className="text-[16px] text-faint" aria-hidden="true">›</span>}
            </ExternLink>
          </li>
        ))}
      </ul>

      <section className="panel rise rise-2 mt-3 flex items-center gap-3 !rounded-[20px] px-4 py-3.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-extrabold">{t.community.einladenTitel}</span>
          <span className="text-[12px] font-semibold text-dim">{t.community.einladenText}</span>
        </span>
        <button type="button" onClick={einladen}
                className="h-10 shrink-0 rounded-[12px] bg-work px-4 text-[13.5px] font-extrabold text-white active:scale-95">
          {kopiert ? t.allgemein.Kopiert : t.community.teilen}
        </button>
      </section>
    </>
  );
}
