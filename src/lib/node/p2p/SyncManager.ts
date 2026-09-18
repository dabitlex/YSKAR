/**
 * Kettenabgleich.
 *
 * Verbindet die Peers mit der eigenen Kette: holt fehlende Bloecke,
 * beantwortet Anfragen, verbreitet Neues.
 *
 * DIE REGEL, DIE ALLES TRAEGT: Ein Peer liefert Daten, nichts weiter. Jeder
 * Block laeuft durch dieselbe vollstaendige Pruefung wie ein selbst
 * gebauter -- ueber ChainManager.accept(). Es gibt hier keine Abkuerzung
 * fuer "vertrauenswuerdige" Peers, weil es keine vertrauenswuerdigen Peers
 * gibt.
 *
 * HEADER ZUERST, wie bei Bitcoin. Header sind 136 Byte, Bloecke bis zu 400
 * KB. Erst wenn feststeht, dass ein Zweig mehr Arbeit traegt, werden die
 * Koerper geholt -- sonst laedt man Bloecke herunter, die man gleich wieder
 * verwirft.
 */
import { deserializeBlock, headerHash, deserializeHeader } from '../../core/block.ts';
import { targetFromDifficulty } from '../../core/params.ts';
import { sha256d } from '../../core/hash.ts';
import { toHex } from '../../core/codec.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';

import type { ChainManager } from '../fullnode/ChainManager.ts';
import type { ChainStore } from '../fullnode/ChainStore.ts';
import type { PeerManager } from './PeerManager.ts';
import type { PeerConnection } from './PeerConnection.ts';
import type { Frame } from './wire.ts';
import {
  encodeGetHeaders, decodeGetHeaders, encodeHeaders, decodeHeaders,
  encodeInv, decodeInv, encodeGetData, decodeGetData, encodeNotFound,
  INV_BLOCK, MAX_HEADERS,
} from './messages.ts';

/** Wie viele Blockkoerper gleichzeitig angefragt werden. */
export const BLOCK_FENSTER = 16;
/** Wie lange auf angeforderte Daten gewartet wird. */
export const ANFRAGE_TIMEOUT_MS = 30_000;

export interface SyncOptionen {
  chain: ChainManager;
  store: ChainStore;
  peers: PeerManager;
  params?: ConsensusParams;
  /** Wird bei jedem angenommenen fremden Block gerufen. */
  onBlock?: (hoehe: number, hash: string, vonPeer: string) => void;
  onLog?: (text: string) => void;
}

interface OffeneAnfrage {
  peer: PeerConnection;
  seit: number;
}

export class SyncManager {
  private chain: ChainManager;
  private store: ChainStore;
  private peers: PeerManager;
  private params: ConsensusParams;
  private opt: SyncOptionen;

  /** Angeforderte Bloecke: Hash -> von wem und seit wann. */
  private offen = new Map<string, OffeneAnfrage>();
  /**
   * Header, deren Koerper noch fehlen -- in der Reihenfolge der Kette.
   *
   * Bloecke muessen in Reihenfolge angewandt werden; ein Block ohne
   * Vorgaenger wird abgelehnt. Diese Liste haelt fest, was in welcher
   * Reihenfolge noch gebraucht wird.
   */
  private warteschlange: { hash: Uint8Array; hoehe: number }[] = [];
  private laeuft = false;
  private takt: NodeJS.Timeout | null = null;

  constructor(o: SyncOptionen) {
    this.chain = o.chain;
    this.store = o.store;
    this.peers = o.peers;
    this.params = o.params ?? MAINNET;
    this.opt = o;
  }

  private log(t: string) { this.opt.onLog?.(t); }

  start(): void {
    if (this.laeuft) return;
    this.laeuft = true;
    // Abgelaufene Anfragen einsammeln. Ohne das bliebe ein Block, den ein
    // Peer nie liefert, fuer immer als angefordert vermerkt -- und wuerde
    // nie von jemand anderem geholt.
    this.takt = setInterval(() => this.pruefeOffene(), 5_000);
    this.takt.unref?.();
  }

