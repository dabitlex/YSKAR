/**
 * Eine einzelne Verbindung zu einem Peer.
 *
 * Zustaendig fuer: Handschlag, Lebenszeichen, Rahmung, Grenzen. Was in den
 * Nachrichten steht, entscheidet die Ebene darueber -- diese Datei weiss
 * nichts ueber Bloecke und prueft keine Kette.
 *
 * DER HANDSCHLAG ist von Bitcoin uebernommen und hat einen Zweck, der
 * ueber die Begruessung hinausgeht: Beide Seiten nennen Netz, Chain-ID,
 * Hoehe und kumulierte Arbeit. Passt das Netz nicht, wird sofort getrennt
 * -- ein Knoten des Testnetzes soll mit dem Mainnet gar nicht erst ins
 * Gespraech kommen. Und die Arbeit sagt, wer wem beim Aufholen hilft.
 *
 * NICHT GESPERRT WIRD. Bei Fehlverhalten wird getrennt, mehr nicht.
 * Bitcoin Core hat sich ueber Jahre von Sperren wegbewegt, weil ein
 * Angreifer sich trivial mit anderen Adressen neu verbindet und
 * unbedachtes Sperren das Risiko einer Netzspaltung erhoeht. Die Ebene
 * darueber merkt sich auffaellige Peers und verdraengt sie zuerst -- aber
 * sie sperrt sie nicht aus.
 */
import type { Socket } from 'node:net';
import { randomBytes } from 'node:crypto';

import { FrameReader, encodeFrame, magicFor, type Command, type Frame }
  from './wire.ts';
import {
  PROTOCOL_VERSION, encodeVersion, decodeVersion, encodePing, decodePing,
  type Version,
} from './messages.ts';
import type { ConsensusParams } from '../../core/networks.ts';
import { toHex } from '../../core/codec.ts';

/** Wie lange der Handschlag dauern darf. */
export const HANDSHAKE_TIMEOUT_MS = 10_000;
/** Abstand zwischen Lebenszeichen. */
export const PING_INTERVAL_MS = 60_000;
/** Ohne ein Byte in dieser Zeit gilt die Verbindung als tot. */
export const IDLE_TIMEOUT_MS = 150_000;

export type PeerRichtung = 'aus' | 'ein';

/**
 * Verzeichnis der eigenen Nonces.
 *
 * Jede Verbindung wuerfelt ihre eigene -- eine feste waere ein
 * Wiedererkennungsmerkmal ueber alle Verbindungen hinweg. Damit eine
 * Selbstverbindung trotzdem auffaellt, merkt sich der Knoten, welche
 * Nonces er versendet hat, und prueft eingehende dagegen.
 *
 * Bitcoin macht es genauso, und der Grund ist wichtig: Eine Nonce je
 * Knoten waere einfacher, gaebe aber jedem Peer einen Wert, an dem er den
 * Knoten ueber wechselnde Adressen hinweg wiedererkennt.
 */
export interface NonceBuch {
  merke(n: bigint): void;
  kennt(n: bigint): boolean;
}

export interface PeerInfo {
  id: number;
  richtung: PeerRichtung;
  host: string;
  port: number;
  /** Port, auf dem die Gegenseite selbst lauscht. 0 = nimmt nichts an. */
  listenPort: number;
  agent: string;
  height: number;
  chainWork: bigint;
  seit: number;
  empfangen: number;
  gesendet: number;
}

export interface PeerCallbacks {
  /** Handschlag abgeschlossen -- ab hier fliessen Nachrichten. */
  onReady?: (p: PeerConnection) => void;
  /** Eine Nachricht nach dem Handschlag. */
  onMessage?: (p: PeerConnection, f: Frame) => void;
  /** Verbindung beendet. `grund` nennt, warum. */
  onClose?: (p: PeerConnection, grund: string) => void;
  /**
   * Auffaelliges Verhalten.
   *
   * Die Verbindung ist zu diesem Zeitpunkt bereits getrennt. Die Ebene
   * darueber entscheidet, ob sie sich den Peer merkt -- gesperrt wird er
   * nicht.
   */
  onMisbehave?: (p: PeerConnection, grund: string) => void;
}

