'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useT } from '@/i18n';
import { betragGenau, dezimalZeichen, eingabeEinheiten } from '@/lib/wallet/betrag';
import { NOTIZ_BYTES, notizBytes, notizKuerzen } from '@/lib/wallet/notiz';
import { tippen, eingabeAnzeige, type Taste } from '@/lib/wallet/ziffern';
import { zahlungsCode } from '@/lib/wallet/qr';
import Ziffernfeld from '@/components/wallet/Ziffernfeld';
import { AdresseVierer, Kappe, WKopf, Zeichen } from '@/components/wallet/Teile';

/**
 * Empfangen.
 *
 * Der QR-Code wird auf dem Geraet erzeugt, nicht von einem Dienst geholt --
 * eine Adresse an einen fremden Server zu schicken, nur um ein Bild
 * zurueckzubekommen, waere unnoetig und verraeterisch.
 *
 * "Betrag anfordern" legt Betrag und Notiz mit in den Code
 * (lib/wallet/qr.ts). Wer ihn scannt, bekommt beides vorausgefuellt. Aeltere
 * Fassungen der App lesen aus demselben Code nur die Adresse.
 */

/** Nachkommastellen der Kette (1 YSR = 10^8 Einheiten). */
const STELLEN = 8;

export default function Receive({ address, symbol, decimals, onZurueck }: {
  address: string; symbol: string; decimals: number; onZurueck: () => void;
}) {
  const { t, locale } = useT();
  const zeichen = useMemo(() => dezimalZeichen(locale), [locale]);
  const [bild, setBild] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<'adresse' | 'teilen' | null>(null);
  const [ansicht, setAnsicht] = useState<'adresse' | 'anfordern'>('adresse');
  // Angeforderte Zahlung im Code; null = die blanke Adresse.
  const [anforderung, setAnforderung] = useState<{ betrag: bigint; notiz: string } | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [notiz, setNotiz] = useState('');

  const code = useMemo(
    () => zahlungsCode(address, anforderung?.betrag, anforderung?.notiz, STELLEN),
    [address, anforderung]);

  useEffect(() => {
    let lebt = true;
    setBild(null);
    import('qrcode').then(QR => QR.toDataURL(code, {
      // Hoechste Fehlerkorrektur: In der Mitte liegt das Logo ueber dem Code
      // und verdeckt einen Teil -- der Code muss trotzdem lesbar bleiben.
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 660,
      // Dunkel auf hell: Lesegeraete erwarten diesen Kontrast. Ein
      // invertierter Code wird von vielen Kameras nicht erkannt.
      color: { dark: '#0E1A2F', light: '#FFFFFF' },
    })).then(b => { if (lebt) setBild(b); }).catch(() => { if (lebt) setBild(null); });
    return () => { lebt = false; };
  }, [code]);

  const merke = (was: 'adresse' | 'teilen') => { setKopiert(was); setTimeout(() => setKopiert(k => (k === was ? null : k)), 2000); };
  const kopiere = async () => {
    try { await navigator.clipboard.writeText(address); merke('adresse'); } catch { /* egal */ }
  };
  const teilen = async () => {
    // Mit Betrag: ein Satz fuer den Menschen, darunter der Code -- "Einfuegen"
    // beim Senden findet ihn in der Nachricht.
    const text = anforderung
      ? `${t.empfangen.teilenText(betragGenau(anforderung.betrag, locale, decimals), symbol)}\n${code}`
      : address;
    if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(text); merke('teilen'); } catch { /* egal */ }
  };

  const einheiten = useMemo(() => eingabeEinheiten(eingabe, STELLEN), [eingabe]);
  const taste = useCallback((k: Taste) => setEingabe(b => tippen(b, k, zeichen, STELLEN)), [zeichen]);

  // Tastatur am Rechner: Ziffern tippen wie gewohnt.
  useEffect(() => {
    if (ansicht !== 'anfordern') return;
    const hoere = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) taste(e.key as Taste);
      else if (e.key === ',' || e.key === '.') taste('komma');
      else if (e.key === 'Backspace') taste('loeschen');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', hoere);
    return () => window.removeEventListener('keydown', hoere);
  }, [ansicht, taste]);

  const knopf = 'flex h-[54px] items-center justify-center gap-2 rounded-[18px] text-[15px] font-extrabold transition-transform active:scale-[.985]';
  const rahmen = 'flex min-h-[min(700px,calc(92dvh_-_64px))] flex-col';

  // ----------------------------------------------------------- anfordern
  if (ansicht === 'anfordern') {
    const anzeige = eingabeAnzeige(eingabe, zeichen, locale);
    const groesse = Math.max(28, Math.min(58, Math.floor(270 / (Math.max(anzeige.length, 1) * 0.6))));
    return (
      <div className={rahmen}>
        <WKopf titel={t.empfangen.anfordern} onZurueck={() => setAnsicht('adresse')} />

        <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
          <p className="tnum flex items-baseline gap-2" aria-live="polite">
            <span className={`font-extrabold leading-none tracking-[-0.04em] ${anzeige ? '' : 'text-faint'}`} style={{ fontSize: groesse }}>
              {anzeige || '0'}
            </span>
            <span className="text-[18px] font-extrabold text-dim">{symbol}</span>
          </p>
        </div>

        <div className="panel mt-6 flex h-[50px] items-center gap-2.5 !rounded-[16px] px-3.5 focus-within:border-work">
          <label htmlFor="anotiz" className="shrink-0 text-[13px] font-bold text-dim">{t.senden.notiz}</label>
          <input id="anotiz" value={notiz} onChange={e => setNotiz(notizKuerzen(e.target.value))}
                 autoComplete="off" enterKeyHint="done"
                 className="h-11 min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none focus-visible:outline-none" />
          <span className="tnum shrink-0 text-[12px] font-semibold text-dim">{notizBytes(notiz)} / {NOTIZ_BYTES}</span>
        </div>
        <p className="mx-1 mt-2.5 text-[12.5px] font-semibold leading-[1.5] text-dim">{t.empfangen.anfordernHinweis}</p>

        <div className="mt-auto pt-5">
          <Ziffernfeld onTaste={taste} zeichen={zeichen} />
          <button type="button" disabled={einheiten <= 0n}
                  onClick={() => { setAnforderung({ betrag: einheiten, notiz: notiz.trim() }); setAnsicht('adresse'); }}
                  className={`${knopf} mt-3.5 !h-14 w-full bg-work text-white shadow-[0_12px_24px_-14px_rgb(var(--work)/.8)] disabled:opacity-45 disabled:shadow-none`}>
            {t.empfangen.codeErstellen}
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- adresse
  return (
    <div className="flex flex-col">
      <WKopf titel={t.empfangen.titel} onSchliessen={onZurueck} />

      <section className="panel rise flex flex-col items-center gap-4 !rounded-[28px] px-[18px] pb-[18px] pt-5">
        <div className="relative h-[248px] w-[248px] rounded-[22px] bg-white p-3.5 ring-1 ring-line">
          {bild
            ? <img src={bild} alt={anforderung ? t.empfangen.qrAltBetrag : t.empfangen.qrAlt} width={220} height={220} className="block h-[220px] w-[220px]" />
            : <div className="flex h-[220px] w-[220px] items-center justify-center text-xs font-semibold text-[#8E9AB0]">
                {t.empfangen.erzeugt}
              </div>}
          {bild && (
            <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[16px] bg-white">
              <Image src="/marke/kristall.png" alt="" width={36} height={24}
                     style={{ width: 36, height: 24, objectFit: 'contain' }} />
            </span>
          )}
        </div>

        {anforderung && (
          <div className="flex max-w-full items-center gap-1 rounded-full bg-work/10 py-1 pl-3.5 pr-1 text-work">
            <span className="tnum min-w-0 truncate text-[13px] font-extrabold">
              {t.empfangen.fordertAn(betragGenau(anforderung.betrag, locale, decimals), symbol)}
              {anforderung.notiz && ` · ${t.wallet.zitat(anforderung.notiz)}`}
            </span>
            <button type="button" onClick={() => setAnforderung(null)} aria-label={t.empfangen.anforderungWeg}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
              {Zeichen.Kreuz(13)}
            </button>
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <Kappe>{t.empfangen.deineAdresse}</Kappe>
          <AdresseVierer adresse={address} mittig className="max-w-[300px]" />
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={kopiere}
                className={`${knopf} bg-work text-white shadow-[0_12px_24px_-14px_rgb(var(--work)/.8)]`}>
          {kopiert === 'adresse' ? Zeichen.Haken(19, 2.2) : Zeichen.Kopieren(19)}
          {kopiert === 'adresse' ? t.allgemein.Kopiert : t.allgemein.Kopieren}
        </button>
        <button type="button" onClick={teilen} className={`${knopf} border border-line bg-surface`}>
          {kopiert === 'teilen' ? Zeichen.Haken(19, 2.2) : Zeichen.Teilen()}
          {kopiert === 'teilen' ? t.allgemein.Kopiert : t.allgemein.teilen}
        </button>
      </div>

      <button type="button"
              onClick={() => { setEingabe(''); setNotiz(anforderung?.notiz ?? ''); setAnsicht('anfordern'); }}
              className="panel mt-2.5 flex min-h-[62px] w-full items-center gap-3 !rounded-[18px] !shadow-none px-3.5 py-[9px] text-left active:opacity-80">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-work/10 text-work">
          {Zeichen.Muenze()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14.5px] font-extrabold">{t.empfangen.anfordern}</span>
          <span className="text-[12.5px] font-semibold text-dim">{t.empfangen.anfordernText}</span>
        </span>
        <span className="shrink-0 text-dim">{Zeichen.Rechts()}</span>
      </button>

      <p className="mx-1 mt-3.5 text-[12.5px] font-semibold leading-[1.5] text-dim">{t.empfangen.hinweisKurz}</p>
    </div>
  );
}
