'use client';

import { useState } from 'react';
import { hashrateTeile } from '@/lib/format/hashrate';
import { Panel, GroupTitle, Hash, Notice } from '@/components/ui/Primitives';
import { Zahl, Etikett, Karte, Pille, Kurve, Ring, Blatt, Segment } from '@/components/ui/Bausteine';
import ShareChart from '@/components/ShareChart';
import { PoolFeld } from '@/components/mining/PoolWahl';
import type { PoolAuswahl } from '@/hooks/usePoolAuswahl';
import type { BenchErgebnis } from '@/hooks/useBenchmark';
import type { useMining } from '@/hooks/useMining';
import { useT } from '@/i18n';
import { istTelegram } from '@/lib/native/plattform';

/**
 * Mining.
 *
 * Oben steht, was ein Neuling braucht: ein grosser Knopf, solange nichts
 * laeuft -- und waehrend des Minings die eigene Leistung, der Pool und eine
 * ehrliche Schaetzung, was davon je Pool-Block ankommt.
 *
 * Modus, Worker und Last stehen unter "Erweitert" in einem Blatt. Die
 * Quittungen (Shares, letzter Hash, Aktivitaet) bleiben, darunter: Sie sind
 * der Beweis, dass das Telefon wirklich rechnet.
 */

type Mining = ReturnType<typeof useMining>;

const rate = (h: number) => hashrateTeile(h);

