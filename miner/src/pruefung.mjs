/**
 * Antworten eines Knotens pruefen, bevor der Miner sie benutzt (Issue #3).
 *
 * Der Knoten ist ein fremder Rechner -- bei einem Pool sogar der eines
 * Fremden. Node Core prueft seine Antworten seit jeher
 * (node-core/src/PoolQuelle.ts: rufe(), baueJob()); der Kommandozeilen-
 * Miner nahm sie bis hierher, wie sie kamen. Dieselben Regeln, als
 * JavaScript ohne Abhaengigkeiten, damit der Miner allein laeuft.
 *
 *   - Eine Anfrage hat eine Frist, folgt keiner Umleitung und liest
 *     hoechstens ANTWORT_MAX Byte.
 *   - Jedes Feld eines Jobs hat Typ und Groesse, die der Header verlangt.
 *   - Kein Ziel ist leichter als Difficulty 1. Ein Ziel "ff..ff" machte
 *     jeden Hash zum Treffer: Der Worker kaeme aus seiner Schleife nicht
 *     mehr heraus, weil sie nur ohne Treffer kurz abgibt, und jeder Treffer
 *     loeste eine Anfrage aus.
 *   - Texte des Knotens werden vor der Ausgabe von Steuerzeichen befreit.
 *     Sonst koennte ein Knoten ueber `detail` oder den Pool-Namen
 *     Escape-Sequenzen ins Terminal schreiben (Farben, Titel, Cursor, Links).
 */
import { targetBytes, toHex } from './header.mjs';

/** Groesste Antwort, die gelesen wird -- wie in Node Core. Ein Job ist kleiner als 2 KB. */
export const ANTWORT_MAX = 64 * 1024;
/** Frist je Anfrage. Node Core wartet 10 s; Einreichen und Anmelden duerfen etwas laenger. */
export const ANFRAGE_MS = 15_000;
/** Das leichteste zulaessige Ziel: Difficulty 1. */
export const LEICHTESTES_ZIEL = toHex(targetBytes(1));

/**
 * Steuerzeichen entfernen: C0, DEL, C1 und die Zeichen, die die
 * Schreibrichtung umdrehen. Uebrig bleibt druckbarer Text.
 */
export function sauber(x) {
  return String(x).replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '');
}

/** Alle Texte einer Antwort saeubern -- tief, aber begrenzt. */
export function saeubere(x, tiefe = 0) {
  if (typeof x === 'string') return sauber(x);
  if (tiefe > 8 || x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(v => saeubere(v, tiefe + 1));
  const o = {};
  for (const [k, v] of Object.entries(x)) o[sauber(k)] = saeubere(v, tiefe + 1);
  return o;
}

/**
 * Den Rumpf einer Antwort lesen: hoechstens ANTWORT_MAX Byte, dann JSON.
 * Kein JSON ergibt ein leeres Objekt (wie bisher).
 */
export async function liesRumpf(res) {
  const teile = [];
  let laenge = 0;
  if (res.body) {
    const leser = res.body.getReader();
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      laenge += value.length;
      if (laenge > ANTWORT_MAX) {
        try { await leser.cancel(); } catch { /* schon zu */ }
        throw new Error('Die Antwort des Knotens ist zu groß.');
      }
      teile.push(value);
    }
  }
  try {
    const d = JSON.parse(Buffer.concat(teile).toString('utf8'));
    return d !== null && typeof d === 'object' && !Array.isArray(d) ? saeubere(d) : {};
  } catch { return {}; }
}

const UNLESBAR = 'Der Knoten schickt unlesbare Arbeit.';
const hex = (x, zeichen) => {
  if (typeof x !== 'string' || x.length !== zeichen || !/^[0-9a-f]+$/.test(x)) throw new Error(UNLESBAR);
  return x;
};
const ganz = (x, max) => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d{1,10}$/.test(x) ? Number(x) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(UNLESBAR);
  return n;
};
const u64 = x => {
  const s = typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? String(x) : x;
  if (typeof s !== 'string' || !/^\d{1,20}$/.test(s) || BigInt(s) > 0xffff_ffff_ffff_ffffn) throw new Error(UNLESBAR);
  return s;
};

/**
 * Eine Share-Difficulty pruefen: ganze Zahl ab 1. Darunter waere das Ziel
 * leichter als Difficulty 1, und eine Bruchzahl liesse targetBytes() werfen.
 *
 * @returns die Zahl, oder null wenn sie nicht taugt
 */
export function shareDifficulty(x) {
  const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d{1,16}$/.test(x) ? Number(x) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * Einen Job pruefen. Wirft mit einer lesbaren Meldung, wenn ein Feld nicht
 * passt; gibt sonst den Job zurueck (unveraendert, Zahlen wie geschickt).
 */
export function pruefeJob(j) {
  if (j === null || typeof j !== 'object') throw new Error(UNLESBAR);
  if (typeof j.jobId !== 'string' || j.jobId.length < 1 || j.jobId.length > 128 || !/^[\x21-\x7e]+$/.test(j.jobId)) {
    throw new Error(UNLESBAR);
  }
  ganz(j.version ?? 1, 0xffff_ffff);
  ganz(j.height, 0xffff_ffff);
  hex(j.prevHash, 64);
  hex(j.merkleRoot, 64);
  hex(j.stateRoot, 64);
  u64(j.timestamp);
  ganz(j.difficulty, 0xffff_ffff);
  ganz(j.txCount, 0xffff_ffff);
  if (j.extranonce !== undefined) u64(j.extranonce);
  const ziel = hex(j.target, 64);
  // Gleich lange Hex-Texte in Kleinbuchstaben vergleichen sich wie Zahlen.
  if (/^0+$/.test(ziel) || ziel > LEICHTESTES_ZIEL) throw new Error(UNLESBAR);
  if (j.shareDifficulty !== undefined && shareDifficulty(j.shareDifficulty) === null) throw new Error(UNLESBAR);
  return j;
}
