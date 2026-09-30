'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SHARES, type ShareEntry } from '@/components/ShareChart';
import { MINER_WASM_URL } from '@/lib/minerWasm';
import { istNativ, fehlerMerken } from '@/lib/native/plattform';
import type { Woerterbuch } from '@/i18n';
import { vorgeladen } from '@/lib/vorladen';
import { widgetMelden } from '@/lib/native/widget';
import { protokoll } from '@/lib/miningProtokoll';
import { miningDienstStart, miningDienstStop, miningDienstText, miningDienstBeiStopp }
  from '@/lib/native/mining';

/** Was der Knoten ueber seinen Pool meldet -- gemessen, nicht behauptet. */
export interface PoolInfo {
  name: string;
  feeBps: number;
  miner: number;
  hashrate: number;
  eintraege: number;
}

/**
 * Eine Pool-Adresse in eine Basis-URL bringen.
 *
 * "pool.yskar.net" wird zu "https://pool.yskar.net". HTTPS ist nicht
 * Bequemlichkeit: Telegram laedt Mini Apps nur ueber TLS, und ein Aufruf
 * auf http scheitert im Browser ohnehin.
 *
 * Ein abschliessender Schraegstrich wird entfernt -- sonst entstuende
 * "https://pool.net//api/v2".
 */
/**
 * Wohin das Mining geht, wenn kein Pool gewaehlt ist.
 *
 * Leer = derselbe Server wie die App (heute Vercel/Supabase). Gesetzt =
 * ein Full Node. DAS ist der Schalter fuer die Umstellung: Variable
 * setzen, neu bauen -- und das Mining laeuft ueber den Knoten. Variable
 * loeschen, neu bauen -- und es ist zurueck.
 *
 * Nur MINING wechselt. Guthaben, Verlauf, Kennzahlen und der Explorer
 * kommen weiter vom eigenen Server. Ein Spiegel darf Jobs nicht ausgeben:
 * Ein Job lebt 90 Sekunden und muss auf dem AKTUELLEN Kopf stehen, ein
 * Spiegel ist definitionsgemaess hinterher.
 */
const MINING_BASIS = (process.env.NEXT_PUBLIC_MINING_BASE ?? '').trim();

function normalisiere(roh: string): string {
  const t = roh.trim().replace(/\/+$/, '');
  if (t === '') return '';
  if (/^https?:\/\//i.test(t)) return t;
  return 'https://' + t;
}

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
  /** Aus validierten Shares -- reagiert in Sekunden statt in Blöcken. */
  minerHashrate?: number | null;
  miningSessions?: number;
  tipHash: string | null;
  totalSupply: string | number;
  nextReward: string;
  mempool: number;
  activeMiners: number;
}

export interface Wartend {
  txid: string;
  kind: 'in' | 'out';
  from: string;
  to: string;
  amount: string;
  fee: string;
  nonce: string;
  memo?: string | null;
}

export interface Account {
  address: string;
  balance: string;
  nonce: string;
  /** Nonce fuer die naechste Zahlung -- Zustand plus eigene wartende. */
  nextNonce?: string;
  blocksFound: number;
  pending?: Wartend[];
}

export interface Fund {
  height: number;
  reward: string;
  hash: string;
}

const HEX = (b: number[]) => b.map(x => x.toString(16).padStart(2, '0')).join('');

