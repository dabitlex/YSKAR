'use client';

import { useEffect, useState } from 'react';
import { Panel, GroupTitle, Empty, Status, Kennzahl } from '@/components/ui/Primitives';
import { TopBar } from '@/components/ui/Chrome';
import type { Summary } from '@/hooks/useMining';
import { useT } from '@/i18n';

/**
 * Netz.
 *
 * Was die Kette gerade macht -- unabhaengig davon, ob man selbst mint.
 * Die eigenen Bloecke sind markiert, damit man sich darin wiederfindet.
 */

interface Blockzeile {
  height: number; hash: string; timestamp: string;
  difficulty: number; txCount: number;
  reward: string | null; minerAddress: string | null;
}

function rate(h: number | null) {
  if (h == null) return '—';
  if (h >= 1e9) return `${(h / 1e9).toFixed(2)} GH/s`;
  if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(1)} kH/s`;
  return `${Math.round(h)} H/s`;
}

export default function NetzTab({ summary, meineAdresse, decimals, symbol }: {
  summary: Summary | null; meineAdresse: string | null;
  decimals: number; symbol: string;
}) {
  const [blocks, setBlocks] = useState<Blockzeile[]>([]);
  const [meinHex, setMeinHex] = useState<string | null>(null);
  const { t, zahl, vorZeit } = useT();

  useEffect(() => {
    const hole = () => fetch('/api/v2/blocks?limit=12')
      .then(r => r.json()).then(d => setBlocks(d.blocks ?? [])).catch(() => {});
    hole();
    const id = setInterval(hole, 15_000);
    return () => clearInterval(id);
  }, []);

  // Die Blockliste liefert Rohadressen, die Wallet kennt nur bech32m.
  // Einmal umrechnen, damit sich eigene Bloecke markieren lassen.
  useEffect(() => {
    if (!meineAdresse) return;
    import('@/lib/core/address').then(({ decodeAddress }) => {
      import('@/lib/core/codec').then(({ toHex }) => {
        try { setMeinHex(toHex(decodeAddress(meineAdresse))); } catch { /* egal */ }
      });
    });
  }, [meineAdresse]);

  // Erwartete Restzeit bis zum naechsten Block. Statistisch, deshalb "etwa".
  const seitLetztem = summary?.tipHash && blocks[0]
    ? Date.now() / 1000 - Number(blocks[0].timestamp) : null;
  const rest = seitLetztem == null ? null
    : Math.max(0, Math.round((600 - seitLetztem) / 60));

  const seitMin = seitLetztem == null ? null : Math.round(seitLetztem / 60);
  const fortschritt = seitLetztem == null ? 0 : Math.min(100, (seitLetztem / 600) * 100);

  return (
    <>
      <TopBar titel={t.netz.titel} rechts={
        <Status tone={summary?.height ? 'proof' : 'off'}>{summary?.height ? t.allgemein.live : t.allgemein.laedt}</Status>
      } />

      <Panel tone="work" className="rise">
        <p className="label">{t.netz.hoehe}</p>
        <div className="mt-2 flex items-baseline gap-2.5 leading-none">
          <span className="tnum text-[40px] font-extrabold tracking-[-0.03em]">
            #{summary?.height != null ? zahl(summary.height) : '—'}
          </span>
          <span className="text-[13.5px] font-semibold text-dim">
            {rest == null ? '' : rest > 0 ? t.netz.naechster(rest) : t.netz.jederzeit}
          </span>
        </div>
        <div className="bar mt-4"><i style={{ width: `${Math.max(2, fortschritt)}%` }} /></div>
        <p className="mt-2 text-[12px] font-semibold text-faint">
          {t.netz.zielzeit}{seitMin != null ? t.netz.seitLetztem(seitMin) : ''}
        </p>
      </Panel>

      <Panel className="rise rise-1 mt-3.5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Kennzahl label={t.netz.difficulty}
                    wert={summary?.difficulty != null ? zahl(summary.difficulty) : '—'} />
          <Kennzahl label={t.netz.hashrate} wert={rate(summary?.hashrate ?? null)} />
          <Kennzahl label={t.netz.aktiveMiner} wert={String(summary?.activeMiners ?? 0)} />
          <Kennzahl label={t.netz.umlauf}
                    wert={`${zahl(Number(summary?.totalSupply ?? 0) / 10 ** decimals,
                      { maximumFractionDigits: 0 })} ${symbol}`} />
        </dl>
      </Panel>

      <GroupTitle aside={<a href="/explorer.html" className="font-bold text-work">{t.netz.explorer}</a>}>
        {t.netz.letzte}
      </GroupTitle>

      {blocks.length === 0 ? (
        <Empty>{t.netz.laedt}</Empty>
      ) : (
        <Panel className="rise rise-1 !p-0">
          <ul className="divide-y divide-line">
            {blocks.map(b => (
              <li key={b.height} className="flex items-center gap-3 px-4 py-3.5">
                <span className="tnum w-14 shrink-0 text-[13.5px] font-extrabold text-work">
                  #{zahl(b.height)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] text-dim">
                    {b.hash}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-semibold text-faint">
                    {b.reward ? `${(Number(b.reward) / 10 ** decimals).toFixed(0)} ${symbol}` : '—'}
                    {' · '}{b.txCount} {t.netz.tx} · {vorZeit(b.timestamp)}
                  </span>
                </span>
                {meinHex && b.minerAddress === meinHex && (
                  <span className="shrink-0 rounded-full bg-proof/10 px-2 py-0.5
                                   text-[11px] font-bold text-proof">{t.netz.du}</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

    </>
  );
}
