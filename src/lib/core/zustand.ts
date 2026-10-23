/**
 * Kontozustand als unveraenderlicher Baum mit geteilten Teilen.
 *
 * Warum: Bisher war ein Zustand eine gewoehnliche Map. Jeder Block kopierte
 * ihn mehrmals ganz (Pruefung, Anwenden, Zurueckschreiben), und die
 * Zustandswurzel verglich bei jedem Aufruf ALLE Konten mit ihrem letzten
 * Stand. Bei einer Million Konten kostete das Sekunden je Block -- und mit
 * Sammelzahlungen lassen sich Konten billig anlegen.
 *
 * Wie: Ein 16-faecheriger Trie ueber die Hex-Ziffern der Rohadresse. Eine
 * Aenderung kopiert nur den Pfad zur Wurzel (rund fuenf Knoten bei einer
 * Million Konten); alle anderen Knoten teilen sich alte und neue Fassung.
 * Daraus folgt:
 *
 *   - Eine Kopie kostet nichts (cloneState): beide zeigen auf dieselbe
 *     Wurzel, und wer danach aendert, kopiert nur seinen Pfad.
 *   - Der Unterschied zweier Fassungen (unterschiede) laeuft nur dort
 *     hinab, wo sie verschiedene Knoten haben -- die Kosten haengen an der
 *     Zahl der Aenderungen, nicht an der Zahl der Konten.
 *   - Jeder Knoten kennt Anzahl und Summe der Guthaben darunter: size und
 *     die Gesamtmenge kosten nichts.
 *
 * Nach aussen ist es eine Map<string, Account> (State in state.ts): get,
 * set, delete, has, size, Iteration. Was bisher mit Zustaenden ging, geht
 * weiter -- nur schneller. Die Konten sind eingefroren: Wer ein Konto an Ort
 * und Stelle aendern wollte, statt set() zu rufen, bekaeme einen Fehler,
 * statt still an allen geteilten Fassungen vorbei zu schreiben.
 *
 * Achtung: structuredClone() kennt nur die eingebaute Speicherung einer Map
 * und liefert fuer einen Zustand eine LEERE Map. Kopieren mit cloneState().
 *
 * Die Reihenfolge der Iteration ist erst nach Laenge der Rohadresse, dann
 * nach Schluessel (Hex aufsteigend), nicht die des Einfuegens. Nichts im Konsens haengt an der Reihenfolge:
 * Beide Zustandswurzeln sortieren selbst.
 */

export interface Konto { balance: bigint; nonce: bigint }

/**
 * Ein Konto. `pfad` ist der Weg durch den Trie: zwei Hex-Ziffern fuer die
 * Laenge der Rohadresse in Byte, dann die Rohadresse. Ohne die Laenge waere
 * eine Rohadresse der Version 0 (20 Byte) unter Umstaenden der ANFANG einer
 * der Version 1 (33 Byte, 0x01 | Programm): Beide sind frei waehlbar genug,
 * dass jemand das absichtlich herbeifuehrt. Mit der Laenge vorn ist kein
 * Pfad Anfang eines anderen.
 */
interface Blatt { readonly blatt: true; readonly key: string; readonly pfad: string; readonly konto: Konto }
interface Knoten {
  readonly blatt: false;
  readonly kinder: ReadonlyArray<Eintrag | undefined>;
  readonly anzahl: number;
  readonly summe: bigint;
}
type Eintrag = Blatt | Knoten;

const HEX_SCHLUESSEL = /^(?:[0-9a-f]{2}){1,255}$/;

/** Pfad im Trie: Laenge in Byte (zwei Hex-Ziffern), dann der Schluessel. */
function pfadVon(key: string): string {
  return (key.length / 2).toString(16).padStart(2, '0') + key;
}

function pruefeSchluessel(key: string): void {
  if (typeof key !== 'string' || !HEX_SCHLUESSEL.test(key)) {
    throw new Error(`Zustand: Schluessel ist kein Hex in Kleinbuchstaben: ${String(key).slice(0, 80)}`);
  }
}

/** Ziffer des Schluessels an Tiefe `t` (0..15). Schluessel sind Hex in Kleinbuchstaben. */
function ziffer(key: string, t: number): number {
  const c = key.charCodeAt(t);
  if (c >= 48 && c <= 57) return c - 48;          // 0-9
  if (c >= 97 && c <= 102) return c - 87;         // a-f
  throw new Error(`Zustand: Schluessel ist kein Hex in Kleinbuchstaben: ${key}`);
}

function anzahlVon(e: Eintrag | undefined): number { return e === undefined ? 0 : e.blatt ? 1 : e.anzahl; }
function summeVon(e: Eintrag | undefined): bigint { return e === undefined ? 0n : e.blatt ? e.konto.balance : e.summe; }

