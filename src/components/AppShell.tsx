'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { useMiningApp } from '@/hooks/useMiningApp';
import { usePoolAuswahl } from '@/hooks/usePoolAuswahl';
import { PoolBlatt } from '@/components/mining/PoolWahl';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAutoSperre } from '@/hooks/useAutoSperre';
import { BottomNav, type Tab } from '@/components/ui/Chrome';
import { Button, Hash } from '@/components/ui/Primitives';
import { Blatt } from '@/components/ui/Bausteine';
import HomeTab from '@/components/tabs/HomeTab';
import MiningTab from '@/components/tabs/MiningTab';
import WalletTab, { type HistoryEintrag } from '@/components/tabs/WalletTab';
import EntdeckenTab from '@/components/tabs/EntdeckenTab';
import CommunityTab from '@/components/tabs/CommunityTab';
import Artikel from '@/components/Artikel';
import UpdateBanner from '@/components/UpdateBanner';
import Sicherung, { SendenGesperrt } from '@/components/Sicherung';
import PoolAuszahlung from '@/components/PoolAuszahlung';
import { pushAuffrischen, pushBeiTipp } from '@/lib/native/push';
import { inhalte } from '@/content/entdecken';
import { useT } from '@/i18n';
import Send from '@/components/wallet/Send';
import Receive from '@/components/wallet/Receive';
import Benchmark from '@/components/Benchmark';
import { gespeichert, type BenchErgebnis } from '@/hooks/useBenchmark';
import Settings from '@/components/Settings';
import { einstiegAbholen } from '@/lib/einstieg';
import { useZurueckTaste, haptik, kampagneMerken } from '@/lib/telegram/webapp';

/**
 * Rahmen der App.
 *
 * Der Miner-Hook lebt HIER und nicht im Mining-Reiter. Sonst wuerde jeder
 * Tabwechsel den Hook neu aufbauen, die Worker beenden und die Session
 * schliessen -- man koennte waehrend des Minings nicht in die Wallet sehen.
 *
 * Ueberlagerungen (Senden, Empfangen, Einstellungen, Sicherung) ersetzen den
 * Inhalt, nicht den Rahmen. Beim Zurueckgehen soll der Reiter stehen, in dem
 * man war.
 *
 * Neu seit dem Einstieg vom Oktober 2026:
 *  - Direkt nach dem Einrichten startet das Mining im Pool von selbst.
 *  - Senden ist gesperrt, solange die zwoelf Woerter nicht gesichert sind.
 *  - Findet der Pool einen Block mit Anteil fuer diese Adresse, sagt die
 *    App es -- nicht nur, wenn das eigene Telefon den Block gefunden hat.
 */

type Ansicht = null | 'senden' | 'scannen' | 'empfangen' | 'einstellungen' | 'benchmark' | 'sichern'
  | { artikel: string };

