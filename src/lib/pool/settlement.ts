/**
 * Pool-Abrechnung.
 *
 * Reine Rechnung, keine Datenbank, keine Netzwerkzugriffe. Das ist Absicht:
 * Hier wird Geld aufgeteilt, und dieser Teil muss sich vollstaendig
 * durchpruefen lassen, ohne dass irgendetwas laeuft.
 *
 * GRUNDSATZ: Der Pool haelt nie fremdes Geld. Die Aufteilung wird zur
 * Coinbase des Blocks -- die Kette selbst zahlt jeden Beteiligten direkt
 * aus. Der Betreiber entscheidet nur, wie aufgeteilt wird, und das steht
 * anschliessend fuer jeden nachrechenbar im Block.
 *
 * AUSSCHLIESSLICH GANZZAHLEN. Ein Gleitkommawert waere hier fatal: 0.1 + 0.2
 * ist in IEEE 754 nicht 0.3, und zwei Knoten kaemen bei derselben Runde zu
 * verschiedenen Ergebnissen. Gerechnet wird in der kleinsten Einheit.
 */
import { toHex } from '../core/codec.ts';
import { MAX_COINBASE_OUTPUTS, DUST_LIMIT } from '../core/params.ts';

/** Hoechste zulaessige Gebuehr: 500 Basispunkte, also 5,00 %. */
export const MAX_FEE_BPS = 500;

/**
 * Wie viele Miner hoechstens in einem Block ausgezahlt werden koennen.
 *
 * Ein Platz geht an die Gebuehr des Betreibers, sofern sie groesser als null
 * ist. Wer nicht hineinpasst, bekommt in DIESEM Block nichts (siehe
 * `ausgelassen` in Abrechnung). Einen Ausgleich dafuer gibt es nicht.
 */
export const MAX_MINERS_JE_BLOCK = MAX_COINBASE_OUTPUTS - 1;

export interface Anteil {
  /** Adresse, an die ausgezahlt wird -- 20 Byte. */
  to: Uint8Array;
  /** Geleistete, geprueefte Arbeit in Difficulty-Einheiten. */
  work: bigint;
}

export interface Auszahlung {
  to: Uint8Array;
  amount: bigint;
}

export interface Abrechnung {
  /** Empfaenger fuer die Coinbase, aufsteigend nach Adresse sortiert. */
  outputs: Auszahlung[];
  /** Was der Betreiber bekommt. Null, wenn die Gebuehr null ist. */
  fee: bigint;
  /** Was an die Miner geht. */
  verteilt: bigint;
  /**
   * Adressen, die in diesem Block NICHT ausgezahlt werden, weil die Coinbase
   * nur begrenzt viele Empfaenger hat -- die mit der wenigsten Arbeit.
   *
   * Nur zur Auskunft (Issue #6). Frueher hiess das Feld `uebertrag`, und die
   * Kommentare versprachen, diese Arbeit wandere in die naechste Runde. Das
   * stimmte nicht: Ihr Anteil an DIESEM Block geht an die Ausgezahlten, und
   * es gibt keinen Ausgleich. Ihre Arbeit bleibt nur deshalb im PPLNS-Fenster
   * und zaehlt beim naechsten Block wieder mit, weil das Fenster ohnehin
   * ueber Bloecke hinweg reicht -- wie fuer alle anderen auch. Eine Adresse,
   * die dauerhaft zu den Kleinsten gehoert, geht so jedes Mal leer aus.
   *
   * Dass es dazu kommt, verhindert der Pool weitgehend schon bei der
   * Aufnahme (PoolCoordinator.plaetze()); moeglich bleibt es, weil Plaetze
   * die Aufnahme begrenzen, nicht das Fenster: Wer geht, gibt seinen Platz
   * sofort frei, seine Arbeit bleibt eine Weile im Fenster.
   */
  ausgelassen: Anteil[];
}

/**
 * Gebuehr des Betreibers in der kleinsten Einheit.
 *
 * Abgerundet, damit die Miner nie zu wenig bekommen: Der Rest einer
 * Division faellt zugunsten der Arbeitenden aus, nicht des Betreibers.
 */
