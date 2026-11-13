'use client';

import { useEffect, useRef } from 'react';
import { useT } from '@/i18n';
import { Icon } from '@/components/ui/Primitives';
import { Zeichen } from '@/components/ui/Marke';
import { hashrateTeile } from '@/lib/format/hashrate';
import { useEinnahmen, heuteDazu } from '@/lib/wallet/useEinnahmen';
import { betragZahl } from '@/lib/wallet/betrag';
import { haptik } from '@/lib/telegram/webapp';
import { TARGET_BLOCK_TIME } from '@/lib/core/params';
import Ufer from '@/components/mining/Ufer';
import type { useMining } from '@/hooks/useMining';
import type { PoolAuswahl } from '@/hooks/usePoolAuswahl';
import type { HistoryEintrag } from '@/components/tabs/WalletTab';

/**
 * "Minen" -- der Startbildschirm im Design "Erstes Licht" (November 2026).
 *
 * Oben die Buehne: der Fjord der Website, am Ufer ein Licht je aktivem
 * Miner, eines davon das eigene (Ufer.tsx). Darunter steht vorn, was der
 * Nutzer wissen will: was er heute verdient hat und womit er rechnen kann.
 * Die eigene Leistung ist eine von drei Kennzahlen. Die Last wird nicht mehr
 * hier eingestellt, sondern unter "Erweitert" (MiningTab); die Zeile "Last ·
 * Worker" fuehrt dorthin. Die Einzelheiten (Pool, Schaetzung, Shares) stehen
 * darunter, im Teil "Mining" (MiningTab).
 */

type Mining = ReturnType<typeof useMining>;

function heuteEingang(history: HistoryEintrag[] | undefined, dec: number): number {
  if (!history) return 0;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return history
    .filter(e => e.kind !== 'out' && e.timestamp && Number(e.timestamp) * 1000 >= start.getTime())
    .reduce((s, e) => s + Number(e.amount), 0) / 10 ** dec;
}

