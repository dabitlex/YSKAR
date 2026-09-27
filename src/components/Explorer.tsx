'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  serializeHeaderBytes, sha256dWeb, targetFromDifficulty,
  hashToBigInt, achievedDifficulty, toHex, fromHex,
} from '@/lib/chain/serialize';

/**
 * Block Explorer.
 *
 * Der Unterschied zu einem Dashboard: Diese Seite glaubt dem Server nicht.
 * Sie baut aus den Header-Feldern jedes Blocks selbst die 116 Byte zusammen,
 * hasht sie im Browser mit WebCrypto und prueft drei Dinge nach:
 *
 *   1. Ergibt der Header wirklich den gespeicherten Hash?
 *   2. Erfuellt dieser Hash die Difficulty, die im Block steht?
 *   3. Zeigt prev_hash auf den Hash des vorherigen Blocks?
 *
 * Erst damit ist "ueberpruefbar" mehr als eine Behauptung. Die Serialisierung
 * stammt aus demselben Modul, das der Server benutzt -- und dieses Modul wird
 * in tests/header.test.ts gegen die echte WASM-Engine geprueft.
 */

interface Block {
  height: number; hash: string; prevHash: string; merkleRoot: string;
  jobSeed: string; timestamp: string; difficulty: number;
  extranonce: string; nonce: string; reward: number; foundAt: string;
  miner: { name: string | null; username: string | null } | null;
}

interface Summary {
  token: { name: string; symbol: string; decimals: number };
  height: number | null; difficulty: number | null; hashrate: number | null;
  targetBlockTime: number; blockCount: number; activeMiners: number;
  emitted: number; maxSupply: number; reward: number | null;
}

type Check = 'pending' | 'ok' | 'fail';
interface Verified { hash: Check; difficulty: Check; chain: Check; computed?: string }

async function verify(b: Block, prev: Block | undefined): Promise<Verified> {
  try {
    const bytes = serializeHeaderBytes({
      version: 1,
      height: b.height,
      prevHash: fromHex(b.prevHash),
      merkleRoot: fromHex(b.merkleRoot),
      jobSeed: fromHex(b.jobSeed),
      timestamp: BigInt(b.timestamp),
      difficulty: b.difficulty,
      extranonce: BigInt(b.extranonce),
      nonce: BigInt(b.nonce),
    });
    const digest = await sha256dWeb(bytes);
    const computed = toHex(digest);

    return {
      computed,
      hash: computed === b.hash ? 'ok' : 'fail',
      difficulty: hashToBigInt(digest) <= targetFromDifficulty(b.difficulty) ? 'ok' : 'fail',
      // Ohne Vorgaengerblock in der Liste laesst sich die Verkettung hier
      // nicht pruefen. Dann bleibt der Punkt offen statt faelschlich gruen.
      chain: !prev ? 'pending' : (b.prevHash === prev.hash ? 'ok' : 'fail'),
    };
  } catch {
    return { hash: 'fail', difficulty: 'fail', chain: 'fail' };
  }
}

function fmtHashrate(h: number | null): string {
  if (h === null) return '—';
  if (h >= 1e9) return `${(h / 1e9).toFixed(2)} GH/s`;
  if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(1)} kH/s`;
  return `${Math.round(h)} H/s`;
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `vor ${Math.round(s)} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} d`;
}

function Badge({ state, label }: { state: Check; label: string }) {
  const color = state === 'ok' ? 'text-emerald-400 border-emerald-400/40'
    : state === 'fail' ? 'text-warn border-warn/50'
    : 'text-muted border-line';
  const mark = state === 'ok' ? '✓' : state === 'fail' ? '✕' : '·';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${color}`}>
      <span aria-hidden="true">{mark}</span>{label}
    </span>
  );
}

