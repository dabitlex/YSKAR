import { authed, ok, fail } from '@/lib/http';
import { db } from '@/lib/db/service';
import { chainParams } from '@/lib/chain/params';
import { hashHeader, unhex, type BlockHeader } from '@/lib/chain/header';
import { achievedDifficulty } from '@/lib/chain/target';
import { nextDifficulty } from '@/lib/chain/difficulty';
import * as vardiff from '@/lib/chain/vardiff';

export const runtime = 'nodejs';

/**
 * POST /api/v1/mining/share
 * Body: { sessionId: string, jobId: string, nonce: string }
 *
 * Das Herzstueck. Der Client sendet ausschliesslich die Nonce.
 *
 * Was der Client NICHT senden kann und was deshalb auch nicht entgegen-
 * genommen wird: Hashrate, Hash, Difficulty, Anzahl Shares. Der Server baut
 * den Header aus seinen eigenen Daten (Job aus der DB, Extranonce aus der
 * Session) neu auf, hasht ihn selbst und leitet daraus ab, wie viel Arbeit
 * tatsaechlich geleistet wurde.
 *
 * Ein mitgeschickter Hash waere bestenfalls ueberfluessig und schlimmsten-
 * falls eine Einladung, ihm zu glauben.
 */
export async function POST(req: Request) {
  const auth = authed(req);
  if ('response' in auth) return auth.response;

  let body: { sessionId?: string; jobId?: string; nonce?: string };
  try { body = await req.json(); } catch { return fail('bad_json'); }
  if (!body.sessionId || !body.jobId || body.nonce === undefined) {
    return fail('missing_fields');
  }

  let nonce: bigint;
  try {
    nonce = BigInt(body.nonce);
    if (nonce < 0n || nonce > 0xffffffffffffffffn) throw new Error();
  } catch {
    return fail('bad_nonce');
  }

  const p = await chainParams();
  const sb = db();

  const { data: session } = await sb.from('mining_sessions')
    .select('id, user_id, extranonce, share_difficulty, status, last_share_at, started_at')
    .eq('id', body.sessionId)
    .single();
  if (!session) return fail('session_unknown', 404);
  if (session.user_id !== auth.claims.sub) return fail('session_foreign', 403);
  if (session.status !== 'active') return fail('session_inactive', 409);

  const { data: job } = await sb.from('mining_jobs')
    .select('*')
    .eq('id', body.jobId)
    .single();
  if (!job) return fail('job_unknown', 404);
  if (new Date(job.expires_at).getTime() < Date.now()) {
    return ok({ accepted: false, reason: 'job_expired', refetchJob: true }, 200, auth.renewedToken);
  }

  // --- Header serverseitig rekonstruieren und selbst hashen ---
  const header: BlockHeader = {
    version: 1,
    height: Number(job.height),
    prevHash: unhex(job.prev_hash),
    merkleRoot: unhex(job.merkle_root),
    jobSeed: unhex(job.job_seed),
    timestamp: BigInt(job.block_time),
    difficulty: Number(job.difficulty),
    extranonce: BigInt(session.extranonce),
    nonce,
  };
  const hash = hashHeader(header);
  const achieved = achievedDifficulty(hash);

  // --- VarDiff nachfuehren ---
  const vp = {
    targetSeconds: p.vardiff_target_seconds,
    min: BigInt(p.vardiff_min),
    max: BigInt(p.vardiff_max),
    blockDifficulty: BigInt(job.difficulty),
    shareDiffBlockRatio: p.share_diff_block_ratio,
  };
  const since = session.last_share_at
    ? (Date.now() - new Date(session.last_share_at).getTime()) / 1000
    : p.vardiff_target_seconds;
  const nextShareDifficulty = vardiff.adjust(
    BigInt(session.share_difficulty), since, vp);

  // --- Naechste Block-Difficulty vorbereiten, falls das hier ein Block ist ---
  let nextBlockDifficulty = BigInt(job.difficulty);
  if (achieved >= BigInt(job.difficulty)) {
    nextBlockDifficulty = await computeNextDifficulty(p);
  }

  const { data, error } = await sb.rpc('submit_verified_share', {
    p_user_id: auth.claims.sub,
    p_session_id: session.id,
    p_job_id: job.id,
    p_nonce: Number(nonce),
    p_hash: '\\x' + hash.toString('hex'),
    p_achieved: Number(achieved > 2n ** 62n ? 2n ** 62n : achieved),
    p_share_difficulty: Number(session.share_difficulty),
    p_next_difficulty: Number(nextBlockDifficulty),
    p_new_share_difficulty: Number(nextShareDifficulty),
  });

  if (error) return fail('submit_failed', 500);
  return ok(data, 200, auth.renewedToken);
}

/** LWMA ueber die letzten Bloecke. */
async function computeNextDifficulty(p: Awaited<ReturnType<typeof chainParams>>) {
  const { data: blocks } = await db().from('blocks')
    .select('height, difficulty, found_at')
    .order('height', { ascending: false })
    .limit(p.lwma_window + 1);

  if (!blocks || blocks.length < 2) return BigInt(p.genesis_difficulty);

  const asc = [...blocks].reverse();
  const timings = [];
  for (let i = 1; i < asc.length; i++) {
    timings.push({
      difficulty: BigInt(asc[i].difficulty),
      solveSeconds:
        (new Date(asc[i].found_at).getTime() - new Date(asc[i - 1].found_at).getTime()) / 1000,
    });
  }

  return nextDifficulty(timings, {
    targetBlockTime: p.target_block_time,
    lwmaWindow: p.lwma_window,
    lwmaClamp: p.lwma_clamp,
    minDifficulty: BigInt(p.min_difficulty),
    emergencyFactor: p.emergency_factor,
  });
}
