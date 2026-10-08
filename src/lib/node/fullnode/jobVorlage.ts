/**
 * Vorarbeit fuer Mining-Jobs.
 *
 * WARUM ES DAS GIBT
 *
 * Jeder Aufruf von /job baute bisher den ganzen Block neu: Transaktionen
 * auswaehlen (zweimal -- einmal in createJob, einmal in buildBlock),
 * jede Signatur dabei erneut pruefen, den Zustand viermal kopieren und
 * die Zustandswurzel ueber ALLE Konten neu rechnen -- sortieren, jedes
 * Blatt serialisieren, jedes Blatt hashen. Bei einigen tausend Konten
 * sind das Millisekunden; gemessen bei 100.000 Konten rund eine Sekunde
 * je Job (Befund S5).
 *
 * Fast alles davon haengt nur am Kettenkopf und am Mempool -- nicht an der
 * Sitzung. Je Sitzung verschieden sind nur die Coinbase (wer bekommt die
 * Belohnung), der Zeitstempel und die Extranonce. Diese Datei rechnet den
 * gemeinsamen Teil EINMAL je Kettenkopf und Mempool-Stand und setzt je Job
 * nur noch die Coinbase ein.
 *
 * WAS GLEICH BLEIBEN MUSS -- BYTE FUER BYTE
 *
 * Ein Job aus der Vorlage muss genau den Block ergeben, den buildBlock()
 * ergeben haette. Sonst ist die Arbeit des Miners wertlos: Die eigene
 * Pruefung lehnt den Block ab. Deshalb:
 *
 *   - Die Auswahl laeuft genau wie bisher zweimal (createJob waehlt aus
 *     dem Mempool, buildBlock waehlt aus dieser Auswahl noch einmal). Die
 *     zweite Runde kann bei gleicher Gebuehr eine andere Reihenfolge
 *     ergeben; der Block nimmt die der zweiten.
 *   - Der Zustand nach den Ueberweisungen kommt aus applyBlock() selbst,
 *     nicht aus einer Nachbildung -- siehe zwischenzustand().
 *   - Die Wurzel wird mit genau der Baumregel von merkleRoot() gerechnet
 *     (Blatt 0x00, Knoten 0x01, ungerader letzter Knoten wird
 *     unveraendert hochgereicht).
 *
 * tests/job-vorlage.test.ts vergleicht beides fuer viele Zustaende,
 * Mempools und Aufteilungen. Zusaetzlich prueft der MiningCoordinator den
 * ersten Job jeder neuen Vorlage gegen buildBlock() und schaltet die
 * Vorlage bei der kleinsten Abweichung ab.
 */
import { selectTransactions, buildCoinbase, buildCoinbaseV2, type BuildResult }
  from '../../core/builder.ts';
import { type Block, type BlockHeader, serializeHeader, txMerkleRoot, BLOCK_VERSION }
  from '../../core/block.ts';
import { type State, type Account, cloneState, applyBlock, totalSupply } from '../../core/state.ts';
import { rewardAt, MAX_SUPPLY, ADDRESS_BYTES, COINBASE_V2 } from '../../core/params.ts';
import { sha256d } from '../../core/hash.ts';
import { Writer, fromHex, toHex } from '../../core/codec.ts';
import { type Transfer, type Tx } from '../../core/tx.ts';
import type { ConsensusParams } from '../../core/networks.ts';

export interface JobVorlage {
  /** Kettenkopf, Hoehe und Mempool-Stand, fuer die diese Vorlage gilt. */
  schluessel: string;
  height: number;
  included: Transfer[];
  rejected: { txid: string; reason: string }[];
  fees: bigint;
  /** Konten nach den Ueberweisungen, VOR der Coinbase. */
  konten: State;
  /** Deren Adressen, sortiert wie in stateRoot(). */
  sortiert: string[];
  /** Position jeder Adresse in `sortiert`. */
  position: Map<string, number>;
  /** Ebenen des Merkle-Baums: ebenen[0] sind die Blatt-Hashes. */
  ebenen: Uint8Array[][];
  /** Geldmenge nach den Ueberweisungen (Gebuehren sind dabei verschwunden). */
  menge: bigint;
}

