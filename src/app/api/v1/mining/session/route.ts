import { NextResponse } from 'next/server';
import { authed, ok, fail } from '@/lib/http';
import { db } from '@/lib/db/service';
import { chainParams } from '@/lib/chain/params';
import { isMobilePlatform } from '@/lib/telegram/initdata';
import * as vardiff from '@/lib/chain/vardiff';

export const runtime = 'nodejs';

/**
 * POST /api/v1/mining/session
 * Body: { platform: string, dutyCycle?: number }
 *
 * Startet eine Mining-Session und vergibt die Extranonce. Sie trennt die
 * Suchraeume aller Miner: zwei Nutzer koennen nie denselben gueltigen Share
 * finden, und ein abgefangener fremder Share ist wertlos.
 */
export async function POST(req: Request) {
  const auth = authed(req);
  if ('response' in auth) return auth.response;

  let body: { platform?: string; dutyCycle?: number };
  try { body = await req.json(); } catch { return fail('bad_json'); }

  const platform = (body.platform ?? '').toLowerCase();
  if (!isMobilePlatform(platform)) {
    return fail('mobile_only', 403);
  }

  const p = await chainParams();
  const sb = db();

  // Laufende Sessions desselben Nutzers beenden -- eine aktive Session je Konto.
  await sb.from('mining_sessions')
    .update({ status: 'stopped' })
    .eq('user_id', auth.claims.sub)
    .eq('status', 'active');

  const { data: round } = await sb.from('rounds')
    .select('id, height, difficulty').eq('status', 'open').single();
  if (!round) return fail('no_open_round', 503);

  const { data: member } = await sb.from('clan_members')
    .select('clan_id').eq('user_id', auth.claims.sub).maybeSingle();

  const startDifficulty = vardiff.initial({
    targetSeconds: p.vardiff_target_seconds,
    min: BigInt(p.vardiff_min),
    max: BigInt(p.vardiff_max),
    blockDifficulty: BigInt(round.difficulty),
    shareDiffBlockRatio: p.share_diff_block_ratio,
  });

  const { data: session, error } = await sb.from('mining_sessions')
    .insert({
      user_id: auth.claims.sub,
      clan_id: member?.clan_id ?? null,
      share_difficulty: Number(startDifficulty),
      duty_cycle: Math.min(100, Math.max(1, body.dutyCycle ?? 50)),
      platform,
    })
    .select('id, extranonce, share_difficulty, duty_cycle')
    .single();

  if (error || !session) return fail('session_create_failed', 500);

  return ok({
    sessionId: session.id,
    extranonce: String(session.extranonce),
    shareDifficulty: String(session.share_difficulty),
    dutyCycle: session.duty_cycle,
  });
}
