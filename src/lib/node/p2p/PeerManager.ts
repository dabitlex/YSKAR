/**
 * Peer-Verwaltung.
 *
 * Haelt die Verbindungen, sucht neue, nimmt eingehende an und entscheidet,
 * wer gehen muss, wenn es eng wird. Von Bloecken weiss auch diese Ebene
 * nichts -- sie reicht Nachrichten nach oben durch.
 *
 * PLAETZE SIND DER EIGENTLICHE SCHUTZ, nicht Sperren. Wer sich schlecht
 * benimmt, wird getrennt und beim naechsten Gedraenge zuerst verdraengt --
 * aber nicht ausgesperrt. Bitcoin Core hat sich ueber Jahre von Sperren
 * wegbewegt, und die Begruendung gilt hier genauso: Ein Angreifer verbindet
 * sich trivial mit anderen Adressen neu, und unbedachtes Sperren erhoeht
 * das Risiko einer Netzspaltung, ohne den Angriff zu verhindern.
 *
 * AUSGEHEND UND EINGEHEND werden getrennt gezaehlt, und das ist wichtig:
 * Wer nur eingehende Verbindungen haette, koennte von einem Angreifer
 * vollstaendig umstellt werden -- alle Plaetze belegt, kein Kontakt zum
 * echten Netz. Ausgehende Verbindungen sucht der Knoten selbst aus.
 */
import { createServer, connect, type Server, type Socket } from 'node:net';

import { PeerConnection, type PeerInfo, type NonceBuch } from './PeerConnection.ts';
import {
  encodeAddr, decodeAddr, encodeInv, peerKey, MAX_ADDR,
  type PeerAdresse,
} from './messages.ts';
import type { Command, Frame } from './wire.ts';
import type { ConsensusParams } from '../../core/networks.ts';

/** Ausgehende Verbindungen -- selbst ausgesucht. */
export const MAX_AUS = 8;
/** Eingehende -- fremd bestimmt, deshalb getrennt begrenzt. */
export const MAX_EIN = 32;
/** Wie viele Adressen im Buch stehen duerfen. */
export const MAX_BUCH = 1000;
/** Abstand zwischen Versuchen, ausgehende Plaetze zu fuellen. */
export const VERBINDE_INTERVALL_MS = 15_000;
/** Wie lange ein Verbindungsversuch dauern darf. */
export const VERBINDE_TIMEOUT_MS = 8_000;
/**
 * Wie lange ein auffaelliger Peer vermerkt bleibt.
 *
 * Nicht gespeichert und nicht dauerhaft -- nach einem Neustart ist der
 * Vermerk weg. Genau wie bei Bitcoin, und aus demselben Grund: Er soll
 * Gedraenge ordnen, nicht jemanden aussperren.
 */
export const VERMERK_MS = 60 * 60 * 1000;

interface BuchEintrag {
  host: string;
  port: number;
  gesehen: number;
  /** Fehlversuche in Folge. Steigt der Wert, wird seltener probiert. */
  fehlversuche: number;
  zuletztVersucht: number;
}

export interface NetzOptionen {
  params: ConsensusParams;
  agent: string;
  /** Port zum Lauschen. 0 heisst: nur ausgehend. */
  listenPort?: number;
  host?: string;
  seeds?: { host: string; port: number }[];
  maxAus?: number;
  maxEin?: number;
  /** Aktuelle Kette -- bei jedem Handschlag frisch gelesen. */
  kette: () => { height: number; chainWork: bigint };
  onMessage?: (p: PeerConnection, f: Frame) => void;
  onReady?: (p: PeerConnection) => void;
  onClose?: (p: PeerConnection, grund: string) => void;
  onLog?: (text: string) => void;
}

