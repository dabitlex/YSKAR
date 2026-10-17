/**
 * Signatur-Messung im Browser (docs/CONSENSUS_V6.md 7.7, 7.8).
 *
 * Laeuft ohne Installation: eine HTML-Datei, im Browser geoeffnet. Chrome
 * oder Edge, weil Node.js und Node Core (Electron) dieselbe JavaScript-
 * Maschine (V8) benutzen -- die Zahlen sind damit uebertragbar.
 *
 * Misst, was ein Knoten bei einem vollen Block tut:
 *   1. Richtigkeit: alle 196 ZIP-215-Vektoren und 12 speccheck-Faelle
 *      mit dem WASM-Modul -- sonst sind die Zeiten wertlos.
 *   2. 8.000 Signaturen einzeln (WASM), drei Durchlaeufe.
 *   3. 8.000 Signaturen als Stapel (WASM), drei Durchlaeufe.
 *   4. noble (reines JavaScript) mit 1.000 Signaturen, hochgerechnet --
 *      nur zum Vergleich, das dauert auf alter Hardware sonst Minuten.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { ZIP215_WASM_BASE64, ZIP215_WASM_SHA256 } from '../../src/lib/node/zip215Wasm.ts';
import vektoren from '../../tests/fixtures/ed25519-vektoren.json';

const N = 8000, N_NOBLE = 1000, EINTRAG = 128;
const aus = document.getElementById('aus') as HTMLPreElement;
const knopf = document.getElementById('start') as HTMLButtonElement;
const kopieren = document.getElementById('kopieren') as HTMLButtonElement;
const zeile = (t: string) => { aus.textContent += t + '\n'; };
const pause = () => new Promise(r => setTimeout(r, 30));
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map(b => parseInt(b, 16)));

async function sha256(b: Uint8Array) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  return [...d].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function start() {
  knopf.disabled = true;
  aus.textContent = '';
  zeile('YSKAR Signatur-Messung (Konsensfassung 6)');
  zeile(`Datum:        ${new Date().toISOString()}`);
  zeile(`Browser:      ${navigator.userAgent}`);
  zeile(`Kerne:        ${navigator.hardwareConcurrency ?? '?'}`);
  zeile('');

  const bytes = Uint8Array.from(atob(ZIP215_WASM_BASE64), c => c.charCodeAt(0));
  const sha = await sha256(bytes);
  zeile(`Modul:        ${sha === ZIP215_WASM_SHA256 ? 'Pruefsumme ok' : 'PRUEFSUMME FALSCH'} (${sha.slice(0, 16)}…)`);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports as unknown as {
    memory: WebAssembly.Memory; puffer(): number; stapel(): number; saat(): number;
    verify(n: number): number; verify_batch(n: number): number;
  };
  const einzeln = (s: Uint8Array, m: Uint8Array, p: Uint8Array) => {
    const b = new Uint8Array(ex.memory.buffer, ex.puffer(), 96 + m.length);
    b.set(s, 0); b.set(p, 64); b.set(m, 96);
    return ex.verify(m.length) === 1;
  };

  // 1. Richtigkeit
  const msgZ = new TextEncoder().encode('Zcash');
  let falsch = 0;
  for (const c of (vektoren as any).zip215.faelle) if (einzeln(hex(c.sig), msgZ, hex(c.vk)) !== c.zip215) falsch++;
  for (const c of (vektoren as any).speccheck.faelle) if (einzeln(hex(c.signature), hex(c.message), hex(c.pub_key)) !== c.zip215) falsch++;
  zeile(`Richtigkeit:  ${falsch === 0 ? 'alle 208 Testvektoren richtig' : `${falsch} FALSCH -- Messung ungueltig`}`);
  zeile('');

  zeile(`Erzeuge ${N} Testsignaturen …`); await pause();
  const daten: [Uint8Array, Uint8Array, Uint8Array][] = [];
  for (let i = 0; i < N; i++) {
    const sk = crypto.getRandomValues(new Uint8Array(32)), m = crypto.getRandomValues(new Uint8Array(32));
    daten.push([ed25519.sign(m, sk), m, ed25519.getPublicKey(sk)]);
    if (i % 1000 === 999) await pause();
  }

  // 2. einzeln
  const einzelZeiten: number[] = [];
  for (let r = 0; r < 3; r++) {
    await pause();
    const t = performance.now();
    for (const [s, m, p] of daten) if (!einzeln(s, m, p)) throw new Error('gueltige Signatur abgelehnt');
    einzelZeiten.push(performance.now() - t);
    zeile(`WASM einzeln, ${N}:   Durchlauf ${r + 1}: ${einzelZeiten[r].toFixed(0)} ms`);
  }

  // 3. Stapel
  const stapelZeiten: number[] = [];
  for (let r = 0; r < 3; r++) {
    await pause();
    const t = performance.now();
    const b = new Uint8Array(ex.memory.buffer, ex.stapel(), EINTRAG * N);
    daten.forEach(([s, m, p], i) => { b.set(s, i * EINTRAG); b.set(p, i * EINTRAG + 64); b.set(m, i * EINTRAG + 96); });
    crypto.getRandomValues(new Uint8Array(ex.memory.buffer, ex.saat(), 32));
    if (ex.verify_batch(N) !== 1) throw new Error('gueltiger Stapel abgelehnt');
    stapelZeiten.push(performance.now() - t);
    zeile(`WASM Stapel, ${N}:    Durchlauf ${r + 1}: ${stapelZeiten[r].toFixed(0)} ms`);
  }
  // Gegenprobe: eine verfaelschte Signatur muss den Stapel kippen.
  const b = new Uint8Array(ex.memory.buffer, ex.stapel(), EINTRAG * N);
  b[EINTRAG * 4321 + 7] ^= 1;
  crypto.getRandomValues(new Uint8Array(ex.memory.buffer, ex.saat(), 32));
  const gekippt = ex.verify_batch(N) === 0;
  zeile(`Gegenprobe:   ${gekippt ? 'verfaelschte Signatur erkannt' : 'FEHLER: verfaelschte Signatur NICHT erkannt'}`);

  // 4. noble zum Vergleich
  await pause();
  const t = performance.now();
  for (let i = 0; i < N_NOBLE; i++) { const [s, m, p] = daten[i]; ed25519.verify(s, m, p); }
  const noble = (performance.now() - t) * (N / N_NOBLE);
  zeile(`noble (JS), hochgerechnet auf ${N}: ${noble.toFixed(0)} ms`);

  const maxStapel = Math.max(...stapelZeiten), maxEinzeln = Math.max(...einzelZeiten);
  zeile('');
  zeile(`ERGEBNIS: Stapel schlechtester Lauf ${maxStapel.toFixed(0)} ms, einzeln ${maxEinzeln.toFixed(0)} ms`);
  zeile(falsch === 0 && gekippt ? 'Messung gueltig.' : 'MESSUNG UNGUELTIG.');
  zeile('Bitte diesen ganzen Text kopieren und an Claude schicken.');
  knopf.disabled = false;
  kopieren.hidden = false;
}

knopf.addEventListener('click', () => { start().catch(e => { zeile(`FEHLER: ${(e as Error).message}`); knopf.disabled = false; }); });
kopieren.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(aus.textContent ?? ''); kopieren.textContent = 'Kopiert'; }
  catch { const r = document.createRange(); r.selectNodeContents(aus); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); kopieren.textContent = 'Markiert – mit Strg+C kopieren'; }
});