function knoten(kinder: (Eintrag | undefined)[]): Knoten {
  let anzahl = 0;
  let summe = 0n;
  for (const k of kinder) { anzahl += anzahlVon(k); summe += summeVon(k); }
  return { blatt: false, kinder, anzahl, summe };
}

/** Knoten, in dem nur das Kind `i` ersetzt ist -- ohne alles neu zu summieren. */
function ersetzt(n: Knoten, i: number, neu: Eintrag | undefined): Knoten {
  const alt = n.kinder[i];
  const kinder = n.kinder.slice();
  kinder[i] = neu;
  return {
    blatt: false, kinder,
    anzahl: n.anzahl - anzahlVon(alt) + anzahlVon(neu),
    summe: n.summe - summeVon(alt) + summeVon(neu),
  };
}

function suche(e: Eintrag | undefined, pfad: string, t: number): Konto | undefined {
  while (e !== undefined) {
    if (e.blatt) return e.pfad === pfad ? e.konto : undefined;
    if (t >= pfad.length) return undefined;
    e = e.kinder[ziffer(pfad, t)];
    t++;
  }
  return undefined;
}

/** Zwei Blaetter mit verschiedenen Schluesseln unter einen gemeinsamen Knoten an Tiefe t. */
function trenne(a: Blatt, b: Blatt, t: number): Eintrag {
  // Kein Pfad ist Anfang eines anderen (die Laenge steht vorn, siehe Blatt):
  // Zwei verschiedene Pfade unterscheiden sich, bevor einer endet. Trotzdem
  // absichern, statt ueber das Ende hinaus zu lesen.
  if (t >= a.pfad.length || t >= b.pfad.length) {
    throw new Error(`Zustand: Schluessel ${a.key} und ${b.key} sind nicht trennbar`);
  }
  const da = ziffer(a.pfad, t), db = ziffer(b.pfad, t);
  const kinder: (Eintrag | undefined)[] = new Array(16).fill(undefined);
  if (da === db) kinder[da] = trenne(a, b, t + 1);
  else { kinder[da] = a; kinder[db] = b; }
  return knoten(kinder);
}

function setze(e: Eintrag | undefined, b: Blatt, t: number): Eintrag {
  if (e === undefined) return b;
  if (e.blatt) {
    if (e.pfad === b.pfad) return b;
    return trenne(e, b, t);
  }
  const i = ziffer(b.pfad, t);
  return ersetzt(e, i, setze(e.kinder[i], b, t + 1));
}

function entferne(e: Eintrag | undefined, pfad: string, t: number): Eintrag | undefined {
  if (e === undefined) return undefined;
  if (e.blatt) return e.pfad === pfad ? undefined : e;
  const i = ziffer(pfad, t);
  const alt = e.kinder[i];
  const neu = entferne(alt, pfad, t + 1);
  if (neu === alt) return e;
  const n = ersetzt(e, i, neu);
  // Bleibt nur ein einzelnes Blatt uebrig, rueckt es nach oben: So hat
  // derselbe Inhalt immer dieselbe Form, egal in welcher Reihenfolge er
  // entstand.
  if (n.anzahl === 0) return undefined;
  if (n.anzahl === 1) {
    for (const k of n.kinder) if (k !== undefined && k.blatt) return k;
  }
  return n;
}

/** Alle Blaetter in Schluesselreihenfolge -- ohne Rekursion (verschachtelte Generatoren sind langsam). */
function* alle(e: Eintrag | undefined): Generator<Blatt> {
  if (e === undefined) return;
  const stapel: Eintrag[] = [e];
  while (stapel.length > 0) {
    const x = stapel.pop()!;
    if (x.blatt) { yield x; continue; }
    for (let i = 15; i >= 0; i--) { const k = x.kinder[i]; if (k !== undefined) stapel.push(k); }
  }
}

/** Trie aus Blaettern mit lauter verschiedenen Schluesseln bauen -- ohne Pfadkopien. */
function baue(blaetter: Blatt[], t: number): Eintrag | undefined {
  if (blaetter.length === 0) return undefined;
  if (blaetter.length === 1) return blaetter[0];
  const faecher: Blatt[][] = Array.from({ length: 16 }, () => []);
  for (const b of blaetter) {
    if (t >= b.pfad.length) throw new Error(`Zustand: Schluessel ${b.key} doppelt oder nicht trennbar`);
    faecher[ziffer(b.pfad, t)].push(b);
  }
  return knoten(faecher.map(f => baue(f, t + 1)));
}

function gleich(a: Konto, b: Konto): boolean {
  return a === b || (a.balance === b.balance && a.nonce === b.nonce);
}

/** Eine Aenderung: neues Konto, oder null fuer "gibt es nicht mehr". */
export type Aenderung = (key: string, konto: Konto | null) => void;

