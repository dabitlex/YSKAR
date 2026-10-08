/**
 * Mining-Schnittstelle des Knotens.
 *
 * Spricht GENAU dasselbe Protokoll wie der Server: /session, /job, /share,
 * /session/stop, /summary. Dadurch laeuft der bestehende Miner unveraendert
 * gegen einen lokalen Knoten -- es genuegt `--api http://127.0.0.1:8645`.
 *
 * Warum kein zweiter Miner: Eine zweite Kopie von Engine, Rechen-Thread und
 * Kommandozeile waere dieselbe Verdopplung, die uns in diesem Projekt schon
 * zweimal getroffen hat -- einmal beim Blockheader, einmal beim
 * WASM-Zwischenspeicher. Beide Male fiel es erst nach Stunden auf, weil die
 * Kopien lautlos auseinanderliefen.
 *
 * Der Knoten haelt Sessions im Arbeitsspeicher. Nach einem Neustart sind
 * sie weg, und die Miner melden sich neu an -- das ist richtig so, denn der
 * Nonce-Bereich einer Session gilt nur fuer den Kettenkopf, auf dem sie
 * begonnen hat.
 *
 * GEBUNDEN AN LOCALHOST, solange nichts anderes angegeben wird. Diese
 * Schnittstelle nimmt Arbeit entgegen und baut Bloecke; sie gehoert nicht
 * ungeschuetzt ins Netz.
 */
import { NetzStatistik, type LokaleStatistik, type NetzSumme } from './NetzStatistik.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { decodeAddress } from '../../core/address.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import { rewardAt } from '../../core/params.ts';
import { MAINNET, type ConsensusParams } from '../../core/networks.ts';

import type { ChainManager } from './ChainManager.ts';
import type { ChainStore } from './ChainStore.ts';
import type { TxPool } from './TxPool.ts';
import type { MiningCoordinator, MiningJob } from './MiningCoordinator.ts';
import { ReadApi } from './ReadApi.ts';
import type { PoolCoordinator, MiningModus } from '../../pool/PoolCoordinator.ts';
import { spiegelKopf } from './spiegelKopf.ts';

/** Angestrebter Abstand zwischen zwei Shares, in Sekunden. */
const SHARE_ZIEL_SEKUNDEN = 30;
/** Startwert, bis genug gemessen wurde. */
const SHARE_START = 128n;
/**
 * Obergrenze fuer das Share-Ziel: ein Achtel der Blockdifficulty des Jobs
 * (aber nie unter dem Startwert).
 *
 * Ohne Grenze liess sich das Ziel ueber die Einreichzeiten beliebig
 * hochtreiben -- und ein Blockfund wird mit dem Share-Ziel gutgeschrieben.
 * Ein Ziel ueber der Blockdifficulty haette einem Fund mehr Gewicht gegeben,
 * als der Block an Arbeit gekostet hat (Befund S2).
 *
 * Ein ehrlicher Miner erreicht die Grenze nie: Bei 30 Sekunden je Share und
 * 600 Sekunden je Block liegt sein Ziel selbst mit der GESAMTEN Rechenleistung
 * des Netzes bei einem Zwanzigstel der Blockdifficulty.
 */
const SHARE_DECKEL_TEILER = 8n;
/**
 * Ab diesem Faktor wartet eine Anhebung nicht auf den naechsten Job.
 *
 * Das Ziel gilt je Job (siehe share()). Ein schneller Miner, der beim
 * Startwert 128 anfaengt, wuerde sonst bis zum naechsten Job -- 30 bis 45
 * Sekunden -- Hunderte Shares je Sekunde schicken. Ab Faktor 4 wird der
 * Job deshalb beendet: Der naechste Treffer darauf bekommt "job_expired",
 * und darauf holen alle Miner (App, Mini App, Kommandozeile, Node Core)
 * sofort neue Arbeit.
 */
const FRUEHES_ENDE_FAKTOR = 4n;
/** Eine Session gilt als tot, wenn so lange nichts kam. */
const SESSION_TIMEOUT_MS = 300_000;
/**
 * So lange bleibt der Platz im Pool einer Adresse vorgemerkt, deren letzte
 * Sitzung ABGELAUFEN ist (nicht: abgemeldet wurde).
 *
 * Ein Telefon, das die App einfriert, meldet sich nicht ab -- es verstummt,
 * und nach fuenf Minuten ist die Sitzung weg. Kommt die App zurueck,
 * eroeffnet der Miner still eine neue. Waere der Platz dann schon vergeben,
 * staende er vor einem vollen Pool, obwohl er nie gegangen ist.
 *
 * Wer sich ordentlich abmeldet, gibt den Platz sofort frei. Vorgemerkt wird
 * auch nur, wer gearbeitet hat: Eine Sitzung ohne einen einzigen angenommenen
 * Share hinterlaesst nichts.
 */
const PLATZ_VORGEMERKT_MS = 900_000;
/**
 * Ein Platz gehoert, wer arbeitet: So lange haelt eine offene Pool-Sitzung
 * ihren Platz nach ihrem letzten angenommenen Share. (Fuer eine Sitzung,
 * die noch nie einen geliefert hat, gilt PLATZ_ANWARTSCHAFT_MS.)
 *
 * Ohne diese Frist liesse sich ein Pool mit einer Handvoll Anmeldungen
 * zustellen, die nur alle paar Minuten einen Job abholen und nie rechnen.
 *
 * Wer arbeitet, liefert rund alle 30 Sekunden einen Share (SHARE_ZIEL_SEKUNDEN);
 * zehn Minuten ohne einen einzigen sind kein Pech mehr. Die Sitzung wird
 * dabei NICHT beendet -- sie zaehlt nur nicht mehr als belegter Platz, und
 * ein anderer kann ihn bekommen. Liefert sie wieder, zaehlt sie wieder.
 */
const PLATZ_OHNE_ARBEIT_MS = 600_000;
/**
 * So lange haelt eine Pool-Sitzung OHNE einen einzigen angenommenen Share
 * einen Platz -- gerechnet ab der Anmeldung.
 *
 * Bisher galten auch dafuer zehn Minuten (PLATZ_OHNE_ARBEIT_MS). Damit
 * liess sich der Pool mit einer Anmeldung je Platz alle zehn Minuten
 * kostenlos fuer Neue sperren (Befund S3). Ein Miner, der wirklich
 * rechnet, liefert seinen ersten Share beim Startwert 128 in Sekunden:
 * 128 * 65.536 = 8,4 Millionen Hashes. Zwei Minuten reichen auch fuer
 * langsame Geraete; danach braucht es einen Share, um den Platz zu halten.
 *
 * Die Sitzung selbst wird dabei NICHT beendet. Liefert sie spaeter doch,
 * zaehlt ihr Share wie jeder andere.
 */
const PLATZ_ANWARTSCHAFT_MS = 120_000;
/**
 * Hoechstens so viele Sitzungen OHNE Share halten je Absender einen Platz
 * auf Probe -- nur, wenn der Knoten den Absender kennt (--sender-ip).
 *
 * Mehr Geraete hinter einem Anschluss sperrt das nicht aus: Wer liefert,
 * belegt seinen Platz ueber den Share, nicht ueber die Anmeldung.
 */
const ANWARTSCHAFTEN_JE_ABSENDER = 2;
/**
 * Hoechstens so viele Sitzungen OHNE Share haelt der Knoten je Absender
 * (nur mit --sender-ip). Die naechste Anmeldung verdraengt die aelteste
 * davon -- abgelehnt wird niemand. Wer schon geliefert hat, wird nie
 * verdraengt.
 */
const SITZUNGEN_OHNE_ARBEIT_JE_ABSENDER = 32;
/**
 * Mehr offene Sitzungen haelt der Knoten nicht. Jede kostet Speicher, und
 * anmelden darf jeder -- ohne Grenze liesse sich der Knoten mit Anmeldungen
 * fuellen, bis ihm der Speicher ausgeht.
 *
 * Ist die Tabelle voll, verdraengt eine neue Anmeldung die aelteste Sitzung,
 * die noch nie einen Share geliefert hat. Bisher wurde dann JEDE neue
 * Anmeldung abgelehnt -- auch die eines Miners, der nach einem Neustart oder
 * einer Pause wieder einsteigen wollte (Befund S3). "too_many_sessions"
 * gibt es nur noch, wenn alle Sitzungen arbeiten.
 */
