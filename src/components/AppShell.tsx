'use client';

import { useState, useEffect, useMemo } from 'react';
import { hashrateTeile } from '@/lib/format/hashrate';
import { useWallet } from '@/lib/wallet/useWallet';
import { useMining } from '@/hooks/useMining';
import { useMiningApp } from '@/hooks/useMiningApp';
import { usePoolAuswahl, type PoolAuswahl } from '@/hooks/usePoolAuswahl';
import { PoolFeld, PoolBlatt } from '@/components/mining/PoolWahl';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAutoSperre } from '@/hooks/useAutoSperre';
import { BottomNav, TopBar, type Tab } from '@/components/ui/Chrome';
import { Panel, GroupTitle, Button, Hash, Status, Notice, Row }
  from '@/components/ui/Primitives';
import { Zahl, Etikett, Karte, Pille, Kurve, Ring, Blatt } from '@/components/ui/Bausteine';
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
  const m = useMiningApp(wallet.address, platform, t);
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
  /*
    Solo oder Pool, und welcher Pool.

    Der Pool wird aus einer Liste gewaehlt (usePoolAuswahl); Modus und Wahl
    bleiben im Geraet gemerkt. An das Mining geht davon wie bisher nur die
    Adresse des Pool-Knotens.
  */
  const pool = usePoolAuswahl({
    address: wallet.address, sichtbar: tab === 'mining' && ansicht === null,
    mining: m.mining, fehler: m.fehler, stop: m.stop,
  });
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
      <main className="rand-oben relative mx-auto min-h-dvh max-w-md px-5 pb-36">
        {ansicht === null && <UpdateBanner />}
        {ansicht === 'einstellungen' ? (
          <Settings onZurueck={() => setAnsicht(null)} anteil={m.duty} workers={worker} summary={m.summary} />
        ) : ansicht === 'benchmark' ? (
          <Benchmark onZurueck={() => setAnsicht(null)}
                     onUebernehmen={(w) => { setWorker(w); setAnsicht(null); }}
                     onErgebnis={setBench} />
        ) : ansicht && typeof ansicht === 'object' ? (
          <Artikel artikel={inhalte(sprache, locale).ARTIKEL.find(a => a.slug === ansicht.artikel)
                            ?? inhalte(sprache, locale).ARTIKEL[0]}
                   onZurueck={() => setAnsicht(null)} />
        ) : tab === 'home' ? (
          <HomeTab account={m.account as any} summary={m.summary} mining={m.mining}
                   hashrate={m.hashrate} hashVerlauf={m.hashVerlauf} worker={worker}
                   shares={m.sharesZahl} ziel={m.ziel} decimals={dec} symbol={sym}
                   onSenden={() => setAnsicht('senden')}
                   onEmpfangen={() => setAnsicht('empfangen')}
                   onScannen={() => setAnsicht('scannen')}
                   onExplorer={() => setTab('netz')}
                   onMining={() => setTab('mining')}
                   onEntdecken={() => setTab('entdecken')}
                   onArtikel={slug => setAnsicht({ artikel: slug })}
                   onEinstellungen={() => setAnsicht('einstellungen')} />
        ) : tab === 'mining' ? (
          <MiningTab m={m} dec={dec} sym={sym} wach={wach} t={t} zahl={zahl} locale={locale}
                     pool={pool}
                     worker={worker} setWorker={setWorker}
                     kerne={kerne} workerStufen={workerStufen}
                     bench={bench} setAnsicht={setAnsicht} />
        ) : tab === 'wallet' ? (
          <WalletTab account={m.account as any} decimals={dec} symbol={sym}
                     address={wallet.address}
                     onSenden={() => setAnsicht('senden')}
                     onScannen={() => setAnsicht('scannen')}
                     onEmpfangen={() => setAnsicht('empfangen')}
                     hoehe={m.summary?.height ?? null}
                     onEinstellungen={() => setAnsicht('einstellungen')} />
        ) : tab === 'netz' ? (
          <NetzTab summary={m.summary} meineAdresse={wallet.address}
                   decimals={dec} symbol={sym} />
        ) : (
          <EntdeckenTab summary={m.summary} decimals={dec} symbol={sym}
                        onEinstellungen={() => setAnsicht('einstellungen')} />
        )}
      </main>

      <div className="schleier-oben" aria-hidden="true" />
      <div className="schleier-unten" aria-hidden="true" />
      <BottomNav aktiv={tab} onWechsel={t => { setAnsicht(null); setTab(t); }} />

      {/* Senden und Empfangen sind Blaetter ueber dem Reiter -- der Rahmen
          bleibt stehen, man kommt genau dorthin zurueck, wo man war. */}
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
function MiningTab({ m, dec, sym, wach, t, zahl, locale, pool,
                     worker, setWorker,
                     kerne, workerStufen, bench, setAnsicht }: {
  m: ReturnType<typeof useMining>; dec: number; sym: string;
  t: Woerterbuch; zahl: (n: number) => string; locale: string;
  wach: 'aus' | 'aktiv' | 'nicht_moeglich';
  pool: PoolAuswahl;
  worker: number;
  setWorker: (v: number) => void;
  kerne: number | null;
  workerStufen: number[];
  bench: BenchErgebnis | null;
  setAnsicht: (v: 'benchmark') => void;
}) {
  const r = rate(m.hashrate);
  const minuten = m.seit ? Math.max(0, Math.round((Date.now() - m.seit) / 60000)) : 0;
  // Fortschritt zum Ziel: bester Share der Sitzung gegen die Block-Difficulty.
  const bester = m.shares.reduce((b, s) => Math.max(b, s.achieved), 0);
  const blockDiff = m.summary?.difficulty ?? 0;
  const anteil = blockDiff > 0 ? Math.min(1, bester / blockDiff) : 0;
  const schnitt = m.hashVerlauf.length ? m.hashVerlauf.reduce((a, b) => a + b, 0) / m.hashVerlauf.length : 0;
  const aktiv = [...m.shares].slice(-4).reverse();
  const { modus, setModus } = pool;
  // Der gewaehlte Pool mit seinem laufenden Stand -- fuer die Anzeige beim Minen.
  const ps = pool.gewaehlt?.stand ?? null;
  // Ein voller Pool lehnt mit dem Kuerzel "pool_full" ab (Web: Text des
  // Knotens, Android: Fehler des Dienstes). Gezeigt wird die eigene Sprache.
  // Steht der Hinweis schon am Pool-Feld, waere derselbe Satz hier unten
  // doppelt. Meldet der Pool seit der Ablehnung wieder freie Plaetze, ist er
  // ueberholt.
  const vollGezeigt = pool.hinweis === 'voll' || (!!ps && ps.status === 'voll' && !ps.dabei);
  // Im Solo-Modus hat eine Ablehnung des Pools von vorhin nichts verloren.
  const erledigt = modus === 'solo' || vollGezeigt
    || (pool.ueberholt === m.fehler && ps?.status === 'offen');
  const fehler = m.fehler && /pool_full/.test(m.fehler)
    ? (!m.mining && erledigt ? null : t.pool.vollText)
    // Hat die App angehalten, weil die Sitzung weg und der Pool voll ist,
    // erklaert der Hinweis am Pool-Feld, was los ist. "Share abgelehnt:
    // session_inactive" sagt nach dem Anhalten nichts mehr -- die Sitzung,
    // um die es ging, gibt es nicht mehr.
    : m.fehler && !m.mining && modus === 'pool' && /session_inactive/.test(m.fehler) ? null
    : m.fehler;
  return (
    <>
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />
      <header className="relative mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">{t.mining.titel}</h1>
        <Pille tone={m.mining ? 'work' : 'off'} puls={m.mining}>
          {m.mining ? t.mining.seit(minuten) : t.mining.gestoppt}
        </Pille>
      </header>

      {/* Die Zahl steht auf dem Grund; der Ring daneben zeigt, wie nah der
          beste Share dieser Sitzung an der Block-Difficulty war. */}
      <section className="relative rise flex items-center justify-between gap-3 px-0.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Etikett>{t.mining.leistung}</Etikett>
          <Zahl ganz={m.mining ? r.wert : '0'} einheit={m.mining ? r.einheit : 'H/s'} size={54} />
          <span className="text-[13px] font-bold text-dim">
            {m.mining
              ? <>{t.mining.shares(m.sharesZahl)} · {t.mining.bloecke(m.account?.blocksFound ?? 0)}</>
              : t.mining.steht}
          </span>
        </div>
        <Ring anteil={anteil} oben={`${Math.round(anteil * 100)} %`} unten={t.mining.zumZiel} />
      </section>

      <Karte className="rise rise-1 mt-5 p-4 pb-3">
        <div className="flex items-center justify-between">
          <Etikett>{t.mining.letzte}</Etikett>
          <span className="text-[11.5px] font-bold text-faint">{t.mining.schnitt(`${rate(schnitt).wert} ${rate(schnitt).einheit}`)}</span>
        </div>
        <div className="mt-2"><Kurve werte={m.hashVerlauf} hoehe={72} /></div>
      </Karte>

      <Karte className="rise rise-2 mt-3 p-4">
        <ShareChart shares={m.shares} active={m.mining} />
      </Karte>

      {m.lastShare && (
        <>
          <GroupTitle aside={t.mining.difficulty(zahl(Number(m.lastShare.difficulty)))}>
            {t.mining.letzterShare}</GroupTitle>
          <Panel className="rise rise-1">
            <Hash value={m.lastShare.hash} className="text-[12.5px] leading-[1.75]" />
          </Panel>
        </>
      )}

      <GroupTitle>{t.mining.aktivitaet}</GroupTitle>
      <Panel className="rise rise-2 !py-1">
        {aktiv.length === 0 ? (
          <p className="py-3 text-[13px] font-semibold text-dim">{t.mining.nochKeine}</p>
        ) : aktiv.map((sh, i) => (
          <div key={sh.at + '-' + i} className="flex items-center gap-3 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
            <span className={`h-2 w-2 shrink-0 rounded-full ${sh.isBlock ? 'bg-proof' : sh.accepted ? 'bg-work' : 'bg-risk'}`} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13.5px] font-bold">{sh.isBlock ? t.fund.titel : t.mining.shareAngenommen}</span>
              <span className="text-[11.5px] font-semibold text-faint">
                {t.mining.difficulty(zahl(Math.round(sh.achieved)))}{sh.achieved >= sh.required ? ` · ${t.mining.ueberZiel}` : ''}
              </span>
            </span>
            <span className="tnum font-mono text-[12px] text-dim">
              {new Date(sh.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
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
          Gesperrt auch in den Sekunden zwischen "Starten" und dem Start
          (pool.prueft): Sonst liesse sich der Modus noch umlegen, waehrend das
          Pool-Mining schon unterwegs ist.
        */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-dim">{t.mining.modus}</span>
          <div className="flex overflow-hidden rounded-full bg-raised p-0.5">
            <button onClick={() => setModus('solo')} aria-pressed={modus === 'solo'}
                    disabled={m.mining || pool.prueft}
                    className={`min-w-[64px] rounded-full py-1.5 text-[12.5px] font-bold
                                transition-colors disabled:opacity-60 ${
                      modus === 'solo' ? 'bg-work text-white' : 'text-dim'}`}>
              {t.mining.solo}
            </button>
            <button onClick={() => setModus('pool')} aria-pressed={modus === 'pool'}
                    disabled={m.mining || pool.prueft}
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
          Der Pool.

          Ein Pool ist ein Full Node -- nur er kann Jobs mit der Aufteilung
          bauen; der eigene Server betreibt keinen. Gewaehlt wird er aus einer
          Liste, nicht mehr per abgetippter Adresse. Ein Tipp auf das Feld
          oeffnet sie.
        */}
        {modus === 'pool' && !m.mining && (
          <PoolFeld pool={pool} onOeffnen={() => pool.setBlatt(true)} />
        )}

        {/*
          Was der Pool über sich meldet, sobald die Sitzung steht.

          Die Sitzung liefert den Stand vom Moment der Anmeldung. Wo die Liste
          einen laufenden Stand hat, gilt der -- samt Plaetzen und gefundenen
          Bloecken, die die Sitzung nicht kennt.

          Nur waehrend des Minings: Steht es, zeigt das Pool-Feld darueber
          denselben Pool -- und zwar mit dem Stand von jetzt.
        */}
        {modus === 'pool' && m.mining && m.poolInfo && (() => {
          const info = m.poolInfo;
          const live = ps && ps.belegt !== null && ps.plaetze !== null ? ps : null;
          const leistung = rate(live?.hashrate ?? info.hashrate);
          return (
            <div className="mb-4 rounded-[12px] bg-raised px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-proof" />
                <span className="text-[12.5px] text-proof">
                  {pool.gewaehlt && !pool.gewaehlt.eigen ? pool.gewaehlt.name : info.name}
                </span>
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-dim">{t.mining.poolLeistung}</span>
                  <span className="mono">{leistung.wert} {leistung.einheit}</span>
                </div>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-dim">{t.mining.poolMiner}</span>
                  <span className="mono">
                    {live ? `${live.belegt} / ${live.plaetze}` : info.miner}
                  </span>
                </div>
                {ps && ps.bloecke !== null && (
                  <div className="flex justify-between text-[12.5px]">
                    <span className="text-dim">{t.pool.gefunden}</span>
                    <span className="mono">{zahl(ps.bloecke)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-dim">{t.mining.poolGebuehr}</span>
                  <span className="mono">
                    {zahl((live?.feeBps ?? info.feeBps) / 100)} %
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/*
          Starten.

          Im Pool wird unmittelbar vorher am Pool selbst nachgefragt, ob noch
          Platz ist (pool.pruefen). Antwortet er nicht oder kennt die Frage
          nicht, startet es wie bisher -- und der Pool entscheidet beim
          Anmelden.
        */}
        <Button onClick={async () => {
                  if (m.mining) { m.stop(); return; }
                  if (modus === 'solo') { m.start(worker, 'solo', ''); return; }
                  const ziel = pool.gewaehlt?.host;
                  if (ziel && await pool.pruefen()) m.start(worker, 'pool', ziel);
                }}
                disabled={!m.mining && modus === 'pool'
                          && (!pool.gewaehlt || pool.gesperrt || pool.prueft)}
                variant={m.mining ? 'quiet' : 'primary'}>
          {m.mining ? t.mining.stoppen : t.mining.starten}
        </Button>
        <PoolBlatt pool={pool} offen={pool.blatt} onSchliessen={() => pool.setBlatt(false)} />

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
        {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}
      </Panel>
    </>
  );
}

const rate = hashrateTeile;