export default function AppShell({ platform }: { platform: string }) {
  const wallet = useWallet();
  const { t, sprache, locale } = useT();
  const m = useMiningApp(wallet.address, platform, t);
  const wach = useWakeLock(m.mining);
  useAutoSperre(wallet.phase === 'offen', wallet.lock);

  // Einmal nach dem Einstieg: gleich in den Mining-Reiter und loslegen.
  const [autostart] = useState(einstiegAbholen);
  const [tab, setTab] = useState<Tab>(autostart ? 'mining' : 'home');
  const [ansicht, setAnsicht] = useState<Ansicht>(null);
  const [gesperrt, setGesperrt] = useState(false);

  useEffect(() => { kampagneMerken(); }, []);
  // Die Sicherung hat eigene Schritte und fuehrt die Zurueck-Taste selbst.
  useZurueckTaste(ansicht !== null && ansicht !== 'sichern', () => setAnsicht(null));

  const pool = usePoolAuswahl({
    address: wallet.address,
    // Die Liste wird auch auf Home gebraucht (Start-Knopf) und beim Autostart.
    sichtbar: (tab === 'mining' || tab === 'home') && ansicht === null,
    mining: m.mining, fehler: m.fehler, stop: m.stop,
  });
  const kerne = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || null) : null;
  const workerStufen = useMemo(() => {
    const n = Math.max(1, Math.min(16, kerne ?? 4));
    return [...new Set([1, 2, Math.max(2, Math.round(n / 2)), n])]
      .filter(x => x >= 1 && x <= n).sort((a, b) => a - b);
  }, [kerne]);

  const [bench, setBench] = useState<BenchErgebnis | null>(null);
  const [worker, setWorker] = useState(2);
  useEffect(() => {
    const g = gespeichert();
    if (!g) return;
    setBench(g);
    setWorker(g.besteWorker);
  }, []);

  // Android-App: Push-Anmeldung auffrischen; Tipp auf eine Meldung fuehrt
  // in die Wallet (Eingang) oder nach Entdecken (News).
  useEffect(() => {
    if (wallet.address) pushAuffrischen(wallet.address, sprache, t.app);
    let ab: (() => void) | null = null;
    pushBeiTipp(art => {
      setAnsicht(null);
      setTab(art === 'news' ? 'entdecken' : 'wallet');
      m.refreshAccount();
    }).then(f => { ab = f; });
    return () => { ab?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, sprache]);

  /*
    Starten -- ein Weg fuer den Knopf im Mining, den auf Home und den
    Autostart. Im Pool wird vorher am Pool selbst gefragt, ob noch Platz
    ist; ist er voll, geht die Liste auf, mit dem Hinweis oben.
  */
  const [vollHinweis, setVollHinweis] = useState<{ name: string; plaetze: number } | null>(null);
  const starten = useCallback(async () => {
    if (m.mining) return;
    if (pool.modus === 'solo') { m.start(worker, 'solo', ''); haptik('erfolg'); return; }
    const g = pool.gewaehlt;
    if (!g) { pool.setBlatt(true); return; }
    if (await pool.pruefen()) { m.start(worker, 'pool', g.host); haptik('erfolg'); return; }
    setVollHinweis({ name: g.name, plaetze: g.stand?.plaetze ?? 63 });
    pool.setBlatt(true);
  }, [m, pool, worker]);

  // Autostart: sobald ein Pool vorgeschlagen ist. Kommt in 8 Sekunden keiner
  // (Liste fehlt, alle voll), geht die Auswahl auf -- der Nutzer steht nie
  // vor einem stummen Bildschirm.
  const autoVersucht = useRef(false);
  const startenRef = useRef(starten); startenRef.current = starten;
  const blattRef = useRef(pool.setBlatt); blattRef.current = pool.setBlatt;
  const hatVorschlag = !!pool.gewaehlt;
  useEffect(() => {
    if (!autostart || autoVersucht.current || wallet.phase !== 'offen' || !pool.geladen) return;
    if (pool.modus === 'solo' || hatVorschlag) { autoVersucht.current = true; startenRef.current(); return; }
    const id = setTimeout(() => {
      if (autoVersucht.current) return;
      autoVersucht.current = true;
      blattRef.current(true);
    }, 8000);
    return () => clearTimeout(id);
  }, [autostart, wallet.phase, pool.geladen, pool.modus, hatVorschlag]);

  const startStopp = () => { if (m.mining) m.stop(); else starten(); };

  /** Senden nur mit gesicherten Woertern. */
  const senden = (art: 'senden' | 'scannen') => {
    if (wallet.gesichert) setAnsicht(art);
    else { haptik('warnung'); setGesperrt(true); }
  };

  // Pool-Anteil angekommen? Neuester Eintrag "pool" im Verlauf, den die App
  // noch nicht gemeldet hat.
  const auszahlung = useNeuerPoolAnteil((m.account as { history?: HistoryEintrag[] } | null)?.history);

  const dec = m.summary?.token?.decimals ?? 8;
  const sym = m.summary?.token?.token_symbol ?? 'YSR';
  const poolName = m.mining && pool.modus === 'pool'
    ? (pool.gewaehlt && !pool.gewaehlt.eigen ? pool.gewaehlt.name : m.poolInfo?.name ?? pool.gewaehlt?.name ?? null)
    : null;

  return (
    <>
      <main className="rand-oben relative mx-auto min-h-dvh max-w-md px-5 pb-36">
        {ansicht === null && <UpdateBanner />}
        {ansicht === 'einstellungen' ? (
          <Settings onZurueck={() => setAnsicht(null)} anteil={m.duty} workers={worker} summary={m.summary}
                    onSichern={wallet.gesichert ? undefined : () => setAnsicht('sichern')} />
        ) : ansicht === 'benchmark' ? (
          <Benchmark onZurueck={() => setAnsicht(null)}
                     onUebernehmen={(w) => { setWorker(w); setAnsicht(null); }}
                     onErgebnis={setBench} />
        ) : ansicht && typeof ansicht === 'object' ? (
          <Artikel artikel={inhalte(sprache, locale).ARTIKEL.find(a => a.slug === ansicht.artikel)
                            ?? inhalte(sprache, locale).ARTIKEL[0]}
                   onZurueck={() => setAnsicht(null)} />
        ) : tab === 'home' ? (
          <HomeTab account={m.account as never} summary={m.summary} mining={m.mining}
                   hashrate={m.hashrate} hashVerlauf={m.hashVerlauf} shares={m.sharesZahl}
                   decimals={dec} symbol={sym} poolName={poolName} gesichert={wallet.gesichert}
                   onStartStopp={startStopp}
                   onMining={() => setTab('mining')}
                   onSichern={() => setAnsicht('sichern')}
                   onEinstellungen={() => setAnsicht('einstellungen')} />
        ) : tab === 'mining' ? (
          <MiningTab m={m} dec={dec} sym={sym} wach={wach} pool={pool}
                     worker={worker} setWorker={setWorker} kerne={kerne} workerStufen={workerStufen}
                     bench={bench} onStarten={starten} onBenchmark={() => setAnsicht('benchmark')} />
        ) : tab === 'wallet' ? (
          <WalletTab account={m.account as never} decimals={dec} symbol={sym}
                     address={wallet.address}
                     onSenden={() => senden('senden')}
                     onScannen={() => senden('scannen')}
                     onEmpfangen={() => setAnsicht('empfangen')}
                     hoehe={m.summary?.height ?? null}
                     onEinstellungen={() => setAnsicht('einstellungen')}
                     onSichern={wallet.gesichert ? undefined : () => setAnsicht('sichern')} />
        ) : tab === 'entdecken' ? (
          <EntdeckenTab summary={m.summary} decimals={dec} symbol={sym} meineAdresse={wallet.address}
                        onEinstellungen={() => setAnsicht('einstellungen')} />
        ) : (
          <CommunityTab adresse={wallet.address} />
        )}
      </main>

      <div className="schleier-oben" aria-hidden="true" />
      <div className="schleier-unten" aria-hidden="true" />
      <BottomNav aktiv={tab} onWechsel={t => { setAnsicht(null); setTab(t); }} />

      {/* Senden und Empfangen sind Blaetter ueber dem Reiter. */}
      <Blatt offen={ansicht === 'senden' || ansicht === 'scannen'} onSchliessen={() => setAnsicht(null)} grund="ink">
        {(ansicht === 'senden' || ansicht === 'scannen') && (
          <Send account={m.account} decimals={dec} symbol={sym}
                scanSofort={ansicht === 'scannen'} onGesendet={m.refreshAccount}
                onFertig={() => { m.refreshAccount(); setAnsicht(null); }}
                onAbbruch={() => setAnsicht(null)} />
        )}
      </Blatt>
      <Blatt offen={ansicht === 'empfangen'} onSchliessen={() => setAnsicht(null)} grund="ink">
        {ansicht === 'empfangen' && wallet.address && (
          <Receive address={wallet.address} symbol={sym} decimals={dec} onZurueck={() => setAnsicht(null)} />
        )}
      </Blatt>
      <SendenGesperrt offen={gesperrt} onSchliessen={() => setGesperrt(false)}
                      onSichern={() => { setGesperrt(false); setAnsicht('sichern'); }} />
      <PoolBlatt pool={pool} offen={pool.blatt} voll={vollHinweis}
                 onSchliessen={() => { pool.setBlatt(false); setVollHinweis(null); }} />

      {ansicht === 'sichern' && <Sicherung onSchliessen={() => setAnsicht(null)} />}

      {auszahlung.eintrag && !m.fund && (
        <PoolAuszahlung hoehe={auszahlung.eintrag.height} betrag={Number(auszahlung.eintrag.amount) / 10 ** dec}
                        symbol={sym} onWeiter={auszahlung.gesehen} />
      )}

      {/*
        Blockfund. Das seltenste Ereignis der App -- im ganzen Netz alle zehn
        Minuten einmal, und meistens bei jemand anderem. Deshalb bekommt es
        als einziges eine Vollflaeche, ueber der Navigation.
      */}
      {m.fund && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink px-8 text-center">
          {/* pointer-events-none: Der Schein liegt ueber allem und schluckte sonst den Tipp auf den Knopf. */}
          <div className="glow-proof pointer-events-none absolute inset-0" />
          <p className="rise relative text-[13px] font-extrabold tracking-[0.14em] text-proof">{t.fund.titel}</p>
          <p className="zoom tnum relative mt-4 text-[64px] font-extrabold leading-none tracking-[-0.04em]">#{m.fund.height}</p>
          <p className="rise rise-2 relative mt-3 text-[22px] font-bold text-proof">
            +{(Number(m.fund.reward) / 10 ** dec).toFixed(0)} {sym}
          </p>
          <Hash value={m.fund.hash} className="rise rise-3 relative mb-10 mt-8 text-[11px] leading-[1.8] opacity-60" />
          <div className="relative z-10 w-full max-w-xs">
            <Button variant="quiet" onClick={m.dismissFund}>{t.fund.weiter}</Button>
          </div>
        </div>
      )}
    </>
  );
}

