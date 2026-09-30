'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { keypairFromMnemonic } from '@/lib/core/wallet';
import Image from 'next/image';
import { Screen, Title, Body, Button, Notice, Icon } from '@/components/ui/Primitives';
import Vorstellung from '@/components/Vorstellung';

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
  return (
    <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-7"
          style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, rgb(var(--ink)) 42%)' }}>
      <div className="zoom flex flex-col items-center gap-1">
        <Image src="/marke/kristall.png" alt="" width={168} height={122} priority
               style={{ width: 168, height: 122, objectFit: 'contain' }} />
        <span className="text-[12px] font-extrabold tracking-[0.22em] text-work">
          GEMEINSAM · DEZENTRAL · STARK
        </span>
      </div>

      <div className="rise mt-4">
        <Title>Eine Kette, die du nachrechnen kannst.</Title>
        <Body>
          YSKAR ist echtes Proof of Work auf deinem Telefon. Dein Gerät rechnet,
          das Netz prüft, jeder Block liegt offen.
        </Body>
      </div>

      <div className="rise rise-1 mt-5 flex flex-col gap-2">
        <Merkmal icon={Icon.Blitz} titel="Echtes Mining">
          SHA-256d auf deinem Gerät. Keine hochgezählten Zahlen, jeder Share wird
          nachgerechnet.
        </Merkmal>
        <Merkmal icon={Icon.Schloss} titel="Deine Schlüssel, dein Guthaben">
          Zwölf Wörter gehören dir allein — nicht deinem Telegram-Konto.
        </Merkmal>
        <Merkmal icon={Icon.Haken} titel="Offen und prüfbar">
          Offener Quelltext, Block Explorer im Browser. Proof, not promise.
        </Merkmal>
      </div>

      <div className="flex-1" />

      <div className="rise rise-2 mt-6 space-y-2.5">
        <Button onClick={onCreate}>Wallet erstellen</Button>
        <Button variant="quiet" onClick={onRecover}>Ich habe schon zwölf Wörter</Button>
        <button onClick={onMehr}
                className="mt-1 w-full text-center text-[13.5px] font-bold text-work">
          Erst mehr über YSKAR erfahren →
        </button>
      </div>
    </main>
  );
}

