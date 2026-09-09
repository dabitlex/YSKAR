import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Oeffentliche Kettendaten, deshalb CORS fuer alle: Der HTML-Explorer soll
 * auch von der Festplatte oder einer anderen Domain aus pruefen koennen.
 * Es gibt hier nichts zu schuetzen -- alles ist per RLS ohnehin lesbar.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}


/** GET /api/v1/chain/blocks?limit=25&before=<height> -- oeffentlich. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 25)));
  const before = url.searchParams.get('before');

  let q = db().from('blocks')
    .select('height, block_hash, prev_hash, merkle_root, job_seed, block_time, difficulty, extranonce, nonce, reward, found_at, miner_id, clan_id')
    .order('height', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('height', Number(before));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500, headers: CORS });

  const minerIds = [...new Set((data ?? []).map(b => b.miner_id).filter(Boolean))];
  const { data: miners } = minerIds.length
    ? await db().from('users').select('id, first_name, username').in('id', minerIds)
    : { data: [] };
  const byId = new Map((miners ?? []).map(m => [m.id, m]));

  return NextResponse.json({
    blocks: (data ?? []).map(b => ({
      ...serialize(b),
      miner: b.miner_id
        ? { name: byId.get(b.miner_id)?.first_name ?? null,
            username: byId.get(b.miner_id)?.username ?? null }
        : null,
    })),
  }, { headers: CORS });
}

function hex(v: string | null): string | null {
  if (!v) return null;
  return v.startsWith('\\x') ? v.slice(2) : v;
}

export function serialize(b: Record<string, any>) {
  return {
    height: b.height,
    hash: hex(b.block_hash),
    prevHash: hex(b.prev_hash),
    merkleRoot: hex(b.merkle_root),
    jobSeed: hex(b.job_seed),
    timestamp: String(b.block_time),
    difficulty: Number(b.difficulty),
    extranonce: String(b.extranonce),
    nonce: String(b.nonce),
    reward: Number(b.reward),
    foundAt: b.found_at,
  };
}
