'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { useMining } from '@/hooks/useMining';
import PerformanceStrip from '@/components/PerformanceStrip';
import { Screen, Row, Button, Hash, Dot, Notice } from '@/components/ui/Primitives';

/**
 * Mining-Bildschirm.
 *
 * Zwei Ebenen, die verschiedene Fragen beantworten:
 *
 *   Die Hashrate oben ist der PULS -- sie bewegt sich jede Sekunde und
 *   beantwortet "arbeitet mein Geraet gerade?". Sie kommt aus echtem
 *   Nonce-Fortschritt der Worker, nicht aus einer Animation.
 *
 *   Der Hash darunter ist die QUITTUNG -- er erscheint erst, wenn der Server
 *   einen Share angenommen hat, und beantwortet "kommt die Arbeit an?". Die
 *   fuehrenden Nullen sind gedimmt: Sie SIND die geleistete Arbeit, und
 *   gedimmt kann man sie zaehlen statt lesen.
 *
 * Gezeigt wird ausschliesslich der eigene Share. Den Kettenkopf hier
 * anzuzeigen, solange man selbst nichts gefunden hat, wuerde fremde Arbeit
 * wie eigene aussehen lassen.
 */
export default function Mine({ platform }: { platform: string }) {
  const wallet = useWallet();
  const m = useMining(wallet.address, platform);
  const [zeigeAdresse, setZeigeAdresse] = useState(false);

  const dec = m.summary?.token?.decimals ?? 8;
  const sym = m.summary?.token?.token_symbol ?? 'YSR';
  const guthaben = m.account ? Number(m.account.balance) / 10 ** dec : 0;

  // Nur der EIGENE letzte Share. Den Kettenkopf hier zu zeigen, wenn man
  // selbst noch nichts gefunden hat, wuerde fremde Arbeit wie eigene aussehen
  // lassen.
  const eigenerHash = m.lastShare?.hash ?? null;

  return (
    <Screen>
      <header className="mb-6 flex items-baseline justify-between">
        <span className="text-sm text-dim">YSKAR</span>
        <span className="flex items-center gap-2 text-sm text-dim">
          <Dot tone={m.mining ? 'work' : 'off'} />
          {m.mining ? 'rechnet' : 'gestoppt'}
        </span>
      </header>

      {/*
        Die Leistung ist der Beweis, dass gearbeitet wird -- sie gehoert nach
        oben und muss sich jede Sekunde bewegen. Der Hash darunter ist der
        Beleg, dass die Arbeit angekommen ist. Beides zusammen: Puls und
        Quittung.
      */}
      <section className="mb-8">
        <div className="tnum flex items-baseline gap-2 leading-none">
          <span className={`text-5xl font-medium tracking-tight ${
            m.mining ? 'text-work' : 'text-dim'}`}>
            {formatRate(m.hashrate).wert}
          </span>
          <span className="text-xl text-dim">{formatRate(m.hashrate).einheit}</span>
        </div>
        <p className="mt-2 text-sm text-dim">
          {m.mining
            ? `${m.account?.blocksFound ?? 0} Blöcke · Anteil ${m.duty}%`
            : 'Tippe auf Mining starten'}
        </p>

        {eigenerHash && (
          <div className="mt-6 border-t border-line pt-5">
            <Hash value={eigenerHash} className="text-[13px] leading-[1.7]" />
            <p className="mt-2.5 text-sm text-dim">
              Dein letzter angenommener Share · Difficulty{' '}
              {Number(m.lastShare!.difficulty).toLocaleString('de-DE')}
            </p>
          </div>
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

        {m.stumm && !m.fehler && (
          <div className="mt-4">
            <Notice tone="risk">
              Der Miner meldet seit zehn Sekunden keinen Fortschritt. Stoppen
              und neu starten hilft meistens.
            </Notice>
          </div>
        )}
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

/** Teilt Wert und Einheit, damit beide verschieden gesetzt werden koennen. */
function formatRate(h: number): { wert: string; einheit: string } {
  if (h >= 1e6) return { wert: (h / 1e6).toFixed(2), einheit: 'MH/s' };
  if (h >= 1e3) return { wert: (h / 1e3).toFixed(1), einheit: 'kH/s' };
  return { wert: String(Math.round(h)), einheit: 'H/s' };
}
