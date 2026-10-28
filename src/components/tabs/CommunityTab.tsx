'use client';

import { useState } from 'react';
import { Muenze3D } from '@/components/ui/Marke';
import { TopBar } from '@/components/ui/Chrome';
import { ExternLink } from '@/components/ui/ExternLink';
import { COMMUNITY, einladungsLink } from '@/lib/community';
import { teilen } from '@/lib/telegram/webapp';
import { useT } from '@/i18n';
import { AktionZeile } from '@/components/aktion/Aktion';

/**
 * Community: alle Wege nach draussen an einer Stelle.
 *
 * Kanal und Gruppe zuerst -- dort bekommt ein neuer Nutzer Antworten. Dann
 * X, Website, Explorer und Quelltext. Zuletzt "Einladen": ein Link in die
 * Mini App mit einer Kennung (startapp=ref_...), die nur aus einem Stueck
 * der eigenen, ohnehin oeffentlichen Adresse besteht.
 */
export default function CommunityTab({ adresse, onAktion }: { adresse: string | null; onAktion?: () => void }) {
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

      {/* Die Muenze dreht sich -- wie im Einstieg. Keine Karte, nur Buehne und Satz. */}
      <section className="rise relative flex flex-col items-center pb-2 pt-4 text-center">
        <div className="buehne"><Muenze3D d={88} /></div>
        <h2 className="mt-6 text-[26px] font-semibold leading-[1.15] tracking-[-0.025em]">
          {t.rd.community.titelA}<br /><span className="grad">{t.rd.community.titelB}</span>
        </h2>
        <p className="mt-2.5 max-w-[300px] text-[14px] leading-[1.5] text-dim">{t.rd.community.text}</p>
      </section>

      <ul className="rise rise-1 mt-6 border-t border-line">
        {onAktion && <AktionZeile onOeffnen={onAktion} />}
        {eintraege.map(e => (
          <li key={e.href} className="border-b border-line">
            <ExternLink href={e.href} className="flex items-center gap-3.5 py-[14px] active:bg-surface">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                e.akzent ? 'border-work/40 text-cyan' : 'border-line text-text'}`}>
                <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{e.icon}</svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-medium">{e.titel}</span>
                <span className="truncate text-[12.5px] text-dim">{e.text}</span>
              </span>
              {e.aktion
                ? <span className="text-[13px] font-medium text-cyan">{e.aktion}</span>
                : <span className="text-[16px] text-faint" aria-hidden="true">›</span>}
            </ExternLink>
          </li>
        ))}
      </ul>

      <section className="rise rise-2 mt-6 flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium">{t.community.einladenTitel}</span>
          <span className="text-[12.5px] text-dim">{t.community.einladenText}</span>
        </span>
        <button type="button" onClick={einladen}
                className="h-11 shrink-0 rounded-full bg-work px-5 text-[14px] font-semibold text-white active:scale-95">
          {kopiert ? t.allgemein.Kopiert : t.community.teilen}
        </button>
      </section>
    </>
  );
}
