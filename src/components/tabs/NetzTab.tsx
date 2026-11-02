'use client';

import { useEffect, useState } from 'react';
import { hashrateText, grosseZahl } from '@/lib/format/hashrate';
import type { Summary } from '@/hooks/useMining';
import { useT } from '@/i18n';
import { Pille, Ring } from '@/components/ui/Bausteine';
import { Flaeche, Abschnitt, Etikett, Kennzahl, KennzahlRaster } from '@/components/ys';
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


export default function NetzTab({ summary, meineAdresse, decimals, symbol, ohneKopf = false }: {
  summary: Summary | null; meineAdresse: string | null;
  decimals: number; symbol: string;
  /** Unter "Entdecken → Netz-Details": Der Titel steht dort schon. */
  ohneKopf?: boolean;
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
      {!ohneKopf && (
        <header className="mb-4 flex min-h-11 items-center justify-between">
          <h1 className="text-ys-seite font-semibold">{t.netz.titel}</h1>
          <Pille tone={summary?.height ? 'proof' : 'off'}>{summary?.height ? t.allgemein.live : t.allgemein.laedt}</Pille>
        </header>
      )}

      <div className="flex flex-col gap-4">
        <Flaeche className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Etikett>{t.netz.hoehe}</Etikett>
            <span className="tnum truncate text-ys-anzeige font-light leading-none tracking-[-0.05em]">
              #{summary?.height != null ? zahl(summary.height) : '—'}
            </span>
            <span className="text-ys-meta text-dim">
              {rest == null ? t.netz.zielzeit : rest > 0 ? t.netz.naechster(rest) : t.netz.jederzeit}
            </span>
          </div>
          <Ring anteil={fortschritt / 100} oben={seitMin != null ? `${seitMin}′` : '—'} unten={t.netz.zielKurz} size={96} />
        </Flaeche>

        <KennzahlRaster spalten={2}>
          <Kennzahl name={t.netz.difficulty} wert={summary?.difficulty != null ? grosseZahl(summary.difficulty, locale) : '—'} />
          <Kennzahl name={t.netz.hashrate} wert={hashrateText(summary?.hashrate ?? null, locale)} />
          <Kennzahl name={t.netz.aktiveMiner} wert={zahl(summary?.activeMiners ?? 0)} />
          <Kennzahl name={t.netz.umlauf}
                    wert={`${zahl(Number(summary?.totalSupply ?? 0) / 10 ** decimals, { maximumFractionDigits: 0 })} ${symbol}`} />
        </KennzahlRaster>

        <section aria-label={t.netz.letzte} className="flex flex-col">
          <Abschnitt titel={t.netz.letzte}
                     rechts={<ExternLink href={EXPLORER_URL} className="-mr-2 flex min-h-11 items-center px-2 text-ys-klein text-cyan">{t.netz.explorer} ↗</ExternLink>} />
          {blocks.length === 0 ? (
            <p className="py-6 text-center text-ys-klein text-dim">{t.netz.laedt}</p>
          ) : (
            <ul className="ys-flaeche px-4 [&>li:not(:first-child)]:border-t [&>li]:border-[rgb(var(--haar)/.12)]">
              {blocks.map(b => (
                <li key={b.height} className="flex min-h-[60px] items-center gap-3 py-2.5">
                  <span className="tnum w-16 shrink-0 font-mono text-ys-klein text-cyan">#{zahl(b.height)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px] text-dim">{b.hash}</span>
                    <span className="mt-0.5 block truncate text-ys-meta text-faint">
                      {b.reward ? `${zahl(Number(b.reward) / 10 ** decimals, { maximumFractionDigits: 0 })} ${symbol}` : '—'}
                      {' · '}{b.txCount} {t.netz.tx} · {vorZeit(b.timestamp)}
                    </span>
                  </span>
                  {meinHex && b.minerAddress === meinHex && (
                    <span className="shrink-0 rounded-full bg-proof/10 px-2.5 py-1 text-ys-meta text-proof">{t.netz.du}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
