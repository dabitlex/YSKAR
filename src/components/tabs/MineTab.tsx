'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { Icon } from '@/components/ui/Primitives';
import { Zeichen } from '@/components/ui/Marke';
import { hashrateTeile } from '@/lib/format/hashrate';
import { useEinnahmen, heuteDazu } from '@/lib/wallet/useEinnahmen';
import { betragZahl } from '@/lib/wallet/betrag';
import { telegramNutzer, haptik, type TgNutzer } from '@/lib/telegram/webapp';
import type { useMining } from '@/hooks/useMining';
import type { PoolAuswahl } from '@/hooks/usePoolAuswahl';
import type { HistoryEintrag } from '@/components/tabs/WalletTab';

/**
 * "Mine" -- der Startbildschirm seit dem Redesign (Oktober 2026).
 *
 * Home und Mining sind hier zusammengelegt. Oben der Gruss, darunter der
 * Ring: Er zeigt die eingestellte Last (25/50/75/100 %) und ist zugleich
 * ihr Regler -- man zieht den Knopf am Ring entlang, er rastet auf den vier
 * Stufen ein. In der Mitte die eigene Leistung, darunter die Hashes, die das
 * Telefon gerade rechnet. Die Einzelheiten (Pool, Schaetzung, Shares)
 * stehen darunter, im Teil "Mining" (MiningTab).
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

export default function MineTab({ m, dec, pool, gesichert, poolName, onStartStopp, onSichern, onEinstellungen, onPoolWaehlen }: {
  m: Mining; dec: number; pool: PoolAuswahl; gesichert: boolean;
  poolName: string | null;
  onStartStopp: () => void; onSichern: () => void; onEinstellungen: () => void; onPoolWaehlen: () => void;
}) {
  const { t, zahl } = useT();
  const [nutzer, setNutzer] = useState<TgNutzer | null>(null);
  useEffect(() => { setNutzer(telegramNutzer()); }, []);

  const account = m.account as ({ address?: string; history?: HistoryEintrag[] } | null);
  const genau = heuteDazu(useEinnahmen(account?.address ?? null,
    account?.history?.[0] ? `${account.history[0].txid}:${account.history[0].kind}` : ''));
  const heute = genau !== null ? betragZahl(genau, dec) : heuteEingang(account?.history, dec);

  const stunde = new Date().getHours();
  const gruss = stunde < 11 ? t.home.morgen : stunde < 18 ? t.home.tag : t.home.abend;
  const minuten = m.seit ? Math.max(0, Math.round((Date.now() - m.seit) / 60000)) : 0;
  const r = hashrateTeile(m.hashrate);
  // Neuer Nutzer ohne gewaehlten Pool: erst den Pool waehlen, dann starten.
  const mussWaehlen = !m.mining && pool.modus === 'pool' && !pool.gewaehlt;

  // Angenommener Share: ein leichter Tipp in der Hand, nur waehrend die App offen ist.
  const sharesVorher = useRef(m.sharesZahl);
  useEffect(() => {
    if (m.mining && m.sharesZahl > sharesVorher.current) haptik('tipp');
    sharesVorher.current = m.sharesZahl;
  }, [m.sharesZahl, m.mining]);

  return (
    <>
      <header className="relative mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {nutzer?.foto
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={nutzer.foto} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
            : <Zeichen g={30} />}
          <div className="flex flex-col leading-[1.25]">
            <span className="text-[12.5px] text-dim">{gruss}</span>
            <span className="text-[16px] font-semibold">{nutzer?.vorname ?? t.home.beiYskar}</span>
          </div>
        </div>
        <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(140_170_255/.22)] text-text active:scale-95">
          {Icon.Zahnrad}
        </button>
      </header>

      {!gesichert && (
        <button type="button" onClick={onSichern}
                className="relative mb-2 flex min-h-12 w-full items-center gap-3 rounded-[16px] border border-amber/25 bg-amber/[.07] px-4 text-left text-[14px] text-[#FFE3B8]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
          <span className="flex-1 font-medium text-white">{t.rd.sicher.titel}</span>
          <span className="font-mono text-[13px] text-amber">{t.rd.sicher.zeit}</span>
        </button>
      )}

      <LastRing aktiv={m.mining} last={m.duty} onLast={v => m.setDuty(v)}>
        {m.mining ? (<>
          <span className="flex items-center gap-2 text-[13px] text-cyan"><span className="puls h-1.5 w-1.5 rounded-full bg-cyan" />{t.rd.mine.minen(minuten)}</span>
          <span className="zahl-gross text-[60px]">{ganzUndBruch(r.wert)}</span>
          <span className="font-mono text-[13px] text-dim">{t.rd.mine.lastZeile(r.einheit, m.duty)}</span>
        </>) : mussWaehlen ? (<>
          <span className="flex items-center gap-2 text-[13px] text-dim"><span className="h-1.5 w-1.5 rounded-full bg-faint" />{t.rd.mine.nichtAktiv}</span>
          <span className="text-[26px] font-semibold tracking-[-0.03em]">{t.rd.mine.waehlenTitel}</span>
          <span className="max-w-[180px] text-[13.5px] leading-[1.4] text-dim">{t.rd.mine.waehlenText}</span>
        </>) : (<>
          <span className="flex items-center gap-2 text-[13px] text-dim"><span className="h-1.5 w-1.5 rounded-full bg-faint" />{t.mining.gestoppt}</span>
          <span className="text-[30px] font-semibold tracking-[-0.035em]">{t.rd.mine.bereit}</span>
          <span className="max-w-[170px] text-[13.5px] leading-[1.4] text-dim">
            {pool.modus === 'pool' ? t.rd.mine.bereitPool : t.rd.mine.bereitSolo}
          </span>
        </>)}
      </LastRing>

      <div className="relative mt-3 flex flex-col items-center gap-1">
        {m.mining && m.lastShare ? <HashBand neu={m.lastShare.hash} /> : null}
        <span className="text-[12.5px] text-dim">{t.rd.mine.ziehen}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 border-y border-line">
        <Wert name={t.rd.mine.heute} wert={heute > 0 ? `+${zahl(heute, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '0'} gruen={heute > 0} />
        <Wert name={t.rd.mine.shares} wert={zahl(m.sharesZahl)} />
        {pool.modus === 'pool'
          ? <Wert name={t.rd.mine.pool} wert={poolName ?? pool.gewaehlt?.name ?? '—'} klein onClick={m.mining ? undefined : onPoolWaehlen} />
          : <Wert name={t.rd.mine.pool} wert={t.rd.mine.solo} klein />}
      </div>

      <div className="mt-4">
        {mussWaehlen ? (
          <button type="button" onClick={onPoolWaehlen}
                  className="flex h-14 w-full items-center justify-between rounded-full bg-text pl-[26px] pr-2 text-[15.5px] font-semibold text-ink active:scale-[.985]">
            {t.rd.mine.poolWaehlen}<Pfeilkreis />
          </button>
        ) : m.mining ? (
          <button type="button" onClick={onStartStopp}
                  className="flex h-14 w-full items-center justify-center rounded-full border border-[rgb(140_170_255/.22)] text-[15.5px] font-semibold active:scale-[.985]">
            {t.rd.mine.stopp}
          </button>
        ) : (
          <button type="button" onClick={onStartStopp} disabled={pool.modus === 'pool' && (pool.gesperrt || pool.prueft)}
                  className="flex h-14 w-full items-center justify-between rounded-full bg-text pl-[26px] pr-2 text-[15.5px] font-semibold text-ink active:scale-[.985] disabled:opacity-40">
            {t.rd.mine.start}<Pfeilkreis />
          </button>
        )}
      </div>
    </>
  );
}

function ganzUndBruch(wert: string) {
  const i = Math.max(wert.lastIndexOf('.'), wert.lastIndexOf(','));
  if (i < 0) return wert;
  return <>{wert.slice(0, i)}<span className="bruch">{wert.slice(i)}</span></>;
}

export function Pfeilkreis() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-text">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  );
}

function Wert({ name, wert, gruen, klein, onClick }: { name: string; wert: string; gruen?: boolean; klein?: boolean; onClick?: () => void }) {
  const K = onClick ? 'button' : 'div';
  return (
    <K onClick={onClick} className="flex min-w-0 flex-col gap-1.5 py-3.5 text-left [&:not(:first-child)]:border-l [&:not(:first-child)]:border-line [&:not(:first-child)]:pl-3.5">
      <span className="text-[12px] text-dim">{name}</span>
      <span className={`tnum truncate ${klein ? 'text-[15px]' : 'font-mono text-[17px]'} ${gruen ? 'text-proof' : ''} ${onClick ? 'text-cyan' : ''}`}>{wert}</span>
    </K>
  );
}

/** Die zuletzt gerechneten Hashes laufen unter dem Ring durch. */
function HashBand({ neu }: { neu: string }) {
  const [liste, setListe] = useState<string[]>([neu]);
  useEffect(() => { setListe(l => (l[l.length - 1] === neu ? l : [...l.slice(-3), neu])); }, [neu]);
  const kurz = (h: string) => `${h.slice(0, 12)}…${h.slice(-8)}`;
  return <span className="font-mono text-[12px] text-faint">{kurz(liste[liste.length - 1])}</span>;
}

