'use client';

import { useT } from '@/i18n';
import { hashrateTeile } from '@/lib/format/hashrate';
import { Hinweis } from '@/components/ys';
import { standText } from '@/components/mining/PoolWahl';
import type { PoolAuswahl } from '@/hooks/usePoolAuswahl';

/**
 * Der Pool auf der Mining-Hauptansicht (Paket 3) -- ersetzt das alte
 * PoolFeld und die Pool-Karte waehrend des Minings.
 *
 * Eine Flaeche: Punkt (Zustand), Name, Plaetze und Gebuehr. Rechts vor dem
 * Start "Wechseln", waehrend des Minings die Schaetzung je Pool-Block.
 * Solange gemint wird, ist der Pool nicht wechselbar (wie bisher).
 *
 * Plaetze kommen vom Pool selbst (heute 63, ab Revision 6 bis 254) --
 * nie eine feste Zahl im Code.
 */
export function PoolZeile({ pool, mining, anteil, sym, poolName, onOeffnen, onDetails }: {
  pool: PoolAuswahl;
  mining: boolean;
  /** Schaetzung je Pool-Block in YSR, null = nichts zu schaetzen */
  anteil: number | null;
  sym: string;
  /** Name waehrend des Minings (kann aus der Sitzung kommen) */
  poolName: string | null;
  onOeffnen: () => void;
  onDetails: () => void;
}) {
  const { t, zahl, locale } = useT();
  const klasse = 'ys-flaeche flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left';

  if (pool.modus === 'solo') {
    return (
      <button type="button" onClick={onDetails} className={`${klasse} active:opacity-80`}>
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-ys-fliess font-medium">{t.rd.mine.solo}</span>
          <span className="text-ys-meta text-dim">{t.ys.mining.soloUnter}</span>
        </span>
        <span aria-hidden="true" className="text-faint">›</span>
      </button>
    );
  }

  const g = pool.gewaehlt;
  const s = g?.stand ?? null;
  const voll = pool.hinweis === 'voll' || (!!s && s.status === 'voll' && !s.dabei);

  if (!g) {
    const laedt = pool.liste === null && !pool.listeFehler;
    return laedt ? (
      <div className={`${klasse} text-ys-klein text-dim`}>{t.pool.laedt}</div>
    ) : (
      <button type="button" onClick={onOeffnen} className={`${klasse} active:opacity-80`}>
        <span className="flex-1 text-ys-klein text-dim">
          {pool.listeFehler && pool.liste === null ? t.pool.listeFehler : t.pool.wahl}
        </span>
        <span aria-hidden="true" className="text-faint">›</span>
      </button>
    );
  }

  const punkt = !s ? 'bg-faint'
    : s.status === 'offen' || s.status === 'unbekannt' ? 'bg-proof'
    : s.status === 'voll' ? 'bg-risk' : 'bg-faint';
  const name = mining ? (poolName ?? g.name) : g.name;
  const zeile = s && s.belegt !== null && s.plaetze !== null
    ? [t.pool.zeile(s.belegt, s.plaetze),
       s.hashrate !== null ? (() => { const r = hashrateTeile(s.hashrate!, locale); return `${r.wert} ${r.einheit}`; })() : null,
       s.feeBps !== null ? t.pool.gebuehrZeile(zahl(s.feeBps / 100)) : null,
      ].filter(Boolean).join(' · ').replace(/ %/g, ' %')
    : standText(s, t);
  const waehlbar = !mining && !pool.prueft;
  const anteilText = anteil === null ? null
    : zahl(anteil, { maximumFractionDigits: anteil < 0.01 ? 6 : anteil < 1 ? 4 : 2 });

  const inhalt = (
    <>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${punkt}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`line-clamp-2 break-words ${g.eigen ? 'font-mono text-ys-klein' : 'text-ys-fliess font-medium'}`}>{name}</span>
        <span className="text-ys-meta text-dim">{zeile}</span>
      </span>
      {mining && anteilText !== null ? (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="tnum font-mono text-ys-klein text-proof">{t.miningNeu.anteilWert(anteilText, sym)}</span>
          <span className="text-ys-meta text-dim">{t.ys.mining.jeBlock}</span>
        </span>
      ) : waehlbar ? (
        <span className="flex shrink-0 items-center gap-1 text-ys-klein text-cyan">{t.pool.wechseln}<span aria-hidden="true">›</span></span>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      {waehlbar ? (
        <button type="button" onClick={onOeffnen} aria-label={`${t.pool.wechseln}: ${g.name}`}
                className={`${klasse} active:opacity-80`}>{inhalt}</button>
      ) : (
        <div className={klasse}>{inhalt}</div>
      )}
      {mining && anteilText !== null && (
        <p className="px-1 text-ys-meta text-dim">{t.miningNeu.anteilErklaerung}</p>
      )}
      {voll && <Hinweis ton="gefahr">{t.pool.vollText}</Hinweis>}
      {pool.hinweis === 'keinPool' && <Hinweis ton="gefahr">{t.fehler.keinPool}</Hinweis>}
    </div>
  );
}
