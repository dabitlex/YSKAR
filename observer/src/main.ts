/**
 * YSKAR Beobachter-Knoten.
 *
 * Holt Bloecke ueber die offene Schnittstelle und PRUEFT SIE SELBST --
 * Header, Proof of Work, Merkle-Wurzel, Signaturen, Guthaben, Zustandswurzel
 * und die Difficulty-Regel. Er glaubt dem Server kein einziges Feld.
 *
 * Was er NICHT tut: Bloecke annehmen, Gabelungen entscheiden, Reorgs
 * ausfuehren. Das ist Stufe 3 und der eigentlich schwere Teil. Dieser Knoten
 * hat genau eine Aufgabe, und die erfuellt er vollstaendig.
 *
 * Was er trotzdem leistet:
 *
 *   - Er merkt, wenn ein ungueltiger Block ausgeliefert wird.
 *   - Er merkt, wenn Geschichte nachtraeglich veraendert wird.
 *   - Er merkt, wenn zwei Abfragen verschiedene Ketten liefern.
 *   - Er haelt eine vollstaendige Kopie, falls der Hauptknoten ausfaellt.
 *
 * Damit verschiebt sich die Garantie von "dem Server vertrauen" zu "jeder
 * Beobachter wuerde es bemerken". Das ist der erste echte Schritt weg von
 * der Ein-Instanz-Kette.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { deserializeBlock, headerHash, checkBlockStructure } from '../../src/lib/core/block.ts';
import { validateBlock, expectedDifficulty } from '../../src/lib/core/validate.ts';
import { emptyState, applyBlock, stateRoot, totalSupply, cloneState,
         type State } from '../../src/lib/core/state.ts';
import { toHex, fromHex } from '../../src/lib/core/codec.ts';
import { NETWORK, LWMA_WINDOW } from '../../src/lib/core/params.ts';
import type { Block } from '../../src/lib/core/block.ts';

const VERSION = '0.1.0';

// --------------------------------------------------------------- Argumente

interface Optionen {
  api: string; daten: string; intervall: number;
  vonVorn: boolean; einmal: boolean; help?: boolean; version?: boolean;
}

function argumente(argv: string[]): Optionen {
  const o: Optionen = {
    api: 'https://yskar.vercel.app', daten: './daten',
    intervall: 60, vonVorn: false, einmal: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const [k, direkt] = argv[i].split('=');
    const wert = direkt ?? argv[i + 1];
    const nimm = () => { if (direkt === undefined) i++; return wert; };
    switch (k) {
      case '--api': o.api = nimm().replace(/\/+$/, ''); break;
      case '--data': case '-d': o.daten = nimm(); break;
      case '--interval': o.intervall = Number(nimm()); break;
      case '--from-scratch': o.vonVorn = true; break;
      case '--once': o.einmal = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--version': case '-v': o.version = true; break;
    }
  }
  return o;
}

const HILFE = `
YSKAR Beobachter ${VERSION}

  yskar-observer [Optionen]

Holt die Kette und rechnet jeden Block selbst nach. Er nimmt keine Blöcke
an und entscheidet keine Gabelungen — er prüft.

Optionen
      --api <url>        Server (Vorgabe: https://yskar.vercel.app)
  -d, --data <ordner>    Ablage für Blöcke und Prüfpunkte (Vorgabe: ./daten)
      --interval <sek>   Abstand zwischen den Abfragen (Vorgabe: 60)
      --from-scratch     Ablage verwerfen und bei Block 0 beginnen
      --once             Einmal aufholen und beenden
  -h, --help             Diese Hilfe
`;

// ----------------------------------------------------------------- Ausgabe

const FARBE = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (c: string, s: string) => FARBE ? `\x1b[${c}m${s}\x1b[0m` : s;
const gruen = (s: string) => f('32', s), rot = (s: string) => f('31', s);
const gelb = (s: string) => f('33', s), grau = (s: string) => f('90', s);
const fett = (s: string) => f('1', s);
const uhr = () => new Date().toTimeString().slice(0, 8);

let logDatei = '';
function melde(text: string, roh?: string) {
  console.log(text);
  if (logDatei) {
    appendFileSync(logDatei, `${new Date().toISOString()} ${roh ?? entfaerbe(text)}\n`);
  }
}
const entfaerbe = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ------------------------------------------------------------------ Ablage

/**
 * Pruefpunkt.
 *
 * Ohne ihn muesste der Knoten nach jedem Neustart die gesamte Kette neu
 * durchrechnen. Bei 50.000 Bloecken im Jahr waere das auf einem Pi minuten-
 * bis stundenlang.
 *
 * Gespeichert wird der Zustand, NICHT die Bloecke -- die liegen ohnehin als
 * Dateien daneben und koennen jederzeit nachgerechnet werden. Wer dem
 * Pruefpunkt nicht traut, startet mit --from-scratch.
 */
