/*
 * GPU-Rechenwerk fuer den CLI-Miner.
 *
 * Startet dasselbe Programm, das auch der Node Core benutzt --
 * yskar-cuda(.exe) -- als Kindprozess und spricht mit ihm ueber Zeilen aus
 * JSON.
 *
 * WARUM EIN EIGENER PROZESS: Ein Absturz im Treiber reisst nur ihn mit. Der
 * Miner meldet dann "GPU ausgefallen" und rechnet mit der CPU weiter,
 * statt selbst zu sterben.
 *
 * WAS DIESE DATEI NICHT TUT: Bloecke pruefen oder Shares bewerten. Sie
 * reicht Jobs hinein und Nonces heraus. Ob eine Nonce zaehlt, entscheidet
 * der Server -- genau wie bei den CPU-Threads.
 *
 * ---------------------------------------------------------------------
 * EINE EIGENHEIT, DIE MAN KENNEN SOLLTE
 *
 * Der Kernel meldet je Stapel HOECHSTENS EINEN Treffer. Ein Stapel dauert
 * 100 bis 250 ms. Solange das Share-Ziel noch leicht ist -- direkt nach dem
 * Anmelden steht es bei 128 --, faellt in einem Stapel oft mehr als ein
 * Treffer, und die ueberzaehligen gehen verloren.
 *
 * Das kostet in den ersten Sekunden etwas Gutschrift. Sobald der Server das
 * Ziel nachgezogen hat (er zielt auf einen Share alle 30 s), kommt auf
 * einen Stapel weit weniger als ein Treffer, und der Verlust verschwindet.
 *
 * Verhindern liesse es sich nur, indem der Kernel eine Trefferliste fuehrt.
 * Das kostet in JEDEM Stapel Arbeit, um einen Fall zu retten, der nur in
 * den ersten Sekunden auftritt -- der Tausch lohnt nicht.
 * ---------------------------------------------------------------------
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeHeader } from './header.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));

/** Wo das Programm liegen koennte -- in der Reihenfolge des Nachsehens. */
export function findeGpuProgramm(eigen) {
  if (eigen) return existsSync(eigen) ? eigen : null;
  const name = process.platform === 'win32' ? 'yskar-cuda.exe' : 'yskar-cuda';
  const orte = [
    join(HIER, '..', 'gpu', name),
    join(HIER, '..', '..', 'node-core', 'gpu', 'bin', name),
    join(process.cwd(), 'gpu', 'bin', name),
    join(process.cwd(), name),
  ];
  return orte.find(existsSync) ?? null;
}

/**
 * Pruefen, ob die Karte richtig rechnet -- VOR dem ersten Job.
 *
 * Eine Karte, die falsch rechnet, liefert Nonces, die der Server ablehnt.
 * Das sieht aus wie ein Netzproblem und kostet Stunden Suche. Der
 * Selbsttest laesst die KARTE den Genesis-Hash rechnen und vergleicht ihn
 * Bit fuer Bit.
 */
export function pruefeGpu(programm, geraet) {
  const r = spawnSync(programm, ['--selftest', '--device', String(geraet)],
    { encoding: 'utf8', timeout: 60_000 });
  if (r.error) return { ok: false, grund: r.error.message };

  const zeilen = String(r.stdout || '').split('\n').filter(Boolean);
  let name = null, bestanden = false;
  for (const z of zeilen) {
    try {
      const m = JSON.parse(z);
      if (m.t === 'device' && m.name) name = `${m.name} (CC ${m.cc})`;
      if (m.t === 'selftest' && m.result === 'PASSED') bestanden = true;
      if (m.t === 'selftest' && m.ok === false) {
        return { ok: false, grund: `Selbsttest fehlgeschlagen: ${m.check}` };
      }
    } catch { /* Zeilen, die kein JSON sind, ignorieren */ }
  }
  if (!bestanden) return { ok: false, grund: 'Selbsttest nicht bestanden' };
  return { ok: true, name };
}

/**
 * Einen Job in die 136 Byte umwandeln, die der Kernel erwartet.
 *
 * Benutzt DIESELBE Serialisierung wie die CPU-Threads (header.mjs). Eine
 * zweite Umsetzung hier waere ein Fehler mit Ansage: Sie muesste bitgenau
 * mit der ersten uebereinstimmen, und wenn nicht, rechnet die Karte
 * fleissig und jeder Treffer wird abgelehnt.
 *
 * WAS IM JOB FEHLEN KANN: Der Server auf Vercel liefert weder `version`
 * noch `extranonce`. Die Version ist immer 1, und die Extranonce gehoert
 * zur SITZUNG, nicht zum Job -- der Aufrufer muss sie hineinlegen, genau
 * wie es die Worker tun.
 */
