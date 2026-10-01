'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShareEntry } from '@/components/ShareChart';
import type { Woerterbuch } from '@/i18n';
import { useMining, type Fund, type PoolInfo } from '@/hooks/useMining';
import { protokoll } from '@/lib/miningProtokoll';
import { nativStart, nativDuty, nativStatus, nativStop, nativBeiStopp, type NativStatus }
  from '@/lib/native/nativMining';

/**
 * Mining fuer die Android-App ab APK 1.0.9: Der Dienst rechnet, nicht der
 * WebView (siehe lib/native/nativMining.ts, NativMiner.java).
 *
 * Dieselbe Rueckgabe wie useMining -- die Oberflaeche merkt keinen
 * Unterschied. Kennzahlen, Konto, Widget-Konto und refreshAccount kommen
 * unveraendert aus useMining; nur die Mining-Felder werden hier ersetzt.
 * useMining startet dabei selbst nie einen Worker (sein start() wird hier
 * nicht gerufen).
 *
 * Verwendet NUR, wenn nativMiningVerfuegbar() -- also nie in der Mini App.
 */

const MINING_BASIS = (process.env.NEXT_PUBLIC_MINING_BASE ?? '').trim();
const FUND_MERKER = 'yskar.nativ.fund';

/** Wie normalisiere() in useMining.ts. */
function normalisiere(roh: string): string {
  const t = roh.trim().replace(/\/+$/, '');
  if (t === '') return '';
  if (/^https?:\/\//i.test(t)) return t;
  return 'https://' + t;
}

export function useMiningNativ(address: string | null, platform: string, t: Woerterbuch): ReturnType<typeof useMining> {
  const tRef = useRef(t); tRef.current = t;
  const lesen = useMining(address, platform, t);

  const [mining, setMining] = useState(false);
  const [hashrate, setHashrate] = useState(0);
  const [hashVerlauf, setHashVerlauf] = useState<number[]>([]);
  const [seit, setSeit] = useState<number | null>(null);
  const [stumm, setStumm] = useState(false);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [sharesZahl, setSharesZahl] = useState(0);
  const [ziel, setZiel] = useState(0);
  const [lastShare, setLastShare] = useState<{ hash: string; difficulty: string; at: number } | null>(null);
  const [fund, setFund] = useState<Fund | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [dienst, setDienst] = useState<null | { ok: true; notifications: boolean } | { ok: false; fehler: string }>(null);
  const [duty, setDutyState] = useState(50);
  /*
    Zuletzt gezeigter Blockfund (Zeitpunkt). Gemerkt im Geraet, damit ein
    weggeklickter Fund nach dem Neuladen der App nicht wiederkommt -- ein
    Fund, der passiert ist, waehrend die App zu war, aber schon.
  */
  const gesehenerFund = useRef<number>((() => {
    try { return Number(localStorage.getItem(FUND_MERKER) ?? 0) || 0; } catch { return 0; }
  })());
  const laeuftRef = useRef(false);

  const fehlerText = useCallback((s: NativStatus): string | null => {
    if (!s.fehler && !s.fehlerArt) return null;
    switch (s.fehlerArt) {
      case 'kein_pool': return tRef.current.fehler.keinPool;
      case 'share': return tRef.current.fehler.shareAbgelehnt(s.fehler ?? '');
      case 'sitzung': return s.fehlerDetail ?? s.fehler ?? null;
      default: return s.fehler ?? null;
    }
  }, []);

  /** Zustand aus dem Dienst holen und in die Anzeige uebernehmen. */
  const abgleichen = useCallback(async () => {
    const s = await nativStatus();
    if (!s) return null;
    const laeuft = !!s.laeuft;
    laeuftRef.current = laeuft;
    setMining(laeuft);
    const h = laeuft ? Number(s.hashrate ?? 0) : 0;
    setHashrate(h);
    if (laeuft) setHashVerlauf(v => (v.length >= 90 ? v.slice(1) : v).concat(h));
    setSeit(laeuft && s.seit ? s.seit : null);
    setStumm(laeuft && !!s.letzteArbeit && Date.now() - s.letzteArbeit > 10_000);
    setSharesZahl(Number(s.angenommen ?? 0));
    setZiel(Number(s.ziel ?? 0));
    setShares((s.shares ?? []).map(x => ({
      achieved: Number(x.achieved), required: Number(x.required ?? 0),
      blockDifficulty: Number(x.blockDifficulty ?? 0),
      accepted: !!x.accepted, isBlock: !!x.isBlock, at: Number(x.at),
    })));
    setLastShare(s.letzterShare ?? null);
    setPoolInfo(s.pool ?? null);
    setFehler(fehlerText(s));
    if (s.duty) setDutyState(s.duty);
    if (s.fund && s.fund.at > gesehenerFund.current) {
      setFund({ height: Number(s.fund.height), reward: String(s.fund.reward), hash: s.fund.hash });
      gesehenerFund.current = s.fund.at;
      try { localStorage.setItem(FUND_MERKER, String(s.fund.at)); } catch { /* egal */ }
    }
    return s;
  }, [fehlerText]);

  // Beim Oeffnen: Laeuft der Dienst schon (WebView neu geladen, App wieder
  // geoeffnet), uebernimmt die Anzeige ihn einfach.
  useEffect(() => {
    abgleichen().then(s => {
      if (s?.laeuft) protokoll('nativ: laufendes mining uebernommen');
    });
  }, [abgleichen]);

  // Waehrend des Minings jede Sekunde abgleichen.
  useEffect(() => {
    if (!mining) return;
    const id = setInterval(() => { abgleichen().catch(() => {}); }, 1000);
    return () => clearInterval(id);
  }, [mining, abgleichen]);

  // Stopp aus der Benachrichtigung oder Selbstabbruch des Miners (mit Fehler).
  useEffect(() => {
    let ab: (() => void) | null = null;
    nativBeiStopp(() => { abgleichen().catch(() => {}); }).then(f => { ab = f; });
    return () => { ab?.(); };
  }, [abgleichen]);

  const start = useCallback(async (
    workerCount = 2,
    modus: 'solo' | 'pool' = 'solo',
    poolAdresse = '',
  ) => {
    if (!address) return;
    setFehler(null);
    setShares([]);
    setHashVerlauf([]);
    setPoolInfo(null);
    const basis = (modus === 'pool' ? normalisiere(poolAdresse) : normalisiere(MINING_BASIS))
      || window.location.origin;
    protokoll(`nativ start ${modus} ${workerCount} threads`);
    try {
      const r = await nativStart({
        basis, address, mode: modus, platform, threads: workerCount, duty,
        // Text der Benachrichtigung in der Sprache der App; {rate} fuellt der Dienst.
        vorlage: tRef.current.mining.dienstRate('{rate}'),
      });
      setDienst({ ok: true, notifications: !!r?.notifications });
      laeuftRef.current = true;
      setMining(true);
      setSeit(Date.now());
    } catch (e) {
      const text = String((e as Error)?.message ?? e);
      setDienst({ ok: false, fehler: text });
      setFehler(text);
    }
  }, [address, platform, duty]);

  const stop = useCallback(async () => {
    protokoll('nativ stop');
    await nativStop();
    laeuftRef.current = false;
    setMining(false);
    setHashrate(0);
    setSeit(null);
    setStumm(false);
    setDienst(null);
  }, []);

  const setDuty = useCallback((v: number) => {
    setDutyState(v);
    if (laeuftRef.current) nativDuty(v);
  }, []);

  return {
    ...lesen,
    mining, start, stop, duty, setDuty,
    hashrate, hashVerlauf, seit, stumm, etappen: {},
    sharesZahl, ziel,
    lastShare, fund, fehler, shares,
    poolInfo, dienst,
    dismissFund: () => setFund(null),
  };
}