/**
 * Der Ring ist der Last-Regler. Ziehen (oder Tippen) am Ring setzt die
 * naechste der vier Stufen; Pfeiltasten gehen auch.
 */
function LastRing({ aktiv, last, onLast, children }: {
  aktiv: boolean; last: number; onLast: (v: number) => void; children: React.ReactNode;
}) {
  const { t } = useT();
  const c = 150, R = 118, U = 2 * Math.PI * R;
  const ref = useRef<SVGSVGElement>(null);
  const zieht = useRef(false);
  const anteil = last / 100;
  const ende = (anteil * 360 - 90) * Math.PI / 180;
  const kx = c + R * Math.cos(ende), ky = c + R * Math.sin(ende);

  const setzen = useCallback((x: number, y: number) => {
    const el = ref.current; if (!el) return;
    const b = el.getBoundingClientRect();
    const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
    let w = Math.atan2(dy, dx) * 180 / Math.PI + 90; if (w < 0) w += 360;
    const roh = w / 360 * 100;
    const stufe = STUFEN.reduce((a, s) => Math.abs(s - roh) < Math.abs(a - roh) ? s : a, STUFEN[0] as number);
    // 0 Grad oben ist 100 %: ganz oben einrasten statt auf 25 zu springen.
    const ziel = roh > 88 || roh < 12 ? 100 : stufe;
    if (ziel !== last) { onLast(ziel); haptik('auswahl'); }
  }, [last, onLast]);

  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 - 90) * Math.PI / 180, l = i % 18 === 0 ? 7 : i % 6 === 0 ? 5 : 3, r1 = 131;
    ticks.push(<line key={i} x1={c + r1 * Math.cos(a)} y1={c + r1 * Math.sin(a)} x2={c + (r1 + l) * Math.cos(a)} y2={c + (r1 + l) * Math.sin(a)} />);
  }
  return (
    <div className="relative mx-auto my-[-6px] h-[300px] w-[300px] max-w-full touch-none select-none">
      <svg ref={ref} viewBox="0 0 300 300" width="300" height="300" overflow="visible" className="absolute inset-0 h-full w-full"
           role="slider" aria-label={t.rd.mine.ringLabel(last)} aria-valuemin={25} aria-valuemax={100} aria-valuenow={last} tabIndex={0}
           onKeyDown={e => {
             const i = STUFEN.indexOf(last as typeof STUFEN[number]);
             if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onLast(STUFEN[Math.min(3, i + 1)]);
             if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onLast(STUFEN[Math.max(0, i - 1)]);
           }}
           onPointerDown={e => { zieht.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setzen(e.clientX, e.clientY); }}
           onPointerMove={e => { if (zieht.current) setzen(e.clientX, e.clientY); }}
           onPointerUp={() => { zieht.current = false; }} onPointerCancel={() => { zieht.current = false; }}>
        <defs><linearGradient id="ring-og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1B4FD1" /><stop offset=".6" stopColor="#2F7BFF" /><stop offset="1" stopColor="#63D8FF" /></linearGradient></defs>
        <g stroke={`rgba(140,170,255,${aktiv ? .3 : .18})`} strokeWidth="1.2">{ticks}</g>
        {STUFEN.map(p => {
          const a = (p * 3.6 - 90) * Math.PI / 180, r = p === 25 || p === 75 ? 142 : 147;
          return <text key={p} x={c + r * Math.cos(a)} y={c + r * Math.sin(a) + 4} textAnchor={p === 25 ? 'start' : p === 75 ? 'end' : 'middle'}
                       fontFamily="var(--font-mono), monospace" fontSize="10.5" fill={p === last ? '#F2F6FF' : '#5E6A86'}>{p}</text>;
        })}
        <circle cx={c} cy={c} r={R} fill="none" stroke="rgba(140,170,255,.10)" strokeWidth="6" />
        {aktiv
          ? <g className="ring-lauf"><circle cx={c} cy={c} r="102" fill="none" stroke="rgba(99,216,255,.28)" strokeWidth="1" strokeDasharray="2 9" /></g>
          : <circle cx={c} cy={c} r="102" fill="none" stroke="rgba(140,170,255,.12)" strokeWidth="1" strokeDasharray="2 9" />}
        <circle cx={c} cy={c} r={R} fill="none" stroke={aktiv ? 'url(#ring-og)' : 'rgba(140,170,255,.35)'} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(U * anteil).toFixed(1)} ${U.toFixed(1)}`} transform={`rotate(-90 ${c} ${c})`}
                style={{ transition: 'stroke-dasharray .25s ease' }} />
        <circle cx={kx} cy={ky} r="13" fill="#F2F6FF" stroke={aktiv ? '#2F7BFF' : '#5E6A86'} strokeWidth="4" style={{ cursor: 'grab' }} />
        <g stroke="#03060F" strokeWidth="1.4" strokeLinecap="round" opacity=".55">
          <line x1={kx - 3} y1={ky - 4} x2={kx - 3} y2={ky + 4} /><line x1={kx + 3} y1={ky - 4} x2={kx + 3} y2={ky + 4} />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">{children}</div>
    </div>
  );
}