export function headerHex(job) {
  if (job.extranonce === undefined || job.extranonce === null) {
    throw new Error('Job ohne Extranonce -- sie gehört zur Sitzung, '
      + 'nicht zum Job, und muss vom Aufrufer ergänzt werden.');
  }
  return Array.from(serializeHeader(job, 0n),
    (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Das laufende GPU-Rechenwerk.
 *
 * @param opt.programm  Pfad zu yskar-cuda
 * @param opt.geraet    Geraetenummer
 * @param opt.onShare   ({jobId, nonce}) -- ein Treffer
 * @param opt.onRate    (hashesProSekunde)
 * @param opt.onLog     (text)
 * @param opt.onAus     (grund) -- das Programm ist weg
 */
export function starteGpu(opt) {
  const kind = spawn(opt.programm, ['--device', String(opt.geraet)],
    { stdio: ['pipe', 'pipe', 'pipe'] });

  let rest = '';
  let letzterJob = null;
  let letztesZiel = null;
  let lebt = true;

  kind.stdout.on('data', (d) => {
    rest += d.toString();
    const zeilen = rest.split('\n');
    rest = zeilen.pop() ?? '';
    for (const z of zeilen) {
      if (!z.trim()) continue;
      let m;
      try { m = JSON.parse(z); } catch { continue; }

      if (m.t === 'found') {
        opt.onShare?.({ jobId: m.jobId, nonce: String(m.nonce) });
      } else if (m.t === 'progress') {
        opt.onRate?.((Number(m.hashes) * 1000) / Math.max(1, Number(m.ms)));
      } else if (m.t === 'device') {
        opt.onLog?.(`GPU: ${m.name} · ${m.cc} · ${
          (Number(m.vram) / 1024 ** 3).toFixed(1)} GB`);
      } else if (m.t === 'error') {
        opt.onLog?.(`GPU: ${m.message}`);
      }
    }
  });

  // Fehlerausgaben des Programms nicht verschlucken -- dort stehen
  // Treiberfehler, die sonst niemand sieht.
  kind.stderr.on('data', (d) => {
    const t = d.toString().trim();
    if (t) opt.onLog?.(`GPU: ${t}`);
  });

  kind.on('exit', (code, signal) => {
    lebt = false;
    opt.onAus?.(signal ? `Signal ${signal}` : `Rückgabe ${code}`);
  });
  kind.on('error', (e) => {
    lebt = false;
    opt.onAus?.(e.message);
  });

  return {
    get lebt() { return lebt; },

    /** Was die Karte gerade rechnet -- fuer den Abgleich eintreffender Treffer. */
    get jobId() { return letzterJob; },

    /**
     * Einen Job uebergeben.
     *
     * Auch wenn sich NUR DAS ZIEL geaendert hat. Der Server zieht es per
     * VarDiff nach, und das Programm kennt kein eigenes Ziel-Kommando --
     * es nimmt Header und Ziel nur zusammen entgegen.
     *
     * Ohne das rechnet die Karte weiter gegen das alte, LEICHTERE Ziel und
     * liefert Treffer, die der Server als "low_difficulty" abweist. Genau
     * das war der Grund fuer 269 Ablehnungen gegen 14 Annahmen.
     */
    job(job, zielHex) {
      if (!lebt) return;
      if (job.jobId === letzterJob && zielHex === letztesZiel) return;
      letzterJob = job.jobId;
      letztesZiel = zielHex;
      try {
        kind.stdin.write(JSON.stringify({
          t: 'job', jobId: job.jobId, header: headerHex(job), target: zielHex,
        }) + '\n');
      } catch (e) { opt.onLog?.(`GPU: Job nicht übergeben (${e.message})`); }
    },

    stop() {
      if (!lebt) return;
      try { kind.stdin.write(JSON.stringify({ t: 'quit' }) + '\n'); } catch { /* egal */ }
      setTimeout(() => { try { kind.kill(); } catch { /* egal */ } }, 500);
    },
  };
}