export function useMining(address: string | null, platform: string, t: Woerterbuch) {
  const tRef = useRef(t); tRef.current = t;
  const workers = useRef<Worker[]>([]);
  const sessionId = useRef<string | null>(null);
  const jobId = useRef<string | null>(null);
  const shareDifficulty = useRef<number | null>(null);

  // Rate je Worker, berechnet beim Eintreffen der Meldung. Zwei unabhaengige
  // Takte gegeneinander laufen zu lassen war der Fehler: Fiel eine Meldung
  // nicht ins Abfragefenster, las ich null und die Anzeige brach ein.
  const rates = useRef<Map<number, { rate: number; at: number }>>(new Map());
  const lastProgress = useRef(0);
  const lastHeight = useRef<number | null>(null);

  const [mining, setMining] = useState(false);
  const [hashrate, setHashrate] = useState(0);
  // Verlauf der letzten 90 Sekunden -- fuer die Kurve auf Home und Mining.
  const [hashVerlauf, setHashVerlauf] = useState<number[]>([]);
  const [seit, setSeit] = useState<number | null>(null);
  const [stumm, setStumm] = useState(false);
  // Letzte Etappe je Worker. Nur zur Fehlersuche sichtbar, wenn nichts kommt.
  const [etappen, setEtappen] = useState<Record<number, string>>({});
  // Ein Eintrag je Versuch, nicht je Zeitfenster. Die erreichte Difficulty
  // ist die Aussage "wie nah war ich" -- sie kommt vom Server, weil nur er
  // den Hash nachgerechnet hat.
  const [shares, setShares] = useState<ShareEntry[]>([]);
  // Angenommene Shares seit dem Start -- das Diagramm behaelt nur die letzten 44.
  const sharesGesamt = useRef(0);
  const [duty, setDuty] = useState(50);
  // Mit den Werten aus dem Vorladen beginnen (Startbild), statt mit null:
  // Sonst zeigt der erste Bildschirm "0,0000", bis der erste Takt kommt.
  const [summary, setSummary] = useState<Summary | null>(() => vorgeladen().summary);
  const [account, setAccount] = useState<Account | null>(() => {
    const v = vorgeladen();
    return address && v.adresse === address ? v.account : null;
  });
  const [lastShare, setLastShare] = useState<{ hash: string; difficulty: string; at: number } | null>(null);
  const [fund, setFund] = useState<Fund | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  // Android-App: Zustand des Hintergrunddienstes, damit die Oberflaeche
  // sagen kann, ob das Mining bei gesperrtem Bildschirm weiterlaeuft.
  const [dienst, setDienst] = useState<null | { ok: true; notifications: boolean } | { ok: false; fehler: string }>(null);

  /*
    Wohin die Mining-Aufrufe gehen.

    Solo laeuft gegen den eigenen Server (leerer Praefix, gleiche Herkunft).
    Pool laeuft gegen den Knoten des Pools -- ein Pool ist ein Full Node,
    und nur er kann Jobs mit der Aufteilung bauen.

    Nur MINING wechselt die Adresse. Guthaben, Verlauf und Kennzahlen kommen
    weiter vom eigenen Server; sonst haetten wir zwei Quellen fuer dieselbe
    Kette.
  */
  const basis = useRef('');
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);

  /**
   * Mining-Aufrufe: Sitzung, Job, Share, Stop.
   *
   * Diese und NUR diese folgen basis.current -- beim Solo-Mining der eigene
   * Knoten, beim Pool-Mining die Adresse des Pools. Ein Job lebt 90
   * Sekunden und muss auf dem aktuellen Kopf stehen; ein Spiegel ist
   * definitionsgemaess hinterher und darf deshalb keine Jobs ausgeben.
   */
  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${basis.current}/api/v2${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Der Server schickt bei manchen Ablehnungen einen erklaerenden Text
      // mit. Den wegzuwerfen und nur den Code zu zeigen, hilft niemandem.
      throw new Error(body.detail ?? body.error ?? res.statusText);
    }
    return body;
  }, []);

  /**
   * Leseaufrufe: Kennzahlen und Konto.
   *
   * IMMER ueber den eigenen Server, egal ob gerade gemint wird.
   *
   * Vorher liefen auch diese ueber basis.current. Dadurch wechselte die
   * Quelle in dem Moment, in dem das Mining startete -- und mit ihr die
   * Zahlen: Der Spiegel zaehlt gefundene Bloecke per Datenbankabfrage
   * ueber die ganze Kette, der Knoten zaehlte sie nur innerhalb der letzten
   * 40 Verlaufseintraege. Aus 1158 wurden auf Knopfdruck 40, und beides war
   * dieselbe Wallet.
   *
   * Eine Angabe, zwei Quellen, zwei Zaehlweisen: Das darf nicht davon
   * abhaengen, ob gerade gemint wird.
   */
  const leseApi = useCallback(async (path: string) => {
    const res = await fetch(`/api/v2${path}`, {
      headers: { 'content-type': 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail ?? body.error ?? res.statusText);
    return body;
  }, []);

  // Wann der letzte Job kam, und ob gerade einer geholt wird. Die Erneuerung
  // haengt nicht mehr allein an setInterval: Im Hintergrund drosselt der
  // WebView Timer, die Meldungen der Worker kommen aber weiter -- an denen
  // haengt die Erneuerung jetzt zusaetzlich.
  const jobZeit = useRef(0);
  const jobHolt = useRef(false);
  // Womit die Sitzung eroeffnet wurde -- um sie nach einem Einfrieren
  // still neu zu eroeffnen, statt mit "session_inactive" haengenzubleiben.
  const sitzungDaten = useRef<{ address: string; platform: string; mode: 'solo' | 'pool' } | null>(null);

  const fetchJob = useCallback(async () => {
    if (!sessionId.current || jobHolt.current) return null;
    jobHolt.current = true;
    let job;
    try {
      job = await api(`/job?session=${sessionId.current}`);
      if (job?.error === 'session_inactive' && sitzungDaten.current) {
        // Der Knoten hat die Sitzung nach Inaktivitaet verworfen (die App
        // war eingefroren). Neue Sitzung, dann den Job noch einmal.
        protokoll('session verworfen -- neu eroeffnen');
        const s = await api('/session', { method: 'POST', body: JSON.stringify(sitzungDaten.current) });
        sessionId.current = s.sessionId;
        if (s.pool) setPoolInfo(s.pool);
        job = await api(`/job?session=${sessionId.current}`);
      }
      if (!job?.jobId) throw new Error(job?.error ?? 'kein Job');
    } catch (e) {
      protokoll(`job FEHLER ${String((e as Error)?.message ?? e)}`);
      throw e;
    } finally {
      jobHolt.current = false;
    }
    jobZeit.current = Date.now();
    jobId.current = job.jobId;
    shareDifficulty.current = Number(job.shareDifficulty);
    protokoll(`job ${String(job.jobId).slice(0, 8)} hoehe ${job.height ?? '?'} ziel ${job.shareDifficulty}${document.hidden ? ' (hintergrund)' : ''}`);
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
    if (workers.current.length) protokoll('stop');
    workers.current.forEach(w => { w.postMessage({ t: 'stop' }); w.terminate(); });
    workers.current = [];
    setMining(false);
    // Android-App: Vordergrunddienst und WakeLock freigeben.
    miningDienstStop();
    setDienst(null);
    if (sessionId.current) {
      const id = sessionId.current;
      sessionId.current = null;
      await api('/session/stop', { method: 'POST', body: JSON.stringify({ sessionId: id }) })
        .catch(() => {});
    }
  }, [api]);

  const start = useCallback(async (
    workerCount = 2,
    modus: 'solo' | 'pool' = 'solo',
    poolAdresse = '',
  ) => {
    if (!address) return;
    setFehler(null);
    setShares([]);
    sharesGesamt.current = 0;
    setPoolInfo(null);

    // Die Adresse fuer diesen Lauf festlegen, BEVOR der erste Aufruf geht.
    basis.current = modus === 'pool'
      ? normalisiere(poolAdresse)
      : normalisiere(MINING_BASIS);

    try {
      const session = await api('/session', {
        method: 'POST',
        body: JSON.stringify({ address, platform, mode: modus }),
      });
      sessionId.current = session.sessionId;
      sitzungDaten.current = { address, platform, mode: modus };
      protokoll(`session ${String(session.sessionId).slice(0, 8)} ${modus} ${workerCount} worker`);

      /*
        Der Knoten sagt, in welchem Modus die Sitzung laeuft. Wer Pool
        angefragt hat und Solo bekommt, wuerde sonst im Glauben minen,
        seine Arbeit werde geteilt.
      */
      if (modus === 'pool' && session.mode !== 'pool') {
        throw new Error(tRef.current.fehler.keinPool);
      }
      if (session.pool) setPoolInfo(session.pool);

      const created = Array.from({ length: workerCount }, () =>
        new Worker(new URL('../workers/miner.worker.ts', import.meta.url)));
      workers.current = created;

      await Promise.all(created.map((w, i) => new Promise<void>(resolve => {
        w.onmessage = (e) => {
          if (e.data.t === 'ready') return resolve();
          if (e.data.t === 'stage') {
            setEtappen(v => ({ ...v, [e.data.slot]:
              e.data.detail ? `${e.data.stage} (${e.data.detail})` : e.data.stage }));
            return;
          }
          if (e.data.t === 'error') {
            setFehler(`Miner (${e.data.where}): ${e.data.message}`);
            return;
          }
          if (e.data.t === 'progress') {
            const jetzt = Date.now();
            lastProgress.current = jetzt;
            // Job-Erneuerung an der Worker-Meldung, unabhaengig von Timern.
            if (jetzt - jobZeit.current > 40_000) fetchJob().catch(() => {});
            // Der Worker liefert Hashes UND das Zeitfenster mit -- daraus
            // ergibt sich die Rate ohne jede Annahme ueber den Takt.
            const spanne = Math.max(1, e.data.ms ?? 1000);
            rates.current.set(i, { rate: (e.data.hashes * 1000) / spanne, at: jetzt });
            return;
          }
          if (e.data.t !== 'share') return;

          api('/share', {
            method: 'POST',
            body: JSON.stringify({
              sessionId: sessionId.current, jobId: e.data.jobId, nonce: e.data.nonce,
            }),
          }).then(r => {
            protokoll(`share ${r.accepted ? 'ok' : 'abgelehnt ' + r.reason}${r.block ? ' BLOCK' : ''}${document.hidden ? ' (hintergrund)' : ''}`);
            // Auch abgelehnte Versuche gehoeren ins Bild: Sie zeigen, dass
            // gearbeitet wurde, und wo die Schwelle liegt.
            if (r.accepted) sharesGesamt.current += 1;
            if (r.achieved) {
              setShares(prev => [...prev, {
                achieved: Number(r.achieved),
                required: Number(r.required ?? 0),
                blockDifficulty: Number(r.blockDifficulty ?? 0),
                accepted: !!r.accepted,
                isBlock: !!r.block,
                at: Date.now(),
              }].slice(-MAX_SHARES));
            }

            if (!r.accepted) {
              if (r.reason === 'job_expired' || r.reason === 'stale_job') { fetchJob(); return; }
              setFehler(tRef.current.fehler.shareAbgelehnt(r.reason));
              return;
            }
            setFehler(null);
            setLastShare({ hash: e.data.hash, difficulty: r.credited, at: Date.now() });
            if (r.shareDifficulty) applyShareDifficulty(Number(r.shareDifficulty));

            if (r.block) {
              setFund({ height: r.height, reward: r.reward, hash: r.hash });
              fetchJob();
            }
          }).catch(err => { protokoll(`share FEHLER ${String(err.message ?? err)}`); setFehler(String(err.message ?? err)); });
        };
        // Ein Worker, der beim Laden scheitert, meldet sich sonst nie wieder.
        w.onerror = ev => {
          setFehler(`Miner konnte nicht starten: ${ev.message || 'unbekannt'}`);
          resolve();
        };
        w.postMessage({
          t: 'init', wasmUrl: MINER_WASM_URL,
          extranonce: session.extranonce, slot: i,
        });
      })));

      created.forEach(w => w.postMessage({ t: 'duty', value: duty }));
      await fetchJob();
      setMining(true);
      // Android-App: Dienst starten, damit es im Hintergrund weitergeht.
      miningDienstStart(tRef.current.mining.dienstText)
        .then(r => setDienst(r))
        .catch(e => { fehlerMerken('miningDienstStart', e); setDienst({ ok: false, fehler: String(e) }); });
    } catch (e) {
      setFehler(String((e as Error).message ?? e));
      await stop();
    }
  }, [address, api, duty, platform, fetchJob, applyShareDifficulty, stop]);

  /*
    Live-Anzeige und Wachhund in einem Takt.

    Die Hashrate wird geglaettet, damit die Zahl nicht zappelt -- aber sie
    kommt aus echtem Nonce-Fortschritt, nicht aus einer Animation.

    Der Wachhund ist die Lehre aus dem stillen Ausfall: Meldet der Worker
    zehn Sekunden lang keinen Fortschritt, obwohl Mining laeuft, stimmt
    etwas nicht -- und das gehoert auf den Schirm, nicht in ein Logfile.
  */
  useEffect(() => {
    if (!mining) { setHashrate(0); setStumm(false); rates.current.clear(); setHashVerlauf([]); setSeit(null); return; }
    lastProgress.current = Date.now();
    setSeit(Date.now());
    const id = setInterval(() => {
      const jetzt = Date.now();
      // Summe ueber alle Worker. Wer laenger als drei Sekunden nichts
      // gemeldet hat, zaehlt nicht mehr mit -- ein toter Worker soll die
      // Anzeige nicht kuenstlich hochhalten.
      let summe = 0;
      for (const [slot, r] of rates.current) {
        if (jetzt - r.at > 3000) rates.current.delete(slot);
        else summe += r.rate;
      }
      setHashrate(summe);
      setHashVerlauf(v => (v.length >= 90 ? v.slice(1) : v).concat(summe));
      setStumm(jetzt - lastProgress.current > 10_000);
    }, 1000);
    return () => clearInterval(id);
  }, [mining]);

  // Job vor Ablauf der TTL erneuern
  useEffect(() => {
    if (!mining) return;
    const id = setInterval(() => { fetchJob().catch(() => {}); }, 45_000);
    return () => clearInterval(id);
  }, [mining, fetchJob]);

  // Konto sofort neu lesen -- nach dem Senden soll die wartende Zahlung
  // im Verlauf stehen, ohne auf den naechsten Takt zu warten.
  const refreshAccount = useCallback(async () => {
    if (!address) return;
    try { setAccount(await leseApi(`/account/${address}`)); } catch { /* naechster Takt */ }
  }, [leseApi, address]);

  // Kette und Konto abfragen
  useEffect(() => {
    const tick = async () => {
      try {
        const s: Summary = await leseApi('/summary');
        setSummary(s);
        if (typeof s.height === 'number') lastHeight.current = s.height;
      } catch { /* Anzeige darf still bleiben, Mining laeuft weiter */ }
      if (address) {
        try { setAccount(await leseApi(`/account/${address}`)); } catch { /* s.o. */ }
      }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [leseApi, address]);

  // Android-Widget: Konto und Kette melden, sobald sie da sind.
  useEffect(() => {
    if (!istNativ() || !address || !account) return;
    widgetMelden({
      address, balance: account.balance, blocksFound: account.blocksFound,
      ...(summary?.height != null ? { height: summary.height } : {}),
      ...(summary?.difficulty != null ? { difficulty: summary.difficulty } : {}),
    });
  }, [address, account, summary]);

  // Sauber stoppen, wenn die App in den Hintergrund geht. Die Plattform
  // haelt den Worker ohnehin an -- ohne das bliebe die Session offen.
  useEffect(() => {
    // In der Android-App haelt der Vordergrunddienst den Prozess am Leben --
    // dort laeuft es im Hintergrund weiter. Im Browser und in Telegram haelt
    // die Plattform den Worker ohnehin an, also sauber stoppen.
    const nativ = istNativ();
    const onHide = () => {
      if (mining) protokoll(document.hidden ? 'app im hintergrund' : 'app wieder sichtbar');
      if (document.hidden && mining && !nativ) stop();
    };
    document.addEventListener('visibilitychange', onHide);
    if (!nativ) window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (!nativ) window.removeEventListener('pagehide', stop);
    };
  }, [mining, stop]);

  // Stopp aus der Android-Benachrichtigung.
  useEffect(() => {
    if (!istNativ()) return;
    let ab: (() => void) | null = null;
    miningDienstBeiStopp(() => { stop(); }).then(f => { ab = f; });
    return () => { ab?.(); };
  }, [stop]);

  /*
    Hashrate in der Benachrichtigung nachfuehren.

    Vorher hing der Effekt an `hashrate` -- die aendert sich jede Sekunde,
    der Effekt lief jedes Mal neu an, und der 5-Sekunden-Takt wurde jedes
    Mal zurueckgesetzt, bevor er je gefeuert hat. Die Meldung blieb bei
    "Mining laeuft". Jetzt: Werte in Refs, ein einziger Takt je Lauf, und
    die erste Meldung, sobald die erste Rate da ist.
  */
  const stand = useRef({ hashrate: 0, duty: 50, shares: 0, ziel: 0 });
  stand.current = { hashrate, duty, shares: sharesGesamt.current, ziel: shareDifficulty.current ?? 0 };
  useEffect(() => {
    if (!mining || !istNativ()) return;
    let zuletzt = 0;
    const melden = () => {
      const { hashrate: h, duty: d } = stand.current;
      const r = h >= 1e6 ? `${(h / 1e6).toFixed(2)} MH/s`
        : h >= 1e3 ? `${(h / 1e3).toFixed(1)} kH/s` : `${Math.round(h)} H/s`;
      miningDienstText(tRef.current.mining.dienstRate(`${r} · ${d} %`));
      widgetMelden({ mining: true, rate: r, shares: stand.current.shares, ziel: stand.current.ziel });
      zuletzt = Date.now();
    };
    const id = setInterval(melden, 4000);
    // Nicht vier Sekunden auf die erste Zahl warten.
    const erste = setInterval(() => {
      if (stand.current.hashrate > 0 && zuletzt === 0) melden();
    }, 500);
    return () => {
      clearInterval(id); clearInterval(erste);
      widgetMelden({ mining: false });
    };
  }, [mining]);

  const changeDuty = useCallback((v: number) => {
    setDuty(v);
    workers.current.forEach(w => w.postMessage({ t: 'duty', value: v }));
  }, []);

  return {
    mining, start, stop, duty, setDuty: changeDuty,
    hashrate, hashVerlauf, seit, stumm, etappen,
    sharesZahl: sharesGesamt.current, ziel: shareDifficulty.current ?? 0,
    summary, account, lastShare, fund, fehler, shares,
    poolInfo, refreshAccount, dienst,
    dismissFund: () => setFund(null),
  };
}
