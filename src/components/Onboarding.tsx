'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useWallet } from '@/lib/wallet/useWallet';
import { keypairFromMnemonic } from '@/lib/core/wallet';
import { Notice } from '@/components/ui/Primitives';
import WortFelder, { istWort } from '@/components/wallet/WortFelder';
import PinFeld, { PinTasten, PIN_LAENGE } from '@/components/PinFeld';
import { useT, SPRACHEN, fehlerText as grund } from '@/i18n';
import { useThema } from '@/lib/useThema';
import { telegramFarben, useZurueckTaste, haptik } from '@/lib/telegram/webapp';
import { leistenFaerben } from '@/lib/native/leisten';
import { vorgeladen } from '@/lib/vorladen';
import { vorschlag, type PoolStand } from '@/lib/pool/verzeichnis';
import { ExternLink } from '@/components/ui/ExternLink';
import { COMMUNITY } from '@/lib/community';
import { einstiegMerken } from '@/lib/einstieg';

/**
 * Der Einstieg -- fuer jemanden, der gerade eine Anzeige gesehen hat.
 *
 * Erst zeigen, was YSKAR ist (drei Karten, mit echten Zahlen aus dem Netz),
 * dann ein Knopf: "Mining starten". Danach eine PIN, und das Telefon
 * rechnet. Vier Tipps statt zehn Schritte.
 *
 * Was sich gegenueber vorher NICHT geaendert hat: Die zwoelf Woerter
 * entstehen auf dem Geraet, nur der Nutzer hat sie, und sie liegen mit der
 * PIN verschluesselt im Speicher. Neu ist nur der Zeitpunkt der Sicherung:
 * Sie kommt, wenn es etwas zu sichern gibt -- und Senden bleibt gesperrt,
 * bis sie erledigt ist (siehe components/Sicherung.tsx).
 *
 * Der ganze Einstieg ist dunkel, unabhaengig vom gewaehlten Thema: Das
 * Markenbild ist eine Nacht im Gebirge, und der Uebergang in die helle App
 * markiert den Moment, ab dem das Telefon mitrechnet.
 */

type Schritt = 'w1' | 'w2' | 'w3' | 'pin' | 'wiederherstellen' | 'wPin';

export default function Onboarding() {
  const wallet = useWallet();
  const { dunkel } = useThema();
  const [schritt, setSchritt] = useState<Schritt>('w1');
  const [woerter, setWoerter] = useState<string[]>(() => Array(12).fill(''));

  // Telegram-Leisten und Android-Systemleisten passend zum dunklen Einstieg,
  // danach zurueck auf das Thema der App.
  useEffect(() => {
    telegramFarben(true); leistenFaerben(true);
    return () => { telegramFarben(dunkel); leistenFaerben(dunkel); };
  }, [dunkel]);

  const zurueck: Partial<Record<Schritt, Schritt>> = {
    w2: 'w1', w3: 'w2', pin: 'w3', wiederherstellen: 'w3', wPin: 'wiederherstellen',
  };
  useZurueckTaste(!!zurueck[schritt], () => { const z = zurueck[schritt]; if (z) setSchritt(z); });

  return (
    <div className="thema-dunkel min-h-dvh">
      {schritt === 'w1' && <Willkommen1 onWeiter={() => setSchritt('w2')} onUeberspringen={() => setSchritt('w3')} />}
      {schritt === 'w2' && <Willkommen2 onWeiter={() => setSchritt('w3')} />}
      {schritt === 'w3' && <Willkommen3 onStarten={() => setSchritt('pin')}
                                        onWiederherstellen={() => setSchritt('wiederherstellen')} />}
      {schritt === 'pin' && (
        <PinSchritt onZurueck={() => setSchritt('w3')}
                    onFertig={async pin => {
                      // Vorher merken: Sobald die Wallet steht, baut sich die App auf.
                      einstiegMerken();
                      await wallet.erstellenUndVersiegeln(pin);
                    }} />
      )}
      {schritt === 'wiederherstellen' && (
        <Wiederherstellen woerter={woerter} setWoerter={setWoerter}
                          onZurueck={() => setSchritt('w3')} onWeiter={() => setSchritt('wPin')} />
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

/** Drei Punkte oben: wo man im Willkommen steht. */
function Punkte({ aktiv }: { aktiv: 0 | 1 | 2 }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span key={i} className={`h-1.5 rounded-full bg-text transition-all ${
          i === aktiv ? 'w-[22px]' : 'w-1.5 opacity-30'}`} />
      ))}
    </div>
  );
}