const SITZUNGEN_MAX = 5_000;
/** So viele Treffer merkt sich eine Sitzung je Job -- siehe share(). */
const TREFFER_JE_JOB_MAX = 10_000;
/** Die Angabe "platform" ist nur fuer die Anzeige; laenger wird sie nicht aufgehoben. */
const PLATFORM_MAX = 64;

/** Eine Anfrage, die nicht stimmt -- der Fehler liegt beim Absender, nicht hier. */
class AnfrageFehler extends Error {}
/**
 * So meldet sich der Miner der Android-App (NativMiner.java). Er behandelt
 * eine Ablehnung nur dann als endgueltig, wenn sie mit HTTP 200 kommt --
 * siehe session().
 */
const NATIV_MINER = /^YSKAR-Wallet-Nativ\//;

interface Session {
  id: string;
  address: Uint8Array;
  addressHex: string;
  extranonce: bigint;
  /** solo = eigene Coinbase, pool = Anteil an der Aufteilung. */
  modus: MiningModus;
  /**
   * Das Share-Ziel fuer den NAECHSTEN Job -- die Nachfuehrung schreibt
   * hierher. Fuer den laufenden Job gilt `jobZiel`.
   */
  shareDifficulty: bigint;
  /**
   * Das Share-Ziel des laufenden Jobs. Festgelegt, wenn der Job ausgegeben
   * wird; jeder Treffer auf diesen Job wird damit geprueft und mit genau
   * diesem Wert gutgeschrieben.
   *
   * WARUM JE JOB: Vorher galt das Ziel der Sitzung, und es aenderte sich
   * nach jedem angenommenen Share. Wer Treffer zurueckhielt und sie in der
   * richtigen Reihenfolge schnell hintereinander einreichte, trieb das Ziel
   * hoch und bekam seine besten Treffer mit dem hoeheren Wert gutgeschrieben
   * -- mehr, als er gerechnet hatte (Befund S2). Mit einem festen Wert je
   * Job bringt die Reihenfolge nichts mehr: Jeder Treffer zaehlt gleich.
   */
  jobZiel: bigint;
  /** Obergrenze des Share-Ziels, aus der Blockdifficulty des laufenden Jobs. */
  jobDeckel: bigint;
  /** Der laufende Job ist vorzeitig beendet (FRUEHES_ENDE_FAKTOR). */
  jobEnde: boolean;
  /** Zeitstempel des letzten Jobs. Jobs einer Sitzung gehen zeitlich nie zurueck. */
  jobZeit: bigint;
  /**
   * Messung fuer die Nachfuehrung: Beginn des laufenden Abschnitts (ms) und
   * die Summe "Sekunden je Difficulty-Einheit" der Abschnitte davor, seit
   * dem letzten Share. Ein Abschnitt endet, wenn ein Job mit anderem Ziel
   * ausgegeben wird -- siehe nachShare().
   */
  messungAb: number;
  messungSumme: number;
  /** Absender laut --sender-ip; null, wenn der Knoten ihn nicht kennen soll. */
  absender: string | null;
  /**
   * Normierte Messwerte: Sekunden je Difficulty-Einheit.
   *
   * NICHT die Abstaende selbst. Ein Abstand haengt davon ab, welches Ziel
   * gerade galt -- Werte aus verschiedenen Zielen zu mitteln ergibt Unsinn
   * und bringt die Anpassung zum Schwingen. Normiert ist der Wert dagegen
   * eine reine Geraeteeigenschaft: Sekunden je Difficulty-Einheit.
   */
  proben: number[];
  /** Zeitpunkt des letzten angenommenen Shares. */
  letzterShare: number | null;
  angenommen: number;
  abgelehnt: number;
  gestartet: number;
  zuletzt: number;
  platform: string | null;
  /** Job je Session -- die Extranonce steckt im Header. */
  jobId: string | null;
  /**
   * Nonces, die fuer den aktuellen Job schon gutgeschrieben wurden.
   *
   * Ohne dieses Gedaechtnis liesse sich EIN guter Treffer immer wieder
   * einreichen -- und er wuerde jedes Mal neu gutgeschrieben, solange er das
   * Share-Ziel erfuellt. Wer das tut, bekaeme einen Anteil, fuer den er nie
   * gerechnet hat, auf Kosten aller anderen im Pool.
   */
  gesehen: Set<string>;
}

export interface ServerOptionen {
  host?: string;
  port?: number;
  params?: ConsensusParams;
  /** Woher der Absender einer Anfrage kommt -- siehe MiningServer.absenderQuelle. */
  absender?: AbsenderQuelle;
}

/**
 * Woher der Knoten den Absender einer Anfrage nimmt.
 *
 *   'proxy'  -- aus dem LETZTEN Eintrag von X-Forwarded-For. Nur hinter
 *               einem Proxy, der diesen Kopf selbst setzt (Caddy tut das).
 *               Den letzten, weil nur der vom eigenen Proxy stammt; alles
 *               davor kann der Absender selbst hineinschreiben.
 *   'socket' -- die Adresse der Verbindung. Nur, wenn KEIN Proxy davor
 *               steht -- sonst waeren alle Anfragen "vom Proxy".
 *   null     -- gar nicht (Vorgabe). Die Grenzen je Absender gelten dann
 *               nicht; alles andere schon.
 */
export type AbsenderQuelle = 'proxy' | 'socket' | null;

export class MiningServer {
  private chain: ChainManager;
  private store: ChainStore;
  private pool: TxPool;
  private mining: MiningCoordinator;
  private params: ConsensusParams;

  private lesen: ReadApi;
  /**
   * Der Pool. Ohne ihn laeuft der Knoten wie bisher -- reines Solo-Mining.
   *
   * Ein Knoten OHNE Pool lehnt Pool-Sitzungen ab, statt sie stillschweigend
   * als Solo zu behandeln. Sonst minte jemand im Glauben, seine Arbeit
   * werde geteilt, und bekaeme nichts.
   *
   * Heisst absichtlich nicht "pool" -- so heisst schon der Mempool.
   */
  poolKoordinator: PoolCoordinator | null = null;

  /** Siehe AbsenderQuelle. */
  absenderQuelle: AbsenderQuelle = null;

  /**
   * Name, der in die Coinbase der Pool-Bloecke dieses Knotens kommt.
   * Der Explorer liest ihn heraus; ohne Namen steht dort "Unbekannt".
   */
  blockName: Uint8Array = new Uint8Array(0);

  /**
   * Meldungen der anderen Knoten (P2P, "+stats"). Ohne sie zeigt die
   * Zusammenfassung nur die eigenen Sitzungen -- wie bisher.
   */
  netzStatistik: NetzStatistik | null = null;

  /** Was dieser Knoten selbst misst -- fuer die eigene Meldung ins Netz. */
  lokaleStatistik(): LokaleStatistik {
    this.aufraeumen();
    return {
      adressen: [...new Set([...this.sessions.values()].map(s => s.addressHex))],
      hashrate: this.gesamtHashrate(),
      sessions: this.sessions.size,
    };
  }

  /** Eigene Sitzungen plus Meldungen der Peers. */
  private netzSumme(): NetzSumme {
    const lokal = this.lokaleStatistik();
    return this.netzStatistik?.summe(lokal)
      ?? { knoten: 1, miner: lokal.adressen.length, hashrate: lokal.hashrate, sessions: lokal.sessions };
  }

