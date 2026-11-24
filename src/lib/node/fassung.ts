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
 *   2. Ist dieser Knoten vermutlich veraltet?
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
/** Die Fassung davor -- die einzige, die ohne gesetzte Aktivierungshoehe gilt. */
export const VORIGE_FASSUNG = 5;

/**
 * Die Fassung, die dieser Knoten im Handschlag und in der Status-API
 * meldet (11.4, 13).
 *
 * Ohne gesetzte Aktivierungshoehe setzt er Fassung 6 nicht um: Er lehnt
 * jeden Block der Fassung 6 ab, genau wie ein Knoten der Fassung 5. Meldete
 * er trotzdem 6, hielten ihn Knoten mit gesetzter Hoehe fuer eine Quelle
 * von Bloecken ab der Hoehe (11.4) -- und warteten vergeblich darauf. Also
 * meldet er, was er tatsaechlich tut.
 */
export function gemeldeteFassung(params: ConsensusParams): number {
  return params.v6Height === V6_HEIGHT_UNSET ? VORIGE_FASSUNG : IMPLEMENTIERTE_FASSUNG;
}

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
export function liefertBloeckeAb(peerFassung: number, hoehe: number, params: ConsensusParams,
                                peerAktivierung?: number): boolean {
  if (hoehe < params.v6Height) return true;
  if (peerFassung < IMPLEMENTIERTE_FASSUNG) return false;
  // Fassung 6 ohne (oder mit anderer) Aktivierungshoehe: ein Vorab-Stand,
  // der Fassung 6 nicht durchsetzt -- er hat keine Bloecke ab unserer Hoehe.
  return peerAktivierung === undefined || peerAktivierung === params.v6Height;
}

/**
 * Liegt die eigene Hoehe in den letzten 1.000 Bloecken vor der Aktivierung?
 * Dann werden eingehende Plaetze bevorzugt bei Peers alter Fassung frei
 * gemacht (11.4).
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

/**
 * Schluessel fuer die Grenze eingehender Verbindungen je Absender
 * (--max-inbound-per-ip).
 *
 *   IPv4                 die ganze Adresse
 *   IPv4 in IPv6         (::ffff:a.b.c.d) wie IPv4
 *   IPv6                 die ersten 64 Bit
 *
 * Warum /64 bei IPv6: Ein Anschluss bekommt ueblicherweise ein ganzes /64.
 * Darin kann der Inhaber beliebig viele Adressen benutzen -- eine Grenze je
 * einzelner IPv6-Adresse liesse sich also beliebig umgehen.
 *
 * Alles andere (Namen, Unlesbares) zaehlt als eigener Schluessel.
 */
export function adressSchluessel(host: string): string {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4 = h.startsWith('::ffff:') ? h.slice(7) : h;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4;
  if (!h.includes(':')) return h;
  const gruppen = ipv6Gruppen(h);
  if (!gruppen) return h;
  return gruppen.slice(0, 4).map(g => g.toString(16)).join(':') + '::/64';
}

/**
 * Die Adresse eines Gegenuebers, wie sie im Knoten gefuehrt wird.
 *
 * Lauscht der Knoten auf "::" (IPv4 und IPv6 zugleich), meldet das
 * Betriebssystem einen IPv4-Peer als "::ffff:1.2.3.4". Im Adressbuch, in
 * der Grenze je Absender und in der Erkennung der eigenen Adresse muss
 * derselbe Peer aber immer gleich heissen -- sonst stuende er doppelt im
 * Buch. Deshalb wird die IPv4-Form daraus. Alles andere bleibt, nur klein
 * geschrieben.
 */
export function normalisiereHost(host: string): string {
  const h = host.toLowerCase();
  const v4 = h.startsWith('::ffff:') ? h.slice(7) : null;
  if (v4 && /^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4;
  return h;
}

/** IPv6 in acht 16-Bit-Gruppen, mit aufgeloestem "::". null bei Unlesbarem. */
function ipv6Gruppen(h: string): number[] | null {
  const doppelt = h.split('::');
  if (doppelt.length > 2) return null;
  const teil = (s: string) => (s === '' ? [] : s.split(':'));
  const links = teil(doppelt[0]);
  const rechts = doppelt.length === 2 ? teil(doppelt[1]) : [];
  // Eine eingebettete IPv4 am Ende zaehlt als zwei Gruppen.
  const letzte = (rechts.length ? rechts : links);
  const ende = letzte[letzte.length - 1];
  if (ende && ende.includes('.')) {
    const o = ende.split('.').map(Number);
    if (o.length !== 4 || o.some(x => !(x >= 0 && x <= 255))) return null;
    letzte.splice(letzte.length - 1, 1, ((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16));
  }
  const fehlt = 8 - links.length - rechts.length;
  if (doppelt.length === 1 ? fehlt !== 0 : fehlt < 1) return null;
  const alle = [...links, ...Array(doppelt.length === 2 ? fehlt : 0).fill('0'), ...rechts];
  const zahlen = alle.map(g => /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
  return zahlen.some(Number.isNaN) ? null : zahlen;
}
