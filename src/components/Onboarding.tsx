'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { keypairFromMnemonic } from '@/lib/core/wallet';
import Image from 'next/image';
import { Screen, Title, Body, Button, Notice, Icon } from '@/components/ui/Primitives';
import Vorstellung from '@/components/Vorstellung';
import WortFelder, { istWort } from '@/components/wallet/WortFelder';
import { useT, SPRACHEN, fehlerText as grund } from '@/i18n';
import { useThema } from '@/lib/useThema';

/**
 * Wallet einrichten.
 *
 * Der wichtigste Ablauf der ganzen App: Wer die zwoelf Woerter verliert,
 * verliert sein Guthaben endgueltig. Es gibt niemanden, der sie
 * zuruecksetzen kann.
 *
 * Drei Entscheidungen, die das ernst nehmen:
 *
 *  1. Die Woerter werden erst gespeichert, NACHDEM der Nutzer drei davon
 *     korrekt zurueckgegeben hat. Wer nur wegtippt, hat keine Wallet --
 *     und verliert damit nichts, weil noch nichts drin ist.
 *  2. Es gibt keinen "Ueberspringen"-Knopf. Die einzige Abkuerzung ist
 *     abbrechen und von vorn anfangen.
 *  3. Die Warnung steht VOR der Anzeige der Woerter, nicht darunter.
 *     Danach liest sie niemand mehr.
 */

type Step = 'start' | 'mehr' | 'warnung' | 'woerter' | 'pruefen' | 'pin' | 'wiederherstellen';

export default function Onboarding() {
  const wallet = useWallet();
  const [step, setStep] = useState<Step>('start');
  const [mnemonic, setMnemonic] = useState<string>('');

  if (step === 'start') return <Start onCreate={() => setStep('warnung')}
                                      onRecover={() => setStep('wiederherstellen')}
                                      onMehr={() => setStep('mehr')} />;
  if (step === 'mehr') return <Vorstellung onZurueck={() => setStep('start')}
                                           onLos={() => setStep('warnung')} />;
  if (step === 'warnung') return <Warnung onWeiter={() => {
    setMnemonic(wallet.create());
    setStep('woerter');
  }} onZurueck={() => setStep('start')} />;
  if (step === 'woerter') return <Woerter mnemonic={mnemonic} onWeiter={() => setStep('pruefen')} />;
  if (step === 'pruefen') return <Pruefen mnemonic={mnemonic}
    onBestanden={() => setStep('pin')}
    onNochmal={() => setStep('woerter')} />;
  if (step === 'pin') return <PinSetzen onFertig={p => wallet.confirmAndSeal(p)} />;
  return <Wiederherstellen onZurueck={() => setStep('start')} />;
}

// ---------------------------------------------------------------- Start

/**
 * Willkommen.
 *
 * Erst sagen, was YSKAR ist, dann die Wallet anlegen. Wer hier ankommt,
 * kennt meist nur den Bot-Link -- drei Saetze, drei Versprechen, die die
 * App danach auch haelt.
 */
