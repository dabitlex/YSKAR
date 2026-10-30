/*
 * YSKAR SHA-256d fuer den 136-Byte-Blockheader.
 *
 * Dieselbe Datei wird zweimal uebersetzt:
 *
 *   nvcc  fuer die GPU     (yskar_gpu.cu)
 *   gcc   fuer die Pruefung (test/test_sha.c)
 *
 * Das ist Absicht. Die GPU-Ausfuehrung laesst sich nur auf einem Rechner mit
 * NVIDIA-Karte testen. Die RECHNUNG dagegen laesst sich ueberall pruefen --
 * wenn es dieselbe Rechnung ist. Ein zweiter, getrennt geschriebener
 * Pruefcode wuerde nur beweisen, dass der Pruefcode stimmt.
 *
 * ---------------------------------------------------------------------
 * Aufbau des Headers (136 Byte, siehe src/lib/core/block.ts):
 *
 *     0   version        u32 LE
 *     4   height         u32 LE
 *     8   prev_hash      32
 *    40   merkle_root    32
 *    72   state_root     32
 *   104   timestamp      u64 LE
 *   112   difficulty     u32 LE
 *   116   tx_count       u32 LE
 *   120   extranonce     u64 LE
 *   128   nonce          u64 LE
 *
 * 136 Byte sind zwei volle SHA-256-Bloecke (0..127) und acht Byte im
 * dritten. Die Nonce liegt VOLLSTAENDIG im dritten Block -- also ist der
 * Zustand nach den ersten beiden Bloecken fuer einen ganzen Job gleich.
 * Dieser "Midstate" wird einmal je Job gerechnet; je Versuch bleiben zwei
 * Kompressionen statt vier. Die WASM-Engine macht genau dasselbe.
 *
 * Verglichen wird der Hash BYTEWEISE VON VORN gegen das Ziel -- so wie
 * submitNonce() im Knoten es tut. Byte 0 ist das hoechstwertige. Die Karte
 * vergleicht dasselbe in acht Big-Endian-Woertern (yskar_meets_target_w).
 * ---------------------------------------------------------------------
 */
#ifndef YSKAR_SHA256_H
#define YSKAR_SHA256_H

/*
 * Ein dritter Uebersetzer: der OpenCL-Compiler im Grafiktreiber (AMD, Intel).
 * yskar_opencl.cpp gibt ihm diese Datei als Quelltext, zusammen mit
 * yskar_opencl.cl. OpenCL C kennt stdint.h nicht; die Typen heissen dort
 * uint, ulong, uchar und haben dieselbe Breite.
 */
/* Der OpenCL-Compiler setzt __OPENCL_C_VERSION__ (clang) und, im Treiber,
   __OPENCL_VERSION__. Eines von beiden genuegt. */
#if defined(__OPENCL_VERSION__) || defined(__OPENCL_C_VERSION__)
#  define YSKAR_IST_OPENCL 1
#endif

#ifdef YSKAR_IST_OPENCL
typedef uint  uint32_t;
typedef ulong uint64_t;
typedef uchar uint8_t;
#else
#  include <stdint.h>
#endif

#ifdef __CUDACC__
#  define YSKAR_FN __host__ __device__ __forceinline__
#  define YSKAR_CONST __constant__
#elif defined(YSKAR_IST_OPENCL)
/* "static" kennt OpenCL C erst ab 1.2 (Mesa Clover uebersetzt mit 1.1). */
#  if defined(__OPENCL_C_VERSION__) && __OPENCL_C_VERSION__ >= 120
#    define YSKAR_FN static inline __attribute__((always_inline))
#  else
#    define YSKAR_FN inline __attribute__((always_inline))
#  endif
#  define YSKAR_CONST __constant
#else
#  define YSKAR_FN static inline
#  define YSKAR_CONST static const
#endif

/* Schleifen mit fester Laenge auf der Karte GANZ ausrollen. Erst dann sind
   alle Indizes Konstanten, und die Arbeitswoerter liegen in Registern statt
   im langsamen lokalen Speicher. Nur im Uebersetzungslauf fuer die Karte;
   gcc, cl.exe und der Host-Teil von nvcc sehen nichts davon. */
#if defined(__CUDA_ARCH__) || defined(YSKAR_IST_OPENCL)
#  define YSKAR_UNROLL _Pragma("unroll")
#else
#  define YSKAR_UNROLL
#endif

#define YSKAR_HEADER_BYTES 136
#define YSKAR_NONCE_OFFSET 128

YSKAR_CONST uint32_t YSKAR_K[64] = {
  0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
  0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
  0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
  0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
  0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
  0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
  0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
  0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u,
};

