'use client';

import Image from 'next/image';
import { Panel, GroupTitle, ActionButton, Icon, Empty } from '@/components/ui/Primitives';
import type { Account } from '@/hooks/useMining';

/**
 * Wallet.
 *
 * Aufbau wie in Bank- und Wallet-Apps ueblich, und das aus gutem Grund:
 * Guthaben als Hauptflaeche ganz oben, Aktionen direkt daran, darunter der
 * Verlauf. Wer die App oeffnet, will genau in dieser Reihenfolge wissen,
 * was los ist.
 *
 * Das Markenzeichen liegt als sehr leises Wasserzeichen auf der Karte --
 * Praesenz, kein Muster.
 */

export interface HistoryEintrag {
  txid: string; height: number; timestamp: string | null;
  kind: 'reward' | 'in' | 'out';
  counterparty: string | null; amount: string; fee: string;
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

export default function WalletTab({ account, symbol, decimals, onSenden, onEmpfangen }: {
  account: (Account & { history?: HistoryEintrag[]; pending?: any[] }) | null;
  symbol: string; decimals: number;
  onSenden: () => void; onEmpfangen: () => void;
}) {
  const guthaben = Number(account?.balance ?? 0) / 10 ** decimals;
  const [ganz, bruch] = guthaben.toFixed(4).split('.');
  const verlauf = account?.history ?? [];
  const wartend = account?.pending ?? [];

  return (
    <>
      <Panel tone="proof" className="rise">
        <Image src="/marke/zeichen.png" alt="" width={132} height={82}
               className="watermark" aria-hidden />
        <p className="text-[13px] text-dim">Guthaben</p>
        <div className="mt-1 flex items-baseline gap-2 leading-none">
          <span className="tnum text-[42px] font-medium tracking-[-0.03em] text-text">
            {Number(ganz).toLocaleString('de-DE')}
            <span className="text-[26px] text-dim">,{bruch}</span>
          </span>
          <span className="text-[15px] text-dim">{symbol}</span>
        </div>
        <p className="mt-2 text-[13px] text-dim">
          {account?.blocksFound ?? 0} Blöcke gefunden
        </p>

        <div className="mt-6 flex gap-2">
          <ActionButton icon={Icon.Senden} label="Senden" onClick={onSenden} tone="work" />
          <ActionButton icon={Icon.Empfangen} label="Empfangen" onClick={onEmpfangen} />
        </div>
      </Panel>

      <GroupTitle aside={verlauf.length ? `${verlauf.length} Einträge` : undefined}>
        Verlauf
      </GroupTitle>

      {verlauf.length === 0 && wartend.length === 0 ? (
        <Empty>
          Noch nichts passiert. Sobald du einen Block findest, steht er hier.
        </Empty>
      ) : (
        <Panel className="rise rise-1 !p-0">
          <ul className="divide-y divide-line/70">
            {wartend.map((p: any) => (
              <Eintrag key={p.txid} art="wait"
                titel={`An ${kurz(null)}`} unten="wartet auf Bestätigung"
                betrag={`−${(Number(p.amount) / 10 ** decimals).toFixed(4)}`} />
            ))}
            {verlauf.map(e => (
              <Eintrag key={e.txid}
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
    </>
  );
}

function Eintrag({ art, titel, unten, betrag, gut }: {
  art: 'in' | 'out' | 'wait'; titel: string; unten: string;
  betrag: string; gut?: boolean;
}) {
  const look = art === 'in' ? 'bg-proof/12 text-proof'
    : art === 'wait' ? 'bg-raised text-faint' : 'bg-raised text-text';
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center
                        rounded-full text-[15px] ${look}`}>
        {art === 'in' ? '↓' : art === 'out' ? '↑' : '·'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{titel}</span>
        <span className="mt-0.5 block text-[11.5px] text-faint">{unten}</span>
      </span>
      <span className={`tnum whitespace-nowrap text-[14px] ${
        art === 'wait' ? 'text-faint' : gut ? 'text-proof' : 'text-text'}`}>
        {betrag}
      </span>
    </li>
  );
}
