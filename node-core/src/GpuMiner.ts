/**
 * GPU-Miner.
 *
 * Startet das CUDA-Programm (gpu/yskar_cuda.cu) als Kindprozess und
 * verbindet es mit dem MiningCoordinator -- genau wie LocalMiner die
 * CPU-Worker verbindet.
 *
 * DER KNOTEN BLEIBT DER PRUEFER. Das Programm meldet nur Nonces, deren Hash
 * das Ziel erfuellt. Jeder Treffer geht durch MiningCoordinator.submitNonce()
 * und damit durch dieselbe vollstaendige Validierung wie jeder andere
 * Block. Einem Treffer von der Karte wird nicht mehr geglaubt als einem aus
 * dem Netz.
 *
 * FEHLT DIE GPU, laeuft alles andere weiter. Kein CUDA, kein Programm,
 * falsche Karte, abgestuerzter Treiber -- in jedem Fall meldet dieser
 * Miner "nicht verfuegbar" und haelt den Knoten nicht auf. Deshalb ein
 * eigener Prozess statt eines nativen Moduls: Ein Treiberabsturz reisst
 * nur ihn mit.
 *
 * EIGENER NONCE-BEREICH: Der GPU-Miner bekommt eine eigene Extranonce und
 * damit einen eigenen Job. CPU und GPU koennen dieselbe Nonce gar nicht
 * doppelt pruefen -- die Header unterscheiden sich schon an Byte 120.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

import type { MiningCoordinator, MiningJob } from '../../src/lib/node/fullnode/MiningCoordinator.ts';

/** Wie LocalMiner: sicher unter den 90 Sekunden, nach denen Jobs verfallen. */
export const GPU_JOB_REFRESH_MS = 30_000;
/** Wie lange die Geraeteerkennung dauern darf. */
export const PROBE_TIMEOUT_MS = 15_000;

export interface GpuGeraet {
  id: number;
  name: string;
  cc: string;
  vram: number;
  sm: number;
  /** Nur die CPU-Nachbildung zum Pruefen -- keine echte Karte. */
  emulation?: boolean;
}

export interface GpuErkennung {
  verfuegbar: boolean;
  programm: string | null;
  geraete: GpuGeraet[];
  /** Warum nicht verfuegbar -- fuer die Anzeige, nicht zum Raten. */
  grund: string | null;
}

export interface GpuMinerStatus {
  running: boolean;
  device: GpuGeraet | null;
  hashrate: number;
  hashes: number;
  shares: number;
  blocks: number;
  errors: number;
  height: number | null;
  lastError: string | null;
  selftest: GpuSelbsttest | null;
  uptimeSeconds: number;
}

export interface GpuMinerOptionen {
  mining: MiningCoordinator;
  /** Pfad zum Programm. Ohne Angabe wird an den ueblichen Stellen gesucht. */
  programm?: string;
  onBlock?: (height: number, hash: string) => void;
  onLog?: (text: string) => void;
}

/**
 * Wo liegt das Programm?
 *
 * Zuerst die Umgebungsvariable, dann neben dem Bundle, dann im Quellbaum.
 * Nicht gefunden ist kein Fehler, sondern der Normalfall ohne CUDA.
 */
export function findeProgramm(ausdruecklich?: string): string | null {
  const name = process.platform === 'win32' ? 'yskar-cuda.exe' : 'yskar-cuda';
  const hier = typeof __dirname !== 'undefined'
    ? __dirname : dirname(fileURLToPath(import.meta.url));
  const kandidaten = [
    ausdruecklich,
    process.env.YSKAR_CUDA_EXE,
    join(hier, name),
    join(hier, 'gpu', name),
    join(hier, '..', 'gpu', 'bin', name),
    resolve(process.cwd(), 'gpu', 'bin', name),
    // Electron: neben der ausfuehrbaren Datei, ausserhalb des asar-Archivs
    join(dirname(process.execPath), name),
    join(dirname(process.execPath), 'resources', name),
  ].filter((x): x is string => !!x);
  return kandidaten.find(existsSync) ?? null;
}

/**
 * Welche GPUs gibt es?
 *
 * Startet das Programm mit --probe und liest, was es meldet. Scheitert
 * irgendetwas, ist die Antwort "nicht verfuegbar" -- mit Grund, aber ohne
 * Ausnahme. Der Knoten soll hier nie haengen oder abstuerzen.
 */
