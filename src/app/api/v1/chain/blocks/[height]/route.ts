import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { serializeBlockRow } from '@/lib/chain/blockView';

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


/** GET /api/v1/chain/blocks/:height -- Block samt Auszahlung, oeffentlich. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ height: string }> },
) {
  const { height: raw } = await params;
  const height = Number(raw);
  if (!Number.isInteger(height) || height < 0) {
    return NextResponse.json({ error: 'bad_height' }, { status: 400, headers: CORS });
  }

  const sb = db();
  const { data: block } = await sb.from('blocks').select('*').eq('height', height).maybeSingle();
  if (!block) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: CORS });

  const [{ data: rewards }, { data: miner }, { data: next }] = await Promise.all([
    sb.from('block_rewards')
      .select('user_id, amount, weight, weight_pct, payout_pct, kind, fee_amount, capped')
      .eq('block_height', height).order('amount', { ascending: false }),
    block.miner_id
      ? sb.from('users').select('first_name, username').eq('id', block.miner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('blocks').select('height').eq('height', height + 1).maybeSingle(),
  ]);

  const ids = [...new Set((rewards ?? []).map(r => r.user_id))];
  const { data: names } = ids.length
    ? await sb.from('users').select('id, first_name').in('id', ids)
    : { data: [] };
  const byId = new Map((names ?? []).map(u => [u.id, u.first_name]));

  return NextResponse.json({
    ...serializeBlockRow(block),
    miner: miner ? { name: miner.first_name, username: miner.username } : null,
    hasNext: !!next,
    rewards: (rewards ?? []).map(r => ({
      name: byId.get(r.user_id) ?? 'unbekannt',
      amount: Number(r.amount),
      weight: Number(r.weight),
      weightPct: Number(r.weight_pct),
      payoutPct: Number(r.payout_pct),
      kind: r.kind,
      feeAmount: Number(r.fee_amount),
      capped: r.capped,
    })),
  }, { headers: CORS });
}