interface Pruefpunkt {
  netz: string;
  hoehe: number;
  tipHash: string;
  stateRoot: string;
  konten: [string, { balance: string; nonce: string }][];
  zeitstempel: string[];   // die letzten Blockzeiten, fuer die Difficulty-Regel
  schwierigkeiten: string[];
}

function pruefpunktPfad(daten: string) { return join(daten, 'pruefpunkt.json'); }
function blockPfad(daten: string, hoehe: number) {
  // In Tausenderordnern, damit kein Verzeichnis mit 50.000 Eintraegen
  // entsteht -- das bringt manche Dateisysteme spuerbar aus dem Tritt.
  const gruppe = String(Math.floor(hoehe / 1000)).padStart(4, '0');
  return join(daten, 'bloecke', gruppe, `${String(hoehe).padStart(8, '0')}.bin`);
}

function speicherePruefpunkt(daten: string, p: Pruefpunkt) {
  writeFileSync(pruefpunktPfad(daten), JSON.stringify(p));
}

function ladePruefpunkt(daten: string): Pruefpunkt | null {
  const pfad = pruefpunktPfad(daten);
  if (!existsSync(pfad)) return null;
  try {
    const p = JSON.parse(readFileSync(pfad, 'utf8')) as Pruefpunkt;
    return p.netz === NETWORK && typeof p.hoehe === 'number' ? p : null;
  } catch { return null; }
}

function zustandAus(p: Pruefpunkt): State {
  const s = emptyState();
  for (const [adr, k] of p.konten) {
    s.set(adr, { balance: BigInt(k.balance), nonce: BigInt(k.nonce) });
  }
  return s;
}

function pruefpunktAus(
  hoehe: number, tipHash: string, zustand: State,
  zeiten: bigint[], diffs: bigint[],
): Pruefpunkt {
  return {
    netz: NETWORK, hoehe, tipHash, stateRoot: toHex(stateRoot(zustand)),
    konten: [...zustand].map(([a, k]) =>
      [a, { balance: k.balance.toString(), nonce: k.nonce.toString() }]),
    zeitstempel: zeiten.map(String),
    schwierigkeiten: diffs.map(String),
  };
}

// -------------------------------------------------------------------- Netz

