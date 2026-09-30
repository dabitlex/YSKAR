'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { useMining } from '@/hooks/useMining';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAutoSperre } from '@/hooks/useAutoSperre';
import { BottomNav, TopBar, type Tab } from '@/components/ui/Chrome';
import { Panel, GroupTitle, Button, Hash, Status, Notice, Row }
  from '@/components/ui/Primitives';
import ShareChart from '@/components/ShareChart';
import HomeTab from '@/components/tabs/HomeTab';
import WalletTab from '@/components/tabs/WalletTab';
import NetzTab from '@/components/tabs/NetzTab';
import EntdeckenTab from '@/components/tabs/EntdeckenTab';
import Artikel from '@/components/Artikel';
import UpdateBanner from '@/components/UpdateBanner';
import { pushAuffrischen, pushBeiTipp } from '@/lib/native/push';
import { inhalte } from '@/content/entdecken';
import { useT, type Woerterbuch } from '@/i18n';
import Send from '@/components/wallet/Send';
import Receive from '@/components/wallet/Receive';
import Benchmark from '@/components/Benchmark';
import { gespeichert, type BenchErgebnis } from '@/hooks/useBenchmark';
import Settings from '@/components/Settings';

/**
 * Rahmen der App.
 *
 * Der Miner-Hook lebt HIER und nicht im Mining-Reiter. Sonst wuerde jeder
 * Tabwechsel den Hook neu aufbauen, die Worker beenden und die Session
 * schliessen -- man koennte waehrend des Minings nicht in die Wallet sehen.
 *
 * Ueberlagerungen (Senden, Empfangen, Einstellungen) ersetzen den Inhalt,
 * nicht den Rahmen. Sie sind Zustaende der App, keine eigenen Seiten:
 * Beim Zurueckgehen soll der Reiter stehen, in dem man war.
 */

type Ansicht = null | 'senden' | 'scannen' | 'empfangen' | 'einstellungen' | 'benchmark'
  | { artikel: string };

