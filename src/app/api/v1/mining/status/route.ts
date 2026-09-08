import { authed, ok } from '@/lib/http';
import { db } from '@/lib/db/service';
import { chainParams } from '@/lib/chain/params';
import { hashrateFromWeight } from '@/lib/chain/target';

export const runtime = 'nodejs';

/**
 * GET /api/v1/mining/status
 *
 * Alle Zahlen hier stammen aus validierten Shares. Die Hashrate ist ein
 * statistischer Schaetzer -- Summe der Share-Difficulties mal Einheit durch
 * Zeit -- und schwankt bei wenigen Shares deutlich. Sie wird nicht vom
 * Client uebernommen und nicht hochgezaehlt.
 */
export async function GET(req: Request) {
  const auth = authed(req);
  if ('response' in auth) return auth.response;

  const p = await chainParams();
  const sb = db();

  const [{ data: stats }, { data: round }, { data: session }, { data: user }] =
    await Promise.all([
      sb.from('network_stats').select('*').eq('id', 1).single(),
      sb.from('rounds').select('id, height, difficulty, opened_at')
        .eq('status', 'open').single(),
      sb.from('mining_sessions')
        .select('id, share_difficulty, valid_shares, invalid_shares, accumulated_weight, started_at')
        .eq('user_id', auth.claims.sub).eq('status', 'active').maybeSingle(),
      sb.from('users').select('balance, blocks_found, lifetime_weight')
        .eq('id', auth.claims.sub).single(),
    ]);

  let myHashrate = 0;
  if (session) {
    const seconds = (Date.now() - new Date(session.started_at).getTime()) / 1000;
    myHashrate = hashrateFromWeight(Number(session.accumulated_weight), seconds);
  }

  let networkHashrate = 0;
  let myShare = 0;
  if (round) {
    const seconds = (Date.now() - new Date(round.opened_at).getTime()) / 1000;
    const { data: contributions } = await sb.from('round_contributions')
      .select('user_id, weight').eq('round_id', round.id);
    const total = (contributions ?? []).reduce((s, c) => s + Number(c.weight), 0);
    networkHashrate = hashrateFromWeight(total, seconds);
    const mine = (contributions ?? []).find(c => c.user_id === auth.claims.sub);
    myShare = total > 0 ? (Number(mine?.weight ?? 0) / total) * 100 : 0;
  }

  return ok({
    token: { name: p.token_name, symbol: p.token_symbol, decimals: p.token_decimals },
    height: round?.height ?? stats?.height ?? null,
    difficulty: round?.difficulty ?? null,
    networkHashrate,
    lastBlockAt: stats?.last_block_at ?? null,
    session: session ? {
      id: session.id,
      shareDifficulty: String(session.share_difficulty),
      validShares: session.valid_shares,
      invalidShares: session.invalid_shares,
      hashrate: myHashrate,
      roundSharePct: myShare,
    } : null,
    account: {
      balance: user?.balance ?? 0,
      blocksFound: user?.blocks_found ?? 0,
      lifetimeWeight: user?.lifetime_weight ?? 0,
    },
  });
}