function Hauptknopf({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-work
                       text-[16px] font-extrabold text-white transition-transform active:scale-[.985]
                       disabled:opacity-40 disabled:active:scale-100">
      {children}
    </button>
  );
}

function ZurueckKnopf({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return (
    <button type="button" onClick={onClick} aria-label={t.allgemein.zurueck}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text active:scale-95">
      <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 5l-6 6 6 6" /></svg>
    </button>
  );
}

const Blitz = (
  <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2 5 13h5l-1 7 8-11h-5l1-7z" /></svg>
);

// ------------------------------------------------------------ Willkommen 1

/**
 * Was ist YSKAR. Mit einer Live-Leiste aus dem Netz -- dieselben Zahlen,
 * die der Explorer zeigt, schon bevor es eine Wallet gibt.
 */
function Willkommen1({ onWeiter, onUeberspringen }: { onWeiter: () => void; onUeberspringen: () => void }) {
  const { t, sprache, setSprache, zahl } = useT();
  const s = vorgeladen().summary;
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[66dvh]">
        <Image src="/marke/splash-dunkel.jpg" alt="" fill priority sizes="100vw"
               style={{ objectFit: 'cover', objectPosition: 'center 34%' }} />
        <div className="absolute inset-x-0 bottom-0 h-[48%]"
             style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--ink)) 92%)' }} />
      </div>

      <div className="rand-oben relative flex items-center justify-between px-6">
        <Punkte aktiv={0} />
        {/* Sprache zuerst: Wer die Sprache nicht versteht, kann den Rest nicht beurteilen. */}
        <label className="flex items-center gap-1.5 rounded-full border border-white/15 bg-ink/50 py-1.5 pl-3 pr-2.5
                          text-[12.5px] font-bold">
          <svg viewBox="0 0 22 22" width="15" height="15" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8.5" /><path d="M2.5 11h17M11 2.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S8.5 5.1 11 2.5z" />
          </svg>
          <span className="sr-only">{t.allgemein.sprache}</span>
          <select value={sprache} onChange={e => setSprache(e.target.value as typeof sprache)}
                  className="appearance-none bg-transparent pr-1 text-[12.5px] font-bold text-text outline-none">
            {SPRACHEN.map(sp => <option key={sp.code} value={sp.code} lang={sp.code}>{sp.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex-1" />

      <div className="relative flex flex-col gap-[18px] px-6 pb-[calc(32px+var(--unten))]">
        {s?.height != null && (
          <div className="rise flex flex-wrap items-center gap-x-2.5 gap-y-1 self-start rounded-full border border-line
                          bg-surface/85 px-3.5 py-2 text-[12px] font-bold text-dim">
            <span className="h-[7px] w-[7px] rounded-full bg-proof shadow-[0_0_0_4px_rgb(var(--proof)/.18)]" />
            <span className="text-proof">{t.einstieg.live}</span>
            <span>{t.einstieg.block(`#${zahl(s.height)}`)}</span>
            <span aria-hidden="true">·</span><span>{t.einstieg.miner(s.activeMiners ?? 0)}</span>
            {typeof s.knoten === 'number' && <><span aria-hidden="true">·</span><span>{t.einstieg.knoten(s.knoten)}</span></>}
          </div>
        )}
        <div className="rise rise-1">
          <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em]">
            {t.einstieg.w1TitelA}<br />{t.einstieg.w1TitelB}
          </h1>
          <p className="mt-3 text-[15px] font-semibold leading-[1.5] text-dim">{t.einstieg.w1Text}</p>
        </div>
        <div className="rise rise-2 flex flex-col gap-3.5">
          <Hauptknopf onClick={onWeiter}>{t.einstieg.weiter}</Hauptknopf>
          <button type="button" onClick={onUeberspringen}
                  className="text-center text-[13.5px] font-bold text-dim">{t.einstieg.einfuehrungUeberspringen}</button>
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------ Willkommen 2

function Willkommen2({ onWeiter }: { onWeiter: () => void }) {
  const { t } = useT();
  const schritte = [
    { titel: t.einstieg.s1Titel, text: t.einstieg.s1Text, farbe: 'work',
      icon: <path d="M7 2.5h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM11.5 7 9 11h4l-2.5 4" /> },
    { titel: t.einstieg.s2Titel, text: t.einstieg.s2Text, farbe: 'work',
      icon: <path d="M7.5 6a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5zM15 6a2.75 2.75 0 1 0 0 5.5A2.75 2.75 0 0 0 15 6zM2.5 18c.8-2.8 2.8-4.2 5-4.2s4.2 1.4 5 4.2M10.6 14.3c1.1-.4 2.1-.5 4.4-.5 2.3 0 4.3 1.4 5 4.2" /> },
    { titel: t.einstieg.s3Titel, text: t.einstieg.s3Text, farbe: 'proof',
      icon: <path d="M11 2.5l7.5 4.2v8.6L11 19.5l-7.5-4.2V6.7zM7.8 11l2.3 2.3 4.2-4.6" /> },
  ];
  return (
    <main className="rand-oben relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-6
                     pb-[calc(32px+var(--unten))]">
      <div className="pointer-events-none absolute -left-20 -top-28 h-[420px] w-[420px] rounded-full"
           style={{ background: 'radial-gradient(circle, rgb(var(--work)/.22), transparent 70%)' }} />
      <div className="relative flex h-9 items-center justify-between">
        <Punkte aktiv={1} />
        <button type="button" onClick={onWeiter} className="text-[13px] font-bold text-dim">{t.einstieg.ueberspringen}</button>
      </div>

      <div className="rise relative mt-9">
        <p className="text-[12px] font-extrabold tracking-[.14em] text-work">{t.einstieg.w2Kicker}</p>
        <h1 className="mt-2.5 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em]">
          {t.einstieg.w2TitelA}<br />{t.einstieg.w2TitelB}
        </h1>
      </div>

      <ol className="relative mt-8 flex flex-col">
        {schritte.map((s, i) => (
          <li key={i} className={`rise rise-${i + 1} flex gap-4`}>
            <div className="flex flex-col items-center">
              <span className={`flex h-12 w-12 items-center justify-center rounded-[16px] ${
                s.farbe === 'proof' ? 'bg-proof/15 text-proof' : 'bg-work/15 text-work'}`}>
                <svg viewBox="0 0 22 22" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{s.icon}</svg>
              </span>
              {i < schritte.length - 1 && <span className="my-1.5 min-h-7 w-0.5 flex-1 bg-line" />}
            </div>
            <div className={`pt-1 ${i < schritte.length - 1 ? 'pb-5' : ''}`}>
              <p className="text-[16px] font-extrabold">{s.titel}</p>
              <p className="mt-1.5 text-[13.5px] font-semibold leading-[1.5] text-dim">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex-1" />

      <div className="relative flex flex-col gap-3.5">
        <div className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-4 py-3.5">
          <Image src="/marke/kristall.png" alt="" width={34} height={22} style={{ width: 34, height: 22, objectFit: 'contain' }} />
          <p className="text-[12.5px] font-semibold leading-[1.45] text-dim">{t.einstieg.w2Hinweis}</p>
        </div>
        <Hauptknopf onClick={onWeiter}>{t.einstieg.weiter}</Hauptknopf>
      </div>
    </main>
  );
}

// ------------------------------------------------------------ Willkommen 3

/** Der Pool, den die App vorschlagen wird -- derselbe, den das Mining nimmt. */
function usePoolVorschlag(): { pool: PoolStand | null; fertig: boolean } {
  const [pool, setPool] = useState<PoolStand | null>(null);
  const [fertig, setFertig] = useState(false);
  useEffect(() => {
    let lebt = true;
    fetch('/api/v2/pools', { cache: 'no-store' })
      .then(r => r.json())
      .then((b: { pools?: PoolStand[] }) => { if (lebt && Array.isArray(b.pools)) setPool(vorschlag(b.pools)); })
      .catch(() => {})
      .finally(() => { if (lebt) setFertig(true); });
    return () => { lebt = false; };
  }, []);
  return { pool, fertig };
}

function Willkommen3({ onStarten, onWiederherstellen }: { onStarten: () => void; onWiederherstellen: () => void }) {
  const { t, zahl } = useT();
  const { pool, fertig } = usePoolVorschlag();
  return (
    <main className="rand-oben relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-6
                     pb-[calc(32px+var(--unten))]">
      <div className="pointer-events-none absolute -right-28 -top-24 h-[440px] w-[440px] rounded-full"
           style={{ background: 'radial-gradient(circle, rgb(var(--work)/.2), transparent 70%)' }} />
      <div className="relative flex h-9 items-center"><Punkte aktiv={2} /></div>

      <div className="zoom relative mt-6 flex justify-center">
        <Image src="/marke/kristall.png" alt="YSKAR" width={132} height={86} priority
               style={{ width: 132, height: 86, objectFit: 'contain' }} />
      </div>

      <div className="rise relative mt-6 text-center">
        <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em]">{t.einstieg.w3Titel}</h1>
        <p className="mt-2.5 text-[14.5px] font-semibold leading-[1.5] text-dim">{t.einstieg.w3Text}</p>
      </div>

      <div className="rise rise-1 relative mt-6 flex items-center gap-3 rounded-[16px] border border-line bg-surface px-4 py-3.5">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] bg-proof/15 text-proof">
          <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.5 6a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5zM15 6a2.75 2.75 0 1 0 0 5.5A2.75 2.75 0 0 0 15 6zM2.5 18c.8-2.8 2.8-4.2 5-4.2s4.2 1.4 5 4.2M10.6 14.3c1.1-.4 2.1-.5 4.4-.5 2.3 0 4.3 1.4 5 4.2" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11.5px] font-bold text-faint">{t.einstieg.poolFuerDich}</span>
          {pool ? (
            <>
              <span className="text-[14.5px] font-extrabold">{pool.name}</span>
              {pool.frei != null && pool.feeBps != null && (
                <span className="text-[12px] font-semibold text-dim">
                  {t.einstieg.poolStand(zahl(pool.frei), zahl(pool.feeBps / 100))}
                </span>
              )}
            </>
          ) : (
            <span className="text-[13px] font-semibold text-dim">{fertig ? t.einstieg.poolSpaeter : t.einstieg.poolSucht}</span>
          )}
        </div>
      </div>

      <p className="relative mb-2.5 mt-5 text-[12px] font-extrabold tracking-[.12em] text-faint">{t.einstieg.communityTitel}</p>
      <div className="relative grid grid-cols-2 gap-2.5">
        <ExternLink href={COMMUNITY.kanal}
                    className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-3.5 active:bg-raised">
          <svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="rgb(var(--work))" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 10 19.5 3.5l-3 15.5-5.5-4.5-3 3.5v-5.5l8.5-6.5" /></svg>
          <span className="text-[14px] font-extrabold">{t.einstieg.kanal}</span>
          <span className="text-[12px] font-semibold text-dim">{t.einstieg.kanalText}</span>
        </ExternLink>
        <ExternLink href={COMMUNITY.gruppe}
                    className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-3.5 active:bg-raised">
          <svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="rgb(var(--work))" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 4.5h15v10h-10l-5 4zM7.5 8.5h7M7.5 11.5h4.5" /></svg>
          <span className="text-[14px] font-extrabold">{t.einstieg.gruppe}</span>
          <span className="text-[12px] font-semibold text-dim">{t.einstieg.gruppeText}</span>
        </ExternLink>
      </div>

      <div className="min-h-6 flex-1" />

      <div className="relative flex flex-col gap-3.5">
        <Hauptknopf onClick={() => { haptik('tipp'); onStarten(); }}>{Blitz}{t.einstieg.starten}</Hauptknopf>
        <button type="button" onClick={onWiederherstellen}
                className="text-center text-[13.5px] font-bold text-dim">{t.einstieg.habeWoerter}</button>
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
      <div className="flex h-9 items-center">
        <ZurueckKnopf onClick={() => (bestaetigen && !busy ? (setErste(null), setWert('')) : onZurueck())} />
      </div>

      <div className="mt-8 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-work/15 text-work">
          <svg viewBox="0 0 22 22" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="9.5" width="14" height="10" rx="2.5" /><path d="M7.5 9.5V7a3.5 3.5 0 0 1 7 0v2.5" /></svg>
        </span>
        <h1 className="mt-[18px] text-[26px] font-extrabold tracking-[-0.02em]">
          {bestaetigen ? t.einstieg.pin2Titel : t.einstieg.pinTitel}
        </h1>
        <p className="mx-auto mt-2 max-w-[300px] text-[14px] font-semibold leading-[1.5] text-dim">
          {bestaetigen ? t.einstieg.pin2Text : wiederherstellen ? t.einstieg.wPinText : t.einstieg.pinText}
        </p>
      </div>

      <div className="mt-8"><PinFeld wert={wert} onChange={setWert} gesperrt={busy} fehler={zittert} /></div>
      <p className={`mt-3.5 min-h-[18px] text-center text-[12.5px] font-semibold ${fehler ? 'text-risk' : 'text-faint'}`}>
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
    <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-[calc(28px+var(--unten))]">
      <div className="flex h-9 items-center"><ZurueckKnopf onClick={onZurueck} /></div>
      <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.02em]">{t.einstieg.wTitel}</h1>
      <p className="mt-2 text-[14px] font-semibold leading-[1.5] text-dim">{t.einstieg.wText}</p>

      <div className="mt-5">
        <WortFelder woerter={woerter} onChange={setWoerter}
                    texte={{ wort: t.pruefen.wort, einfuegen: t.wiederherstellen.einfuegen,
                             nichtInListe: t.wiederherstellen.nichtInListe }} />
      </div>
      <p className="tnum mt-2 text-[13px] font-semibold text-dim">
        {anzahl === 12 && !vorschau ? t.wiederherstellen.ungueltig : t.wiederherstellen.anzahl(anzahl)}
      </p>

      {vorschau && (
        <div className="mt-4 rounded-[14px] border border-line bg-surface px-4 py-3">
          <p className="text-[11.5px] font-bold text-faint">{t.wiederherstellen.vorschau}</p>
          <p className="mt-1 break-all font-mono text-[12.5px] text-proof">{vorschau}</p>
        </div>
      )}

      <div className="min-h-6 flex-1" />
      {anzahl === 12 && !vorschau && <div className="mb-3"><Notice tone="risk">{t.wiederherstellen.ungueltig}</Notice></div>}
      <Hauptknopf onClick={onWeiter} disabled={!vorschau}>{t.einstieg.wWeiter}</Hauptknopf>
    </main>
  );
}
