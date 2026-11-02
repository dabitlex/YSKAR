'use client';

import { SeitenKopf } from '@/components/ys/SeitenKopf';
import { Etikett } from '@/components/ys';
import { ExternLink } from '@/components/ui/ExternLink';
import { COMMUNITY } from '@/lib/community';
import { useT } from '@/i18n';
import Erde from '@/components/netz/Erde';

/**
 * "Hilf dem Netzwerk zu wachsen": Wege, YSKAR ausserhalb der Mini App zu
 * minen oder selbst einen Knoten oder Pool zu betreiben.
 */
export default function NetzStaerken({ onZurueck }: { onZurueck: () => void }) {
  const { t } = useT();
  const n = t.rd.netz;
  const wege: { titel: string; text: string; href: string; icon: React.ReactNode }[] = [
    { titel: n.a1T, text: n.a1S, href: `${COMMUNITY.anleitungen}#android`,
      icon: <><rect x="6" y="2.5" width="10" height="17" rx="2.5" /><path d="M10 16.5h2" /></> },
    { titel: n.a2T, text: n.a2S, href: `${COMMUNITY.anleitungen}#pc`,
      icon: <><rect x="2.5" y="4" width="17" height="11" rx="2" /><path d="M8 19h6M11 15v4" /></> },
    { titel: n.a3T, text: n.a3S, href: `${COMMUNITY.anleitungen}#fullnode`,
      icon: <><rect x="3" y="3.5" width="16" height="6" rx="1.5" /><rect x="3" y="12.5" width="16" height="6" rx="1.5" /><path d="M6.5 6.5h.01M6.5 15.5h.01" /></> },
    { titel: n.a4T, text: n.a4S, href: `${COMMUNITY.anleitungen}#pool`,
      icon: <><circle cx="11" cy="6" r="2.5" /><circle cx="5" cy="16" r="2.5" /><circle cx="17" cy="16" r="2.5" /><path d="M9.8 8.2 6.2 13.8M12.2 8.2l3.6 5.6M7.5 16h7" /></> },
  ];
  return (
    <>
      <SeitenKopf titel={n.titel} onZurueck={onZurueck} />
      <div className="rise -mt-2 flex justify-center"><Erde /></div>
      <Etikett as="p" className="mt-2 text-center">{n.gEtikett}</Etikett>
      <h2 className="mt-2 text-center text-ys-seite font-semibold leading-[1.15]">
        {n.gA} <span className="grad">{n.gB}</span>
      </h2>
      <p className="mx-auto mt-3 max-w-[330px] text-center text-ys-klein leading-[1.55] text-lese">{n.gText}</p>

      <ul className="ys-flaeche rise rise-1 mt-6 px-4 [&>li:not(:first-child)]:border-t [&>li]:border-[rgb(var(--haar)/.12)]">
        {wege.map(w => (
          <li key={w.titel}>
            <ExternLink href={w.href} className="flex items-start gap-3.5 py-3.5 active:opacity-70">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--haar)/.18)] text-cyan">
                <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{w.icon}</svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-ys-fliess">{w.titel}</span>
                <span className="text-ys-meta leading-[1.45] text-dim">{w.text}</span>
              </span>
              <span className="mt-2 text-faint" aria-hidden="true">↗</span>
            </ExternLink>
          </li>
        ))}
      </ul>

      <div className="rise rise-2 mt-7 flex flex-col gap-2.5">
        <ExternLink href={COMMUNITY.releases}
                    className="flex min-h-14 items-center justify-center rounded-full bg-work text-ys-fliess font-semibold text-white active:scale-[.985]">
          {n.nodeCore}
        </ExternLink>
        <ExternLink href={COMMUNITY.anleitungen}
                    className="flex min-h-14 items-center justify-center rounded-full border border-[rgb(var(--haar)/.24)] text-ys-fliess font-semibold active:scale-[.985]">
          {n.anleitungen}
        </ExternLink>
      </div>
    </>
  );
}
