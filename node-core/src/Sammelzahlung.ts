/*
 * Sammelzahlung aus der Wallet (CONSENSUS_V6.md 6.4): die Liste der Empfaenger
 * einlesen und pruefen -- ohne Schluessel, ohne Kette, ohne etwas zu senden.
 *
 * Eine Sammelzahlung gilt ganz oder gar nicht. Darum wird hier nichts
 * stillschweigend repariert: Jede Zeile, die nicht eindeutig ist, bleibt
 * stehen und nennt ihren Grund; erst wenn alle Zeilen "bereit" sind, laesst
 * Node Core die Zahlung zu.
 *
 *   - Eine Adresse, die nicht stimmt, wird nicht geraten.
 *   - Dieselbe Adresse zweimal: Die Kette laesst je Empfaenger nur einen
 *     Betrag zu. Ob zusammengezaehlt oder gestrichen wird, entscheidet, wer
 *     sendet -- nicht das Programm.
 *   - "1.500" kann 1500 oder 1,5 heissen. Das wird gefragt, nie angenommen.
 *
 * Gerechnet wird in ganzen Einheiten (BigInt), nie ueber Gleitkomma.
 */
import { isValidAddress } from '../../src/lib/core/address.ts';
import { DECIMALS, DUST_LIMIT } from '../../src/lib/core/params.ts';

/** Mehr Zeilen liest das Fenster nicht ein -- senden lassen sich hoechstens MAX_BATCH_OUTPUTS. */
export const SAMMEL_ZEILEN_MAX = 2_000;

/** Eine Zeile, wie sie von der Oberflaeche kommt oder aus Text gelesen wurde. */
export interface RohZeile {
  adresse: string;
  /** Betrag als Text, so wie er dasteht. */
  betrag?: string;
  /** Betrag in Grundeinheiten -- gesetzt, sobald er einmal eindeutig war. Geht `betrag` vor. */
  einheiten?: string;
}

export type ZeilenStand =
  | 'bereit' | 'adresse_falsch' | 'eigene' | 'betrag_fehlt' | 'betrag_falsch'
  | 'betrag_unklar' | 'betrag_staub' | 'doppelt';

export interface GepruefteZeile {
  /** Platz in der Liste, ab 1. */
  nr: number;
  adresse: string;
  betrag: string;
  /** Grundeinheiten, wenn der Betrag lesbar und eindeutig ist; sonst null. */
  einheiten: string | null;
  stand: ZeilenStand;
  /** Bei "doppelt": die Zeile, in der dieselbe Adresse zuerst steht. */
  doppeltVon?: number;
  /** Bei "betrag_unklar": [gelesen als ganze Zahl mit Tausenderzeichen, gelesen als Dezimalzahl]. */
  deutungen?: [string, string];
}

export type BetragLesung =
  | { art: 'ok'; einheiten: bigint }
  | { art: 'unklar'; tausend: bigint; dezimal: bigint }
  | { art: 'leer' }
  | { art: 'falsch' };

const BASIS = 10n ** BigInt(DECIMALS);
const U64_MAX = 0xffff_ffff_ffff_ffffn;

/** Ganze und gebrochene Ziffern zu Einheiten; null, wenn es so nicht darstellbar ist. */
function zuEinheiten(ganz: string, bruch: string): bigint | null {
  if (!/^\d*$/.test(ganz) || !/^\d*$/.test(bruch)) return null;
  if (ganz === '' && bruch === '') return null;
  // Mehr Stellen, als die Kette kennt: nicht abschneiden, sondern ablehnen.
  if (bruch.replace(/0+$/, '').length > DECIMALS) return null;
  const g = ganz.replace(/^0+(?=\d)/, '');
  if (g.length > 12) return null;
  const wert = BigInt(g || '0') * BASIS + BigInt(bruch.slice(0, DECIMALS).padEnd(DECIMALS, '0') || '0');
  return wert <= U64_MAX ? wert : null;
}

/** "1.234.567": Gruppen zu je drei Ziffern, die erste eine bis drei, nicht mit 0 beginnend. */
function sindTausender(text: string, zeichen: string): boolean {
  const teile = text.split(zeichen);
  return teile.length >= 2 && /^[1-9]\d{0,2}$/.test(teile[0]) && teile.slice(1).every(t => /^\d{3}$/.test(t));
}

/**
 * Einen Betrag lesen: "1500", "1200,5", "1200.5", "1.234,56", "1,234.56",
 * "1 500", "1500 YSR". Punkt und Komma duerfen beide Dezimalzeichen sein.
 *
 * Ein einzelnes Zeichen mit genau drei Ziffern dahinter ("1.500", "12,345")
 * ist nicht entscheidbar und kommt als `unklar` zurueck -- mit beiden Lesarten.
 */
