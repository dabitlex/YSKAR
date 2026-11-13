'use client';

import { SubHeader } from '@/components/ui/Primitives';
import { ExternLink } from '@/components/ui/ExternLink';
import { COMMUNITY } from '@/lib/community';
import { useT } from '@/i18n';
import { Foto, Zeile } from '@/components/ui/Zeilen';

/**
 * "Hilf dem Netzwerk zu wachsen": Wege, YSKAR ausserhalb der Mini App zu
 * minen oder selbst einen Knoten oder Pool zu betreiben.
 */
export default function NetzStaerken({ onZurueck }: { onZurueck: () => void }) {
  const { t } = useT();
  const n = t.rd.netz;
  const wege: { titel: string; text: string; href: string }[] = [
    { titel: n.a1T, text: n.a1S, href: `${COMMUNITY.anleitungen}#android` },
    { titel: n.a2T, text: n.a2S, href: `${COMMUNITY.anleitungen}#pc` },
    { titel: n.a3T, text: n.a3S, href: `${COMMUNITY.anleitungen}#fullnode` },
    { titel: n.a4T, text: n.a4S, href: `${COMMUNITY.anleitungen}#pool` },
  ];
  return (
    <>
      {/* Ein kleiner Rechner auf der Fensterbank, draussen der Fjord: ein Knoten ist nichts Grosses. */}
      <Foto src="/buehne/fensterbank.webp" alt="" hoehe="flach" />
      <SubHeader titel="" onZurueck={onZurueck} />
      <div className="foto-platz-flach" />
      <p className="rise text-[13.5px] font-medium text-lamp">{n.gEtikett}</p>
      <h1 className="rise aussage mt-2.5 text-[42px] [text-wrap:balance]">{t.licht.wachsenTitel}</h1>
      <p className="rise rise-1 mt-3 text-[14.5px] leading-[1.45] text-lese">{n.gText}</p>

      <div className="rise rise-1 mt-4">
        {wege.map((w, i) => (
          <Zeile key={w.titel} erste={i === 0} href={w.href} hoch={60} titel={w.titel} text={w.text} />
        ))}
      </div>

      <div className="rise rise-2 mt-6 flex gap-2.5">
        <ExternLink href={COMMUNITY.releases}
                    className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-full bg-lamp px-3 text-center text-[16px] font-semibold leading-[1.15] text-lamp-ink active:scale-[.985]">
          {n.nodeCore}
        </ExternLink>
        <ExternLink href={COMMUNITY.anleitungen}
                    className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-full px-3 text-center text-[16px] font-semibold leading-[1.15] shadow-[inset_0_0_0_1px_rgb(238_244_255/.42)] active:scale-[.985]">
          {n.anleitungen}
        </ExternLink>
      </div>
    </>
  );
}