/*
 * Rotation, Ch und Maj.
 *
 * In OpenCL ueber die eingebauten Funktionen: rotate() wird auf AMD zu einem
 * einzigen Befehl (v_alignbit), bitselect() zu v_bfi -- Ch und Maj kosten so
 * je einen Befehl statt drei bis fuenf. Das Ergebnis ist bitgleich:
 *   Ch(e,f,g)  = (e & f) ^ (~e & g)          = bitselect(g, f, e)
 *   Maj(a,b,c) = (a & b) ^ (a & c) ^ (b & c) = bitselect(a, b, c ^ a)
 * Ueberall sonst die gewohnte Schreibweise, die nvcc und gcc selbst auf
 * ihre Befehle abbilden.
 */
#ifdef YSKAR_IST_OPENCL
#  define YSKAR_ROTR(x, n) rotate((uint)(x), (uint)(32 - (n)))
#  define YSKAR_CH(e, f, g)  bitselect((uint)(g), (uint)(f), (uint)(e))
#  define YSKAR_MAJ(a, b, c) bitselect((uint)(a), (uint)(b), (uint)((c) ^ (a)))
#else
#  define YSKAR_ROTR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))
#  define YSKAR_CH(e, f, g)  (((e) & (f)) ^ (~(e) & (g)))
#  define YSKAR_MAJ(a, b, c) (((a) & (b)) ^ ((a) & (c)) ^ ((b) & (c)))
#endif

/* Anfangszustand von SHA-256. */
YSKAR_FN void yskar_sha_init(uint32_t s[8]) {
  s[0] = 0x6a09e667u; s[1] = 0xbb67ae85u; s[2] = 0x3c6ef372u; s[3] = 0xa54ff53au;
  s[4] = 0x510e527fu; s[5] = 0x9b05688cu; s[6] = 0x1f83d9abu; s[7] = 0x5be0cd19u;
}

/*
 * Eine SHA-256-Kompression ueber 16 Woerter.
 *
 * Die Woerter sind bereits Big-Endian gelesen -- SHA-256 rechnet in
 * Big-Endian, der YSKAR-Header ist Little-Endian. Die Umwandlung passiert
 * beim Einlesen, nicht hier.
 *
 * Der Nachrichtenplan braucht in jeder Runde nur die letzten 16 Woerter.
 * Statt 64 Woerter vorab zu rechnen (256 Byte -- auf der Karte zu viel fuer
 * Register, sie landeten im lokalen Speicher), wird ein Fenster aus 16
 * Woertern fortgeschrieben: Wort i ersetzt Wort i-16 an derselben Stelle.
 * Ganz ausgerollt sind alle Stellen fest; Woerter, die im Block konstant
 * sind (Nullen, Endbit, Laenge), rechnet der Compiler gleich mit aus.
 */
