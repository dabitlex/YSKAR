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
      <span className="text-[13.5px] font-medium text-dim">{t.mining.pool}</span>

      {g ? (
        <button type="button" onClick={onOeffnen} disabled={pool.prueft}
                aria-label={`${t.pool.wechseln}: ${g.name}`}
                className="mt-2 block w-full border-y border-line py-3.5 text-left active:opacity-70">
          {/* Auf schmalen Geraeten wird es eng: Der Name bricht dann um,
              statt abgeschnitten zu werden -- "YSKAR M…" sagt niemandem etwas. */}
          <span className="flex items-center gap-1.5">
            <span className={`line-clamp-2 min-w-0 break-words leading-tight ${
                    g.eigen ? 'font-mono text-[14px]' : 'text-[16px] font-medium'}`}>
              {g.name}
            </span>
            <span className="shrink-0 pl-1"><StatusPille s={s} /></span>
            <span className="ml-auto flex shrink-0 items-center gap-2 text-[14px] text-lese">
              {t.pool.wechseln}{PFEIL}
            </span>
          </span>
          <span className="mt-1.5 block text-[13.5px] leading-[1.4] text-dim">
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
        <div className="mt-2 border-y border-line py-3.5 text-[14.5px] text-dim">{t.pool.laedt}</div>
      ) : (
        <button type="button" onClick={onOeffnen}
                className="mt-2 flex min-h-[54px] w-full items-center justify-between border-y border-line py-3 text-left active:opacity-70">
          {/* Kein Vorschlag: Die Liste fehlt, oder gerade nimmt keiner ihrer Pools jemanden auf. */}
          <span className="text-[16px] font-medium">
            {pool.listeFehler && pool.liste === null ? t.pool.listeFehler : t.pool.wahl}
          </span>
          <span className="shrink-0 pl-3 text-dim">{PFEIL}</span>
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
      <span className="whitespace-nowrap text-[12.5px] text-dim">{name}</span>
      <span className="tnum whitespace-nowrap font-mono text-[14.5px]">{children}</span>
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
    <li className="border-b border-line py-4">
      <div className={stumm ? 'opacity-55' : ''}>
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            {!eigen && <span className="truncate text-[18px] font-medium leading-[1.25] tracking-[-.012em]">{s.name}</span>}
            <span className={`truncate font-mono ${eigen ? 'text-[14.5px]' : 'text-[12.5px] text-dim'}`}>{s.host}</span>
          </span>
          <span className="shrink-0"><StatusPille s={laedt ? null : s} /></span>
        </div>

        <div className="mt-3.5 flex flex-wrap justify-between gap-x-4 gap-y-2.5">
          <Wert name={t.pool.miner}>
            {s.belegt !== null && s.plaetze !== null
              ? <>{s.belegt} <span className="text-dim">/ {s.plaetze}</span></> : '—'}
          </Wert>
          <Wert name={t.pool.leistung}>{rate(s.hashrate)}</Wert>
          <Wert name={t.pool.bloecke}>{s.bloecke !== null ? zahl(s.bloecke) : '—'}</Wert>
          <Wert name={t.pool.gebuehr}>{s.feeBps !== null ? prozent(s.feeBps) : '—'}</Wert>
        </div>
        {/* Nur wenn der Pool Geld haelt (Sammelauszahlung): Das soll man wissen, bevor man beitritt. */}
        {s.modus === 'batch' && (
          <p className="mt-2.5 text-[13px] leading-[1.45] text-lamp">{t.pool.haeltGuthaben}</p>
        )}

        {/* Belegte Plaetze als Haarlinie: voll ist rot, sonst das Band der Kette. */}
        <div className="mt-3.5 h-0.5 overflow-hidden rounded-sm bg-text/[.18]" aria-hidden="true">
          <div className="h-full rounded-sm"
               style={{ width: `${Math.round(anteil * 100)}%`, minWidth: anteil > 0 ? 6 : 0,
                        background: s.status === 'voll' ? 'rgb(var(--risk))' : 'linear-gradient(90deg, #2F7BFF, #63D8FF)' }} />
        </div>
      </div>

      <div className="mt-2.5 flex min-h-11 items-center justify-between gap-3">
        <span className={`text-[13.5px] leading-[1.4] text-dim ${stumm ? 'opacity-55' : ''}`}>{standText(laedt ? null : s, t)}</span>
        {gewaehlt ? (
          <span className="flex h-11 shrink-0 items-center gap-2 text-[14.5px] font-medium text-lamp">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" /></svg>
            {t.pool.gewaehlt}
          </span>
        ) : geht ? (
          <button type="button" onClick={onWaehlen}
                  className="h-11 shrink-0 rounded-full bg-lamp px-5 text-[14.5px] font-semibold text-lamp-ink active:scale-[.98]">
            {t.pool.beitreten}
          </button>
        ) : (
          <span className="flex h-11 shrink-0 items-center text-[14.5px] text-dim">
            {s.status === 'voll' ? t.pool.voll : t.pool.nichtMoeglich}
          </span>
        )}
      </div>
    </li>
  );
}

