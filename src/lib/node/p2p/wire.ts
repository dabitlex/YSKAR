/**
 * P2P-Rahmung.
 *
 * Aufgebaut wie Bitcoins Nachrichtenkopf, weil sich dessen Entwurf seit
 * 2009 im Feld bewaehrt hat und jeder, der Bitcoin kennt, ihn sofort liest:
 *
 *     magic(4) | command(12) | length(4) | checksum(4) | payload
 *
 * Uebernommen und warum:
 *
 *   MAGIC        Vier Byte, die das Netz benennen. Sie trennen Mainnet und
 *                Testnetz auf der Leitung -- ein Knoten des einen kann mit
 *                dem anderen gar nicht erst ins Gespraech kommen. Bei YSKAR
 *                sind es die ersten vier Byte der Chain-ID, also nichts
 *                Zusaetzliches zu pflegen.
 *
 *   COMMAND      Zwoelf Byte ASCII, mit Nullbytes aufgefuellt. Lesbar im
 *                Mitschnitt, feste Laenge beim Einlesen.
 *
 *   LENGTH       Little-Endian, wie alles andere in YSKAR.
 *
 *   CHECKSUM     Die ersten vier Byte von SHA-256d ueber die Nutzlast.
 *
 * Zur Pruefsumme ehrlich: TCP hat bereits eine, und sie faengt keinen
 * gezielten Angriff ab -- wer die Nutzlast aendert, rechnet sie mit. Ihr
 * eigentlicher Nutzen ist ein anderer: Sie erkennt, wenn der Leser aus dem
 * Takt geraten ist und Bytes an der falschen Stelle liest. Ohne sie faellt
 * so ein Versatz erst viel spaeter auf, an einer Stelle, die nichts damit
 * zu tun hat.
 *
 * Nicht uebernommen: Bitcoins 4-MB-Grenze wird bei YSKAR nicht gebraucht --
 * der groesste moegliche Block liegt bei rund 400 KB. Die Grenze hier ist
 * trotzdem grosszuegig gewaehlt, aber sie existiert, und das ist der Punkt:
 * Ohne Obergrenze kann eine einzige Nachricht den Knoten den Speicher
 * kosten, noch bevor irgendetwas geprueft wurde.
 */
import { sha256d } from '../../core/hash.ts';
import { toHex } from '../../core/codec.ts';

/** Kopfgroesse: magic + command + length + checksum. */
export const HEADER_SIZE = 4 + 12 + 4 + 4;

/**
 * Hoechste Nutzlast einer Nachricht.
 *
 * Ein Block mit 2.000 Transaktionen liegt bei rund 400 KB. Zwei Megabyte
 * lassen Luft fuer Stapelantworten und kuenftige Nachrichten, ohne dass
 * ein einzelner Peer nennenswerten Speicher binden kann.
 */
export const MAX_PAYLOAD = 2 * 1024 * 1024;

/** Laenge des Befehlsfelds. */
export const COMMAND_SIZE = 12;

/**
 * Zulaessige Befehle.
 *
 * Eine Positivliste, keine Negativliste. Was hier nicht steht, wird
 * abgewiesen, bevor die Nutzlast ueberhaupt gelesen wird -- so kann ein
 * unbekannter Befehl keinen Speicher binden.
 */
export const COMMANDS = [
  'version', 'verack',          // Handschlag
  'ping', 'pong',               // Lebenszeichen
  'getheaders', 'headers',      // Kettenabgleich
  'getdata', 'block', 'notfound',
  'inv',                        // Ankuendigung
  'tx',                         // Transaktionen
  'getaddr', 'addr',            // Peers austauschen
] as const;

export type Command = typeof COMMANDS[number];

const ERLAUBT = new Set<string>(COMMANDS);
export const istBefehl = (s: string): s is Command => ERLAUBT.has(s);

export interface Frame {
  command: Command;
  payload: Uint8Array;
}

/** Die vier Magic-Bytes eines Netzes -- der Anfang seiner Chain-ID. */
export function magicFor(chainId: Uint8Array): Uint8Array {
  if (chainId.length < 4) throw new Error('Chain-ID ist zu kurz fuer Magic-Bytes');
  return chainId.slice(0, 4);
}

/** Eine Nachricht in Bytes verpacken. */
export function encodeFrame(
  magic: Uint8Array, command: Command, payload: Uint8Array,
): Uint8Array {
  if (magic.length !== 4) throw new Error('Magic muss vier Byte sein');
  if (!istBefehl(command)) throw new Error(`Unbekannter Befehl: ${command}`);
  if (payload.length > MAX_PAYLOAD) {
    throw new Error(`Nutzlast ${payload.length} ueberschreitet ${MAX_PAYLOAD}`);
  }

  const out = new Uint8Array(HEADER_SIZE + payload.length);
  const dv = new DataView(out.buffer);

  out.set(magic, 0);
  // Befehl als ASCII, mit Nullbytes aufgefuellt.
  for (let i = 0; i < command.length; i++) out[4 + i] = command.charCodeAt(i);
  dv.setUint32(16, payload.length, true);
  out.set(sha256d(payload).slice(0, 4), 20);
  out.set(payload, HEADER_SIZE);
  return out;
}

