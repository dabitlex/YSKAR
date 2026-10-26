'use client';

import { useEffect, useMemo, useState } from 'react';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { useWallet } from '@/lib/wallet/useWallet';
import { Notice, Icon } from '@/components/ui/Primitives';
import { Blatt } from '@/components/ui/Bausteine';
import PinFeld, { PinTasten, PIN_LAENGE } from '@/components/PinFeld';
import { useT, fehlerText } from '@/i18n';
import { SICHERN_PFLICHT } from '@/lib/einstieg';
import { useZurueckTaste, haptik, imTelegram } from '@/lib/telegram/webapp';

/**
 * Die zwoelf Woerter sichern -- NACH dem Start des Minings.
 *
 * Drei Schritte, wie vorher im Einstieg, nur spaeter:
 *
 *   1. Vorbereiten: Stift und Papier, die Warnung VOR den Woertern.
 *   2. Die Woerter (gegen die PIN entschluesselt, nie aus dem Speicher).
 *   3. Pruefen: Dreimal das richtige Wort antippen, aus je vier.
 *
 * Antippen statt Eintippen: Ohne Tastatur landet nichts im Verlauf einer
 * Tastatur-App, und auf dem Telefon geht es schneller. Drei zufaellige
 * Stellen reichen -- wer drei beliebige richtig hat, hat die Liste vor sich.
 *
 * Erst nach bestandener Pruefung wird "gesichert" gemerkt; dann ist Senden
 * frei. Bricht der Nutzer ab, bleibt alles, wie es war.
 */

/** Bestanden: Die Pflicht ist erfuellt, auch wenn "Fertig" nicht mehr getippt wird. */
function pflichtLoesen() { try { localStorage.removeItem(SICHERN_PFLICHT); } catch { /* egal */ } }

type Schritt = 'vorbereiten' | 'pin' | 'woerter' | 'pruefen' | 'fertig';

/**
 * `pflicht`: direkt nach dem Erstellen einer neuen Wallet. Kein Abbrechen,
 * die App geht erst nach bestandener Pruefung auf. Liegen die Woerter noch im
 * Speicher (gerade erstellt), entfaellt die PIN-Abfrage.
 */