  /**
   * Wer im Pool einen Platz belegt.
   *
   * Gezaehlt werden ADRESSEN, nicht Geraete: Die Coinbase zahlt jede Adresse
   * genau einmal aus, egal wie viele Geraete fuer sie rechnen. Wer mit drei
   * Telefonen auf dieselbe Adresse mint, belegt einen Platz.
   *
   * Ein Platz ist belegt durch eine offene Pool-Sitzung, die arbeitet
   * (PLATZ_OHNE_ARBEIT_MS) -- oder durch eine, die gearbeitet hat und gerade
   * erst abgelaufen ist (PLATZ_VORGEMERKT_MS).
   *
   * `verbunden` sind dagegen ALLE Adressen mit offener Pool-Sitzung. Die
   * Zahl kann ueber `belegt` liegen: Wer angemeldet ist und nicht rechnet,
   * ist verbunden, haelt aber keinen Platz.
   *
   * BEWUSST NICHT gezaehlt wird, wer nur noch Arbeit im PPLNS-Fenster hat.
   * Das Fenster kennt keine Uhr: Steht der Pool eine Nacht still, laegen
   * dort am Morgen noch alle Adressen von gestern -- und ein voller Pool
   * bliebe voll, obwohl niemand mehr da ist.
   */
  private poolBelegung(): { verbunden: Set<string>; belegt: Set<string>; hashrate: number } {
    this.aufraeumen();
    const verbunden = new Set<string>();
    const belegt = new Set<string>();
    const jetzt = Date.now();
    const frist = jetzt - PLATZ_OHNE_ARBEIT_MS;
    const probe = this.anwartschaften(jetzt - PLATZ_ANWARTSCHAFT_MS);
    let hashrate = 0;
    for (const x of this.sessions.values()) {
      if (x.modus !== 'pool') continue;
      verbunden.add(x.addressHex);
      if (x.angenommen > 0) {
        if ((x.letzterShare ?? x.gestartet) > frist) belegt.add(x.addressHex);
      } else if (probe.has(x.id)) {
        belegt.add(x.addressHex);
      }
      const r = this.sessionHashrate(x);
      if (r) hashrate += r;
    }
    for (const v of this.vorgemerkt.values()) belegt.add(v.addressHex);
    return { verbunden, belegt, hashrate };
  }

  /**
   * Welche Pool-Sitzungen OHNE Share gerade einen Platz auf Probe halten.
   *
   * Juenger als die Frist (PLATZ_ANWARTSCHAFT_MS) -- und, wenn der Knoten
   * den Absender kennt, nur die neuesten ANWARTSCHAFTEN_JE_ABSENDER je
   * Absender. Ohne diese zweite Grenze haelt ein einziger Anschluss mit 63
   * Anmeldungen alle 63 Plaetze, solange er sich alle zwei Minuten neu
   * anmeldet.
   */
  private anwartschaften(frist: number): Set<string> {
    const je = new Map<string, Session[]>();
    const frei = new Set<string>();
    for (const x of this.sessions.values()) {
      if (x.modus !== 'pool' || x.angenommen > 0 || x.gestartet <= frist) continue;
      if (x.absender === null) { frei.add(x.id); continue; }
      const liste = je.get(x.absender) ?? [];
      liste.push(x);
      je.set(x.absender, liste);
    }
    for (const liste of je.values()) {
      liste.sort((a, b) => b.gestartet - a.gestartet);
      for (const x of liste.slice(0, ANWARTSCHAFTEN_JE_ABSENDER)) frei.add(x.id);
    }
    return frei;
  }

  /** Der Absender einer Anfrage -- siehe AbsenderQuelle. */
  private absenderVon(req: IncomingMessage): string | null {
    if (this.absenderQuelle === 'proxy') {
      const kopf = req.headers['x-forwarded-for'];
      const text = Array.isArray(kopf) ? kopf.join(',') : (kopf ?? '');
      const letzter = text.split(',').map(t => t.trim()).filter(Boolean).pop();
      if (letzter) return letzter.slice(0, 64);
      return req.socket.remoteAddress ?? null;
    }
    if (this.absenderQuelle === 'socket') return req.socket.remoteAddress ?? null;
    return null;
  }

  /**
   * Platz in der Sitzungstabelle schaffen -- fuer die Anmeldung von `absender`.
   *
   * Verdraengt wird nur, wer noch nie einen Share geliefert hat; zuerst die
   * aelteste solche Sitzung DESSELBEN Absenders (ab
   * SITZUNGEN_OHNE_ARBEIT_JE_ABSENDER), dann -- bei voller Tabelle -- die
   * aelteste ueberhaupt. Eine verdraengte Sitzung bekommt beim naechsten
   * Aufruf "session_inactive"; darauf melden sich alle Miner von selbst neu
   * an.
   *
   * @returns false, wenn die Tabelle voll ist und jede Sitzung arbeitet.
   */
  private platzSchaffen(absender: string | null): boolean {
    const ohneArbeit = (nurVon?: string) => [...this.sessions]
      .filter(([, x]) => x.angenommen === 0 && (nurVon === undefined || x.absender === nurVon))
      .sort(([, a], [, b]) => a.gestartet - b.gestartet)
      .map(([schluessel]) => schluessel);

    if (absender !== null) {
      const eigene = ohneArbeit(absender);
      while (eigene.length >= SITZUNGEN_OHNE_ARBEIT_JE_ABSENDER) {
        this.sessions.delete(eigene.shift()!);
      }
    }
    if (this.sessions.size < SITZUNGEN_MAX) return true;
    const weg = ohneArbeit();
    while (this.sessions.size >= SITZUNGEN_MAX && weg.length) this.sessions.delete(weg.shift()!);
    return this.sessions.size < SITZUNGEN_MAX;
  }

  /**
   * Was die App ueber diesen Pool wissen muss -- gemessen, nicht gemeldet.
   *
   * Mit `addressHex` sagt die Antwort zusaetzlich, ob diese Adresse schon
   * einen Platz hat (`dabei`). Dann darf sie auch in einen vollen Pool:
   * Ein zweites Geraet braucht keinen zweiten Platz.
   */
  private poolInfo(addressHex?: string): Record<string, unknown> | null {
    const pk = this.poolKoordinator;
    if (!pk) return null;
    const e = pk.einstellungen();
    const { verbunden, belegt, hashrate } = this.poolBelegung();
    const plaetze = pk.plaetze();
    return {
      name: e.name, feeBps: e.feeBps,
      feeBpsNext: e.feeBpsAbNaechstem,
      // `miner` hiess schon immer "Adressen mit offener Pool-Sitzung" und
      // bleibt das -- aeltere Fassungen der App zeigen genau diese Zahl.
      miner: verbunden.size, hashrate,
      plaetze,
      belegt: belegt.size,
      frei: Math.max(0, plaetze - belegt.size),
      voll: belegt.size >= plaetze,
      ...(addressHex === undefined ? {} : { dabei: belegt.has(addressHex) }),
      eintraege: pk.eintraege(),
      arbeitGesamt: pk.arbeitGesamt().toString(),
    };
  }
  private sessions = new Map<string, Session>();
  /**
   * Abgelaufene Pool-Sitzungen, deren Platz noch vorgemerkt ist.
   *
   * Je SITZUNG, nicht je Adresse: Friert Geraet 2 ein und meldet sich
   * Geraet 1 derselben Adresse ordentlich ab, darf das die Vormerkung von
   * Geraet 2 nicht mitnehmen -- und umgekehrt soll ein "Stopp" nach dem
   * Ablauf der eigenen Sitzung genau deren Vormerkung loeschen.
   */
  private vorgemerkt = new Map<string, { addressHex: string; bis: number }>();
  private naechsteExtranonce = 1n;
  private server = createServer((req, res) => {
    // Nichts, was eine Anfrage ausloest, darf den Knoten beenden.
    this.behandle(req, res).catch(e => {
      this.onFehler?.('Anfrage', e as Error);
      try { if (!res.headersSent) this.json(res, { error: 'internal' }, 500); else res.end(); }
      catch { /* Verbindung schon weg */ }
    });
  });

  /**
   * Wer diese Schnittstelle benutzen darf. Ohne Angabe: jeder -- so laeuft
   * ein oeffentlicher Knoten. Der Node Core setzt hier seine Regel: nur der
   * eigene PC, solange er keinen Pool fuer andere betreibt.
   */
  zulassen?: (req: IncomingMessage) => boolean;

