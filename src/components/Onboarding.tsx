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
import { Zeichen, Muenze3D, Schild, Boerse } from '@/components/ui/Marke';

/**
 * Der Einstieg (Redesign Oktober 2026) -- fuer jemanden, der YSKAR noch nicht
 * kennt. Fuenf Bildschirme:
 *
 *   w1   Das ist YSKAR (mit der drehenden Muenze)
 *   w1b  Was du hier tun kannst
 *   w2   So funktioniert es
 *   w2b  Gut zu wissen (Sicherheit)
 *   w3   Wallet erstellen
 *
 * "Ueberspringen" fuehrt von jedem Bildschirm direkt zu "Wallet erstellen".
 * Danach eine PIN; den Pool waehlt der Nutzer danach selbst (AppShell).
 *
 * Was sich NICHT geaendert hat: Die zwoelf Woerter entstehen auf dem Geraet,
 * nur der Nutzer hat sie, und sie liegen mit der PIN verschluesselt im
 * Speicher. Gesichert werden sie nach dem Mining-Start; Senden bleibt bis
 * dahin gesperrt (siehe components/Sicherung.tsx).
 */

type Schritt = 'w1' | 'w1b' | 'w2' | 'w2b' | 'w3' | 'pin' | 'wiederherstellen' | 'wPin';
const REIHE: Schritt[] = ['w1', 'w1b', 'w2', 'w2b', 'w3'];