export class PeerManager {
  private opt: NetzOptionen;
  private server: Server | null = null;
  private peers = new Map<number, PeerConnection>();
  private buch = new Map<string, BuchEintrag>();
  /** Auffaellige Peers: Schluessel -> bis wann vermerkt. */
  private vermerkt = new Map<string, number>();
  /** Laufende Verbindungsversuche -- verhindert doppelte. */
  private imAufbau = new Set<string>();
  /**
   * Als eigene Adresse erkannt.
   *
   * Ein Knoten bekommt seine eigene Adresse regelmaessig ueber addr
   * zurueck -- ein Peer gibt weiter, wen er kennt, und das sind wir. Ohne
   * dieses Verzeichnis versucht der Knoten immer wieder, sich mit sich
   * selbst zu verbinden: Der Handschlag erkennt es an der Nonce und
   * trennt, aber jeder Versuch belegt kurz einen ausgehenden Platz.
   *
   * Die eigene aeussere Adresse laesst sich nicht zuverlaessig feststellen
   * -- deshalb wird sie nicht geraten, sondern gelernt.
   */
  private selbst = new Set<string>();
  private takt: NodeJS.Timeout | null = null;
  private laeuft = false;

  /**
   * Versandte Nonces.
   *
   * Begrenzt, damit die Menge nicht endlos waechst -- aeltere fallen
   * heraus. Das schadet nicht: Eine Selbstverbindung faellt beim
   * Handschlag auf, und der liegt Sekunden nach dem Versenden.
   */
  private nonceBuch: NonceBuch = (() => {
    const gesehen: bigint[] = [];
    const menge = new Set<bigint>();
    return {
      merke(n: bigint) {
        if (menge.has(n)) return;
        menge.add(n); gesehen.push(n);
        while (gesehen.length > 256) {
          const alt = gesehen.shift();
          if (alt !== undefined) menge.delete(alt);
        }
      },
      kennt: (n: bigint) => menge.has(n),
    };
  })();

  constructor(opt: NetzOptionen) {
    this.opt = opt;
    for (const s of opt.seeds ?? []) this.merke(s.host, s.port);
  }

  private get maxAus() { return this.opt.maxAus ?? MAX_AUS; }
  private get maxEin() { return this.opt.maxEin ?? MAX_EIN; }
  private log(t: string) { this.opt.onLog?.(t); }

  async start(): Promise<void> {
    if (this.laeuft) return;
    this.laeuft = true;

    if (this.opt.listenPort && this.opt.listenPort > 0) {
      await this.lausche(this.opt.listenPort, this.opt.host ?? '0.0.0.0');
    }

    this.fuelleAus();
    this.takt = setInterval(() => this.fuelleAus(), VERBINDE_INTERVALL_MS);
    this.takt.unref?.();
  }

  async stop(): Promise<void> {
    this.laeuft = false;
    if (this.takt) { clearInterval(this.takt); this.takt = null; }
    for (const p of [...this.peers.values()]) p.close('herunterfahren');
    this.peers.clear();
    if (this.server) {
      await new Promise<void>(auf => this.server!.close(() => auf()));
      this.server = null;
    }
  }

  // ---------------------------------------------------------------- Stand

  alle(): PeerConnection[] { return [...this.peers.values()]; }
  bereite(): PeerConnection[] { return this.alle().filter(p => p.ready); }
  zahlAus(): number { return this.alle().filter(p => p.richtung === 'aus').length; }
  zahlEin(): number { return this.alle().filter(p => p.richtung === 'ein').length; }
  buchGroesse(): number { return this.buch.size; }

  info(): PeerInfo[] { return this.bereite().map(p => p.info()); }

  /** Der Peer mit der meisten Arbeit -- von dem lohnt sich das Aufholen. */
  besterPeer(): PeerConnection | null {
    let best: PeerConnection | null = null;
    for (const p of this.bereite()) {
      if (!best || p.fremdeArbeit() > best.fremdeArbeit()) best = p;
    }
    return best;
  }

