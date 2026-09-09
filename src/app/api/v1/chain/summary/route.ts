import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { chainParams } from '@/lib/chain/params';

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


/**
 * GET /api/v1/chain/summary  -- oeffentlich, keine Anmeldung.
 *
 * Der Block Explorer soll auch ohne Telegram erreichbar sein. Alle Daten hier
 * sind ohnehin oeffentlich lesbar (RLS erlaubt select auf blocks, rounds und
 * block_rewards).
 */
export async function GET() {
  const p = await chainParams();
  const sb = db();

  const [{ data: recent }, { data: round }, { data: minerCount }] = await Promise.all([
    sb.from('blocks').select('height, difficulty, found_at, reward')
      .order('height', { ascending: false }).limit(13),
    sb.from('rounds').select('height, difficulty, opened_at').eq('status', 'open').maybeSingle(),
    sb.from('mining_sessions').select('user_id').eq('status', 'active'),
  ]);

  const blocks = recent ?? [];
  // Hashrate aus der Kette selbst: Difficulty mal Einheit durch Loesungszeit.
  // Ueber 12 Bloecke gemittelt -- bei weniger ist die Streuung zu gross, um
  // eine Zahl anzuzeigen, die jemand ernst nehmen soll.
  let hashrate: number | null = null;
  if (blocks.length >= 3) {
    const newest = new Date(blocks[0].found_at).getTime();
    const oldest = new Date(blocks[blocks.length - 1].found_at).getTime();
    const seconds = (newest - oldest) / 1000;
    const work = blocks.slice(0, -1).reduce((s, b) => s + Number(b.difficulty), 0);
    if (seconds > 0) hashrate = (work * Number(p.difficulty_unit)) / seconds;
  }

  const { count: totalBlocks } = await sb.from('blocks')
    .select('height', { count: 'exact', head: true });

  const emitted = await sb.from('blocks').select('reward');
  const totalEmitted = (emitted.data ?? []).reduce((s, b) => s + Number(b.reward), 0);

  return NextResponse.json({
    token: { name: p.token_name, symbol: p.token_symbol, decimals: p.token_decimals },
    tip: blocks[0] ?? null,
    openRound: round ?? null,
    height: round?.height ?? null,
    difficulty: round?.difficulty ?? null,
    hashrate,
    targetBlockTime: p.target_block_time,
    difficultyUnit: Number(p.difficulty_unit),
    blockCount: (totalBlocks ?? 1) - 1,          // Genesis zaehlt nicht als geminter Block
    activeMiners: new Set((minerCount ?? []).map(s => s.user_id)).size,
    emitted: totalEmitted,
    maxSupply: Number(p.max_supply),
    epochBlocks: p.epoch_blocks,
    seasonBlocks: p.season_blocks,
    reward: round ? rewardAt(round.height, p) : null,
  }, { headers: CORS });
}

function rewardAt(height: number, p: Awaited<ReturnType<typeof chainParams>>): number {
  const epoch = Math.floor(height / p.epoch_blocks);
  return epoch >= 63 ? 0 : Math.floor(p.initial_reward / 2 ** epoch);
}