export default function Onboarding() {
  const wallet = useWallet();
  const [schritt, setSchritt] = useState<Schritt>('w1');
  const [woerter, setWoerter] = useState<string[]>(() => Array(12).fill(''));

  useEffect(() => { telegramFarben(true); leistenFaerben(true); }, []);

  const zurueck: Partial<Record<Schritt, Schritt>> = {
    w1b: 'w1', w2: 'w1b', w2b: 'w2', w3: 'w2b', pin: 'w3', wiederherstellen: 'w3', wPin: 'wiederherstellen',
  };
  useZurueckTaste(!!zurueck[schritt], () => { const z = zurueck[schritt]; if (z) setSchritt(z); });
  const weiter = () => { const i = REIHE.indexOf(schritt); if (i >= 0 && i < REIHE.length - 1) setSchritt(REIHE[i + 1]); };
  const skip = () => setSchritt('w3');

  return (
    <div className="thema-dunkel min-h-dvh">
      {schritt === 'w1' && <Willkommen1 onWeiter={weiter} onSkip={skip} />}
      {schritt === 'w1b' && <WasDuTunKannst onWeiter={weiter} onSkip={skip} />}
      {schritt === 'w2' && <SoGehtEs onWeiter={weiter} onSkip={skip} />}
      {schritt === 'w2b' && <GutZuWissen onWeiter={weiter} onSkip={skip} />}
      {schritt === 'w3' && <WalletErstellen onStarten={() => setSchritt('pin')}
                                            onWiederherstellen={() => setSchritt('wiederherstellen')} />}
      {schritt === 'pin' && (
        <PinSchritt onZurueck={() => setSchritt('w3')}
                    onFertig={async pin => {
                      // Vorher merken: Sobald die Wallet steht, baut sich die App auf.
                      einstiegMerken(true);
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

/** Fuenf Striche oben: wo man im Einstieg steht. */
function Punkte({ aktiv }: { aktiv: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {REIHE.map((_, i) => (
        <span key={i} className={`h-[3px] rounded-full transition-all ${i === aktiv ? 'w-6 bg-text' : 'w-2.5 bg-[rgb(140_170_255/.22)]'}`} />
      ))}
    </div>
  );
}

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
            className={`flex h-14 w-full items-center rounded-full bg-text text-[15.5px] font-semibold text-ink transition-transform
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

function Seite({ children, gap = 'gap-3' }: { children: React.ReactNode; gap?: string }) {
  return (
    <main className={`rand-oben relative mx-auto flex min-h-dvh max-w-md flex-col ${gap} overflow-hidden px-[22px] pb-[calc(26px+var(--unten))]`}>
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />
      {children}
    </main>
  );
}

function Kopf({ nr, onSkip }: { nr: number; onSkip?: () => void }) {
  const { t } = useT();
  return (
    <div className="relative flex min-h-7 items-center justify-between">
      <Punkte aktiv={nr} />
      {onSkip && <button type="button" onClick={onSkip} className="text-[13.5px] text-dim">{t.rd.w.skip}</button>}
    </div>
  );
}

function Titel({ a, b, size = 36 }: { a: string; b: string; size?: number }) {
  return (
    <h1 className="relative font-semibold leading-[1] tracking-[-0.05em]" style={{ fontSize: size }}>
      {a}<span className="grad block pb-1 font-light">{b}</span>
    </h1>
  );
}

function Zeile({ icon, titel, text }: { icon: React.ReactNode; titel: string; text: string }) {
  return (
    <div className="flex items-start gap-3.5 border-b border-line py-2.5">
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-work/15 text-cyan">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <b className="text-[15px] font-semibold">{titel}</b>
        <span className="text-[13.5px] leading-[1.45] text-dim">{text}</span>
      </span>
    </div>
  );
}

const ic = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const IC = {
  globus: ic(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" /></>),
  blitz: ic(<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />),
  wallet: ic(<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14.5h2" /></>),
  hoch: ic(<path d="M12 19V5M6 11l6-6 6 6" />),
  netz: ic(<path d="M3 12h4l3-7 4 14 3-7h4" />),
  doc: ic(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  schloss: ic(<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  warn: ic(<><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17h.01" /></>),
  schild: ic(<path d="M12 3l8 3v6c0 4.6-3.3 8.1-8 9.5-4.7-1.4-8-4.9-8-9.5V6z" />),
};

// ------------------------------------------------------------ 1: Das ist YSKAR

function Willkommen1({ onWeiter, onSkip }: { onWeiter: () => void; onSkip: () => void }) {
  const { t, sprache, setSprache } = useT();
  return (
    <Seite gap="gap-3.5">
      <div className="relative flex min-h-10 items-center justify-between">
        <Punkte aktiv={0} />
        {/* Sprache zuerst: Wer die Sprache nicht versteht, kann den Rest nicht beurteilen. */}
        <label className="flex h-[38px] items-center gap-2 rounded-full border border-[rgb(140_170_255/.22)] px-3.5 text-[13px] font-medium">
          {IC.globus}
          <span className="sr-only">{t.allgemein.sprache}</span>
          <select value={sprache} onChange={e => setSprache(e.target.value as typeof sprache)}
                  className="appearance-none bg-transparent text-[13px] font-medium text-text outline-none">
            {SPRACHEN.map(sp => <option key={sp.code} value={sp.code} lang={sp.code}>{sp.name}</option>)}
          </select>
        </label>
      </div>
      <div className="buehne relative pt-2"><Muenze3D d={150} /></div>
      <div className="min-h-2 flex-1" />
      <div className="relative flex flex-col gap-4">
        <span className="etikett">{t.rd.w.w1Etikett}</span>
        <Titel a={t.rd.w.w1A} b={t.rd.w.w1B} size={40} />
        <p className="text-[15.5px] leading-[1.55] text-dim">{t.rd.w.w1Text}</p>
      </div>
      <div className="relative grid grid-cols-3 border-y border-line">
        {[[t.rd.w.menge, t.rd.w.mengeWert], [t.rd.w.code, t.rd.w.codeWert], [t.rd.w.schluessel, t.rd.w.schluesselWert]].map(([n, w], i) => (
          <div key={n} className={`flex min-w-0 flex-col gap-1.5 py-3.5 ${i ? 'border-l border-line pl-3.5' : ''}`}>
            <span className="text-[12px] text-dim">{n}</span>
            <span className="truncate text-[16px]">{w}</span>
          </div>
        ))}
      </div>
      <div className="relative flex flex-col gap-1">
        <Hauptknopf onClick={() => { haptik('tipp'); onWeiter(); }}>{t.rd.w.weiter}</Hauptknopf>
        <button type="button" onClick={onSkip} className="min-h-11 text-[14px] text-dim">{t.rd.w.skipIntro}</button>
      </div>
    </Seite>
  );
}

// ------------------------------------------------------------ 1b: Was du hier tun kannst

function WasDuTunKannst({ onWeiter, onSkip }: { onWeiter: () => void; onSkip: () => void }) {
  const { t } = useT();
  const w = t.rd.w;
  return (
    <Seite>
      <Kopf nr={1} onSkip={onSkip} />
      <span className="etikett relative mt-2">{w.w1bEtikett}</span>
      <Titel a={w.w1bA} b={w.w1bB} />
      <div className="relative flex flex-col border-t border-line">
        <Zeile icon={IC.globus} titel={w.k0T} text={w.k0S} />
        <Zeile icon={IC.blitz} titel={w.k1T} text={w.k1S} />
        <Zeile icon={IC.wallet} titel={w.k2T} text={w.k2S} />
        <Zeile icon={IC.hoch} titel={w.k3T} text={w.k3S} />
        <Zeile icon={IC.netz} titel={w.k4T} text={w.k4S} />
      </div>
      <div className="min-h-4 flex-1" />
      <Hauptknopf onClick={onWeiter}>{w.weiter}</Hauptknopf>
    </Seite>
  );
}

// ------------------------------------------------------------ 2: So funktioniert es

function SoGehtEs({ onWeiter, onSkip }: { onWeiter: () => void; onSkip: () => void }) {
  const { t } = useT();
  const w = t.rd.w;
  const zeile = (geraet: string, hash: string, rate: string, gut = false) => (
    <div className={`flex h-[38px] items-center gap-3 rounded-[12px] border px-3.5 ${gut ? 'border-proof/45 bg-proof/[.06]' : 'border-line'}`}>
      <span className="w-[46px] text-[13px]">{geraet}</span>
      <span className={`flex-1 truncate font-mono text-[11.5px] ${gut ? 'text-proof' : 'text-faint'}`}>{hash}</span>
      <span className="font-mono text-[11.5px] text-cyan">{rate}</span>
    </div>
  );
  const schritt = (n: string, titel: string, text: string, letzt = false) => (
    <div className="relative flex gap-4 pb-3.5">
      {!letzt && <span className="absolute bottom-[-6px] left-[13px] top-[30px] w-px bg-[rgb(140_170_255/.22)]" />}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgb(140_170_255/.22)] bg-ink font-mono text-[11px] text-cyan">{n}</span>
      <span className="flex flex-col gap-0.5 pt-[3px]"><b className="text-[15.5px] font-semibold">{titel}</b><span className="text-[14px] leading-[1.5] text-dim">{text}</span></span>
    </div>
  );
  return (
    <Seite gap="gap-3.5">
      <Kopf nr={2} onSkip={onSkip} />
      <span className="etikett relative mt-1">{w.w2Etikett}</span>
      <Titel a={w.w2A} b={w.w2B} size={36} />
      <div className="relative flex flex-col gap-2 rounded-[20px] border border-line bg-sunk p-3.5">
        <span className="text-right font-mono text-[10px] uppercase tracking-[.16em] text-faint">{w.beispiel}</span>
        {zeile('Phone', 'b12f62b06d0526b83f01659f21e7a', '1.2 MH/s')}
        {zeile('PC', '67534d1788199124629ec4f5fc3eb2', '48 MH/s')}
        {zeile('GPU', '0000000000e71cf3f200ca9ed3907e', '1.9 GH/s', true)}
      </div>
      <div className="relative flex flex-col">
        {schritt('01', w.s1T, w.s1S)}
        {schritt('02', w.s2T, w.s2S)}
        {schritt('03', w.s3T, w.s3S, true)}
      </div>
      <div className="min-h-2 flex-1" />
      <Hauptknopf onClick={onWeiter}>{w.weiter}</Hauptknopf>
    </Seite>
  );
}

// ------------------------------------------------------------ 2b: Gut zu wissen / 3: Wallet erstellen
// Beide gleich gebaut: Bild oben in fester Hoehe, dann Etikett, Titel, Liste, Knopf.

function BildBox({ children }: { children: React.ReactNode }) {
  return <div className="relative flex h-[108px] shrink-0 items-start justify-center">{children}</div>;
}

function GutZuWissen({ onWeiter, onSkip }: { onWeiter: () => void; onSkip: () => void }) {
  const { t } = useT();
  const w = t.rd.w;
  return (
    <Seite gap="gap-2.5">
      <Kopf nr={3} onSkip={onSkip} />
      <BildBox><Schild hoehe={105} /></BildBox>
      <span className="etikett relative">{w.w2bEtikett}</span>
      <Titel a={w.w2bA} b={w.w2bB} size={32} />
      <div className="relative flex flex-col border-t border-line">
        <Zeile icon={IC.doc} titel={w.g1T} text={w.g1S} />
        <Zeile icon={IC.schloss} titel={w.g2T} text={w.g2S} />
        <Zeile icon={IC.warn} titel={w.g3T} text={w.g3S} />
        <Zeile icon={IC.wallet} titel={w.g4T} text={w.g4S} />
        <Zeile icon={IC.schild} titel={w.g5T} text={w.g5S} />
      </div>
      <div className="min-h-3 flex-1" />
      <div className="relative flex flex-col gap-1">
        <Hauptknopf onClick={onWeiter}>{w.verstanden}</Hauptknopf>
        <span className="min-h-11" aria-hidden="true" />
      </div>
    </Seite>
  );
}

function WalletErstellen({ onStarten, onWiederherstellen }: { onStarten: () => void; onWiederherstellen: () => void }) {
  const { t } = useT();
  const w = t.rd.w;
  return (
    <Seite gap="gap-2.5">
      <Kopf nr={4} />
      <BildBox><div style={{ marginTop: -78 }}><Boerse breite={154} /></div></BildBox>
      <span className="etikett relative">{w.w3Etikett}</span>
      <Titel a={w.w3A} b={w.w3B} size={32} />
      <div className="relative flex flex-col border-t border-line">
        <Zeile icon={IC.schloss} titel={w.p1T} text={w.p1S} />
        <Zeile icon={IC.wallet} titel={w.p2T} text={w.p2S} />
      </div>
      <div className="min-h-3 flex-1" />
      <div className="relative flex flex-col gap-1">
        <Hauptknopf onClick={() => { haptik('tipp'); onStarten(); }}>{w.erstellen}</Hauptknopf>
        <button type="button" onClick={onWiederherstellen} className="min-h-11 text-[14px] text-dim">{w.habeWoerter}</button>
      </div>
    </Seite>
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
    <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-[22px] pb-[calc(28px+var(--unten))]">
      <div className="flex min-h-11 items-center">
        <ZurueckKnopf onClick={() => (bestaetigen && !busy ? (setErste(null), setWert('')) : onZurueck())} />
      </div>

      <div className="mt-6 flex flex-col items-center text-center">
        <Zeichen g={52} />
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.035em]">
          {bestaetigen ? t.einstieg.pin2Titel : t.einstieg.pinTitel}
        </h1>
        <p className="mx-auto mt-2 max-w-[290px] text-[15px] leading-[1.5] text-dim">
          {bestaetigen ? t.einstieg.pin2Text : wiederherstellen ? t.einstieg.wPinText : t.rd.w.pinText}
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
    <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-[22px] pb-[calc(28px+var(--unten))]">
      <div className="flex min-h-11 items-center"><ZurueckKnopf onClick={onZurueck} /></div>
      <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.035em]">{t.einstieg.wTitel}</h1>
      <p className="mt-2 text-[15px] leading-[1.5] text-dim">{t.rd.w.wText}</p>

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