  stop(): void {
    this.laeuft = false;
    if (this.takt) { clearInterval(this.takt); this.takt = null; }
    this.offen.clear();
    this.warteschlange = [];
  }

  offeneAnfragen(): number { return this.offen.size; }
  fehlendeBloecke(): number { return this.warteschlange.length; }

  // ------------------------------------------------------- Einstiegspunkte

  /**
   * Ein Peer ist bereit.
   *
   * Hat er mehr Arbeit, wird aufgeholt. Nicht mehr Hoehe -- mehr ARBEIT:
   * Eine laengere Kette aus leichten Bloecken ist nicht die bessere.
   */
  aufPeer(p: PeerConnection): void {
    const tip = this.chain.tip();
    const eigene = tip ? tip.chainWork : 0n;
    if (p.fremdeArbeit() > eigene) {
      this.log(`${p.host} hat mehr Arbeit (${p.fremdeArbeit()} > ${eigene})`);
      this.frageHeader(p);
    }
  }

  /** Eine Nachricht von einem Peer. */
  aufNachricht(p: PeerConnection, f: Frame): void {
    try {
      switch (f.command) {
        case 'getheaders': return this.aufGetHeaders(p, f.payload);
        case 'headers':    return this.aufHeaders(p, f.payload);
        case 'getdata':    return this.aufGetData(p, f.payload);
        case 'block':      return this.aufBlock(p, f.payload);
        case 'inv':        return this.aufInv(p, f.payload);
        case 'notfound':   return this.aufNotFound(p, f.payload);
      }
    } catch (e) {
      // Eine unlesbare Nachricht ist Fehlverhalten. Getrennt wird, gesperrt
      // nicht.
      p.close(`nachricht_unlesbar:${f.command}:${(e as Error).message}`);
    }
  }

  /** Einen selbst gefundenen Block ankuendigen. */
  kuendigeAn(hash: Uint8Array, ausser?: PeerConnection): number {
    return this.peers.kuendigeAn(INV_BLOCK, hash, ausser);
  }

  // ------------------------------------------------------------ Anfragen

  /**
   * Den Locator bauen.
   *
   * Dicht am Kopf, dann mit wachsendem Abstand nach hinten, zuletzt der
   * Genesis. Die Gegenseite sucht den ersten, den sie kennt.
   *
   * Nur die Hoehe zu senden waere einfacher und falsch: Nach einer
   * Gabelung haben beide Seiten dieselbe Hoehe mit verschiedenen Bloecken.
   */
  private baueLocator(): Uint8Array[] {
    const tip = this.chain.tip();
    if (!tip) return [];

    const out: Uint8Array[] = [];
    let hoehe = tip.height;
    let schritt = 1;

    while (hoehe >= 0 && out.length < 30) {
      const b = this.store.mainAt(hoehe);
      if (b) out.push(b.hash);
      if (out.length >= 10) schritt *= 2;
      hoehe -= schritt;
    }
    // Der Genesis zum Schluss -- er ist der letzte gemeinsame Punkt, den es
    // immer gibt.
    const genesis = this.store.mainAt(0);
    if (genesis && out.length > 0 && toHex(out[out.length - 1].slice(0, 4)) !== toHex(genesis.hash.slice(0, 4))) {
      out.push(genesis.hash);
    }
    return out;
  }

  private frageHeader(p: PeerConnection): void {
    p.send('getheaders', encodeGetHeaders({
      locator: this.baueLocator(),
      stop: new Uint8Array(32),
    }));
  }

  // ---------------------------------------------------------- Beantworten

