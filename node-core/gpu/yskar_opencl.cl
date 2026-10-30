/*
 * YSKAR OpenCL-Kernel -- fuer AMD- und Intel-Grafikkarten.
 *
 * Diese Datei steht nicht allein: yskar_opencl.cpp gibt dem Treiber
 * yskar_sha256.h und danach diese Datei als EINEN Quelltext. Gerechnet wird
 * also dieselbe SHA-256d wie in yskar_gpu.cu und in der Pruefung mit gcc.
 *
 * Der Treiber uebersetzt den Quelltext beim ersten Start selbst fuer genau
 * die Karte, auf der er laeuft -- es gibt keine Liste von Architekturen wie
 * bei CUDA.
 *
 * Aufbau wie beim CUDA-Kernel:
 *   - Midstate und Ziel einmal je Job, je Versuch zwei Kompressionen.
 *   - Beide liegen im Konstantenspeicher und werden zu Beginn in Register
 *     geholt.
 *   - Jedes Arbeitselement prueft `iters` Nonces im Abstand der globalen
 *     Groesse: am Ende eines Stapels ist ein lueckenloser Bereich geprueft.
 *   - Nach einem Treffer rechnet das Element weiter (sonst waere die
 *     gemeldete Hashrate zu hoch).
 *
 * Treffer: treffer[0] ist 0 vor dem Stapel. Das erste Element, das einen
 * Treffer hat, setzt es per atomic_cmpxchg auf 1 und schreibt die Nonce in
 * treffer[1] (unten) und treffer[2] (oben). 64-Bit-Atomics braucht es dafuer
 * nicht -- die beherrscht nicht jede Karte.
 */

__kernel void yskar_kernel(ulong basis, uint iters,
                           __constant uint *mid_c, __constant uint *ziel_c,
                           __global volatile uint *treffer) {
  uint mid[8], ziel[8], hash[8];
  YSKAR_UNROLL
  for (int i = 0; i < 8; i++) { mid[i] = mid_c[i]; ziel[i] = ziel_c[i]; }

  const ulong schritt = (ulong)get_global_size(0);
  ulong nonce = basis + (ulong)get_global_id(0);

  for (uint k = 0; k < iters; k++, nonce += schritt) {
    yskar_hash_nonce_w(hash, mid, nonce);
    /* Fast immer entscheidet das erste Wort. Der volle Vergleich nur, wenn
       es nicht schon darueber liegt. */
    if (hash[0] <= ziel[0] && yskar_meets_target_w(hash, ziel)) {
      if (atomic_cmpxchg(&treffer[0], 0u, 1u) == 0u) {
        treffer[1] = (uint)nonce;
        treffer[2] = (uint)(nonce >> 32);
      }
    }
  }
}

/* Einen einzigen Hash auf der Karte rechnen -- fuer den Selbsttest. */
__kernel void yskar_einzel(ulong nonce, __constant uint *mid_c, __global uchar *aus) {
  if (get_global_id(0) != 0) return;
  uint mid[8];
  uchar h[32];
  for (int i = 0; i < 8; i++) mid[i] = mid_c[i];
  yskar_hash_nonce(h, mid, nonce);
  for (int i = 0; i < 32; i++) aus[i] = h[i];
}