let naechsteId = 1;

export class PeerConnection {
  readonly id = naechsteId++;
  readonly richtung: PeerRichtung;
  readonly host: string;
  readonly port: number;

  private sock: Socket;
  private params: ConsensusParams;
  private magic: Uint8Array;
  private leser: FrameReader;
  private cb: PeerCallbacks;

  /** Zufallswert dieser Verbindung. */
  private eigeneNonce: bigint;
  /** Alle Nonces dieses Knotens -- ohne sie faellt keine Selbstverbindung auf. */
  private nonces: NonceBuch | null;
  private eigeneHoehe: () => { height: number; chainWork: bigint };
  private eigenerPort: number;
  private agent: string;

  private versionGesehen = false;
  private verackGesehen = false;
  private versionGesendet = false;
  ready = false;
  private geschlossen = false;

  private fern: Version | null = null;
  private seit = Date.now();
  private empfangen = 0;
  private gesendet = 0;

  private handshakeTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private offenesPing: bigint | null = null;

  constructor(opt: {
    socket: Socket;
    richtung: PeerRichtung;
    params: ConsensusParams;
    agent: string;
    listenPort: number;
    /** Wird bei jedem Handschlag frisch gelesen -- die Kette bewegt sich. */
    eigeneKette: () => { height: number; chainWork: bigint };
    nonce?: bigint;
    /** Ohne Angabe wird nur gegen die eigene Nonce dieser Verbindung geprueft. */
    nonces?: NonceBuch;
    callbacks?: PeerCallbacks;
  }) {
    this.sock = opt.socket;
    this.richtung = opt.richtung;
    this.params = opt.params;
    this.magic = magicFor(opt.params.chainId);
    this.leser = new FrameReader(this.magic);
    this.cb = opt.callbacks ?? {};
    this.agent = opt.agent;
    this.eigenerPort = opt.listenPort;
    this.eigeneHoehe = opt.eigeneKette;
    this.eigeneNonce = opt.nonce ?? zufallsNonce();
    this.nonces = opt.nonces ?? null;
    this.nonces?.merke(this.eigeneNonce);

    this.host = opt.socket.remoteAddress ?? '?';
    this.port = opt.socket.remotePort ?? 0;

    this.sock.on('data', (b: Buffer) => this.aufDaten(b));
    this.sock.on('error', e => this.schliessen(`socket:${e.message}`));
    this.sock.on('close', () => this.schliessen('getrennt'));

    /*
      Der Handschlag hat eine Frist.

      Ohne sie koennte jemand Verbindungen oeffnen und nie etwas schicken --
      die Plaetze waeren belegt, ohne dass ein einziges Byte kommt. Das
      kostet den Angreifer nichts und den Knoten alles.
    */
    this.handshakeTimer = setTimeout(
      () => this.schliessen('handschlag_zeit'), HANDSHAKE_TIMEOUT_MS);
    this.handshakeTimer.unref?.();

    this.wecke();

    // Wer verbindet, gruesst zuerst.
    if (this.richtung === 'aus') this.sendeVersion();
  }

  info(): PeerInfo {
    return {
      id: this.id, richtung: this.richtung, host: this.host, port: this.port,
      listenPort: this.fern?.port ?? 0,
      agent: this.fern?.agent ?? '',
      height: this.fern?.height ?? 0,
      chainWork: this.fern ? BigInt(this.fern.chainWork) : 0n,
      seit: this.seit, empfangen: this.empfangen, gesendet: this.gesendet,
    };
  }

  /** Kumulierte Arbeit der Gegenseite -- entscheidet, wer aufholt. */
  fremdeArbeit(): bigint { return this.fern ? BigInt(this.fern.chainWork) : 0n; }
  fremdeHoehe(): number { return this.fern?.height ?? 0; }
  nonce(): bigint { return this.eigeneNonce; }