  private aufGetHeaders(p: PeerConnection, payload: Uint8Array): void {
    const g = decodeGetHeaders(payload);

    /*
      Den ersten Locator-Hash finden, den wir kennen UND der auf unserer
      aktiven Kette liegt.

      Die zweite Bedingung ist wichtig: Ein Block auf einem Nebenzweig ist
      uns zwar bekannt, taugt aber nicht als Ausgangspunkt -- die Antwort
      wuerde von dort aus in eine Kette laufen, die der Frager gar nicht
      will.
    */
    let ab = 0;
    for (const h of g.locator) {
      const b = this.store.get(h);
      if (b && b.mainChain) { ab = b.height + 1; break; }
    }

    const tip = this.chain.tip();
    if (!tip) return;

    const header: Uint8Array[] = [];
    for (let hoehe = ab; hoehe <= tip.height && header.length < MAX_HEADERS; hoehe++) {
      const b = this.store.mainAt(hoehe);
      if (!b) break;
      header.push(b.body.slice(0, 136));
      if (g.stop.some(x => x !== 0) && toHex(b.hash) === toHex(g.stop)) break;
    }

    if (header.length > 0) p.send('headers', encodeHeaders(header));
  }

  private aufGetData(p: PeerConnection, payload: Uint8Array): void {
    const wunsch = decodeGetData(payload);
    const fehlt: { typ: number; hash: Uint8Array }[] = [];

    for (const e of wunsch) {
      if (e.typ !== INV_BLOCK) { fehlt.push(e); continue; }
      const b = this.store.get(e.hash);
      if (!b) { fehlt.push(e); continue; }
      p.send('block', b.body);
    }

    // notfound, damit der Frager nicht ins Leere wartet.
    if (fehlt.length > 0) p.send('notfound', encodeNotFound(fehlt));
  }

  // ----------------------------------------------------------- Empfangen

  private aufHeaders(p: PeerConnection, payload: Uint8Array): void {
    const roh = decodeHeaders(payload);
    if (roh.length === 0) return;

    const neu: { hash: Uint8Array; hoehe: number }[] = [];

    for (const h of roh) {
      /*
        Proof of Work SOFORT pruefen, bevor irgendetwas gemerkt wird.

        Header sind billig zu erzeugen, wenn man die Arbeit weglaesst -- ein
        Peer koennte zweitausend erfundene schicken und uns dazu bringen,
        zweitausend Blockkoerper anzufragen. Der Hash kostet Mikrosekunden
        und macht genau das unmoeglich: Wer einen Header mit gueltigem PoW
        liefert, hat dafuer gearbeitet.

        Die VOLLE Pruefung kommt spaeter, wenn der Koerper da ist. Hier geht
        es nur darum, Arbeit von Behauptung zu trennen.
      */
      let kopf;
      try { kopf = deserializeHeader(h); }
      catch { return void p.close('header_unlesbar'); }

      const hash = sha256d(h);
      const ziel = targetFromDifficulty(kopf.difficulty);
      let wert = 0n;
      for (const b of hash) wert = (wert << 8n) | BigInt(b);
      if (wert > ziel) {
        return void p.close('header_ohne_arbeit');
      }

      if (this.store.has(hash)) continue;
      neu.push({ hash, hoehe: kopf.height });
    }

    if (neu.length === 0) return;
    this.log(`${neu.length} neue Header von ${p.host}`);

    // In Reihenfolge anhaengen -- Bloecke lassen sich nur so anwenden.
    neu.sort((a, b) => a.hoehe - b.hoehe);
    for (const n of neu) {
      if (!this.warteschlange.some(w => toHex(w.hash) === toHex(n.hash))) {
        this.warteschlange.push(n);
      }
    }
    this.warteschlange.sort((a, b) => a.hoehe - b.hoehe);

    this.frageBloecke(p);

    // Kamen genau so viele Header wie erlaubt, gibt es vermutlich mehr.
    if (roh.length >= MAX_HEADERS) this.frageHeader(p);
  }