export function gebuehrBetrag(brutto: bigint, feeBps: number): bigint {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) {
    throw new Error(`Gebuehr ${feeBps} liegt nicht zwischen 0 und ${MAX_FEE_BPS}`);
  }
  return (brutto * BigInt(feeBps)) / 10_000n;
}

/**
 * Eine Runde abrechnen.
 *
 * @param brutto     Blockreward plus Transaktionsgebuehren, in kleinster Einheit
 * @param anteile    geleistete Arbeit je Auszahlungsadresse
 * @param feeBps     Gebuehr in Basispunkten, beim RUNDENBEGINN festgelegt
 * @param betreiber  Adresse fuer die Gebuehr; entfaellt bei feeBps = 0
 *
 * Die Summe aller Ausgaben ist immer exakt `brutto`. Das ist keine
 * Zusicherung auf Zuruf, sondern wird am Ende geprueft und wirft sonst.
 */
export function abrechnen(
  brutto: bigint,
  anteile: Anteil[],
  feeBps: number,
  betreiber: Uint8Array | null,
): Abrechnung {
  if (brutto <= 0n) throw new Error('Bruttobetrag muss positiv sein');

  const mitArbeit = anteile.filter(a => a.work > 0n);
  if (mitArbeit.length === 0) {
    throw new Error('keine Arbeit in dieser Runde -- nichts zu verteilen');
  }

  /*
    Eine Gebuehr unter der Staubgrenze waere ab Konsensfassung 5 eine
    ungueltige Ausgabe. Dann geht sie an die Miner. Das betrifft erst sehr
    spaete Halbierungen (Belohnung unter rund 0,0001 YSR).
  */
  const roheGebuehr = gebuehrBetrag(brutto, feeBps);
  const fee = roheGebuehr < DUST_LIMIT ? 0n : roheGebuehr;
  if (fee > 0n && !betreiber) {
    throw new Error('Gebuehr ohne Adresse des Betreibers');
  }

  // Gleiche Adresse mehrfach: zusammenfassen. Die Coinbase erlaubt jede
  // Adresse nur einmal, und zwei Sitzungen desselben Miners sind der
  // Normalfall.
  const summiert = new Map<string, Anteil>();
  for (const a of mitArbeit) {
    const k = toHex(a.to);
    const vorhanden = summiert.get(k);
    if (vorhanden) vorhanden.work += a.work;
    else summiert.set(k, { to: a.to, work: a.work });
  }

  /*
    Wer nicht in den Block passt, geht in diesem Block leer aus (siehe
    `ausgelassen`).

    Sortiert wird nach Arbeit absteigend; bei gleicher Arbeit entscheidet
    die Adresse, damit das Ergebnis deterministisch ist. Zwei Knoten
    muessen bei derselben Runde dieselbe Auswahl treffen.
  */
  const platz = fee > 0n ? MAX_MINERS_JE_BLOCK : MAX_COINBASE_OUTPUTS;
  const sortiert = [...summiert.values()].sort((x, y) =>
    x.work !== y.work ? (x.work > y.work ? -1 : 1)
                      : (toHex(x.to) < toHex(y.to) ? -1 : 1));
  let dabei = sortiert.slice(0, platz);
  const ausgelassen = sortiert.slice(platz);
  const verteilbar = brutto - fee;

  /*
    Ab Konsensfassung 5 (params.ts, V5_HEIGHT) muss jede Ausgabe einer
    Coinbase der Fassung 2 mindestens DUST_LIMIT betragen. Wer mit seinem
    Anteil darunter laege, wird in diesem Block wie ein Ausgelassener
    behandelt; sein Anteil geht an die anderen, seine Arbeit bleibt im
    Fenster. Vor der Aktivierung schadet das nicht -- es betrifft nur
    Anteile unter rund einem Milliardstel. Gerechnet wird so oft neu, bis
    niemand mehr darunter liegt; die Kleinsten fallen zuerst heraus.
  */
  let roh = verteile(dabei, verteilbar);
  for (;;) {
    const zuKlein = roh.filter(r => r.ganz < DUST_LIMIT);
    if (zuKlein.length === 0) break;
    if (zuKlein.length === roh.length) {
      // Alle laegen darunter (erst ab Hoehe 360.000 moeglich, wenn die
      // Belohnung unter DUST_LIMIT faellt): Der mit der meisten Arbeit
      // bekommt alles. Liegt auch das darunter, baut der Block eine
      // Coinbase der Fassung 1 (builder.ts), die keine Staubgrenze kennt.
      if (dabei.length === 1) break;
      ausgelassen.push(...dabei.slice(1));
      dabei = dabei.slice(0, 1);
      roh = verteile(dabei, verteilbar);
      break;
    }
    const weg = new Set(zuKlein.map(r => toHex(r.to)));
    ausgelassen.push(...dabei.filter(a => weg.has(toHex(a.to))));
    dabei = dabei.filter(a => !weg.has(toHex(a.to)));
    roh = verteile(dabei, verteilbar);
  }

  const outputs: Auszahlung[] = roh
    .filter(r => r.ganz > 0n)
    .map(r => ({ to: r.to, amount: r.ganz }));

  if (fee > 0n && betreiber) {
    // Der Betreiber kann selbst mitminen. Dann wird zusammengefasst, weil
    // die Coinbase jede Adresse nur einmal erlaubt.
    const k = toHex(betreiber);
    const schon = outputs.find(o => toHex(o.to) === k);
    if (schon) schon.amount += fee;
    else outputs.push({ to: betreiber, amount: fee });
  }

  // Aufsteigend nach Adresse -- die Kette nimmt nur diese Reihenfolge an.
  outputs.sort((a, b) => toHex(a.to) < toHex(b.to) ? -1 : 1);

  /*
    Gegenprobe, und zwar hart.

    Wenn hier etwas nicht aufgeht, ist der Block ungueltig -- und das faellt
    sonst erst beim Einreichen auf, nach getaner Arbeit. Lieber hier
    abbrechen, wo der Fehler noch zuzuordnen ist.
  */
  let summe = 0n;
  for (const o of outputs) summe += o.amount;
  if (summe !== brutto) {
    throw new Error(`Aufteilung ergibt ${summe}, erwartet ${brutto}`);
  }
  if (outputs.length > MAX_COINBASE_OUTPUTS) {
    throw new Error(`${outputs.length} Empfaenger, hoechstens ${MAX_COINBASE_OUTPUTS}`);
  }

  return { outputs, fee, verteilt: verteilbar, ausgelassen };
}

