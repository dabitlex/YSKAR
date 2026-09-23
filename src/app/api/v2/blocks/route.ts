import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * GET /api/v2/blocks?limit=25&before=<hoehe>
 *
 * Oeffentlich, ohne Anmeldung. Kettendaten sind oeffentlich -- das ist der
 * Sinn einer Kette.
 *
 * `header` wird als Hex mitgeliefert, damit der Explorer den Hash im Browser
 * selbst nachrechnen kann, ohne die Serialisierung nachbauen zu muessen.
 * Zusaetzlich stehen alle Einzelfelder da, sodass sich auch die
 * Serialisierung gegenpruefen laesst.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 25)));
  const before = url.searchParams.get('before');

  let q = db().schema('chain2').from('blocks')
    .select('height, hash, version, prev_hash, merkle_root, state_root, block_time, difficulty, tx_count, extranonce, nonce, header, size_bytes, received_at')
    .order('height', { ascending: false }).limit(limit);
  if (before) q = q.lt('height', Number(before));

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: 'chain_unreachable', detail: error.message },
      { status: 503, headers: CORS });
  }

  // Wer hat den Block gefunden: der Empfaenger der Coinbase.
  const heights = (data ?? []).map(b => b.height);
  const { data: coinbases } = heights.length
    ? await db().schema('chain2').from('transactions')
        .select('block_height, to_addr, amount').eq('type', 0).in('block_height', heights)
    : { data: [] };
  const byHeight = new Map((coinbases ?? []).map(c => [c.block_height, c]));

  return NextResponse.json({
    blocks: (data ?? []).map(b => {
      const cb = byHeight.get(b.height);
      return {
        height: b.height,
        hash: unprefix(b.hash),
        version: b.version,
        prevHash: unprefix(b.prev_hash),
        merkleRoot: unprefix(b.merkle_root),
        stateRoot: unprefix(b.state_root),
        timestamp: String(b.block_time),
        difficulty: Number(b.difficulty),
        txCount: b.tx_count,
        extranonce: String(b.extranonce),
        nonce: String(b.nonce),
        header: unprefix(b.header),
        sizeBytes: b.size_bytes,
        reward: cb ? String(cb.amount) : null,
        minerAddress: cb ? unprefix(cb.to_addr) : null,
      };
    }),
  }, { headers: CORS });
}
