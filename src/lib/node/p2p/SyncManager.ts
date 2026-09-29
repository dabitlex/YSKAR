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
  INV_BLOCK, INV_TX, MAX_HEADERS, MAX_INV,
} from './messages.ts';
import { deserializeTx, serializeTx, txid, TX_COINBASE, type Transfer }
  from '../../core/tx.ts';
import type { TxPool } from '../fullnode/TxPool.ts';
import { mempoolNachziehen } from '../fullnode/mempoolPflege.ts';

/** Wie viele Blockkoerper gleichzeitig angefragt werden. */
export const BLOCK_FENSTER = 16;
/** Wie viele abgewiesene Ueberweisungen im Gedaechtnis bleiben. */
export const ABGEWIESEN_RING = 4096;
/** Wie lange auf angeforderte Daten gewartet wird. */
export const ANFRAGE_TIMEOUT_MS = 30_000;

export interface SyncOptionen {
  chain: ChainManager;
  store: ChainStore;
  peers: PeerManager;
  params?: ConsensusParams;
  /**
   * Die Warteschlange dieses Knotens.
   *
   * Optional, weil Tests den SyncManager ohne sie bauen. Im Betrieb gehoert
   * sie dazu: Ohne sie bleibt der Mempool nach einem fremden Block stehen.
   */
  pool?: TxPool;
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
  private pool: TxPool | null;
  private params: ConsensusParams;
  private opt: SyncOptionen;

  /** Angeforderte Bloecke: Hash -> von wem und seit wann. */
  private offen = new Map<string, OffeneAnfrage>();

  /**
   * Angeforderte Ueberweisungen, die noch nicht geliefert wurden.
   *
   * Getrennt von `offen`: Bloecke haengen an der Warteschlange und muessen
   * in Reihenfolge kommen. Fuer eine Ueberweisung gilt beides nicht -- sie
   * steht fuer sich und hat keine Vorgaenger.
   */
  private offeneTx = new Map<string, OffeneAnfrage>();

  /**
   * Kuerzlich abgewiesene Ueberweisungen.
   *
   * Ohne dieses Gedaechtnis entstuende eine Schleife aus lauter richtigem
   * Verhalten: Peer kuendigt an, wir fordern an, wir pruefen, wir lehnen ab
   * -- und beim naechsten Mal von vorn. Bei mehreren Peers, die einander
   * dieselbe unbrauchbare Ueberweisung ankuendigen, laeuft das endlos.
   *
   * Ein Ring fester Groesse, kein wachsender Speicher: Was hinten
   * herausfaellt, wird irgendwann noch einmal angefordert. Das ist der
   * Preis dafuer, dass ein Angreifer diese Liste nicht aufblaehen kann.
   */
  private abgewiesen = new Set<string>();
  private abgewiesenRing: string[] = [];
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
    this.pool = o.pool ?? null;
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
        case 'tx':         return this.aufTx(p, f.payload);
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
      if (e.typ === INV_TX) {
        const tx = this.pool?.get(toHex(e.hash));
        if (!tx) { fehlt.push(e); continue; }
        p.send('tx', serializeTx(tx));
        continue;
      }
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
      /*
        Den Mempool an die neue Lage anpassen, BEVOR jemand anders von dem
        Block erfaehrt.

        Vorher geschah das hier gar nicht: Ein Block aus dem Netz liess die
        eigene Warteschlange unberuehrt. Enthaltene Ueberweisungen blieben
        darin stehen und wurden beim naechsten eigenen Block wieder
        eingebaut -- mit verbrauchter Nonce, was den eigenen Block
        ungueltig machte.
      */
      if (this.pool) {
        mempoolNachziehen(r, this.pool, this.chain.state(), this.chain.height());
      }

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

    for (const w of wunsch) {
      this.offen.set(toHex(w.hash), { peer: p, seit: Date.now() });
    }