YSKAR_FN void yskar_sha_block(uint32_t s[8], const uint32_t in[16]) {
  uint32_t w[16];
  YSKAR_UNROLL
  for (int i = 0; i < 16; i++) w[i] = in[i];
  uint32_t a = s[0], b = s[1], c = s[2], d = s[3];
  uint32_t e = s[4], f = s[5], g = s[6], h = s[7];
  YSKAR_UNROLL
  for (int i = 0; i < 64; i++) {
    uint32_t wi;
    if (i < 16) {
      wi = w[i];
    } else {
      const uint32_t x = w[(i - 15) & 15], y = w[(i - 2) & 15];
      const uint32_t s0 = YSKAR_ROTR(x, 7) ^ YSKAR_ROTR(x, 18) ^ (x >> 3);
      const uint32_t s1 = YSKAR_ROTR(y, 17) ^ YSKAR_ROTR(y, 19) ^ (y >> 10);
      wi = w[i & 15] + s0 + w[(i - 7) & 15] + s1;
      w[i & 15] = wi;
    }
    const uint32_t S1 = YSKAR_ROTR(e, 6) ^ YSKAR_ROTR(e, 11) ^ YSKAR_ROTR(e, 25);
    const uint32_t ch = YSKAR_CH(e, f, g);
    const uint32_t t1 = h + S1 + ch + YSKAR_K[i] + wi;
    const uint32_t S0 = YSKAR_ROTR(a, 2) ^ YSKAR_ROTR(a, 13) ^ YSKAR_ROTR(a, 22);
    const uint32_t mj = YSKAR_MAJ(a, b, c);
    const uint32_t t2 = S0 + mj;
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  s[0] += a; s[1] += b; s[2] += c; s[3] += d;
  s[4] += e; s[5] += f; s[6] += g; s[7] += h;
}

/* 64 Byte als 16 Big-Endian-Woerter lesen. */
YSKAR_FN void yskar_load_be(uint32_t out[16], const uint8_t *p) {
  for (int i = 0; i < 16; i++) {
    out[i] = ((uint32_t)p[i*4] << 24) | ((uint32_t)p[i*4+1] << 16)
           | ((uint32_t)p[i*4+2] << 8) | (uint32_t)p[i*4+3];
  }
}

/*
 * Midstate: Zustand nach den ersten 128 Byte des Headers.
 *
 * Einmal je Job. Die Nonce beginnt bei Byte 128 und beruehrt diese beiden
 * Bloecke nicht.
 */
YSKAR_FN void yskar_midstate(uint32_t mid[8], const uint8_t header[YSKAR_HEADER_BYTES]) {
  uint32_t w[16];
  yskar_sha_init(mid);
  yskar_load_be(w, header);      yskar_sha_block(mid, w);
  yskar_load_be(w, header + 64); yskar_sha_block(mid, w);
}

/*
 * SHA-256d fuer eine Nonce, ausgehend vom Midstate -- als acht Woerter.
 *
 * Dritter Block: acht Nonce-Byte (Little-Endian, wie im Header), dann das
 * Endbit 0x80, dann Nullen, am Ende die Laenge in Bit (136 * 8 = 1088).
 *
 * Zweiter Durchlauf: 32 Byte Hash, 0x80, Nullen, Laenge 256 Bit.
 *
 * Ergebnis: acht Big-Endian-Woerter. Wort 0 enthaelt die Bytes 0..3 des
 * Hashes, Byte 0 im hoechstwertigen Teil -- dieselbe Reihenfolge, in der
 * Node den Hash ausgibt. So bleibt der Zielvergleich ein Wortvergleich.
 */
YSKAR_FN void yskar_hash_nonce_w(uint32_t t[8], const uint32_t mid[8], uint64_t nonce) {
  uint32_t s[8];
  YSKAR_UNROLL
  for (int i = 0; i < 8; i++) s[i] = mid[i];

  /* Die Nonce steht Little-Endian im Header und wird Big-Endian gelesen:
     jedes Wort ist die Byteumkehr seiner 32 Bit. */
  const uint32_t lo = (uint32_t)nonce, hi = (uint32_t)(nonce >> 32);
  uint32_t w[16];
  w[0] = (lo << 24) | ((lo & 0xff00u) << 8) | ((lo >> 8) & 0xff00u) | (lo >> 24);
  w[1] = (hi << 24) | ((hi & 0xff00u) << 8) | ((hi >> 8) & 0xff00u) | (hi >> 24);
  w[2] = 0x80000000u;
  YSKAR_UNROLL
  for (int i = 3; i < 15; i++) w[i] = 0;
  w[15] = YSKAR_HEADER_BYTES * 8;
  yskar_sha_block(s, w);

  /* Zweiter Durchlauf ueber die 32 Byte des ersten. */
  yskar_sha_init(t);
  YSKAR_UNROLL
  for (int i = 0; i < 8; i++) w[i] = s[i];
  w[8] = 0x80000000u;
  YSKAR_UNROLL
  for (int i = 9; i < 15; i++) w[i] = 0;
  w[15] = 256;
  yskar_sha_block(t, w);
}

/* Dasselbe als 32 Byte in der Reihenfolge, in der auch Node sie ausgibt. */
YSKAR_FN void yskar_hash_nonce(uint8_t out[32], const uint32_t mid[8], uint64_t nonce) {
  uint32_t t[8];
  yskar_hash_nonce_w(t, mid, nonce);
  for (int i = 0; i < 8; i++) {
    out[i*4]   = (uint8_t)(t[i] >> 24);
    out[i*4+1] = (uint8_t)(t[i] >> 16);
    out[i*4+2] = (uint8_t)(t[i] >> 8);
    out[i*4+3] = (uint8_t)(t[i]);
  }
}

/*
 * hash <= ziel, byteweise von vorn.
 *
 * Genau die Pruefung aus submitNonce(). Byte 0 ist das hoechstwertige;
 * beim ersten Unterschied entscheidet dieses Byte.
 */
YSKAR_FN int yskar_meets_target(const uint8_t hash[32], const uint8_t target[32]) {
  for (int i = 0; i < 32; i++) {
    if (hash[i] < target[i]) return 1;
    if (hash[i] > target[i]) return 0;
  }
  return 1;
}

/*
 * Dasselbe auf Woertern: 32 Byte als acht Big-Endian-Woerter, Wort 0 vorn.
 *
 * Ein Wortvergleich von vorn ist genau der Bytevergleich von vorn -- das
 * hoechstwertige Byte jedes Wortes ist das vordere. Auf der Karte sind es
 * so acht Vergleiche statt 32, und fast immer entscheidet schon der erste.
 */
YSKAR_FN int yskar_meets_target_w(const uint32_t hash[8], const uint32_t ziel[8]) {
  for (int i = 0; i < 8; i++) {
    if (hash[i] < ziel[i]) return 1;
    if (hash[i] > ziel[i]) return 0;
  }
  return 1;
}

/* 32 Byte Ziel als acht Big-Endian-Woerter -- einmal je Job. */
YSKAR_FN void yskar_ziel_woerter(uint32_t ziel[8], const uint8_t z[32]) {
  for (int i = 0; i < 8; i++) {
    ziel[i] = ((uint32_t)z[i*4] << 24) | ((uint32_t)z[i*4+1] << 16)
            | ((uint32_t)z[i*4+2] << 8) | (uint32_t)z[i*4+3];
  }
}

#endif