export default function AppShell({ platform }: { platform: string }) {
  const wallet = useWallet();
  const { t, sprache, locale, zahl } = useT();
  const m = useMining(wallet.address, platform, t);
  // Ohne das schaltet das Display ab, die Plattform haelt den Worker an,
  // und das Mining endet mitten im Job -- ohne dass jemand etwas gedrueckt
  // haette.
  const wach = useWakeLock(m.mining);
  // Sperre nach Zeit im Hintergrund -- das Mining laeuft darunter weiter.
  useAutoSperre(wallet.phase === 'offen', wallet.lock);
  const [tab, setTab] = useState<Tab>('home');
  const [ansicht, setAnsicht] = useState<Ansicht>(null);

  /*
    Modus, Workerzahl und Kalibrierung.

    Bisher startete die App immer genau zwei Worker -- unabhaengig davon, wie
    viele Kerne das Geraet hat. Ein Telefon mit acht Kernen nutzte ein
    Viertel davon.
  */
  const [modus, setModus] = useState<'solo' | 'pool'>('solo');
  /*
    Adresse des Pool-Knotens.

    Bleibt in der App, nicht in der Kette: Ein Pool ist kein Eintrag
    irgendwo, sondern ein Knoten, den man erreichen kann.
  */
  const [poolAdresse, setPoolAdresse] = useState('');
  const kerne = typeof navigator !== 'undefined'
    ? (navigator.hardwareConcurrency || null) : null;
  const workerStufen = useMemo(() => {
    const n = Math.max(1, Math.min(16, kerne ?? 4));
    return [...new Set([1, 2, Math.max(2, Math.round(n / 2)), n])]
      .filter(x => x >= 1 && x <= n).sort((a, b) => a - b);
  }, [kerne]);

  const [bench, setBench] = useState<BenchErgebnis | null>(null);
  const [worker, setWorker] = useState(2);

  // Gespeicherte Kalibrierung uebernehmen -- erst im Browser, nicht beim
  // Rendern auf dem Server.
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

  const dec = m.summary?.token?.decimals ?? 8;
  const sym = m.summary?.token?.token_symbol ?? 'YSR';

  return (
    <>
      <main className="rand-oben mx-auto min-h-dvh max-w-md px-5 pb-32">
        {ansicht === null && <UpdateBanner />}
        {ansicht === 'senden' || ansicht === 'scannen' ? (
          <Send account={m.account} decimals={dec} symbol={sym}
                scanSofort={ansicht === 'scannen'} onGesendet={m.refreshAccount}
                onFertig={() => { m.refreshAccount(); setAnsicht(null); }}
                onAbbruch={() => setAnsicht(null)} />
        ) : ansicht === 'empfangen' && wallet.address ? (
          <Receive address={wallet.address} onZurueck={() => setAnsicht(null)} />
        ) : ansicht === 'einstellungen' ? (
          <Settings onZurueck={() => setAnsicht(null)} anteil={m.duty} workers={worker} />
        ) : ansicht === 'benchmark' ? (
          <Benchmark onZurueck={() => setAnsicht(null)}
                     onUebernehmen={(w) => { setWorker(w); setAnsicht(null); }}
                     onErgebnis={setBench} />
        ) : ansicht && typeof ansicht === 'object' ? (
          <Artikel artikel={inhalte(sprache, locale).ARTIKEL.find(a => a.slug === ansicht.artikel)
                            ?? inhalte(sprache, locale).ARTIKEL[0]}
                   onZurueck={() => setAnsicht(null)} />
        ) : tab === 'home' ? (
          <HomeTab account={m.account} summary={m.summary} mining={m.mining}
                   hashrate={m.hashrate} decimals={dec} symbol={sym}
                   onSenden={() => setAnsicht('senden')}
                   onEmpfangen={() => setAnsicht('empfangen')}
                   onMining={() => setTab('mining')}
                   onEntdecken={() => setTab('entdecken')}
                   onArtikel={slug => setAnsicht({ artikel: slug })} />
        ) : tab === 'mining' ? (
          <MiningTab m={m} dec={dec} sym={sym} wach={wach} t={t} zahl={zahl}
                     modus={modus} setModus={setModus}
                     poolAdresse={poolAdresse} setPoolAdresse={setPoolAdresse}
                     worker={worker} setWorker={setWorker}
                     kerne={kerne} workerStufen={workerStufen}
                     bench={bench} setAnsicht={setAnsicht} />
        ) : tab === 'wallet' ? (
          <WalletTab account={m.account as any} decimals={dec} symbol={sym}
                     address={wallet.address}
                     onSenden={() => setAnsicht('senden')}
                     onScannen={() => setAnsicht('scannen')}
                     onEmpfangen={() => setAnsicht('empfangen')}
                     onEinstellungen={() => setAnsicht('einstellungen')}
                     onExplorer={() => setTab('netz')} />
        ) : tab === 'netz' ? (
          <NetzTab summary={m.summary} meineAdresse={wallet.address}
                   decimals={dec} symbol={sym} />
        ) : (
          <EntdeckenTab summary={m.summary} decimals={dec} symbol={sym}
                        onEinstellungen={() => setAnsicht('einstellungen')} />
        )}
      </main>

      <BottomNav aktiv={tab} onWechsel={t => { setAnsicht(null); setTab(t); }} />

      {/*
        Blockfund. Das seltenste Ereignis der App -- im ganzen Netz alle zehn
        Minuten einmal, und meistens bei jemand anderem. Deshalb bekommt es
        als einziges eine Vollflaeche, ueber der Navigation.
      */}
      {m.fund && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center
                        bg-ink px-8 text-center">
          {/*
            pointer-events-none ist hier zwingend: Das Element liegt
            absolut ueber der ganzen Flaeche, und absolut positionierte
            Elemente werden ueber nicht positionierten gezeichnet. Ohne
            das schluckt der unsichtbare Schein jeden Tipp auf den Knopf
            darunter -- die Ueberlagerung liesse sich nicht schliessen.
          */}
          <div className="glow-proof pointer-events-none absolute inset-0" />
          <p className="rise relative text-[13px] font-extrabold tracking-[0.14em] text-proof">
            {t.fund.titel}
          </p>
          <p className="zoom tnum relative mt-4 text-[64px] font-extrabold leading-none
                        tracking-[-0.04em]">#{m.fund.height}</p>
          <p className="rise rise-2 relative mt-3 text-[22px] font-bold text-proof">
            +{(Number(m.fund.reward) / 10 ** dec).toFixed(0)} {sym}
          </p>
          <Hash value={m.fund.hash}
                className="rise rise-3 relative mb-10 mt-8 text-[11px] leading-[1.8] opacity-60" />
          <div className="relative z-10 w-full max-w-xs">
            <Button variant="quiet" onClick={m.dismissFund}>{t.fund.weiter}</Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Mining.
 *
 * Zwei Ebenen: Die Hashrate oben ist der Puls und bewegt sich jede Sekunde.
 * Der Hash darunter ist die Quittung und erscheint erst, wenn der Server
 * einen Share angenommen hat.
 */
function MiningTab({ m, dec, sym, wach, t, zahl, modus, setModus, poolAdresse, setPoolAdresse,
                     worker, setWorker,
                     kerne, workerStufen, bench, setAnsicht }: {
  m: ReturnType<typeof useMining>; dec: number; sym: string;
  t: Woerterbuch; zahl: (n: number) => string;
  wach: 'aus' | 'aktiv' | 'nicht_moeglich';
  modus: 'solo' | 'pool';
  setModus: (v: 'solo' | 'pool') => void;
  poolAdresse: string;
  setPoolAdresse: (v: string) => void;
  worker: number;
  setWorker: (v: number) => void;
  kerne: number | null;
  workerStufen: number[];
  bench: BenchErgebnis | null;
  setAnsicht: (v: 'benchmark') => void;
}) {
  const r = rate(m.hashrate);
  return (
    <>
      <TopBar titel={t.mining.titel} rechts={
        <Status tone={m.mining ? 'work' : 'off'}>
          {m.mining ? t.mining.rechnet : t.mining.gestoppt}
        </Status>
      } />

      {/* Hauptflaeche: die Leistung. Sie bewegt sich jede Sekunde und
          beantwortet die einzige Frage, die beim Mining zaehlt. */}
      <Panel tone="work" className="rise">
        <p className="label">{t.mining.leistung}</p>
        <div className="mt-1 flex items-baseline gap-2 leading-none">
          <span className={`tnum text-[44px] font-extrabold tracking-[-0.03em] ${
            m.mining ? 'text-work' : 'text-faint'}`}>{r.wert}</span>
          <span className="text-[16px] font-bold text-faint">{r.einheit}</span>
        </div>
        <p className="mt-2 text-[13px] font-semibold text-dim">
          {m.mining
            ? t.mining.stand(m.account?.blocksFound ?? 0, m.duty)
            : t.mining.steht}
        </p>

        <div className="mt-5">
          <ShareChart shares={m.shares} active={m.mining} />
        </div>
      </Panel>

      {m.lastShare && (
        <>
          <GroupTitle aside={t.mining.difficulty(zahl(Number(m.lastShare.difficulty)))}>
            {t.mining.letzterShare}</GroupTitle>
          <Panel className="rise rise-1">
            <Hash value={m.lastShare.hash} className="text-[12.5px] leading-[1.75]" />
          </Panel>
        </>
      )}

      <GroupTitle>{t.mining.kette}</GroupTitle>
      <Panel className="rise rise-2 !py-1">
        <dl>
          <Row label={t.mining.guthaben} tone={Number(m.account?.balance ?? 0) > 0 ? 'proof' : undefined}
               value={`${(Number(m.account?.balance ?? 0) / 10 ** dec).toFixed(4)} ${sym}`} />
          <Row label={t.mining.block} value={m.summary?.height != null ? `#${m.summary.height}` : '—'} />
          <Row label="Difficulty"
               value={m.summary?.difficulty != null ? zahl(m.summary.difficulty) : '—'} />
        </dl>
      </Panel>

      <GroupTitle>{t.mining.steuerung}</GroupTitle>
      <Panel className="rise rise-3">
        {/*
          Solo oder Pool.

          Pool ist noch nicht aktiv -- die Auszahlung braucht eine Coinbase
          mit mehreren Empfaengern, und die gilt erst ab Hoehe 2000. Der
          Knopf steht trotzdem schon da, damit klar ist, dass es kommt.
          Ihn ohne Kennzeichnung anzubieten waere ein Versprechen, das die
          Beim Minen gesperrt: Ein Wechsel mitten im Lauf liesse Arbeit im
          PPLNS-Fenster in der Schwebe. Wer wechseln will, stoppt zuerst.
        */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-dim">{t.mining.modus}</span>
          <div className="flex overflow-hidden rounded-full bg-raised p-0.5">
            <button onClick={() => setModus('solo')} aria-pressed={modus === 'solo'}
                    disabled={m.mining}
                    className={`min-w-[64px] rounded-full py-1.5 text-[12.5px] font-bold
                                transition-colors disabled:opacity-60 ${
                      modus === 'solo' ? 'bg-work text-white' : 'text-dim'}`}>
              {t.mining.solo}
            </button>
            <button onClick={() => setModus('pool')} aria-pressed={modus === 'pool'}
                    disabled={m.mining}
                    className={`min-w-[64px] rounded-full py-1.5 text-[12.5px] font-bold
                                transition-colors disabled:opacity-60 ${
                      modus === 'pool' ? 'bg-work text-white' : 'text-dim'}`}>
              {t.mining.pool}
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-dim">{t.mining.anteil}</span>
          <div className="flex overflow-hidden rounded-full bg-raised p-0.5">
            {[25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => m.setDuty(v)} aria-pressed={m.duty === v}
                      className={`min-w-[48px] rounded-full py-1.5 text-[12.5px] font-bold
                                  transition-colors ${
                        m.duty === v ? 'bg-work text-white' : 'text-dim'}`}>
                {v}%
              </button>
            ))}
          </div>
        </div>

        {/*
          Workerzahl.

          Bisher waren es immer zwei, unabhaengig vom Geraet -- ein Telefon
          mit acht Kernen nutzte ein Viertel davon. Das erklaert
          Leistungsunterschiede zwischen Geraeten besser als jede
          Hardwarebesonderheit.
        */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-dim">
            {t.mining.worker}
            {kerne ? <span className="ml-1.5 text-faint">{t.mining.von(kerne)}</span> : null}
          </span>
          <div className="flex overflow-hidden rounded-full bg-raised p-0.5">
            {workerStufen.map(v => (
              <button key={v} onClick={() => setWorker(v)} aria-pressed={worker === v}
                      disabled={m.mining}
                      className={`min-w-[40px] rounded-full py-1.5 text-[12.5px] font-bold
                                  transition-colors disabled:opacity-60 ${
                        worker === v ? 'bg-work text-white' : 'text-dim'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/*
          Pool-Adresse.

          Ein Pool ist ein Full Node -- nur er kann Jobs mit der Aufteilung
          bauen. Deshalb braucht es eine Adresse; der eigene Server betreibt
          keinen Pool.
        */}
        {modus === 'pool' && !m.mining && (
          <div className="mb-4">
            <label htmlFor="pooladr" className="text-[13.5px] font-semibold text-dim">{t.mining.poolAdresse}</label>
            <input id="pooladr" type="text" inputMode="url" spellCheck={false}
                   value={poolAdresse} onChange={e => setPoolAdresse(e.target.value)}
                   placeholder="pool.yskar.net"
                   className="sunk mt-2 w-full px-3 py-3 font-mono text-[13.5px]
                              text-text outline-none focus:border-work placeholder:text-faint" />
            <p className="mt-2 text-[12px] font-medium leading-relaxed text-faint">
              {t.mining.poolHinweis}
            </p>
          </div>
        )}

        {/* Was der Pool über sich meldet, sobald die Sitzung steht. */}
        {modus === 'pool' && m.poolInfo && (
          <div className="mb-4 rounded-[12px] bg-raised px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-proof" />
              <span className="text-[12.5px] text-proof">{m.poolInfo.name}</span>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              <div className="flex justify-between text-[12.5px]">
                <span className="text-dim">{t.mining.poolLeistung}</span>
                <span className="mono">{rate(m.poolInfo.hashrate).wert} {rate(m.poolInfo.hashrate).einheit}</span>
              </div>
              <div className="flex justify-between text-[12.5px]">
                <span className="text-dim">{t.mining.poolMiner}</span>
                <span className="mono">{m.poolInfo.miner}</span>
              </div>
              <div className="flex justify-between text-[12.5px]">
                <span className="text-dim">{t.mining.poolGebuehr}</span>
                <span className="mono">
                  {zahl(m.poolInfo.feeBps / 100)} %
                </span>
              </div>
            </div>
          </div>
        )}

        <Button onClick={() => (m.mining
                  ? m.stop()
                  : m.start(worker, modus, poolAdresse))}
                disabled={modus === 'pool' && !m.mining && poolAdresse.trim() === ''}
                variant={m.mining ? 'quiet' : 'primary'}>
          {m.mining ? t.mining.stoppen : t.mining.starten}
        </Button>

        {!m.mining && (
          <button onClick={() => setAnsicht('benchmark')}
                  className="mt-3 w-full text-center text-[13px] font-bold text-work">
            {bench ? t.mining.kalibrierung(bench.besteWorker) : t.mining.kalibrieren}
          </button>
        )}

        {m.mining && (
          <p className="mt-3 text-center text-[12px] font-semibold text-faint">
            {m.dienst?.ok
              ? (m.dienst.notifications ? t.mining.hintergrund : t.mining.hintergrundOhne)
              : m.dienst && !m.dienst.ok
              ? t.mining.dienstFehler(m.dienst.fehler)
              : wach === 'aktiv'
              ? t.mining.wach
              : wach === 'nicht_moeglich'
              ? t.mining.wachNicht
              : t.mining.wachAus}
          </p>
        )}

        {m.stumm && !m.fehler && (
          <div className="mt-4 space-y-2">
            <Notice tone="risk">{t.mining.stumm}</Notice>
            <div className="rounded-[12px] bg-raised px-4 py-3">
              {Object.entries(m.etappen).map(([slot, e]) => (
                <p key={slot} className="font-mono text-[11px] text-faint">
                  {t.mining.workerZeile(slot, e)}
                </p>
              ))}
              {Object.keys(m.etappen).length === 0 && (
                <p className="font-mono text-[11px] text-faint">{t.mining.keineMeldung}</p>
              )}
            </div>
          </div>
        )}
        {m.fehler && <div className="mt-4"><Notice tone="risk">{m.fehler}</Notice></div>}
      </Panel>
    </>
  );
}

function rate(h: number): { wert: string; einheit: string } {
  if (h >= 1e6) return { wert: (h / 1e6).toFixed(2), einheit: 'MH/s' };
  if (h >= 1e3) return { wert: (h / 1e3).toFixed(1), einheit: 'kH/s' };
  return { wert: String(Math.round(h)), einheit: 'H/s' };
}