    /*
      Ueberweisungen, die wir noch nicht kennen.

      Drei Gruende, eine Ankuendigung zu uebergehen: Sie liegt schon in der
      Warteschlange, sie ist bereits unterwegs, oder wir haben sie schon
      einmal abgewiesen. Der letzte Fall ist der wichtigste -- ohne ihn
      fordern wir dieselbe unbrauchbare Ueberweisung endlos neu an.

      Ohne Pool wird gar nicht erst gefragt: Wir haetten keinen Ort, wohin
      damit.
    */
    const txWunsch = this.pool
      ? eintraege.filter(e => {
          if (e.typ !== INV_TX) return false;
          const id = toHex(e.hash);
          return !this.pool!.has(id) && !this.offeneTx.has(id) && !this.abgewiesen.has(id);
        }).slice(0, MAX_INV)
      : [];

    for (const w of txWunsch) {
      this.offeneTx.set(toHex(w.hash), { peer: p, seit: Date.now() });
    }

    const alle = [...wunsch, ...txWunsch];
    if (alle.length === 0) return;
    p.send('getdata', encodeGetData(alle));
  }

  /**
   * Eine Ueberweisung, die ein Peer geschickt hat.
   *
   * Sie wird voll geprueft -- dieselbe Pruefung wie fuer eine, die ueber
   * die eigene Schnittstelle hereinkommt. Weitergereicht wird nur, was
   * tatsaechlich neu aufgenommen wurde. Das ist zugleich der Schutz gegen
   * Kreisverkehr: Was schon in der Warteschlange liegt, kommt als
   * `duplicate` zurueck und wird nicht noch einmal herumgeschickt. Ohne
   * diese Bedingung liefe eine Ueberweisung zwischen drei Knoten ewig im
   * Kreis.
   */
  private aufTx(p: PeerConnection, payload: Uint8Array): void {
    if (!this.pool) return;

    let tx: Transfer;
    try {
      const roh = deserializeTx(payload);
      if (roh.type === TX_COINBASE) {
        // Eine Coinbase entsteht im Block und wird nie einzeln verschickt.
        return void p.close('coinbase_als_tx');
      }
      tx = roh as Transfer;
    } catch {
      return void p.close('tx_unlesbar');
    }

    const id = toHex(txid(tx));
    this.offeneTx.delete(id);

    const r = this.pool.add(tx, this.chain.state(), this.chain.height() + 1);
    if (!r.ok) {
      /*
        Kein Grund zum Trennen: Eine Ueberweisung kann voellig richtig
        gebaut und trotzdem hier unbrauchbar sein -- etwa weil die Nonce
        inzwischen verbraucht ist. Nur merken, damit wir sie nicht gleich
        wieder anfordern.
      */
      this.merkeAbgewiesen(id);
      return;
    }

    this.kuendigeAnTx(txid(tx), p);
  }

  /** Eine Ueberweisung den Peers ankuendigen -- nicht dem, von dem sie kam. */
  kuendigeAnTx(hash: Uint8Array, ausser?: PeerConnection): number {
    return this.peers.kuendigeAn(INV_TX, hash, ausser);
  }

  /**
   * Steht diese Ueberweisung im Gedaechtnis der Abgewiesenen?
   *
   * Fuer Tests und Diagnose. Ohne diese Auskunft liesse sich der
   * Flutungsschutz nur ueber sein Ausbleiben pruefen -- also daran, dass
   * etwas NICHT endlos passiert, und das ist keine Zusicherung, die ein
   * Test in endlicher Zeit treffen kann.
   */
  istAbgewiesen(id: string): boolean { return this.abgewiesen.has(id); }

  private merkeAbgewiesen(id: string): void {
    if (this.abgewiesen.has(id)) return;
    this.abgewiesen.add(id);
    this.abgewiesenRing.push(id);
    while (this.abgewiesenRing.length > ABGEWIESEN_RING) {
      const raus = this.abgewiesenRing.shift();
      if (raus !== undefined) this.abgewiesen.delete(raus);
    }
  }

  private aufNotFound(p: PeerConnection, payload: Uint8Array): void {
    for (const e of decodeNotFoundSicher(payload)) {
      this.offen.delete(toHex(e.hash));
      // Eine Ueberweisung, die der Peer nicht mehr hat: Der Versuch ist
      // beendet. Nicht als abgewiesen merken -- sie kann bei einem anderen
      // liegen und voellig in Ordnung sein.
      this.offeneTx.delete(toHex(e.hash));
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
