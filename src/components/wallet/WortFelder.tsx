'use client';

import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * Zwoelf Felder fuer die Merkwoerter -- zwei je Reihe, mit Vorschlaegen.
 *
 * Ein Feld fuer alle zwoelf war die erste Fassung. Zwoelf Felder machen
 * jeden Tippfehler an seiner Stelle sichtbar, und die Vorschlaege aus der
 * BIP39-Liste ersparen das Ausschreiben: "ri" reicht, Tipp auf "river".
 *
 * Was das Bauteil kann:
 *  - Vorschlaege beim Tippen (Praefix aus der Wortliste, hoechstens vier),
 *    Antippen uebernimmt und springt weiter.
 *  - Leertaste oder Enter uebernimmt den ersten Vorschlag und springt weiter.
 *  - Einfuegen von mehreren Woertern (Zwischenablage) verteilt sie ab dem
 *    aktuellen Feld auf die Felder.
 *  - Ein Wort, das nicht in der Liste steht, wird rot markiert.
 *
 * Die Wortliste ist englisch -- BIP39 ist englisch, egal welche Sprache die
 * Oberflaeche spricht.
 */
const ANZAHL = 12;
const WOERTER = new Set<string>(wordlist);

/** Steht das Wort in der BIP39-Liste? */
export const istWort = (w: string) => WOERTER.has(w);

export interface WortFelderTexte {
  wort: (n: number) => string;
  einfuegen: string;
  nichtInListe: string;
}

export default function WortFelder({ woerter, onChange, texte }: {
  woerter: string[];
  onChange: (woerter: string[]) => void;
  texte: WortFelderTexte;
}) {
  const [fokus, setFokus] = useState<number | null>(null);
  const felder = useRef<(HTMLInputElement | null)[]>([]);

  const setze = (i: number, wert: string) => {
    const neu = [...woerter];
    neu[i] = wert.toLowerCase().replace(/[^a-z]/g, '');
    onChange(neu);
  };

  const weiter = (i: number) => {
    const n = Math.min(ANZAHL - 1, i + 1);
    if (n !== i) felder.current[n]?.focus();
    else felder.current[i]?.blur();
  };

  /** Mehrere Woerter ab Feld i verteilen -- aus Einfuegen oder Zwischenablage. */
  const verteile = (ab: number, text: string) => {
    const teile = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (teile.length < 2) return false;
    const neu = [...woerter];
    const start = teile.length >= ANZAHL ? 0 : ab;
    teile.slice(0, ANZAHL - start).forEach((w, k) => { neu[start + k] = w; });
    onChange(neu);
    const letztes = Math.min(ANZAHL - 1, start + teile.length);
    setTimeout(() => felder.current[letztes]?.focus(), 0);
    return true;
  };

  const einfuegen = async (e: ClipboardEvent<HTMLInputElement>, i: number) => {
    const text = e.clipboardData.getData('text');
    if (verteile(i, text)) e.preventDefault();
  };

  const ausZwischenablage = async () => {
    try {
      const text = await navigator.clipboard.readText();
      verteile(fokus ?? 0, text);
    } catch { /* nicht ueberall erlaubt -- dann tippt man */ }
  };

  const vorschlaege = useMemo(() => {
    if (fokus == null) return [];
    const p = woerter[fokus] ?? '';
    if (!p) return [];
    const aus: string[] = [];
    for (const w of wordlist) {
      if (w.startsWith(p)) { aus.push(w); if (aus.length === 4) break; }
    }
    // Ein exakter Treffer als einziger Vorschlag braucht keinen Balken.
    return aus.length === 1 && aus[0] === p ? [] : aus;
  }, [fokus, woerter]);

  const taste = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Tab') return;
    const p = woerter[i] ?? '';
    if (e.key !== 'Tab') e.preventDefault();
    if (!p) return;
    if (!WOERTER.has(p) && vorschlaege[0]) setze(i, vorschlaege[0]);
    if (e.key !== 'Tab') weiter(i);
  };

  const uebernehmen = (i: number, w: string) => {
    setze(i, w);
    weiter(i);
  };

  return (
    <div className="relative grid grid-cols-2 gap-x-2.5 gap-y-2">
      {Array.from({ length: ANZAHL }, (_, i) => {
        const w = woerter[i] ?? '';
        const falsch = w.length > 0 && fokus !== i && !WOERTER.has(w);
        const zeigeVorschlag = fokus === i && vorschlaege.length > 0;
        return (
          <div key={i} className="relative flex flex-col gap-1">
            <label htmlFor={`wort${i}`}
                   className="pl-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint">
              {texte.wort(i + 1)}
            </label>
            <input
              id={`wort${i}`}
              ref={el => { felder.current[i] = el; }}
              value={w}
              onChange={e => setze(i, e.target.value)}
              onFocus={() => setFokus(i)}
              onBlur={() => setFokus(f => (f === i ? null : f))}
              onKeyDown={e => taste(e, i)}
              onPaste={e => einfuegen(e, i)}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
              inputMode="text" enterKeyHint={i === ANZAHL - 1 ? 'done' : 'next'}
              aria-invalid={falsch || undefined}
              className={`sunk w-full px-3 py-2.5 font-mono text-[15px] outline-none transition-colors
                          focus:border-work ${falsch ? '!border-risk' : ''}`}
            />
            {falsch && (
              <span className="pl-0.5 text-[11px] font-bold text-risk">{texte.nichtInListe}</span>
            )}
            {zeigeVorschlag && (
              /*
                Vorschlagsband unter dem Feld. onMouseDown statt onClick, weil
                der Blur des Feldes sonst vor dem Klick kommt und die Liste
                schliesst, bevor der Tipp ankommt.
              */
              <div className={`absolute top-full z-20 mt-1.5 flex gap-1 rounded-[12px] bg-text p-1.5
                               shadow-[0_12px_28px_-12px_rgb(var(--edge)/.5)] ${
                               i % 2 === 0 ? 'left-0' : 'right-0'}`}>
                {vorschlaege.map((v, k) => (
                  <button key={v} type="button" tabIndex={-1}
                          onMouseDown={e => { e.preventDefault(); uebernehmen(i, v); }}
                          className={`rounded-[8px] px-2.5 py-1.5 font-mono text-[13.5px] ${
                            k === 0 ? 'bg-work text-white' : 'text-[#B9CCF8]'}`}>
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="col-span-2 mt-1 flex justify-end">
        <button type="button" onClick={ausZwischenablage}
                className="text-[12.5px] font-bold text-work">{texte.einfuegen}</button>
      </div>
    </div>
  );
}
