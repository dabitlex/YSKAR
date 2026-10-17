/**
 * ZIP-215-Pruefer aus WebAssembly fuer Knoten (docs/CONSENSUS_V6.md 7.8).
 *
 * ed25519-zebra 5.0.0 der Zcash Foundation, uebersetzt nach WebAssembly
 * (Quelle und Bauanleitung: crypto/zip215). Prueft dieselbe Regel wie noble,
 * einzeln rund zehnmal und im Stapel rund dreissigmal schneller.
 *
 * Nur fuer Knoten: Die Datei bettet rund 140 KB ein und kompiliert sie
 * synchron -- im Browser waere beides falsch. Die Mini App laedt sie nie;
 * dort bleibt noble, mit demselben Ergebnis.
 *
 * Laesst sich das Modul nicht laden oder besteht es die Selbstprobe beim
 * Start nicht, bleibt es bei noble. Langsamer, aber nie anders.
 */
import { randomFillSync, createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { setzePruefer, NOBLE, type Pruefer, type SignaturTripel } from '../core/sigcheck.ts';
import { ZIP215_WASM_BASE64, ZIP215_WASM_SHA256 } from './zip215Wasm.ts';

const MAX_NACHRICHT = 4096;
const EINTRAG = 128;

interface Exporte {
  memory: WebAssembly.Memory;
  puffer(): number;
  stapel(): number;
  saat(): number;
  max_stapel(): number;
  verify(laenge: number): number;
  verify_batch(anzahl: number): number;
}

let geladen: Pruefer | null | undefined;

/**
 * Das Modul laden. Liefert null, wenn es nicht geht.
 *
 * Wichtig: Jede Sicht auf den Speicher wird bei JEDEM Aufruf neu angelegt.
 * Waechst der Speicher des Moduls (bei der Stapelpruefung), wird der alte
 * ArrayBuffer abgeloest; Schreibzugriffe ueber eine alte Sicht gingen dann
 * still ins Leere, und das Modul praefte veraltete Bytes.
 */
export function ladeZip215Wasm(): Pruefer | null {
  if (geladen !== undefined) return geladen;
  try {
    const bytes = Buffer.from(ZIP215_WASM_BASE64, 'base64');
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== ZIP215_WASM_SHA256) throw new Error(`Pruefsumme ${sha}`);
    const ex = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Exporte;
    const MAX_STAPEL = ex.max_stapel();

    const einzeln = (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean => {
      if (signature.length !== 64 || publicKey.length !== 32) return false;
      if (message.length > MAX_NACHRICHT) return NOBLE.einzeln(signature, message, publicKey);
      const m = new Uint8Array(ex.memory.buffer, ex.puffer(), 96 + message.length);
      m.set(signature, 0); m.set(publicKey, 64); m.set(message, 96);
      return ex.verify(message.length) === 1;
    };

    const stapel = (eintraege: SignaturTripel[]): boolean => {
      // Nur 32-Byte-Nachrichten (Sighashes) passen in einen Eintrag. Alles
      // andere einzeln -- dasselbe Ergebnis.
      const passend: SignaturTripel[] = [];
      for (const e of eintraege) {
        if (e.signature.length !== 64 || e.publicKey.length !== 32) return false;
        if (e.message.length === 32) passend.push(e);
        else if (!einzeln(e.signature, e.message, e.publicKey)) return false;
      }
      for (let start = 0; start < passend.length; start += MAX_STAPEL) {
        const teil = passend.slice(start, start + MAX_STAPEL);
        const m = new Uint8Array(ex.memory.buffer, ex.stapel(), EINTRAG * teil.length);
        teil.forEach((e, i) => {
          m.set(e.signature, i * EINTRAG);
          m.set(e.publicKey, i * EINTRAG + 64);
          m.set(e.message, i * EINTRAG + 96);
        });
        // Frischer Zufall je Aufruf: Die Stapelpruefung ist nur mit
        // unvorhersehbaren Koeffizienten sicher.
        randomFillSync(new Uint8Array(ex.memory.buffer, ex.saat(), 32));
        if (ex.verify_batch(teil.length) !== 1) return false;
      }
      return true;
    };

    const p: Pruefer = { name: 'ed25519-zebra-wasm', einzeln, stapel };
    if (!selbstprobe(p)) throw new Error('Selbstprobe fehlgeschlagen');
    geladen = p;
  } catch {
    geladen = null;
  }
  return geladen;
}

/**
 * Selbstprobe beim Laden: einige Faelle, in denen Ed25519-Bibliotheken
 * erfahrungsgemaess auseinandergehen, muessen genau wie noble ausgehen.
 * Die vollstaendigen Vektoren laufen in tests/zip215.test.ts; hier geht es
 * nur darum, ein beschaedigtes oder vertauschtes Modul nie zu benutzen.
 */
function selbstprobe(p: Pruefer): boolean {
  const h = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));
  const msg = new TextEncoder().encode('Zcash');
  // Aus den offiziellen ZIP-215-Vektoren: Schluessel und R kleiner Ordnung,
  // S = 0 -- nach ZIP 215 gueltig, nach RFC 8032 nicht.
  const klein: [string, string][] = [
    ['0100000000000000000000000000000000000000000000000000000000000000',
      '0100000000000000000000000000000000000000000000000000000000000000' + '00'.repeat(32)],
    ['ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      '0000000000000000000000000000000000000000000000000000000000000080' + '00'.repeat(32)],
  ];
  for (const [pk, sig] of klein) {
    const a = p.einzeln(h(sig), msg, h(pk));
    if (a !== NOBLE.einzeln(h(sig), msg, h(pk)) || a !== true) return false;
  }
  // Eine echte Signatur gilt, eine verfaelschte nicht -- einzeln und im Stapel.
  const sk = new Uint8Array(32).fill(7);
  const pub = NOBLE_PUB(sk);
  const m32 = new Uint8Array(32).fill(1);
  const sig = NOBLE_SIGN(m32, sk);
  const falsch = Uint8Array.from(sig); falsch[0] ^= 1;
  if (!p.einzeln(sig, m32, pub) || p.einzeln(falsch, m32, pub)) return false;
  if (!p.stapel!([{ signature: sig, message: m32, publicKey: pub }, { signature: sig, message: m32, publicKey: pub }])) return false;
  if (p.stapel!([{ signature: sig, message: m32, publicKey: pub }, { signature: falsch, message: m32, publicKey: pub }])) return false;
  return true;
}

const NOBLE_PUB = (sk: Uint8Array) => ed25519.getPublicKey(sk);
const NOBLE_SIGN = (m: Uint8Array, sk: Uint8Array) => ed25519.sign(m, sk);

/**
 * Fuer Knoten: das Modul als Pruefer einsetzen. Gibt an, welcher Pruefer
 * danach gilt. Mehrfacher Aufruf ist harmlos.
 *
 * YSKAR_SIGCHECK=noble erzwingt noble -- fuer Vergleichslaeufe und falls
 * das Modul auf einer Plattform je Probleme macht.
 */
export function aktiviereZip215Wasm(): string {
  if (process.env.YSKAR_SIGCHECK === 'noble') { setzePruefer(NOBLE); return NOBLE.name; }
  const p = ladeZip215Wasm();
  setzePruefer(p ?? NOBLE);
  return (p ?? NOBLE).name;
}