export type DecodeResult =
  /** Fertige Nachricht, plus wie viele Bytes sie verbraucht hat. */
  | { t: 'frame'; frame: Frame; verbraucht: number }
  /** Noch nicht genug Daten -- weiterlesen, nichts verwerfen. */
  | { t: 'unvollstaendig'; benoetigt: number }
  /** Kaputt. Die Verbindung gehoert getrennt; ein Weiterlesen waere raten. */
  | { t: 'fehler'; grund: string };

/**
 * Die naechste Nachricht aus einem Puffer lesen.
 *
 * Gibt zurueck, wie viele Bytes verbraucht wurden -- der Aufrufer schiebt
 * den Puffer entsprechend weiter. TCP kennt keine Nachrichtengrenzen: Was
 * als eine Nachricht gesendet wurde, kommt womoeglich in drei Stuecken an,
 * und drei Nachrichten koennen in einem Stueck ankommen.
 *
 * Reihenfolge der Pruefungen ist Absicht: Magic, Befehl und Laenge kosten
 * nichts und entscheiden, ob ueberhaupt gelesen wird. Die Pruefsumme kommt
 * zuletzt, weil sie ueber die ganze Nutzlast rechnet.
 */
export function decodeFrame(puffer: Uint8Array, magic: Uint8Array): DecodeResult {
  if (puffer.length < HEADER_SIZE) {
    return { t: 'unvollstaendig', benoetigt: HEADER_SIZE - puffer.length };
  }

  for (let i = 0; i < 4; i++) {
    if (puffer[i] !== magic[i]) {
      // Falsches Netz oder Versatz im Strom. Beides ist nicht reparierbar:
      // Wer hier weitersucht, raet.
      return { t: 'fehler', grund: 'falsches_netz' };
    }
  }

  // Befehl auslesen: bis zum ersten Nullbyte, hoechstens zwoelf Zeichen.
  let ende = COMMAND_SIZE;
  for (let i = 0; i < COMMAND_SIZE; i++) {
    if (puffer[4 + i] === 0) { ende = i; break; }
  }
  let command = '';
  for (let i = 0; i < ende; i++) {
    const c = puffer[4 + i];
    // Nur druckbares ASCII. Alles andere ist kein Befehl, sondern Muell.
    if (c < 0x20 || c > 0x7e) return { t: 'fehler', grund: 'befehl_unlesbar' };
    command += String.fromCharCode(c);
  }
  // Hinter dem ersten Nullbyte darf nur noch Fuellung stehen.
  for (let i = ende; i < COMMAND_SIZE; i++) {
    if (puffer[4 + i] !== 0) return { t: 'fehler', grund: 'befehl_nicht_gefuellt' };
  }
  if (!istBefehl(command)) {
    return { t: 'fehler', grund: `befehl_unbekannt:${command}` };
  }

  const dv = new DataView(puffer.buffer, puffer.byteOffset, puffer.byteLength);
  const laenge = dv.getUint32(16, true);
  if (laenge > MAX_PAYLOAD) {
    // VOR dem Lesen abbrechen. Genau hier wuerde ein Angreifer sonst
    // beliebig viel Speicher binden, indem er eine riesige Laenge angibt
    // und die Daten nie schickt.
    return { t: 'fehler', grund: `zu_gross:${laenge}` };
  }

  const gesamt = HEADER_SIZE + laenge;
  if (puffer.length < gesamt) {
    return { t: 'unvollstaendig', benoetigt: gesamt - puffer.length };
  }

  const payload = puffer.slice(HEADER_SIZE, gesamt);
  const soll = sha256d(payload).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (puffer[20 + i] !== soll[i]) {
      return { t: 'fehler', grund: 'pruefsumme' };
    }
  }

  return { t: 'frame', frame: { command, payload }, verbraucht: gesamt };
}

/**
 * Sammelt ankommende Bytes und gibt fertige Nachrichten heraus.
 *
 * Der Puffer waechst nur, solange eine Nachricht unvollstaendig ist, und
 * ist durch MAX_PAYLOAD nach oben begrenzt -- eine angekuendigte Laenge
 * darueber wird abgewiesen, bevor irgendetwas gepuffert wird.
 */
export class FrameReader {
  private puffer = new Uint8Array(0);
  private readonly magic: Uint8Array;

  constructor(magic: Uint8Array) {
    if (magic.length !== 4) throw new Error('Magic muss vier Byte sein');
    this.magic = magic;
  }

  /** Gepufferte Bytes -- fuer Grenzen und Messungen. */
  size(): number { return this.puffer.length; }

  /**
   * Bytes hinzufuegen und alles herausgeben, was vollstaendig ist.
   *
   * Bei einem Fehler wird abgebrochen: Was danach im Puffer steht, ist
   * nicht mehr einzuordnen.
   */
  push(bytes: Uint8Array): { frames: Frame[]; fehler?: string } {
    const neu = new Uint8Array(this.puffer.length + bytes.length);
    neu.set(this.puffer, 0);
    neu.set(bytes, this.puffer.length);
    this.puffer = neu;

    const frames: Frame[] = [];
    for (;;) {
      const r = decodeFrame(this.puffer, this.magic);
      if (r.t === 'unvollstaendig') break;
      if (r.t === 'fehler') {
        this.puffer = new Uint8Array(0);
        return { frames, fehler: r.grund };
      }
      frames.push(r.frame);
      this.puffer = this.puffer.slice(r.verbraucht);
    }
    return { frames };
  }

  reset(): void { this.puffer = new Uint8Array(0); }
}

/** Fuer Protokollausgaben. */
export const magicText = (m: Uint8Array) => toHex(m);
