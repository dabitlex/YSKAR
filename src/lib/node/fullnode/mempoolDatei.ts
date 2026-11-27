/**
 * Die Warteschlange ueber einen Neustart retten (Volllast-Konzept M3).
 *
 * Der Mempool lebt im Speicher. Beim Stresstest am 26.11.2026 war er nach
 * dem Neustart des Hauptknotens leer; die Ueberweisungen kamen nur zurueck,
 * weil andere Knoten sie noch hatten. Jetzt schreibt der Knoten sie beim
 * Beenden und regelmaessig in eine Datei und nimmt sie beim Start wieder auf
 * -- mit ihrer urspruenglichen Ankunftszeit, sonst begaenne die
 * 72-Stunden-Frist bei jedem Neustart von vorn.
 *
 * Die Datei ist kein Vertrauensanker: Jede Ueberweisung wird beim Laden voll
 * geprueft wie eine, die ueber das Netz kommt. Eine kaputte oder fremde
 * Datei kostet nur das Wiederladen.
 *
 * Aufbau (binaer, klein, ohne Hex):
 *   "YSKMEMP1"  8 Byte
 *   Netzname    u8 Laenge + UTF-8
 *   Anzahl      u32
 *   je Eintrag  u8 Flags (Bit 0: eigene), f64 Ankunft (ms), u32 Laenge, Rohbytes
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';

import { serializeTx, deserializeTx, TX_COINBASE, type Spend } from '../../core/tx.ts';

const MAGIE = new TextEncoder().encode('YSKMEMP1');

export interface GesicherteTx { tx: Spend; lokal: boolean; seit: number }

/** Nach so vielen Eintraegen gibt das Schreiben/Laden die Ereignisschleife frei. */
const SCHEIBE = 2_000;
const pause = () => new Promise<void>(r => setImmediate(r));

function kopf(netz: string, anzahl: number): Uint8Array {
  const n = new TextEncoder().encode(netz);
  const b = new Uint8Array(8 + 1 + n.length + 4);
  b.set(MAGIE, 0); b[8] = n.length; b.set(n, 9);
  new DataView(b.buffer).setUint32(9 + n.length, anzahl, true);
  return b;
}

function eintrag(e: GesicherteTx): Uint8Array {
  const roh = serializeTx(e.tx);
  const b = new Uint8Array(1 + 8 + 4 + roh.length);
  const dv = new DataView(b.buffer);
  b[0] = e.lokal ? 1 : 0;
  dv.setFloat64(1, e.seit, true);
  dv.setUint32(9, roh.length, true);
  b.set(roh, 13);
  return b;
}

/** Beim Beenden: sofort und vollstaendig (keine Ereignisschleife mehr). */
export function schreibeMempoolSofort(pfad: string, netz: string, eintraege: GesicherteTx[]): void {
  const teile = [kopf(netz, eintraege.length), ...eintraege.map(eintrag)];
  writeFileSync(pfad + '.neu', Buffer.concat(teile));
  renameSync(pfad + '.neu', pfad);
}

/** Im Betrieb: in Scheiben, damit der Knoten waehrenddessen antwortet. */
export async function schreibeMempool(pfad: string, netz: string, eintraege: GesicherteTx[]): Promise<void> {
  const teile: Uint8Array[] = [kopf(netz, eintraege.length)];
  for (let i = 0; i < eintraege.length; i++) {
    teile.push(eintrag(eintraege[i]));
    if (i % SCHEIBE === SCHEIBE - 1) await pause();
  }
  await writeFile(pfad + '.neu', Buffer.concat(teile));
  await rename(pfad + '.neu', pfad);
}

/**
 * Datei lesen. Fehlt sie, gehoert sie zu einem anderen Netz oder ist sie
 * kaputt, kommt eine leere Liste mit Hinweis zurueck -- nie ein Fehler, der
 * den Start verhindert.
 */
export function leseMempool(pfad: string, netz: string): { eintraege: GesicherteTx[]; hinweis?: string } {
  if (!existsSync(pfad)) return { eintraege: [] };
  let b: Uint8Array;
  try { b = new Uint8Array(readFileSync(pfad)); } catch (e) { return { eintraege: [], hinweis: `nicht lesbar: ${(e as Error).message}` }; }
  if (b.length < 13 || !MAGIE.every((x, i) => b[i] === x)) return { eintraege: [], hinweis: 'unbekanntes Format' };
  const nl = b[8];
  const dateiNetz = new TextDecoder().decode(b.subarray(9, 9 + nl));
  if (dateiNetz !== netz) return { eintraege: [], hinweis: `gehoert zu ${dateiNetz}, nicht ${netz}` };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const anzahl = dv.getUint32(9 + nl, true);
  const eintraege: GesicherteTx[] = [];
  let pos = 13 + nl;
  for (let i = 0; i < anzahl; i++) {
    if (pos + 13 > b.length) return { eintraege, hinweis: `abgeschnitten nach ${i} von ${anzahl}` };
    const flags = b[pos]; const seit = dv.getFloat64(pos + 1, true); const len = dv.getUint32(pos + 9, true);
    pos += 13;
    if (pos + len > b.length) return { eintraege, hinweis: `abgeschnitten nach ${i} von ${anzahl}` };
    try {
      const tx = deserializeTx(b.subarray(pos, pos + len));
      if (tx.type !== TX_COINBASE && Number.isFinite(seit)) eintraege.push({ tx: tx as Spend, lokal: (flags & 1) === 1, seit });
    } catch { /* einzelne kaputte Eintraege ueberspringen */ }
    pos += len;
  }
  return { eintraege };
}

/**
 * Gelesene Eintraege wieder aufnehmen, in Scheiben. `aufnehmen` ist
 * pool.add mit dem aktuellen Zustand -- die volle Pruefung.
 */
export async function nimmWiederAuf(
  eintraege: GesicherteTx[],
  aufnehmen: (e: GesicherteTx) => boolean,
): Promise<{ aufgenommen: number; abgewiesen: number }> {
  let aufgenommen = 0, abgewiesen = 0;
  for (let i = 0; i < eintraege.length; i++) {
    if (aufnehmen(eintraege[i])) aufgenommen++; else abgewiesen++;
    if (i % SCHEIBE === SCHEIBE - 1) await pause();
  }
  return { aufgenommen, abgewiesen };
}
