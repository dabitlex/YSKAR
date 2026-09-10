'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { useMining } from '@/hooks/useMining';
import { BottomNav, type Tab } from '@/components/ui/Chrome';
import { Button, Hash, Dot, Notice } from '@/components/ui/Primitives';
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
  const [tab, setTab] = useState<Tab>('mining');
  const [ansicht, setAnsicht] = useState<Ansicht>(null);

  const dec = m.summary?.token?.decimals ?? 8;
  const sym = m.summary?.token?.token_symbol ?? 'YSR';

  return (
    <>
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-28 pt-6">
        {ansicht === 'senden' ? (
          <Send account={m.account} decimals={dec} symbol={sym}
                onFertig={() => setAnsicht(null)} onAbbruch={() => setAnsicht(null)} />
        ) : ansicht === 'empfangen' && wallet.address ? (
          <Receive address={wallet.address} onZurueck={() => setAnsicht(null)} />
        ) : ansicht === 'einstellungen' ? (
          <Settings onZurueck={() => setAnsicht(null)} anteil={m.duty} workers={2} />
        ) : tab === 'mining' ? (
          <MiningTab m={m} dec={dec} sym={sym} />
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
          <p className="mb-5 text-sm text-proof">Block gefunden</p>
          <p className="tnum mb-1.5 text-5xl font-medium">#{m.fund.height}</p>
          <p className="mb-8 text-lg text-proof">
            {(Number(m.fund.reward) / 10 ** dec).toFixed(0)} {sym}
          </p>
          <Hash value={m.fund.hash} className="mb-10 text-[11px] leading-[1.8] opacity-70" />
          <div className="w-full max-w-xs">
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
function MiningTab({ m, dec, sym }: { m: ReturnType<typeof useMining>; dec: number; sym: string }) {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-dim">YSKAR</span>
        <span className="flex items-center gap-2 text-sm text-dim">
          <Dot tone={m.mining ? 'work' : 'off'} />
          {m.mining ? 'rechnet' : 'gestoppt'}
        </span>
      </div>

      <div className="tnum mt-4 flex items-baseline gap-2 leading-none">
        <span className={`text-5xl font-medium tracking-tight ${
          m.mining ? 'text-work' : 'text-dim'}`}>
          {rate(m.hashrate).wert}
        </span>
        <span className="text-xl text-dim">{rate(m.hashrate).einheit}</span>
      </div>
      <p className="mt-2 text-sm text-dim">
        {m.mining
          ? `${m.account?.blocksFound ?? 0} Blöcke · Anteil ${m.duty}%`
          : 'Tippe auf Mining starten'}
      </p>

      {m.lastShare && (
        <div className="mt-6 border-t border-line pt-5">
          <Hash value={m.lastShare.hash} className="text-[13px] leading-[1.7]" />
          <p className="mt-2.5 text-sm text-dim">
            Dein letzter angenommener Share · Difficulty{' '}
            {Number(m.lastShare.difficulty).toLocaleString('de-DE')}
          </p>
        </div>
      )}

      <ShareChart shares={m.shares} active={m.mining} />

      <dl className="mt-7 border-t border-line">
        <Zeile label="Guthaben" wert={
          <span className={Number(m.account?.balance ?? 0) > 0 ? 'text-proof' : ''}>
            {(Number(m.account?.balance ?? 0) / 10 ** dec).toFixed(4)} {sym}
          </span>} />
        <Zeile label="Block" wert={m.summary?.height != null ? `#${m.summary.height}` : '—'} />
        <Zeile label="Difficulty"
               wert={m.summary?.difficulty?.toLocaleString('de-DE') ?? '—'} />
      </dl>

      <div className="mt-7">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-dim">Rechenanteil</span>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {[25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => m.setDuty(v)} aria-pressed={m.duty === v}
                      className={`min-w-[52px] px-3 py-2 text-sm transition-colors ${
                        m.duty === v ? 'bg-work text-ink' : 'text-dim'}`}>
                {v}%
              </button>
            ))}
          </div>
        </div>

        <Button onClick={() => (m.mining ? m.stop() : m.start(2))}
                variant={m.mining ? 'quiet' : 'primary'}>
          {m.mining ? 'Mining stoppen' : 'Mining starten'}
        </Button>

        {m.stumm && !m.fehler && (
          <div className="mt-4 space-y-2">
            <Notice tone="risk">Der Miner meldet seit zehn Sekunden keinen Fortschritt.</Notice>
            <div className="rounded-lg border border-line px-4 py-3">
              {Object.entries(m.etappen).map(([slot, e]) => (
                <p key={slot} className="font-mono text-xs text-dim">Worker {slot}: {e}</p>
              ))}
              {Object.keys(m.etappen).length === 0 && (
                <p className="font-mono text-xs text-dim">keine Meldung erhalten</p>
              )}
            </div>
          </div>
        )}
        {m.fehler && <div className="mt-4"><Notice tone="risk">{m.fehler}</Notice></div>}
      </div>
    </>
  );
}

function Zeile({ label, wert }: { label: string; wert: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="tnum text-[15px]">{wert}</dd>
    </div>
  );
}

function rate(h: number): { wert: string; einheit: string } {
  if (h >= 1e6) return { wert: (h / 1e6).toFixed(2), einheit: 'MH/s' };
  if (h >= 1e3) return { wert: (h / 1e3).toFixed(1), einheit: 'kH/s' };
  return { wert: String(Math.round(h)), einheit: 'H/s' };
}
