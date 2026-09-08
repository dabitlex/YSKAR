import { authed, ok, fail } from '@/lib/http';
import { db } from '@/lib/db/service';
import { chainParams } from '@/lib/chain/params';
import { effectiveDifficulty } from '@/lib/chain/difficulty';
import { targetFromDifficulty, targetToBytes } from '@/lib/chain/target';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

/**
 * GET /api/v1/mining/job
 *
 * Liefert den aktuellen Job der offenen Runde. Alle Miner arbeiten am selben
 * Block; unterschieden werden sie allein durch ihre Extranonce.
 *
 * Der job_seed wird nach Ablauf der TTL erneuert. Das aendert den Header und
 * macht damit zweierlei unmoeglich: Vorberechnen auf Vorrat und das
 * Wiedereinreichen alter Shares nach dem Rundenwechsel.
 */
export async function GET(req: Request) {
  const auth = authed(req);
  if ('response' in auth) return auth.response;

  const p = await chainParams();
  const sb = db();

  const { data: round } = await sb.from('rounds')
    .select('id, height, difficulty, prev_hash, merkle_root, opened_at')
    .eq('status', 'open')
    .single();
  if (!round) return fail('no_open_round', 503);

  // Noch gueltigen Job wiederverwenden, sonst einen neuen ausgeben.
  const { data: existing } = await sb.from('mining_jobs')
    .select('*')
    .eq('round_id', round.id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return ok(serialize(existing));

  // Notfallregel: Wenn seit dem letzten Block zu viel Zeit vergangen ist,
  // lockert das Target. Ohne das steht die Kette morgens, wenn nachts
  // niemand gemint hat.
  const { data: lastBlock } = await sb.from('blocks')
    .select('found_at').order('height', { ascending: false }).limit(1).single();

  const elapsed = lastBlock
    ? (Date.now() - new Date(lastBlock.found_at).getTime()) / 1000
    : 0;

  const difficulty = effectiveDifficulty(BigInt(round.difficulty), elapsed, {
    targetBlockTime: p.target_block_time,
    lwmaWindow: p.lwma_window,
    lwmaClamp: p.lwma_clamp,
    minDifficulty: BigInt(p.min_difficulty),
    emergencyFactor: p.emergency_factor,
  });

  const now = Math.floor(Date.now() / 1000);
  const { data: job, error } = await sb.from('mining_jobs')
    .insert({
      round_id: round.id,
      height: round.height,
      prev_hash: round.prev_hash,
      merkle_root: round.merkle_root,
      job_seed: '\\x' + randomBytes(16).toString('hex'),
      block_time: now,
      difficulty: Number(difficulty),
      expires_at: new Date(Date.now() + p.job_ttl_seconds * 1000).toISOString(),
    })
    .select('*')
    .single();

  if (error || !job) return fail('job_create_failed', 500);
  return ok(serialize(job));
}

function hex(v: string): string {
  return v.startsWith('\\x') ? v.slice(2) : v;
}

/**
 * Der Client bekommt alle Header-Felder ausser der Nonce. Er baut daraus
 * denselben 116-Byte-Header wie der Server -- die Serialisierung ist in
 * src/lib/chain/header.ts und src/workers/miner.worker.ts identisch und wird
 * von tests/header.test.ts gegeneinander geprueft.
 */
function serialize(job: Record<string, unknown>) {
  const difficulty = Number(job.difficulty);
  return {
    jobId: job.id,
    height: Number(job.height),
    prevHash: hex(job.prev_hash as string),
    merkleRoot: hex(job.merkle_root as string),
    jobSeed: hex(job.job_seed as string),
    timestamp: String(job.block_time),
    difficulty,
    target: targetToBytes(targetFromDifficulty(BigInt(difficulty))).toString('hex'),
    expiresAt: job.expires_at,
  };
}