  /** An alle senden. Mit `ausser` laesst sich der Absender auslassen. */
  sendeAllen(command: Command, payload: Uint8Array, ausser?: PeerConnection): number {
    let n = 0;
    for (const p of this.bereite()) {
      if (p === ausser) continue;
      if (p.send(command, payload)) n++;
    }
    return n;
  }

  /** Einen Block oder eine Transaktion ankuendigen. */
  kuendigeAn(typ: number, hash: Uint8Array, ausser?: PeerConnection): number {
    return this.sendeAllen('inv', encodeInv([{ typ, hash }]), ausser);
  }

  // ------------------------------------------------------------ Eingehend

  private lausche(port: number, host: string): Promise<void> {
    return new Promise((auf, ab) => {
      const srv = createServer(sock => this.nimmAn(sock));
      srv.on('error', ab);
      srv.listen(port, host, () => {
        this.server = srv;
        this.log(`lauscht auf ${host}:${port}`);
        auf();
      });
    });
  }

  private nimmAn(sock: Socket): void {
    if (!this.laeuft) { sock.destroy(); return; }

    /*
      Sind die eingehenden Plaetze voll, wird EIN Platz freigemacht -- und
      zwar bei einem auffaelligen Peer, wenn es einen gibt.

      Gaebe es keine Verdraengung, koennte ein Angreifer alle Plaetze
      belegen und danach niemanden mehr hereinlassen. Gaebe es sie ohne
      Auswahl, traefe sie zufaellig auch Ehrliche.
    */
    if (this.zahlEin() >= this.maxEin) {
      const opfer = this.verdraengungsopfer();
      if (!opfer) { sock.destroy(); return; }
      opfer.close('verdraengt');
    }

    this.nimmVerbindung(sock, 'ein');
  }

  /**
   * Wen verdraengen?
   *
   * Zuerst einen vermerkten Peer. Gibt es keinen, den mit der laengsten
   * Verbindung ohne abgeschlossenen Handschlag -- der belegt einen Platz,
   * ohne etwas beizutragen. Sonst niemanden.
   */
  private verdraengungsopfer(): PeerConnection | null {
    const ein = this.alle().filter(p => p.richtung === 'ein');
    const vermerkt = ein.find(p => this.istVermerkt(p.host));
    if (vermerkt) return vermerkt;

    const unfertig = ein.filter(p => !p.ready)
      .sort((a, b) => a.info().seit - b.info().seit);
    return unfertig[0] ?? null;
  }

  // ------------------------------------------------------------ Ausgehend

  /**
   * Ausgehende Plaetze auffuellen.
   *
   * Nur EIN Versuch je Takt: Ein Schwall gleichzeitiger Verbindungen
   * wuerde den eigenen Knoten belasten und faellt bei der Gegenseite als
   * Muster auf.
   */
  private fuelleAus(): void {
    if (!this.laeuft) return;
    if (this.zahlAus() + this.imAufbau.size >= this.maxAus) return;

    const ziel = this.naechstesZiel();
    if (!ziel) return;
    this.verbinde(ziel.host, ziel.port);
  }

  private naechstesZiel(): BuchEintrag | null {
    const jetzt = Date.now();
    const verbunden = new Set(this.alle().map(p => peerKey({
      host: p.host, port: p.info().listenPort || p.port,
    })));

    const kandidaten = [...this.buch.values()].filter(e => {
      const k = peerKey(e);
      if (verbunden.has(k) || this.imAufbau.has(k)) return false;
      // Nach Fehlversuchen warten, und zwar laenger mit jedem weiteren.
      // Ohne das haemmert der Knoten gegen eine tote Adresse.
      const wartezeit = Math.min(2 ** e.fehlversuche, 64) * 30_000;
      return jetzt - e.zuletztVersucht >= wartezeit;
    });
    if (kandidaten.length === 0) return null;

    // Wenige Fehlversuche zuerst, danach die zuletzt Gesehenen.
    kandidaten.sort((a, b) =>
      a.fehlversuche !== b.fehlversuche
        ? a.fehlversuche - b.fehlversuche
        : b.gesehen - a.gesehen);
    return kandidaten[0];
  }

