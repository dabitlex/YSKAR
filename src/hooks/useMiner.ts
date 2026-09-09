'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUCKET_MS, MAX_BARS, type BlockMark } from '@/lib/strip';

/**
 * Steuert Anmeldung, Worker, Job-Nachschub und Share-Einreichung.
 *
 * Die Anmeldung liegt bewusst HIER und nicht in der Komponente: Es darf nur
 * einen einzigen Fetch-Pfad geben, und der muss den 401-Fall behandeln. Zwei
 * Pfade, von denen einer den Ablauf nicht kennt, sind der Fehler, der in
 * VEXALGO wochenlang den Quest-Abschluss gekostet hat.
 *
 * Token-Lebenszyklus, zweistufig:
 *   1. Der Server haengt bei knapper Restlaufzeit einen frischen Token in den
 *      Header x-renewed-token. Solange die App offen ist und alle 5 Sekunden
 *      den Status abfragt, laeuft der Token damit nie ab.
 *   2. Kommt trotzdem ein 401 -- App war lange im Hintergrund --, meldet sich
 *      der Hook mit der initData neu an und wiederholt die Anfrage genau
 *      einmal.
 */

export interface MinerStatus {
  token: { name: string; symbol: string; decimals: number };
  height: number | null;
  difficulty: number | null;
  networkHashrate: number;
  lastBlockAt: string | null;
  session: {
    id: string; shareDifficulty: string; validShares: number;
    invalidShares: number; hashrate: number; roundSharePct: number;
  } | null;
  account: { balance: number; blocksFound: number; lifetimeWeight: number };
}

export function useMiner(initData: string | null, platform: string) {
  const jwt = useRef<string | null>(null);
  const workers = useRef<Worker[]>([]);
  const sessionId = useRef<string | null>(null);
  const jobId = useRef<string | null>(null);
  const shareDifficulty = useRef<number | null>(null);

  const bucketHashes = useRef(0);
  const bucketShares = useRef(0);
  const bucketBlock = useRef<BlockMark>(null);
  const lastHeight = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [canMine, setCanMine] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mining, setMining] = useState(false);
  const [duty, setDuty] = useState(50);
  const [status, setStatus] = useState<MinerStatus | null>(null);
  const [lastBlock, setLastBlock] = useState<{ height: number; reward: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const [shareMarks, setShareMarks] = useState<number[]>([]);
  const [blockMarks, setBlockMarks] = useState<BlockMark[]>([]);

  /** Anmeldung gegen Telegram. Liefert true, wenn danach ein Token vorliegt. */
  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!initData) {
      setAuthError('outside_telegram');
      setReady(false);
      return false;
    }
    try {
      const res = await fetch('/api/v1/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData, platform }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        jwt.current = null;
        setReady(false);
        setAuthError(body.error ?? String(res.status));
        return false;
      }
      jwt.current = body.token;
      setCanMine(!!body.canMine);
      setAuthError(null);
      setReady(true);
      return true;
    } catch (e) {
      setAuthError(String((e as Error).message ?? e));
      return false;
    }
  }, [initData, platform]);

  useEffect(() => { authenticate(); }, [authenticate]);

  /**
   * Einziger Fetch-Pfad. Uebernimmt erneuerte Token und meldet sich bei 401
   * genau einmal neu an, bevor er aufgibt.
   */
  const api = useCallback(async (
    path: string,
    init?: RequestInit,
    allowRetry = true,
  ): Promise<any> => {
    if (!jwt.current && !(await authenticate())) throw new Error('unauthenticated');

    const res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt.current}`,
        ...(init?.headers ?? {}),
      },
    });

    const renewed = res.headers.get('x-renewed-token');
    if (renewed) jwt.current = renewed;

    if (res.status === 401 && allowRetry) {
      jwt.current = null;
      if (await authenticate()) return api(path, init, false);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? res.statusText);
    }
    return res.json();
  }, [authenticate]);

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
    setSamples([]); setShareMarks([]); setBlockMarks([]);
    bucketHashes.current = 0; bucketShares.current = 0; bucketBlock.current = null;

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
          if (e.data.t === 'progress') { bucketHashes.current += e.data.hashes; return; }
          if (e.data.t === 'share') {
            api('/mining/share', {
              method: 'POST',
              body: JSON.stringify({
                sessionId: sessionId.current,
                jobId: e.data.jobId,
                nonce: e.data.nonce,
              }),
            }).then(r => {
              if (r.block) {
                setLastBlock({ height: r.height, reward: r.reward });
                bucketBlock.current = 'own';   // verdraengt einen fremden Fund
              }
              if (r.refetchJob) { fetchJob(); return; }

              if (r.accepted) {
                setError(null);
                bucketShares.current += 1;
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
  }, [api, duty, platform, fetchJob, applyShareDifficulty, stop]);

  // Fenster des Leistungsstreifens weiterschieben
  useEffect(() => {
    if (!mining) return;
    const id = setInterval(() => {
      const hashes = bucketHashes.current;
      const shares = bucketShares.current;
      const block = bucketBlock.current;
      bucketHashes.current = 0; bucketShares.current = 0; bucketBlock.current = null;
      setSamples(prev => [...prev, hashes].slice(-MAX_BARS));
      setShareMarks(prev => [...prev, shares].slice(-MAX_BARS));
      setBlockMarks(prev => [...prev, block].slice(-MAX_BARS));
    }, BUCKET_MS);
    return () => clearInterval(id);
  }, [mining]);

  // Job erneuern, bevor er nach 90 s ablaeuft
  useEffect(() => {
    if (!mining) return;
    const id = setInterval(() => { fetchJob().catch(() => {}); }, 45_000);
    return () => clearInterval(id);
  }, [mining, fetchJob]);

  // Status pollen. Haelt nebenbei den Token frisch, weil jede Antwort einen
  // erneuerten Token tragen kann.
  useEffect(() => {
    if (!ready) return;
    const tick = () => api('/mining/status').then(next => {
      setStatus(next);
      // Steigt die Hoehe, hat irgendwer im Netz einen Block gefunden. War es
      // der eigene, steht 'own' bereits im laufenden Fenster und bleibt.
      if (typeof next?.height === 'number') {
        if (lastHeight.current !== null && next.height > lastHeight.current
            && bucketBlock.current !== 'own') {
          bucketBlock.current = 'other';
        }
        lastHeight.current = next.height;
      }
    }).catch(err => {
      // Nicht mehr verschlucken: Wenn die Anmeldung endgueltig scheitert, muss
      // das sichtbar sein statt als "0 H/s" zu erscheinen.
      const msg = String(err.message ?? err);
      if (msg === 'unauthenticated' || msg === 'expired') setAuthError(msg);
    });
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [ready, api]);

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

  return {
    ready, canMine, authError,
    mining, start, stop, status, duty, setDuty: changeDuty,
    lastBlock, error, samples, shareMarks, blockMarks,
  };
}

/**
 * target = 2^240 / difficulty, als 32-Byte-Hex.
 * Muss mit targetFromDifficulty() in src/lib/chain/target.ts uebereinstimmen;
 * tests/chain.test.ts prueft beide gegeneinander.
 */
function targetHexFromDifficulty(difficulty: number): string {
  const target = (1n << 240n) / BigInt(difficulty);
  return target.toString(16).padStart(64, '0');
}