export interface JobAngaben {
  prevHash: Uint8Array;
  minerAddress: Uint8Array;
  timestamp: bigint;
  difficulty: bigint;
  extranonce: bigint;
  coinbaseExtra?: Uint8Array;
  anteile?: (brutto: bigint) => { to: Uint8Array; amount: bigint }[];
  params: ConsensusParams;
}

// ------------------------------------------------------------- Vorlage bauen

/**
 * Den gemeinsamen Teil rechnen: Auswahl, Zustand nach den Ueberweisungen,
 * Merkle-Baum ueber diesen Zustand.
 *
 * @param state    Zustand NACH dem Vorgaengerblock -- wird nicht veraendert.
 * @param mempool  Was im Mempool wartet, in der Reihenfolge von pool.alle().
 */
export function baueVorlage(
  schluessel: string, state: State, mempool: Transfer[], height: number, params: ConsensusParams,
): JobVorlage {
  // Erste Runde: wie createJob() -- aus dem ganzen Mempool.
  const erste = selectTransactions(state, mempool, height, undefined, params).included;
  // Zweite Runde: wie buildBlock() -- aus der ersten Auswahl. Der Block
  // traegt die Reihenfolge DIESER Runde.
  const { included, rejected, fees } = selectTransactions(state, erste, height, undefined, params);

  const konten = zwischenzustand(state, included, height, fees, params);
  const sortiert = [...konten.keys()].sort(vergleiche);
  const position = new Map<string, number>();
  sortiert.forEach((k, i) => position.set(k, i));
  const blaetter = sortiert.map(k => blattHash(k, konten.get(k)!));

  return {
    schluessel, height, included, rejected, fees, konten, sortiert, position,
    ebenen: ebenenAus(blaetter),
    menge: totalSupply(konten),
  };
}

/**
 * Zustand nach den Ueberweisungen, vor der Coinbase.
 *
 * Nicht nachgebaut, sondern von applyBlock() selbst gerechnet: Der Block
 * bekommt eine Coinbase an eine Adresse, die weder im Zustand noch in einer
 * der Ueberweisungen vorkommt, und genau dieses eine Konto wird danach
 * wieder entfernt. Was uebrig bleibt, ist exakt das, was applyBlock aus den
 * Ueberweisungen macht -- samt der Regel, dass leere Konten verschwinden.
 *
 * Nebenbei prueft applyBlock dabei, ob der Block mit DIESER Gesamtsumme die
 * Geldmenge ueberschreiten wuerde. Jede andere Coinbase zahlt dieselbe
 * Summe aus -- die Pruefung gilt damit fuer jeden Job aus der Vorlage.
 */
function zwischenzustand(
  state: State, included: Transfer[], height: number, fees: bigint, params: ConsensusParams,
): State {
  const belegt = new Set<string>(state.keys());
  for (const t of included) { belegt.add(toHex(t.from)); belegt.add(toHex(t.to)); }
  let platzhalter: Uint8Array | null = null;
  for (let b = 0xff; b >= 0 && !platzhalter; b--) {
    const kandidat = new Uint8Array(ADDRESS_BYTES).fill(b);
    if (!belegt.has(toHex(kandidat))) platzhalter = kandidat;
  }
  if (!platzhalter) throw new Error('Vorlage: keine freie Platzhalter-Adresse');

  const probe: Block = {
    header: {
      version: BLOCK_VERSION, height, prevHash: new Uint8Array(32),
      merkleRoot: new Uint8Array(32), stateRoot: new Uint8Array(32),
      timestamp: 0n, difficulty: 1n, txCount: included.length + 1,
      extranonce: 0n, nonce: 0n,
    },
    txs: [buildCoinbase(height, platzhalter, fees), ...included],
  };
  const nachher = cloneState(state);
  const r = applyBlock(nachher, probe, params);
  if (!r.ok) {
    throw new Error(`Blockbau fehlgeschlagen: ${r.error?.reason} (tx ${r.error?.tx})`);
  }
  nachher.delete(toHex(platzhalter));
  return nachher;
}

// ---------------------------------------------------------- Job aus Vorlage

/**
 * Einen Block aus der Vorlage bauen -- dasselbe Ergebnis wie buildBlock().
 */