export default function Sicherung({ onSchliessen, pflicht = false }: { onSchliessen: () => void; pflicht?: boolean }) {
  const wallet = useWallet();
  const { t } = useT();
  const [schritt, setSchritt] = useState<Schritt>('vorbereiten');
  const [woerter, setWoerter] = useState<string[] | null>(null);

  const zurueck = () => {
    if (schritt === 'pin') setSchritt('vorbereiten');
    else if (schritt === 'woerter') setSchritt('vorbereiten');
    else if (schritt === 'pruefen') setSchritt('woerter');
    else if (!pflicht) onSchliessen();
  };
  const kannZurueck = !(pflicht && (schritt === 'vorbereiten' || schritt === 'fertig'));
  useZurueckTaste(kannZurueck, zurueck);

  const zeigen = () => {
    if (wallet.freshMnemonic) { setWoerter(wallet.freshMnemonic.split(' ')); setSchritt('woerter'); }
    else setSchritt('pin');
  };

  // Die Woerter verlassen den Speicher, sobald der Bildschirm zugeht.
  useEffect(() => () => setWoerter(null), []);

  const nummer = schritt === 'vorbereiten' || schritt === 'pin' ? 1 : schritt === 'woerter' ? 2 : 3;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-ink">
      <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[calc(28px+var(--unten))]">
        {schritt !== 'fertig' && (
          <>
            <div className="flex items-center justify-between">
              <button type="button" onClick={zurueck} aria-label={t.allgemein.zurueck}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border border-line text-text active:scale-95 ${
                        kannZurueck && !imTelegram() ? '' : 'invisible'}`}>
                <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 5l-6 6 6 6" /></svg>
              </button>
              <span className="font-mono text-[11.5px] uppercase tracking-[.12em] text-dim">{t.sicherung.schritt(nummer)}</span>
              <span className="w-10" />
            </div>
            <div className="mt-[18px] grid grid-cols-3 gap-1.5" aria-hidden="true">
              {[1, 2, 3].map(i => (
                <span key={i} className={`h-[3px] rounded-full ${i <= nummer ? 'bg-cyan' : 'bg-line'}`} />
              ))}
            </div>
          </>
        )}

        {schritt === 'vorbereiten' && <Vorbereiten onWeiter={zeigen} />}
        {schritt === 'pin' && (
          <PinAbfrage onOffen={w => { setWoerter(w); setSchritt('woerter'); }} />
        )}
        {schritt === 'woerter' && woerter && <Woerter woerter={woerter} onWeiter={() => setSchritt('pruefen')} />}
        {schritt === 'pruefen' && woerter && (
          <Pruefen woerter={woerter} onNochmal={() => setSchritt('woerter')}
                   onBestanden={() => { wallet.gesichertMelden(); if (pflicht) pflichtLoesen(); setWoerter(null); haptik('erfolg'); setSchritt('fertig'); }} />
        )}
        {schritt === 'fertig' && <Fertig onSchliessen={onSchliessen} />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------ 1 Vorbereiten

function Vorbereiten({ onWeiter }: { onWeiter: () => void }) {
  const { t } = useT();
  const [bereit, setBereit] = useState(false);
  return (
    <>
      <span className="mt-8 flex h-14 w-14 items-center justify-center rounded-full border border-amber/30 bg-amber/10 text-amber">
        <svg viewBox="0 0 22 22" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 2.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V5.3z" /><path d="M8 11l2 2 4-4" />
        </svg>
      </span>
      <h1 className="mt-[18px] text-[26px] font-semibold leading-[1.15] tracking-[-0.025em]">{t.sicherung.s1Titel}</h1>
      <p className="mt-2 text-[14px] leading-[1.5] text-dim">{t.sicherung.s1Text}</p>

      <ol className="mt-5 flex flex-col gap-2.5">
        <li className="panel flex gap-3 !rounded-[16px] px-4 py-3.5">
          <span className="text-[15px] font-extrabold text-work">1</span>
          <span className="text-[13.5px] font-semibold leading-[1.45]">{t.sicherung.p1}</span>
        </li>
        <li className="panel flex gap-3 !rounded-[16px] px-4 py-3.5">
          <span className="text-[15px] font-extrabold text-work">2</span>
          <span className="text-[13.5px] font-semibold leading-[1.45]">{t.sicherung.p2}</span>
        </li>
        <li className="flex gap-3 rounded-[16px] bg-risk/10 px-4 py-3.5">
          <span className="text-[15px] font-extrabold text-risk">!</span>
          <span className="text-[13.5px] font-semibold leading-[1.45] text-lese">{t.sicherung.p3}</span>
        </li>
      </ol>

      <div className="min-h-6 flex-1" />
      <label className="flex cursor-pointer items-start gap-3 px-0.5 pb-4 text-[14px] font-semibold">
        <input type="checkbox" checked={bereit} onChange={e => setBereit(e.target.checked)}
               className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--work))]" />
        <span>{t.sicherung.bereit}</span>
      </label>
      <button type="button" onClick={onWeiter} disabled={!bereit}
              className="flex h-[56px] w-full items-center justify-center rounded-full bg-text text-[15.5px] font-semibold
                         text-ink transition-transform active:scale-[.985] disabled:opacity-30">
        {t.sicherung.zeigen}
      </button>
    </>
  );
}

// ------------------------------------------------------------ PIN

/** Die Woerter liegen nur verschluesselt im Geraet -- zeigen heisst entschluesseln. */
function PinAbfrage({ onOffen }: { onOffen: (woerter: string[]) => void }) {
  const wallet = useWallet();
  const { t } = useT();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (pin.length !== PIN_LAENGE || busy) return;
    setBusy(true);
    wallet.revealMnemonic(pin).then(r => {
      if (r.ok && r.mnemonic) { onOffen(r.mnemonic.split(' ')); return; }
      haptik('warnung');
      setFehler(fehlerText(r.reason, t)); setPin(''); setBusy(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <>
      <h1 className="mt-10 text-center text-[24px] font-extrabold tracking-[-0.02em]">{t.unlock.titel}</h1>
      <p className="mx-auto mt-2 max-w-[300px] text-center text-[14px] leading-[1.5] text-dim">
        {t.sicherung.pinFrage}
      </p>
      <div className="mt-8"><PinFeld wert={pin} onChange={setPin} gesperrt={busy} fehler={!!fehler && pin === ''} /></div>
      <p className="mt-3.5 min-h-[18px] text-center text-[12.5px] font-semibold text-risk">{fehler}</p>
      <div className="flex-1" />
      <PinTasten wert={pin} onChange={v => { setPin(v); setFehler(null); }} gesperrt={busy} />
    </>
  );
}

// ------------------------------------------------------------ 2 Woerter

function Woerter({ woerter, onWeiter }: { woerter: string[]; onWeiter: () => void }) {
  const { t } = useT();
  // Zweispaltig, spaltenweise nummeriert: links 1-6, rechts 7-12 -- so
  // schreibt man sie auch auf Papier ab.
  const reihen = Array.from({ length: 6 }, (_, i) => [i, i + 6]);
  return (
    <>
      <h1 className="mt-[26px] text-[26px] font-semibold leading-[1.15] tracking-[-0.025em]">{t.sicherung.s2Titel}</h1>
      <p className="mt-2 text-[14px] leading-[1.5] text-dim">{t.sicherung.s2Text}</p>
      <ol className="panel mt-5 grid grid-cols-2 gap-x-[18px] !rounded-[20px] px-[18px] py-1">
        {reihen.flat().map((i, k) => (
          <li key={i} className={`flex items-baseline gap-3 py-3 ${k < 10 ? 'border-b border-line' : ''}`}>
            <span className="tnum w-[18px] shrink-0 text-right text-[12px] text-faint">{i + 1}</span>
            <span className="font-mono text-[15px]">{woerter[i]}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3.5"><Notice tone="risk">{t.sicherung.keinFoto}</Notice></div>
      <div className="min-h-6 flex-1" />
      <button type="button" onClick={onWeiter}
              className="flex h-[56px] w-full items-center justify-center rounded-full bg-text text-[15.5px] font-semibold
                         text-ink transition-transform active:scale-[.985]">
        {t.sicherung.aufgeschrieben}
      </button>
    </>
  );
}

// ------------------------------------------------------------ 3 Pruefen

function mischen<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function Pruefen({ woerter, onBestanden, onNochmal }: {
  woerter: string[]; onBestanden: () => void; onNochmal: () => void;
}) {
  const { t } = useT();
  // Drei zufaellige Stellen, je vier Woerter zur Wahl: das richtige und drei
  // aus der BIP39-Liste, die nicht in dieser Wallet vorkommen.
  const fragen = useMemo(() => {
    const stellen = new Set<number>();
    while (stellen.size < 3) stellen.add(Math.floor(Math.random() * 12));
    const eigene = new Set(woerter);
    return [...stellen].sort((a, b) => a - b).map(i => {
      const falsch = new Set<string>();
      while (falsch.size < 3) {
        const w = wordlist[Math.floor(Math.random() * wordlist.length)];
        if (!eigene.has(w)) falsch.add(w);
      }
      return { i, optionen: mischen([woerter[i], ...falsch]) };
    });
  }, [woerter]);

  const [antworten, setAntworten] = useState<Record<number, string>>({});
  const [falsch, setFalsch] = useState<number | null>(null);
  const offen = fragen.find(f => antworten[f.i] !== woerter[f.i]);
  const alle = !offen;

  const waehlen = (i: number, w: string) => {
    if (antworten[i] === woerter[i]) return;
    if (w === woerter[i]) { haptik('tipp'); setAntworten(a => ({ ...a, [i]: w })); setFalsch(null); }
    else { haptik('warnung'); setFalsch(i); }
  };

  return (
    <>
      <h1 className="mt-[26px] text-[26px] font-semibold leading-[1.15] tracking-[-0.025em]">{t.sicherung.s3Titel}</h1>
      <p className="mt-2 text-[14px] leading-[1.5] text-dim">{t.sicherung.s3Text}</p>

      <div className="mt-5 flex flex-col gap-2.5">
        {fragen.map(f => {
          const richtig = antworten[f.i] === woerter[f.i];
          const dran = offen?.i === f.i;
          return (
            <section key={f.i}
                     className={`panel flex flex-col gap-2.5 !rounded-[20px] p-4 ${dran ? 'ring-2 ring-work' : ''} ${
                       !richtig && !dran ? 'opacity-55' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-extrabold">{t.sicherung.wort(f.i + 1)}</span>
                {richtig && (
                  <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-proof">
                    <svg viewBox="0 0 22 22" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"
                         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11.5l4 4L17 7" /></svg>
                    {t.sicherung.richtig}
                  </span>
                )}
              </div>
              {(dran || richtig) && (
                <div className="grid grid-cols-2 gap-2">
                  {f.optionen.map(w => {
                    const ist = richtig && w === woerter[f.i];
                    return (
                      <button key={w} type="button" onClick={() => waehlen(f.i, w)} disabled={richtig}
                              className={`h-[46px] rounded-[12px] font-mono text-[14px] transition-colors ${
                                ist ? 'border-2 border-proof bg-proof/10 text-proof'
                                  : richtig ? 'bg-raised text-faint' : 'bg-raised text-text active:bg-line'}`}>
                        {w}
                      </button>
                    );
                  })}
                </div>
              )}
              {falsch === f.i && <p className="text-[12.5px] font-semibold text-risk">{t.sicherung.falsch}</p>}
            </section>
          );
        })}
      </div>

      <div className="min-h-6 flex-1" />
      <button type="button" onClick={onNochmal} className="mb-3 text-center text-[13px] font-bold text-work">
        {t.sicherung.nochmal}
      </button>
      <button type="button" onClick={onBestanden} disabled={!alle}
              className="flex h-[56px] w-full items-center justify-center rounded-full bg-text text-[15.5px] font-semibold
                         text-ink transition-transform active:scale-[.985] disabled:opacity-30">
        {t.sicherung.abschliessen}
      </button>
    </>
  );
}