export function erkenneGpu(programm?: string): Promise<GpuErkennung> {
  const pfad = findeProgramm(programm);
  if (!pfad) {
    return Promise.resolve({
      verfuegbar: false, programm: null, geraete: [],
      grund: 'GPU-Miner nicht installiert (yskar-cuda fehlt).',
    });
  }

  return new Promise(auf => {
    const geraete: GpuGeraet[] = [];
    let fehler: string | null = null;
    let erledigt = false;

    const fertig = (grund: string | null) => {
      if (erledigt) return;
      erledigt = true;
      auf({
        verfuegbar: geraete.length > 0 && grund === null,
        programm: pfad, geraete,
        grund: geraete.length > 0 ? grund : (grund ?? fehler ?? 'Keine CUDA-GPU gefunden.'),
      });
    };

    let kind: ChildProcess;
    try {
      kind = spawn(pfad, ['--probe'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      return fertig(`Programm nicht startbar: ${(e as Error).message}`);
    }

    const zeit = setTimeout(() => {
      try { kind.kill(); } catch { /* egal */ }
      fertig('Die Geraeteerkennung hat nicht geantwortet.');
    }, PROBE_TIMEOUT_MS);
    zeit.unref?.();

    createInterface({ input: kind.stdout! }).on('line', z => {
      try {
        const m = JSON.parse(z);
        if (m.t === 'device') geraete.push({
          id: Number(m.id), name: String(m.name), cc: String(m.cc),
          vram: Number(m.vram), sm: Number(m.sm ?? 0), emulation: !!m.emulation,
        });
        if (m.t === 'error') fehler = String(m.message);
      } catch { /* keine JSON-Zeile -- ignorieren */ }
    });

    kind.on('error', e => { clearTimeout(zeit); fertig(`Programm nicht startbar: ${e.message}`); });
    kind.on('exit', () => { clearTimeout(zeit); fertig(null); });
  });
}

export interface GpuSelbsttest {
  ok: boolean;
  /** Von der Karte gerechneter Genesis-Hash. */
  hash: string | null;
  pruefungen: { check: string; ok: boolean }[];
  grund: string | null;
}

/**
 * Rechnet die Karte bitgenau wie der Knoten?
 *
 * Laesst die GPU den Genesis-Hash rechnen und vergleicht ihn Bit fuer Bit.
 * Dazu: Erkennt der Kernel die Genesis-Nonce als Treffer, und die daneben
 * nicht? Faellt einer davon durch, darf mit dieser Karte nicht gemint
 * werden -- sonst meldete sie Treffer, die keine sind, und uebersaehe echte.
 */
export function pruefeGpu(programm: string, geraet: number): Promise<GpuSelbsttest> {
  return new Promise(auf => {
    const pruefungen: { check: string; ok: boolean }[] = [];
    let hash: string | null = null;
    let ergebnis: string | null = null;
    let fehler: string | null = null;
    let erledigt = false;

    const fertig = (grund: string | null) => {
      if (erledigt) return;
      erledigt = true;
      const ok = grund === null && ergebnis === 'PASSED'
        && pruefungen.length >= 3 && pruefungen.every(p => p.ok);
      auf({ ok, hash, pruefungen,
            grund: ok ? null : (grund ?? fehler ?? `Selbsttest: ${ergebnis ?? 'kein Ergebnis'}`) });
    };

    let kind: ChildProcess;
    try {
      kind = spawn(programm, ['--selftest', '--device', String(geraet)],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) { return fertig(`Programm nicht startbar: ${(e as Error).message}`); }

    const zeit = setTimeout(() => {
      try { kind.kill(); } catch { /* egal */ }
      fertig('Der GPU-Selbsttest hat nicht geantwortet.');
    }, PROBE_TIMEOUT_MS);
    zeit.unref?.();

    createInterface({ input: kind.stdout! }).on('line', z => {
      try {
        const m = JSON.parse(z);
        if (m.t === 'selftest' && typeof m.check === 'string') pruefungen.push({ check: m.check, ok: !!m.ok });
        if (m.t === 'selftest' && typeof m.hash === 'string') hash = m.hash;
        if (m.t === 'selftest' && typeof m.result === 'string') ergebnis = m.result;
        if (m.t === 'error') fehler = String(m.message);
      } catch { /* keine JSON-Zeile */ }
    });
    kind.on('error', e => { clearTimeout(zeit); fertig(`Programm nicht startbar: ${e.message}`); });
    kind.on('exit', () => { clearTimeout(zeit); fertig(null); });
  });
}

export class GpuMiner {
  private mining: MiningCoordinator;
  private programm: string | null;
  private onBlock?: GpuMinerOptionen['onBlock'];
  private onLog?: GpuMinerOptionen['onLog'];

  private kind: ChildProcess | null = null;
  private running = false;
  private bereit = false;
  private geraet: GpuGeraet | null = null;
  private adresse: Uint8Array | null = null;
  private extranonce = zufall();
  /** Inhalt des extra-Felds -- siehe LocalMiner. */
  private extra: Uint8Array = new Uint8Array(0);
  private job: MiningJob | null = null;
  private erneuern: NodeJS.Timeout | null = null;
  private rateTakt: NodeJS.Timeout | null = null;

  private hashes = 0;
  private fensterHashes = 0;
  private fensterMs = 0;
  private hashrate = 0;
  private shares = 0;
  private blocks = 0;
  private errors = 0;
  private lastError: string | null = null;
  private startedAt = 0;
  /** Bestandene Selbsttests je Geraet -- einmal je Sitzung genuegt. */
  private geprueft = new Set<number>();
  private selbsttest: GpuSelbsttest | null = null;

  constructor(o: GpuMinerOptionen) {
    this.mining = o.mining;
    this.programm = findeProgramm(o.programm);
    this.onBlock = o.onBlock;
    this.onLog = o.onLog;
  }

  private log(t: string) { this.onLog?.(t); }

  status(): GpuMinerStatus {
    return {
      running: this.running,
      device: this.geraet,
      hashrate: this.hashrate,
      hashes: this.hashes,
      shares: this.shares,
      blocks: this.blocks,
      errors: this.errors,
      height: this.job?.height ?? null,
      lastError: this.lastError,
      selftest: this.selbsttest,
      uptimeSeconds: this.running && this.startedAt
        ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    };
  }

  /**
   * Mining auf einer GPU starten.
   *
   * Scheitert der Start, wirft diese Methode -- aber der Knoten laeuft
   * weiter. Der Aufrufer zeigt den Grund an.
   */
  async start(adresse: Uint8Array, geraet: GpuGeraet): Promise<void> {
    if (this.running) return;
    if (!this.programm) throw new Error('GPU-Miner nicht installiert (yskar-cuda fehlt).');

    // Erst pruefen, dann minen. Einmal je Geraet und Sitzung.
    if (!this.geprueft.has(geraet.id)) {
      this.log(`GPU-Selbsttest auf ${geraet.name}…`);
      this.selbsttest = await pruefeGpu(this.programm, geraet.id);
      if (!this.selbsttest.ok) {
        this.lastError = this.selbsttest.grund;
        throw new Error(`GPU rechnet nicht korrekt -- Mining abgelehnt. ${this.selbsttest.grund ?? ''}`.trim());
      }
      this.geprueft.add(geraet.id);
      this.log('GPU-Selbsttest bestanden: Genesis-Hash bitgenau.');
    }

    this.adresse = adresse;
    this.geraet = geraet;
    this.extranonce = zufall();
    this.hashes = this.shares = this.blocks = this.errors = 0;
    this.hashrate = 0; this.lastError = null;
    this.running = true;
    this.bereit = false;
    this.startedAt = Date.now();

    const kind = spawn(this.programm, ['--device', String(geraet.id)], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    this.kind = kind;

    createInterface({ input: kind.stdout! }).on('line', z => this.aufZeile(z));
    createInterface({ input: kind.stderr! }).on('line', z => {
      if (z.trim()) this.log(`GPU: ${z.trim()}`);
    });

    kind.on('error', e => this.aufAbbruch(`Programm nicht startbar: ${e.message}`));
    kind.on('exit', (code, signal) => {
      // Ein gewolltes Ende ist kein Fehler.
      if (!this.running) return;
      this.aufAbbruch(`GPU-Miner beendet (Code ${code ?? '-'}${signal ? ', ' + signal : ''})`);
    });

    this.erneuern = setInterval(() => this.neuerJob(), GPU_JOB_REFRESH_MS);
    this.erneuern.unref?.();
    this.rateTakt = setInterval(() => this.rechneRate(), 1000);
    this.rateTakt.unref?.();

    this.log(`GPU-Mining gestartet · ${geraet.name}${geraet.emulation ? ' (Nachbildung)' : ''}`);
  }

  async stop(): Promise<void> {
    if (!this.running && !this.kind) return;
    this.running = false;
    this.bereit = false;
    if (this.erneuern) { clearInterval(this.erneuern); this.erneuern = null; }
    if (this.rateTakt) { clearInterval(this.rateTakt); this.rateTakt = null; }

    const kind = this.kind;
    this.kind = null;
    this.job = null;
    this.hashrate = 0;
    if (!kind) return;

    // Erst hoeflich, dann bestimmt. Ein haengender Treiber soll den Knoten
    // nicht festhalten.
    await new Promise<void>(auf => {
      const hart = setTimeout(() => { try { kind.kill('SIGKILL'); } catch { /* egal */ } auf(); }, 3000);
      hart.unref?.();
      kind.once('exit', () => { clearTimeout(hart); auf(); });
      try { kind.stdin?.write('{"t":"quit"}\n'); kind.stdin?.end(); }
      catch { clearTimeout(hart); try { kind.kill(); } catch { /* egal */ } auf(); }
    });
    this.log('GPU-Mining gestoppt.');
  }

  /** Name, mit dem dieser Knoten in seinen Bloecken steht. */
  setExtra(e: Uint8Array): void { this.extra = e; if (this.running) this.neuerJob(); }

  /** Neue Kette -- der alte Job ist wertlos. */
  notifyChainChanged(): void { if (this.running) this.neuerJob(); }

  // ------------------------------------------------------------- Innereien

  private aufZeile(z: string): void {
    let m: { t?: string; [k: string]: unknown };
    try { m = JSON.parse(z); } catch { return; }

    switch (m.t) {
      case 'ready':
        this.bereit = true;
        this.neuerJob();
        return;
      case 'progress': {
        const n = Number(m.hashes) || 0;
        const ms = Number(m.ms) || 0;
        this.hashes += n;
        this.fensterHashes += n;
        this.fensterMs += ms;
        return;
      }
      case 'found':
        this.shares++;
        this.einreichen(String(m.jobId), String(m.nonce));
        return;
      case 'error':
        this.errors++;
        this.lastError = String(m.message);
        this.log(`GPU-Fehler: ${this.lastError}`);
        return;
    }
  }

  private einreichen(jobId: string, nonce: string): void {
    if (!this.running) return;
    let n: bigint;
    try { n = BigInt(nonce); } catch { this.errors++; return; }

    const r = this.mining.submitNonce(jobId, n);
    if (!r.ok) {
      if (r.grund === 'stale_job' || r.grund === 'job_unknown' || r.grund === 'job_expired') {
        this.neuerJob();
      } else {
        this.log(`GPU-Treffer abgelehnt: ${r.grund}`);
      }
      return;
    }
    if (!r.block) return;

    this.blocks++;
    this.log(`BLOCK GEFUNDEN (GPU) #${r.height} · ${r.hash.slice(0, 32)}…`);
    this.onBlock?.(r.height, r.hash);
    this.neuerJob();
  }

  private neuerJob(): void {
    if (!this.running || !this.bereit || !this.adresse || !this.kind?.stdin) return;
    try {
      this.job = this.mining.createJob(this.adresse, this.extranonce, this.extra);
      this.kind.stdin.write(JSON.stringify({
        t: 'job', jobId: this.job.jobId, header: this.job.header, target: this.job.target,
      }) + '\n');
    } catch (e) {
      this.errors++;
      this.lastError = (e as Error).message;
      this.log(`GPU-Job konnte nicht gebaut werden: ${this.lastError}`);
    }
  }

  /**
   * Hashrate aus den Meldungen des Programms.
   *
   * Das Programm meldet gezaehlte Hashes UND die Zeitspanne dazu. Geteilt
   * wird durch diese Spanne, nicht durch die Wanduhr hier -- sonst fliesse
   * die Verzoegerung der Pipe in die Zahl ein.
   */
  private rechneRate(): void {
    if (this.fensterMs >= 1000) {
      this.hashrate = (this.fensterHashes * 1000) / this.fensterMs;
      this.fensterHashes = 0;
      this.fensterMs = 0;
    }
  }

  private aufAbbruch(grund: string): void {
    if (!this.running) return;
    this.errors++;
    this.lastError = grund;
    this.log(grund);
    // Kein automatischer Neustart: Ein Treiberfehler wiederholt sich sonst
    // in einer Schleife. Die GUI zeigt den Grund, und der Nutzer entscheidet.
    this.running = false;
    this.bereit = false;
    this.hashrate = 0;
    if (this.erneuern) { clearInterval(this.erneuern); this.erneuern = null; }
    if (this.rateTakt) { clearInterval(this.rateTakt); this.rateTakt = null; }
    this.kind = null;
  }
}

function zufall(): bigint {
  let n = 0n;
  for (const b of randomBytes(8)) n = (n << 8n) | BigInt(b);
  return n;
}