  /** Wird bei jedem angenommenen Block gerufen -- fuer die Anzeige. */
  onBlock?: (h: number, hash: string, adresse: string) => void;

  /** Wird bei einem internen Fehler gerufen -- damit er sichtbar wird. */
  onFehler?: (wo: string, e: Error) => void;

  /**
   * Wohin ein gefundener Block weitergereicht wird.
   *
   * Solange es kein P2P gibt, ist das der Server. Ohne diese Weitergabe
   * laege ein lokal gefundener Block nur hier und wuerde beim naechsten
   * Block der anderen Seite verdraengt -- echte Arbeit fuer nichts.
   */
  upstream?: string;
  onUpstream?: (ergebnis: { ok: boolean; grund?: string; hoehe?: number }) => void;
  /** So lange darf die Weitergabe eines Blocks an den Spiegel dauern. */
  weitergabeFristMs = 15_000;

  /**
   * Eine ueber die Schnittstelle eingereichte Ueberweisung wurde aufgenommen.
   *
   * Das ist der Weg, ueber den die Wallet sendet -- und er endete bisher
   * hier. Andere Knoten erfuhren von der Ueberweisung nur, wenn sie
   * zufaellig in einem Block auftauchte, den dieser Knoten selbst fand.
   * Bis dahin haette jeder andere Knoten einen Block ohne sie gebaut.
   *
   * Gerufen wird das nur bei tatsaechlicher Aufnahme, nie bei einer
   * Ablehnung: Was hier nicht liegt, hat auch niemand anders zu sehen.
   */
  onNeueTx?: (hash: Uint8Array) => void;

  constructor(teile: {
    chain: ChainManager; store: ChainStore; pool: TxPool; mining: MiningCoordinator;
  }, opt: ServerOptionen = {}) {
    this.chain = teile.chain;
    this.store = teile.store;
    this.pool = teile.pool;
    this.mining = teile.mining;
    this.params = opt.params ?? MAINNET;
    this.absenderQuelle = opt.absender ?? null;

    /*
      Die Leseschnittstelle.

      Erst damit laesst sich die Mini App vom Server auf einen Knoten
      umstellen: Sie braucht Bloecke, Konten und Suche, nicht nur Jobs und
      Shares. Die Antworten haben genau die Form der Vercel-Routen -- die
      App soll eine andere Adresse bekommen, keinen anderen Code.
    */
    this.lesen = new ReadApi({
      chain: teile.chain, store: teile.store, pool: teile.pool, params: this.params,
      hashrate: () => this.netzSumme().hashrate || null,
      aktiveMiner: () => this.netzSumme().miner,
      miningSessions: () => this.netzSumme().sessions,
      knoten: () => this.netzSumme().knoten,
    });
  }

  listen(host = '127.0.0.1', port = 8645): Promise<void> {
    // Das Verzeichnis der Kette vor der ersten Anfrage aufbauen -- sonst
    // wartet die erste Abfrage von /account oder /tx darauf.
    this.lesen.vorbereiten();
    return new Promise((auf, ab) => {
      this.server.once('error', ab);
      this.server.listen(port, host, () => auf());
    });
  }

  close(): Promise<void> {
    return new Promise(auf => {
      this.server.close(() => auf());
      // Eine halb gesendete Anfrage hielte das Schliessen sonst minutenlang auf.
      this.server.closeAllConnections();
    });
  }

  aktiveSessions(): number {
    this.aufraeumen();
    return this.sessions.size;
  }

  gesamtHashrate(): number {
    this.aufraeumen();
    let summe = 0;
    for (const s of this.sessions.values()) {
      const r = this.sessionHashrate(s);
      if (r) summe += r;
    }
    return summe;
  }

  // ------------------------------------------------- Auskunft fuer Betreiber

  /**
   * Der Pool dieses Knotens in Zahlen -- dieselben wie unter GET /pool.
   * null, wenn der Knoten keinen Pool betreibt.
   */
  poolAuskunft(addressHex?: string): Record<string, unknown> | null {
    return this.poolInfo(addressHex);
  }

  /**
   * Die offenen Pool-Sitzungen, eine Zeile je Sitzung.
   *
   * Fuer die Anzeige beim Betreiber (Node Core). Nach aussen gibt es diese
   * Liste nicht: GET /pool nennt Zahlen, keine Adressen.
   */
  poolSitzungen(): { addressHex: string; hashrate: number | null;
                     letzterShare: number | null; angenommen: number;
                     platform: string | null }[] {
    this.aufraeumen();
    return [...this.sessions.values()]
      .filter(s => s.modus === 'pool')
      .map(s => ({
        addressHex: s.addressHex,
        hashrate: this.sessionHashrate(s),
        letzterShare: s.letzterShare,
        angenommen: s.angenommen,
        platform: s.platform,
      }));
  }

  /**
   * Alle Pool-Sitzungen beenden und vorgemerkte Plaetze loeschen.
   *
   * Fuer den Fall, dass der Betreiber den Pool abschaltet. Ohne diesen
   * Schritt liefen die Sitzungen weiter -- und weil es keinen Pool mehr
   * gibt, bekaemen sie Arbeit mit einer Coinbase an EINE Adresse: Der Miner
   * glaubte zu teilen und minte solo. Mit beendeter Sitzung meldet sich
   * sein Miner neu an, erfaehrt "pool_unavailable" und haelt an.
   *
   * @returns wie viele Sitzungen beendet wurden
   */
  beendePoolSitzungen(): number {
    let n = 0;
    for (const [id, s] of this.sessions) {
      if (s.modus !== 'pool') continue;
      this.sessions.delete(id);
      n++;
    }
    this.vorgemerkt.clear();
    return n;
  }

  // ------------------------------------------------------------ Weiterleitung

  private async behandle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    /*
      Die Adresse der Anfrage kommt von aussen und kann Unsinn sein: Schon
      "GET //" laesst sich nicht als Adresse lesen. Das darf nur diese eine
      Anfrage kosten -- frueher beendete es den ganzen Knoten.
    */
    let url: URL;
    try { url = new URL(req.url ?? '/', 'http://x'); }
    catch { return this.json(res, { error: 'bad_request' }, 400); }
    const pfad = url.pathname.replace(/^\/api\/v2/, '');

    if (this.zulassen && !this.zulassen(req)) {
      return this.json(res, { error: 'forbidden' }, 403);
    }

