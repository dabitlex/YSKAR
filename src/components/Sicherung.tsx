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
  // Pflicht direkt nach dem Erstellen: Die Woerter stehen sofort da. PIN und
  // Woerter gehoeren im Einstieg zusammen ("Schritt 2 von 3"); die Hinweise
  // des frueheren Vorbereitungsschritts stehen jetzt bei den Woertern.
  const sofort = pflicht && !!wallet.freshMnemonic;
  const [schritt, setSchritt] = useState<Schritt>(sofort ? 'woerter' : 'vorbereiten');
  const [woerter, setWoerter] = useState<string[] | null>(() => (sofort ? wallet.freshMnemonic!.split(' ') : null));

  const zurueck = () => {
    if (schritt === 'pin') setSchritt('vorbereiten');
    else if (schritt === 'woerter') { if (!sofort) setSchritt('vorbereiten'); }
    else if (schritt === 'pruefen') setSchritt('woerter');
    else if (!pflicht) onSchliessen();
  };
  const kannZurueck = !(pflicht && (schritt === 'vorbereiten' || schritt === 'fertig' || (sofort && schritt === 'woerter')));
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
      <main className="rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-[calc(28px+var(--unten))]">
        {schritt !== 'fertig' && (
          <>
            <div className="flex items-center justify-between">
              <button type="button" onClick={zurueck} aria-label={t.allgemein.zurueck}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border border-line text-text active:scale-95 ${
                        kannZurueck && !imTelegram() ? '' : 'invisible'}`}>
                <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 5l-6 6 6 6" /></svg>
              </button>
              <span className="text-[13px] text-dim">{t.licht.schritt(nummer, 3)}</span>
            </div>
            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {[1, 2, 3].map(i => (
                <span key={i} className={`h-0.5 w-[22px] rounded-full ${i <= nummer ? 'bg-text' : 'bg-text/25'}`} />
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
                   onBestanden={() => {
                     wallet.gesichertMelden(); if (pflicht) pflichtLoesen(); setWoerter(null); haptik('erfolg');
                     // Im Einstieg geht es ohne Zwischenbild weiter: Als Naechstes waehlt der Nutzer seinen Pool.
                     if (sofort) onSchliessen(); else setSchritt('fertig');
                   }} />
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
      <h1 className="mt-[18px] aussage text-[33px] leading-[1.05] tracking-[-.036em]">{t.sicherung.s1Titel}</h1>
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
              className="flex h-[56px] w-full items-center justify-center rounded-full bg-lamp text-[17px] font-semibold tracking-[-.01em]
                         text-lamp-ink transition-transform active:scale-[.985] disabled:opacity-30">
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
      <h1 className="aussage mt-6 text-[33px] leading-[1.05] tracking-[-.036em]">{t.sicherung.s2Titel}</h1>
      <p className="mt-3 text-[14.5px] leading-[1.45] text-lese">{t.sicherung.s2Text}</p>
      <ol className="mt-5 grid grid-cols-2 gap-x-[26px] border-t border-line">
        {reihen.flat().map(i => (
          <li key={i} className="flex h-[50px] items-center gap-3.5 border-b border-line">
            <span className="tnum w-5 shrink-0 font-mono text-[12.5px] text-dim">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-[18px] font-medium tracking-[-.01em]">{woerter[i]}</span>
          </li>
        ))}
      </ol>
      <ul className="mt-5 flex flex-col gap-2.5">
        {[t.rd.w.g1S, t.rd.w.g2S, t.rd.w.g4S].map(h => (
          <li key={h} className="flex items-baseline gap-2.5 text-[14px] leading-[1.45] text-lese">
            <span className="h-1.5 w-1.5 shrink-0 -translate-y-0.5 rounded-full bg-lamp" aria-hidden="true" />{h}
          </li>
        ))}
      </ul>
      <div className="min-h-6 flex-1" />
      <button type="button" onClick={onWeiter}
              className="flex h-[56px] w-full items-center justify-center rounded-full bg-lamp text-[17px] font-semibold tracking-[-.01em]
                         text-lamp-ink transition-transform active:scale-[.985]">
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
      <h1 className="mt-[26px] aussage text-[33px] leading-[1.05] tracking-[-.036em]">{t.sicherung.s3Titel}</h1>
      <p className="mt-2 text-[14px] leading-[1.5] text-dim">{t.sicherung.s3Text}</p>

      <div className="mt-5 flex flex-col gap-2.5">
        {fragen.map(f => {
          const richtig = antworten[f.i] === woerter[f.i];
          const dran = offen?.i === f.i;
          return (
            <section key={f.i}
                     className={`flex flex-col gap-2.5 border-b border-line py-3.5 ${!richtig && !dran ? 'opacity-55' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-[16px] font-medium">
                  {dran && <span className="h-2 w-2 rounded-full bg-[#FFE7C2] shadow-[0_0_12px_3px_rgb(255_190_112/.6)]" aria-hidden="true" />}
                  {t.sicherung.wort(f.i + 1)}
                </span>
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
                              className={`h-11 rounded-full text-[16px] font-medium transition-colors ${
                                ist ? 'text-proof shadow-[inset_0_0_0_1.5px_rgb(var(--proof))]'
                                  : richtig ? 'text-faint shadow-[inset_0_0_0_1px_rgb(238_244_255/.14)]'
                                  : 'text-text shadow-[inset_0_0_0_1px_rgb(238_244_255/.42)] active:bg-text/[.06]'}`}>
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
      <button type="button" onClick={onNochmal} className="mb-2 min-h-11 text-center text-[14.5px] font-medium text-lese underline decoration-text/40 underline-offset-4">
        {t.sicherung.nochmal}
      </button>
      <button type="button" onClick={onBestanden} disabled={!alle}
              className="flex h-[56px] w-full items-center justify-center rounded-full bg-lamp text-[17px] font-semibold tracking-[-.01em]
                         text-lamp-ink transition-transform active:scale-[.985] disabled:opacity-30">
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
              className="mt-10 flex h-[56px] w-full items-center justify-center rounded-full bg-lamp text-[17px] font-semibold tracking-[-.01em] text-lamp-ink">
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
      <h2 className="mt-1 text-[24px] font-[350] leading-[1.14] tracking-[-.026em]">{t.sicherung.gesperrtTitel}</h2>
      <p className="mt-2.5 text-[14.5px] leading-[1.45] text-lese">{t.sicherung.gesperrtText}</p>
      <ul className="mt-[18px] border-t border-line">
        {[t.sicherung.okMining, t.sicherung.okEmpfangen].map(zeile => (
          <li key={zeile} className="flex min-h-[56px] items-center gap-3.5 border-b border-line py-2 text-[16px] font-medium">
            <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-proof"><path d="M5 11.5l4 4 8-9" /></svg>
            {zeile}
          </li>
        ))}
        <li className="flex min-h-[56px] items-center gap-3.5 border-b border-line py-2 text-[16px] font-medium text-lamp">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="h-2.5 w-2.5 rounded-full shadow-[inset_0_0_0_1.5px_rgb(var(--lamp))]" />
          </span>
          {t.sicherung.offenSenden}
        </li>
      </ul>
      <button type="button" onClick={onSichern}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-lamp px-6 text-[16px] font-semibold text-lamp-ink active:scale-[.985]">
        {t.sicherung.jetzt}
      </button>
      <button type="button" onClick={onSchliessen}
              className="mt-1 flex min-h-11 w-full items-center justify-center text-[14.5px] font-medium text-text underline decoration-text/45 underline-offset-[.24em]">{t.sicherung.spaeter}</button>
    </Blatt>
  );
}

/** Hinweis auf Home und in der Wallet, solange nicht gesichert: schmale Zeile in Bernstein. */
export function SicherungsHinweis({ onClick, kurz = false }: { onClick: () => void; kurz?: boolean }) {
  const { t } = useT();
  return (
    <button type="button" onClick={onClick}
            className="flex min-h-[56px] w-full items-center gap-3.5 border-y border-lamp/30 py-2.5 text-left active:opacity-70">
      <span aria-hidden="true" className="flex h-5 w-[14px] shrink-0 items-center justify-center">
        <span className="h-2.5 w-2.5 rounded-full shadow-[inset_0_0_0_1.5px_rgb(var(--lamp))]" />
      </span>
      {kurz ? (
        <span className="flex-1 text-[14.5px] font-medium leading-[1.4] text-lamp">{t.sicherung.walletBanner}</span>
      ) : (
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[14.5px] font-medium leading-[1.4] text-lamp">{t.sicherung.bannerTitel}</span>
          <span className="text-[13.5px] leading-[1.4] text-dim">{t.sicherung.bannerText}</span>
        </span>
      )}
      <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="-mr-1 shrink-0 text-lamp"><path d="m8 5 6 6-6 6" /></svg>
    </button>
  );
}
