/**
 * Die Nachrichten des YSKAR-P2P-Protokolls.
 *
 * Aufgebaut nach Bitcoins Vorbild, aber auf YSKAR zugeschnitten. Was
 * uebernommen wurde und was nicht, steht bei jeder Nachricht dabei.
 *
 * EINE REGEL UEBER ALLEM: Keine Nachricht traegt eine Aussage ueber
 * Gueltigkeit. Ein Peer liefert Daten; ob sie gelten, entscheidet der
 * eigene Knoten. Deshalb gibt es hier kein Feld "valid", kein "accepted"
 * und keine Fehlermeldung ueber fremde Bloecke -- solche Felder wuerden
 * dazu verleiten, ihnen zu glauben.
 *
 * ALLES MIT GRENZEN. Jede Liste hat eine Hoechstzahl, jede Zeichenkette
 * eine Hoechstlaenge. Ohne sie kann ein Peer den Empfaenger mit einer
 * einzigen Nachricht beschaeftigen -- und die Rahmung allein reicht dafuer
 * nicht, weil zwei Megabyte viele kleine Eintraege sind.
 */
import { Writer, Reader, toHex } from '../../core/codec.ts';

/** Fassung des Protokolls. Aendert sich das Format, steigt sie. */
export const PROTOCOL_VERSION = 1;

/** Hoechstzahl Eintraege je Liste. */
export const MAX_INV = 500;
export const MAX_HEADERS = 2000;
export const MAX_ADDR = 500;
export const MAX_LOCATOR = 32;
/** Hoechstlaenge der Programmkennung. */
export const MAX_AGENT = 64;

// ------------------------------------------------------------ Handschlag

export interface Version {
  protocol: number;
  /** Netzname, z.B. yskar-main-1. Zusaetzlich zu den Magic-Bytes. */
  network: string;
  /** Vollstaendige Chain-ID -- Magic sind nur die ersten vier Byte. */
  chainId: Uint8Array;
  /** Programm und Fassung, z.B. "yskar-node/0.1.0". Nur zur Anzeige. */
  agent: string;
  height: number;
  /** Kumulierte Arbeit als Dezimaltext. Entscheidet, wer aufholt. */
  chainWork: string;
  /** Zufallswert je Verbindung -- erkennt die Verbindung zu sich selbst. */
  nonce: bigint;
  /** Port, auf dem dieser Knoten selbst lauscht. 0 = nimmt nichts an. */
  port: number;
  timestamp: bigint;
}

export function encodeVersion(v: Version): Uint8Array {
  if (v.agent.length > MAX_AGENT) throw new Error('Kennung zu lang');
  const netz = new TextEncoder().encode(v.network);
  const agent = new TextEncoder().encode(v.agent);
  const work = new TextEncoder().encode(v.chainWork);
  if (netz.length > 32) throw new Error('Netzname zu lang');
  if (work.length > 96) throw new Error('Chain Work zu lang');

  return new Writer()
    .u32(v.protocol)
    .u8(netz.length).bytes(netz)
    .bytes(v.chainId, 32)
    .u8(agent.length).bytes(agent)
    .u32(v.height)
    .u8(work.length).bytes(work)
    .u64(v.nonce)
    .u32(v.port)
    .u64(v.timestamp)
    .finish();
}

export function decodeVersion(b: Uint8Array): Version {
  const r = new Reader(b);
  const protocol = r.u32();
  const network = new TextDecoder().decode(r.bytes(r.u8()));
  const chainId = r.bytes(32);
  const agentLen = r.u8();
  if (agentLen > MAX_AGENT) throw new Error('Kennung zu lang');
  const agent = new TextDecoder().decode(r.bytes(agentLen));
  const height = r.u32();
  const workLen = r.u8();
  if (workLen > 96) throw new Error('Chain Work zu lang');
  const chainWork = new TextDecoder().decode(r.bytes(workLen));
  // Nur Ziffern -- sonst landet fremder Text in einem BigInt-Aufruf.
  if (!/^\d+$/.test(chainWork)) throw new Error('Chain Work ist keine Zahl');
  const nonce = r.u64();
  const port = r.u32();
  const timestamp = r.u64();
  return { protocol, network, chainId, agent, height, chainWork, nonce, port, timestamp };
}

// --------------------------------------------------------- Lebenszeichen

/**
 * ping traegt einen Zufallswert, pong gibt ihn zurueck.
 *
 * Ohne den Wert liesse sich nicht unterscheiden, auf welches ping ein pong
 * antwortet -- und ein Peer koennte auf Vorrat pongs schicken, um eine tote
 * Verbindung lebendig aussehen zu lassen.
 */
export const encodePing = (nonce: bigint) => new Writer().u64(nonce).finish();
export const decodePing = (b: Uint8Array) => new Reader(b).u64();

// ------------------------------------------------------- Kettenabgleich

/**
 * getheaders -- "wo stehe ich, und was kommt danach?"
 *
 * Der Locator ist Bitcoins Kniff und uebernommen: eine Liste eigener
 * Blockhashes, dicht am Kopf und mit wachsendem Abstand nach hinten. Die
 * Gegenseite sucht den ersten, den sie kennt, und antwortet ab dort.
 *
 * Nur die Hoehe zu senden waere einfacher und falsch: Nach einem Fork
 * haben beide Seiten dieselbe Hoehe mit verschiedenen Bloecken. Der
 * Locator findet den gemeinsamen Vorfahren in wenigen Schritten, statt die
 * Kette Block fuer Block rueckwaerts abzusuchen.
 */
