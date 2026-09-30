/**
 * Inhalte des Bereichs „Entdecken" -- Typen und Auswahl nach Sprache.
 *
 * Die Texte liegen je Sprache in entdecken.<sprache>.ts als Funktion, die
 * eine Zahlenformatierung bekommt: Dieselbe Kennzahl heisst auf Deutsch
 * „12.000" und auf Englisch „12,000". Zahlen kommen ueberall aus
 * src/lib/core/params.ts, damit ein Artikel nie etwas anderes behauptet
 * als die Kette selbst.
 */
import inhalteDe from './entdecken.de';
import inhalteEn from './entdecken.en';

export type Baustein =
  | { art: 'absatz'; text: string }
  | { art: 'kennzahlen'; werte: { label: string; wert: string }[] }
  | { art: 'schritte'; titel: string; punkte: string[] }
  | { art: 'balken'; titel: string; werte: { label: string; anteil: number }[]; fuss: string }
  | { art: 'hinweis'; text: string; tone?: 'work' | 'dim' | 'risk' };

export interface Artikel {
  slug: string;
  icon: 'Muenze' | 'Blitz' | 'Tabelle' | 'Schloss' | 'Wuerfel' | 'Pfeil';
  farbe: 'work' | 'proof' | 'amber' | 'ink';
  titel: string;
  teaser: string;
  lesezeit: string;
  einleitung: string;
  bausteine: Baustein[];
}

export interface Frage { frage: string; antwort: string }

/** datum ist ISO (JJJJ-MM-TT); die Oberflaeche formatiert es je Sprache. */
export interface Neuigkeit { datum: string; titel: string; text: string; link?: string | null }

export interface Inhalte { ARTIKEL: Artikel[]; FAQ: Frage[]; NEUIGKEITEN: Neuigkeit[] }

const FABRIKEN = { de: inhalteDe, en: inhalteEn } as const;
export type InhaltSprache = keyof typeof FABRIKEN;

const cache = new Map<string, Inhalte>();

/** Inhalte in einer Sprache, mit Zahlen im passenden Format. Einmal je Sprache gebaut. */
export function inhalte(sprache: string, locale: string): Inhalte {
  const s: InhaltSprache = sprache in FABRIKEN ? (sprache as InhaltSprache) : 'en';
  const key = `${s}:${locale}`;
  let i = cache.get(key);
  if (!i) {
    i = FABRIKEN[s]((n: number) => n.toLocaleString(locale));
    cache.set(key, i);
  }
  return i;
}

/** Fuer Server-Code ohne Sprachkontext (News-Fallback). */
export const NEUIGKEITEN_DE = inhalte('de', 'de-DE').NEUIGKEITEN;
export const NEUIGKEITEN_EN = inhalte('en', 'en-US').NEUIGKEITEN;
