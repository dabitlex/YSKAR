'use client';

import { useEffect, useState } from 'react';
import { hashrateText, grosseZahl } from '@/lib/format/hashrate';
import type { Summary } from '@/hooks/useMining';
import { useT } from '@/i18n';
import { Pille } from '@/components/ui/Bausteine';
import { ListenTitel, PfeilHinaus } from '@/components/ui/Zeilen';
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

  const zeile = 'flex min-h-[50px] items-baseline justify-between gap-5 border-b border-line py-[14px]';

  return (
    <>
      {!ohneKopf && (
        <header className="relative mb-5 flex items-center justify-between">
          <h1 className="text-[24px] font-[350] tracking-[-.026em]">{t.netz.titel}</h1>
          <Pille tone={summary?.height ? 'proof' : 'off'}>{summary?.height ? t.allgemein.live : t.allgemein.laedt}</Pille>
        </header>
      )}

      <section className="rise relative">
        <span className="label">{t.netz.hoehe}</span>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-[17px] text-lese">#</span>
          <span className="betrag text-[76px]">{summary?.height != null ? zahl(summary.height) : '—'}</span>
        </p>
        <p className="mt-4 text-[16px] leading-[1.5] text-lese">
          {rest == null ? t.netz.zielzeit : rest > 0 ? t.netz.naechster(rest) : t.netz.jederzeit}
        </p>
        {/* Seit dem letzten Block vergangene Zeit, gemessen an der Zielzeit von zehn Minuten. */}
        <div className="faden mt-[18px]" aria-hidden="true">
          <i style={{ width: `${Math.max(1.5, fortschritt)}%` }} /><b style={{ left: `${Math.max(1.5, fortschritt)}%` }} />
        </div>
        <p className="tnum mt-2.5 font-mono text-[12.5px] text-dim">
          {seitMin != null ? `${seitMin}′` : '—'} · {t.netz.zielKurz}
        </p>
      </section>

      <dl className="rise rise-1 mt-6 border-t border-line">
        {([
          [t.netz.difficulty, summary?.difficulty != null ? grosseZahl(summary.difficulty, locale) : '—'],
          [t.netz.hashrate, rate(summary?.hashrate ?? null)],
          [t.netz.aktiveMiner, String(summary?.activeMiners ?? 0)],
          [t.netz.umlauf, `${zahl(Number(summary?.totalSupply ?? 0) / 10 ** decimals, { maximumFractionDigits: 0 })} ${symbol}`],
        ] as const).map(([name, wert]) => (
          <div key={name} className={zeile}>
            <dt className="shrink-0 text-[14.5px] text-dim">{name}</dt>
            <dd className="tnum min-w-0 truncate text-right font-mono text-[15px]">{wert}</dd>
          </div>
        ))}
      </dl>

      <ListenTitel className="mt-7" rechts={
        <ExternLink href={EXPLORER_URL} className="-my-3 inline-flex min-h-11 items-center gap-1.5 text-[13.5px] text-lese">
          {t.netz.explorer}<PfeilHinaus />
        </ExternLink>
      }>{t.netz.letzte}</ListenTitel>

      {blocks.length === 0 ? (
        <p className="py-7 text-[14.5px] leading-[1.45] text-lese">{t.netz.laedt}</p>
      ) : (
        <ul className="rise rise-1">
          {blocks.map(b => (
            <li key={b.height} className="flex min-h-[62px] items-center gap-3.5 border-b border-line py-[11px]">
              {/* Kalt: ein Block der Kette. Warm: mit Ueberweisungen (mehr als die Coinbase). */}
              <span aria-hidden="true" className={`punkt ${b.txCount > 1 ? 'punkt-mensch' : 'punkt-kette'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2.5">
                  <span className="tnum shrink-0 font-mono text-[15px]">#{zahl(b.height)}</span>
                  <span className="min-w-0 truncate font-mono text-[12.5px] text-dim">{b.hash}</span>
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-[1.4] text-dim">
                  {b.reward ? `${(Number(b.reward) / 10 ** decimals).toFixed(0)} ${symbol}` : '—'}
                  {' · '}{b.txCount} {t.netz.tx} · {vorZeit(b.timestamp)}
                </span>
              </span>
              {meinHex && b.minerAddress === meinHex && (
                <span className="shrink-0 text-[13.5px] font-medium text-lamp">{t.netz.du}</span>
              )}
            </li>
          ))}
        </ul>
      )}

    </>
  );
}
