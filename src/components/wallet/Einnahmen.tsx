'use client';

import { useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { betragText } from '@/lib/wallet/betrag';
import { tagSchluessel } from '@/lib/wallet/verlaufGruppen';
import type { EinnahmenTag } from '@/lib/wallet/useEinnahmen';
import { Kappe, PUNKTE } from '@/components/wallet/Teile';

/**
 * Kachel "Mining-Einnahmen": was die Adresse in den letzten 7 oder 30 Tagen
 * aus Bloecken bekommen hat -- eigene Funde und Pool-Anteile, keine
 * Ueberweisungen. Ein Balken je Tag; ein Tipp auf einen Balken zeigt diesen
 * Tag statt der Summe.
 *
 * Die Zahlen kommen fertig vom Server (Migration 00024), auch fuer Tage
 * ohne Einnahmen. Wer in 30 Tagen nichts gemint hat, sieht die Kachel nicht:
 * Sieben leere Balken sagen niemandem etwas.
 */

type Spanne = 7 | 30;
const HOEHE = 60;

/** "2026-10-02" als Datum zur Mittagszeit -- so verrutscht kein Tag. */
function alsDatum(tag: string): Date {
  const [j, m, t] = tag.split('-').map(Number);
  return new Date(j, (m || 1) - 1, t || 1, 12);
}

export default function Einnahmen({ tage, symbol, decimals, verborgen }: {
  tage: EinnahmenTag[]; symbol: string; decimals: number; verborgen: boolean;
}) {
  const { t, locale } = useT();
  const [spanne, setSpanne] = useState<Spanne>(7);
  const [wahl, setWahl] = useState<string | null>(null);

  const sicht = useMemo(() => tage.slice(-spanne).map(x => {
    let summe = 0n;
    try { summe = BigInt(x.summe); } catch { /* 0 */ }
    return { ...x, wert: summe };
  }), [tage, spanne]);
  const gesamt = sicht.reduce((s, x) => s + x.wert, 0n);
  const max = sicht.reduce((m, x) => (x.wert > m ? x.wert : m), 0n);
  const heute = tagSchluessel(Math.floor(Date.now() / 1000));
  const gewaehlt = sicht.find(x => x.tag === wahl) ?? null;

  const wochentag = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const tagLang = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long' });
  const tagKurz = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const name = (tag: string) => (tag === heute ? t.wallet.heute : tagLang.format(alsDatum(tag)));
  const zeigen = (w: bigint) => (verborgen ? PUNKTE : `+${betragText(w, locale, decimals)}`);

  // Balkenhoehe: der beste Tag fuellt die Hoehe. Ein Tag mit Einnahmen ist
  // nie niedriger als 6 px -- sonst saehe "wenig" aus wie "nichts".
  const hoehe = (w: bigint) => {
    if (w <= 0n || max <= 0n) return 3;
    return Math.max(6, Math.round(Number((w * 1000n) / max) / 1000 * HOEHE));
  };

  return (
    <section aria-label={t.wallet.einnahmen} className="panel rise rise-2 mt-3.5 !rounded-[24px] px-[18px] pb-3.5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Kappe>{gewaehlt ? name(gewaehlt.tag) : t.wallet.einnahmen}</Kappe>
          <span className="tnum text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
            {zeigen(gewaehlt ? gewaehlt.wert : gesamt)}{' '}
            <span className="text-[13px] font-extrabold text-dim">{symbol}</span>
          </span>
          {gewaehlt && (
            <span className="text-[12.5px] font-semibold text-dim">{t.wallet.miningBloecke(gewaehlt.bloecke)}</span>
          )}
        </div>
        <div role="group" aria-label={t.wallet.zeitraum} className="flex shrink-0 rounded-[14px] bg-raised p-[3px]">
          {([7, 30] as const).map(n => (
            <button key={n} type="button" aria-pressed={spanne === n}
                    onClick={() => { setSpanne(n); setWahl(null); }}
                    className={`h-[38px] min-w-[50px] rounded-[11px] px-2.5 text-[12.5px] font-extrabold transition-colors ${
                      spanne === n ? 'panel !rounded-[11px] !border-0 text-text' : 'text-dim'}`}>
              {n === 7 ? t.wallet.tage7 : t.wallet.tage30}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3.5 grid items-end"
           style={{ gridTemplateColumns: `repeat(${sicht.length}, minmax(0, 1fr))`,
                    columnGap: spanne === 7 ? 9 : 3, height: HOEHE }}>
        {sicht.map(x => {
          const an = wahl ? x.tag === wahl : x.tag === heute;
          return (
            <button key={x.tag} type="button" aria-pressed={x.tag === wahl}
                    aria-label={`${name(x.tag)}: ${zeigen(x.wert)} ${symbol}, ${t.wallet.miningBloecke(x.bloecke)}`}
                    onClick={() => setWahl(w => (w === x.tag ? null : x.tag))}
                    className="flex h-full items-end">
              <span className={`block w-full transition-[height,background-color] duration-300 ${
                      x.wert <= 0n ? 'bg-raised' : an ? 'bg-work' : 'bg-work/[.14] [[data-thema=dunkel]_&]:bg-work/30'}`}
                    style={{ height: hoehe(x.wert), borderRadius: spanne === 7 ? 7 : 3 }} />
            </button>
          );
        })}
      </div>

      {spanne === 7 ? (
        <div aria-hidden="true" className="mt-[7px] grid text-center text-[11px] font-bold text-dim"
             style={{ gridTemplateColumns: `repeat(${sicht.length}, minmax(0, 1fr))`, columnGap: 9 }}>
          {sicht.map(x => (
            // Nicht abschneiden: "Сегодня" ist breiter als die Spalte und darf
            // ein paar Pixel in den Rand ragen -- daneben ist Platz.
            <span key={x.tag} className={`flex justify-center whitespace-nowrap ${x.tag === heute ? 'font-extrabold text-work' : ''}`}>
              {x.tag === heute ? t.wallet.heute : wochentag.format(alsDatum(x.tag))}
            </span>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="mt-[7px] flex justify-between text-[11px] font-bold text-dim">
          <span>{sicht[0] ? tagKurz.format(alsDatum(sicht[0].tag)) : ''}</span>
          {sicht.length > 1 && (sicht[sicht.length - 1].tag === heute
            ? <span className="font-extrabold text-work">{t.wallet.heute}</span>
            : <span>{tagKurz.format(alsDatum(sicht[sicht.length - 1].tag))}</span>)}
        </div>
      )}
    </section>
  );
}
