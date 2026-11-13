'use client';

import { useEffect, useState } from 'react';
import { Blatt } from '@/components/ui/Bausteine';
import { ExternLink, EXPLORER_URL } from '@/components/ui/ExternLink';
import { useT } from '@/i18n';
import { betragGenau } from '@/lib/wallet/betrag';
import { kurzAdresse } from '@/lib/wallet/adresse';
import { notizAusHex } from '@/lib/wallet/notiz';
import { useKontakte } from '@/lib/wallet/kontakte';
import KontaktBlatt from '@/components/wallet/KontaktBlatt';
import { AdresseVierer, Punkt, UMRISS, VERWEIS, WKopf, WertZeile, Zeichen } from '@/components/wallet/Teile';
import type { HistoryEintrag } from '@/components/tabs/WalletTab';

/**
 * Einzelheiten zu einer Transaktion.
 *
 * Oben steht, was ein Mensch wissen will: wer, wie viel, ob es fest ist.
 * Die Gegenadresse steht VOLLSTAENDIG da, in Vierergruppen -- wer pruefen
 * will, ob das Geld bei der richtigen Adresse gelandet ist, muss alle
 * Zeichen sehen; gekuerzte Adressen lassen sich faelschen, indem man Anfang
 * und Ende trifft. Transaktions-ID und Position im Block sind eingeklappt:
 * Die braucht, wer etwas nachschlagen will, nicht jeder.
 */