    try {
      if (req.method === 'POST' && pfad === '/session') {
        const s = await this.session(req);
        return this.json(res, s.body, s.status);
      }
      if (req.method === 'POST' && pfad === '/session/stop') {
        const b = await this.body(req);
        // Abgemeldet heisst: Der Platz im Pool ist frei -- sofort, sofern
        // nicht ein anderes Geraet derselben Adresse weiterrechnet. Das gilt
        // auch, wenn die Sitzung inzwischen abgelaufen und nur noch
        // vorgemerkt war (App kam aus dem Hintergrund zurueck: "Stopp").
        this.sessions.delete(String(b.sessionId));
        this.vorgemerkt.delete(String(b.sessionId));
        return this.json(res, { stopped: true });
      }
      /*
        Der Pool dieses Knotens, fuer jeden lesbar.

        Bisher erfuhr man Gebuehr und Minerzahl erst NACH dem Anmelden --
        also zu spaet, um sich zwischen zwei Pools zu entscheiden. Mit
        ?address= sagt die Antwort auch, ob diese Adresse schon dabei ist.

        Ein Knoten ohne Pool antwortet mit 404. Aeltere Knoten kennen die
        Route gar nicht und antworten mit 404 "not_found" -- daran erkennt
        die App, dass sie hier keine Platzzahl bekommt.
      */
      if (req.method === 'GET' && pfad === '/pool') {
        let hex: string | undefined;
        const adr = url.searchParams.get('address');
        if (adr) {
          try { hex = toHex(decodeAddress(adr)); }
          catch { return this.json(res, { error: 'bad_address' }, 400); }
        }
        const info = this.poolInfo(hex);
        return info
          ? this.json(res, info)
          : this.json(res, { error: 'pool_unavailable',
                             detail: 'Dieser Knoten betreibt keinen Pool.' }, 404);
      }
      if (req.method === 'GET' && pfad === '/job') {
        return this.json(res, this.job(url.searchParams.get('session')));
      }
      if (req.method === 'POST' && pfad === '/share') {
        return this.json(res, this.share(await this.body(req)));
      }
      /*
        Erst die eigenen Routen, dann die Leseschnittstelle.

        Reihenfolge ist wichtig: /summary beantwortet die Leseschnittstelle
        vollstaendiger als die alte Fassung hier -- sie kennt Chain Work
        und die Zustandswurzel.
      */
      const gelesen = this.lesen.behandle(
        req.method ?? 'GET', pfad, url.searchParams);
      if (gelesen) return this.json(res, gelesen.body, gelesen.status);
      if (req.method === 'GET' && pfad === '/status') {
        return this.json(res, this.status());
      }

      /*
        Eine Transaktion einreichen.

        Sie geht in den lokalen Mempool und wird dort vollstaendig geprueft.
        Weitergegeben wird sie noch nicht -- dafuer fehlt die Verbreitung
        ueber P2P, und etwas Ungeprueftes weiterzureichen waere ohnehin
        falsch herum.
      */
      if (req.method === 'POST' && pfad === '/tx') {
        return this.json(res, await this.tx(req));
      }
      this.json(res, { error: 'not_found' }, 404);
    } catch (e) {
      // Unlesbare Anfrage: Das ist kein Fehler dieses Knotens.
      if (e instanceof AnfrageFehler) {
        return this.json(res, { error: 'bad_request', detail: e.message }, 400);
      }
      /*
        Stapelabzug auf die Konsole.

        Bisher stand hier nur ein HTTP 500, und beim Miner erschien
        "Einreichen fehlgeschlagen: HTTP 500" -- ohne jeden Hinweis worauf.
        Genau so ein Fall kostete einen Abend Rätselraten.
      */
      /*
        Der Fehlertext bleibt im Protokoll des Knotens (onFehler) und geht
        NICHT nach aussen. Er kann Pfade, Dateinamen und innere Zustaende
        enthalten -- Auskunft fuer den Betreiber, nicht fuer jeden, der eine
        Anfrage schicken kann (Befund S5). Wo es passiert ist, darf der
        Absender wissen: Das ist seine eigene Anfrage.
      */
      const fehler = e as Error;
      this.onFehler?.(`${req.method} ${pfad}`, fehler);
      this.json(res, {
        error: 'internal',
        detail: 'Interner Fehler des Knotens -- Einzelheiten stehen in seinem Protokoll.',
        where: `${req.method} ${pfad}`,
      }, 500);
    }
  }

  private json(res: ServerResponse, daten: unknown, status = 200): void {
    const text = JSON.stringify(daten);
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
  }

  /**
   * Rumpf einlesen, mit Groessengrenze.
   *
   * Ohne Grenze kann eine einzige Anfrage den Knoten den Speicher kosten.
   * Ein Share ist rund hundert Byte; 64 KB sind grosszuegig.
   */
  private body(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((auf, ab) => {
      let roh = '';
      req.on('data', (stueck: Buffer) => {
        roh += stueck;
        if (roh.length > 65536) { req.destroy(); ab(new AnfrageFehler('Anfrage zu gross')); }
      });
      req.on('end', () => {
        let wert: unknown;
        try { wert = roh ? JSON.parse(roh) : {}; }
        catch { return ab(new AnfrageFehler('kein gueltiges JSON')); }
        // Erwartet wird ein Objekt -- "null" oder eine Liste ist keins.
        if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) {
          return ab(new AnfrageFehler('kein JSON-Objekt'));
        }
        auf(wert as Record<string, unknown>);
      });
      req.on('error', ab);
    });
  }

  // ----------------------------------------------------------------- Session

  private async session(req: IncomingMessage):
      Promise<{ status: number; body: Record<string, unknown> }> {
    const ok = (body: Record<string, unknown>) => ({ status: 200, body });
    const b = await this.body(req);
    const absender = this.absenderVon(req);
    if (typeof b.address !== 'string') return ok({ error: 'missing_address' });

    let roh: Uint8Array;
    try { roh = decodeAddress(b.address); }
    catch { return ok({ error: 'bad_address' }); }

    /*
      Solo oder Pool -- die Sitzung legt das beim Anmelden fest und behaelt
      es. Ein Wechsel mitten im Lauf wuerde Arbeit im PPLNS-Fenster in der
      Schwebe lassen; wer wechseln will, meldet sich neu an.

      Ein Knoten ohne Pool LEHNT eine Pool-Sitzung ab. Sie stillschweigend
      als Solo zu fuehren waere schlimmer: Der Miner glaubte, seine Arbeit
      werde geteilt, und bekaeme nichts.
    */
    const modus: MiningModus = b.mode === 'pool' ? 'pool' : 'solo';
    if (modus === 'pool' && !this.poolKoordinator) {
      return ok({ error: 'pool_unavailable',
                  detail: 'Dieser Knoten betreibt keinen Pool.' });
    }

    this.aufraeumen();
    const addressHex = toHex(roh);

    /*
      Ein voller Pool nimmt keine NEUE Adresse mehr an.

      Die Kette zahlt je Block hoechstens 64 Adressen aus (63, wenn der
      Betreiber eine Gebuehr nimmt). Wer als 65. dazukaeme, minte mit und
      fiele bei der Abrechnung heraus, solange er zu den Kleinsten gehoert
      -- also genau der Neue. Lieber hier ehrlich ablehnen.

      Wer schon einen Platz hat, darf weitere Geraete anmelden: Sie rechnen
      fuer dieselbe Adresse und brauchen keinen zweiten Platz.

      HTTP 409, nicht 200: Die Web-App behandelt jede Antwort mit 200 als
      gelungene Anmeldung und meldete sonst "Dieser Knoten betreibt keinen
      Pool" -- das Falsche; der Kommandozeilen-Miner minte mit einer
      Sitzung weiter, die es nicht gibt. Bei 409 zeigen beide den Text aus
      `detail`. Das Kuerzel "pool_full" steht absichtlich auch IM Text:
      Daran erkennt die Oberflaeche den Fall und zeigt ihn in der Sprache
      des Nutzers.

      AUSNAHME: der Miner der Android-App in seiner heutigen Fassung
      (NativMiner.java, meldet sich als "YSKAR-Wallet-Nativ/1"). Fuer ihn ist
      alles ab 400 ein Netzfehler -- er versuchte es endlos weiter und liesse
      das Telefon dabei rechnen, ohne dass etwas gutgeschrieben wird. Eine
      Ablehnung nimmt er nur aus einer 200-Antwort mit `error` an und haelt
      dann sauber an. Er bekommt deshalb dieselbe Auskunft mit 200.
    */
    if (modus === 'pool' && this.poolKoordinator) {
      const { belegt } = this.poolBelegung();
      const plaetze = this.poolKoordinator.plaetze();
      if (!belegt.has(addressHex) && belegt.size >= plaetze) {
        const nativ = NATIV_MINER.test(String(req.headers['user-agent'] ?? ''));
        return { status: nativ ? 200 : 409, body: {
          error: 'pool_full',
          detail: `Pool voll: alle ${plaetze} Plätze sind belegt (pool_full).`,
          plaetze, belegt: belegt.size,
        } };
      }
    }

    if (!this.platzSchaffen(absender)) {
      return ok({ error: 'too_many_sessions', detail: 'Der Knoten hat zu viele offene Sitzungen.' });
    }

    const s: Session = {
      id: randomUUID(),
      address: roh,
      addressHex,
      // Eindeutig je Session: Sie trennt die Nonce-Raeume. Zwei Miner
      // koennen denselben Treffer dadurch gar nicht finden.
      extranonce: this.naechsteExtranonce++,
      modus,
      shareDifficulty: SHARE_START,
      jobZiel: SHARE_START,
      jobDeckel: SHARE_START,
      jobEnde: false,
      jobZeit: 0n,
      messungAb: Date.now(),
      messungSumme: 0,
      absender,
      proben: [],
      letzterShare: null,
      angenommen: 0, abgelehnt: 0,
      gestartet: Date.now(), zuletzt: Date.now(),
      platform: typeof b.platform === 'string' ? b.platform.slice(0, PLATFORM_MAX) : null,
      jobId: null,
      gesehen: new Set(),
    };
    this.sessions.set(s.id, s);

    const gleiche = [...this.sessions.values()]
      .filter(x => x.addressHex === s.addressHex).length;

    return ok({
      sessionId: s.id,
      extranonce: s.extranonce.toString(),
      mode: s.modus,
      pool: s.modus === 'pool' && this.poolKoordinator ? this.poolInfo(s.addressHex) : null,
      shareDifficulty: s.shareDifficulty.toString(),
      address: b.address,
      concurrentSessions: gleiche,
    });
  }

  // --------------------------------------------------------------------- Job

  private job(sessionId: string | null): Record<string, unknown> {
    const s = sessionId ? this.sessions.get(sessionId) : null;
    if (!s) return { error: 'session_inactive' };
    s.zuletzt = Date.now();

    // Jede Session bekommt einen eigenen Job: Die Extranonce steht im
    // Header, und state_root haengt am Kettenkopf. Ein geteilter Job waere
    // fuer beide falsch.
    /*
      Pool-Sitzungen bekommen eine Coinbase mit der aktuellen Aufteilung,
      Solo-Sitzungen eine an ihre eigene Adresse.

      Die Aufteilung wird als FUNKTION uebergeben, nicht als fertige Liste:
      Sie muss die tatsaechliche Bruttosumme kennen, und die steht erst
      fest, wenn der Blockbau die Transaktionen ausgewaehlt hat.
    */
    const pk = this.poolKoordinator;
    const istPool = s.modus === 'pool' && !!pk;
    const anteile = istPool
      ? (brutto: bigint) => {
          const netz = this.chain.tip()?.difficulty ?? 1n;
          const hoehe = this.chain.height() + 1;
          /*
            Die Transaktionsgebuehren werden mit der Belohnung verteilt
            (Issue #12): nach Arbeit, und die Pool-Gebuehr gilt fuer beides.
            Bisher rechnete pk.coinbase() ohne sie, und die ganze Differenz
            ging an den groessten Anteil -- unter Umstaenden den Betreiber.

            Der Blockbau kennt die echten Gebuehren erst hier und reicht die
            Summe als `brutto` herein: brutto = Belohnung + Gebuehren.
          */
          const gebuehren = brutto - rewardAt(hoehe);
          const a = pk!.coinbase(hoehe, gebuehren > 0n ? gebuehren : 0n, netz);
          if (!a) return [];
          /*
            abrechnen() verteilt `brutto` damit auf die Einheit genau. Die
            Angleichung unten bleibt nur als Sicherung, falls die Summe je
            abweicht -- die Coinbase muss exakt brutto auszahlen.
          */
          const summe = a.outputs.reduce((m, o) => m + o.amount, 0n);
          const rest = brutto - summe;
          if (rest === 0n) return a.outputs;
          const out = a.outputs.map(o => ({ ...o }));
          let groesster = 0;
          for (let i = 1; i < out.length; i++) {
            if (out[i].amount > out[groesster].amount) groesster = i;
          }
          out[groesster].amount += rest;
          return out;
        }
      : undefined;

    const job: MiningJob = this.mining.createJob(
      s.address, s.extranonce,
      // Der Name des Knotens gehoert nur in Pool-Bloecke. Ein fremder
      // Solo-Miner baut seinen eigenen Block.
      istPool ? this.blockName : new Uint8Array(0),
      anteile,
      /*
        Zeitstempel einer Sitzung gehen nie zurueck, und nach einem
        vorzeitigen Ende muss der neue Job eine ANDERE Kennung haben als der
        beendete -- sonst haette er dasselbe Ziel. Innerhalb derselben
        Sekunde ergaebe dieselbe Vorlage dieselbe Kennung; eine Sekunde
        spaeter macht sie verschieden. Holt der Miner danach (mehrere
        Anfragen auf einmal sind bei der Kommandozeile moeglich) noch
        einmal, bekommt er wieder genau diesen Job und keinen dritten.
      */
      { mindestZeit: s.jobEnde ? s.jobZeit + 1n : (s.jobZeit > 0n ? s.jobZeit : undefined) });
    s.jobZeit = BigInt(job.timestamp);

    /*
      Neuer Job: neues Ziel. Es gilt fuer jeden Treffer auf diesen Job und
      aendert sich bis zum naechsten Job nicht (siehe Session.jobZiel).

      Ausnahme: Ein vorzeitig beendeter Job, fuer den trotzdem keine neue
      Kennung entstand (der Zeitstempel stiess an seine Obergrenze). Dann
      gilt das neue Ziel ab sofort fuer denselben Job -- das kann nur eine
      ANHEBUNG sein, und eine Anhebung schreibt niemandem mehr gut, als er
      gerechnet hat.
    */
    if (s.jobId !== job.jobId || s.jobEnde) {
      if (s.jobId !== job.jobId) s.gesehen.clear();
      s.jobId = job.jobId;
      s.jobDeckel = shareDeckel(BigInt(job.difficultyWert));
      const neuesZiel = s.shareDifficulty < 1n ? 1n
        : s.shareDifficulty > s.jobDeckel ? s.jobDeckel : s.shareDifficulty;
      // Abschnitt der Messung abschliessen, wenn sich das Ziel aendert.
      if (neuesZiel !== s.jobZiel && s.letzterShare !== null) {
        const jetzt = Date.now();
        s.messungSumme += (jetzt - s.messungAb) / 1000 / Number(s.jobZiel);
        s.messungAb = jetzt;
      }
      s.jobZiel = neuesZiel;
      s.jobEnde = false;
    }

    return {
      jobId: job.jobId,
      height: job.height,
      version: job.version,
      prevHash: job.prevHash,
      merkleRoot: job.merkleRoot,
      stateRoot: job.stateRoot,
      timestamp: job.timestamp,
      // Rohes Header-Feld -- aeltere Miner schreiben es so in den Header.
      difficulty: job.difficulty,
      difficultyWert: job.difficultyWert,
      txCount: job.txCount,
      extranonce: job.extranonce,
      // Der Miner rechnet gegen das SHARE-Ziel, nicht gegen das Blockziel.
      // Sonst saehe er stundenlang keinen Treffer und wuesste nicht, ob er
      // ueberhaupt arbeitet.
      target: toHex(zielBytes(zielAus(s.jobZiel))),
      shareDifficulty: s.jobZiel.toString(),
    };
  }

  // ------------------------------------------------------------------- Share

  private share(b: Record<string, unknown>): Record<string, unknown> {
    const s = this.sessions.get(String(b.sessionId));
    if (!s) return { accepted: false, reason: 'session_inactive' };
    s.zuletzt = Date.now();

    const jobId = String(b.jobId);
    if (s.jobId !== jobId) {
      // Fremde Jobs abweisen: Sonst koennten zwei Sessions dieselbe Nonce
      // auf denselben Job einreichen und beide gutgeschrieben bekommen.
      return { accepted: false, reason: 'job_foreign' };
    }
    // Vorzeitig beendet (FRUEHES_ENDE_FAKTOR): Der Miner soll neue Arbeit
    // mit dem neuen Ziel holen. Kein Fehler des Miners -- nicht gezaehlt.
    if (s.jobEnde) return { accepted: false, reason: 'job_expired' };

    let nonce: bigint;
    try { nonce = BigInt(String(b.nonce)); }
    catch { return { accepted: false, reason: 'malformed' }; }
    if (nonce < 0n || nonce > 0xffff_ffff_ffff_ffffn) return { accepted: false, reason: 'malformed' };

    // Schon gutgeschrieben: Derselbe Treffer zaehlt kein zweites Mal.
    const treffer = nonce.toString();
    if (s.gesehen.has(treffer)) {
      s.abgelehnt++;
      return { accepted: false, reason: 'duplicate' };
    }
    // Voll: Der Miner holt sich neue Arbeit, und das Gedaechtnis beginnt neu.
    if (s.gesehen.size >= TREFFER_JE_JOB_MAX) return { accepted: false, reason: 'job_expired' };

    /*
      Die Difficulty, gegen die der Miner GERADE arbeitet -- nicht die des
      letzten Blocks.

      Vorher stand hier chain.tip()?.difficulty. Das ist die Difficulty des
      fertigen Blocks; der Miner arbeitet aber am naechsten, und dessen
      Difficulty wird per LWMA neu berechnet. Beide koennen deutlich
      auseinanderliegen. Die App zeigt diesen Wert als "Ziel" an -- und ein
      Ziel, das ein erledigter Block bereits erreicht hat, ist keins.

      aktuelleArbeit() liefert genau die Vorgaben des offenen Jobs. Nur
      falls noch keiner gebaut wurde, bleibt der Tip als Rueckfall.
    */
    const netzDifficulty = this.mining.aktuelleArbeit()?.difficulty
      ?? BigInt(this.chain.tip()?.difficulty ?? 0n);
    const r = this.mining.submitNonce(jobId, nonce);

    if (!r.ok) {
      s.abgelehnt++;
      return { accepted: false, reason: r.grund, detail: r.detail };
    }

    if (r.block) {
      /*
        Ab hier ist der Block ANGENOMMEN und steht in der Kette.

        Was jetzt noch schiefgeht -- Anzeige, Weitergabe, Zahlenformat --
        darf dem Miner niemals als Fehlschlag gemeldet werden. Er hat den
        Block gefunden, und das ist die Wahrheit. Bisher fuehrte ein Fehler
        an dieser Stelle zu "Einreichen fehlgeschlagen: HTTP 500", waehrend
        der Block laengst in der Kette stand.

        Deshalb: Alles Weitere einzeln abgesichert, die Antwort steht fest.
      */
      /*
        Gutgeschrieben wird das Ziel des Jobs -- wie bei jedem anderen
        Treffer auch. Es liegt nie ueber SHARE_DECKEL_TEILER-tel der
        Blockdifficulty; vorher konnte es darueber liegen (Befund S2).
      */
      const antwort = {
        accepted: true, block: true,
        height: r.height, reward: r.reward, hash: r.hash,
        credited: s.jobZiel.toString(),
        shareDifficulty: s.jobZiel.toString(),
        achieved: (netzDifficulty > 0n ? netzDifficulty : s.jobZiel).toString(),
        required: s.jobZiel.toString(),
        blockDifficulty: netzDifficulty.toString(),
      };

      try {
        /*
          Die Arbeit dieses Shares GEHOERT DEM MINER -- auch wenn sie
          zufaellig einen ganzen Block getroffen hat.

          Zuerst eintragen, dann das Fenster weiterschieben: Sonst faellt
          genau der Share heraus, der den Block gefunden hat. Auf dem
          Mainnet ist das einer von rund tausend; im Testnetz ist JEDER
          Share zugleich ein Block, weil die Blockdifficulty 1 ist -- dort
          bliebe das Fenster sonst immer leer.
        */
        if (s.modus === 'pool' && this.poolKoordinator) {
          this.poolKoordinator.share(s.address, s.jobZiel);
        }

        s.gesehen.add(treffer);
        s.angenommen++;
        this.nachShare(s);
        this.mining.invalidate();

        /*
          Nach einem Pool-Block das Fenster weiterschieben.

          Es wird NICHT geleert -- genau das ist der Unterschied zur
          proportionalen Verteilung. Wer kurz vor einem Fund einsteigt,
          bekommt deshalb nicht dasselbe wie einer, der lange mitgerechnet
          hat. Aufgeraeumt wird nur, was das Fenster ohnehin nicht mehr
          erreichen kann.
        */
        if (s.modus === 'pool' && this.poolKoordinator) {
          this.poolKoordinator.nachBlock(this.chain.tip()?.difficulty ?? 1n);
        }

        this.onBlock?.(r.height, r.hash, s.addressHex);
      } catch (e) {
        this.onFehler?.('nach Blockfund', e as Error);
      }

      // Nicht abwarten: Der Miner bekommt seine Antwort sofort, die
      // Weitergabe darf ihn nicht aufhalten.
      this.weitergeben(r.hash).catch(e =>
        this.onFehler?.('Weitergabe', e as Error));

      return antwort;
    }

    // Kein Block. Reicht es fuer einen Share?
    const erreicht = BigInt(r.achieved);
    if (erreicht < s.jobZiel) {
      s.abgelehnt++;
      return {
        accepted: false, reason: 'low_difficulty',
        achieved: erreicht.toString(),
        required: s.jobZiel.toString(),
        blockDifficulty: netzDifficulty.toString(),
      };
    }

    s.gesehen.add(treffer);
    s.angenommen++;
    const vorher = s.jobZiel;
    this.nachShare(s);
    // Weit daneben: nicht bis zum naechsten Job warten.
    if (s.shareDifficulty >= s.jobZiel * FRUEHES_ENDE_FAKTOR) s.jobEnde = true;

    /*
      Die Arbeit in den Pool eintragen.

      OHNE DIESE ZEILEN baut der Knoten zwar Pool-Jobs und schreibt seinen
      Namen in die Bloecke -- aber das PPLNS-Fenster bleibt leer, coinbase()
      liefert null, und buildBlock faellt auf eine Coinbase der Fassung 1 mit
      EINEM Empfaenger zurueck. Von aussen sieht das aus wie ein Pool, zahlt
      aber wie Solo.

      Mit der Adresse, die beim ANMELDEN galt -- nicht einer jetzt
      gemeldeten. Sonst koennte jemand die Auszahlungsadresse nachtraeglich
      umbiegen und sich fremde Arbeit gutschreiben.

      Gezaehlt wird das Ziel des Jobs (`vorher`), nicht die ERREICHTE
      Difficulty. Sonst zaehlte ein Glueckstreffer wie tausend Shares, und
      wer Glueck hat, bekaeme mehr als wer arbeitet.
    */
    if (s.modus === 'pool' && this.poolKoordinator) {
      this.poolKoordinator.share(s.address, vorher);
    }

    /*
      shareDifficulty ist das Ziel des LAUFENDEN Jobs, nicht das naechste.
      Alle Miner uebernehmen diesen Wert sofort fuer ihre Arbeit; meldete
      der Knoten hier schon das naechste Ziel, rechneten sie am laufenden
      Job gegen ein anderes als das, mit dem er prueft. Das neue Ziel kommt
      mit dem naechsten Job.
    */
    return {
      accepted: true, block: false,
      credited: vorher.toString(),
      shareDifficulty: s.jobZiel.toString(),
      achieved: erreicht.toString(),
      required: vorher.toString(),
      blockDifficulty: netzDifficulty.toString(),
    };
  }

  /**
   * Share-Ziel nachfuehren.
   *
   * Angestrebt wird ein Share alle 30 Sekunden. Gemessen wird ueber die
   * letzten acht, nicht ueber den einzelnen Abstand: Die Abstaende sind
   * exponentialverteilt, und wer auf jeden einzelnen reagiert, bringt das
   * Ziel zum Schwingen statt es einzuregeln. Diesen Fehler hatten wir in
   * der ersten Fassung schon einmal.
   */
  private nachShare(s: Session): void {
    const jetzt = Date.now();
    const vorher = s.letzterShare;
    s.letzterShare = jetzt;
    if (vorher === null) { s.messungAb = jetzt; s.messungSumme = 0; return; }

    /*
      Die Zeit seit dem letzten Share, je Abschnitt durch das Ziel geteilt,
      das in diesem Abschnitt galt.

      Seit das Ziel je Job gilt, wechselt es ZWISCHEN zwei Shares -- beim
      naechsten Job. Wer die ganze Wartezeit durch das neue Ziel teilte,
      rechnete die Zeit unter dem alten, leichteren Ziel zu schwer: Die
      Messung saehe einen schnelleren Miner, als er ist, und zoege das Ziel
      zu hoch (im Ende-zu-Ende-Test: 1852 statt rund 730). Die Abschnitte
      fuehrt job() mit (messungSumme), hier kommt der letzte dazu.
    */
    const probe = s.messungSumme + (jetzt - s.messungAb) / 1000 / Number(s.jobZiel);
    s.messungSumme = 0;
    s.messungAb = jetzt;
    if (!(probe > 0)) return;

    /*
      Normieren, bevor gemittelt wird.

      Der rohe Abstand haengt davon ab, welches Ziel gerade galt. Einen
      Abstand bei Ziel 51 mit einem bei Ziel 588 zu mitteln ergibt Unsinn
      -- und genau daran hat die Anpassung geschwungen: 51, 26, 49, 147,
      588, 2352.

      Sekunden je Difficulty-Einheit ist dagegen eine reine
      Geraeteeigenschaft und vom Ziel unabhaengig:

          probe    = sekunden / difficulty   (je Abschnitt, siehe oben)
          hashrate = 2^16 / probe
          neuesZiel = zielSekunden / mittelwert(proben)
    */
    s.proben.push(probe);
    if (s.proben.length > 8) s.proben.shift();
    if (s.proben.length < 3) return;

    const mittel = s.proben.reduce((a, b) => a + b, 0) / s.proben.length;
    if (!(mittel > 0)) return;

    const ziel = SHARE_ZIEL_SEKUNDEN / mittel;
    const jetzigeZahl = Number(s.shareDifficulty);

    // Totzone: kleine Abweichungen nicht nachregeln, sonst zappelt das Ziel
    // bei jedem Share.
    const faktor = ziel / jetzigeZahl;
    if (faktor > 0.7 && faktor < 1.4) return;

    // Deckelung, damit ein einzelner Ausreisser nicht durchschlaegt.
    const gedeckelt = Math.max(0.25, Math.min(4, faktor));
    const neu = BigInt(Math.max(1, Math.round(jetzigeZahl * gedeckelt)));
    // Nie ueber die Obergrenze (SHARE_DECKEL_TEILER) -- auch nicht als
    // Vormerkung fuer den naechsten Job.
    s.shareDifficulty = neu > s.jobDeckel ? s.jobDeckel : neu;
  }

  /** Hashrate dieser Session aus den normierten Messwerten. */
  private sessionHashrate(s: Session): number | null {
    if (s.proben.length < 2) return null;
    const mittel = s.proben.reduce((a, b) => a + b, 0) / s.proben.length;
    return mittel > 0 ? 65536 / mittel : null;
  }

  /**
   * Einen Block an die Gegenstelle weitergeben -- den Spiegel.
   *
   * Der Block wird aus der eigenen Ablage gelesen, nicht aus dem
   * Arbeitsspeicher -- so geht genau das hinaus, was lokal geprueft und
   * festgeschrieben wurde.
   *
   * Oeffentlich, weil nicht nur selbst gefundene Bloecke dorthin gehoeren:
   * Sobald der Knoten die Wahrheit ist, muss AUCH ein Block, der ueber
   * P2P hereinkam, im Spiegel landen. Sonst bliebe Supabase stehen,
   * waehrend die Kette weiterlaeuft.
   */
  async weitergeben(hashHex: string): Promise<void> {
    if (!this.upstream) return;
    const gespeichert = this.store.get(fromHex(hashHex));
    if (!gespeichert) {
      this.onUpstream?.({ ok: false, grund: 'lokal nicht gefunden' });
      return;
    }
    try {
      const res = await fetch(`${this.upstream}/api/v2/block`, {
        method: 'POST',
        headers: spiegelKopf(),
        body: JSON.stringify({ raw: toHex(gespeichert.body) }),
        /*
          Mit Frist. Ohne sie wartete eine Weitergabe ewig, wenn die
          Gegenstelle die Verbindung annimmt und nie antwortet (Befund S5).
          Der Block ist dann nicht verloren: Der Dienst yskar-spiegel
          schiebt liegengebliebene Bloecke nach.
        */
        signal: AbortSignal.timeout(this.weitergabeFristMs),
      });
      const body = await res.json().catch(() => ({}));
      this.onUpstream?.(body.accepted
        ? { ok: true, hoehe: body.height }
        : { ok: false, grund: body.detail ?? body.reason ?? `HTTP ${res.status}` });
    } catch (e) {
      this.onUpstream?.({ ok: false, grund: String((e as Error).message) });
    }
  }

  private aufraeumen(): void {
    const jetzt = Date.now();
    const grenze = jetzt - SESSION_TIMEOUT_MS;
    for (const [id, s] of this.sessions) {
      if (s.zuletzt >= grenze) continue;
      this.sessions.delete(id);
      // Abgelaufen, nicht abgemeldet: Der Platz im Pool bleibt eine Weile
      // vorgemerkt (siehe PLATZ_VORGEMERKT_MS) -- aber nur fuer jemanden,
      // der auch gearbeitet hat.
      if (s.modus === 'pool' && s.angenommen > 0) {
        this.vorgemerkt.set(id, {
          addressHex: s.addressHex,
          bis: s.zuletzt + SESSION_TIMEOUT_MS + PLATZ_VORGEMERKT_MS,
        });
      }
    }
    for (const [id, v] of this.vorgemerkt) {
      if (v.bis <= jetzt) this.vorgemerkt.delete(id);
    }
  }

  // ---------------------------------------------------------------- Auskunft

  /** Eine Transaktion in den lokalen Mempool. */
  private async tx(req: IncomingMessage): Promise<Record<string, unknown>> {
    const b = await this.body(req);
    if (typeof b.raw !== 'string' || !/^[0-9a-fA-F]+$/.test(b.raw)) {
      return { accepted: false, reason: 'missing_raw' };
    }
    try {
      const { deserializeTx, txid } = await import('../../core/tx.ts');
      const tx = deserializeTx(fromHex(b.raw));
      if (tx.type !== 1) return { accepted: false, reason: 'not_a_transfer' };
      const r = this.pool.add(tx, this.chain.state(), this.chain.height() + 1);
      if (!r.ok) return { accepted: false, reason: r.reason, detail: r.detail };

      // Den Peers sagen, dass es sie gibt -- sonst kennt sie nur dieser Knoten.
      try { this.onNeueTx?.(txid(tx)); }
      catch (e) { this.onFehler?.('Tx ankündigen', e as Error); }

      return { accepted: true, txid: r.txid, replaced: r.ersetzt ?? null };
    } catch (e) {
      return { accepted: false, reason: 'malformed', detail: (e as Error).message };
    }
  }

  private status(): Record<string, unknown> {
    const tip = this.chain.tip();
    return {
      network: this.params.network,
      height: tip?.height ?? null,
      bestBlock: tip ? toHex(tip.hash) : null,
      chainWork: tip ? tip.chainWork.toString() : '0',
      difficulty: tip ? Number(tip.difficulty) : null,
      difficultyWert: tip ? tip.difficulty.toString() : null,
      blocksStored: this.store.count(),
      tips: this.store.tips().length,
      mempool: this.pool.size(),
      sessions: this.aktiveSessions(),
      openJobs: this.mining.offeneJobs(),
    };
  }
}

const zielAus = (difficulty: bigint) => (1n << 240n) / (difficulty > 0n ? difficulty : 1n);

/** Obergrenze des Share-Ziels fuer einen Job dieser Blockdifficulty. */
function shareDeckel(blockDifficulty: bigint): bigint {
  const d = blockDifficulty / SHARE_DECKEL_TEILER;
  return d > SHARE_START ? d : SHARE_START;
}

function zielBytes(ziel: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = ziel;
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
