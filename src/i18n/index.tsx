'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import de, { type Woerterbuch } from './de';
import en from './en';
import ru from './ru';
import es from './es';
import tr from './tr';
import pt from './pt';
import it from './it';
import fr from './fr';
import pl from './pl';
import zh from './zh';

/**
 * Sprache der Oberflaeche.
 *
 * Kein Routing, keine URL je Sprache: Die App laeuft in Telegram und in der
 * Android-Huelle, dort gibt es keine Adresszeile. Die Sprache ist ein
 * Zustand -- gewaehlt beim Einrichten oder in den Einstellungen, gemerkt in
 * localStorage, sonst aus Telegram oder dem System erraten. Englisch, wenn
 * nichts davon passt.
 *
 * Alle Texte liegen in de.ts und en.ts mit identischen Schluesseln; eine
 * neue Sprache ist eine weitere Datei und ein Eintrag in SPRACHEN.
 */
export type Sprache = 'de' | 'en' | 'ru' | 'es' | 'tr' | 'pt' | 'it' | 'fr' | 'pl' | 'zh';

export const SPRACHEN: { code: Sprache; name: string }[] = [
  { code: 'en', name: en.name },
  { code: 'de', name: de.name },
  { code: 'es', name: es.name },
  { code: 'pt', name: pt.name },
  { code: 'fr', name: fr.name },
  { code: 'it', name: it.name },
  { code: 'pl', name: pl.name },
  { code: 'ru', name: ru.name },
  { code: 'tr', name: tr.name },
  { code: 'zh', name: zh.name },
];

const BUECHER: Record<Sprache, Woerterbuch> = { de, en, ru, es, tr, pt, it, fr, pl, zh };
const MERKER = 'yskar.sprache';
const VORGABE: Sprache = 'en';

function istSprache(s: unknown): s is Sprache {
  return typeof s === 'string' && s in BUECHER;
}

/** Gemerkte Wahl, sonst Telegram, sonst System, sonst Englisch. */
export function spracheErkennen(): Sprache {
  if (typeof window === 'undefined') return VORGABE;
  try {
    const g = localStorage.getItem(MERKER);
    if (istSprache(g)) return g;
  } catch { /* privater Modus */ }
  const kandidaten: string[] = [];
  const tg = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (typeof tg === 'string') kandidaten.push(tg);
  if (Array.isArray(navigator.languages)) kandidaten.push(...navigator.languages);
  if (navigator.language) kandidaten.push(navigator.language);
  for (const k of kandidaten) {
    const kurz = k.toLowerCase().slice(0, 2);
    if (istSprache(kurz)) return kurz;
  }
  return VORGABE;
}

/** Wurde die Sprache je ausdruecklich gewaehlt? (Onboarding fragt sonst.) */
export function spracheGewaehlt(): boolean {
  try { return istSprache(localStorage.getItem(MERKER)); } catch { return false; }
}

interface Kontext {
  sprache: Sprache;
  t: Woerterbuch;
  setSprache: (s: Sprache) => void;
}

const Ctx = createContext<Kontext | null>(null);

export function SpracheProvider({ children }: { children: React.ReactNode }) {
  // Auf dem Server und beim ersten Rendern im Browser dieselbe Vorgabe,
  // sonst passt das Markup nicht zusammen. Direkt danach die echte Sprache.
  const [sprache, setSpracheRoh] = useState<Sprache>(VORGABE);
  useEffect(() => { setSpracheRoh(spracheErkennen()); }, []);
  useEffect(() => { document.documentElement.lang = sprache; }, [sprache]);

  const setSprache = useCallback((s: Sprache) => {
    setSpracheRoh(s);
    try { localStorage.setItem(MERKER, s); } catch { /* egal */ }
  }, []);

  const wert = useMemo<Kontext>(() => ({ sprache, t: BUECHER[sprache], setSprache }), [sprache, setSprache]);
  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

/** Woerterbuch der aktuellen Sprache plus Zahlenformatierung. */
export function useT() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useT ausserhalb des SpracheProvider');
  const { t, sprache, setSprache } = c;
  const locale = t.locale;

  const zahl = useCallback((n: number, o?: Intl.NumberFormatOptions) => n.toLocaleString(locale, o), [locale]);

  /** Betrag mit vier Nachkommastellen, getrennt in Vor- und Nachkommateil fuer die grosse Anzeige. */
  const betrag = useCallback((n: number) => {
    const teile = new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
      .formatToParts(n);
    const ganz = teile.filter(p => p.type !== 'fraction' && p.type !== 'decimal').map(p => p.value).join('');
    const bruch = teile.find(p => p.type === 'fraction')?.value ?? '0000';
    const trenner = teile.find(p => p.type === 'decimal')?.value ?? '.';
    return { ganz, bruch, trenner };
  }, [locale]);

  /** "vor 11 min" / "11 min ago" aus einem Unix-Zeitstempel in Sekunden. */
  const vorZeit = useCallback((ts: string | number | null) => {
    if (ts == null || ts === '') return '';
    const s = Math.max(0, Date.now() / 1000 - Number(ts));
    if (s < 60) return t.zeit.vorS(Math.round(s));
    if (s < 3600) return t.zeit.vorMin(Math.round(s / 60));
    if (s < 86400) return t.zeit.vorH(Math.round(s / 3600));
    return t.zeit.vorD(Math.round(s / 86400));
  }, [t]);

  const datum = useCallback((ts: string | number) =>
    new Date(Number(ts) * 1000).toLocaleString(locale), [locale]);

  return { t, sprache, setSprache, locale, zahl, betrag, vorZeit, datum };
}

/** Fehlercodes aus useWallet in die Sprache der Oberflaeche. */
export function fehlerText(code: string | undefined, t: Woerterbuch): string {
  switch (code) {
    case 'wrong_pin': return t.fehler.pinFalsch;
    case 'no_vault': return t.fehler.keinTresor;
    case 'bad_mnemonic': return t.fehler.woerterUngueltig;
    default: return code || t.allgemein.fehlgeschlagen;
  }
}

export type { Woerterbuch };
