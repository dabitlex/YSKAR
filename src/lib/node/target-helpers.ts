/**
 * Kleine Umrechnungen, die Knoten und Routen brauchen. Bewusst ein eigenes
 * Modul statt Kopien: Die Target-Konvention muss ueberall dieselbe sein.
 */
export {
  GENESIS_DIFFICULTY, MIN_DIFFICULTY, LWMA_WINDOW,
  targetFromDifficulty, achievedDifficulty, bytesToBig, rewardAt,
} from '../core/params.ts';

import { targetFromDifficulty } from '../core/params.ts';

/** Target als 32 Byte Big-Endian -- so erwartet es die WASM-Engine. */
export function sha256dTargetBytes(difficulty: bigint): Uint8Array {
  const b = new Uint8Array(32);
  let x = targetFromDifficulty(difficulty);
  for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return b;
}
