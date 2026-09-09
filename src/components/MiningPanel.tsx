'use client';

import { useEffect, useState } from 'react';
import { useMiner } from '@/hooks/useMiner';
import PerformanceStrip from '@/components/PerformanceStrip';

/**
 * Oberflaeche fuer Meilenstein 1. Bewusst nuechtern: Erst muss die Kette
 * beweisbar laufen, danach kommt die Gestaltung.
 *
 * Jede Zahl auf diesem Schirm stammt vom Server und damit aus validierten
 * Shares. Nichts wird hochgezaehlt, nichts geschaetzt, nichts animiert, was
 * nicht tatsaechlich passiert ist.
 */

declare global {
  interface Window { Telegram?: { WebApp: any } }
}

function formatHashrate(h: number): string {
  if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(2)} kH/s`;
  return `${h.toFixed(0)} H/s`;
}

export default function MiningPanel() {
  // Telegram-Daten einmal einlesen. Die Anmeldung selbst macht der Hook --
  // es darf nur einen Fetch-Pfad geben, und der muss 401 behandeln koennen.
  const [tg, setTg] = useState<{ initData: string; platform: string } | null>(null);
  const [noTelegram, setNoTelegram] = useState(false);

  useEffect(() => {
    const w = window.Telegram?.WebApp;
    // Das Telegram-Skript laedt auch ausserhalb von Telegram, liefert dann
    // aber eine leere initData. Genau daran erkennen wir den Browser.
    if (!w || !w.initData) { setNoTelegram(true); return; }
    w.ready();
    w.expand?.();
    setTg({ initData: w.initData, platform: w.platform });
  }, []);

  const miner = useMiner(tg?.initData ?? null, tg?.platform ?? '');
  const { canMine, authError } = miner;
  const token = miner.ready;

  const s = miner.status;
  const decimals = s?.token.decimals ?? 8;
  const symbol = s?.token.symbol ?? 'YSR';

  if (noTelegram || authError === 'outside_telegram') {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-muted">Mining läuft nur in Telegram.</p>
        <p className="mt-3 text-sm">
          <a href="/explorer" className="text-accent underline">
            Zum Block Explorer
          </a>{' '}
          <span className="text-muted">— dort kannst du die Kette ohne Anmeldung prüfen.</span>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-7">
      <h1 className="mb-8 text-sm font-medium tracking-wide text-muted">
        {s?.token.name ?? 'YSKAR'}
      </h1>

      <div className="tabular-nums leading-none">
        <span className="text-5xl font-semibold tracking-tight">
          {formatHashrate(s?.session?.hashrate ?? 0).split(' ')[0]}
        </span>
        <span className="ml-2 text-xl text-muted">
          {formatHashrate(s?.session?.hashrate ?? 0).split(' ')[1]}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {miner.mining
          ? `${s?.session?.validShares ?? 0} gueltige Shares, ${(s?.session?.roundSharePct ?? 0).toFixed(1)} % dieser Runde`
          : 'nicht aktiv'}
      </p>

      <PerformanceStrip
        samples={miner.samples}
        shares={miner.shareMarks}
        blocks={miner.blockMarks}
        active={miner.mining}
      />

      <dl className="mt-8 space-y-2 border-t border-line pt-5 text-sm">
        <Row label="Block" value={s?.height != null ? `#${s.height}` : '—'} />
        <Row label="Difficulty" value={s?.difficulty?.toLocaleString('de-DE') ?? '—'} />
        <Row label="Netz-Hashrate" value={formatHashrate(s?.networkHashrate ?? 0)} />
        <Row label="Share-Difficulty" value={s?.session?.shareDifficulty ?? '—'} />
        <Row
          label="Guthaben"
          value={`${((s?.account.balance ?? 0) / 10 ** decimals).toFixed(4)} ${symbol}`}
        />
        <Row label="Bloecke gefunden" value={String(s?.account.blocksFound ?? 0)} />
      </dl>

      <div className="mt-8 border-t border-line pt-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-muted">Mining-Anteil</span>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {[25, 50, 75, 100].map(v => (
              <button
                key={v}
                onClick={() => miner.setDuty(v)}
                aria-pressed={miner.duty === v}
                className={`min-w-12 px-3 py-2 text-sm ${
                  miner.duty === v ? 'bg-accent text-white' : 'text-muted'
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        {/*
          Bewusst abgeschaltet statt still kaputt: Der Worker baut seit der
          Umstellung 136-Byte-Header fuer die neue Kette, die Route
          /api/v1/mining/job liefert aber noch das alte 116-Byte-Format.
          Diese Kombination wuerde Muell hashen und jeden Share verwerfen --
          von aussen sichtbar als "Mining laeuft, aber nichts passiert".
        */}
        <button
          disabled
          className="w-full rounded-xl bg-line py-4 font-medium text-muted"
        >
          Mining wird auf die neue Kette umgestellt
        </button>

        <p className="mt-3 text-sm text-muted">
          Die Testnet-Kette ist abgeschlossen. YSKAR laeuft jetzt auf einer
          eigenen Kette mit Wallet und Transaktionen im Block. Die Oberflaeche
          dafuer wird gerade gebaut.{' '}
          <a href="/explorer" className="text-accent underline">Block Explorer</a>
        </p>

        {!canMine && token && (
          <p className="mt-3 text-sm text-warn">
            Mining laeuft nur auf dem Smartphone. Bloecke und Rangliste kannst du
            hier trotzdem ansehen.
          </p>
        )}
        {miner.error && <p className="mt-3 text-sm text-warn">{miner.error}</p>}
        {authError && <p className="mt-3 text-sm text-warn">Anmeldung: {authError}</p>}
      </div>

      {miner.lastBlock && (
        <div className="mt-8 rounded-xl border border-accent p-5 text-center">
          <p className="text-sm text-muted">BLOCK GEFUNDEN</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            #{miner.lastBlock.height}
          </p>
          <p className="mt-1 text-sm text-muted">
            {(miner.lastBlock.reward / 10 ** decimals).toFixed(0)} {symbol} an die Runde verteilt
          </p>
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
