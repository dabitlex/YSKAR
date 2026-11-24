/**
 * Peer-Verwaltung.
 *
 * Haelt die Verbindungen, sucht neue, nimmt eingehende an und entscheidet,
 * wer gehen muss, wenn es eng wird. Von Bloecken weiss auch diese Ebene
 * nichts -- sie reicht Nachrichten nach oben durch.
 *
 * PLAETZE SIND DER EIGENTLICHE SCHUTZ, nicht Sperren. Wer sich schlecht
 * benimmt, wird getrennt und beim naechsten Gedraenge zuerst verdraengt --
 * aber nicht ausgesperrt. Die Begruendung: Ein Angreifer verbindet
 * sich trivial mit anderen Adressen neu, und unbedachtes Sperren erhoeht
 * das Risiko einer Netzspaltung, ohne den Angriff zu verhindern.
 *
 * AUSGEHEND UND EINGEHEND werden getrennt gezaehlt, und das ist wichtig:
 * Wer nur eingehende Verbindungen haette, koennte von einem Angreifer
 * vollstaendig umstellt werden -- alle Plaetze belegt, kein Kontakt zum
 * echten Netz. Ausgehende Verbindungen sucht der Knoten selbst aus.
 */
import { createServer, connect, type Server, type Socket } from 'node:net';
import { readFileSync, renameSync, existsSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';

import { PeerConnection, type PeerInfo, type NonceBuch } from './PeerConnection.ts';
import {
  encodeAddr, decodeAddr, encodeInv, peerKey, MAX_ADDR,
  type PeerAdresse,
} from './messages.ts';
import type { Command, Frame } from './wire.ts';
import type { ConsensusParams } from '../../core/networks.ts';
import { IMPLEMENTIERTE_FASSUNG, imVerdraengungsfenster, netzGruppe, adressSchluessel } from '../fassung.ts';

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
 * Vermerk weg. Mit Absicht: Er soll
 * Gedraenge ordnen, nicht jemanden aussperren.
 */
export const VERMERK_MS = 60 * 60 * 1000;
/**
 * So oft fragt der Knoten einen zufaelligen Peer nach Adressen.
 *
 * Frueher nur einmal je Verbindung, direkt nach dem Handschlag. Haelt eine
 * Verbindung tagelang, lernte der Knoten danach nichts Neues mehr.
 */
export const GETADDR_TAKT_MS = 30 * 60 * 1000;
/** So oft wird das Adressbuch gesichert -- nur wenn sich etwas geaendert hat. */
export const BUCH_SICHERN_MS = 2 * 60 * 1000;
/**
 * Abstand zwischen zwei Erreichbarkeitsproben bei derselben Adresse.
 * Siehe pruefeErreichbarkeit().
 */
export const PROBE_ABSTAND_MS = 6 * 60 * 60 * 1000;
/** Aelter wird beim Laden nichts uebernommen -- wie bei addr. */
export const BUCH_HOECHSTALTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Format der Datei peers.json. */
export const BUCH_FORMAT = 1;

interface BuchEintrag {
  host: string;
  port: number;
  gesehen: number;
  /** Fehlversuche in Folge. Steigt der Wert, wird seltener probiert. */
  fehlversuche: number;
  zuletztVersucht: number;
  /**
   * GEHOERT oder GEPRUEFT.
   *
   * Gehoert: Die Adresse kam von einem Peer (addr) oder ein Peer hat sie
   * beim Verbinden als seinen Lauschport genannt. Ob man ihn dort erreicht,
   * weiss niemand -- ein Heimrechner hinter einem Router nennt seinen Port,
   * ist aber von aussen nicht erreichbar.
   *
   * Geprueft: Dieser Knoten hat dort selbst schon einmal einen Handschlag
   * geschafft.
   *
   * Angewaehlt wird beides. Weitergegeben (addr) wird nur Geprueftes. Sonst
   * verteilt das Netz Adressen, die niemand erreicht, und jeder Knoten
   * verbraucht seine Versuche an denselben Sackgassen. (Befund am
   * Hauptknoten, 24.11.2026.)
   */
  geprueft: boolean;
  /** Letzte Erreichbarkeitsprobe (ms), 0 = nie. Nicht gespeichert. */
  zuletztGeprobt: number;
}

/** Inhalt von peers.json. */
interface BuchDatei {
  format: number;
  network: string;
  gesichert: number;
  eintraege: { host: string; port: number; gesehen: number; fehlversuche: number; geprueft: boolean }[];
  /** Als eigene erkannte Adressen -- damit der Knoten sich nicht nach jedem Start wieder selbst anwaehlt. */
  selbst: string[];
}

export interface NetzOptionen {
  params: ConsensusParams;
  agent: string;
  /** Port zum Lauschen. 0 heisst: nur ausgehend. */
  listenPort?: number;
  /**
   * Adresse zum Lauschen. Ohne Angabe "::" -- IPv4 und IPv6 auf demselben
   * Port --, und wenn das System kein IPv6 kann, "0.0.0.0". Mit Angabe nur
   * diese Adresse, ohne Rueckfall.
   */
  host?: string;
  /**
   * Datei fuer das Adressbuch (peers.json). Ohne Angabe lebt das Buch nur
   * im Arbeitsspeicher -- wie vor 1.0.2.
   */
  buchDatei?: string;
  /** Kuerzere Takte -- nur fuer Tests. */
  takte?: { verbindeMs?: number; getaddrMs?: number; probeAbstandMs?: number };
  seeds?: { host: string; port: number }[];
  maxAus?: number;
  maxEin?: number;
  /**
   * Hoechstens so viele eingehende Verbindungen je Absender (IPv4-Adresse
   * bzw. IPv6-/64, siehe adressSchluessel). 0 oder ohne Angabe: keine
   * Grenze -- wie bisher.
   */
  maxEinJeAdresse?: number;
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
   * Urspruengliches Ziel jeder ausgehenden Verbindung.
   *
   * Ein Seed kann ein Name sein, dessen Socket danach eine IP meldet:
   *
   *   Ziel beim connect():          pool.yskar.app:8646
   *   Tatsaechliche Socket-Adresse: 203.0.113.7:8646   (Beispiel, RFC 5737)
   *
   * PeerConnection kennt nur die zweite Adresse. Ohne diese Zuordnung
   * wuerde der PeerManager die DynDNS-Adresse nach erfolgreicher Verbindung
   * weiterhin als "frei" betrachten und immer wieder dieselbe Verbindung
   * aufbauen.
   *
   * peer.id -> urspruenglicher Zielschluessel
   *
   * (Aus dem gebauten Node Core in die Quelle uebernommen -- die Aenderung
   * existierte vorher nur im Bauartefakt dist/node-core.cjs.)
   */
  private ausgehendZiele = new Map<number, string>();
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
  /** Seit dem letzten Sichern geaendert? */
  private buchGeaendert = false;
  private zuletztGesichert = 0;
  private sichernLaeuft: Promise<void> | null = null;
  private zuletztGetaddr = Date.now();
  /** Laufende Erreichbarkeitsprobe -- hoechstens eine zugleich. */
  private probeLaeuft = false;
  /** Worauf der Knoten tatsaechlich lauscht ("::" oder "0.0.0.0"), null = gar nicht. */
  lauschAdresse: string | null = null;

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
    // Zuerst das gespeicherte Buch, dann die Seeds: Die Seeds sind immer
    // dabei, als Rueckfall, falls keiner der gespeicherten Peers antwortet.
    if (opt.buchDatei) this.ladeBuch(opt.buchDatei);
    // Seeds, die noch nicht im Buch stehen, kommen mit "nie gesehen" dazu:
    // Bei gleich vielen Fehlversuchen waehlt der Knoten dann zuerst die
    // Peers, die er zuletzt gesehen hat -- und die Seeds erst danach.
    // Ohne gespeichertes Buch sind die Seeds ohnehin die einzigen.
    const gefuellt = this.buch.size > 0;
    for (const s of opt.seeds ?? []) this.merke(s.host, s.port, gefuellt ? 1 : Date.now());
  }

  private get maxAus() { return this.opt.maxAus ?? MAX_AUS; }
  private get maxEin() { return this.opt.maxEin ?? MAX_EIN; }
  private log(t: string) { this.opt.onLog?.(t); }

  async start(): Promise<void> {
    if (this.laeuft) return;
    this.laeuft = true;

    if (this.opt.listenPort && this.opt.listenPort > 0) {
      await this.lauscheMitRueckfall(this.opt.listenPort);
    }

    this.fuelleAus();
    this.takt = setInterval(() => this.imTakt(), this.opt.takte?.verbindeMs ?? VERBINDE_INTERVALL_MS);
    this.takt.unref?.();
  }

  /** Alles, was regelmaessig zu tun ist -- alle VERBINDE_INTERVALL_MS. */
  private imTakt(): void {
    this.fuelleAus();
    this.pruefeErreichbarkeit();
    const jetzt = Date.now();
    if (jetzt - this.zuletztGetaddr >= (this.opt.takte?.getaddrMs ?? GETADDR_TAKT_MS)) {
      this.zuletztGetaddr = jetzt;
      const bereit = this.bereite();
      const p = bereit[Math.floor(Math.random() * bereit.length)];
      if (p) p.send('getaddr', new Uint8Array(0));
    }
    if (this.opt.buchDatei && this.buchGeaendert && jetzt - this.zuletztGesichert >= BUCH_SICHERN_MS) {
      void this.sichereBuch();
    }
  }

  async stop(): Promise<void> {
    this.laeuft = false;
    if (this.takt) { clearInterval(this.takt); this.takt = null; }
    for (const p of [...this.peers.values()]) p.close('herunterfahren');
    this.peers.clear();
    this.ausgehendZiele.clear();
    if (this.server) {
      await new Promise<void>(auf => this.server!.close(() => auf()));
      this.server = null;
    }
    if (this.opt.buchDatei) await this.sichereBuch();
  }

  // ---------------------------------------------------------------- Stand

  alle(): PeerConnection[] { return [...this.peers.values()]; }
  bereite(): PeerConnection[] { return this.alle().filter(p => p.ready); }
  zahlAus(): number { return this.alle().filter(p => p.richtung === 'aus').length; }
  zahlEin(): number { return this.alle().filter(p => p.richtung === 'ein').length; }
  /** Seit dem Start wegen der Grenze je Absender abgewiesene Verbindungen. */
  abgewiesenJeAdresse = 0;
  buchGroesse(): number { return this.buch.size; }

  info(): PeerInfo[] { return this.bereite().map(p => p.info()); }

  /**
   * Zahlen zum Knotennetz -- fuer /status. Keine Adressen.
   */
  netzStand(): {
    addressBook: number; verified: number; dialable: number; self: number;
    outboundGroups: number; listen: string | null;
  } {
    const gruppen = new Set(this.alle().filter(p => p.richtung === 'aus').map(p => netzGruppe(p.host)));
    let geprueft = 0;
    for (const e of this.buch.values()) if (e.geprueft) geprueft++;
    return {
      addressBook: this.buch.size,
      verified: geprueft,
      dialable: this.kandidaten(Date.now()).length,
      self: this.selbst.size,
      outboundGroups: gruppen.size,
      listen: this.lauschAdresse,
    };
  }

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

  /**
   * Lauschen -- ohne feste Adresse zuerst auf IPv4 und IPv6, und wenn das
   * System kein IPv6 kann, nur auf IPv4.
   */
  private async lauscheMitRueckfall(port: number): Promise<void> {
    if (this.opt.host !== undefined) {
      await this.lausche(port, this.opt.host);
      return;
    }
    try {
      await this.lausche(port, '::');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (!KEIN_IPV6.has(code)) throw e;
      this.log(`IPv6 is not available here (${code}) -- listening on IPv4 only`);
      await this.lausche(port, '0.0.0.0');
    }
  }

  /** Protected, damit ein Test ein System ohne IPv6 nachstellen kann. */
  protected lausche(port: number, host: string): Promise<void> {
    return new Promise((auf, ab) => {
      const srv = createServer(sock => this.nimmAn(sock));
      srv.once('error', ab);
      srv.listen({ port, host, ipv6Only: false }, () => {
        srv.off('error', ab);
        srv.on('error', e => this.log(`listener error: ${e.message}`));
        this.server = srv;
        this.lauschAdresse = host;
        this.log(host === '::'
          ? `listening on [::]:${port} (IPv4 and IPv6)`
          : `listening on ${host.includes(':') ? `[${host}]` : host}:${port}`);
        auf();
      });
    });
  }

  private nimmAn(sock: Socket): void {
    if (!this.laeuft) { sock.destroy(); return; }

    /*
      Grenze je Absender (--max-inbound-per-ip).

      Hat dieser Absender schon so viele eingehende Verbindungen, wird die
      neue geschlossen. Niemand wird dafuer verdraengt und nichts vermerkt:
      Mehrere ehrliche Knoten hinter einem Anschluss sind normal, und eine
      zusaetzliche Verbindung ist kein Fehlverhalten. Sie verhindert nur,
      dass eine einzelne Quelle alle Eingangsplaetze belegt.
    */
    const jeAdresse = this.opt.maxEinJeAdresse ?? 0;
    if (jeAdresse > 0) {
      const schluessel = adressSchluessel(sock.remoteAddress ?? '');
      let gleich = 0;
      for (const p of this.alle()) {
        if (p.richtung === 'ein' && adressSchluessel(p.host) === schluessel) gleich++;
      }
      if (gleich >= jeAdresse) {
        this.abgewiesenJeAdresse++;
        sock.destroy();
        return;
      }
    }

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
   * ohne etwas beizutragen.
   *
   * In den letzten 1.000 Bloecken vor einer Aktivierung (CONSENSUS_V6.md
   * 11.4) danach einen Peer, dessen Fassung die kommende
   * Hoehe nicht traegt: Er faellt an der Hoehe ohnehin ab, und sein Platz
   * ist fuer einen Peer frei, der danach noch Bloecke liefert. Nie den
   * letzten Peer seiner Netzgruppe -- sonst koennte ein Netz mit vielen
   * Adressen alle anderen verdraengen lassen.
   *
   * Sonst niemanden.
   */
  private verdraengungsopfer(): PeerConnection | null {
    const ein = this.alle().filter(p => p.richtung === 'ein');
    const vermerkt = ein.find(p => this.istVermerkt(p.host));
    if (vermerkt) return vermerkt;

    const unfertig = ein.filter(p => !p.ready)
      .sort((a, b) => a.info().seit - b.info().seit);
    if (unfertig[0]) return unfertig[0];

    if (imVerdraengungsfenster(this.opt.kette().height, this.opt.params)) {
      const gruppen = new Map<string, number>();
      for (const p of this.alle()) {
        const g = netzGruppe(p.host);
        gruppen.set(g, (gruppen.get(g) ?? 0) + 1);
      }
      // Alt ist auch, wer Fassung 6 meldet, aber eine andere (oder keine)
      // Aktivierungshoehe kennt: Er setzt Fassung 6 an unserer Hoehe nicht durch.
      const alt = ein.filter(p => p.ready
        && (p.fremdeFassung() < IMPLEMENTIERTE_FASSUNG || p.fremdeAktivierung() !== this.opt.params.v6Height)
        && (gruppen.get(netzGruppe(p.host)) ?? 0) > 1)
        .sort((a, b) => a.info().seit - b.info().seit);
      if (alt[0]) return alt[0];
    }
    return null;
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

  /** Schluessel aller Adressen, mit denen gerade eine Verbindung besteht. */
  private verbundeneSchluessel(): Set<string> {
    const verbunden = new Set<string>();
    for (const p of this.alle()) {
      verbunden.add(peerKey({
        host: p.host, port: p.info().listenPort || p.port,
      }));
    }
    // Die Socket-Adresse ist bei einem Namen die IP -- das urspruengliche
    // Ziel zaehlt deshalb gesondert als verbunden.
    for (const ziel of this.ausgehendZiele.values()) verbunden.add(ziel);
    return verbunden;
  }

  /** Adressen, die gerade angewaehlt werden duerften. */
  private kandidaten(jetzt: number): BuchEintrag[] {
    const verbunden = this.verbundeneSchluessel();
    return [...this.buch.values()].filter(e => {
      const k = peerKey(e);
      if (verbunden.has(k)) return false;
      if (this.imAufbau.has(k)) return false;
      // Nach Fehlversuchen warten, und zwar laenger mit jedem weiteren.
      // Ohne das haemmert der Knoten gegen eine tote Adresse.
      const wartezeit = Math.min(2 ** e.fehlversuche, 64) * 30_000;
      return jetzt - e.zuletztVersucht >= wartezeit;
    });
  }

  private naechstesZiel(): BuchEintrag | null {
    const kandidaten = this.kandidaten(Date.now());
    if (kandidaten.length === 0) return null;

    /*
      STREUUNG: Zuerst Adressen aus einem Netzbereich, in dem noch keine
      ausgehende Verbindung besteht (IPv4 /16, IPv6 /32 -- netzGruppe).

      Lagen alle ausgehenden Verbindungen in einem Netz, koennte, wer dieses
      Netz kontrolliert, dem Knoten eine eigene Sicht auf die Kette zeigen.
      Gibt es keinen neuen Bereich, wird gewaehlt wie bisher.
    */
    const belegt = new Set<string>();
    for (const p of this.alle()) if (p.richtung === 'aus') belegt.add(netzGruppe(p.host));
    for (const k of this.imAufbau) {
      const e = this.buch.get(k);
      if (e) belegt.add(netzGruppe(e.host));
    }
    const neu = (e: BuchEintrag) => (belegt.has(netzGruppe(e.host)) ? 1 : 0);

    // Neuer Bereich zuerst, dann wenige Fehlversuche, dann zuletzt gesehen.
    kandidaten.sort((a, b) =>
      neu(a) !== neu(b) ? neu(a) - neu(b)
        : a.fehlversuche !== b.fehlversuche
          ? a.fehlversuche - b.fehlversuche
          : b.gesehen - a.gesehen);
    return kandidaten[0];
  }

  /**
   * ERREICHBARKEITSPROBE fuer Peers, die nur eingehend verbunden sind.
   *
   * Wer schon eingehend verbunden ist, wird nicht zusaetzlich angewaehlt --
   * also erfaehrt der Knoten nie, ob man ihn auch von aussen erreicht, und
   * gaebe ihn nie weiter (siehe BuchEintrag.geprueft). Deshalb probiert der
   * Knoten hin und wieder genau das: eine kurze Verbindung mit vollem
   * Handschlag an den genannten Lauschport, danach sofort wieder getrennt.
   *
   * Hoechstens eine Probe zugleich, je Adresse hoechstens alle
   * PROBE_ABSTAND_MS. Die Probe zaehlt nicht als Peer: kein Platz, keine
   * Kettendaten, keine Meldung nach oben.
   */
  private pruefeErreichbarkeit(): void {
    if (!this.laeuft || this.probeLaeuft) return;
    const jetzt = Date.now();
    const verbunden = this.verbundeneSchluessel();
    const ziel = [...this.buch.values()].find(e =>
      !e.geprueft && verbunden.has(peerKey(e)) && !this.imAufbau.has(peerKey(e))
      && jetzt - e.zuletztGeprobt >= (this.opt.takte?.probeAbstandMs ?? PROBE_ABSTAND_MS));
    if (!ziel) return;
    ziel.zuletztGeprobt = jetzt;
    this.probeLaeuft = true;
    const k = peerKey(ziel);

    const sock = connect({ host: ziel.host, port: ziel.port });
    sock.setTimeout(VERBINDE_TIMEOUT_MS);
    let fertig = false;
    const ende = (erreichbar: boolean) => {
      if (fertig) return;
      fertig = true;
      this.probeLaeuft = false;
      const e = this.buch.get(k);
      if (e) {
        if (erreichbar) { e.fehlversuche = 0; this.alsGeprueft(e); }
        else e.fehlversuche++;
        this.buchGeaendert = true;
      }
      // Gleich die naechste, falls noch jemand wartet -- eine nach der anderen.
      setImmediate(() => this.pruefeErreichbarkeit());
    };
    sock.once('error', () => { ende(false); sock.destroy(); });
    sock.once('timeout', () => { ende(false); sock.destroy(); });
    sock.once('connect', () => {
      sock.setTimeout(0);
      sock.removeAllListeners('timeout');
      new PeerConnection({
        socket: sock, richtung: 'aus', params: this.opt.params, agent: this.opt.agent,
        listenPort: this.opt.listenPort ?? 0, eigeneKette: this.opt.kette, nonces: this.nonceBuch,
        callbacks: {
          onReady: p => { ende(true); p.close('probe'); },
          onClose: (_p, grund) => {
            if (grund.includes('selbstverbindung')) {
              this.selbst.add(k);
              this.buch.delete(k);
              this.buchGeaendert = true;
            }
            ende(false);
          },
        },
      });
    });
  }

  /** Von aussen anstossbar -- fuer eine feste Adresse. */
  verbinde(host: string, port: number): void {
    const k = peerKey({ host, port });
    if (this.imAufbau.has(k)) return;
    if ([...this.ausgehendZiele.values()].includes(k)) return;
    this.imAufbau.add(k);

    const eintrag = this.buch.get(k);
    if (eintrag) eintrag.zuletztVersucht = Date.now();

    const sock = connect({ host, port });
    sock.setTimeout(VERBINDE_TIMEOUT_MS);

    const scheitern = (grund: string) => {
      this.imAufbau.delete(k);
      const e = this.buch.get(k);
      if (e) { e.fehlversuche++; this.buchGeaendert = true; }
      try { sock.destroy(); } catch { /* egal */ }
      this.log(`${k} not reachable: ${grund}`);
    };

    sock.once('error', e => scheitern(e.message));
    sock.once('timeout', () => scheitern('timed out'));
    sock.once('connect', () => {
      sock.setTimeout(0);
      sock.removeAllListeners('timeout');
      this.imAufbau.delete(k);
      const e = this.buch.get(k);
      if (e) { e.fehlversuche = 0; e.gesehen = Date.now(); }
      this.nimmVerbindung(sock, 'aus', port, k);
    });
  }

  // ------------------------------------------------------------- Gemeinsam

  private nimmVerbindung(
    sock: Socket, richtung: 'aus' | 'ein', zielPort = 0, urspruenglichesZiel?: string,
  ): void {
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
          this.ausgehendZiele.delete(peer.id);
          if (grund.includes('selbstverbindung') && zielPort > 0) {
            const k = peerKey({ host: peer.host, port: zielPort });
            this.selbst.add(k);
            this.buch.delete(k);
            this.buchGeaendert = true;
            this.log(`${k} is this node itself -- removed from the address book`);
          }
          this.opt.onClose?.(peer, grund);
        },
        onMisbehave: (peer, grund) => {
          this.vermerke(peer.host);
          this.log(`${peer.host} misbehaves: ${grund}`);
        },
      },
    });
    if (richtung === 'aus' && urspruenglichesZiel) {
      this.ausgehendZiele.set(p.id, urspruenglichesZiel);
    }
    this.peers.set(p.id, p);
  }

  private aufBereit(p: PeerConnection, zielPort: number): void {
    const port = p.info().listenPort || zielPort;
    if (port > 0) this.merke(p.host, port);

    // Ausgehend mit Handschlag: Die Adresse ist erreichbar -- unter dem
    // gewaehlten Ziel (bei einem Seed oft ein Name) und unter der IP.
    if (p.richtung === 'aus') {
      const ziel = this.ausgehendZiele.get(p.id);
      for (const k of [ziel, port > 0 ? peerKey({ host: p.host, port }) : undefined]) {
        const e = k ? this.buch.get(k) : undefined;
        if (e) this.alsGeprueft(e);
      }
    } else if (port > 0) {
      // Eingehend mit Lauschport: gleich pruefen, ob man ihn dort erreicht.
      setImmediate(() => this.pruefeErreichbarkeit());
    }

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
      // Und nur, was dieser Knoten selbst schon erreicht hat (geprueft).
      .filter(e => e.geprueft && jetzt - e.gesehen < 3 * 60 * 60 * 1000 && e.fehlversuche === 0)
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

  /**
   * Eine Adresse als erreichbar vermerken -- und, wenn sie es eben erst
   * geworden ist, zwei zufaelligen Peers davon erzaehlen.
   *
   * Ohne dieses Weitererzaehlen erfuehre ein Knoten, der seine Peers schon
   * beim Handschlag gefragt hat, von einer frisch geprueften Adresse erst
   * beim naechsten getaddr (GETADDR_TAKT_MS).
   */
  private alsGeprueft(e: BuchEintrag): void {
    if (e.geprueft) return;
    e.geprueft = true;
    this.buchGeaendert = true;
    // Nicht an den, um den es geht (gleiche Adresse UND gleicher Lauschport).
    const ziele = this.bereite().filter(p => peerKey({ host: p.host, port: p.info().listenPort || p.port }) !== peerKey(e));
    for (let i = ziele.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ziele[i], ziele[j]] = [ziele[j], ziele[i]];
    }
    const nachricht = encodeAddr([{ host: e.host, port: e.port, gesehen: BigInt(Math.floor(e.gesehen / 1000)) }]);
    for (const p of ziele.slice(0, 2)) p.send('addr', nachricht);
  }

  private merke(host: string, port: number, gesehen = Date.now()): void {
    if (port <= 0 || port > 65535) return;
    const k = peerKey({ host, port });
    // Die eigene Adresse gehoert nicht ins Buch -- weder aus einem addr
    // noch aus einem Seed.
    if (this.selbst.has(k)) return;
    const vorhanden = this.buch.get(k);
    if (vorhanden) {
      if (gesehen > vorhanden.gesehen) { vorhanden.gesehen = gesehen; this.buchGeaendert = true; }
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

    this.buch.set(k, { host, port, gesehen, fehlversuche: 0, zuletztVersucht: 0, geprueft: false, zuletztGeprobt: 0 });
    this.buchGeaendert = true;
  }

  // ------------------------------------------------------ Adressbuch-Datei

  /**
   * Das gespeicherte Adressbuch laden (peers.json).
   *
   * Alles darin wird geprueft wie eine addr-Nachricht von einem Fremden:
   * Jemand mit Zugriff auf den Datenordner -- oder ein Fehler beim
   * Schreiben -- soll den Knoten nicht von seinen echten Kontakten
   * abschneiden koennen. Eine unlesbare Datei wird beiseitegelegt
   * (peers.json.unlesbar); der Knoten startet dann nur mit den Seeds.
   */
  private ladeBuch(datei: string): void {
    if (!existsSync(datei)) return;
    let d: BuchDatei;
    try {
      d = JSON.parse(readFileSync(datei, 'utf8')) as BuchDatei;
      if (!d || d.format !== BUCH_FORMAT || !Array.isArray(d.eintraege)) throw new Error('unknown format');
    } catch (e) {
      try { renameSync(datei, `${datei}.unlesbar`); } catch { /* egal */ }
      this.log(`address book not loaded (${(e as Error).message}) -- kept as ${datei.split(/[\\/]/).pop()}.unlesbar`);
      return;
    }
    if (d.network !== this.opt.params.network) {
      this.log(`address book belongs to network ${String(d.network)} -- ignored`);
      return;
    }
    for (const k of Array.isArray(d.selbst) ? d.selbst : []) {
      if (typeof k === 'string' && k.length <= 300) this.selbst.add(k);
    }
    const jetzt = Date.now();
    const gueltig = d.eintraege.filter(e =>
      e && typeof e.host === 'string' && plausiblerHost(e.host)
      && Number.isInteger(e.port) && e.port > 0 && e.port <= 65535
      && typeof e.gesehen === 'number' && e.gesehen <= jetzt + 10 * 60 * 1000
      && jetzt - e.gesehen <= BUCH_HOECHSTALTER_MS)
      // Die juengsten zuerst -- passt nicht alles hinein, bleiben die besten.
      .sort((a, b) => b.gesehen - a.gesehen)
      .slice(0, MAX_BUCH);
    for (const e of gueltig) {
      const k = peerKey(e);
      if (this.selbst.has(k) || this.buch.has(k)) continue;
      this.buch.set(k, {
        host: e.host, port: e.port, gesehen: e.gesehen,
        // Fehlversuche gedeckelt: Nach einem Neustart wird jede Adresse
        // spaetestens nach einigen Minuten wieder probiert.
        fehlversuche: Math.min(Math.max(0, Math.floor(Number(e.fehlversuche) || 0)), 3),
        zuletztVersucht: 0, geprueft: e.geprueft === true, zuletztGeprobt: 0,
      });
    }
    this.log(`address book loaded: ${this.buch.size} addresses, ${[...this.buch.values()].filter(e => e.geprueft).length} verified`);
  }

  /**
   * Das Adressbuch sichern: erst in eine Nebendatei, dann umbenennen. So
   * liegt nach einem Absturz mitten im Schreiben immer entweder das alte
   * oder das neue Buch da, nie ein halbes.
   */
  async sichereBuch(): Promise<void> {
    const datei = this.opt.buchDatei;
    if (!datei) return;
    if (this.sichernLaeuft) await this.sichernLaeuft;
    const inhalt: BuchDatei = {
      format: BUCH_FORMAT,
      network: this.opt.params.network,
      gesichert: Date.now(),
      eintraege: [...this.buch.values()].map(e => ({
        host: e.host, port: e.port, gesehen: e.gesehen, fehlversuche: e.fehlversuche, geprueft: e.geprueft,
      })),
      selbst: [...this.selbst],
    };
    this.buchGeaendert = false;
    this.zuletztGesichert = Date.now();
    this.sichernLaeuft = (async () => {
      try {
        await writeFile(`${datei}.neu`, JSON.stringify(inhalt));
        await rename(`${datei}.neu`, datei);
      } catch (e) {
        this.buchGeaendert = true;
        this.log(`address book not saved: ${(e as Error).message}`);
      }
    })();
    await this.sichernLaeuft;
    this.sichernLaeuft = null;
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

/** Fehler beim Lauschen auf "::", die heissen: Dieses System kann kein IPv6. */
const KEIN_IPV6 = new Set(['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EINVAL', 'EPROTONOSUPPORT']);
