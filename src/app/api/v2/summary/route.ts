import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { rewardAt, MAX_SUPPLY, TARGET_BLOCK_TIME, DIFFICULTY_UNIT } from '@/lib/core/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** GET /api/v2/summary -- Kennzahlen der Kette, oeffentlich. */
export async function GET() {
  const sb = db().schema('chain2');

  const [rBlocks, rMeta, rParams, rPending, rActive] =
    await Promise.all([
      sb.from('blocks').select('height, difficulty, block_time, hash')
        .order('height', { ascending: false }).limit(13),
      sb.from('state_meta').select('height, state_root, total_supply').eq('id', 1).single(),
      sb.from('params').select('token_name, token_symbol, decimals').eq('id', 1).single(),
      sb.from('mempool').select('txid', { count: 'exact', head: true }),
      sb.from('sessions').select('address').eq('status', 'active'),
    ]);

  // Fehler NICHT verschlucken. Ein Rechte- oder Schemaproblem liefert
  // data = null, und ohne diese Pruefung sieht das exakt aus wie eine leere
  // Datenbank -- inklusive plausibler Nullen im JSON. Genau daran haben wir
  // beim ersten Aufruf gesucht.
  const failed = [rBlocks, rMeta, rParams, rActive].find(r => r.error);
  if (failed?.error) {
    return NextResponse.json(
      { error: 'chain_unreachable', detail: failed.error.message },
      { status: 503, headers: CORS },
    );
  }

  const recent = rBlocks.data;
  const meta = rMeta.data;
  const params = rParams.data;
  const pending = rPending.count;
  const active = rActive.data;

  const blocks = recent ?? [];
  // Hashrate aus der Kette selbst. Unter drei Bloecken ist die Streuung
  // groesser als der Wert -- dann lieber nichts anzeigen.
  let hashrate: number | null = null;
  if (blocks.length >= 3) {
    const span = Number(BigInt(blocks[0].block_time) - BigInt(blocks[blocks.length - 1].block_time));
    const work = blocks.slice(0, -1).reduce((s, b) => s + Number(b.difficulty), 0);
    if (span > 0) hashrate = (work * Number(DIFFICULTY_UNIT)) / span;
  }

  const tip = blocks[0] ?? null;
  const nextHeight = tip ? tip.height + 1 : 0;

  return NextResponse.json({
    token: params ?? null,
    height: tip?.height ?? null,
    nextHeight,
    difficulty: tip?.difficulty ?? null,
    hashrate,
    targetBlockTime: Number(TARGET_BLOCK_TIME),
    tipHash: unprefix(tip?.hash as string | undefined),
    stateHeight: meta?.height ?? -1,
    stateRoot: unprefix(meta?.state_root as string | undefined),
    totalSupply: meta?.total_supply ?? '0',
    maxSupply: MAX_SUPPLY.toString(),
    nextReward: rewardAt(nextHeight).toString(),
    mempool: pending ?? 0,
    activeMiners: new Set((active ?? []).map(s => s.address)).size,
  }, { headers: CORS });
}