export default function MineTab({ m, dec, sym, pool, gesichert, poolName, worker, hinweis, meldungen, onStartStopp, onSichern, onEinstellungen, onPoolWaehlen, onErweitert }: {
  m: Mining; dec: number; sym: string; pool: PoolAuswahl; gesichert: boolean;
  poolName: string | null; worker: number;
  /** Schmale, schliessbare Zeile unter der Buehne (Aktion). Die Sicherung geht vor. */
  hinweis?: React.ReactNode;
  /** Verbindung und Update: unter der Buehne, damit der Kopf an seinem Platz bleibt. */
  meldungen?: React.ReactNode;
  onStartStopp: () => void; onSichern: () => void; onEinstellungen: () => void; onPoolWaehlen: () => void;
  /** Oeffnet "Erweitert" (Last, Worker, Modus). */
  onErweitert: () => void;
}) {
  const { t, zahl, locale } = useT();

  const account = m.account as ({ address?: string; history?: HistoryEintrag[] } | null);
  const genau = heuteDazu(useEinnahmen(account?.address ?? null,
    account?.history?.[0] ? `${account.history[0].txid}:${account.history[0].kind}` : ''));
  const heute = genau !== null ? betragZahl(genau, dec) : heuteEingang(account?.history, dec);
  const heuteText = heute > 0 ? `+${zahl(heute, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : zahl(0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const minuten = m.seit ? Math.max(0, Math.round((Date.now() - m.seit) / 60000)) : 0;
  const r = hashrateTeile(m.hashrate, locale);
  const imPool = pool.modus === 'pool';
  // Neuer Nutzer ohne gewaehlten Pool: erst den Pool waehlen, dann starten.
  const mussWaehlen = !m.mining && imPool && !pool.gewaehlt;
  const name = poolName ?? pool.gewaehlt?.name ?? null;

  // Womit der Nutzer rechnen kann -- dieselbe Schaetzung wie im Teil "Mining":
  // eigener Anteil an der Pool-Leistung mal Belohnung, abzueglich Gebuehr. Und
  // wie oft der Pool im Schnitt einen Block findet: Zielzeit mal Netz durch Pool.
  const ps = pool.gewaehlt?.stand ?? null;
  const poolRate = ps?.hashrate ?? m.poolInfo?.hashrate ?? null;
  const feeBps = ps?.feeBps ?? m.poolInfo?.feeBps ?? null;
  const reward = Number(m.summary?.nextReward ?? 0) / 10 ** dec;
  const anteil = m.mining && poolRate && poolRate > 0 && m.hashrate > 0
    ? Math.min(1, m.hashrate / poolRate) * reward * (1 - (feeBps ?? 0) / 10_000) : null;
  const netzRate = m.summary?.hashrate ?? null;
  const abstand = poolRate && poolRate > 0 && netzRate && netzRate > 0
    ? Math.max(1, Math.round(Number(TARGET_BLOCK_TIME) / 60 * Math.max(1, netzRate / poolRate))) : null;
  const erwartung = !imPool ? t.licht.solo
    : anteil !== null && anteil > 0 && abstand !== null
      ? t.licht.erwartung(zahl(abstand), zahl(anteil, { maximumFractionDigits: anteil < 0.01 ? 6 : anteil < 1 ? 4 : 2 }), sym)
      : t.licht.erwartungOffen;

  const lichter = m.summary?.activeMiners ?? 0;

  // Angenommener Share: ein leichter Tipp in der Hand, nur waehrend die App offen ist.
  const sharesVorher = useRef(m.sharesZahl);
  useEffect(() => {
    if (m.mining && m.sharesZahl > sharesVorher.current) haptik('tipp');
    sharesVorher.current = m.sharesZahl;
  }, [m.sharesZahl, m.mining]);

  return (
    <>
      <Ufer lichter={lichter} mein={m.mining ? 'an' : 'aus'} schild={m.mining ? t.licht.deinLicht : t.licht.deinPlatz} share={m.sharesZahl} />

      <header className="relative flex h-11 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Zeichen g={26} />
          <span className="pt-px text-[14px] font-semibold tracking-[.2em]">YSKAR</span>
        </div>
        <div className="flex items-center gap-2.5">
          {m.summary?.height != null && (
            <span className="flex items-center gap-2 font-mono text-[13px] tnum">
              <span className="h-[7px] w-[7px] rounded-full bg-cyan" aria-hidden="true" />{zahl(m.summary.height)}
            </span>
          )}
          <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-text shadow-[inset_0_0_0_1px_rgb(238_244_255/.26)] active:scale-95">
            {Icon.Zahnrad}
          </button>
        </div>
      </header>

      {/* Fenster auf die Buehne: hier steht nur das Ufer. */}
      <div className="h-[172px]" aria-hidden="true" />

      {meldungen}
      {!gesichert && (
        <button type="button" onClick={onSichern}
                className="relative mb-4 flex min-h-12 w-full items-center gap-3 rounded-full bg-ink/60 px-4 text-left text-[14px] shadow-[inset_0_0_0_1px_rgb(255_196_122/.4)] backdrop-blur">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lamp" />
          <span className="flex-1 font-medium text-text">{t.rd.sicher.titel}</span>
          <span className="font-mono text-[13px] text-lamp">{t.rd.sicher.zeit}</span>
        </button>
      )}
      {gesichert && hinweis}

      {m.mining ? (<>
        <p className="flex items-center gap-[9px] text-[14px] font-medium text-lamp">
          <span className="h-[7px] w-[7px] rounded-full bg-lamp" aria-hidden="true" />{t.licht.seit(minuten)}
        </p>
        <p className="mt-4 text-[13.5px] font-medium text-dim">{t.rd.mine.heute}</p>
        <p className="mt-2 flex items-baseline gap-2.5">
          <span className="zahl-gross text-[80px] leading-[.92]">{ganzUndBruch(heuteText)}</span>
          <span className="font-mono text-[15px] text-lese">{sym}</span>
        </p>
        <p className="mt-3.5 text-[15px] leading-[1.45] text-lese">{erwartung}</p>
      </>) : (<>
        <p className="flex items-center gap-[9px] text-[14px] font-medium text-lese">
          <span className="h-[7px] w-[7px] rounded-full shadow-[inset_0_0_0_1.5px_rgb(var(--lese))]" aria-hidden="true" />{t.licht.keinLicht}
        </p>
        <h1 className="aussage mt-3.5 text-[80px] leading-[.9] tracking-[-.055em]">{t.licht.bereit}</h1>
        <p className="mt-4 text-[15px] leading-[1.45] text-lese">
          {mussWaehlen ? t.licht.waehlen : imPool && name ? t.licht.bereitPool(name, lichter + 1) : t.licht.bereitSolo(lichter + 1)}
        </p>
      </>)}

      <div className="mt-[18px] grid grid-cols-3 border-y border-line">
        {m.mining
          ? <Wert name={t.licht.leistung} wert={`${r.wert} ${r.einheit}`} />
          : <Wert name={t.rd.mine.heute} wert={heuteText} />}
        <Wert name={t.rd.mine.shares} wert={zahl(m.sharesZahl)} />
        {imPool
          ? <Wert name={t.rd.mine.pool} wert={name ?? '—'} klein onClick={m.mining ? undefined : onPoolWaehlen} />
          : <Wert name={t.rd.mine.pool} wert={t.rd.mine.solo} klein />}
      </div>
      <button type="button" onClick={onErweitert}
              className="flex min-h-[54px] w-full items-center gap-3.5 border-b border-line text-left active:opacity-70">
        <span className="flex-1 text-[16px] font-medium">{t.licht.last(m.duty, worker)}</span>
        <span className="text-[14px] text-lese">{t.licht.anpassen}</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-dim" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
      </button>

      <div className="mt-6">
        {mussWaehlen ? (
          <button type="button" onClick={onPoolWaehlen} className={knopfWarm}>
            {t.rd.mine.poolWaehlen}<Pfeil />
          </button>
        ) : m.mining ? (
          <button type="button" onClick={onStartStopp}
                  className="flex h-14 w-full items-center justify-center rounded-full text-[17px] font-semibold tracking-[-.01em] shadow-[inset_0_0_0_1px_rgb(238_244_255/.42)] active:scale-[.985]">
            {t.rd.mine.stopp}
          </button>
        ) : (
          <button type="button" onClick={onStartStopp} disabled={imPool && (pool.gesperrt || pool.prueft)} className={knopfWarm}>
            {t.rd.mine.start}<Pfeil />
          </button>
        )}
      </div>
    </>
  );
}

const knopfWarm = 'flex h-14 w-full items-center justify-center gap-[9px] rounded-full bg-lamp text-[17px] font-semibold tracking-[-.01em] text-lamp-ink active:scale-[.985] disabled:opacity-40';

function Pfeil() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

function ganzUndBruch(wert: string) {
  const i = Math.max(wert.lastIndexOf('.'), wert.lastIndexOf(','));
  if (i < 0) return wert;
  return <>{wert.slice(0, i)}<span className="bruch">{wert.slice(i)}</span></>;
}

function Wert({ name, wert, gruen, klein, onClick }: { name: string; wert: string; gruen?: boolean; klein?: boolean; onClick?: () => void }) {
  const K = onClick ? 'button' : 'div';
  return (
    <K onClick={onClick} className="flex min-w-0 flex-col gap-1.5 py-3.5 text-left [&:not(:first-child)]:border-l [&:not(:first-child)]:border-line [&:not(:first-child)]:pl-3.5">
      <span className="text-[12.5px] text-dim">{name}</span>
      <span className={`tnum truncate ${klein ? 'text-[15.5px] font-medium' : 'font-mono text-[16.5px]'} ${gruen ? 'text-proof' : ''} ${onClick ? 'text-cyan' : ''}`}>{wert}</span>
    </K>
  );
}