function Start({ onCreate, onRecover, onMehr }: {
  onCreate: () => void; onRecover: () => void; onMehr: () => void;
}) {
  const { t, sprache, setSprache } = useT();
  const { dunkel } = useThema();
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden bg-ink">
      {/* Das Markenbild oben, in den Grund auslaufend. */}
      <div className="absolute inset-x-0 top-0 h-[56dvh]">
        <Image src={dunkel ? '/marke/splash-dunkel.jpg' : '/marke/splash.jpg'} alt="" fill priority sizes="100vw"
               style={{ objectFit: 'cover', objectPosition: dunkel ? 'center 0%' : 'center 24%' }} />
        <div className="absolute inset-x-0 bottom-0 h-[55%]"
             style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--ink)))' }} />
      </div>

      {/*
        Sprachwahl ganz oben, vor allem anderen: Wer die Sprache nicht
        versteht, kann den Rest nicht beurteilen. Namen in der jeweiligen
        Sprache selbst, keine Flaggen -- Sprache ist kein Land.
      */}
      <div className="rand-oben relative flex justify-end px-6">
        <label className="tabs flex items-center gap-1.5 !rounded-full py-1.5 pl-3 pr-2.5 text-[12.5px] font-bold text-dim">
          <svg viewBox="0 0 22 22" width="15" height="15" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8.5" /><path d="M2.5 11h17M11 2.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S8.5 5.1 11 2.5z" />
          </svg>
          <span className="sr-only">{t.allgemein.sprache}</span>
          <select value={sprache} onChange={e => setSprache(e.target.value as typeof sprache)}
                  className="appearance-none bg-transparent pr-3 text-[12.5px] font-bold text-text outline-none">
            {SPRACHEN.map(s => <option key={s.code} value={s.code} lang={s.code}>{s.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex-1" />

      <div className="relative flex flex-col gap-5 px-6 pb-[calc(28px+var(--unten))]">
        <div className="rise">
          <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em]">{t.start.titel}</h1>
          <p className="mt-2.5 text-[15px] font-semibold leading-[1.5] text-dim">{t.start.text}</p>
        </div>

        <div className="rise rise-1 flex flex-wrap gap-2">
          <Merkmal icon={Icon.Blitz}>{t.start.m1t}</Merkmal>
          <Merkmal icon={Icon.Schloss}>{t.start.m2t}</Merkmal>
          <Merkmal icon={Icon.Haken}>{t.start.m3t}</Merkmal>
        </div>

        <div className="rise rise-2 space-y-2.5">
          <Button onClick={onCreate} className="!h-14 !rounded-[18px] !text-[16px]">{t.start.erstellen}</Button>
          <Button variant="quiet" onClick={onRecover} className="!rounded-[18px]">{t.start.habeWoerter}</Button>
          <button onClick={onMehr}
                  className="mt-1 w-full text-center text-[13.5px] font-bold text-work">
            {t.start.mehr}
          </button>
        </div>
      </div>
    </main>
  );
}

function Merkmal({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="panel inline-flex items-center gap-1.5 !rounded-full py-2 pl-2.5 pr-3 text-[12px] font-extrabold">
      <span className="text-work [&>svg]:h-[15px] [&>svg]:w-[15px]">{icon}</span>{children}
    </span>
  );
}


// ---------------------------------------------------------------- Warnung

