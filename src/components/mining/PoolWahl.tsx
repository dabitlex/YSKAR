'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { hashrateTeile } from '@/lib/format/hashrate';
import { Blatt, Pille } from '@/components/ui/Bausteine';
import { Button, Notice } from '@/components/ui/Primitives';
import { hostAusEingabe, waehlbar, type PoolStand } from '@/lib/pool/verzeichnis';
import type { PoolAuswahl } from '@/hooks/usePoolAuswahl';

/**
 * Pool auswaehlen statt Adresse eintippen.
 *
 *   PoolFeld   der gewaehlte Pool in der Steuerung, mit "Wechseln"
 *   PoolBlatt  die Liste: je Pool Miner und Plaetze, Leistung, gefundene
 *              Bloecke, Gebuehr -- und ob er noch jemanden aufnimmt
 *
 * Ein voller Pool laesst sich nicht waehlen. Das ist keine Schikane der App:
 * Die Kette zahlt je Block hoechstens 64 Adressen aus, und der Pool-Knoten
 * lehnt die Anmeldung dann ohnehin ab. Wer schon dabei ist -- etwa mit einem
 * zweiten Geraet --, kommt weiter hinein.
 *
 * Was hier steht, ist bis auf die Bloecke Selbstauskunft des Pools.
 */

const rate = (h: number | null) => {
  if (h === null) return '—';
  const r = hashrateTeile(h);
  return `${r.wert} ${r.einheit}`;
};

function StatusPille({ s }: { s: PoolStand | null }) {
  const { t } = useT();
  if (!s) return <Pille tone="off">{t.pool.wirdGeprueft}</Pille>;
  switch (s.status) {
    case 'offen': return <Pille tone="proof">{t.pool.offen}</Pille>;
    case 'voll': return <Pille tone="risk">{t.pool.voll}</Pille>;
    case 'unbekannt': return <Pille tone="proof">{t.pool.erreichbar}</Pille>;
    case 'keinPool': return <Pille tone="off">{t.pool.keinPool}</Pille>;
    default: return <Pille tone="off">{t.pool.nichtErreichbar}</Pille>;
  }
}

/** Ein Satz zum Stand -- unter dem Namen im Feld, unten links auf der Karte. */
function standText(s: PoolStand | null, t: ReturnType<typeof useT>['t']): string {
  if (!s) return t.pool.wirdGeprueft;
  switch (s.status) {
    case 'offen': return t.pool.frei(s.frei ?? 0);
    case 'voll': return s.dabei ? t.pool.dabei : t.pool.keinPlatz;
    case 'unbekannt': return t.pool.ohneZahlen;
    case 'keinPool': return t.pool.betreibtKeinen;
    default: return t.pool.antwortetNicht;
  }
}

const PFEIL = (
  <svg viewBox="0 0 10 16" width="6" height="10" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 2l6 6-6 6" /></svg>
);

/** Der gewaehlte Pool in der Steuerung. Ein Tipp oeffnet die Liste. */
export function PoolFeld({ pool, onOeffnen }: { pool: PoolAuswahl; onOeffnen: () => void }) {
  const { t, zahl } = useT();
  const g = pool.gewaehlt;
  const s = g?.stand ?? null;
  const voll = pool.hinweis === 'voll' || (!!s && s.status === 'voll' && !s.dabei);

  return (
    <div className="mb-4">
      <span className="text-[13.5px] font-semibold text-dim">{t.mining.pool}</span>

      {g ? (
        <button type="button" onClick={onOeffnen} disabled={pool.prueft}
                aria-label={`${t.pool.wechseln}: ${g.name}`}
                className="sunk mt-2 block w-full px-3 py-3 text-left">
          {/* Auf schmalen Geraeten wird es eng: Der Name bricht dann um,
              statt abgeschnitten zu werden -- "YSKAR M…" sagt niemandem etwas. */}
          <span className="flex items-center gap-1.5">
            <span className={`line-clamp-2 min-w-0 break-words leading-tight ${
                    g.eigen ? 'font-mono text-[13px] font-semibold' : 'text-[15px] font-extrabold'}`}>
              {g.name}
            </span>
            <span className="shrink-0"><StatusPille s={s} /></span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[13px] font-extrabold text-work">
              {t.pool.wechseln}{PFEIL}
            </span>
          </span>
          <span className="mt-1.5 block text-[12.5px] font-semibold leading-snug text-dim">
            {s && s.belegt !== null && s.plaetze !== null
              ? [t.pool.zeile(s.belegt, s.plaetze),
                 s.hashrate !== null ? rate(s.hashrate) : null,
                 s.feeBps !== null ? t.pool.gebuehrZeile(zahl(s.feeBps / 100)) : null,
                // Das Prozentzeichen bleibt bei seiner Zahl, auch wenn die Zeile umbricht.
                ].filter(Boolean).join(' · ').replace(/ %/g, '\u00a0%')
              : standText(s, t)}
          </span>
        </button>
      ) : pool.liste === null && !pool.listeFehler ? (
        <div className="sunk mt-2 px-3.5 py-3.5 text-[13px] font-semibold text-dim">{t.pool.laedt}</div>
      ) : (
        <button type="button" onClick={onOeffnen}
                className="sunk mt-2 flex w-full items-center justify-between px-3.5 py-3.5 text-left">
          {/* Kein Vorschlag: Die Liste fehlt, oder gerade nimmt keiner ihrer Pools jemanden auf. */}
          <span className="text-[13px] font-semibold text-dim">
            {pool.listeFehler && pool.liste === null ? t.pool.listeFehler : t.pool.wahl}
          </span>
          <span className="shrink-0 pl-3 text-work">{PFEIL}</span>
        </button>
      )}

      {voll && <div className="mt-3"><Notice tone="risk">{t.pool.vollText}</Notice></div>}
      {pool.hinweis === 'keinPool' && <div className="mt-3"><Notice tone="risk">{t.fehler.keinPool}</Notice></div>}
    </div>
  );
}