/** Die Liste der Pools, von unten eingeschoben. */
export function PoolBlatt({ pool, offen, onSchliessen, voll }: {
  pool: PoolAuswahl; offen: boolean; onSchliessen: () => void;
  /** Der Start ist an einem vollen Pool gescheitert: Name und Plaetze fuer den Hinweis oben. */
  voll?: { name: string; plaetze: number } | null;
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
                  className="-mt-2 mb-2 inline-flex min-h-11 items-center gap-2 text-[14.5px] font-medium text-text underline decoration-text/45 underline-offset-[.24em]">
            <svg viewBox="0 0 10 16" width="6" height="10" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2 2 8l6 6" /></svg>
            {t.allgemein.zurueck}
          </button>
          <label htmlFor="pooladr" className="sr-only">{t.mining.poolAdresse}</label>
          <input id="pooladr" type="text" inputMode="url" spellCheck={false}
                 autoCapitalize="none" autoCorrect="off" autoComplete="off"
                 value={eingabe} onChange={e => { setEingabe(e.target.value); setUngueltig(false); }}
                 placeholder="pool.example.net" aria-invalid={ungueltig}
                 className="feld h-[58px] w-full bg-transparent px-[18px] font-mono text-[16px]
                            text-text outline-none placeholder:text-faint" />
          {ungueltig && <p role="alert" className="mt-2 text-[13.5px] leading-[1.4] text-risk">{t.pool.eigenUngueltig}</p>}
          <p className="mb-5 mt-2.5 text-[13px] leading-[1.45] text-dim">{t.pool.eigenHinweis}</p>
          <Button type="submit" disabled={eingabe.trim() === ''}>{t.pool.uebernehmen}</Button>
        </form>
      ) : (
        <>
          {voll && (
            <div role="status" className="-mt-1 mb-4 border-y border-risk/40 py-3">
              <p className="text-[16px] font-medium leading-[1.3] text-text">{t.miningNeu.vollTitel(voll.name)}</p>
              <p className="mt-1 text-[13.5px] leading-[1.45] text-lese">{t.miningNeu.vollText(voll.plaetze)}</p>
            </div>
          )}
          <p className="-mt-3 mb-3 text-[13px] text-dim">
            {pool.liste === null
              ? (pool.listeFehler ? t.pool.listeFehler : t.pool.laedt)
              : [t.pool.anzahl(liste.length), uhr ? t.pool.stand(uhr) : null].filter(Boolean).join(' · ')}
          </p>

          {pool.liste === null && pool.listeFehler && (
            <div className="mb-3">
              <Button variant="quiet" onClick={() => { pool.neuLaden(); }}>{t.pool.nochmal}</Button>
            </div>
          )}

          <ul className="border-t border-line">
            {liste.map(p => (
              <Karte key={p.host} s={p} gewaehlt={!!g && !g.eigen && g.host === p.host}
                     onWaehlen={() => { pool.waehlen({ host: p.host, eigen: false }); onSchliessen(); }} />
            ))}
            {g?.eigen && (
              <Karte eigen gewaehlt laedt={!g.stand} onWaehlen={() => {}}
                     s={g.stand ?? { host: g.host, name: g.host, kette: null, status: 'aus', belegt: null,
                                     plaetze: null, frei: null, hashrate: null, feeBps: null, bloecke: null,
                                     modus: null }} />
            )}
          </ul>

          <button type="button" onClick={() => setSicht('eigen')}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 border-b border-line py-3 text-left active:opacity-70">
            <span className="text-[14.5px] text-dim">{t.pool.nichtDabei}</span>
            <span className="flex shrink-0 items-center gap-2 text-[14.5px] font-medium text-text">{t.pool.eigeneAdresse}{PFEIL}</span>
          </button>

          <p className="mt-4 text-[13px] leading-[1.45] text-dim">
            {t.pool.selbstauskunft} {t.mining.poolHinweis}
          </p>
        </>
      )}
    </Blatt>
  );
}
