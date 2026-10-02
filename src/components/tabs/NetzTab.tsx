'use client';

import { useEffect, useState } from 'react';
import { hashrateText, grosseZahl } from '@/lib/format/hashrate';
import { Panel, GroupTitle, Empty } from '@/components/ui/Primitives';
import type { Summary } from '@/hooks/useMining';
import { useT } from '@/i18n';
import { Zahl, Etikett, Kachel, Pille, Ring } from '@/components/ui/Bausteine';
import { ExternLink, EXPLORER_URL } from '@/components/ui/ExternLink';

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

const rate = hashrateText;

export default function NetzTab({ summary, meineAdresse, decimals, symbol }: {
  summary: Summary | null; meineAdresse: string | null;
  decimals: number; symbol: string;
}) {
  const [blocks, setBlocks] = useState<Blockzeile[]>([]);
  const [meinHex, setMeinHex] = useState<string | null>(null);
  const { t, zahl, vorZeit, locale } = useT();

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
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />
      <header className="relative mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">{t.netz.titel}</h1>
        <Pille tone={summary?.height ? 'proof' : 'off'}>{summary?.height ? t.allgemein.live : t.allgemein.laedt}</Pille>
      </header>

      <section className="relative rise flex items-center justify-between gap-3 px-0.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Etikett>{t.netz.hoehe}</Etikett>
          <Zahl ganz={`#${summary?.height != null ? zahl(summary.height) : '—'}`} size={50} />
          <span className="text-[13px] font-bold text-dim">
            {rest == null ? t.netz.zielzeit : rest > 0 ? t.netz.naechster(rest) : t.netz.jederzeit}
          </span>
        </div>
        <Ring anteil={fortschritt / 100} oben={seitMin != null ? `${seitMin}′` : '—'} unten={t.netz.zielKurz} size={108} />
      </section>

      <div className="rise rise-1 mt-5 grid grid-cols-2 gap-2.5">
        <Kachel label={t.netz.difficulty} wert={summary?.difficulty != null ? grosseZahl(summary.difficulty, locale) : '—'} />
        <Kachel label={t.netz.hashrate} wert={rate(summary?.hashrate ?? null)} />
        <Kachel label={t.netz.aktiveMiner} wert={String(summary?.activeMiners ?? 0)} />
        <Kachel label={t.netz.umlauf}
                wert={`${zahl(Number(summary?.totalSupply ?? 0) / 10 ** decimals, { maximumFractionDigits: 0 })} ${symbol}`} />
      </div>

      <GroupTitle aside={<ExternLink href={EXPLORER_URL} className="font-bold text-work">{t.netz.explorer}</ExternLink>}>
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
