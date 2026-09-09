import { db } from '../db/service.ts';

/** Spiegel von chain_params. Eine Zeile, alle Konstanten der Kette. */
export interface ChainParams {
  version: number;
  hash_algo: string;
  difficulty_unit: number;
  target_block_time: number;
  epoch_blocks: number;
  season_blocks: number;
  initial_reward: number;
  token_decimals: number;
  max_supply: number;
  token_name: string;
  token_symbol: string;
  genesis_difficulty: number;
  min_difficulty: number;
  lwma_window: number;
  lwma_clamp: number;
  emergency_factor: number;
  vardiff_target_seconds: number;
  vardiff_min: number;
  vardiff_max: number;
  share_diff_block_ratio: number;
  account_cap_pct: number;
  cap_slack: number;
  finder_bonus_pct: number;
  job_ttl_seconds: number;
  session_timeout_seconds: number;
  share_retention_days: number;
  max_share_rate_per_min: number;
}

let cache: { at: number; value: ChainParams } | null = null;
const TTL_MS = 30_000;

export async function chainParams(): Promise<ChainParams> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data, error } = await db().from('chain_params').select('*').eq('id', 1).single();
  if (error || !data) throw new Error(`chain_params nicht lesbar: ${error?.message}`);
  cache = { at: Date.now(), value: data as ChainParams };
  return cache.value;
}
