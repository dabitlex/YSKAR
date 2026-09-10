'use client';

import { useState } from 'react';
import { Row, Button, Notice } from '@/components/ui/Primitives';
import type { Account } from '@/hooks/useMining';

/**
 * Wallet.
 *
 * Fuehrt mit dem Guthaben, dann Senden und Empfangen, dann der Verlauf.
 * Der Verlauf ist bewusst eine Liste und keine Kachelsammlung -- man liest
 * ihn von oben nach unten und will wissen, was zuletzt passiert ist.
 */

export interface HistoryEintrag {
  txid: string;
  height: number;
  timestamp: string | null;
  kind: 'reward' | 'in' | 'out';
  counterparty: string | null;
  amount: string;
  fee: string;
}

function vorZeit(ts: string | null): string {
  if (!ts) return '';
  const s = Math.max(0, Date.now() / 1000 - Number(ts));
  if (s < 60) return `vor ${Math.round(s)} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} d`;
}

const kurz = (a: string | null) =>
  a ? `${a.slice(0, 9)}…${a.slice(-4)}` : 'unbekannt';

export default function WalletTab({ account, symbol, decimals, onSenden, onEmpfangen }: {
  account: (Account & { history?: HistoryEintrag[]; pending?: any[] }) | null;
  symbol: string;
  decimals: number;
  onSenden: () => void;
  onEmpfangen: () => void;
}) {
  const guthaben = Number(account?.balance ?? 0) / 10 ** decimals;
  const [ganz, bruch] = guthaben.toFixed(4).split('.');
  const verlauf = account?.history ?? [];
  const wartend = account?.pending ?? [];

  return (
    <>
      <p className="text-sm text-dim">Guthaben</p>
      <div className="mt-1.5 flex items-baseline gap-2 leading-none">
        <span className="tnum text-4xl font-medium tracking-tight text-proof">
          {ganz}<span className="text-2xl opacity-60">,{bruch}</span>
        </span>
        <span className="text-[15px] text-dim">{symbol}</span>
      </div>
      <p className="mt-1.5 text-sm text-dim">
        {account?.blocksFound ?? 0} Blöcke gefunden
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button onClick={onSenden}>Senden</Button>
        <Button variant="quiet" onClick={onEmpfangen}>Empfangen</Button>
      </div>

      <p className="mt-8 border-t border-line pt-4 text-sm text-dim">Verlauf</p>

      {verlauf.length === 0 && wartend.length === 0 && (
        <p className="mt-4 text-sm text-dim">
          Noch nichts passiert. Sobald du einen Block findest, steht er hier.
        </p>
      )}

      <ul className="mt-2">
        {wartend.map((p: any) => (
          <li key={p.txid} className="flex items-center gap-3 border-b border-line py-3">
            <Symbolkreis art="wait" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">
                An {kurz(null)}
              </span>
              <span className="block text-[11px] text-dim">wartet auf Bestätigung</span>
            </span>
            <span className="tnum whitespace-nowrap text-[13px] text-dim">
              −{(Number(p.amount) / 10 ** decimals).toFixed(4)}
            </span>
          </li>
        ))}

        {verlauf.map(e => (
          <li key={e.txid} className="flex items-center gap-3 border-b border-line py-3">
            <Symbolkreis art={e.kind === 'out' ? 'out' : 'in'} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">
                {e.kind === 'reward' ? `Blockreward #${e.height}`
                  : e.kind === 'in' ? `Von ${kurz(e.counterparty)}`
                  : `An ${kurz(e.counterparty)}`}
              </span>
              <span className="block text-[11px] text-dim">
                {vorZeit(e.timestamp)}
                {e.kind === 'out' && Number(e.fee) > 0 &&
                  ` · Gebühr ${(Number(e.fee) / 10 ** decimals).toFixed(4)}`}
              </span>
            </span>
            <span className={`tnum whitespace-nowrap text-[13px] ${
              e.kind === 'out' ? '' : 'text-proof'}`}>
              {e.kind === 'out' ? '−' : '+'}
              {(Number(e.amount) / 10 ** decimals).toFixed(4)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Symbolkreis({ art }: { art: 'in' | 'out' | 'wait' }) {
  const look = art === 'in' ? 'text-proof border-proof/35'
    : art === 'wait' ? 'text-dim border-line' : 'text-text border-line';
  const zeichen = art === 'in' ? '↓' : art === 'out' ? '↑' : '·';
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                      border text-xs ${look}`}>
      {zeichen}
    </span>
  );
}
