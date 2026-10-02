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
import { AdresseVierer, Gegenkachel, MiningKachel, WKopf, WertZeile, Zeichen } from '@/components/wallet/Teile';
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

    return (
      <>
        <WKopf
          vor={ueberweisung ? <Gegenkachel adresse={gegen} size={48} /> : <MiningKachel size={48} />}
          oben={e.kind === 'in' ? t.wallet.dEmpfangenVon : e.kind === 'out' ? t.wallet.dGesendetAn : t.wallet.dMining}
          titel={ueberweisung
            ? (gegenName ?? <span className="font-mono text-[16px] font-medium tracking-normal">{kurzAdresse(gegen, t.allgemein.unbekannt)}</span>)
            : e.kind === 'pool' ? t.wallet.dPoolAnteil : t.wallet.dBlockreward}
          onSchliessen={onSchliessen} />

        <p className="tnum mt-[18px] flex flex-wrap items-baseline gap-x-2">
          <span className={`font-extrabold leading-none tracking-[-0.04em] ${eingang ? 'text-proof' : 'text-text'}`}
                style={{ fontSize: Math.max(26, Math.min(44, Math.floor(300 / ((betragGenau(e.amount, locale, decimals).length + 1) * 0.6)))) }}>
            {eingang ? '+' : '−'}{betragGenau(e.amount, locale, decimals)}
          </span>
          <span className="text-[16px] font-extrabold text-dim">{symbol}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-proof/[.12] pl-2 pr-3 text-[12.5px] font-extrabold text-proof">
            {Zeichen.Haken()}{t.wallet.bestaetigtKurz}
          </span>
          <span className="tnum text-[13px] font-semibold text-dim">
            {t.wallet.blockNr(zahl(e.height))}{danach != null && ` · ${t.wallet.bloeckeDanach(danach)}`}
          </span>
        </div>

        <section className="panel mt-4 flex flex-col !rounded-[24px] px-[18px] py-1">
          {ueberweisung && (
            <div className="pb-3.5 pt-3">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[12.5px] font-bold text-dim">{eingang ? t.wallet.dAbsender : t.wallet.dEmpfaenger}</span>
                {gegen && (
                  <button type="button" onClick={() => kopiere('adresse', gegen)}
                          className="-my-2 -mr-2 flex h-11 items-center gap-1.5 px-2 text-[13px] font-extrabold text-work">
                    {Zeichen.Kopieren(16)}{kopiert === 'adresse' ? t.allgemein.Kopiert : t.allgemein.Kopieren}
                  </button>
                )}
              </div>
              {gegen
                ? <AdresseVierer adresse={gegen} className="mt-2" />
                : <p className="mt-2 text-[13.5px] font-semibold text-dim">{t.allgemein.unbekannt}</p>}
              {gegen && (
                <button type="button" onClick={() => setKontakt(gegen)}
                        className="-mb-1.5 mt-1.5 flex h-11 items-center gap-2 text-[13px] font-extrabold text-work">
                  {gegenName ? Zeichen.Stift() : Zeichen.Person(17)}
                  {gegenName ? t.kontakt.bearbeiten : t.kontakt.alsKontakt}
                </button>
              )}
            </div>
          )}
          <WertZeile label={t.wallet.zeitpunkt} ohneLinie={!ueberweisung}>{zeit}</WertZeile>
          {notiz && <WertZeile label={t.wallet.notiz}>{t.wallet.zitat(notiz)}</WertZeile>}
          {e.kind === 'out' && gebuehr > 0n && (
            <WertZeile label={t.wallet.netzgebuehr}>{betragGenau(gebuehr, locale, decimals, 4)} {symbol}</WertZeile>
          )}
          {e.kind === 'pool' && (e.shares ?? 0) > 0 && (
            <WertZeile label={t.wallet.dAufgeteilt}>{t.wallet.adressen(e.shares!)}</WertZeile>
          )}
          <button type="button" aria-expanded={technik} onClick={() => setTechnik(x => !x)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 border-t border-line py-1.5 text-left">
            <span className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-extrabold">{t.wallet.technik}</span>
              <span className="text-[12.5px] font-semibold text-dim">{t.wallet.technikText}</span>
            </span>
            <span className={`shrink-0 text-dim transition-transform ${technik ? 'rotate-180' : ''}`}>{Zeichen.Unten()}</span>
          </button>
          {technik && (
            <div className="pb-3">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[12.5px] font-bold text-dim">{t.wallet.txid}</span>
                <button type="button" onClick={() => kopiere('txid', e.txid)}
                        className="-my-2 -mr-2 flex h-11 items-center gap-1.5 px-2 text-[13px] font-extrabold text-work">
                  {Zeichen.Kopieren(16)}{kopiert === 'txid' ? t.allgemein.Kopiert : t.allgemein.Kopieren}
                </button>
              </div>
              <p className="mt-1 break-all font-mono text-[12.5px] leading-[1.5] text-dim">{e.txid}</p>
              {e.idx != null && (
                <p className="tnum mt-2 text-[12.5px] font-semibold text-dim">{t.wallet.position(zahl(e.height), e.idx)}</p>
              )}
            </div>
          )}
        </section>

        <div className="mt-4 space-y-2.5">
          <ExternLink href={`${EXPLORER_URL}#block-${e.height}`}
                      className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] border border-line bg-surface text-[15px] font-extrabold text-text">
            {t.wallet.imExplorer}{Zeichen.Extern(17)}
          </ExternLink>
          <button type="button" onClick={onSchliessen}
                  className="h-[54px] w-full rounded-[18px] bg-raised text-[15px] font-extrabold active:scale-[.985]">
            {t.allgemein.schliessen}
          </button>
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