function vergleiche(a: Eintrag | undefined, b: Eintrag | undefined, melde: Aenderung): void {
  if (a === b) return;
  if (a === undefined) { for (const x of alle(b)) melde(x.key, x.konto); return; }
  if (b === undefined) { for (const x of alle(a)) melde(x.key, null); return; }
  if (!a.blatt && !b.blatt) {
    for (let i = 0; i < 16; i++) {
      const x = a.kinder[i], y = b.kinder[i];
      if (x !== y) vergleiche(x, y, melde);
    }
    return;
  }
  if (a.blatt && b.blatt) {
    if (a.key === b.key) { if (!gleich(a.konto, b.konto)) melde(b.key, b.konto); return; }
    melde(a.key, null); melde(b.key, b.konto);
    return;
  }
  // Mindestens eine Seite ist ein Blatt: die (kleine) andere Seite aufzaehlen.
  const links = new Map<string, Konto>();
  for (const x of alle(a)) links.set(x.key, x.konto);
  for (const x of alle(b)) {
    const alt = links.get(x.key);
    if (alt === undefined || !gleich(alt, x.konto)) melde(x.key, x.konto);
    links.delete(x.key);
  }
  for (const k of links.keys()) melde(k, null);
}

/**
 * Die Map-Schnittstelle ueber dem Trie. Die eigene Speicherung von Map wird
 * nicht benutzt; alle Methoden sind ueberschrieben.
 */
export class Zustand extends Map<string, Konto> {
  /** Wurzel des Tries -- unveraenderlich, darf geteilt werden. */
  wurzel: Eintrag | undefined;

  constructor(wurzel?: Eintrag | undefined) {
    // Kein Iterable an Map uebergeben: Der Map-Konstruktor riefe set(),
    // bevor dieses Objekt fertig ist.
    super();
    this.wurzel = wurzel;
  }

  /**
   * Aus Eintraegen bauen (etwa einer Marke beim Start). Spaetere Eintraege
   * mit demselben Schluessel gewinnen, wie bei set(). Konten mit null
   * Guthaben und Nonce null werden uebernommen, wie sie kommen -- das
   * Weglassen ist Sache von state.ts.
   */
  static aus(quelle: Iterable<readonly [string, Konto]>): Zustand {
    const je = new Map<string, Blatt>();
    for (const [key, konto] of quelle) {
      pruefeSchluessel(key);
      const k = Object.isFrozen(konto) ? konto : Object.freeze({ balance: konto.balance, nonce: konto.nonce });
      je.set(key, { blatt: true, key, pfad: pfadVon(key), konto: k });
    }
    return new Zustand(baue([...je.values()], 0));
  }

  /** Eine Kopie, die nichts kostet: beide teilen sich die Wurzel. */
  kopie(): Zustand { return new Zustand(this.wurzel); }

  /** Summe aller Guthaben -- ohne Durchlauf. */
  summe(): bigint { return summeVon(this.wurzel); }

  override get size(): number { return anzahlVon(this.wurzel); }

  override get(key: string): Konto | undefined {
    return typeof key === 'string' && HEX_SCHLUESSEL.test(key) ? suche(this.wurzel, pfadVon(key), 0) : undefined;
  }

  override has(key: string): boolean { return this.get(key) !== undefined; }

  override set(key: string, konto: Konto): this {
    pruefeSchluessel(key);
    const eingefroren = Object.isFrozen(konto) ? konto : Object.freeze({ balance: konto.balance, nonce: konto.nonce });
    this.wurzel = setze(this.wurzel, { blatt: true, key, pfad: pfadVon(key), konto: eingefroren }, 0);
    return this;
  }

  override delete(key: string): boolean {
    if (typeof key !== 'string' || !HEX_SCHLUESSEL.test(key)) return false;
    const vorher = this.wurzel;
    this.wurzel = entferne(this.wurzel, pfadVon(key), 0);
    return this.wurzel !== vorher;
  }

  override clear(): void { this.wurzel = undefined; }

  override *entries(): MapIterator<[string, Konto]> {
    for (const b of alle(this.wurzel)) yield [b.key, b.konto];
  }
  override *keys(): MapIterator<string> {
    for (const b of alle(this.wurzel)) yield b.key;
  }
  override *values(): MapIterator<Konto> {
    for (const b of alle(this.wurzel)) yield b.konto;
  }
  override [Symbol.iterator](): MapIterator<[string, Konto]> { return this.entries(); }

  override forEach(f: (value: Konto, key: string, map: Map<string, Konto>) => void, thisArg?: unknown): void {
    for (const b of alle(this.wurzel)) f.call(thisArg, b.konto, b.key, this);
  }
}

/**
 * Was sich von `vorher` nach `nachher` geaendert hat. Laeuft nur dort
 * hinab, wo die beiden verschiedene Knoten haben.
 */
export function unterschiede(vorher: Eintrag | undefined, nachher: Eintrag | undefined, melde: Aenderung): void {
  vergleiche(vorher, nachher, melde);
}

export type { Eintrag as ZustandsWurzel };