function Warnung({ onWeiter, onZurueck }: { onWeiter: () => void; onZurueck: () => void }) {
  const [verstanden, setVerstanden] = useState(false);
  const { t } = useT();
  return (
    <Screen>
      <Title>{t.warnung.titel}</Title>
      <Body>{t.warnung.text}</Body>

      <div className="my-6 space-y-3">
        <Notice tone="risk">{t.warnung.n1}</Notice>
        <Notice>{t.warnung.n2}</Notice>
      </div>

      <label className="mb-8 flex cursor-pointer items-start gap-3 text-[15px]">
        <input
          type="checkbox" checked={verstanden}
          onChange={e => setVerstanden(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[#1F5BF0]"
        />
        <span>{t.warnung.bereit}</span>
      </label>

      <div className="space-y-3">
        <Button onClick={onWeiter} disabled={!verstanden}>{t.warnung.zeigen}</Button>
        <Button variant="quiet" onClick={onZurueck}>{t.allgemein.zurueck}</Button>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- Woerter

function Woerter({ mnemonic, onWeiter }: { mnemonic: string; onWeiter: () => void }) {
  const words = mnemonic.split(' ');
  const { t } = useT();
  return (
    <Screen>
      <Title>{t.woerter.titel}</Title>
      <Body>{t.woerter.text}</Body>

      {/*
        Zweispaltig mit fortlaufenden Nummern. Die Nummerierung ist hier
        keine Dekoration -- die Reihenfolge ist Teil des Geheimnisses, und
        wer sie vertauscht abschreibt, kommt nicht mehr an sein Geld.
      */}
      <ol className="my-6 grid grid-cols-2 gap-x-4 border-t border-line">
        {words.map((w, i) => (
          <li key={i} className="flex items-baseline gap-3 border-b border-line py-3">
            <span className="tnum w-5 shrink-0 text-right text-xs text-dim">{i + 1}</span>
            <span className="font-mono text-[15px]">{w}</span>
          </li>
        ))}
      </ol>

      <Notice tone="risk">{t.woerter.hinweis}</Notice>

      <div className="mt-6">
        <Button onClick={onWeiter}>{t.woerter.aufgeschrieben}</Button>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- Pruefen

function Pruefen({ mnemonic, onBestanden, onNochmal }: {
  mnemonic: string; onBestanden: () => void; onNochmal: () => void;
}) {
  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);
  // Drei zufaellige Positionen. Nicht alle zwoelf abzufragen ist Absicht:
  // Wer drei beliebige richtig hat, hat die Liste vor sich liegen.
  const positions = useMemo(() => {
    const p = new Set<number>();
    while (p.size < 3) p.add(Math.floor(Math.random() * 12));
    return [...p].sort((a, b) => a - b);
  }, [mnemonic]);

  const [antworten, setAntworten] = useState<Record<number, string>>({});
  const [fehler, setFehler] = useState(false);
  const { t } = useT();

  const pruefen = () => {
    const alleRichtig = positions.every(
      i => (antworten[i] ?? '').trim().toLowerCase() === words[i]);
    if (alleRichtig) onBestanden();
    else setFehler(true);
  };

  const vollstaendig = positions.every(i => (antworten[i] ?? '').trim().length > 0);

  return (
    <Screen>
      <Title>{t.pruefen.titel}</Title>
      <Body>{t.pruefen.text}</Body>

      <div className="my-6 space-y-4">
        {positions.map(i => (
          <div key={i}>
            <label htmlFor={`w${i}`} className="mb-1.5 block text-sm text-dim">
              {t.pruefen.wort(i + 1)}
            </label>
            <input
              id={`w${i}`}
              value={antworten[i] ?? ''}
              onChange={e => { setAntworten(a => ({ ...a, [i]: e.target.value })); setFehler(false); }}
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="sunk w-full px-4 py-3.5 font-mono text-[15px]
                         outline-none transition-colors focus:border-work"
            />
          </div>
        ))}
      </div>

      {fehler && (
        <div className="mb-4">
          <Notice tone="risk">{t.pruefen.falsch}</Notice>
        </div>
      )}

      <div className="space-y-3">
        <Button onClick={pruefen} disabled={!vollstaendig}>{t.allgemein.weiter}</Button>
        <Button variant="quiet" onClick={onNochmal}>{t.pruefen.nochmal}</Button>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- PIN

function PinSetzen({ onFertig }: { onFertig: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [wdh, setWdh] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const { t } = useT();

  const gueltig = /^\d{6}$/.test(pin);
  const passt = gueltig && pin === wdh;

  const speichern = async () => {
    setBusy(true); setFehler(null);
    try { await onFertig(pin); }
    catch (e) { setFehler(String((e as Error).message)); setBusy(false); }
  };

  return (
    <Screen>
      <Title>{t.pin.titel}</Title>
      <Body>{t.pin.text}</Body>

      <div className="my-6 space-y-4">
        <div>
          <label htmlFor="pin" className="mb-1.5 block text-sm text-dim">{t.pin.label}</label>
          <input
            id="pin" inputMode="numeric" maxLength={6} value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            className="tnum sunk w-full px-4 py-4 text-center font-mono text-xl
                       tracking-[0.45em] outline-none transition-colors focus:border-work"
          />
        </div>
        <div>
          <label htmlFor="pin2" className="mb-1.5 block text-sm text-dim">{t.pin.nochmal}</label>
          <input
            id="pin2" inputMode="numeric" maxLength={6} value={wdh}
            onChange={e => setWdh(e.target.value.replace(/\D/g, ''))}
            className="tnum sunk w-full px-4 py-4 text-center font-mono text-xl
                       tracking-[0.45em] outline-none transition-colors focus:border-work"
          />
        </div>
      </div>

      {/*
        Ehrlich bleiben: Sechs Ziffern sind eine Million Moeglichkeiten. Wer
        den Speicher des Geraets in die Hand bekommt, knackt das mit Aufwand.
        Die PIN schuetzt vor Gelegenheitszugriff, nicht vor einem
        entschlossenen Angreifer -- und das sollte dort stehen, wo der Nutzer
        sie setzt, nicht in einer Hilfeseite.
      */}
      <Notice>{t.pin.hinweis}</Notice>

      {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}

      <div className="mt-6">
        <Button onClick={speichern} disabled={!passt || busy}>
          {busy ? t.pin.verschluesselt : t.pin.anlegen}
        </Button>
      </div>
      {pin.length > 0 && !gueltig && (
        <p className="mt-3 text-sm text-dim">{t.pin.sechs}</p>
      )}
      {gueltig && wdh.length === 6 && !passt && (
        <p className="mt-3 text-sm text-risk">{t.pin.verschieden}</p>
      )}
    </Screen>
  );
}

// -------------------------------------------------------- Wiederherstellen

function Wiederherstellen({ onZurueck }: { onZurueck: () => void }) {
  const wallet = useWallet();
  const [woerter, setWoerter] = useState<string[]>(() => Array(12).fill(''));
  const [pin, setPin] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  const text = woerter.map(w => w.trim()).join(' ');
  // Gezaehlt wird, was in der Wortliste steht -- ein halb getipptes Wort nicht.
  const anzahl = woerter.filter(istWort).length;
  const vorschau = useMemo(() => {
    try {
      if (anzahl !== 12) return null;
      return keypairFromMnemonic(text).address;
    } catch { return null; }
  }, [text, anzahl]);

  const los = async () => {
    setBusy(true); setFehler(null);
    const r = await wallet.recover(text, pin);
    if (!r.ok) { setFehler(grund(r.reason, t)); setBusy(false); }
  };

  return (
    <Screen>
      <Title>{t.wiederherstellen.titel}</Title>
      <Body>{t.wiederherstellen.text}</Body>

      <div className="mt-5">
        <WortFelder woerter={woerter} onChange={w => { setWoerter(w); setFehler(null); }}
                    texte={{ wort: t.pruefen.wort, einfuegen: t.wiederherstellen.einfuegen,
                             nichtInListe: t.wiederherstellen.nichtInListe }} />
      </div>
      <p className="mt-2 text-sm text-dim tnum">
        {anzahl === 12 && !vorschau ? t.wiederherstellen.ungueltig : t.wiederherstellen.anzahl(anzahl)}
      </p>

      {/*
        Adressvorschau, sobald die Woerter stimmen. Wer die falsche Wallet
        wiederherstellt, sieht das SOFORT -- und nicht erst, wenn das
        erwartete Guthaben fehlt.
      */}
      {vorschau && (
        <div className="mt-5 border-y border-line py-4">
          <p className="mb-1.5 text-sm text-dim">{t.wiederherstellen.vorschau}</p>
          <p className="break-all font-mono text-sm text-proof">{vorschau}</p>
        </div>
      )}

      <div className="mt-6">
        <label htmlFor="rpin" className="mb-1.5 block text-sm text-dim">
          {t.wiederherstellen.neuePin}
        </label>
        <input
          id="rpin" inputMode="numeric" maxLength={6} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          className="sunk tnum w-full px-4 py-4 text-center
                       font-mono text-xl tracking-[0.45em] outline-none
                       transition-colors focus:border-work"
        />
      </div>

      {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}

      <div className="mt-6 space-y-3">
        <Button onClick={los} disabled={!vorschau || !/^\d{6}$/.test(pin) || busy}>
          {busy ? t.wiederherstellen.oeffnet : t.wiederherstellen.oeffnen}
        </Button>
        <Button variant="quiet" onClick={onZurueck}>{t.allgemein.zurueck}</Button>
      </div>
    </Screen>
  );
}

