import { sha256 } from '@noble/hashes/sha2.js';

export function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

/**
 * Merkle-Baum mit Bereichstrennung.
 *
 *   Blatt   = sha256d(0x00 || wert)
 *   Knoten  = sha256d(0x01 || links || rechts)
 *
 * Das 0x00/0x01-Praefix verhindert, dass ein innerer Knoten als Blatt
 * ausgegeben werden kann.
 *
 * Bei ungerader Anzahl wird der letzte Knoten UNVERAENDERT hochgereicht,
 * statt ihn zu verdoppeln. Bitcoins Verdopplung erlaubt zwei verschiedene
 * Transaktionslisten mit demselben Root (CVE-2012-2459).
 */
export function merkleRoot(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return new Uint8Array(32);

  let level = leaves.map(l => {
    const b = new Uint8Array(1 + l.length);
    b[0] = 0x00; b.set(l, 1);
    return sha256d(b);
  });

  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) { next.push(level[i]); continue; }
      const b = new Uint8Array(1 + 64);
      b[0] = 0x01; b.set(level[i], 1); b.set(level[i + 1], 33);
      next.push(sha256d(b));
    }
    level = next;
  }
  return level[0];
}
