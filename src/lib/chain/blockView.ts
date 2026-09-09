/**
 * Aufbereitung eines Blocks der ERSTEN Kette fuer die Anzeige.
 *
 * Liegt bewusst hier und nicht in der Route: Next.js laesst in route.ts nur
 * HTTP-Methoden und bestimmte Konfigurationsfelder als Export zu. Ein
 * zusaetzlicher Export bricht den Build mit
 * "is not a valid Route export field".
 */
export function hex(v: string | null): string | null {
  if (!v) return null;
  return v.startsWith('\\x') ? v.slice(2) : v;
}

export function serializeBlockRow(b: Record<string, any>) {
  return {
    height: b.height,
    hash: hex(b.block_hash),
    prevHash: hex(b.prev_hash),
    merkleRoot: hex(b.merkle_root),
    jobSeed: hex(b.job_seed),
    timestamp: String(b.block_time),
    difficulty: Number(b.difficulty),
    extranonce: String(b.extranonce),
    nonce: String(b.nonce),
    reward: Number(b.reward),
    foundAt: b.found_at,
  };
}