  send(command: Command, payload: Uint8Array): boolean {
    if (this.geschlossen) return false;
    try {
      const roh = encodeFrame(this.magic, command, payload);
      this.sock.write(roh);
      this.gesendet += roh.length;
      return true;
    } catch (e) {
      this.schliessen(`senden:${(e as Error).message}`);
      return false;
    }
  }

  close(grund = 'lokal'): void { this.schliessen(grund); }

  // ------------------------------------------------------------- Innereien

  private aufDaten(b: Buffer): void {
    if (this.geschlossen) return;
    this.empfangen += b.length;
    this.wecke();

    const { frames, fehler } = this.leser.push(new Uint8Array(b));
    for (const f of frames) {
      if (this.geschlossen) return;
      this.behandle(f);
    }
    if (fehler) this.auffaellig(`rahmen:${fehler}`);
  }

  private behandle(f: Frame): void {
    /*
      Vor dem Handschlag ist nur version erlaubt.

      Sonst koennte ein Peer sofort Bloecke schicken -- ungeprueft, ohne
      dass feststeht, ob er ueberhaupt zum selben Netz gehoert. Die
      Reihenfolge ist Teil des Schutzes.
    */
    if (!this.versionGesehen && f.command !== 'version') {
      return this.auffaellig(`vor_handschlag:${f.command}`);
    }

    switch (f.command) {
      case 'version': return this.aufVersion(f.payload);
      case 'verack':  return this.aufVerack();
      case 'ping':    return this.aufPing(f.payload);
      case 'pong':    return this.aufPong(f.payload);
      default:
        if (!this.ready) return this.auffaellig(`vor_verack:${f.command}`);
        this.cb.onMessage?.(this, f);
    }
  }

  private sendeVersion(): void {
    if (this.versionGesendet) return;
    this.versionGesendet = true;
    const k = this.eigeneHoehe();
    this.send('version', encodeVersion({
      protocol: PROTOCOL_VERSION,
      network: this.params.network,
      chainId: this.params.chainId,
      agent: this.agent,
      height: Math.max(0, k.height),
      chainWork: k.chainWork.toString(),
      nonce: this.eigeneNonce,
      port: this.eigenerPort,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    }));
  }

  private aufVersion(payload: Uint8Array): void {
    if (this.versionGesehen) return this.auffaellig('version_doppelt');

    let v: Version;
    try { v = decodeVersion(payload); }
    catch (e) { return this.auffaellig(`version_unlesbar:${(e as Error).message}`); }

    /*
      Drei Pruefungen, und jede trennt sofort.

      NETZ und CHAIN-ID: Ein Knoten eines anderen Netzes hat hier nichts
      verloren. Die Magic-Bytes decken nur die ersten vier Byte ab -- die
      vollstaendige Chain-ID schliesst aus, dass zwei Netze mit zufaellig
      gleichem Anfang zusammenfinden.

      EIGENE NONCE: Dann reden wir mit uns selbst. Das passiert leicht,
      wenn die eigene Adresse ueber addr zurueckkommt, und waere sonst eine
      Verbindung, die ewig haelt und nichts bringt.
    */
    if (v.network !== this.params.network) {
      return this.schliessen(`fremdes_netz:${v.network}`);
    }
    if (toHex(v.chainId) !== toHex(this.params.chainId)) {
      return this.schliessen('fremde_chain_id');
    }
    /*
      Die eigene Nonce kommt zurueck -- wir reden mit uns selbst.

      Geprueft wird gegen ALLE Nonces dieses Knotens, nicht nur gegen die
      dieser Verbindung. Bei einer Selbstverbindung sind es zwei
      verschiedene Verbindungen mit zwei verschiedenen Nonces; wer nur die
      eigene prueft, merkt nie etwas.
    */
    if (v.nonce === this.eigeneNonce || this.nonces?.kennt(v.nonce)) {
      /*
        Vor dem Trennen noch antworten -- aber nur in diesem einen Fall.

        Sonst erfaehrt die andere Seite nichts: Sie hat die Verbindung
        aufgebaut und kennt als Einzige den Zielport, also die Adresse, die
        aus dem Buch gehoert. Sie sieht ohne Antwort nur einen geschlossenen
        Socket und weiss nicht, warum.

        Bei einem fremden Netz wird NICHT geantwortet -- dort waere jede
        Antwort eine Auskunft an jemanden, der hier nichts verloren hat.
      */
      if (this.richtung === 'ein') this.sendeVersion();
      return this.schliessen('selbstverbindung');
    }
    if (v.protocol !== PROTOCOL_VERSION) {
      // Spaeter koennte man hier abwaerts vertraeglich sein. Solange es nur
      // eine Fassung gibt, waere das geraten.
      return this.schliessen(`protokoll:${v.protocol}`);
    }

    this.fern = v;
    this.versionGesehen = true;

    // Wer angenommen hat, gruesst jetzt zurueck.
    if (this.richtung === 'ein') this.sendeVersion();
    this.send('verack', new Uint8Array(0));
    this.pruefeFertig();
  }