export interface GetHeaders {
  locator: Uint8Array[];
  /** Bis wohin. Nullbytes heisst: so weit wie moeglich. */
  stop: Uint8Array;
}

export function encodeGetHeaders(g: GetHeaders): Uint8Array {
  if (g.locator.length > MAX_LOCATOR) throw new Error('Locator zu lang');
  const w = new Writer().u8(g.locator.length);
  for (const h of g.locator) w.bytes(h, 32);
  return w.bytes(g.stop, 32).finish();
}

export function decodeGetHeaders(b: Uint8Array): GetHeaders {
  const r = new Reader(b);
  const n = r.u8();
  if (n > MAX_LOCATOR) throw new Error('Locator zu lang');
  const locator: Uint8Array[] = [];
  for (let i = 0; i < n; i++) locator.push(r.bytes(32));
  return { locator, stop: r.bytes(32) };
}

/**
 * headers -- rohe Blockheader, 136 Byte je Stueck.
 *
 * Header zuerst, Koerper spaeter. Bei 2.000 Headern sind das 272 KB;
 * dieselben Bloecke waeren bis zu 800 MB. Erst wenn feststeht, welcher
 * Zweig mehr Arbeit hat, werden die Koerper geholt -- sonst laedt man
 * Bloecke herunter, die man gleich wieder verwirft.
 */
export function encodeHeaders(header: Uint8Array[]): Uint8Array {
  if (header.length > MAX_HEADERS) throw new Error('Zu viele Header');
  const w = new Writer().u16(header.length);
  for (const h of header) {
    if (h.length !== 136) throw new Error(`Header hat ${h.length} statt 136 Byte`);
    w.bytes(h, 136);
  }
  return w.finish();
}

export function decodeHeaders(b: Uint8Array): Uint8Array[] {
  const r = new Reader(b);
  const n = r.u16();
  if (n > MAX_HEADERS) throw new Error('Zu viele Header');
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i++) out.push(r.bytes(136));
  return out;
}

// ------------------------------------------------------------ Ankuendigung

export const INV_BLOCK = 1;
export const INV_TX = 2;

export interface InvEintrag { typ: number; hash: Uint8Array }

/**
 * inv -- "ich habe das hier".
 *
 * Angekuendigt wird nur der Hash. Wer die Sache noch nicht hat, fragt mit
 * getdata nach. So wird ein Block nicht an alle geschickt, die ihn laengst
 * kennen.
 */
export function encodeInv(eintraege: InvEintrag[]): Uint8Array {
  if (eintraege.length > MAX_INV) throw new Error('Zu viele Eintraege');
  const w = new Writer().u16(eintraege.length);
  for (const e of eintraege) w.u8(e.typ).bytes(e.hash, 32);
  return w.finish();
}

export function decodeInv(b: Uint8Array): InvEintrag[] {
  const r = new Reader(b);
  const n = r.u16();
  if (n > MAX_INV) throw new Error('Zu viele Eintraege');
  const out: InvEintrag[] = [];
  for (let i = 0; i < n; i++) {
    const typ = r.u8();
    const hash = r.bytes(32);
    if (typ !== INV_BLOCK && typ !== INV_TX) throw new Error(`Unbekannter Typ ${typ}`);
    out.push({ typ, hash });
  }
  return out;
}

/** getdata -- dieselbe Form wie inv: "davon haette ich gern die Daten". */
export const encodeGetData = encodeInv;
export const decodeGetData = decodeInv;

/** notfound -- "kenne ich nicht". Ohne das wartet der Frager ins Leere. */
export const encodeNotFound = encodeInv;
export const decodeNotFound = decodeInv;

// ----------------------------------------------------------------- Peers

export interface PeerAdresse {
  host: string;
  port: number;
  /** Wann zuletzt gesehen, in Sekunden. Alte werden nicht weitergegeben. */
  gesehen: bigint;
}

/**
 * addr -- bekannte Peers weitergeben.
 *
 * Host als Text statt als Bytes: Das deckt IPv4, IPv6 und Namen mit
 * derselben Form ab. Bitcoin hat dafuer drei Formate gebraucht und mit
 * BIP155 ein viertes nachgeliefert; bei den Groessenordnungen hier waere
 * das Sparen an der falschen Stelle.
 */
export function encodeAddr(liste: PeerAdresse[]): Uint8Array {
  if (liste.length > MAX_ADDR) throw new Error('Zu viele Adressen');
  const w = new Writer().u16(liste.length);
  for (const a of liste) {
    const h = new TextEncoder().encode(a.host);
    if (h.length > 255) throw new Error('Hostname zu lang');
    w.u8(h.length).bytes(h).u32(a.port).u64(a.gesehen);
  }
  return w.finish();
}

export function decodeAddr(b: Uint8Array): PeerAdresse[] {
  const r = new Reader(b);
  const n = r.u16();
  if (n > MAX_ADDR) throw new Error('Zu viele Adressen');
  const out: PeerAdresse[] = [];
  for (let i = 0; i < n; i++) {
    const host = new TextDecoder().decode(r.bytes(r.u8()));
    const port = r.u32();
    const gesehen = r.u64();
    if (port === 0 || port > 65535) throw new Error(`Ungueltiger Port ${port}`);
    out.push({ host, port, gesehen });
  }
  return out;
}

/** Zwei Adressen vergleichen -- fuer Mengen und Dubletten. */
export const peerKey = (a: { host: string; port: number }) =>
  `${a.host.toLowerCase()}:${a.port}`;

/** Fuer Protokollausgaben. */
export const hashText = (h: Uint8Array) => toHex(h).slice(0, 16) + '…';
