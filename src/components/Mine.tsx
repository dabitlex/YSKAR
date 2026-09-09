'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { useMining } from '@/hooks/useMining';
import PerformanceStrip from '@/components/PerformanceStrip';
import { Screen, Row, Button, Hash, Dot, Notice } from '@/components/ui/Primitives';

/**
 * Mining-Bildschirm.
 *
 * Der Held ist der zuletzt angenommene Hash, nicht eine grosse Zahl mit
 * Label. Die fuehrenden Nullen sind die geleistete Arbeit -- gedimmt kann
 * man sie zaehlen statt lesen. Das ist echtes Material aus dieser Kette und
 * laesst sich nirgends sonst so zeigen.
 *
 * Wenn noch nichts gefunden wurde, steht dort der aktuelle Kettenkopf. Kein
 * Platzhalter, kein Skelett: eine leere Anzeige waere hier eine Luege ueber
 * den Zustand der Kette.
 */
export default function Mine({ platform }: { platform: string }) {
  const wallet = useWallet();
  const m = useMining(wallet.address, platform);
  const [zeigeAdresse, setZeigeAdresse] = useState(false);

  const dec = m.summary?.token?.decimals ?? 8;
  const sym = m.summary?.token?.token_symbol ?? 'YSR';
  const guthaben = m.account ? Number(m.account.balance) / 10 ** dec : 0;

  const angezeigterHash = m.lastShare?.hash ?? m.summary?.tipHash ?? null;
  const hashHerkunft = m.lastShare
    ? `Dein letzter Share · Difficulty ${Number(m.lastShare.difficulty).toLocaleString('de-DE')}`
    : 'Kopf der Kette';

  return (
    <Screen>
      <header className="mb-7 flex items-baseline justify-between">
        <span className="text-sm text-dim">YSKAR</span>
        <span className="flex items-center gap-2 text-sm text-dim">
          <Dot tone={m.mining ? 'work' : 'off'} />
          {m.mining ? 'rechnet' : 'gestoppt'}
        </span>
      </header>

      {/* Held: der Hash. */}
      <section className="mb-8">
        {angezeigterHash ? (
          <>
            <Hash value={angezeigterHash} className="text-[13px] leading-[1.7]" />
            <p className="mt-2.5 text-sm text-dim">{hashHerkunft}</p>
          </>
        ) : (
          <p className="text-sm text-dim">Noch kein Block. Die Kette wartet auf den ersten.</p>
        )}
      </section>

      <PerformanceStrip
        samples={m.samples} shares={m.shareMarks}
        blocks={m.blockMarks} active={m.mining}
      />

      <dl className="mt-8 border-t border-line">
        <Row label={`Guthaben`} value={
          <span className={guthaben > 0 ? 'text-proof' : ''}>
            {guthaben.toFixed(4)} {sym}
          </span>
        } />
        <Row label="Block" value={m.summary?.height != null ? `#${m.summary.height}` : '—'} />
        <Row label="Difficulty"
             value={m.summary?.difficulty?.toLocaleString('de-DE') ?? '—'} />
        <Row label="Nächster Reward"
             value={`${(Number(m.summary?.nextReward ?? 0) / 10 ** dec).toFixed(0)} ${sym}`} />
        <Row label="Blöcke gefunden" value={String(m.account?.blocksFound ?? 0)} />
      </dl>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-dim">Rechenanteil</span>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {[25, 50, 75, 100].map(v => (
              <button
                key={v} onClick={() => m.setDuty(v)} aria-pressed={m.duty === v}
                className={`min-w-[52px] px-3 py-2 text-sm transition-colors ${
                  m.duty === v ? 'bg-work text-ink' : 'text-dim hover:text-text'}`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        <Button onClick={() => (m.mining ? m.stop() : m.start(2))}
                variant={m.mining ? 'quiet' : 'primary'}>
          {m.mining ? 'Mining stoppen' : 'Mining starten'}
        </Button>

        {m.fehler && <div className="mt-4"><Notice tone="risk">{m.fehler}</Notice></div>}
      </section>

      <section className="mt-10 border-t border-line pt-5">
        <button onClick={() => setZeigeAdresse(v => !v)}
                className="flex w-full items-baseline justify-between text-left">
          <span className="text-sm text-dim">Deine Adresse</span>
          <span className="text-sm text-dim">{zeigeAdresse ? 'ausblenden' : 'anzeigen'}</span>
        </button>
        {zeigeAdresse && wallet.address && (
          <div className="mt-3">
            <p className="break-all font-mono text-sm">{wallet.address}</p>
            <button
              onClick={() => navigator.clipboard?.writeText(wallet.address!)}
              className="mt-3 text-sm text-work underline"
            >
              Adresse kopieren
            </button>
            <p className="mt-4 text-sm text-dim">
              Der Reward eines gefundenen Blocks geht direkt hierher.
            </p>
          </div>
        )}
      </section>

      {/*
        Blockfund. Das seltenste Ereignis der App -- alle zehn Minuten
        findet es im ganzen Netz einmal statt, und meistens bei jemand
        anderem. Deshalb bekommt es als einziges eine Vollflaeche.
      */}
      {m.fund && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center
                        bg-ink px-8 text-center">
          <p className="mb-6 text-sm text-proof">Block gefunden</p>
          <p className="tnum mb-2 text-5xl font-medium">#{m.fund.height}</p>
          <p className="mb-8 text-lg text-proof">
            {(Number(m.fund.reward) / 10 ** dec).toFixed(0)} {sym}
          </p>
          <Hash value={m.fund.hash} className="mb-10 text-[11px] leading-[1.8] opacity-70" />
          <div className="w-full max-w-xs">
            <Button variant="quiet" onClick={m.dismissFund}>Weiter</Button>
          </div>
        </div>
      )}
    </Screen>
  );
}