function Wert({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="whitespace-nowrap text-[10.5px] font-extrabold uppercase tracking-[.06em] text-faint">{name}</span>
      <span className="tnum whitespace-nowrap text-[14px] font-extrabold">{children}</span>
    </span>
  );
}

function Karte({ s, gewaehlt, eigen, laedt, onWaehlen }: {
  s: PoolStand; gewaehlt: boolean; eigen?: boolean;
  /** Der Stand ist noch unterwegs -- dann steht "wird geprueft" da, nicht "nicht erreichbar". */
  laedt?: boolean;
  onWaehlen: () => void;
}) {
  const { t, zahl, locale } = useT();
  const geht = waehlbar(s);
  // "1 %", "1%", "%1": Wo das Zeichen steht, weiss die Sprache.
  const prozent = (bp: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(bp / 10_000);
  const stumm = !laedt && (s.status === 'aus' || s.status === 'keinPool');
  const anteil = s.belegt !== null && s.plaetze ? Math.min(1, s.belegt / s.plaetze) : 0;

  return (
    <li className={`panel !rounded-[20px] p-4 ${gewaehlt ? 'ring-2 ring-work' : ''}`}>
      <div className={stumm ? 'opacity-55' : ''}>
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            {!eigen && <span className="truncate text-[16px] font-extrabold tracking-[-0.01em]">{s.name}</span>}
            <span className={`truncate font-mono ${eigen ? 'text-[13.5px] font-semibold' : 'text-[11.5px] text-faint'}`}>{s.host}</span>
          </span>
          <span className="shrink-0"><StatusPille s={laedt ? null : s} /></span>
        </div>

        <div className="mt-3.5 flex flex-wrap justify-between gap-x-4 gap-y-2.5">
          <Wert name={t.pool.miner}>
            {s.belegt !== null && s.plaetze !== null
              ? <>{s.belegt} <span className="font-bold text-faint">/ {s.plaetze}</span></> : '—'}
          </Wert>
          <Wert name={t.pool.leistung}>{rate(s.hashrate)}</Wert>
          <Wert name={t.pool.bloecke}>{s.bloecke !== null ? zahl(s.bloecke) : '—'}</Wert>
          <Wert name={t.pool.gebuehr}>{s.feeBps !== null ? prozent(s.feeBps) : '—'}</Wert>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
          <div className={`h-full rounded-full ${s.status === 'voll' ? 'bg-risk' : 'bg-work'}`}
               style={{ width: `${Math.round(anteil * 100)}%`, minWidth: anteil > 0 ? 6 : 0 }} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-[12.5px] font-semibold text-dim ${stumm ? 'opacity-55' : ''}`}>{standText(laedt ? null : s, t)}</span>
        {gewaehlt ? (
          <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] bg-work/10 px-3.5 text-[13.5px] font-extrabold text-work">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" /></svg>
            {t.pool.gewaehlt}
          </span>
        ) : geht ? (
          <button type="button" onClick={onWaehlen}
                  className="h-10 shrink-0 rounded-[12px] bg-work px-4 text-[13.5px] font-extrabold text-white active:scale-[.98]">
            {t.pool.beitreten}
          </button>
        ) : (
          <span className="flex h-10 shrink-0 items-center rounded-[12px] bg-raised px-3.5 text-[13.5px] font-extrabold text-faint">
            {s.status === 'voll' ? t.pool.voll : t.pool.nichtMoeglich}
          </span>
        )}
      </div>
    </li>
  );
}

/** Die Liste der Pools, von unten eingeschoben. */
export function PoolBlatt({ pool, offen, onSchliessen }: {
  pool: PoolAuswahl; offen: boolean; onSchliessen: () => void;
}) {
  const { t, locale } = useT();
  const [sicht, setSicht] = useState<'liste' | 'eigen'>('liste');
  const [eingabe, setEingabe] = useState('');
  const [ungueltig, setUngueltig] = useState(false);
  const g = pool.gewaehlt;

  // Jedes Oeffnen beginnt bei der Liste.
  useEffect(() => {
    if (!offen) return;
    setSicht('liste');
    setUngueltig(false);
    setEingabe(g?.eigen ? g.host : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  const liste = pool.liste ?? [];
  const uhr = pool.stand
    ? new Date(pool.stand * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : null;

  const uebernehmen = () => {
    const host = hostAusEingabe(eingabe);
    if (!host) { setUngueltig(true); return; }
    // Steht die Adresse in der Liste, ist es der Pool aus der Liste.
    pool.waehlen({ host, eigen: !liste.some(p => p.host === host) });
    onSchliessen();
  };

  return (
    <Blatt offen={offen} onSchliessen={onSchliessen} grund="ink"
           titel={sicht === 'eigen' ? t.pool.eigenTitel : t.pool.wahl}>
      {sicht === 'eigen' ? (
        <form onSubmit={e => { e.preventDefault(); uebernehmen(); }}>
          <button type="button" onClick={() => setSicht('liste')}
                  className="-mt-2 mb-3 flex h-9 items-center gap-2 text-[13.5px] font-extrabold text-work">
            <svg viewBox="0 0 10 16" width="6" height="10" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2 2 8l6 6" /></svg>
            {t.allgemein.zurueck}
          </button>
          <label htmlFor="pooladr" className="sr-only">{t.mining.poolAdresse}</label>
          <input id="pooladr" type="text" inputMode="url" spellCheck={false}
                 autoCapitalize="none" autoCorrect="off" autoComplete="off"
                 value={eingabe} onChange={e => { setEingabe(e.target.value); setUngueltig(false); }}
                 placeholder="pool.example.net" aria-invalid={ungueltig}
                 className="panel w-full !rounded-[14px] px-3.5 py-3.5 font-mono text-[14px]
                            text-text outline-none focus:border-work placeholder:text-faint" />
          {ungueltig && <p role="alert" className="mt-2 text-[12.5px] font-bold text-risk">{t.pool.eigenUngueltig}</p>}
          <p className="mb-4 mt-2.5 text-[12.5px] font-medium leading-relaxed text-dim">{t.pool.eigenHinweis}</p>
          <Button type="submit" disabled={eingabe.trim() === ''}>{t.pool.uebernehmen}</Button>
        </form>
      ) : (
        <>
          <p className="-mt-3 mb-3.5 text-[12.5px] font-semibold text-faint">
            {pool.liste === null
              ? (pool.listeFehler ? t.pool.listeFehler : t.pool.laedt)
              : [t.pool.anzahl(liste.length), uhr ? t.pool.stand(uhr) : null].filter(Boolean).join(' · ')}
          </p>

          {pool.liste === null && pool.listeFehler && (
            <div className="mb-3">
              <Button variant="quiet" onClick={() => { pool.neuLaden(); }}>{t.pool.nochmal}</Button>
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {liste.map(p => (
              <Karte key={p.host} s={p} gewaehlt={!!g && !g.eigen && g.host === p.host}
                     onWaehlen={() => { pool.waehlen({ host: p.host, eigen: false }); onSchliessen(); }} />
            ))}
            {g?.eigen && (
              <Karte eigen gewaehlt laedt={!g.stand} onWaehlen={() => {}}
                     s={g.stand ?? { host: g.host, name: g.host, kette: null, status: 'aus', belegt: null,
                                     plaetze: null, frei: null, hashrate: null, feeBps: null, bloecke: null }} />
            )}
          </ul>

          <button type="button" onClick={() => setSicht('eigen')}
                  className="mt-3 flex w-full items-center justify-between rounded-[18px] border border-dashed border-line px-4 py-3.5">
            <span className="text-[13.5px] font-semibold text-dim">{t.pool.nichtDabei}</span>
            <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-work">{t.pool.eigeneAdresse}{PFEIL}</span>
          </button>

          <p className="mt-4 text-[12px] font-medium leading-relaxed text-faint">
            {t.pool.selbstauskunft} {t.mining.poolHinweis}
          </p>
        </>
      )}
    </Blatt>
  );
}
