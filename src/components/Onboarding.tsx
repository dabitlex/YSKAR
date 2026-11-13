'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { keypairFromMnemonic } from '@/lib/core/wallet';
import { Notice } from '@/components/ui/Primitives';
import WortFelder, { istWort } from '@/components/wallet/WortFelder';
import PinFeld, { PinTasten, PIN_LAENGE } from '@/components/PinFeld';
import { useT, SPRACHEN, fehlerText as grund } from '@/i18n';
import { telegramFarben, useZurueckTaste, haptik, imTelegram } from '@/lib/telegram/webapp';
import { leistenFaerben } from '@/lib/native/leisten';
import { einstiegMerken } from '@/lib/einstieg';
import { Zeichen } from '@/components/ui/Marke';
import Ufer from '@/components/mining/Ufer';
import { vorgeladen } from '@/lib/vorladen';
import { AktionEingeladen, useEingeladen } from '@/components/aktion/Aktion';

/**
 * Der Einstieg im Design "Erstes Licht" (November 2026): vier Schritte bis
 * zum ersten Licht.
 *
 *   w1   Willkommen: der Fjord, "Mach dein Licht an.", Sprache waehlen
 *   pin  PIN festlegen (zweimal eingeben)
 *   --   zwoelf Woerter aufschreiben und bestaetigen (components/Sicherung.tsx,
 *        Pflicht nach dem Erstellen)
 *
 * Danach waehlt der Nutzer seinen Pool selbst (AppShell). Die frueheren
 * Erklaerbildschirme entfallen; die Sicherheitshinweise stehen bei den
 * Woertern, wo man sie braucht.
 *
 * Was sich NICHT geaendert hat: Die zwoelf Woerter entstehen auf dem Geraet,
 * nur der Nutzer hat sie, und sie liegen mit der PIN verschluesselt im
 * Speicher.
 */

type Schritt = 'w1' | 'pin' | 'wiederherstellen' | 'wPin';