export default function Detail({ eintrag, decimals, symbol, hoehe, onSchliessen }: {
  /** null = Blatt zu. */
  eintrag: HistoryEintrag | null; decimals: number; symbol: string;
  /** Aktuelle Hoehe der Kette -- fuer "n Bloecke danach". */
  hoehe: number | null;
  onSchliessen: () => void;
}) {
  const { t, locale, zahl } = useT();
  const { name } = useKontakte();
  // Der Eintrag bleibt stehen, waehrend das Blatt zufaehrt.
  const [gezeigt, setGezeigt] = useState(eintrag);
  const [technik, setTechnik] = useState(false);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [kontakt, setKontakt] = useState<string | null>(null);
  useEffect(() => {
    if (!eintrag) return;
    setGezeigt(eintrag); setTechnik(false); setKopiert(null);
  }, [eintrag]);

  const e = gezeigt;
  const kopiere = async (was: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(was);
      setTimeout(() => setKopiert(k => (k === was ? null : k)), 1600);
    } catch { /* nicht ueberall erlaubt */ }
  };

  const inhalt = () => {
    if (!e) return null;
    const ueberweisung = e.kind === 'in' || e.kind === 'out';
    const eingang = e.kind !== 'out';
    const gegen = ueberweisung ? e.counterparty : null;
    const gegenName = name(gegen);
    const notiz = ueberweisung ? notizAusHex(e.memo) : '';
    let gebuehr = 0n;
    try { gebuehr = BigInt(e.fee); } catch { /* 0 */ }
    const danach = hoehe != null && hoehe >= e.height ? hoehe - e.height : null;
    const zeit = e.timestamp
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          .format(new Date(Number(e.timestamp) * 1000))
      : '—';

    const text = betragGenau(e.amount, locale, decimals);
    const trenner = new Intl.NumberFormat(locale).formatToParts(1.1).find(p => p.type === 'decimal')?.value ?? ',';
    const i = text.lastIndexOf(trenner);
    const [ganz, bruch] = i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i)];
    const groesse = Math.max(34, Math.min(84, Math.floor(262 / ((ganz.length + 1) * 0.5 + bruch.length * 0.26))));
    const verweis = `${VERWEIS} gap-2`;

    return (
      <>
        <WKopf
          titel={ueberweisung
            ? (e.kind === 'in' ? t.wallet.dEmpfangenVon : t.wallet.dGesendetAn)
            : e.kind === 'pool' ? t.wallet.dPoolAnteil : t.wallet.dBlockreward}
          onSchliessen={onSchliessen} />

        {/* Woher der Eintrag kommt: kalt von der Kette, warm von einem Menschen. */}
        <p className="mt-2 flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-dim">
          <Punkt art={ueberweisung ? 'mensch' : 'kette'} className="!ml-0" />
          <span className="min-w-0 truncate">
            {ueberweisung
              ? (gegenName ?? <span className="font-mono text-[13px] font-normal">{kurzAdresse(gegen, t.allgemein.unbekannt)}</span>)
              : t.wallet.dMining}
          </span>
        </p>
        <p className="mt-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className={`betrag ${eingang ? 'text-text' : 'text-lese'}`} style={{ fontSize: groesse }}>
            {eingang ? '+' : '−'}{ganz}<small>{bruch}</small>
          </span>
          <span className="font-mono text-[15px] text-lese">{symbol}</span>
        </p>

        <section className="mt-7 flex flex-col border-b border-line">
          <WertZeile label={t.wallet.status}>
            <span className="inline-flex items-center gap-2 text-text">
              <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-proof" />{t.wallet.bestaetigtKurz}
            </span>
          </WertZeile>
          <WertZeile label={t.wallet.blockNr(zahl(e.height))}>{danach != null ? t.wallet.bloeckeDanach(danach) : '—'}</WertZeile>
          <WertZeile label={t.wallet.zeitpunkt}>{zeit}</WertZeile>
          {ueberweisung && (
            <div className="border-t border-line pb-2 pt-[14px]">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[14.5px] text-dim">{eingang ? t.wallet.dAbsender : t.wallet.dEmpfaenger}</span>
                {gegen && (
                  <button type="button" onClick={() => kopiere('adresse', gegen)}
                          className={`${verweis} -my-3`}>
                    {Zeichen.Kopieren(16)}{kopiert === 'adresse' ? t.allgemein.Kopiert : t.allgemein.Kopieren}
                  </button>
                )}
              </div>
              {gegen
                ? <AdresseVierer adresse={gegen} className="mt-2.5" />
                : <p className="mt-2 text-[14.5px] text-dim">{t.allgemein.unbekannt}</p>}
              {gegen && (
                <button type="button" onClick={() => setKontakt(gegen)} className={`${verweis} mt-1`}>
                  {gegenName ? Zeichen.Stift() : Zeichen.Person(17)}
                  {gegenName ? t.kontakt.bearbeiten : t.kontakt.alsKontakt}
                </button>
              )}
            </div>
          )}
          {notiz && <WertZeile label={t.wallet.notiz}>{t.wallet.zitat(notiz)}</WertZeile>}
          {e.kind === 'out' && gebuehr > 0n && (
            <WertZeile label={t.wallet.netzgebuehr}>
              <span className="font-mono text-[14px]">{betragGenau(gebuehr, locale, decimals, 4)} {symbol}</span>
            </WertZeile>
          )}
          {e.kind === 'pool' && (e.shares ?? 0) > 0 && (
            <WertZeile label={t.wallet.dAufgeteilt}>{t.wallet.adressen(e.shares!)}</WertZeile>
          )}
          <button type="button" aria-expanded={technik} onClick={() => setTechnik(x => !x)}
                  className="flex min-h-[62px] w-full items-center justify-between gap-3 border-t border-line py-[11px] text-left">
            <span className="flex flex-col gap-0.5">
              <span className="text-[16px] font-medium leading-[1.3]">{t.wallet.technik}</span>
              <span className="text-[13.5px] leading-[1.4] text-dim">{t.wallet.technikText}</span>
            </span>
            <span className={`-mr-1 shrink-0 text-dim transition-transform ${technik ? 'rotate-180' : ''}`}>{Zeichen.Unten(18)}</span>
          </button>
          {technik && (
            <div className="pb-4">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[14.5px] text-dim">{t.wallet.txid}</span>
                <button type="button" onClick={() => kopiere('txid', e.txid)} className={`${verweis} -my-3`}>
                  {Zeichen.Kopieren(16)}{kopiert === 'txid' ? t.allgemein.Kopiert : t.allgemein.Kopieren}
                </button>
              </div>
              <p className="terminal mt-2.5 break-all font-mono text-[13px] leading-[1.55] text-lese">{e.txid}</p>
              {e.idx != null && (
                <p className="tnum mt-2.5 text-[13px] text-dim">{t.wallet.position(zahl(e.height), e.idx)}</p>
              )}
            </div>
          )}
        </section>

        <div className="mt-5 flex flex-col gap-2.5">
          <ExternLink href={`${EXPLORER_URL}#block-${e.height}`} className={UMRISS}>
            <span className="truncate">{t.wallet.imExplorer}</span>{Zeichen.Extern(17)}
          </ExternLink>
        </div>
      </>
    );
  };

  return (
    <>
      <Blatt offen={!!eintrag} onSchliessen={onSchliessen} grund="ink">{inhalt()}</Blatt>
      <KontaktBlatt adresse={kontakt} onSchliessen={() => setKontakt(null)} />
    </>
  );
}