export function leseBetrag(text: string): BetragLesung {
  const s = text.trim().replace(/\s*ysr$/i, '').replace(/[\s  ']/g, '');
  if (s === '') return { art: 'leer' };
  if (!/^[0-9.,]+$/.test(s) || !/\d/.test(s)) return { art: 'falsch' };
  const punkte = s.split('.').length - 1, kommas = s.split(',').length - 1;
  const fertig = (ganz: string, bruch: string): BetragLesung => {
    const e = zuEinheiten(ganz, bruch);
    return e === null ? { art: 'falsch' } : { art: 'ok', einheiten: e };
  };

  if (punkte === 0 && kommas === 0) return fertig(s, '');

  if (punkte > 0 && kommas > 0) {
    // Beide Zeichen: Das hintere ist das Dezimalzeichen, das vordere gliedert.
    const dez = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const taus = dez === '.' ? ',' : '.';
    if (s.split(dez).length !== 2) return { art: 'falsch' };
    const [vor, nach] = s.split(dez);
    if (!sindTausender(vor, taus)) return { art: 'falsch' };
    return fertig(vor.split(taus).join(''), nach);
  }

  const zeichen = punkte > 0 ? '.' : ',';
  if (punkte + kommas > 1) {
    // Dasselbe Zeichen mehrfach kann nur gliedern: "1.234.567".
    if (!sindTausender(s, zeichen)) return { art: 'falsch' };
    return fertig(s.split(zeichen).join(''), '');
  }
  const [vor, nach] = s.split(zeichen);
  if (/^[1-9]\d{0,2}$/.test(vor) && /^\d{3}$/.test(nach)) {
    const tausend = zuEinheiten(vor + nach, ''), dezimal = zuEinheiten(vor, nach);
    if (tausend === null || dezimal === null) return { art: 'falsch' };
    return { art: 'unklar', tausend, dezimal };
  }
  return fertig(vor, nach);
}

const ohneHuelle = (s: string) => s.trim().replace(/^"(.*)"$/, '$1').trim();

/**
 * Text in Zeilen lesen: je Zeile eine Adresse, dahinter der Betrag.
 *
 * Mit Tabulator oder Semikolon gilt die Zeile als Tabelle: Die Adresse ist
 * das erste Feld, das mit "ysr1" beginnt, der Betrag das Feld danach (davor
 * darf zum Beispiel ein Name stehen). Sonst steht der Betrag hinter der
 * Adresse, durch Komma oder Leerzeichen getrennt -- der Rest der Zeile ist
 * der Betrag, damit "ysr1…, 1200,5" lesbar bleibt.
 *
 * Eine erste Zeile ohne Adresse gilt als Ueberschrift und wird uebergangen.
 * Jede andere Zeile bleibt erhalten, auch wenn sie unlesbar ist: Was der
 * Nutzer eingefuegt hat, verschwindet nicht still.
 */
export function leseListe(text: string, max: number = SAMMEL_ZEILEN_MAX): { zeilen: RohZeile[]; abgeschnitten: boolean } {
  const zeilen: RohZeile[] = [];
  let abgeschnitten = false, erste = true;
  for (const roh of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const zeile = roh.trim();
    if (zeile === '') continue;
    const istErste = erste; erste = false;
    let adresse: string | null = null, betrag = '';
    if (/[\t;]/.test(zeile)) {
      const felder = zeile.split(/[\t;]/).map(ohneHuelle);
      const i = felder.findIndex(f => /^ysr1/i.test(f));
      if (i >= 0) { adresse = felder[i]; betrag = felder[i + 1] ?? ''; }
      else if (!istErste) { adresse = felder[0]; betrag = felder[1] ?? ''; }
    } else {
      const m = /ysr1[0-9a-z]*/i.exec(zeile);
      if (m) {
        adresse = m[0];
        // Was nach der Adresse kommt, ist der Betrag. Steht er in Anfuehrungszeichen
        // ("ysr1…","1,5","Notiz"), gilt nur das erste Feld.
        const rest = zeile.slice(m.index + m[0].length).replace(/^"?\s*,?\s*/, '');
        const feld = /^"([^"]*)"/.exec(rest);
        betrag = feld ? feld[1].trim() : rest.replace(/["\s]+$/, '').trim();
      } else if (!istErste) {
        const teile = zeile.split(/[,\s]+/);
        adresse = ohneHuelle(teile[0]); betrag = teile.slice(1).join(' ');
      }
    }
    if (adresse === null) continue;          // Ueberschrift
    if (zeilen.length >= max) { abgeschnitten = true; break; }
    zeilen.push({ adresse: adresse.toLowerCase(), betrag });
  }
  return { zeilen, abgeschnitten };
}

/** Zeilen aus dem Rumpf einer Anfrage -- nur Text, begrenzt in Zahl und Laenge. */
export function zeilenAusRumpf(wert: unknown, max: number = SAMMEL_ZEILEN_MAX): RohZeile[] | null {
  if (wert === undefined || wert === null) return [];
  if (!Array.isArray(wert) || wert.length > max) return null;
  const zeilen: RohZeile[] = [];
  for (const z of wert) {
    if (!z || typeof z !== 'object') return null;
    const { adresse, betrag, einheiten } = z as Record<string, unknown>;
    if (typeof adresse !== 'string' || adresse.length > 200) return null;
    if (betrag !== undefined && (typeof betrag !== 'string' || betrag.length > 60)) return null;
    if (einheiten !== undefined && einheiten !== null && (typeof einheiten !== 'string' || !/^\d{1,20}$/.test(einheiten))) return null;
    zeilen.push({
      adresse: adresse.trim().toLowerCase(),
      ...(typeof betrag === 'string' ? { betrag } : {}),
      ...(typeof einheiten === 'string' ? { einheiten } : {}),
    });
  }
  return zeilen;
}

/** Stand eines Betrags: was `leseBetrag` sagt, plus Mindestbetrag der Kette. */
function betragStand(z: RohZeile): { stand: ZeilenStand; einheiten: bigint | null; deutungen?: [string, string] } {
  if (z.einheiten !== undefined) {
    const e = BigInt(z.einheiten);
    if (e > U64_MAX) return { stand: 'betrag_falsch', einheiten: null };
    if (e === 0n) return { stand: 'betrag_fehlt', einheiten: null };
    return e < DUST_LIMIT ? { stand: 'betrag_staub', einheiten: e } : { stand: 'bereit', einheiten: e };
  }
  const l = leseBetrag(z.betrag ?? '');
  if (l.art === 'leer') return { stand: 'betrag_fehlt', einheiten: null };
  if (l.art === 'falsch') return { stand: 'betrag_falsch', einheiten: null };
  if (l.art === 'unklar') return { stand: 'betrag_unklar', einheiten: null, deutungen: [l.tausend.toString(), l.dezimal.toString()] };
  if (l.einheiten === 0n) return { stand: 'betrag_fehlt', einheiten: null };
  return l.einheiten < DUST_LIMIT ? { stand: 'betrag_staub', einheiten: l.einheiten } : { stand: 'bereit', einheiten: l.einheiten };
}

export interface ListenPruefung {
  zeilen: GepruefteZeile[];
  bereit: number;
  offen: number;
  /** Summe der bereiten Zeilen. */
  summe: bigint;
  /** Bei "gleicher Betrag fuer alle": warum dieser Betrag nicht gilt (sonst null). */
  gleichStand: ZeilenStand | null;
  gleichDeutungen?: [string, string];
}

/**
 * Die Liste pruefen. Reihenfolge der Gruende je Zeile: Adresse, eigene
 * Adresse, Betrag, zuletzt "doppelt" -- wer eine doppelte Zeile zusammenzaehlen
 * will, braucht dafuer zuerst zwei lesbare Betraege.
 *
 * `gleich`: derselbe Betrag fuer alle Zeilen; die Betraege der Zeilen selbst
 * zaehlen dann nicht.
 */
export function pruefeListe(roh: RohZeile[], opt: { eigene: string; gleich?: RohZeile | null }): ListenPruefung {
  const gleich = opt.gleich ? betragStand({ ...opt.gleich, adresse: '' }) : null;
  const gesehen = new Map<string, number>();
  const zeilen: GepruefteZeile[] = [];
  let bereit = 0, summe = 0n;

  roh.forEach((z, i) => {
    const nr = i + 1;
    const adresse = z.adresse.trim().toLowerCase();
    const basis = { nr, adresse, betrag: z.betrag ?? '' };
    const b = gleich ?? betragStand(z);
    const einheiten = b.einheiten === null ? null : b.einheiten.toString();

    if (!isValidAddress(adresse)) { zeilen.push({ ...basis, einheiten, stand: 'adresse_falsch' }); return; }
    if (adresse === opt.eigene) { zeilen.push({ ...basis, einheiten, stand: 'eigene' }); return; }
    const zuerst = gesehen.get(adresse);
    if (zuerst === undefined) gesehen.set(adresse, nr);
    if (b.stand !== 'bereit') {
      zeilen.push({ ...basis, einheiten, stand: b.stand, ...(b.deutungen ? { deutungen: b.deutungen } : {}) });
      return;
    }
    if (zuerst !== undefined) { zeilen.push({ ...basis, einheiten, stand: 'doppelt', doppeltVon: zuerst }); return; }
    zeilen.push({ ...basis, einheiten, stand: 'bereit' });
    bereit++; summe += b.einheiten!;
  });

  return {
    zeilen, bereit, offen: zeilen.length - bereit, summe,
    gleichStand: gleich && gleich.stand !== 'bereit' ? gleich.stand : null,
    ...(gleich?.deutungen ? { gleichDeutungen: gleich.deutungen } : {}),
  };
}