async function hole(api: string, pfad: string) {
  const res = await fetch(`${api}/api/v2${pfad}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
  return body;
}

// ----------------------------------------------------------------- Prüfung

/*
  Felder ausgeschrieben statt als Konstruktor-Eigenschaften: Node kann
  TypeScript ohne Uebersetzungsschritt ausfuehren, aber nur, solange sich
  Typen einfach entfernen lassen. Konstruktor-Eigenschaften erzeugen Code
  und fallen deshalb heraus -- der Beobachter soll ohne Bauschritt starten.
*/
class Abweichung extends Error {
  hoehe: number;
  art: string;
  detail: string;
  constructor(hoehe: number, art: string, detail: string) {
    super(`Block ${hoehe}: ${art} — ${detail}`);
    this.hoehe = hoehe;
    this.art = art;
    this.detail = detail;
  }
}

interface Lauf {
  zustand: State;
  hoehe: number;         // zuletzt geprüfte Höhe, -1 = noch nichts
  tipHash: string | null;
  zeiten: bigint[];      // Blockzeiten der letzten Blöcke
  diffs: bigint[];       // zugehörige Schwierigkeiten
  letzterBlock: Block | null;
}

/**
 * Einen Block pruefen und anwenden.
 *
 * Die Reihenfolge ist Absicht: erst billige Pruefungen, dann teure. Ein
 * kaputter Header kostet Mikrosekunden, eine Signaturpruefung Millisekunden.
 */
function pruefeUndWende(lauf: Lauf, roh: Uint8Array, erwarteterHash: string): Block {
  const hoehe = lauf.hoehe + 1;

  let block: Block;
  try { block = deserializeBlock(roh); }
  catch (e) { throw new Abweichung(hoehe, 'unlesbar', String((e as Error).message)); }

  if (block.header.height !== hoehe) {
    throw new Abweichung(hoehe, 'falsche_hoehe',
      `Block meldet Höhe ${block.header.height}`);
  }

  const strukturfehler = checkBlockStructure(block);
  if (strukturfehler) throw new Abweichung(hoehe, 'struktur', strukturfehler);

  // Der Hash, den der Server nennt, muss der sein, der sich ergibt. Sonst
  // stimmt entweder der Koerper nicht oder die Angabe ist erfunden.
  const hash = toHex(headerHash(block.header));
  if (hash !== erwarteterHash) {
    throw new Abweichung(hoehe, 'hash_stimmt_nicht',
      `Server nennt ${erwarteterHash.slice(0, 16)}…, errechnet ${hash.slice(0, 16)}…`);
  }

  /*
    Volle Konsenspruefung: PoW, Merkle, Signaturen, Guthaben, Difficulty,
    Zeitstempel. Genau dieselbe Funktion, die auch der Hauptknoten benutzt.

    Die Difficulty-Regel rechnet mit LOESEZEITEN, nicht mit Zeitstempeln --
    also der Spanne zwischen zwei aufeinanderfolgenden Bloecken. Aus n
    Zeitstempeln ergeben sich n-1 Messwerte.
  */
  const timings = lauf.zeiten.slice(1).map((t, i) => ({
    solveSeconds: t - lauf.zeiten[i],
    difficulty: lauf.diffs[i + 1],
  }));
  const fehler = validateBlock(block, {
    previous: lauf.letzterBlock?.header ?? null,
    state: lauf.zustand,
    recentTimestamps: lauf.zeiten.slice(-11),
    recentTimings: timings.slice(-LWMA_WINDOW - 1),
    now: BigInt(Math.floor(Date.now() / 1000)),
  });
  if (fehler) throw new Abweichung(hoehe, fehler.code, fehler.detail ?? '');

  const vorher = cloneState(lauf.zustand);
  const angewandt = applyBlock(lauf.zustand, block);
  if (!angewandt.ok) {
    lauf.zustand = vorher;
    throw new Abweichung(hoehe, 'anwenden', angewandt.error?.reason ?? '');
  }

  // Der Pruefstein: Der Zustand, den ICH errechne, muss zu der Wurzel
  // passen, die IM BLOCK steht. Stimmt das nicht, ist entweder der Block
  // falsch oder meine Buchfuehrung -- in beiden Faellen darf es nicht
  // stillschweigend weitergehen.
  const meine = toHex(stateRoot(lauf.zustand));
  const seine = toHex(block.header.stateRoot);
  if (meine !== seine) {
    lauf.zustand = vorher;
    throw new Abweichung(hoehe, 'state_root',
      `Block nennt ${seine.slice(0, 16)}…, errechnet ${meine.slice(0, 16)}…`);
  }

  lauf.hoehe = hoehe;
  lauf.tipHash = hash;
  lauf.letzterBlock = block;
  lauf.zeiten.push(block.header.timestamp);
  lauf.diffs.push(block.header.difficulty);
  if (lauf.zeiten.length > LWMA_WINDOW + 12) {
    lauf.zeiten.shift(); lauf.diffs.shift();
  }
  return block;
}

// ------------------------------------------------------------------- Lauf

async function main() {
  const opt = argumente(process.argv.slice(2));
  if (opt.version) { console.log(VERSION); return; }
  if (opt.help) { console.log(HILFE); return; }

  mkdirSync(opt.daten, { recursive: true });
  logDatei = join(opt.daten, 'beobachter.log');

  console.log(fett(`\nYSKAR Beobachter ${VERSION}`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Netz     ${NETWORK}`);
  console.log(`  Server   ${opt.api}`);
  console.log(`  Ablage   ${opt.daten}`);
  console.log(grau('─'.repeat(56)) + '\n');

  const lauf: Lauf = {
    zustand: emptyState(), hoehe: -1, tipHash: null,
    zeiten: [], diffs: [], letzterBlock: null,
  };

  if (!opt.vonVorn) {
    const p = ladePruefpunkt(opt.daten);
    if (p) {
      lauf.zustand = zustandAus(p);
      lauf.hoehe = p.hoehe;
      lauf.tipHash = p.tipHash;
      lauf.zeiten = p.zeitstempel.map(BigInt);
      lauf.diffs = p.schwierigkeiten.map(BigInt);
      // Der letzte Block wird aus der Ablage nachgeladen, weil die
      // Verkettungspruefung ihn braucht.
      const pfad = blockPfad(opt.daten, p.hoehe);
      if (existsSync(pfad)) lauf.letzterBlock = deserializeBlock(readFileSync(pfad));
      melde(grau(`Prüfpunkt geladen: Höhe ${p.hoehe}, ` +
        `Zustandswurzel ${p.stateRoot.slice(0, 16)}…`));
      if (toHex(stateRoot(lauf.zustand)) !== p.stateRoot) {
        melde(rot('Prüfpunkt beschädigt — beginne bei Block 0.'));
        lauf.zustand = emptyState(); lauf.hoehe = -1; lauf.tipHash = null;
        lauf.zeiten = []; lauf.diffs = []; lauf.letzterBlock = null;
      }
    } else {
      melde(grau('Kein Prüfpunkt — beginne bei Block 0.'));
    }
  } else {
    melde(grau('--from-scratch: beginne bei Block 0.'));
  }

  let laeuft = true;
  process.on('SIGINT', () => { laeuft = false; });
  process.on('SIGTERM', () => { laeuft = false; });

  while (laeuft) {
    let geprueft = 0;
    const t0 = Date.now();

    try {
      for (;;) {
        const antwort = await hole(opt.api, `/sync?from=${lauf.hoehe + 1}&count=200`);
        const bloecke: { height: number; hash: string; body: string }[] = antwort.blocks ?? [];
        if (bloecke.length === 0) break;

        for (const b of bloecke) {
          const roh = fromHex(b.body);
          const block = pruefeUndWende(lauf, roh, b.hash);

          const pfad = blockPfad(opt.daten, block.header.height);
          mkdirSync(join(pfad, '..'), { recursive: true });
          writeFileSync(pfad, roh);
          geprueft++;

          if (block.header.height % 500 === 0 || bloecke.length < 200) {
            speicherePruefpunkt(opt.daten,
              pruefpunktAus(lauf.hoehe, lauf.tipHash!, lauf.zustand, lauf.zeiten, lauf.diffs));
          }
        }

        if (!laeuft) break;
      }

      if (geprueft > 0) {
        speicherePruefpunkt(opt.daten,
          pruefpunktAus(lauf.hoehe, lauf.tipHash!, lauf.zustand, lauf.zeiten, lauf.diffs));
        const dauer = ((Date.now() - t0) / 1000).toFixed(1);
        melde(`${grau('[' + uhr() + ']')} ${gruen('✓')} ${geprueft} Blöcke geprüft ` +
          `${grau('·')} Höhe ${lauf.hoehe} ${grau('·')} ` +
          `Umlauf ${(Number(totalSupply(lauf.zustand)) / 1e8).toLocaleString('de-DE',
            { maximumFractionDigits: 0 })} YSR ${grau('·')} ${dauer}s`);
      } else {
        process.stdout.write(`\r\x1b[2K${grau('[' + uhr() + ']')} ` +
          `auf Höhe ${lauf.hoehe}, warte…`);
      }
    } catch (e) {
      if (e instanceof Abweichung) {
        // Der eigentliche Zweck dieses Programms. Nicht weitermachen --
        // ab hier ist jede weitere Aussage wertlos.
        melde('');
        melde(rot(fett('ABWEICHUNG GEFUNDEN')));
        melde(rot(`  Block ${e.hoehe}: ${e.art}`));
        melde(rot(`  ${e.detail}`));
        melde('');
        melde(grau('  Der Server liefert etwas, das der Kette widerspricht.'));
        melde(grau(`  Geprüft bis Höhe ${lauf.hoehe}. Die Blöcke bis dahin liegen in`));
        melde(grau(`  ${opt.daten}/bloecke und lassen sich nachrechnen.`));
        process.exitCode = 2;
        return;
      }
      melde(`${grau('[' + uhr() + ']')} ${gelb('!')} ${(e as Error).message}`);
    }

    if (opt.einmal) break;
    if (!laeuft) break;
    await new Promise(r => setTimeout(r, opt.intervall * 1000));
  }

  console.log('');
  melde(grau(`Beendet auf Höhe ${lauf.hoehe}.`));
}

main().catch(e => { console.error(rot(`\n${e.stack ?? e.message}`)); process.exit(1); });
