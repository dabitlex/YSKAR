'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Zeichen as YZeichen } from '@/components/ui/Marke';
import { useT } from '@/i18n';
import { betragGenau, dezimalZeichen, eingabeEinheiten } from '@/lib/wallet/betrag';
import { NOTIZ_BYTES, notizBytes, notizKuerzen } from '@/lib/wallet/notiz';
import { tippen, eingabeAnzeige, type Taste } from '@/lib/wallet/ziffern';
import { zahlungsCode } from '@/lib/wallet/qr';
import Ziffernfeld from '@/components/wallet/Ziffernfeld';
import { AdresseVierer, KNOPF, Kappe, UMRISS, WKopf, Zeichen } from '@/components/wallet/Teile';

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

  const rahmen = 'flex min-h-[min(700px,calc(92dvh_-_64px))] flex-col';

  // ----------------------------------------------------------- anfordern
  if (ansicht === 'anfordern') {
    const anzeige = eingabeAnzeige(eingabe, zeichen, locale);
    const i = anzeige.lastIndexOf(zeichen);
    const [ganz, bruch] = i < 0 ? [anzeige, ''] : [anzeige.slice(0, i), anzeige.slice(i)];
    const groesse = Math.max(34, Math.min(84, Math.floor(268 / (Math.max(ganz.length, 1) * 0.5 + bruch.length * 0.26))));
    return (
      <div className={rahmen}>
        <WKopf titel={t.empfangen.anfordern} onZurueck={() => setAnsicht('adresse')} />

        <Kappe className="mt-3 block">{t.senden.betrag}</Kappe>
        <p className="mt-2.5 flex items-baseline gap-2.5" aria-live="polite">
          <span className={`betrag ${anzeige ? '' : 'text-faint'}`} style={{ fontSize: groesse }}>
            {ganz || '0'}<small>{bruch}</small>
          </span>
          <span className="font-mono text-[15px] text-lese">{symbol}</span>
        </p>

        <div className="mt-6 flex h-[52px] items-center gap-3 border-y border-line transition-colors focus-within:border-text/60">
          <label htmlFor="anotiz" className="shrink-0 text-[14.5px] text-dim">{t.senden.notiz}</label>
          <input id="anotiz" value={notiz} onChange={e => setNotiz(notizKuerzen(e.target.value))}
                 autoComplete="off" enterKeyHint="done"
                 className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none focus-visible:outline-none" />
          <span className="tnum shrink-0 text-[12.5px] text-dim">{notizBytes(notiz)} / {NOTIZ_BYTES}</span>
        </div>
        <p className="mt-3 text-[13px] leading-[1.45] text-dim">{t.empfangen.anfordernHinweis}</p>

        <div className="mt-auto pt-5">
          <Ziffernfeld onTaste={taste} zeichen={zeichen} />
          <button type="button" disabled={einheiten <= 0n}
                  onClick={() => { setAnforderung({ betrag: einheiten, notiz: notiz.trim() }); setAnsicht('adresse'); }}
                  className={`${KNOPF} mt-3`}>
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

      <h2 className="text-[24px] font-[350] leading-[1.14] tracking-[-.026em]">{t.empfangen.deineAdresse}</h2>

      {/* Der Code steht auf hellem Grund: so liest ihn jede Kamera. */}
      <div className="rise relative mt-[22px] flex h-[262px] w-[262px] items-center justify-center self-center rounded-[22px] bg-[#EDF1F7]">
        {bild
          ? <img src={bild} alt={anforderung ? t.empfangen.qrAltBetrag : t.empfangen.qrAlt} width={226} height={226} className="block h-[226px] w-[226px] mix-blend-multiply" />
          : <div className="flex h-[226px] w-[226px] items-center justify-center text-[13px] text-[#5A6680]">
              {t.empfangen.erzeugt}
            </div>}
        {bild && (
          <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[14px] bg-ink ring-4 ring-[#EDF1F7]">
            <YZeichen g={30} />
          </span>
        )}
      </div>

      {anforderung && (
        <div className="mt-4 flex max-w-full items-center gap-1 self-center rounded-full py-0.5 pl-4 pr-0.5 text-text shadow-[inset_0_0_0_1px_rgb(238_244_255/.42)]">
          <span className="tnum min-w-0 truncate text-[14px] font-medium">
            {t.empfangen.fordertAn(betragGenau(anforderung.betrag, locale, decimals), symbol)}
            {anforderung.notiz && ` · ${t.wallet.zitat(anforderung.notiz)}`}
          </span>
          <button type="button" onClick={() => setAnforderung(null)} aria-label={t.empfangen.anforderungWeg}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lese">
            {Zeichen.Kreuz(14)}
          </button>
        </div>
      )}

      <AdresseVierer adresse={address} mittig className="mx-auto mt-[18px] max-w-[300px]" />

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={kopiere} className={`${KNOPF} !px-3`}>
          {kopiert === 'adresse' ? Zeichen.Haken(18, 2.2) : Zeichen.Kopieren(18)}
          <span className="truncate">{kopiert === 'adresse' ? t.allgemein.Kopiert : t.allgemein.Kopieren}</span>
        </button>
        <button type="button" onClick={teilen} className={`${UMRISS} !px-3`}>
          {kopiert === 'teilen' ? Zeichen.Haken(18, 2.2) : Zeichen.Teilen(18)}
          <span className="truncate">{kopiert === 'teilen' ? t.allgemein.Kopiert : t.allgemein.teilen}</span>
        </button>
      </div>

      <button type="button"
              onClick={() => { setEingabe(''); setNotiz(anforderung?.notiz ?? ''); setAnsicht('anfordern'); }}
              className="mt-[18px] flex min-h-[64px] w-full items-center gap-3.5 border-y border-line py-[11px] text-left active:opacity-70">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium leading-[1.3]">{t.empfangen.anfordern}</span>
          <span className="text-[13.5px] leading-[1.4] text-dim">{t.empfangen.anfordernText}</span>
        </span>
        <span className="-mr-1 shrink-0 text-dim">{Zeichen.Rechts(18)}</span>
      </button>

      <p className="mt-3.5 text-[13px] leading-[1.45] text-dim">{t.empfangen.hinweisKurz}</p>
    </div>
  );
}