  /** Von aussen anstossbar -- fuer eine feste Adresse. */
  verbinde(host: string, port: number): void {
    const k = peerKey({ host, port });
    if (this.imAufbau.has(k)) return;
    this.imAufbau.add(k);

    const eintrag = this.buch.get(k);
    if (eintrag) eintrag.zuletztVersucht = Date.now();

    const sock = connect({ host, port });
    sock.setTimeout(VERBINDE_TIMEOUT_MS);

    const scheitern = (grund: string) => {
      this.imAufbau.delete(k);
      const e = this.buch.get(k);
      if (e) e.fehlversuche++;
      try { sock.destroy(); } catch { /* egal */ }
      this.log(`${k} nicht erreichbar: ${grund}`);
    };

    sock.once('error', e => scheitern(e.message));
    sock.once('timeout', () => scheitern('Zeit abgelaufen'));
    sock.once('connect', () => {
      sock.setTimeout(0);
      sock.removeAllListeners('timeout');
      this.imAufbau.delete(k);
      const e = this.buch.get(k);
      if (e) { e.fehlversuche = 0; e.gesehen = Date.now(); }
      this.nimmVerbindung(sock, 'aus', port);
    });
  }

  // ------------------------------------------------------------- Gemeinsam

  private nimmVerbindung(sock: Socket, richtung: 'aus' | 'ein', zielPort = 0): void {
    const p = new PeerConnection({
      socket: sock,
      richtung,
      params: this.opt.params,
      agent: this.opt.agent,
      listenPort: this.opt.listenPort ?? 0,
      eigeneKette: this.opt.kette,
      nonces: this.nonceBuch,
      callbacks: {
        onReady: peer => this.aufBereit(peer, zielPort),
        onMessage: (peer, f) => this.aufNachricht(peer, f),
        onClose: (peer, grund) => {
          this.peers.delete(peer.id);
          if (grund.includes('selbstverbindung') && zielPort > 0) {
            const k = peerKey({ host: peer.host, port: zielPort });
            this.selbst.add(k);
            this.buch.delete(k);
            this.log(`${k} ist die eigene Adresse -- aus dem Buch genommen`);
          }
          this.opt.onClose?.(peer, grund);
        },
        onMisbehave: (peer, grund) => {
          this.vermerke(peer.host);
          this.log(`${peer.host} auffaellig: ${grund}`);
        },
      },
    });
    this.peers.set(p.id, p);
  }

  private aufBereit(p: PeerConnection, zielPort: number): void {
    const port = p.info().listenPort || zielPort;
    if (port > 0) this.merke(p.host, port);

    // Nach Peers fragen. Ohne das bleibt der Knoten bei seinen Seeds.
    p.send('getaddr', new Uint8Array(0));
    this.opt.onReady?.(p);
  }

  private aufNachricht(p: PeerConnection, f: Frame): void {
    // getaddr und addr werden hier beantwortet -- sie betreffen das Netz,
    // nicht die Kette. Alles andere geht nach oben.
    if (f.command === 'getaddr') return this.aufGetAddr(p);
    if (f.command === 'addr') return this.aufAddr(p, f.payload);
    this.opt.onMessage?.(p, f);
  }

  private aufGetAddr(p: PeerConnection): void {
    const jetzt = Date.now();
    const liste: PeerAdresse[] = [...this.buch.values()]
      // Nur weitergeben, was in den letzten drei Stunden gesehen wurde.
      // Alte Adressen zu verbreiten schickt andere in dieselbe Sackgasse.
      .filter(e => jetzt - e.gesehen < 3 * 60 * 60 * 1000 && e.fehlversuche === 0)
      .sort((a, b) => b.gesehen - a.gesehen)
      .slice(0, MAX_ADDR)
      .map(e => ({ host: e.host, port: e.port, gesehen: BigInt(Math.floor(e.gesehen / 1000)) }));

    if (liste.length > 0) p.send('addr', encodeAddr(liste));
  }

