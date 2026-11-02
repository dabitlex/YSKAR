'use client';

import { useEffect, useRef } from 'react';
import { useT } from '@/i18n';
import { hashrateTeile } from '@/lib/format/hashrate';
import { useEinnahmen, heuteDazu } from '@/lib/wallet/useEinnahmen';
import { betragZahl } from '@/lib/wallet/betrag';
import { haptik } from '@/lib/telegram/webapp';
import { istTelegram } from '@/lib/native/plattform';
import { COMMUNITY } from '@/lib/community';
import { ExternLink } from '@/components/ui/ExternLink';
import { Flaeche, Knopf, Etikett, Segment, Kennzahl, KennzahlRaster, Hinweis, Liste, Zeile } from '@/components/ys';
import { LeistungsRing } from '@/components/mining/LeistungsRing';
import { PoolZeile } from '@/components/mining/PoolZeile';
import { anteilJeBlock, fehlerAnzeige } from '@/components/mining/anzeige';
import type { useMining } from '@/hooks/useMining';
import type { PoolAuswahl } from '@/hooks/usePoolAuswahl';
import type { HistoryEintrag } from '@/components/tabs/WalletTab';

/**
 * Mining -- die Hauptansicht (Redesign Paket 3, November 2026).
 *
 * Eine Hauptaktion (Starten, Pool waehlen oder Stoppen), alles andere leise
 * (Konzept C). Von oben nach unten:
 *
 *   Ring        eigene Leistung und Zustand; darunter der EINE Regler fuer
 *               die Last (25/50/75/100 %)
 *   Kennzahlen  heute verdient, Shares, Laufzeit
 *   Pool        Name, Plaetze, Gebuehr -- waehrend des Minings die Schaetzung
 *   Hauptknopf  und darunter, waehrend gemint wird, der Hinweis zum Bildschirm
 *   Details     Ebene 2: Shares, Aktivitaet, Modus, Worker, Benchmark
 *   Mehr Leistung: Die Mini App ist der Einstieg; richtig mint man am PC
 *               (Node Core, CPU und GPU) oder auf Rigs (HiveOS).
 *
 * An Mining, Pool-Auswahl und Abfragen aendert dieser Bildschirm nichts: Er
 * ruft nur, was AppShell und useMining ihm geben.
 */

type Mining = ReturnType<typeof useMining>;
const STUFEN = [25, 50, 75, 100] as const;

function heuteEingang(history: HistoryEintrag[] | undefined, dec: number): number {
  if (!history) return 0;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return history
    .filter(e => e.kind !== 'out' && e.timestamp && Number(e.timestamp) * 1000 >= start.getTime())
    .reduce((s, e) => s + Number(e.amount), 0) / 10 ** dec;
}