export function baueAusVorlage(v: JobVorlage, p: JobAngaben): BuildResult & { art: string } {
  const height = v.height;
  const brutto = rewardAt(height) + v.fees;
  const verteilt = p.anteile ? p.anteile(brutto) : null;
  const coinbase = verteilt && verteilt.length > 0
    ? buildCoinbaseV2(height, verteilt, v.fees, p.coinbaseExtra)
    : buildCoinbase(height, p.minerAddress, v.fees, p.coinbaseExtra);

  /*
    Was applyBlock() an der Coinbase prueft und buildCoinbase/-V2 nicht
    schon erzwingen: Fassung 2 erst ab ihrer Aktivierungshoehe. Sortierung,
    Eindeutigkeit, Betraege und Summe prueft buildCoinbaseV2 selbst; eine
    Fassung 1 hat immer genau einen Empfaenger.
  */
  if (coinbase.version === COINBASE_V2 && height < p.params.coinbaseV2Height) {
    throw new Error(`Blockbau fehlgeschlagen: coinbase_v2_zu_frueh:${height}<${p.params.coinbaseV2Height} (tx 0)`);
  }
  let summe = 0n;
  for (const o of coinbase.outputs) summe += o.amount;
  if (v.menge + summe > MAX_SUPPLY) {
    throw new Error('Blockbau fehlgeschlagen: supply_exceeded (tx 0)');
  }

  const txs: Tx[] = [coinbase, ...v.included];
  const { wurzel, weg } = wurzelMitCoinbase(v, coinbase.outputs);
  const header: BlockHeader = {
    version: BLOCK_VERSION,
    height,
    prevHash: p.prevHash,
    merkleRoot: txMerkleRoot(txs),
    stateRoot: wurzel,
    timestamp: p.timestamp,
    difficulty: p.difficulty,
    txCount: txs.length,
    extranonce: p.extranonce,
    nonce: 0n,
  };
  return {
    block: { header, txs },
    header: serializeHeader(header),
    included: v.included,
    rejected: v.rejected,
    fees: v.fees,
    stateRoot: header.stateRoot,
    // Welcher Rechenweg es war -- der MiningCoordinator prueft jeden Weg
    // einmal je Vorlage gegen den vollen Blockbau.
    art: `v${coinbase.version}:${weg}`,
  };
}

/**
 * Zustandswurzel, nachdem die Coinbase gutgeschrieben wurde.
 *
 * Zwei Faelle:
 *   - Alle Empfaenger haben schon ein Konto (der Normalfall im Pool): Nur
 *     die Pfade ueber den geaenderten Blaettern werden neu gerechnet.
 *   - Mindestens ein Empfaenger ist neu: Ab der ersten neuen oder
 *     geaenderten Stelle verschiebt sich alles; links davon bleibt jeder
 *     Knoten, wie er ist.
 */
export function wurzelMitCoinbase(
  v: JobVorlage, outputs: { to: Uint8Array; amount: bigint }[],
): { wurzel: Uint8Array; weg: 'leer' | 'pfade' | 'ab-stelle' } {
  const neu = new Map<string, Account>();
  for (const o of outputs) {
    const k = toHex(o.to);
    const alt = neu.get(k) ?? v.konten.get(k) ?? { balance: 0n, nonce: 0n };
    neu.set(k, { balance: alt.balance + o.amount, nonce: alt.nonce });
  }
  // Wie setAccount(): Ein Konto mit null Guthaben und Nonce null gibt es
  // nicht. Das kann nur bei einer Coinbase ueber null an ein neues Konto
  // entstehen (Belohnung null, keine Gebuehren) -- dann aendert sich nichts.
  for (const [k, konto] of [...neu]) {
    if (konto.balance === 0n && konto.nonce === 0n && !v.position.has(k)) neu.delete(k);
  }
  if (neu.size === 0) return { wurzel: wurzelAus(v.ebenen), weg: 'leer' };

  const alleBekannt = [...neu.keys()].every(k => v.position.has(k));
  if (alleBekannt) return { wurzel: pfadeNeu(v, neu), weg: 'pfade' };
  return { wurzel: abStelleNeu(v, neu), weg: 'ab-stelle' };
}

