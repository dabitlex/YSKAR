'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { useMining } from '@/hooks/useMining';
import { useWakeLock } from '@/hooks/useWakeLock';
import { BottomNav, TopBar, type Tab } from '@/components/ui/Chrome';
import { Panel, GroupTitle, Button, Hash, Status, Notice, Row }
  from '@/components/ui/Primitives';
import ShareChart from '@/components/ShareChart';
import WalletTab from '@/components/tabs/WalletTab';
import NetzTab from '@/components/tabs/NetzTab';
import InfoTab from '@/components/tabs/InfoTab';
import Send from '@/components/wallet/Send';
import Receive from '@/components/wallet/Receive';
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

type Ansicht = null | 'senden' | 'empfangen' | 'einstellungen';

export default function AppShell({ platform }: { platform: string }) {
  const wallet = useWallet();
  const m = useMining(wallet.address, platform);
  // Ohne das schaltet das Display ab, die Plattform haelt den Worker an,
  // und das Mining endet mitten im Job -- ohne dass jemand etwas gedrueckt
  // haette.
  const wach = useWakeLock(m.mining);
  const [tab, setTab] = useState<Tab>('mining');
  const [ansicht, setAnsicht] = useState<Ansicht>(null);

  const dec = m.summary?.token?.decimals ?? 8;
  const sym = m.summary?.token?.token_symbol ?? 'YSR';

  return (
    <>
      <main className="mx-auto min-h-dvh max-w-md px-4 pb-32 pt-5">
        {ansicht === 'senden' ? (
          <Send account={m.account} decimals={dec} symbol={sym}
                onFertig={() => setAnsicht(null)} onAbbruch={() => setAnsicht(null)} />
        ) : ansicht === 'empfangen' && wallet.address ? (
          <Receive address={wallet.address} onZurueck={() => setAnsicht(null)} />
        ) : ansicht === 'einstellungen' ? (
          <Settings onZurueck={() => setAnsicht(null)} anteil={m.duty} workers={2} />
        ) : tab === 'mining' ? (
          <MiningTab m={m} dec={dec} sym={sym} wach={wach} />
        ) : tab === 'wallet' ? (
          <WalletTab account={m.account as any} decimals={dec} symbol={sym}
                     onSenden={() => setAnsicht('senden')}
                     onEmpfangen={() => setAnsicht('empfangen')} />
        ) : tab === 'netz' ? (
          <NetzTab summary={m.summary} meineAdresse={wallet.address}
                   decimals={dec} symbol={sym} />
        ) : (
          <InfoTab summary={m.summary} decimals={dec} symbol={sym}
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
          <p className="rise relative text-[13px] tracking-[0.14em] text-proof">
            BLOCK GEFUNDEN
          </p>
          <p className="zoom tnum relative mt-4 text-[64px] font-medium leading-none
                        tracking-[-0.04em]">#{m.fund.height}</p>
          <p className="rise rise-2 relative mt-3 text-[22px] text-proof">
            +{(Number(m.fund.reward) / 10 ** dec).toFixed(0)} {sym}
          </p>
          <Hash value={m.fund.hash}
                className="rise rise-3 relative mb-10 mt-8 text-[11px] leading-[1.8] opacity-60" />
          <div className="relative z-10 w-full max-w-xs">
            <Button variant="quiet" onClick={m.dismissFund}>Weiter</Button>
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
function MiningTab({ m, dec, sym, wach }: {
  m: ReturnType<typeof useMining>; dec: number; sym: string;
  wach: 'aus' | 'aktiv' | 'nicht_moeglich';
}) {
  const r = rate(m.hashrate);
  return (
    <>
      <TopBar rechts={
        <Status tone={m.mining ? 'work' : 'off'}>
          {m.mining ? 'rechnet' : 'gestoppt'}
        </Status>
      } />

      {/* Hauptflaeche: die Leistung. Sie bewegt sich jede Sekunde und
          beantwortet die einzige Frage, die beim Mining zaehlt. */}
      <Panel tone="work" className="rise">
        <p className="text-[13px] text-dim">Rechenleistung</p>
        <div className="mt-1 flex items-baseline gap-2 leading-none">
          <span className={`tnum text-[46px] font-medium tracking-[-0.03em] ${
            m.mining ? 'text-work' : 'text-faint'}`}>{r.wert}</span>
          <span className="text-[17px] text-dim">{r.einheit}</span>
        </div>
        <p className="mt-2 text-[13px] text-dim">
          {m.mining
            ? `${m.account?.blocksFound ?? 0} Blöcke gefunden · Anteil ${m.duty} %`
            : 'Gestoppt — dein Gerät rechnet gerade nicht'}
        </p>

        <div className="mt-5">
          <ShareChart shares={m.shares} active={m.mining} />
        </div>
      </Panel>

      {m.lastShare && (
        <>
          <GroupTitle aside={`Difficulty ${Number(m.lastShare.difficulty)
            .toLocaleString('de-DE')}`}>Letzter angenommener Share</GroupTitle>
          <Panel className="rise rise-1">
            <Hash value={m.lastShare.hash} className="text-[12.5px] leading-[1.75]" />
          </Panel>
        </>
      )}

      <GroupTitle>Kette</GroupTitle>
      <Panel className="rise rise-2 !py-1">
        <dl>
          <Row label="Guthaben" tone={Number(m.account?.balance ?? 0) > 0 ? 'proof' : undefined}
               value={`${(Number(m.account?.balance ?? 0) / 10 ** dec).toFixed(4)} ${sym}`} />
          <Row label="Block" value={m.summary?.height != null ? `#${m.summary.height}` : '—'} />
          <Row label="Difficulty"
               value={m.summary?.difficulty?.toLocaleString('de-DE') ?? '—'} />
        </dl>
      </Panel>

      <GroupTitle>Steuerung</GroupTitle>
      <Panel className="rise rise-3">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13px] text-dim">Rechenanteil</span>
          <div className="sunk flex overflow-hidden !rounded-full p-0.5">
            {[25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => m.setDuty(v)} aria-pressed={m.duty === v}
                      className={`min-w-[48px] rounded-full py-1.5 text-[12.5px]
                                  transition-colors ${
                        m.duty === v ? 'bg-work text-ink' : 'text-faint'}`}>
                {v}%
              </button>
            ))}
          </div>
        </div>

        <Button onClick={() => (m.mining ? m.stop() : m.start(2))}
                variant={m.mining ? 'quiet' : 'primary'}>
          {m.mining ? 'Mining stoppen' : 'Mining starten'}
        </Button>

        {m.mining && (
          <p className="mt-3 text-center text-[12px] text-faint">
            {wach === 'aktiv'
              ? 'Der Bildschirm bleibt an, solange gemint wird.'
              : wach === 'nicht_moeglich'
              ? 'Dieses Gerät lässt den Bildschirm nicht offenhalten — sperrt er, pausiert das Mining.'
              : 'Sperrt der Bildschirm, pausiert das Mining.'}
          </p>
        )}

        {m.stumm && !m.fehler && (
          <div className="mt-4 space-y-2">
            <Notice tone="risk">
              Der Miner meldet seit zehn Sekunden keinen Fortschritt.
            </Notice>
            <div className="sunk px-4 py-3">
              {Object.entries(m.etappen).map(([slot, e]) => (
                <p key={slot} className="font-mono text-[11px] text-faint">
                  Worker {slot}: {e}
                </p>
              ))}
              {Object.keys(m.etappen).length === 0 && (
                <p className="font-mono text-[11px] text-faint">keine Meldung erhalten</p>
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