  /**
   * Die naechsten Koerper anfragen.
   *
   * Nur ein begrenztes Fenster gleichzeitig: Alle auf einmal anzufragen
   * wuerde bei einer langen Kette hunderte Megabyte gleichzeitig anfordern.
   */
  private frageBloecke(p: PeerConnection): void {
    const wunsch: { typ: number; hash: Uint8Array }[] = [];

    for (const w of this.warteschlange) {
      if (this.offen.size + wunsch.length >= BLOCK_FENSTER) break;
      const k = toHex(w.hash);
      if (this.offen.has(k) || this.store.has(w.hash)) continue;
      wunsch.push({ typ: INV_BLOCK, hash: w.hash });
      this.offen.set(k, { peer: p, seit: Date.now() });
    }

    if (wunsch.length > 0) p.send('getdata', encodeGetData(wunsch));
  }

  private aufBlock(p: PeerConnection, roh: Uint8Array): void {
    let hash: string;
    try { hash = toHex(headerHash(deserializeBlock(roh).header)); }
    catch { return void p.close('block_unlesbar'); }

    this.offen.delete(hash);
    this.warteschlange = this.warteschlange.filter(w => toHex(w.hash) !== hash);

    // Dieselbe vollstaendige Pruefung wie fuer einen selbst gebauten Block.
    const r = this.chain.accept(roh);

    if (!r.ok) {
      if (r.grund === 'vorgaenger_fehlt') {
        // Kein Fehlverhalten: Uns fehlt nur die Vorgeschichte. Wieder
        // zurueck in die Schlange und Header nachfordern.
        this.frageHeader(p);
        return;
      }
      // Alles andere ist ein ungueltiger Block. Getrennt, nicht gesperrt.
      this.log(`Block von ${p.host} abgelehnt: ${r.grund} ${r.detail ?? ''}`);
      p.close(`ungueltiger_block:${r.grund}`);
      return;
    }

    if (r.stored) {
      this.opt.onBlock?.(r.height, hash, p.host);
      // Weitersagen -- aber nicht dem, von dem er kam.
      this.kuendigeAn(headerHash(deserializeBlock(roh).header), p);
    }

    // Naechstes Stueck holen, solange noch etwas fehlt.
    if (this.warteschlange.length > 0) this.frageBloecke(p);
  }

  private aufInv(p: PeerConnection, payload: Uint8Array): void {
    const eintraege = decodeInv(payload);
    const wunsch = eintraege.filter(e =>
      e.typ === INV_BLOCK
      && !this.store.has(e.hash)
      && !this.offen.has(toHex(e.hash)));

    if (wunsch.length === 0) return;

    for (const w of wunsch) {
      this.offen.set(toHex(w.hash), { peer: p, seit: Date.now() });
    }
    p.send('getdata', encodeGetData(wunsch));
  }

  private aufNotFound(p: PeerConnection, payload: Uint8Array): void {
    for (const e of decodeNotFoundSicher(payload)) {
      this.offen.delete(toHex(e.hash));
    }
    // Ein anderer Peer hat ihn vielleicht.
    const anderer = this.peers.bereite().find(x => x !== p);
    if (anderer && this.warteschlange.length > 0) this.frageBloecke(anderer);
  }

  /**
   * Abgelaufene Anfragen freigeben.
   *
   * Ein Peer, der nicht liefert, blockiert sonst einen Platz im Fenster --
   * und der Block wuerde nie von jemand anderem geholt.
   */
  private pruefeOffene(): void {
    const jetzt = Date.now();
    let frei = 0;
    for (const [k, a] of [...this.offen]) {
      if (jetzt - a.seit > ANFRAGE_TIMEOUT_MS) { this.offen.delete(k); frei++; }
    }
    if (frei === 0) return;

    this.log(`${frei} Anfragen ohne Antwort freigegeben`);
    const p = this.peers.besterPeer();
    if (p && this.warteschlange.length > 0) this.frageBloecke(p);
  }
}

function decodeNotFoundSicher(b: Uint8Array) {
  try { return decodeInv(b); } catch { return []; }
}