export default function MiningTab({ m, dec, sym, wach, pool, worker, setWorker, kerne, workerStufen,
                                    bench, onStarten, onBenchmark }: {
  m: Mining; dec: number; sym: string;
  wach: 'aus' | 'aktiv' | 'nicht_moeglich';
  pool: PoolAuswahl;
  worker: number; setWorker: (v: number) => void;
  kerne: number | null; workerStufen: number[];
  bench: BenchErgebnis | null;
  /** Startet im gewaehlten Modus (prueft vorher den Pool). */
  onStarten: () => void;
  onBenchmark: () => void;
}) {
  const { t, zahl, locale } = useT();
  const [erweitert, setErweitert] = useState(false);
  const { modus } = pool;
  const minuten = m.seit ? Math.max(0, Math.round((Date.now() - m.seit) / 60000)) : 0;

  // Der gewaehlte Pool mit seinem laufenden Stand.
  const ps = pool.gewaehlt?.stand ?? null;
  const poolRate = ps?.hashrate ?? m.poolInfo?.hashrate ?? null;
  const feeBps = ps?.feeBps ?? m.poolInfo?.feeBps ?? null;
  const reward = Number(m.summary?.nextReward ?? 0) / 10 ** dec;
  // Schaetzung je Pool-Block: eigener Anteil an der Pool-Leistung mal
  // Belohnung, abzueglich Gebuehr. Keine Zusage -- deshalb ≈ und der Satz darunter.
  const anteil = m.mining && poolRate && poolRate > 0 && m.hashrate > 0
    ? Math.min(1, m.hashrate / poolRate) * reward * (1 - (feeBps ?? 0) / 10_000) : null;
  const anteilText = anteil === null ? '—'
    : zahl(anteil, { maximumFractionDigits: anteil < 0.01 ? 6 : anteil < 1 ? 4 : 2 });

  // Fortschritt zum Ziel: bester Share der Sitzung gegen die Block-Difficulty.
  const bester = m.shares.reduce((b, s) => Math.max(b, s.achieved), 0);
  const blockDiff = m.summary?.difficulty ?? 0;
  const zumZiel = blockDiff > 0 ? Math.min(1, bester / blockDiff) : 0;
  const aktiv = [...m.shares].slice(-4).reverse();

  // Fehlermeldungen wie bisher: "Pool voll" sagt das Pool-Feld bzw. das
  // Blatt, eine verlorene Sitzung nach dem Anhalten sagt nichts mehr.
  const vollGezeigt = pool.hinweis === 'voll' || (!!ps && ps.status === 'voll' && !ps.dabei);
  const erledigt = modus === 'solo' || vollGezeigt
    || (pool.ueberholt === m.fehler && ps?.status === 'offen');
  const fehler = m.fehler && /pool_full/.test(m.fehler)
    ? (!m.mining && erledigt ? null : t.pool.vollText)
    : m.fehler && !m.mining && modus === 'pool' && /session_inactive/.test(m.fehler) ? null
    : m.fehler;

  const r = rate(m.hashrate);
  const startGesperrt = !m.mining && modus === 'pool' && (pool.gesperrt || pool.prueft);

  return (
    <>
      {/* Der Pool: vor dem Start waehlbar, waehrend des Minings mit Zahlen und der Schaetzung. */}
      {modus === 'pool' && !m.mining && (
        <div className="rise rise-1 mt-6"><PoolFeld pool={pool} onOeffnen={() => pool.setBlatt(true)} /></div>
      )}
      {modus === 'pool' && m.mining && (
        <Karte className="rise rise-2 mt-6 flex flex-col gap-2.5 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[14.5px] font-extrabold">
              <span className="h-2 w-2 rounded-full bg-proof" />
              {pool.gewaehlt && !pool.gewaehlt.eigen ? pool.gewaehlt.name : m.poolInfo?.name ?? pool.gewaehlt?.name}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Feld name={t.miningNeu.poolLeistung} wert={poolRate ? `${rate(poolRate).wert} ${rate(poolRate).einheit}` : '—'} />
            <Feld name={t.miningNeu.poolMiner}
                  wert={ps && ps.belegt !== null && ps.plaetze !== null ? `${ps.belegt} / ${ps.plaetze}` : String(m.poolInfo?.miner ?? '—')} />
            <Feld name={t.miningNeu.poolGebuehr} wert={feeBps !== null ? `${zahl(feeBps / 100)} %` : '—'} />
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-2.5">
            <span className="text-[13px] font-bold text-dim">{t.miningNeu.anteil}</span>
            <span className="tnum text-[14px] font-extrabold text-proof">{t.miningNeu.anteilWert(anteilText, sym)}</span>
          </div>
          <p className="text-[11.5px] font-semibold leading-[1.45] text-faint">{t.miningNeu.anteilErklaerung}</p>
        </Karte>
      )}

      {m.mining && (
        <p className="mt-3 flex gap-2.5 px-1 text-[13px] leading-[1.5] text-dim">
          {m.dienst?.ok
            ? (m.dienst.notifications ? t.mining.hintergrund : t.mining.hintergrundOhne)
            : m.dienst && !m.dienst.ok ? t.mining.dienstFehler(m.dienst.fehler)
            : istTelegram() ? t.miningNeu.offenLassen
            : wach === 'aktiv' ? t.mining.wach : wach === 'nicht_moeglich' ? t.mining.wachNicht : t.mining.wachAus}
        </p>
      )}

      <button type="button" onClick={() => setErweitert(true)}
              className="panel mt-3 flex h-[52px] w-full items-center justify-between px-4 text-[14px]
                         text-lese active:scale-[.99]">
        {t.miningNeu.erweitert}<span className="text-faint" aria-hidden="true">›</span>
      </button>

      {m.stumm && !m.fehler && (
        <div className="mt-4 space-y-2">
          <Notice tone="risk">{t.mining.stumm}</Notice>
          <div className="rounded-[12px] bg-raised px-4 py-3">
            {Object.entries(m.etappen).map(([slot, e]) => (
              <p key={slot} className="font-mono text-[11px] text-faint">{t.mining.workerZeile(slot, e)}</p>
            ))}
            {Object.keys(m.etappen).length === 0 && (
              <p className="font-mono text-[11px] text-faint">{t.mining.keineMeldung}</p>
            )}
          </div>
        </div>
      )}
      {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}

      {/* Die Quittungen -- unverändert, nur weiter unten. */}
      <GroupTitle>{t.miningNeu.details}</GroupTitle>
      <section className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Etikett>{t.mining.letzte}</Etikett>
          <span className="text-[13px] font-bold text-dim">
            {t.mining.bloecke(m.account?.blocksFound ?? 0)}
          </span>
        </div>
        <Ring anteil={zumZiel} oben={`${Math.round(zumZiel * 100)} %`} unten={t.mining.zumZiel} />
      </section>
      <Karte className="mt-3 p-4"><ShareChart shares={m.shares} active={m.mining} /></Karte>

      {m.lastShare && (
        <>
          <GroupTitle aside={t.mining.difficulty(zahl(Number(m.lastShare.difficulty)))}>{t.mining.letzterShare}</GroupTitle>
          <Panel><Hash value={m.lastShare.hash} className="text-[12.5px] leading-[1.75]" /></Panel>
        </>
      )}

      <GroupTitle>{t.mining.aktivitaet}</GroupTitle>
      <Panel className="!py-1">
        {aktiv.length === 0 ? (
          <p className="py-3 text-[13px] font-semibold text-dim">{t.mining.nochKeine}</p>
        ) : aktiv.map((sh, i) => (
          <div key={sh.at + '-' + i} className="flex items-center gap-3 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
            <span className={`h-2 w-2 shrink-0 rounded-full ${sh.isBlock ? 'bg-proof' : sh.accepted ? 'bg-work' : 'bg-risk'}`} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13.5px] font-bold">{sh.isBlock ? t.fund.titel : t.mining.shareAngenommen}</span>
              <span className="text-[11.5px] font-semibold text-faint">
                {t.mining.difficulty(zahl(Math.round(sh.achieved)))}{sh.achieved >= sh.required ? ` · ${t.mining.ueberZiel}` : ''}
              </span>
            </span>
            <span className="tnum font-mono text-[12px] text-dim">
              {new Date(sh.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
      </Panel>

      <Blatt offen={erweitert} onSchliessen={() => setErweitert(false)} titel={t.miningNeu.erweitertTitel}>
        <div className="flex flex-col gap-5 pb-1">
          <Wahl titel={t.miningNeu.modus} text={t.miningNeu.modusText}>
            <Segment<'pool' | 'solo'> werte={[{ v: 'pool', text: t.mining.pool }, { v: 'solo', text: t.mining.solo }]}
                     wert={modus} onChange={v => pool.setModus(v)} label={t.miningNeu.modus}
                     disabled={m.mining || pool.prueft} />
          </Wahl>
          <Wahl titel={t.miningNeu.last} text={t.miningNeu.lastText}>
            <Segment werte={[25, 50, 75, 100].map(v => ({ v, text: `${v} %` }))}
                     wert={m.duty} onChange={v => m.setDuty(v)} label={t.miningNeu.last} />
          </Wahl>
          <Wahl titel={t.miningNeu.worker} zusatz={kerne ? t.miningNeu.vonKernen(kerne) : undefined}>
            <Segment werte={workerStufen.map(v => ({ v, text: String(v) }))}
                     wert={worker} onChange={v => setWorker(v)} label={t.miningNeu.worker}
                     disabled={m.mining} />
            {!m.mining && (
              <button type="button" onClick={() => { setErweitert(false); onBenchmark(); }}
                      className="mt-2 self-start text-[12.5px] font-extrabold text-work">
                {bench ? t.mining.kalibrierung(bench.besteWorker) : t.mining.kalibrieren}
              </button>
            )}
          </Wahl>
          {m.mining && <p className="text-[12px] font-semibold text-faint">{t.miningNeu.gesperrtBeimMinen}</p>}
          <button type="button" onClick={() => setErweitert(false)}
                  className="flex h-14 w-full items-center justify-center rounded-full bg-text text-[15.5px] font-semibold text-ink">
            {t.allgemein.fertig}
          </button>
        </div>
      </Blatt>
    </>
  );
}

function Feld({ name, wert }: { name: string; wert: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 py-1">
      <span className="truncate text-[11.5px] text-dim">{name}</span>
      <span className="tnum truncate font-mono text-[13.5px]">{wert}</span>
    </div>
  );
}

function Wahl({ titel, text, zusatz, children }: {
  titel: string; text?: string; zusatz?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-extrabold">
        {titel}{zusatz && <span className="ml-1.5 font-semibold text-faint">{zusatz}</span>}
      </span>
      {children}
      {text && <span className="text-[12px] font-semibold leading-[1.45] text-dim">{text}</span>}
    </div>
  );
}