function pfadeNeu(v: JobVorlage, neu: Map<string, Account>): Uint8Array {
  let geaendert = new Map<number, Uint8Array>();
  for (const [k, konto] of neu) geaendert.set(v.position.get(k)!, blattHash(k, konto));

  for (let e = 0; e < v.ebenen.length - 1; e++) {
    const ebene = v.ebenen[e];
    const hole = (i: number) => geaendert.get(i) ?? ebene[i];
    const naechste = new Map<number, Uint8Array>();
    for (const i of geaendert.keys()) {
      const j = i >> 1;
      if (naechste.has(j)) continue;
      const links = 2 * j, rechts = 2 * j + 1;
      naechste.set(j, rechts < ebene.length ? knoten(hole(links), hole(rechts)) : hole(links));
    }
    geaendert = naechste;
  }
  return geaendert.get(0) ?? v.ebenen[v.ebenen.length - 1][0];
}

function abStelleNeu(v: JobVorlage, neu: Map<string, Account>): Uint8Array {
  // Neue Blattfolge: die alten Adressen plus die neuen, wieder sortiert.
  const dazu = [...neu.keys()].filter(k => !v.position.has(k)).sort(vergleiche);
  const blaetter: Uint8Array[] = [];
  let erste = Infinity;           // erste Stelle, die sich gegenueber der Vorlage aendert
  let a = 0, b = 0;
  while (a < v.sortiert.length || b < dazu.length) {
    const nimmNeu = b < dazu.length && (a >= v.sortiert.length || vergleiche(dazu[b], v.sortiert[a]) < 0);
    const k = nimmNeu ? dazu[b++] : v.sortiert[a++];
    const stelle = blaetter.length;
    const konto = neu.get(k);
    if (nimmNeu || konto) {
      if (stelle < erste) erste = stelle;
      blaetter.push(blattHash(k, konto!));
    } else {
      blaetter.push(v.ebenen[0][a - 1]);
    }
  }

  // Ebene fuer Ebene: Was links von `erste` liegt, ist unveraendert.
  let ebene = blaetter;
  let ab = erste;
  let e = 0;
  while (ebene.length > 1) {
    const alt = v.ebenen[e + 1];
    const naechste: Uint8Array[] = [];
    const abNaechste = Math.floor(ab / 2);
    for (let i = 0; i < ebene.length; i += 2) {
      const j = i >> 1;
      if (j < abNaechste && alt && j < alt.length) { naechste.push(alt[j]); continue; }
      naechste.push(i + 1 === ebene.length ? ebene[i] : knoten(ebene[i], ebene[i + 1]));
    }
    ebene = naechste;
    ab = abNaechste;
    e++;
  }
  return ebene[0];
}

// --------------------------------------------------------- Baum, wie merkleRoot

const vergleiche = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Blatt wie in stateRoot(): Adresse, Guthaben, Nonce -- dann wie merkleRoot(). */
function blattHash(adresseHex: string, konto: Account): Uint8Array {
  const wert = new Writer().bytes(fromHex(adresseHex), ADDRESS_BYTES)
    .u64(konto.balance).u64(konto.nonce).finish();
  const b = new Uint8Array(1 + wert.length);
  b[0] = 0x00; b.set(wert, 1);
  return sha256d(b);
}

function knoten(links: Uint8Array, rechts: Uint8Array): Uint8Array {
  const b = new Uint8Array(1 + 64);
  b[0] = 0x01; b.set(links, 1); b.set(rechts, 33);
  return sha256d(b);
}

function ebenenAus(blaetter: Uint8Array[]): Uint8Array[][] {
  const ebenen: Uint8Array[][] = [blaetter];
  let ebene = blaetter;
  while (ebene.length > 1) {
    const naechste: Uint8Array[] = [];
    for (let i = 0; i < ebene.length; i += 2) {
      naechste.push(i + 1 === ebene.length ? ebene[i] : knoten(ebene[i], ebene[i + 1]));
    }
    ebenen.push(naechste);
    ebene = naechste;
  }
  return ebenen;
}

function wurzelAus(ebenen: Uint8Array[][]): Uint8Array {
  const oben = ebenen[ebenen.length - 1];
  return oben.length === 0 ? new Uint8Array(32) : oben[0];
}
