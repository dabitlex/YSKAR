/**
 * Kumulierte Arbeit einer Kette.
 *
 * Die Auswahl zwischen konkurrierenden Ketten darf NICHT ueber die Hoehe
 * laufen. Eine laengere Kette aus leichten Bloecken kann weniger Arbeit
 * enthalten als eine kuerzere aus schweren -- wer nach Hoehe entscheidet,
 * laesst sich mit billigen Bloecken ueberholen.
 *
 * Bei YSKAR ist die Umrechnung besonders einfach, und das ist kein Zufall:
 *
 *     target = 2^240 / difficulty
 *
 * Die erwartete Zahl der Versuche fuer einen Treffer ist 2^256 / target,
 * also proportional zur Difficulty. Die Difficulty IST damit bereits das
 * lineare Arbeitsmass. Ein Umweg ueber das Target waere nur eine Division
 * und eine Multiplikation, die sich gegenseitig aufheben -- mit dem
 * Nachteil, dass dabei gerundet wuerde.
 *
 *     blockWork  = difficulty
 *     chainWork  = chainWork(Vorgaenger) + blockWork
 *
 * Gerechnet wird ausschliesslich in BigInt. Ein Gleitkommawert waere hier
 * fatal: Zwei Knoten koennten bei derselben Kette zu verschiedenen Summen
 * kommen und sich dauerhaft uneinig sein.
 */

/** Arbeit eines einzelnen Blocks. */
export function blockWork(difficulty: bigint): bigint {
  if (difficulty <= 0n) throw new Error('difficulty muss positiv sein');
  return difficulty;
}

/** Arbeit einer Kette aus den Schwierigkeiten ihrer Bloecke. */
export function cumulativeWork(difficulties: bigint[]): bigint {
  let summe = 0n;
  for (const d of difficulties) summe += blockWork(d);
  return summe;
}

export interface Tip {
  hash: Uint8Array;
  height: number;
  chainWork: bigint;
}

/**
 * Welche der beiden Ketten gilt?
 *
 * Rueckgabe > 0: a gewinnt.  < 0: b gewinnt.  0: nicht unterscheidbar.
 *
 * Der Gleichstand ist der heikle Teil. "Wer zuerst da war" waere die
 * naheliegende Regel, ist aber NICHT deterministisch: Zwei Knoten sehen
 * dieselben Bloecke in verschiedener Reihenfolge und blieben dauerhaft auf
 * verschiedenen Ketten. Deshalb entscheidet der kleinere Blockhash -- ein
 * Wert, den jeder Knoten unabhaengig berechnet und der fuer alle gleich
 * ist.
 *
 * Dass der kleinere Hash gewinnt, ist zusaetzlich sinnvoll: Er bedeutet
 * mehr fuehrende Nullen, also im Mittel mehr geleistete Arbeit.
 */
export function compareTips(a: Tip, b: Tip): number {
  if (a.chainWork > b.chainWork) return 1;
  if (a.chainWork < b.chainWork) return -1;

  // Gleiche Arbeit: kleinerer Hash gewinnt, Byte fuer Byte von vorn.
  for (let i = 0; i < 32; i++) {
    const x = a.hash[i] ?? 0;
    const y = b.hash[i] ?? 0;
    if (x !== y) return x < y ? 1 : -1;
  }
  return 0;
}

/**
 * Arbeit als 32 Byte Big-Endian.
 *
 * Fuer die Ablage in SQLite: In dieser Form laesst sich direkt sortieren,
 * ohne BigInt-Werte in JavaScript vergleichen zu muessen. Als Dezimaltext
 * abgelegt waere die Sortierung falsch, weil '9' groesser als '10' ist.
 */
export function workToBytes(work: bigint): Uint8Array {
  if (work < 0n) throw new Error('Arbeit kann nicht negativ sein');
  const out = new Uint8Array(32);
  let x = work;
  for (let i = 31; i >= 0 && x > 0n; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x > 0n) throw new Error('Arbeit passt nicht in 32 Byte');
  return out;
}

export function workFromBytes(bytes: Uint8Array): bigint {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return x;
}