export default function MineTab({ m, dec, sym, pool, gesichert, poolName, kopfzeile, hinweis, wach,
                                  onStartStopp, onSichern, onPoolWaehlen, onDetails }: {
  m: Mining; dec: number; sym: string; pool: PoolAuswahl; gesichert: boolean;
  poolName: string | null;
  /** Gemeinsame Kopfzeile (Statuszeichen, Gruss, Zahnrad) aus AppShell. */
  kopfzeile: React.ReactNode;
  /** Schmale, schliessbare Zeile unter dem Gruss (Aktion). Die Sicherung geht vor. */
  hinweis?: React.ReactNode;
  wach: 'aus' | 'aktiv' | 'nicht_moeglich';
  onStartStopp: () => void; onSichern: () => void; onPoolWaehlen: () => void; onDetails: () => void;
}) {
  const { t, zahl, locale } = useT();
  const y = t.ys.mining;

  const account = m.account as ({ address?: string; history?: HistoryEintrag[] } | null);
  const genau = heuteDazu(useEinnahmen(account?.address ?? null,
    account?.history?.[0] ? `${account.history[0].txid}:${account.history[0].kind}` : ''));
  const heute = genau !== null ? betragZahl(genau, dec) : heuteEingang(account?.history, dec);

  const minuten = m.seit ? Math.max(0, Math.round((Date.now() - m.seit) / 60000)) : 0;
  const r = hashrateTeile(m.hashrate, locale);
  // Neuer Nutzer ohne gewaehlten Pool: erst den Pool waehlen, dann starten.
  const mussWaehlen = !m.mining && pool.modus === 'pool' && !pool.gewaehlt;

  // Angenommener Share: ein leichter Tipp in der Hand, nur waehrend die App offen ist.
  const sharesVorher = useRef(m.sharesZahl);
  useEffect(() => {
    if (m.mining && m.sharesZahl > sharesVorher.current) haptik('tipp');
    sharesVorher.current = m.sharesZahl;
  }, [m.sharesZahl, m.mining]);

  // Pool-Schaetzung und Fehlermeldung: dieselben Regeln wie vorher (anzeige.ts).
  const ps = pool.gewaehlt?.stand ?? null;
  const anteil = anteilJeBlock({
    mining: m.mining, hashrate: m.hashrate,
    poolRate: ps?.hashrate ?? m.poolInfo?.hashrate ?? null,
    belohnung: Number(m.summary?.nextReward ?? 0) / 10 ** dec,
    feeBps: ps?.feeBps ?? m.poolInfo?.feeBps ?? null,
  });
  const fehler = fehlerAnzeige({
    fehler: m.fehler, mining: m.mining, modus: pool.modus,
    vollGezeigt: pool.hinweis === 'voll' || (!!ps && ps.status === 'voll' && !ps.dabei),
    ueberholt: pool.ueberholt, poolOffen: ps?.status === 'offen',
  });

  const bildschirm = m.dienst?.ok
    ? (m.dienst.notifications ? t.mining.hintergrund : t.mining.hintergrundOhne)
    : m.dienst && !m.dienst.ok ? t.mining.dienstFehler(m.dienst.fehler)
    : istTelegram() ? t.miningNeu.offenLassen
    : wach === 'aktiv' ? t.mining.wach : wach === 'nicht_moeglich' ? t.mining.wachNicht : t.mining.wachAus;

  const bruch = (wert: string) => {
    const i = Math.max(wert.lastIndexOf('.'), wert.lastIndexOf(','));
    return i < 0 ? wert : <>{wert.slice(0, i)}<span className="text-faint">{wert.slice(i)}</span></>;
  };

  return (
    <>
      {kopfzeile}

      <div className="flex flex-col gap-4">
        {!gesichert ? (
          <button type="button" onClick={onSichern}
                  className="flex min-h-12 w-full items-center gap-3 rounded-sm border border-amber/30 bg-amber/[.06] px-4 text-left">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber" />
            <span className="flex-1 text-ys-klein font-medium">{t.rd.sicher.titel}</span>
            <span className="font-mono text-ys-meta text-amber">{t.rd.sicher.zeit}</span>
          </button>
        ) : hinweis}

        <Flaeche className="flex flex-col items-center gap-4 px-4 pb-4 pt-5">
          <LeistungsRing aktiv={m.mining} last={m.duty}>
            {m.mining ? (<>
              <span className="flex items-center gap-2 text-ys-meta text-cyan">
                <span aria-hidden="true" className="puls h-1.5 w-1.5 rounded-full bg-cyan" />{t.rd.mine.minen(minuten)}
              </span>
              <span className="tnum text-ys-anzeige font-light">{bruch(r.wert)}</span>
              <span className="font-mono text-ys-meta text-dim">{t.rd.mine.lastZeile(r.einheit, m.duty)}</span>
            </>) : mussWaehlen ? (<>
              <span className="text-ys-meta text-dim">{t.rd.mine.nichtAktiv}</span>
              <span className="text-ys-abschnitt font-semibold">{t.rd.mine.waehlenTitel}</span>
              <span className="text-ys-meta text-dim">{t.rd.mine.waehlenText}</span>
            </>) : (<>
              <span className="text-ys-meta text-dim">{t.mining.gestoppt}</span>
              <span className="text-ys-seite font-semibold">{t.rd.mine.bereit}</span>
              <span className="text-ys-meta text-dim">{pool.modus === 'pool' ? t.rd.mine.bereitPool : t.rd.mine.bereitSolo}</span>
            </>)}
          </LeistungsRing>
          <div className="flex w-full flex-col gap-2">
            <Etikett>{y.leistung}</Etikett>
            <Segment label={y.leistung} wert={m.duty} onChange={v => m.setDuty(v)}
                     werte={STUFEN.map(v => ({ v: v as number, text: `${v} %` }))} />
          </div>
        </Flaeche>

        <KennzahlRaster>
          <Kennzahl name={t.rd.mine.heute} ton={heute > 0 ? 'erfolg' : undefined}
                    wert={heute > 0 ? `+${zahl(heute, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '0'} />
          <Kennzahl name={t.rd.mine.shares} wert={zahl(m.sharesZahl)} />
          <Kennzahl name={y.laufzeit} wert={m.mining ? y.minuten(minuten) : '—'} />
        </KennzahlRaster>

        <PoolZeile pool={pool} mining={m.mining} anteil={anteil} sym={sym} poolName={poolName}
                   onOeffnen={onPoolWaehlen} onDetails={onDetails} />

        {m.stumm && !m.fehler && <Hinweis ton="gefahr">{t.mining.stumm}</Hinweis>}
        {fehler && <Hinweis ton="gefahr">{fehler.art === 'voll' ? t.pool.vollText : fehler.text}</Hinweis>}

        <div className="flex flex-col gap-2">
          {mussWaehlen ? (
            <Knopf onClick={onPoolWaehlen}>{t.rd.mine.poolWaehlen}</Knopf>
          ) : m.mining ? (
            <Knopf art="zweit" onClick={onStartStopp}>{t.rd.mine.stopp}</Knopf>
          ) : (
            <Knopf onClick={onStartStopp} disabled={pool.modus === 'pool' && (pool.gesperrt || pool.prueft)}>{t.rd.mine.start}</Knopf>
          )}
          {m.mining && <p className="px-1 text-center text-ys-meta text-dim">{bildschirm}</p>}
        </div>

        <Liste>
          <Zeile titel={y.details} unter={y.detailsUnter} onClick={onDetails} />
        </Liste>

        <section aria-label={y.mehrTitel} className="flex flex-col gap-2 rounded-md border border-[rgb(var(--haar)/.12)] p-4">
          <Etikett as="h2">{y.mehrTitel}</Etikett>
          <p className="text-ys-fliess font-medium">{y.mehrEinstieg}</p>
          <p className="text-ys-klein text-lese">{y.mehrText}</p>
          <ExternLink href={COMMUNITY.mining} className="flex min-h-11 items-center text-ys-klein font-medium text-cyan">
            {y.mehrLink} ↗
          </ExternLink>
        </section>
      </div>
    </>
  );
}
