/**
 * Issue #4: Derselbe Job mit nur einem neuen Ziel laesst die Karte weiter
 * rechnen, wo sie steht -- statt wieder bei Nonce 0 zu beginnen und schon
 * Gefundenes als Duplikate zu liefern.
 *
 * Geprueft am Rechenprogramm selbst (yskar_host.cpp), uebersetzt mit der
 * CPU-Nachbildung statt CUDA: Das Protokoll und die Nonce-Fuehrung sind
 * derselbe Code wie auf der Karte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const EMU = join(import.meta.dirname, '..', 'gpu', 'bin', 'yskar-cuda-emu');
const warte = (ms: number) => new Promise(r => setTimeout(r, ms));

// Difficulty 1: jeder ~65.536-ste Hash trifft -- genug Treffer in kurzer Zeit.
const LEICHT = '0001' + '00'.repeat(30);
const LEICHTER_2 = '0000' + 'ff'.repeat(30);
const KOPF_A = '01'.repeat(136);
const KOPF_B = '02'.repeat(136);

function programm() {
  const kind = spawn(EMU, ['--device', '0'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const funde: { jobId: string; nonce: bigint }[] = [];
  let bereit = false;
  createInterface({ input: kind.stdout }).on('line', z => {
    try {
      const m = JSON.parse(z);
      if (m.t === 'ready') bereit = true;
      if (m.t === 'found') funde.push({ jobId: m.jobId, nonce: BigInt(m.nonce) });
    } catch { /* keine JSON-Zeile */ }
  });
  return {
    funde,
    bereit: () => bereit,
    sende: (o: unknown) => kind.stdin.write(JSON.stringify(o) + '\n'),
    zu: () => { kind.stdin.write('{"t":"quit"}\n'); kind.kill(); },
  };
}

test('Gleicher Job, neues Ziel: kein Neubeginn bei 0; anderer Header: Neubeginn', { skip: !existsSync(EMU) && 'yskar-cuda-emu fehlt (npm run build:gpu-emu)' }, async () => {
  const p = programm();
  try {
    for (let i = 0; i < 100 && !p.bereit(); i++) await warte(50);
    assert.ok(p.bereit());

    p.sende({ t: 'job', jobId: 'a', header: KOPF_A, target: LEICHT });
    for (let i = 0; i < 100 && p.funde.length < 5; i++) await warte(50);
    assert.ok(p.funde.length >= 5, `Treffer: ${p.funde.length}`);
    const vorher = p.funde.length;
    const hoechste = p.funde.reduce((m, f) => (f.nonce > m ? f.nonce : m), 0n);

    // Nur das Ziel aendert sich.
    p.sende({ t: 'job', jobId: 'a', header: KOPF_A, target: LEICHTER_2 });
    for (let i = 0; i < 100 && p.funde.length < vorher + 5; i++) await warte(50);
    const danach = p.funde.slice(vorher);
    assert.ok(danach.length >= 3, `Treffer nach der Zielaenderung: ${danach.length}`);
    for (const f of danach) assert.ok(f.nonce > hoechste, `Nonce ${f.nonce} liegt nicht hinter ${hoechste} -- die Karte hat neu begonnen`);
    // Und keine Nonce doppelt.
    const alle = p.funde.map(f => f.nonce.toString());
    assert.equal(new Set(alle).size, alle.length, 'Duplikate');

    // Anderer Header unter derselben Kennung ist ein anderer Job: von vorn.
    const n2 = p.funde.length;
    p.sende({ t: 'job', jobId: 'a', header: KOPF_B, target: LEICHT });
    for (let i = 0; i < 100 && p.funde.length < n2 + 4; i++) await warte(50);
    const neu = p.funde.slice(n2);
    assert.ok(neu.length >= 2);
    // Der erste Fund kann noch aus dem Stapel stammen, der beim Wechsel lief.
    assert.ok(neu.some(f => f.nonce < hoechste), 'ein neuer Header beginnt wieder vorn');
  } finally { p.zu(); }
});
