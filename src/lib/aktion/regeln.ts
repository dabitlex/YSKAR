/**
 * Aktion "Hilf YSKAR beim Wachsen" -- die festen Regeln an EINER Stelle.
 *
 * Reine Funktionen ohne Datenbank, damit sie getestet und im Ziehungsskript
 * wiederverwendet werden koennen.
 */

/** Start der Aktion (fuer die Fortschrittsleiste). */
export const START = Date.UTC(2026, 9, 28, 0, 0, 0);
/** Empfehlungen bis 31.01.2027, 00:00 UTC. */
export const ENDE = Date.UTC(2027, 0, 31, 0, 0, 0);
/** Pruefung (3 Mining-Tage) bis 14.02.2027, 00:00 UTC. */
export const PRUEF_ENDE = Date.UTC(2027, 1, 14, 0, 0, 0);
/** Ziehung am 15.02.2027 aus dem ersten Block nach 12:00 UTC. */
export const ZIEHUNG = Date.UTC(2027, 1, 15, 12, 0, 0);
/** Abholen bis 17.03.2027, 00:00 UTC. */
export const ABHOL_ENDE = Date.UTC(2027, 2, 17, 0, 0, 0);

export const TOPF_USD = 1000;
/** Plaetze 1-3 Hauptgewinne, 4-10 je 50 USD. Summe 1.000 USD. */
export const PREISE_USD = [300, 200, 150, 50, 50, 50, 50, 50, 50, 50] as const;

export const MINING_TAGE = 3;
export const FENSTER_TAGE = 14;

export const PREIS_ADRESSE = 'ysr1r05c00cn880ckwlknuv2yc7resp400reqwu3wx';
export const COMMUNITY_BOT = 'yskar_community_bot';

export type Status = 'ohne' | 'offen' | 'bestaetigt' | 'ungueltig';
export type Grund = 'wallet_alt' | 'selbst' | 'tageslimit' | 'frist' | 'zu_spaet';

/** Laeuft die Anmeldephase (Empfehlungen werden noch angenommen)? */
export function laeuft(jetzt = Date.now()): boolean {
  return jetzt < ENDE;
}

/**
 * Empfehlungscode aus der Adresse: dasselbe Stueck wie im bisherigen
 * Einladungslink (community.ts), damit alte Links weiter gelten. Bei einer
 * Kollision wird er laenger.
 */
export function codeAusAdresse(adresse: string, laenge = 8): string {
  return adresse.replace(/^ysr1/, '').slice(0, laenge).replace(/[^a-z0-9]/g, '');
}

/** start_param "ref_xxxxxxxx" -> Code, sonst null. */
export function codeAusStartParam(p: string | null | undefined): string | null {
  const m = /^ref_([a-z0-9]{6,16})$/.exec(p ?? '');
  return m ? m[1]! : null;
}

/** Bis wann ein Geworbener seine Mining-Tage erreichen muss (ms). */
export function fristFuer(angemeldetMs: number): number {
  return Math.min(angemeldetMs + FENSTER_TAGE * 86_400_000, PRUEF_ENDE);
}

/**
 * Lose einer Person: je bestaetigte Empfehlung 1, plus 1 fuer die eigene
 * bestaetigte Teilnahme als Geworbener. Ohne Obergrenze und ohne
 * Tagesgrenze (seit 28.10.2026). Gewinnen kann jede Person hoechstens einmal.
 */
export function lose(bestaetigteEmpfehlungen: number, selbstBestaetigt: boolean): number {
  return bestaetigteEmpfehlungen + (selbstBestaetigt ? 1 : 0);
}
