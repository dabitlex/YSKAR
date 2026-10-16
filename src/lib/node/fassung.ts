/**
 * Fassungsstand eines Knotens -- Anzeige und Netzverhalten, KEIN Konsens.
 *
 * docs/CONSENSUS_V6.md Abschnitte 11.1, 11.4 und 13.
 *
 * Zwei Fragen beantwortet diese Datei:
 *
 *   1. Welche Fassung setzt dieses Programm um, und welche Aktivierung
 *      kennt es als naechste? Beides geht in den Handschlag (11.4) und in
 *      die Status-API (13).
 *
 *   2. Ist dieser Knoten vermutlich veraltet? Nach Moneros hardfork.cpp:
 *      Hat er einen Block mit hoeherer Fassung und gueltiger Arbeit
 *      gesehen, ist er es sicher (`outdated`). Davon unabhaengig vergleicht
 *      er die Uhr mit dem Zeitstempel der letzten Fassung, die er kennt:
 *      nach 180 Tagen `update_recommended`, nach 365 Tagen
 *      `probably_forked`. Alles Meldungen, nie ein Grund anzuhalten.
 */
import { V6_HEIGHT_UNSET, V6_TIMESTAMP } from '../core/params.ts';
import type { ConsensusParams } from '../core/networks.ts';

/** Hoechste Konsensfassung, die dieses Programm umsetzt. */
export const IMPLEMENTIERTE_FASSUNG = 6;

export type FassungsStatus =
  | 'current' | 'outdated' | 'update_recommended' | 'probably_forked';

const TAG_S = 86_400;
export const UPDATE_EMPFOHLEN_NACH_S = 180 * TAG_S;
export const VERMUTLICH_ABGESPALTEN_NACH_S = 365 * TAG_S;

/**
 * Die naechste Aktivierungshoehe, die dieser Knoten kennt; 0, wenn keine
 * gesetzt ist. Nach der Hoehe bleibt sie stehen: Sie sagt "die letzte
 * Aktivierung, von der ich weiss", und ein Peer, der sie nicht kennt, ist
 * damit erkennbar aelter.
 */
export function naechsteAktivierung(params: ConsensusParams): number {
  return params.v6Height === V6_HEIGHT_UNSET ? 0 : params.v6Height;
}

/**
 * Der Fassungsstand aus zwei Beobachtungen.
 *
 * @param hoehereGesehen   Der ChainManager hat einen Block hoeherer Fassung
 *                         mit plausiblem Vorgaenger und richtiger Difficulty
 *                         abgelehnt (11.1).
 * @param jetztS           Unix-Zeit in Sekunden.
 * @param letzteFassungS   Zeitstempel der letzten bekannten Fassung; 0 heisst
 *                         "noch nicht gesetzt", dann gibt es keine Zeitregel.
 */
export function fassungsStatus(
  hoehereGesehen: boolean,
  jetztS: number = Math.floor(Date.now() / 1000),
  letzteFassungS: number = Number(V6_TIMESTAMP),
): FassungsStatus {
  if (hoehereGesehen) return 'outdated';
  if (letzteFassungS <= 0) return 'current';
  const alter = jetztS - letzteFassungS;
  if (alter >= VERMUTLICH_ABGESPALTEN_NACH_S) return 'probably_forked';
  if (alter >= UPDATE_EMPFOHLEN_NACH_S) return 'update_recommended';
  return 'current';
}

/**
 * Darf ein Peer dieser Fassung nach Bloecken ab `hoehe` gefragt werden?
 *
 * Ein Peer, der eine Fassung unter 6 meldet, hat keine Bloecke ab der
 * Aktivierungshoehe -- er kann sie nicht einmal lesen. Ihn danach zu
 * fragen kostet eine Wartezeit je Block. Fuer Bloecke davor bleibt er eine
 * gute Quelle. Ohne gesetzte Hoehe gibt es nichts, was er nicht haette.
 */
export function liefertBloeckeAb(peerFassung: number, hoehe: number, params: ConsensusParams): boolean {
  if (hoehe < params.v6Height) return true;
  return peerFassung >= IMPLEMENTIERTE_FASSUNG;
}

/**
 * Liegt die eigene Hoehe in den letzten 1.000 Bloecken vor der Aktivierung?
 * Dann werden eingehende Plaetze bevorzugt bei Peers alter Fassung frei
 * gemacht (11.4, nach ZIP 201).
 */
export const VERDRAENGUNGSFENSTER = 1_000;

export function imVerdraengungsfenster(hoehe: number, params: ConsensusParams): boolean {
  if (params.v6Height === V6_HEIGHT_UNSET) return false;
  return hoehe >= params.v6Height - VERDRAENGUNGSFENSTER && hoehe < params.v6Height;
}

/**
 * Netzgruppe eines Hosts: /16 bei IPv4, /32 bei IPv6, der Name sonst.
 * Der letzte Peer einer Gruppe wird nie verdraengt -- sonst liesse sich
 * ein Knoten mit vielen Adressen aus einem Netz von allen anderen
 * abschneiden.
 */
export function netzGruppe(host: string): string {
  const h = host.startsWith('::ffff:') ? host.slice(7) : host;
  const v4 = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (v4) return `${v4[1]}.${v4[2]}`;
  if (h.includes(':')) {
    const teile = h.split(':');
    return teile.slice(0, 2).join(':').toLowerCase();
  }
  return h.toLowerCase();
}
