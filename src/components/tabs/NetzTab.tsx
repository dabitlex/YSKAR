'use client';

import { useEffect, useState } from 'react';
import type { Summary } from '@/hooks/useMining';

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

const vorZeit = (ts: string) => {
  const s = Math.max(0, Date.now() / 1000 - Number(ts));
  if (s < 60) return `vor ${Math.round(s)} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} d`;
};

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

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-dim">Netz</span>
        <span className="text-xs text-proof">
          {summary?.height != null ? `${summary.height + 1} Blöcke` : ''}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
        <Kennzahl label="Höhe" wert={summary?.height != null ? `#${summary.height}` : '—'} />
        <Kennzahl label="Difficulty"
                  wert={summary?.difficulty?.toLocaleString('de-DE') ?? '—'} />
        <Kennzahl label="Netz-Hashrate" wert={rate(summary?.hashrate ?? null)} />
        <Kennzahl label="Aktive Miner" wert={String(summary?.activeMiners ?? 0)} />
        <Kennzahl label="Nächster Block"
                  wert={rest == null ? '—' : rest > 0 ? `≈ ${rest} min` : 'jederzeit'} />
        <Kennzahl label="Im Umlauf"
                  wert={`${(Number(summary?.totalSupply ?? 0) / 10 ** decimals)
                    .toLocaleString('de-DE', { maximumFractionDigits: 0 })} ${symbol}`} />
      </dl>

      <p className="mt-7 border-t border-line pt-4 text-sm text-dim">Letzte Blöcke</p>
      <ul className="mt-2">
        {blocks.map(b => (
          <li key={b.height} className="flex items-center gap-3 border-b border-line py-3">
            <span className="tnum w-9 shrink-0 text-[13px] text-work">#{b.height}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[11px] text-dim">{b.hash}</span>
              <span className="block text-[11px] text-dim">
                {b.reward ? `${(Number(b.reward) / 10 ** decimals).toFixed(0)} ${symbol}` : '—'}
                {' · '}{b.txCount} Tx · {vorZeit(b.timestamp)}
              </span>
            </span>
            {meinHex && b.minerAddress === meinHex && (
              <span className="shrink-0 rounded border border-proof/40 px-1.5 py-0.5
                               text-[9.5px] text-proof">du</span>
            )}
          </li>
        ))}
      </ul>

      <a href="/explorer.html" className="mt-4 block text-sm text-work underline">
        Vollständigen Explorer öffnen
      </a>
    </>
  );
}

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <dt className="text-[11px] text-dim">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px]">{wert}</dd>
    </div>
  );
}