function Merkmal({ icon, titel, children }: {
  icon: React.ReactNode; titel: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-[18px] border border-line bg-surface px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]
                       bg-work/10 text-work">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[14.5px] font-bold">{titel}</span>
        <span className="text-[13px] font-medium leading-[1.5] text-dim">{children}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Warnung

function Warnung({ onWeiter, onZurueck }: { onWeiter: () => void; onZurueck: () => void }) {
  const [verstanden, setVerstanden] = useState(false);
  return (
    <Screen>
      <Title>Gleich siehst du zwölf Wörter</Title>
      <Body>
        Diese Wörter sind deine Wallet. Wer sie hat, hat dein Guthaben — und
        wer sie verliert, verliert es.
      </Body>

      <div className="my-6 space-y-3">
        <Notice tone="risk">
          Niemand kann sie zurücksetzen. Nicht ich, nicht Telegram, niemand.
          Es gibt kein Passwort-vergessen.
        </Notice>
        <Notice>
          Schreib sie auf Papier. Ein Screenshot landet in der Fotogalerie und
          in deiner Cloud-Sicherung — beides ist kein guter Ort dafür.
        </Notice>
      </div>

      <label className="mb-8 flex cursor-pointer items-start gap-3 text-[15px]">
        <input
          type="checkbox" checked={verstanden}
          onChange={e => setVerstanden(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[#1F5BF0]"
        />
        <span>Ich habe Stift und Papier bereit.</span>
      </label>

      <div className="space-y-3">
        <Button onClick={onWeiter} disabled={!verstanden}>Wörter anzeigen</Button>
        <Button variant="quiet" onClick={onZurueck}>Zurück</Button>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- Woerter

function Woerter({ mnemonic, onWeiter }: { mnemonic: string; onWeiter: () => void }) {
  const words = mnemonic.split(' ');
  return (
    <Screen>
      <Title>Deine zwölf Wörter</Title>
      <Body>Schreib sie in dieser Reihenfolge auf. Die Nummern gehören dazu.</Body>

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

      <Notice tone="risk">
        Nach dem nächsten Schritt werden die Wörter nicht mehr angezeigt.
      </Notice>

      <div className="mt-6">
        <Button onClick={onWeiter}>Ich habe sie aufgeschrieben</Button>
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

  const pruefen = () => {
    const alleRichtig = positions.every(
      i => (antworten[i] ?? '').trim().toLowerCase() === words[i]);
    if (alleRichtig) onBestanden();
    else setFehler(true);
  };

  const vollstaendig = positions.every(i => (antworten[i] ?? '').trim().length > 0);

  return (
    <Screen>
      <Title>Kurze Gegenprobe</Title>
      <Body>Trag drei Wörter aus deiner Liste ein.</Body>

      <div className="my-6 space-y-4">
        {positions.map(i => (
          <div key={i}>
            <label htmlFor={`w${i}`} className="mb-1.5 block text-sm text-dim">
              Wort {i + 1}
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
          <Notice tone="risk">
            Mindestens ein Wort stimmt nicht. Sieh auf deinem Zettel nach.
          </Notice>
        </div>
      )}

      <div className="space-y-3">
        <Button onClick={pruefen} disabled={!vollstaendig}>Weiter</Button>
        <Button variant="quiet" onClick={onNochmal}>Wörter nochmal zeigen</Button>
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

  const gueltig = /^\d{6}$/.test(pin);
  const passt = gueltig && pin === wdh;

  const speichern = async () => {
    setBusy(true); setFehler(null);
    try { await onFertig(pin); }
    catch (e) { setFehler(String((e as Error).message)); setBusy(false); }
  };

  return (
    <Screen>
      <Title>PIN für dieses Gerät</Title>
      <Body>
        Sechs Ziffern. Damit werden deine Wörter auf diesem Telefon
        verschlüsselt abgelegt.
      </Body>

      <div className="my-6 space-y-4">
        <div>
          <label htmlFor="pin" className="mb-1.5 block text-sm text-dim">PIN</label>
          <input
            id="pin" inputMode="numeric" maxLength={6} value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            className="tnum sunk w-full px-4 py-4 text-center font-mono text-xl
                       tracking-[0.45em] outline-none transition-colors focus:border-work"
          />
        </div>
        <div>
          <label htmlFor="pin2" className="mb-1.5 block text-sm text-dim">Nochmal</label>
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
      <Notice>
        Die PIN schützt davor, dass jemand dein entsperrtes Telefon in die
        Hand nimmt. Gegen einen entschlossenen Angreifer mit Zugriff auf das
        Gerät hilft nur, keine großen Beträge darauf zu lassen.
      </Notice>

      {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}

      <div className="mt-6">
        <Button onClick={speichern} disabled={!passt || busy}>
          {busy ? 'Wird verschlüsselt…' : 'Wallet anlegen'}
        </Button>
      </div>
      {pin.length > 0 && !gueltig && (
        <p className="mt-3 text-sm text-dim">Genau sechs Ziffern.</p>
      )}
      {gueltig && wdh.length === 6 && !passt && (
        <p className="mt-3 text-sm text-risk">Die beiden Eingaben sind verschieden.</p>
      )}
    </Screen>
  );
}

// -------------------------------------------------------- Wiederherstellen

function Wiederherstellen({ onZurueck }: { onZurueck: () => void }) {
  const wallet = useWallet();
  const [text, setText] = useState('');
  const [pin, setPin] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const anzahl = text.trim().split(/\s+/).filter(Boolean).length;
  const vorschau = useMemo(() => {
    try {
      if (anzahl !== 12 && anzahl !== 24) return null;
      return keypairFromMnemonic(text).address;
    } catch { return null; }
  }, [text, anzahl]);

  const los = async () => {
    setBusy(true); setFehler(null);
    const r = await wallet.recover(text, pin);
    if (!r.ok) { setFehler(r.reason ?? 'Fehlgeschlagen.'); setBusy(false); }
  };

  return (
    <Screen>
      <Title>Wallet wiederherstellen</Title>
      <Body>
        Trag deine zwölf Wörter ein, durch Leerzeichen getrennt. Groß- und
        Kleinschreibung ist egal.
      </Body>

      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setFehler(null); }}
        rows={4} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="wort eins wort zwei …"
        className="sunk w-full px-4 py-3.5 font-mono text-[15px]
                   leading-relaxed outline-none transition-colors focus:border-work"
      />
      <p className="mt-2 text-sm text-dim tnum">{anzahl} von 12 Wörtern</p>

      {/*
        Adressvorschau, sobald die Woerter stimmen. Wer die falsche Wallet
        wiederherstellt, sieht das SOFORT -- und nicht erst, wenn das
        erwartete Guthaben fehlt.
      */}
      {vorschau && (
        <div className="mt-5 border-y border-line py-4">
          <p className="mb-1.5 text-sm text-dim">Diese Wallet wird geöffnet</p>
          <p className="break-all font-mono text-sm text-proof">{vorschau}</p>
        </div>
      )}

      <div className="mt-6">
        <label htmlFor="rpin" className="mb-1.5 block text-sm text-dim">
          Neue PIN für dieses Gerät
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
          {busy ? 'Wird geöffnet…' : 'Wallet öffnen'}
        </Button>
        <Button variant="quiet" onClick={onZurueck}>Zurück</Button>
      </div>
    </Screen>
  );
}
