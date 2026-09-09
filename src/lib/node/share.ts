import { db } from '../db/service.ts';
import * as store from './store.ts';
import { finalizeBlock } from '../core/builder.ts';
import { validateBlock } from '../core/validate.ts';
import {
  headerHash, deserializeBlock, serializeBlock, type BlockHeader, type Block,
} from '../core/block.ts';
import { applyBlock, cloneState } from '../core/state.ts';
import { achievedDifficulty } from '../core/params.ts';
import { LWMA_WINDOW } from '../core/params.ts';
import * as vardiff from '../chain/vardiff.ts';
import { toHex, fromHex } from '../core/codec.ts';

/**
 * Share-Annahme.
 *
 * Der Client sendet ausschliesslich eine Nonce. Der Server nimmt den im Job
 * hinterlegten Blockkoerper, setzt die Nonce ein und hasht selbst. Ein
 * mitgeschickter Hash waere bestenfalls ueberfluessig und schlimmstenfalls
 * eine Einladung, ihm zu glauben.
 *
 * Erfuellt ein Share das BLOCK-Target, wird der Block vollstaendig geprueft,
 * bevor er festgeschrieben wird -- inklusive state_root. Der Knoten glaubt
 * seinem eigenen Job nicht.
 */

const un = (s: string) => fromHex(s.startsWith('\\x') ? s.slice(2) : s);
const hx = (b: Uint8Array) => '\\x' + toHex(b);

const GRACE_MS = 15_000;
const VARDIFF = { targetSeconds: 30, min: 32n, max: 4096n, shareDiffBlockRatio: 8 };

export type ShareResult =
  | { accepted: false; reason: string; required?: string; achieved?: string }
  | { accepted: true; block: false; credited: string; shareDifficulty: string }
  | { accepted: true; block: true; height: number; reward: string; hash: string;
      credited: string; shareDifficulty: string };

export async function submitShare(
  sessionId: string, jobId: string, nonce: bigint,
): Promise<ShareResult> {
  const sb = db().schema('chain2');

  const [{ data: session }, { data: job }] = await Promise.all([
    sb.from('sessions').select('*').eq('id', sessionId).single(),
    sb.from('jobs').select('*').eq('id', jobId).single(),
  ]);
  if (!session || session.status !== 'active') {
    return { accepted: false, reason: 'session_inactive' };
  }
  if (!job) return { accepted: false, reason: 'job_unknown' };
  if (new Date(job.expires_at).getTime() < Date.now()) {
    return { accepted: false, reason: 'job_expired' };
  }

  // Der Block steht fertig im Job -- nur die Nonce fehlt.
  let block: Block;
  try { block = deserializeBlock(un(job.body)); }
  catch { return { accepted: false, reason: 'job_corrupt' }; }

  const header: BlockHeader = { ...block.header, nonce };
  const hash = headerHash(header);
  const achieved = achievedDifficulty(hash);

  // --- Gutschrift, mit Kulanzfenster nach einer Erhoehung ---
  // Gutgeschrieben wird immer die Difficulty, gegen die der Client
  // tatsaechlich gerechnet hat. Sonst waere der Hashraten-Schaetzer verzerrt.
  const current = BigInt(session.share_difficulty);
  const prev = session.prev_share_difficulty ? BigInt(session.prev_share_difficulty) : null;
  const changedAt = session.difficulty_changed_at
    ? new Date(session.difficulty_changed_at).getTime() : 0;

  let credited: bigint;
  if (achieved >= current) {
    credited = current;
  } else if (prev !== null && achieved >= prev && Date.now() - changedAt < GRACE_MS) {
    credited = prev;
  } else {
    await sb.from('sessions')
      .update({ invalid_shares: session.invalid_shares + 1 }).eq('id', sessionId);
    return { accepted: false, reason: 'low_difficulty',
             required: current.toString(), achieved: achieved.toString() };
  }

  const isBlock = achieved >= block.header.difficulty;

  const { error: shareError } = await sb.from('shares').insert({
    job_id: jobId, session_id: sessionId, address: session.address,
    extranonce: session.extranonce, nonce: nonce.toString(),
    hash: hx(hash), difficulty: credited.toString(), is_block: isBlock,
  });
  if (shareError) {
    return { accepted: false,
             reason: shareError.code === '23505' ? 'duplicate' : 'store_failed' };
  }

  // --- VarDiff nachfuehren ---
  const since = session.last_share_at
    ? (Date.now() - new Date(session.last_share_at).getTime()) / 1000 : null;
  const samples = since === null
    ? (session.vardiff_samples ?? []).map(Number)
    : vardiff.pushSample((session.vardiff_samples ?? []).map(Number), since, current);
  const nextShare = vardiff.adjustFromHistory(current, samples, {
    ...VARDIFF, blockDifficulty: block.header.difficulty,
  });

  await sb.from('sessions').update({
    share_difficulty: nextShare.toString(),
    prev_share_difficulty: nextShare !== current
      ? current.toString() : session.prev_share_difficulty,
    difficulty_changed_at: nextShare !== current
      ? new Date().toISOString() : session.difficulty_changed_at,
    vardiff_samples: samples,
    valid_shares: session.valid_shares + 1,
    accumulated_weight: (Number(session.accumulated_weight) + Number(credited)).toString(),
    last_share_at: new Date().toISOString(),
  }).eq('id', sessionId);

  if (!isBlock) {
    return { accepted: true, block: false,
             credited: credited.toString(), shareDifficulty: nextShare.toString() };
  }

  const committed = await commitFound(block, nonce);
  if (!committed.ok) return { accepted: false, reason: committed.reason };

  return {
    accepted: true, block: true, height: block.header.height,
    reward: committed.reward, hash: toHex(hash),
    credited: credited.toString(), shareDifficulty: nextShare.toString(),
  };
}

/**
 * Gefundenen Block pruefen und festschreiben.
 *
 * Der Knoten prueft hier NOCH EINMAL alles, obwohl er den Block selbst gebaut
 * hat: Zwischen Jobausgabe und Fund koennen Minuten liegen, und in der Zeit
 * kann ein anderer Miner denselben Block gefunden haben. Dann ist der Job
 * veraltet und der Proof of Work galt fuer eine Hoehe, die es schon gibt.
 */
async function commitFound(built: Block, nonce: bigint): Promise<
  { ok: true; reward: string } | { ok: false; reason: string }
> {
  const [tip, { state }, { timings, timestamps }] = await Promise.all([
    store.loadTip(), store.loadState(), store.loadTimings(LWMA_WINDOW),
  ]);
  if (!tip) return { ok: false, reason: 'no_genesis' };
  if (tip.height + 1 !== built.header.height) return { ok: false, reason: 'stale_job' };

  const block: Block = { header: { ...built.header, nonce }, txs: built.txs };

  const error = validateBlock(block, {
    previous: tip.header, state, recentTimestamps: timestamps,
    recentTimings: timings, now: BigInt(Math.floor(Date.now() / 1000)),
  });
  if (error) return { ok: false, reason: `${error.code}:${error.detail}` };

  const before = cloneState(state);
  const after = cloneState(state);
  const applied = applyBlock(after, block);
  if (!applied.ok) return { ok: false, reason: `state:${applied.error?.reason}` };

  try {
    await store.commitBlock(block, before, after);
  } catch (e) {
    // Der Trigger auf chain2.blocks laesst nur den passenden Nachfolger zu.
    // Faellt er, war jemand schneller -- kein Fehler, nur Pech.
    return { ok: false, reason: `commit:${(e as Error).message}` };
  }

  return { ok: true, reward: (block.txs[0] as any).amount.toString() };
}
