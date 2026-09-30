'use client';

import { useState } from 'react';
import { Panel, GroupTitle, ActionButton, Icon, Empty, Button }
  from '@/components/ui/Primitives';
import { TopBar } from '@/components/ui/Chrome';
import type { Account, Wartend } from '@/hooks/useMining';

/**
 * Wallet.
 *
 * Aufbau wie in Bank- und Wallet-Apps ueblich, und das aus gutem Grund:
 * Guthaben als Hauptflaeche ganz oben, Aktionen direkt daran, darunter der
 * Verlauf. Wer die App oeffnet, will genau in dieser Reihenfolge wissen,
 * was los ist.
 *
 */

export interface HistoryEintrag {
  txid: string; height: number; timestamp: string | null;
  kind: 'reward' | 'in' | 'out';
  counterparty: string | null; amount: string; fee: string;
  memo?: string | null;
}

function vorZeit(ts: string | null): string {
  if (!ts) return '';
  const s = Math.max(0, Date.now() / 1000 - Number(ts));
  if (s < 60) return `vor ${Math.round(s)} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} d`;
}

const kurz = (a: string | null) => a ? `${a.slice(0, 10)}…${a.slice(-4)}` : 'unbekannt';

export default function WalletTab({ account, symbol, decimals, address,
                                    onSenden, onScannen, onEmpfangen, onEinstellungen, onExplorer }: {
  account: (Account & { history?: HistoryEintrag[]; pending?: Wartend[] }) | null;
  symbol: string; decimals: number; address: string | null;
  onSenden: () => void; onScannen: () => void; onEmpfangen: () => void;
  onEinstellungen: () => void; onExplorer: () => void;
}) {
  // Ausgewaehlte Transaktion. Als Ueberlagerung und nicht als eigene Seite:
  // Man will danach wieder in derselben Liste stehen, an derselben Stelle.
  const [offen, setOffen] = useState<HistoryEintrag | null>(null);

  const guthaben = Number(account?.balance ?? 0) / 10 ** decimals;
  const [ganz, bruch] = guthaben.toFixed(4).split('.');
  const verlauf = account?.history ?? [];
  const wartend = account?.pending ?? [];
  const unterwegs = wartend.filter(p => p.kind === 'out')
    .reduce((s, p) => s + Number(p.amount) + Number(p.fee), 0) / 10 ** decimals;

  return (
    <>
      <TopBar titel="Wallet" rechts={
        <button onClick={onEinstellungen} aria-label="Einstellungen"
                className="flex h-9 w-9 items-center justify-center rounded-full border
                           border-line bg-surface text-dim">{Icon.Zahnrad}</button>
      } />

      <Panel tone="proof" className="rise">
        <div className="flex flex-col items-center text-center">
          <p className="label">Gesamtguthaben</p>
          <div className="mt-2 flex items-baseline gap-2 leading-none">
            <span className="tnum text-[42px] font-extrabold tracking-[-0.03em] text-text">
              {Number(ganz).toLocaleString('de-DE')}
              <span className="text-[24px] text-faint">,{bruch}</span>
            </span>
            <span className="text-[16px] font-bold text-faint">{symbol}</span>
          </div>
          {address && (
            <p className="mt-2 font-mono text-[12px] text-faint">{kurz(address)}</p>
          )}
          {unterwegs > 0 && (
            <p className="tnum mt-1.5 text-[12px] font-bold text-[#B26A00]">
              {unterwegs.toFixed(4)} {symbol} unterwegs, noch nicht bestätigt
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-1.5">
          <ActionButton icon={Icon.Senden} label="Senden" onClick={onSenden} tone="work" />
          <ActionButton icon={Icon.Empfangen} label="Empfangen" onClick={onEmpfangen} />
          <ActionButton icon={Icon.Scan} label="Scannen" onClick={onScannen} />
          <ActionButton icon={Icon.Verlauf} label="Explorer" onClick={onExplorer} />
        </div>
      </Panel>

      <GroupTitle aside={wartend.length
        ? `${wartend.length} ${wartend.length === 1 ? 'wartet' : 'warten'}`
        : verlauf.length ? `${verlauf.length} Einträge` : undefined}>
        Verlauf
      </GroupTitle>

      {verlauf.length === 0 && wartend.length === 0 ? (
        <Empty>
          Noch nichts passiert. Sobald du einen Block findest, steht er hier.
        </Empty>
      ) : (
        <Panel className="rise rise-1 !p-0">
          <ul className="divide-y divide-line">
            {wartend.map(p => (
              <Eintrag key={p.txid} art="wait"
                titel={p.kind === 'out' ? `An ${kurz(p.to)}` : `Von ${kurz(p.from)}`}
                unten={p.kind === 'out'
                  ? `wartet auf Bestätigung · Gebühr ${(Number(p.fee) / 10 ** decimals).toFixed(4)}`
                  : 'wartet auf Bestätigung · kommt mit dem nächsten Block'}
                betrag={`${p.kind === 'out' ? '−' : '+'}${(Number(p.amount) / 10 ** decimals).toFixed(4)}`} />
            ))}
            {verlauf.map(e => (
              <Eintrag key={e.txid}
                onClick={() => setOffen(e)}
                art={e.kind === 'out' ? 'out' : 'in'}
                titel={e.kind === 'reward' ? `Blockreward #${e.height}`
                  : e.kind === 'in' ? `Von ${kurz(e.counterparty)}`
                  : `An ${kurz(e.counterparty)}`}
                unten={vorZeit(e.timestamp) +
                  (e.kind === 'out' && Number(e.fee) > 0
                    ? ` · Gebühr ${(Number(e.fee) / 10 ** decimals).toFixed(4)}` : '')}
                betrag={`${e.kind === 'out' ? '−' : '+'}${
                  (Number(e.amount) / 10 ** decimals).toFixed(4)}`}
                gut={e.kind !== 'out'} />
            ))}
          </ul>
        </Panel>
      )}

      {offen && (
        <Detail eintrag={offen} decimals={decimals} symbol={symbol}
                onSchliessen={() => setOffen(null)} />
      )}
    </>
  );
}

/**
 * Einzelheiten zu einer Transaktion.
 *
 * Zeigt die vollstaendige Kennung und die vollstaendige Gegenadresse, nicht
 * die gekuerzte Fassung aus der Liste. Wer pruefen will, ob das Geld bei der
 * richtigen Adresse gelandet ist, muss alle Zeichen sehen -- gekuerzte
 * Adressen lassen sich faelschen, indem man Anfang und Ende trifft.
 */
function Detail({ eintrag, decimals, symbol, onSchliessen }: {
  eintrag: HistoryEintrag; decimals: number; symbol: string;
  onSchliessen: () => void;
}) {
  const [kopiert, setKopiert] = useState<string | null>(null);
  const betrag = Number(eintrag.amount) / 10 ** decimals;
  const gebuehr = Number(eintrag.fee) / 10 ** decimals;
  const eingang = eintrag.kind !== 'out';

  const kopiere = async (was: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(was);
      setTimeout(() => setKopiert(null), 1600);
    } catch { /* nicht ueberall erlaubt */ }
  };

  const titel = eintrag.kind === 'reward' ? 'Blockreward'
    : eintrag.kind === 'in' ? 'Empfangen' : 'Gesendet';

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-text/40 backdrop-blur-sm"
         onClick={onSchliessen}>
      <div className="rise max-h-[85dvh] overflow-y-auto rounded-t-[24px] bg-surface p-5
                      pb-[calc(20px+var(--unten))]"
           onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />

        <p className="label">{titel}</p>
        <div className="mt-1 flex items-baseline gap-2 leading-none">
          <span className={`tnum text-[32px] font-extrabold tracking-[-0.03em] ${
            eingang ? 'text-proof' : 'text-text'}`}>
            {eingang ? '+' : '−'}{betrag.toFixed(4)}
          </span>
          <span className="text-[15px] text-dim">{symbol}</span>
        </div>

        <dl className="mt-6">
          <Feld label="Status" wert={
            <span className="text-proof">In Block #{eintrag.height} bestätigt</span>} />
          <Feld label="Zeitpunkt" wert={
            eintrag.timestamp
              ? new Date(Number(eintrag.timestamp) * 1000).toLocaleString('de-DE')
              : '—'} />
          {eintrag.kind !== 'reward' && (
            <Feld label={eingang ? 'Von' : 'An'} mono umbruch
                  wert={eintrag.counterparty ?? 'unbekannt'}
                  onKopieren={eintrag.counterparty
                    ? () => kopiere('adresse', eintrag.counterparty!) : undefined}
                  kopiert={kopiert === 'adresse'} />
          )}
          {eintrag.kind === 'out' && gebuehr > 0 && (
            <Feld label="Netzgebühr" wert={`${gebuehr.toFixed(4)} ${symbol}`} />
          )}
          {eintrag.memo && (
            <Feld label="Notiz" wert={new TextDecoder().decode(
              Uint8Array.from(eintrag.memo.match(/../g) ?? [],
                              h => parseInt(h, 16)))} />
          )}
          <Feld label="Transaktion" mono umbruch wert={eintrag.txid}
                onKopieren={() => kopiere('txid', eintrag.txid)}
                kopiert={kopiert === 'txid'} />
        </dl>

        <div className="mt-6 space-y-3">
          <a href={`/explorer.html#block-${eintrag.height}`}
             className="block rounded-[14px] border border-line bg-surface py-3.5
                        text-center text-[15px] font-bold">
            Block im Explorer ansehen
          </a>
          <Button variant="quiet" onClick={onSchliessen}>Schließen</Button>
        </div>
      </div>
    </div>
  );
}

function Feld({ label, wert, mono, umbruch, onKopieren, kopiert }: {
  label: string; wert: React.ReactNode; mono?: boolean; umbruch?: boolean;
  onKopieren?: () => void; kopiert?: boolean;
}) {
  return (
    <div className="border-b border-line py-3 last:border-0">
      <dt className="flex items-baseline justify-between text-[12px] font-semibold text-faint">
        {label}
        {onKopieren && (
          <button onClick={onKopieren} className="font-bold text-work">
            {kopiert ? 'kopiert' : 'kopieren'}
          </button>
        )}
      </dt>
      <dd className={`mt-1 text-[13.5px] ${mono ? 'font-mono' : ''} ${
        umbruch ? 'break-all' : ''}`}>{wert}</dd>
    </div>
  );
}

function Eintrag({ art, titel, unten, betrag, gut, onClick }: {
  art: 'in' | 'out' | 'wait'; titel: string; unten: string;
  betrag: string; gut?: boolean; onClick?: () => void;
}) {
  const look = art === 'in' ? 'bg-proof/10 text-proof'
    : art === 'wait' ? 'bg-[#FFF4E5] text-[#B26A00]' : 'bg-raised text-text';
  const Zeile = onClick ? 'button' : 'div';
  return (
    <li>
    <Zeile onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${
        onClick ? 'active:bg-raised/60' : ''}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center
                        rounded-full text-[15px] ${look}`}>
        {art === 'in' ? '↓' : art === 'out' ? '↑' : (
          <svg viewBox="0 0 22 22" width="16" height="16" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7.5" /><path d="M11 7.5v4l2.5 1.5" />
          </svg>)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold">{titel}</span>
        <span className="mt-0.5 block text-[12px] font-semibold text-faint">{unten}</span>
      </span>
      <span className={`tnum whitespace-nowrap text-[14px] font-bold ${
        art === 'wait' ? 'text-faint' : gut ? 'text-proof' : 'text-text'}`}>
        {betrag}
      </span>
      {onClick && <span className="text-faint">›</span>}
    </Zeile>
    </li>
  );
}