const GESEHEN = 'yskar.poolanteil.gesehen';

/**
 * Der neueste Pool-Anteil im Verlauf, falls die App ihn noch nicht gemeldet
 * hat. Beim allerersten Blick wird nur gemerkt, was schon da ist -- sonst
 * begruesste die App jeden mit einer Meldung ueber einen alten Block.
 */
function useNeuerPoolAnteil(history: HistoryEintrag[] | undefined) {
  const [eintrag, setEintrag] = useState<HistoryEintrag | null>(null);
  const neuester = history?.find(e => e.kind === 'pool') ?? null;
  const schluessel = neuester ? `${neuester.txid}:${neuester.height}` : null;

  const geladen = !!history;
  useEffect(() => {
    if (!geladen) return;
    let alt: string | null = null;
    try { alt = localStorage.getItem(GESEHEN); } catch { return; }
    // Erster Blick: festhalten, was schon da ist ("leer" bei einer neuen
    // Wallet) -- damit der ERSTE echte Anteil gemeldet wird, kein alter.
    if (alt === null) { try { localStorage.setItem(GESEHEN, schluessel ?? 'leer'); } catch { /* egal */ } return; }
    if (neuester && schluessel && alt !== schluessel) setEintrag(neuester);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geladen, schluessel]);

  const gesehen = () => {
    if (schluessel) { try { localStorage.setItem(GESEHEN, schluessel); } catch { /* egal */ } }
    setEintrag(null);
  };
  return { eintrag, gesehen };
}