export default function Explorer() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [checks, setChecks] = useState<Record<number, Verified>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        fetch('/api/v1/chain/summary').then(r => r.json()),
        fetch('/api/v1/chain/blocks?limit=25').then(r => r.json()),
      ]);
      setSummary(s);
      setBlocks(b.blocks ?? []);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 10_000); return () => clearInterval(id); }, [load]);

  // Nachrechnen, sobald neue Bloecke da sind. Laeuft im Browser, nicht am Server.
  useEffect(() => {
    if (blocks.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<number, Verified> = {};
      for (let i = 0; i < blocks.length; i++) {
        // blocks ist absteigend sortiert, der Vorgaenger steht also dahinter
        next[blocks[i].height] = await verify(blocks[i], blocks[i + 1]);
      }
      if (!cancelled) setChecks(next);
    })();
    return () => { cancelled = true; };
  }, [blocks]);

  useEffect(() => {
    if (open === null) { setDetail(null); return; }
    fetch(`/api/v1/chain/blocks/${open}`).then(r => r.json()).then(setDetail).catch(() => {});
  }, [open]);

  const dec = summary?.token.decimals ?? 8;
  const sym = summary?.token.symbol ?? 'YSR';
  const allOk = Object.values(checks).length > 0
    && Object.values(checks).every(c => c.hash === 'ok' && c.difficulty === 'ok' && c.chain !== 'fail');

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-8">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-medium">{summary?.token.name ?? 'YSKAR'} Explorer</h1>
        {Object.keys(checks).length > 0 && (
          <span className={`text-xs ${allOk ? 'text-emerald-400' : 'text-warn'}`}>
            {allOk
              ? `${Object.keys(checks).length} Blöcke im Browser nachgerechnet`
              : 'Prüfung fehlgeschlagen'}
          </span>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-5 text-sm sm:grid-cols-4">
        <Stat label="Höhe" value={summary?.height != null ? `#${summary.height}` : '—'} />
        <Stat label="Difficulty" value={summary?.difficulty?.toLocaleString('de-DE') ?? '—'} />
        <Stat label="Netz-Hashrate" value={fmtHashrate(summary?.hashrate ?? null)} />
        <Stat label="Aktive Miner" value={String(summary?.activeMiners ?? 0)} />
        <Stat label="Blockreward"
              value={summary?.reward != null ? `${(summary.reward / 10 ** dec).toFixed(0)} ${sym}` : '—'} />
        <Stat label="Zielblockzeit" value={`${(summary?.targetBlockTime ?? 600) / 60} min`} />
        <Stat label="Blöcke gemint" value={String(summary?.blockCount ?? 0)} />
        <Stat
          label="Ausgeschüttet"
          value={summary
            ? `${((summary.emitted / summary.maxSupply) * 100).toFixed(4)} %`
            : '—'}
        />
      </dl>

      {error && <p className="mt-5 text-sm text-warn">Laden fehlgeschlagen: {error}</p>}

      <ul className="mt-8 space-y-px">
        {blocks.map(b => {
          const c = checks[b.height];
          const bad = c && (c.hash === 'fail' || c.difficulty === 'fail' || c.chain === 'fail');
          return (
            <li key={b.height}>
              <button
                onClick={() => setOpen(open === b.height ? null : b.height)}
                className="flex w-full items-center gap-4 border-b border-line py-3 text-left hover:bg-white/[0.02]"
              >
                <span className={`w-16 shrink-0 tabular-nums text-sm ${bad ? 'text-warn' : 'text-accent'}`}>
                  #{b.height}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-muted">{b.hash}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {b.miner?.name ?? 'Genesis'} · {(b.reward / 10 ** dec).toFixed(0)} {sym} · {ago(b.foundAt)}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {b.difficulty.toLocaleString('de-DE')}
                </span>
              </button>

              {open === b.height && (
                <div className="border-b border-line bg-white/[0.015] px-1 py-5">
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Badge state={c?.hash ?? 'pending'} label="Hash nachgerechnet" />
                    <Badge state={c?.difficulty ?? 'pending'} label="erfüllt Difficulty" />
                    <Badge state={c?.chain ?? 'pending'} label="mit Vorgänger verkettet" />
                  </div>

                  <dl className="space-y-1.5 text-xs">
                    <Field k="block_hash" v={b.hash} mono />
                    {c?.computed && c.computed !== b.hash && (
                      <Field k="im Browser berechnet" v={c.computed} mono warn />
                    )}
                    <Field k="prev_hash" v={b.prevHash} mono />
                    <Field k="merkle_root" v={b.merkleRoot} mono />
                    <Field k="job_seed" v={b.jobSeed} mono />
                    <Field k="timestamp" v={`${b.timestamp} (${new Date(Number(b.timestamp) * 1000).toISOString()})`} />
                    <Field k="difficulty" v={b.difficulty.toLocaleString('de-DE')} />
                    <Field k="erreicht" v={c?.computed
                      ? achievedDifficulty(fromHex(c.computed)).toLocaleString('de-DE')
                      : '—'} />
                    <Field k="extranonce" v={b.extranonce} />
                    <Field k="nonce" v={b.nonce} />
                  </dl>

                  {detail?.height === b.height && detail.rewards?.length > 0 && (
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="mb-2 text-xs text-muted">Auszahlung</p>
                      <ul className="space-y-1 text-xs">
                        {detail.rewards.map((r: any, i: number) => (
                          <li key={i} className="flex justify-between gap-4">
                            <span>
                              {r.name}
                              {r.kind === 'solo' && <span className="ml-2 text-muted">solo</span>}
                              {r.feeAmount > 0 && <span className="ml-2 text-muted">inkl. Gebühr</span>}
                              {r.capped && <span className="ml-2 text-warn">gedeckelt</span>}
                            </span>
                            <span className="tabular-nums">
                              {(r.amount / 10 ** dec).toFixed(4)} {sym}
                              <span className="ml-2 text-muted">{r.payoutPct} %</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Jeder Block wird in deinem Browser aus seinen Header-Feldern neu
        serialisiert und mit WebCrypto gehasht. Die Serialisierung stammt aus
        demselben Modul wie auf dem Server. Eine nachträgliche Änderung an
        einem Block würde hier als fehlgeschlagene Prüfung erscheinen.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
    </div>
  );
}

function Field({ k, v, mono, warn }: { k: string; v: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-muted">{k}</dt>
      <dd className={`break-all ${mono ? 'font-mono' : 'tabular-nums'} ${warn ? 'text-warn' : ''}`}>
        {v}
      </dd>
    </div>
  );
}