  private aufAddr(p: PeerConnection, payload: Uint8Array): void {
    let liste: PeerAdresse[];
    try { liste = decodeAddr(payload); }
    catch (e) {
      p.close(`addr_unlesbar:${(e as Error).message}`);
      this.vermerke(p.host);
      return;
    }

    const jetzt = Date.now();
    for (const a of liste) {
      /*
        Adressen aus der Zukunft und aus grauer Vorzeit werden verworfen.

        Der Zeitstempel kommt von einem Fremden. Wer ihn weit in die Zukunft
        setzt, waere in jeder Sortierung ganz oben -- und koennte damit
        echte Peers aus dem Buch draengen.
      */
      const gesehen = Number(a.gesehen) * 1000;
      if (gesehen > jetzt + 10 * 60 * 1000) continue;
      if (jetzt - gesehen > 7 * 24 * 60 * 60 * 1000) continue;
      if (!plausiblerHost(a.host)) continue;
      this.merke(a.host, a.port, gesehen);
    }
  }

  // -------------------------------------------------------------- Adressbuch

  private merke(host: string, port: number, gesehen = Date.now()): void {
    if (port <= 0 || port > 65535) return;
    const k = peerKey({ host, port });
    // Die eigene Adresse gehoert nicht ins Buch -- weder aus einem addr
    // noch aus einem Seed.
    if (this.selbst.has(k)) return;
    const vorhanden = this.buch.get(k);
    if (vorhanden) {
      if (gesehen > vorhanden.gesehen) vorhanden.gesehen = gesehen;
      return;
    }

    /*
      Ist das Buch voll, weicht der aelteste Eintrag -- aber nur, wenn der
      neue juenger ist.

      Ohne diese Bedingung koennte ein Peer mit einem Schwall alter
      Adressen das ganze Buch austauschen und den Knoten von seinen echten
      Kontakten abschneiden.
    */
    if (this.buch.size >= MAX_BUCH) {
      let aeltester: [string, BuchEintrag] | null = null;
      for (const e of this.buch) {
        if (!aeltester || e[1].gesehen < aeltester[1].gesehen) aeltester = e;
      }
      if (!aeltester || aeltester[1].gesehen >= gesehen) return;
      this.buch.delete(aeltester[0]);
    }

    this.buch.set(k, { host, port, gesehen, fehlversuche: 0, zuletztVersucht: 0 });
  }

  private vermerke(host: string): void {
    this.vermerkt.set(host, Date.now() + VERMERK_MS);
  }

  private istVermerkt(host: string): boolean {
    const bis = this.vermerkt.get(host);
    if (bis === undefined) return false;
    if (Date.now() > bis) { this.vermerkt.delete(host); return false; }
    return true;
  }

  /** Adressen im Buch -- fuer Anzeige und Tests. */
  buchSchluessel(): string[] { return [...this.buch.keys()]; }

  /** Als eigene erkannte Adressen. */
  eigeneAdressen(): string[] { return [...this.selbst]; }

  /** Nur fuer Anzeige und Tests. */
  vermerkteAnzahl(): number {
    for (const [h, bis] of [...this.vermerkt]) {
      if (Date.now() > bis) this.vermerkt.delete(h);
    }
    return this.vermerkt.size;
  }
}

/**
 * Sieht der Host ueberhaupt nach einem Host aus?
 *
 * Keine Namensaufloesung, keine Gueltigkeitspruefung -- nur ein grober
 * Filter gegen Unfug, bevor etwas ins Buch kommt. Ob dahinter wirklich ein
 * Knoten steht, zeigt der Verbindungsversuch.
 */
function plausiblerHost(h: string): boolean {
  if (h.length === 0 || h.length > 255) return false;
  return /^[a-zA-Z0-9.:_-]+$/.test(h);
}
