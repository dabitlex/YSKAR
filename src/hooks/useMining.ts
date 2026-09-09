'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUCKET_MS, MAX_BARS, type BlockMark } from '@/lib/strip';

/**
 * Mining gegen die eigene Kette.
 *
 * Unterschied zur alten Fassung: Keine Anmeldung. Die Session traegt eine
 * Adresse, und die Coinbase des gefundenen Blocks geht dorthin. Wer die
 * zwoelf Woerter hat, hat das Guthaben -- der Server verwahrt nichts.
 *
 * Der Client sendet ausschliesslich eine Nonce. Alles, was gutgeschrieben
 * wird, entscheidet der Server anhand des Hashes, den er selbst nachrechnet.
 */

export interface Summary {
  token: { token_name: string; token_symbol: string; decimals: number } | null;
  height: number | null;
  nextHeight: number;
  difficulty: number | null;
  hashrate: number | null;
  tipHash: string | null;
  totalSupply: string | number;
  nextReward: string;
  mempool: number;
  activeMiners: number;
}

export interface Account {
  address: string;
  balance: string;
  nonce: string;
  blocksFound: number;
}

export interface Fund {
  height: number;
  reward: string;
  hash: string;
}

const HEX = (b: number[]) => b.map(x => x.toString(16).padStart(2, '0')).join('');

export function useMining(address: string | null, platform: string) {
  const workers = useRef<Worker[]>([]);
  const sessionId = useRef<string | null>(null);
  const jobId = useRef<string | null>(null);
  const shareDifficulty = useRef<number | null>(null);

  const bucketHashes = useRef(0);
  const bucketShares = useRef(0);
  const bucketBlock = useRef<BlockMark>(null);
  const lastHeight = useRef<number | null>(null);

  const [mining, setMining] = useState(false);
  const [duty, setDuty] = useState(50);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [lastShare, setLastShare] = useState<{ hash: string; difficulty: string; at: number } | null>(null);
  const [fund, setFund] = useState<Fund | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const [shareMarks, setShareMarks] = useState<number[]>([]);
  const [blockMarks, setBlockMarks] = useState<BlockMark[]>([]);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`/api/v2${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    return body;
  }, []);

  const fetchJob = useCallback(async () => {
    if (!sessionId.current) return null;
    const job = await api(`/job?session=${sessionId.current}`);
    jobId.current = job.jobId;
    shareDifficulty.current = Number(job.shareDifficulty);
    workers.current.forEach(w => w.postMessage({ t: 'job', job }));
    return job;
  }, [api]);

  const applyShareDifficulty = useCallback((d: number) => {
    if (d === shareDifficulty.current) return;
    shareDifficulty.current = d;
    const target = ((1n << 240n) / BigInt(d)).toString(16).padStart(64, '0');
    workers.current.forEach(w => w.postMessage({ t: 'target', target }));
  }, []);

  const stop = useCallback(async () => {
    workers.current.forEach(w => { w.postMessage({ t: 'stop' }); w.terminate(); });
    workers.current = [];
    setMining(false);
    if (sessionId.current) {
      const id = sessionId.current;
      sessionId.current = null;
      await api('/session/stop', { method: 'POST', body: JSON.stringify({ sessionId: id }) })
        .catch(() => {});
    }
  }, [api]);

  const start = useCallback(async (workerCount = 2) => {
    if (!address) return;
    setFehler(null);
    setSamples([]); setShareMarks([]); setBlockMarks([]);
    bucketHashes.current = 0; bucketShares.current = 0; bucketBlock.current = null;

    try {
      const session = await api('/session', {
        method: 'POST',
        body: JSON.stringify({ address, platform }),
      });
      sessionId.current = session.sessionId;

      const created = Array.from({ length: workerCount }, () =>
        new Worker(new URL('../workers/miner.worker.ts', import.meta.url)));
      workers.current = created;

      await Promise.all(created.map((w, i) => new Promise<void>(resolve => {
        w.onmessage = (e) => {
          if (e.data.t === 'ready') return resolve();
          if (e.data.t === 'progress') { bucketHashes.current += e.data.hashes; return; }
          if (e.data.t !== 'share') return;

          api('/share', {
            method: 'POST',
            body: JSON.stringify({
              sessionId: sessionId.current, jobId: e.data.jobId, nonce: e.data.nonce,
            }),
          }).then(r => {
            if (!r.accepted) {
              if (r.reason === 'job_expired' || r.reason === 'stale_job') { fetchJob(); return; }
              setFehler(`Share abgelehnt: ${r.reason}`);
              return;
            }
            setFehler(null);
            bucketShares.current += 1;
            setLastShare({ hash: e.data.hash, difficulty: r.credited, at: Date.now() });
            if (r.shareDifficulty) applyShareDifficulty(Number(r.shareDifficulty));

            if (r.block) {
              bucketBlock.current = 'own';
              setFund({ height: r.height, reward: r.reward, hash: r.hash });
              fetchJob();
            }
          }).catch(err => setFehler(String(err.message ?? err)));
        };
        w.postMessage({
          t: 'init', wasmUrl: '/miner.wasm',
          extranonce: session.extranonce, slot: i,
        });
      })));

      created.forEach(w => w.postMessage({ t: 'duty', value: duty }));
      await fetchJob();
      setMining(true);
    } catch (e) {
      setFehler(String((e as Error).message ?? e));
      await stop();
    }
  }, [address, api, duty, platform, fetchJob, applyShareDifficulty, stop]);

  // Streifen weiterschieben
  useEffect(() => {
    if (!mining) return;
    const id = setInterval(() => {
      const h = bucketHashes.current, s = bucketShares.current, b = bucketBlock.current;
      bucketHashes.current = 0; bucketShares.current = 0; bucketBlock.current = null;
      setSamples(p => [...p, h].slice(-MAX_BARS));
      setShareMarks(p => [...p, s].slice(-MAX_BARS));
      setBlockMarks(p => [...p, b].slice(-MAX_BARS));
    }, BUCKET_MS);
    return () => clearInterval(id);
  }, [mining]);

  // Job vor Ablauf der TTL erneuern
  useEffect(() => {
    if (!mining) return;
    const id = setInterval(() => { fetchJob().catch(() => {}); }, 45_000);
    return () => clearInterval(id);
  }, [mining, fetchJob]);

  // Kette und Konto abfragen
  useEffect(() => {
    const tick = async () => {
      try {
        const s: Summary = await api('/summary');
        setSummary(s);
        if (typeof s.height === 'number') {
          if (lastHeight.current !== null && s.height > lastHeight.current
              && bucketBlock.current !== 'own') {
            bucketBlock.current = 'other';
          }
          lastHeight.current = s.height;
        }
      } catch { /* Anzeige darf still bleiben, Mining laeuft weiter */ }
      if (address) {
        try { setAccount(await api(`/account/${address}`)); } catch { /* s.o. */ }
      }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [api, address]);

  // Sauber stoppen, wenn die App in den Hintergrund geht. Die Plattform
  // haelt den Worker ohnehin an -- ohne das bliebe die Session offen.
  useEffect(() => {
    const onHide = () => { if (document.hidden && mining) stop(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stop);
    };
  }, [mining, stop]);

  const changeDuty = useCallback((v: number) => {
    setDuty(v);
    workers.current.forEach(w => w.postMessage({ t: 'duty', value: v }));
  }, []);

  return {
    mining, start, stop, duty, setDuty: changeDuty,
    summary, account, lastShare, fund, fehler,
    samples, shareMarks, blockMarks,
    dismissFund: () => setFund(null),
  };
}