// ------------------------------------------------------------ Fertig

function Fertig({ onSchliessen }: { onSchliessen: () => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <span className="zoom flex h-20 w-20 items-center justify-center rounded-[26px] bg-proof/15 text-proof [&>svg]:h-10 [&>svg]:w-10">
        {Icon.Haken}
      </span>
      <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.025em]">{t.sicherung.erledigtTitel}</h1>
      <p className="mt-2 max-w-[300px] text-[14px] leading-[1.5] text-dim">{t.sicherung.erledigtText}</p>
      <button type="button" onClick={onSchliessen}
              className="mt-10 flex h-[56px] w-full items-center justify-center rounded-full bg-text text-[15.5px] font-semibold text-ink">
        {t.allgemein.fertig}
      </button>
    </div>
  );
}

// ------------------------------------------------------------ Senden gesperrt

/** Blatt, wenn jemand senden will, bevor die Woerter gesichert sind. */
export function SendenGesperrt({ offen, onSchliessen, onSichern }: {
  offen: boolean; onSchliessen: () => void; onSichern: () => void;
}) {
  const { t } = useT();
  return (
    <Blatt offen={offen} onSchliessen={onSchliessen}>
      <span className="mt-1 flex h-14 w-14 items-center justify-center rounded-full border border-amber/30 bg-amber/10 text-amber">
        <svg viewBox="0 0 22 22" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="9.5" width="14" height="10" rx="2.5" /><path d="M7.5 9.5V7a3.5 3.5 0 0 1 7 0v2.5" />
        </svg>
      </span>
      <h2 className="mt-3.5 text-[22px] font-extrabold tracking-[-0.02em]">{t.sicherung.gesperrtTitel}</h2>
      <p className="mt-2 text-[14px] font-semibold leading-[1.5] text-lese">{t.sicherung.gesperrtText}</p>
      <ul className="mt-3.5 flex flex-col gap-2 rounded-[16px] bg-raised p-3.5 text-[13px] font-semibold">
        <li className="flex gap-2"><span className="font-extrabold text-proof">✓</span>{t.sicherung.okMining}</li>
        <li className="flex gap-2"><span className="font-extrabold text-proof">✓</span>{t.sicherung.okEmpfangen}</li>
        <li className="flex gap-2 text-dim"><span className="font-semibold text-amber">○</span>{t.sicherung.offenSenden}</li>
      </ul>
      <button type="button" onClick={onSichern}
              className="mt-4 flex h-[56px] w-full items-center justify-center rounded-full bg-text text-[15.5px] font-semibold text-ink">
        {t.sicherung.jetzt}
      </button>
      <button type="button" onClick={onSchliessen}
              className="mt-2 w-full py-2 text-center text-[13.5px] font-bold text-dim">{t.sicherung.spaeter}</button>
    </Blatt>
  );
}

/** Hinweis auf Home und in der Wallet, solange nicht gesichert: schmale Zeile in Bernstein. */
export function SicherungsHinweis({ onClick, kurz = false }: { onClick: () => void; kurz?: boolean }) {
  const { t } = useT();
  return (
    <button type="button" onClick={onClick}
            className="flex w-full items-center gap-3 border-y border-amber/25 bg-amber/[.06] px-3 py-3 text-left active:bg-amber/10">
      <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="rgb(var(--amber))" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M11 2.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V5.3z" /><path d="M11 7.5v4M11 14.5h.01" />
      </svg>
      {kurz ? (
        <span className="flex-1 text-[13px] font-medium text-text">{t.sicherung.walletBanner}</span>
      ) : (
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[13.5px] font-semibold text-text">{t.sicherung.bannerTitel}</span>
          <span className="text-[12px] text-dim">{t.sicherung.bannerText}</span>
        </span>
      )}
      <span className="text-[18px] text-amber" aria-hidden="true">›</span>
    </button>
  );
}
