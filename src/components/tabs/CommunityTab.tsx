'use client';

import { useState } from 'react';
import { Foto, MarkenKopf, Zeile } from '@/components/ui/Zeilen';
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

  const eintraege: { href: string; titel: string; text: string; aktion?: string; neu?: boolean }[] = [
    { href: COMMUNITY.kanal, titel: t.community.kanal, text: COMMUNITY.kanalName, aktion: t.community.oeffnen },
    { href: COMMUNITY.gruppe, titel: t.community.gruppe, text: t.community.gruppeText, aktion: t.community.beitreten },
    // YSKAR Lab: Ideen und Entwuerfe der Community. Hier nur ein Hinweis -- die
    // Plattform selbst gehoert nicht in die Mini App (Entscheidung 29.10.2026).
    { href: COMMUNITY.lab, titel: t.community.lab, text: t.community.labText, aktion: t.community.oeffnen, neu: true },
    { href: COMMUNITY.x, titel: t.community.x, text: COMMUNITY.xName },
    { href: COMMUNITY.website, titel: t.community.website, text: t.community.websiteText },
    { href: COMMUNITY.explorer, titel: t.community.explorer, text: t.community.explorerText },
    { href: COMMUNITY.github, titel: t.community.code, text: t.community.codeText },
  ];

  const einladen = async () => {
    const r = await teilen(einladungsLink(adresse), t.community.teilenText);
    if (r === 'kopiert') { setKopiert(true); setTimeout(() => setKopiert(false), 2000); }
  };

  return (
    <>
      {/* Menschen mit Laternen am Ufer: Das Netz sind die, die mitmachen. */}
      <Foto src="/buehne/laternen.webp" alt="" />
      <MarkenKopf />
      <div className="foto-platz" />

      <section className="rise relative">
        <h1 className="aussage whitespace-pre-line text-[clamp(36px,11.4vw,46px)] [text-wrap:balance]">{t.licht.communityTitel}</h1>
        <p className="mt-3 max-w-[340px] text-[15px] leading-[1.45] text-lese">{t.rd.community.text}</p>
      </section>

      <ul className="rise rise-1 mt-4 border-t border-line">
        {onAktion && <AktionZeile onOeffnen={onAktion} />}
        {eintraege.map(e => (
          <li key={e.href}>
            <Zeile href={e.href} hoch={60}
                   titel={<>
                     {e.titel}
                     {e.neu && (
                       <span className="ml-2 align-[1px] text-[12.5px] font-medium text-cyan">{t.community.neu}</span>
                     )}
                   </>}
                   text={<span className="block truncate">{e.text}</span>}
                   rechts={e.aktion ? <span className="text-text">{e.aktion}</span> : undefined} />
          </li>
        ))}
      </ul>

      <section className="rise rise-2 mt-7">
        <h2 className="text-[18px] font-medium leading-[1.25] tracking-[-.012em]">{t.community.einladenTitel}</h2>
        <p className="mt-1.5 text-[14.5px] leading-[1.45] text-lese">{t.community.einladenText}</p>
        <button type="button" onClick={einladen}
                className="mt-4 flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-lamp px-6 text-[16px] font-semibold text-lamp-ink active:scale-[.985]">
          <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 3v11M11 3 7 7M11 3l4 4M4 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
          {kopiert ? t.allgemein.Kopiert : t.community.teilen}
        </button>
      </section>
    </>
  );
}