export default function Onboarding() {
  const wallet = useWallet();
  const [schritt, setSchritt] = useState<Schritt>('w1');
  const [woerter, setWoerter] = useState<string[]>(() => Array(12).fill(''));

  useEffect(() => { telegramFarben(true); leistenFaerben(true); }, []);

  const zurueck: Partial<Record<Schritt, Schritt>> = {
    pin: 'w1', wiederherstellen: 'w1', wPin: 'wiederherstellen',
  };
  useZurueckTaste(!!zurueck[schritt], () => { const z = zurueck[schritt]; if (z) setSchritt(z); });

  return (
    <div className="thema-dunkel min-h-dvh">
      {schritt === 'w1' && <Willkommen onStarten={() => setSchritt('pin')}
                                       onWiederherstellen={() => setSchritt('wiederherstellen')} />}
      {schritt === 'pin' && (
        <PinSchritt onZurueck={() => setSchritt('w1')}
                    onFertig={async pin => {
                      // Vorher merken: Sobald die Wallet steht, baut sich die App auf.
                      einstiegMerken(true);
                      await wallet.erstellenUndVersiegeln(pin);
                    }} />
      )}
      {schritt === 'wiederherstellen' && (
        <Wiederherstellen woerter={woerter} setWoerter={setWoerter}
                          onZurueck={() => setSchritt('w1')} onWeiter={() => setSchritt('wPin')} />
      )}
      {schritt === 'wPin' && (
        <PinSchritt wiederherstellen onZurueck={() => setSchritt('wiederherstellen')}
                    onFertig={async pin => {
                      einstiegMerken();
                      const r = await wallet.recover(woerter.map(w => w.trim()).join(' '), pin);
                      if (!r.ok) throw new Error(r.reason);
                    }} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ Bausteine

function Pfeil() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-text">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  );
}

/** Weisse Pille mit Pfeil -- der Hauptknopf auf yskar.app und in der Wallet. */
function Hauptknopf({ children, onClick, disabled, mitte }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; mitte?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
            className={`flex h-14 w-full items-center rounded-full bg-lamp text-[15.5px] font-semibold text-lamp-ink transition-transform
                        active:scale-[.985] disabled:opacity-40 disabled:active:scale-100 ${mitte ? 'justify-center px-6' : 'justify-between pl-[26px] pr-2'}`}>
      {children}{!mitte && <Pfeil />}
    </button>
  );
}

function ZurueckKnopf({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  // In Telegram fuehrt der Client oben links "Zurueck" -- ein eigener Pfeil waere doppelt.
  if (imTelegram()) return null;
  return (
    <button type="button" onClick={onClick} aria-label={t.allgemein.zurueck}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(140_170_255/.22)] text-text active:scale-95">
      <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 5l-6 6 6 6" /></svg>
    </button>
  );
}

/**
 * Willkommen: der Fjord in voller Hoehe, am Ufer ein Licht je aktivem Miner
 * (aus dem Netzstand, der hinter dem Startbild geladen wurde), der eigene
 * Platz als leerer Ring. Oben rechts die Sprache: Wer sie nicht versteht,
 * kann den Rest nicht beurteilen.
 */
function Willkommen({ onStarten, onWiederherstellen }: { onStarten: () => void; onWiederherstellen: () => void }) {
  const { t, sprache, setSprache } = useT();
  const eingeladen = useEingeladen();
  const lichter = vorgeladen().summary?.activeMiners ?? 0;
  return (
    <main className="buehne-voll rand-oben relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-6 pb-[calc(22px+var(--unten))]">
      <Ufer lichter={lichter} mein="aus" schild={t.licht.deinPlatz} />
      <div className="relative z-[1] flex min-h-11 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Zeichen g={28} />
          <span className="pt-px text-[14px] font-semibold tracking-[.2em]">YSKAR</span>
        </div>
        <label className="flex h-11 items-center gap-2 rounded-full bg-ink/60 px-4 text-[13.5px] font-medium shadow-[inset_0_0_0_1px_rgb(238_244_255/.26)] backdrop-blur">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18" /></svg>
          <span className="sr-only">{t.allgemein.sprache}</span>
          <select value={sprache} onChange={e => setSprache(e.target.value as typeof sprache)}
                  className="appearance-none bg-transparent text-[13.5px] font-medium text-text outline-none">
            {SPRACHEN.map(sp => <option key={sp.code} value={sp.code} lang={sp.code}>{sp.name}</option>)}
          </select>
        </label>
      </div>
      {eingeladen && <div className="relative z-[1] mt-3"><AktionEingeladen /></div>}
      <div className="min-h-6 flex-1" />
      <div className="relative z-[1] flex flex-col">
        <h1 className="aussage whitespace-pre-line text-[clamp(40px,14vw,56px)] leading-[.95] tracking-[-.05em]">{t.licht.einstiegTitel}</h1>
        <p className="mt-4 text-[15.5px] leading-[1.5] text-lese">{t.licht.einstiegText}</p>
        <button type="button" onClick={() => { haptik('tipp'); onStarten(); }}
                className="mt-7 flex min-h-14 w-full items-center justify-center gap-[9px] rounded-full bg-lamp px-6 text-[17px] font-semibold tracking-[-.01em] text-lamp-ink active:scale-[.985]">
          {t.rd.w.erstellen} · {t.rd.sicher.zeit}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
        <button type="button" onClick={onWiederherstellen}
                className="mt-1 min-h-11 text-[15.5px] font-medium text-text underline decoration-text/40 underline-offset-4">{t.rd.w.habeWoerter}</button>
      </div>
    </main>
  );
}

// ------------------------------------------------------------ PIN

/**
 * PIN festlegen: zweimal eingeben, dann geht es los. Beim sechsten Punkt
 * springt der Bildschirm von selbst weiter -- ein Knopf "Weiter" waere nur
 * ein Tipp mehr.
 */
function PinSchritt({ onFertig, onZurueck, wiederherstellen = false }: {
  onFertig: (pin: string) => Promise<void>;
  onZurueck: () => void;
  wiederherstellen?: boolean;
}) {
  const { t } = useT();
  const [erste, setErste] = useState<string | null>(null);
  const [wert, setWert] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [zittert, setZittert] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wert.length !== PIN_LAENGE || busy) return;
    if (erste === null) {
      const id = setTimeout(() => { setErste(wert); setWert(''); }, 140);
      return () => clearTimeout(id);
    }
    if (wert !== erste) {
      haptik('warnung');
      setZittert(true);
      setFehler(t.einstieg.pinFalsch);
      const id = setTimeout(() => { setZittert(false); setErste(null); setWert(''); }, 420);
      return () => clearTimeout(id);
    }
    setBusy(true);
    onFertig(wert).then(() => haptik('erfolg')).catch((e: Error) => {
      setFehler(grund(e.message, t));
      setBusy(false); setErste(null); setWert('');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert]);

  const bestaetigen = erste !== null;
  return (
    <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-[calc(28px+var(--unten))]">
      <div className="flex min-h-11 items-center">
        <ZurueckKnopf onClick={() => (bestaetigen && !busy ? (setErste(null), setWert('')) : onZurueck())} />
        {!wiederherstellen && <span className="ml-auto text-[13px] text-dim">{t.licht.schritt(1, 3)}</span>}
      </div>

      <div className="mt-5">
        <h1 className="text-[24px] font-[350] leading-[1.14] tracking-[-.026em]">
          {bestaetigen ? t.einstieg.pin2Titel : t.einstieg.pinTitel}
        </h1>
        <p className="mt-3 text-[14.5px] leading-[1.45] text-lese">
          {bestaetigen ? t.einstieg.pin2Text : wiederherstellen ? t.einstieg.wPinText : t.rd.w.pinText}
        </p>
      </div>

      <div className="mt-12"><PinFeld wert={wert} onChange={setWert} gesperrt={busy} fehler={zittert} /></div>
      <p className={`mt-5 min-h-[20px] text-center text-[13.5px] ${fehler ? 'text-risk' : 'text-dim'}`}>
        {busy ? t.einstieg.pinRichtet : fehler ?? (bestaetigen ? '' : t.einstieg.pinHinweis)}
      </p>

      <div className="flex-1" />
      <PinTasten wert={wert} onChange={v => { setWert(v); if (v.length > 0) setFehler(null); }} gesperrt={busy} />
    </main>
  );
}

// ------------------------------------------------------------ Wiederherstellen

function Wiederherstellen({ woerter, setWoerter, onZurueck, onWeiter }: {
  woerter: string[]; setWoerter: (w: string[]) => void;
  onZurueck: () => void; onWeiter: () => void;
}) {
  const { t } = useT();
  const text = woerter.map(w => w.trim()).join(' ');
  const anzahl = woerter.filter(istWort).length;
  // Adressvorschau, sobald die Woerter stimmen: Wer die falsche Wallet
  // wiederherstellt, sieht das sofort -- nicht erst am fehlenden Guthaben.
  const vorschau = useMemo(() => {
    try { return anzahl === 12 ? keypairFromMnemonic(text).address : null; } catch { return null; }
  }, [text, anzahl]);

  return (
    <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-[22px] pb-[calc(28px+var(--unten))]">
      <div className="flex min-h-11 items-center"><ZurueckKnopf onClick={onZurueck} /></div>
      <h1 className="aussage mt-3 text-[33px] leading-[1.05] tracking-[-.036em]">{t.einstieg.wTitel}</h1>
      <p className="mt-3 text-[14.5px] leading-[1.45] text-lese">{t.rd.w.wText}</p>

      <div className="mt-5">
        <WortFelder woerter={woerter} onChange={setWoerter}
                    texte={{ wort: t.pruefen.wort, einfuegen: t.wiederherstellen.einfuegen,
                             nichtInListe: t.wiederherstellen.nichtInListe }} />
      </div>
      <p className="tnum mt-2 text-[13px] font-semibold text-dim">
        {anzahl === 12 && !vorschau ? t.wiederherstellen.ungueltig : t.wiederherstellen.anzahl(anzahl)}
      </p>

      {vorschau && (
        <div className="panel mt-4 px-4 py-3">
          <p className="label">{t.wiederherstellen.vorschau}</p>
          <p className="mt-1 break-all font-mono text-[12.5px] text-proof">{vorschau}</p>
        </div>
      )}

      <div className="min-h-6 flex-1" />
      {anzahl === 12 && !vorschau && <div className="mb-3"><Notice tone="risk">{t.wiederherstellen.ungueltig}</Notice></div>}
      <Hauptknopf onClick={onWeiter} disabled={!vorschau}>{t.einstieg.wWeiter}</Hauptknopf>
    </main>
  );
}