/**
 * `verteilbar` nach Arbeit aufteilen, auf die Einheit genau.
 *
 * Groesste-Reste-Verfahren: Zuerst bekommt jeder den abgerundeten Anteil.
 * Was dann noch fehlt -- hoechstens eine Einheit je Miner -- geht an die mit
 * dem groessten Rest; bei gleichem Rest an die kleinere Adresse, damit das
 * Ergebnis nicht von der Eingabereihenfolge abhaengt.
 */
function verteile(dabei: Anteil[], verteilbar: bigint): { to: Uint8Array; work: bigint; ganz: bigint; rest: bigint }[] {
  let gesamtArbeit = 0n;
  for (const a of dabei) gesamtArbeit += a.work;
  const roh = dabei.map(a => {
    const genau = verteilbar * a.work;
    const ganz = genau / gesamtArbeit;
    return { to: a.to, work: a.work, ganz, rest: genau - ganz * gesamtArbeit };
  });
  let vergeben = 0n;
  for (const r of roh) vergeben += r.ganz;
  let offen = verteilbar - vergeben;
  const nachRest = [...roh].sort((x, y) =>
    x.rest !== y.rest ? (x.rest > y.rest ? -1 : 1)
                      : (toHex(x.to) < toHex(y.to) ? -1 : 1));
  for (const r of nachRest) {
    if (offen <= 0n) break;
    r.ganz += 1n;
    offen -= 1n;
  }
  return roh;
}