  private aufVerack(): void {
    if (this.verackGesehen) return this.auffaellig('verack_doppelt');
    this.verackGesehen = true;
    this.pruefeFertig();
  }

  private pruefeFertig(): void {
    if (this.ready || !this.versionGesehen || !this.verackGesehen) return;
    this.ready = true;
    if (this.handshakeTimer) { clearTimeout(this.handshakeTimer); this.handshakeTimer = null; }

    // Lebenszeichen erst ab jetzt -- vorher gibt es nichts zu erhalten.
    this.pingTimer = setInterval(() => this.sendePing(), PING_INTERVAL_MS);
    this.pingTimer.unref?.();

    this.cb.onReady?.(this);
  }

  private sendePing(): void {
    if (!this.ready || this.geschlossen) return;
    /*
      Ein offenes ping und schon kommt das naechste: Die Gegenseite
      antwortet nicht mehr. Eine Verbindung, die nur noch Bytes
      entgegennimmt, ist schlimmer als keine -- sie belegt einen Platz und
      liefert nichts.
    */
    if (this.offenesPing !== null) {
      return this.schliessen('keine_antwort');
    }
    this.offenesPing = zufallsNonce();
    this.send('ping', encodePing(this.offenesPing));
  }

  private aufPing(payload: Uint8Array): void {
    try { this.send('pong', encodePing(decodePing(payload))); }
    catch { this.auffaellig('ping_unlesbar'); }
  }

  private aufPong(payload: Uint8Array): void {
    let n: bigint;
    try { n = decodePing(payload); }
    catch { return this.auffaellig('pong_unlesbar'); }

    // Ein pong auf ein ping, das nie gestellt wurde. Entweder Unfug oder
    // ein Versuch, eine tote Verbindung lebendig aussehen zu lassen.
    if (this.offenesPing === null) return this.auffaellig('pong_unerwartet');
    if (n !== this.offenesPing) return this.auffaellig('pong_falsch');
    this.offenesPing = null;
  }

  /**
   * Der Ruhe-Wecker.
   *
   * Bei jedem empfangenen Byte neu gestellt. Laeuft er ab, kam lange
   * nichts -- auch kein pong, denn das haette ihn ebenfalls gestellt.
   */
  private wecke(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.schliessen('still'), IDLE_TIMEOUT_MS);
    this.idleTimer.unref?.();
  }

  private auffaellig(grund: string): void {
    this.schliessen(`auffaellig:${grund}`);
    this.cb.onMisbehave?.(this, grund);
  }

  private schliessen(grund: string): void {
    if (this.geschlossen) return;
    this.geschlossen = true;
    this.ready = false;

    for (const t of [this.handshakeTimer, this.idleTimer]) if (t) clearTimeout(t);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.handshakeTimer = this.idleTimer = this.pingTimer = null;

    try { this.sock.destroy(); } catch { /* schon zu */ }
    this.leser.reset();
    this.cb.onClose?.(this, grund);
  }
}

function zufallsNonce(): bigint {
  const b = randomBytes(8);
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}
