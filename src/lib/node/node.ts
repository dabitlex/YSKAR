import { randomBytes } from 'node:crypto';
import { db } from '../db/service.ts';
import * as store from './store.ts';
import { buildBlock, finalizeBlock, type BuildResult } from '../core/builder.ts';
import { validateBlock, expectedDifficulty } from '../core/validate.ts';
import { effectiveDifficulty } from '../core/difficulty.ts';
import { headerHash, serializeHeader, withNonce, deserializeHeader } from '../core/block.ts';
import { deserializeTx, checkTransfer, txid, TX_TRANSFER, type Transfer } from '../core/tx.ts';
import { applyBlock, cloneState, getAccount, stateRoot, type State } from '../core/state.ts';
import { decodeAddress } from '../core/address.ts';
import { GENESIS_DIFFICULTY, LWMA_WINDOW } from '../core/params.ts';
import { sha256dTargetBytes } from './target-helpers.ts';
import { serializeBlock } from '../core/block.ts';
import { toHex, fromHex } from '../core/codec.ts';

/**
 * Der Knoten.
 *
 * Was hier NICHT mehr passiert: Eigentum an Telegram binden. Wer eine Session
 * startet, gibt eine Adresse an; die Coinbase geht dorthin. Das ist bewusst
 * offen -- bei echtem Mining richtet man seinen Miner auf eine Adresse, und
 * jemand anderes fuer dich minen zu lassen ist kein Angriff, sondern ein
 * Geschenk.
 *
 * Der Preis: Es gibt keine kontogebundene Begrenzung mehr. Missbrauchsschutz
 * muss ueber Ratenbegrenzung laufen, nicht ueber Identitaet -- siehe
 * docs/CHAIN.md.
 */

export interface JobView {
  jobId: string;
  height: number;
  prevHash: string;
  merkleRoot: string;
  stateRoot: string;
  timestamp: string;
  difficulty: number;
  txCount: number;
  target: string;
  shareDifficulty: string;
  expiresAt: string;
}

const JOB_TTL_SECONDS = 90;

/**
 * Job fuer eine Session bauen.
 *
 * Jede Session bekommt einen EIGENEN Job: Die Coinbase geht an die Adresse
 * dieser Session, und weil state_root auf den Zustand nach dem Block
 * verpflichtet, unterscheiden sich merkle_root und state_root zwangslaeufig
 * zwischen zwei Minern.
 */
export async function createJob(sessionId: string): Promise<JobView> {
  const { data: session } = await db().schema('chain2').from('sessions')
    .select('id, address, extranonce, share_difficulty, status')
    .eq('id', sessionId).single();
  if (!session || session.status !== 'active') throw new Error('session_inactive');

  const [tip, { state }, mempool, { timings }] = await Promise.all([
    store.loadTip(),
    store.loadState(),
    store.loadMempool(),
    store.loadTimings(LWMA_WINDOW),
  ]);
  if (!tip) throw new Error('no_genesis');

  const now = BigInt(Math.floor(Date.now() / 1000));
  const elapsed = now > tip.header.timestamp ? now - tip.header.timestamp : 0n;
  const regular = timings.length === 0 ? GENESIS_DIFFICULTY : expectedDifficulty(timings);
  const difficulty = effectiveDifficulty(regular, elapsed);

  const built = buildBlock({
    height: tip.height + 1,
    prevHash: tip.hash,
    state,
    mempool,
    minerAddress: fromHex(session.address.replace(/^\\\\x/, '')),
    timestamp: now,
    difficulty,
    extranonce: BigInt(session.extranonce),
    coinbaseExtra: randomBytes(8),
  });

  const h = built.block.header;
  const { data: job, error } = await db().schema('chain2').from('jobs').insert({
    height: h.height,
    prev_hash: '\\x' + toHex(h.prevHash),
    merkle_root: '\\x' + toHex(h.merkleRoot),
    state_root: '\\x' + toHex(h.stateRoot),
    block_time: h.timestamp.toString(),
    difficulty: h.difficulty.toString(),
    tx_count: h.txCount,
    miner_address: session.address,
    // Ohne diese Bindung koennten zwei Sessions derselben Adresse dieselbe
    // Nonce auf denselben Job einreichen und beide gutgeschrieben bekommen:
    // Der Hash kaeme aus demselben Koerper, aber der Wiedereinreichungsschutz
    // greift ueber die Extranonce der SESSION, und die ist verschieden.
    session_id: session.id,
    // Der fertige Block, Nonce noch 0. Beim Fund wird nur sie ersetzt --
    // eine Rekonstruktion aus Metadaten wuerde am veraenderten Mempool
    // scheitern, und merkle_root wie state_root verpflichten auf GENAU
    // diese Auswahl.
    body: '\\x' + toHex(serializeBlock(built.block)),
    txids: built.block.txs.map(t => '\\x' + toHex(txid(t))),
    expires_at: new Date(Date.now() + JOB_TTL_SECONDS * 1000).toISOString(),
  }).select('id, expires_at').single();
  if (error || !job) throw new Error('job_insert_failed');

  return {
    jobId: job.id,
    height: h.height,
    prevHash: toHex(h.prevHash),
    merkleRoot: toHex(h.merkleRoot),
    stateRoot: toHex(h.stateRoot),
    timestamp: h.timestamp.toString(),
    difficulty: Number(h.difficulty),
    txCount: h.txCount,
    // Der Client mint gegen sein SHARE-Target, nicht gegen das Block-Target.
    target: toHex(sha256dTargetBytes(BigInt(session.share_difficulty))),
    shareDifficulty: String(session.share_difficulty),
    expiresAt: job.expires_at,
  };
}

/**
 * Eine signierte Transaktion in den Mempool aufnehmen.
 *
 * Die Signatur IST die Berechtigung -- es braucht keine Anmeldung. Geprueft
 * wird gegen den aktuellen Zustand, damit offensichtlich unbezahlbare
 * Transaktionen gar nicht erst liegenbleiben.
 */
export async function submitTransaction(raw: Uint8Array): Promise<
  { accepted: true; txid: string } | { accepted: false; reason: string }
> {
  let tx;
  try { tx = deserializeTx(raw); }
  catch { return { accepted: false, reason: 'malformed' }; }
  if (tx.type !== TX_TRANSFER) return { accepted: false, reason: 'coinbase_not_allowed' };

  const tip = await store.loadTip();
  const height = (tip?.height ?? 0) + 1;

  const structural = checkTransfer(tx, height);
  if (structural) return { accepted: false, reason: structural };

  const { state } = await store.loadState();
  const acc = getAccount(state, tx.from);
  // Kuenftige Nonces sind erlaubt -- sie warten im Mempool, bis sie dran
  // sind. Vergangene nicht: die sind bereits verbraucht.
  if (tx.nonce < acc.nonce) return { accepted: false, reason: 'nonce_used' };
  if (acc.balance < tx.amount + tx.fee) return { accepted: false, reason: 'insufficient_funds' };

  const id = txid(tx);
  const { data, error } = await db().schema('chain2').rpc('mempool_add', {
    p_txid: '\\x' + toHex(id),
    p_from: '\\x' + toHex(tx.from),
    p_to: '\\x' + toHex(tx.to),
    p_amount: tx.amount.toString(),
    p_fee: tx.fee.toString(),
    p_nonce: tx.nonce.toString(),
    p_valid_until: tx.validUntil,
    p_raw: '\\x' + toHex(raw),
  });
  if (error) return { accepted: false, reason: 'store_failed' };
  const r = data as any;
  return r.accepted
    ? { accepted: true, txid: toHex(id) }
    : { accepted: false, reason: r.reason };
}
