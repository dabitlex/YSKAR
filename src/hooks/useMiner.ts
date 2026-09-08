'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Steuert Worker, Job-Nachschub und Share-Einreichung.
 *
 * Bewusst kein Hintergrund-Mining: Sobald die Mini App in den Hintergrund
 * geht oder das Display sperrt, haelt die Plattform den Worker ohnehin an
 * oder drosselt ihn hart. Statt das zu verschleiern, stoppen wir sauber und
 * lassen die Session serverseitig auslaufen.
 */

export interface MinerStatus {
  height: number | null;
  difficulty: number | null;
  networkHashrate: number;
  session: { hashrate: number; validShares: number; shareDifficulty: string;
             roundSharePct: number } | null;
  account: { balance: number; blocksFound: number };
  token: { name: string; symbol: string; decimals: number };
}

/**
 * target = 2^240 / difficulty, als 32-Byte-Hex.
 * Muss mit targetFromDifficulty() in src/lib/chain/target.ts uebereinstimmen.
 */
function targetHexFromDifficulty(difficulty: number): string {
  const target = (1n << 240n) / BigInt(difficulty);
  return target.toString(16).padStart(64, '0');
}

export function useMiner(token: string | null, platform: string) {
  const workers = useRef<Worker[]>([]);
  const sessionId = useRef<string | null>(null);
  const jobId = useRef<string | null>(null);
  const [mining, setMining] = useState(false);
  const [duty, setDuty] = useState(50);
  const [status, setStatus] = useState<MinerStatus | null>(null);
  const [lastBlock, setLastBlock] = useState<{ height: number; reward: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
    return res.json();
  }, [token]);

  const shareDifficulty = useRef<number | null>(null);

  const fetchJob = useCallback(async () => {
    const job = await api('/mining/job');
    jobId.current = job.jobId;
    shareDifficulty.current = job.shareDifficulty ?? null;
    // job.target ist das SHARE-Target, nicht das Block-Target. Der Server
    // erkennt einen Block selbst, wenn ein Share zufaellig gut genug ist.
    workers.current.forEach(w => w.postMessage({ t: 'job', job }));
    return job;
  }, [api]);

  /** Neues Share-Target an die Worker geben, ohne den Job neu zu laden. */
  const applyShareDifficulty = useCallback((difficulty: number) => {
    if (difficulty === shareDifficulty.current) return;
    shareDifficulty.current = difficulty;
    const target = targetHexFromDifficulty(difficulty);
    workers.current.forEach(w => w.postMessage({ t: 'target', target }));
  }, []);

  const stop = useCallback(async () => {
    workers.current.forEach(w => { w.postMessage({ t: 'stop' }); w.terminate(); });
    workers.current = [];
    setMining(false);
    if (sessionId.current) {
      await api('/mining/session/stop', { method: 'POST' }).catch(() => {});
      sessionId.current = null;
    }
  }, [api]);

  const start = useCallback(async (workerCount = 2) => {
    setError(null);
    try {
      const session = await api('/mining/session', {
        method: 'POST',
        body: JSON.stringify({ platform, dutyCycle: duty }),
      });
      sessionId.current = session.sessionId;

      const created = Array.from({ length: workerCount }, () =>
        new Worker(new URL('../workers/miner.worker.ts', import.meta.url)));
      workers.current = created;

      await Promise.all(created.map((w, i) => new Promise<void>(resolve => {
        w.onmessage = (e) => {
          if (e.data.t === 'ready') return resolve();
          if (e.data.t === 'share') {
            api('/mining/share', {
              method: 'POST',
              body: JSON.stringify({
                sessionId: sessionId.current,
                jobId: e.data.jobId,
                nonce: e.data.nonce,
              }),
            }).then(r => {
              if (r.block) setLastBlock({ height: r.height, reward: r.reward });
              if (r.refetchJob) { fetchJob(); return; }

              if (r.accepted) {
                setError(null);
                // VarDiff: Der Server kann das Share-Target nach jedem Share
                // anpassen. Ohne Nachfuehrung minte der Client weiter gegen
                // den alten Wert.
                if (r.share_difficulty) applyShareDifficulty(Number(r.share_difficulty));
              } else if (r.reason === 'job_expired' || r.reason === 'round_closed') {
                fetchJob();
              } else {
                // Waehrend M1 sichtbar machen statt verschlucken -- ein still
                // abgelehnter Share sieht von aussen aus wie "Mining laeuft
                // nicht", und genau daran haben wir schon einmal gesucht.
                setError(`Share abgelehnt: ${r.reason}`);
              }
            }).catch(err => setError(String(err.message ?? err)));
          }
        };
        // Jeder Worker bekommt einen eigenen Nonce-Bereich innerhalb derselben
        // Extranonce, damit sie sich nicht gegenseitig doppelt durchsuchen.
        // slot trennt die Nonce-Bereiche der Worker voneinander
        w.postMessage({
          t: 'init',
          wasmUrl: '/miner.wasm',
          extranonce: session.extranonce,
          slot: i,
        });
      })));

      created.forEach(w => w.postMessage({ t: 'duty', value: duty }));
      await fetchJob();
      setMining(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
      await stop();
    }
  }, [api, duty, platform, fetchJob, stop]);

  // Job erneuern, bevor er ablaeuft
  useEffect(() => {
    if (!mining) return;
    const id = setInterval(() => { fetchJob().catch(() => {}); }, 45_000);
    return () => clearInterval(id);
  }, [mining, fetchJob]);

  // Status pollen
  useEffect(() => {
    if (!token) return;
    const tick = () => api('/mining/status').then(setStatus).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [token, api]);

  // Sauber stoppen, wenn die App in den Hintergrund geht
  useEffect(() => {
    const onHide = () => { if (document.hidden && mining) stop(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stop);
    };
  }, [mining, stop]);

  const changeDuty = useCallback((value: number) => {
    setDuty(value);
    workers.current.forEach(w => w.postMessage({ t: 'duty', value }));
  }, []);

  return { mining, start, stop, status, duty, setDuty: changeDuty, lastBlock, error };
}
