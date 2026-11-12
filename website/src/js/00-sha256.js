/*
 * SHA-256 in reinem JavaScript. Die Seite rechnet damit Blockköpfe im Browser nach
 * (auch dort, wo crypto.subtle fehlt) und sucht in der Mining-Demo selbst nach Nonces.
 */
var Sha = (function () {
  'use strict';
  var K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  var INIT = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  var W = new Int32Array(64);

  /** Ein Kompressionsschritt: 64 Byte ab `off` in den Zustand H einrechnen. */
  function compress(H, M, off) {
    var i, j, a, b, c, d, e, f, g, h, x, y, t1, t2;
    for (i = 0; i < 16; i++) { j = off + i * 4; W[i] = (M[j] << 24) | (M[j + 1] << 16) | (M[j + 2] << 8) | M[j + 3]; }
    for (i = 16; i < 64; i++) {
      x = W[i - 15]; y = W[i - 2];
      W[i] = (W[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[i - 7] +
        (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
    }
    a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
    for (i = 0; i < 64; i++) {
      t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  function digest(bytes) {
    var n = bytes.length, total = ((n + 9 + 63) >> 6) << 6, M = new Uint8Array(total), H = new Int32Array(INIT), i, out = new Uint8Array(32);
    M.set(bytes); M[n] = 0x80;
    var bits = n * 8;
    M[total - 4] = bits >>> 24; M[total - 3] = (bits >>> 16) & 255; M[total - 2] = (bits >>> 8) & 255; M[total - 1] = bits & 255;
    for (i = 0; i < total; i += 64) compress(H, M, i);
    for (i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = (H[i] >>> 16) & 255; out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255; }
    return out;
  }

  function twice(bytes) { return digest(digest(bytes)); }

  /**
   * Nonce-Suche über einem 136-Byte-Kopf. Die ersten 128 Byte werden einmal eingerechnet
   * (Zwischenstand); je Versuch bleiben zwei Kompressionsschritte – genau wie im Protokoll beschrieben.
   * target: 8 Wörter (big-endian) als Int32Array, verglichen wird vorzeichenlos.
   */
  function makeSearch(header) {
    var mid = new Int32Array(INIT);
    compress(mid, header, 0); compress(mid, header, 64);
    var tail = new Uint8Array(64);
    tail[8] = 0x80; tail[62] = 0x04; tail[63] = 0x40;            // 136 Byte = 1088 Bit
    var outer = new Uint8Array(64);
    outer[32] = 0x80; outer[62] = 0x01; outer[63] = 0x00;         // 32 Byte = 256 Bit
    var H1 = new Int32Array(8), H2 = new Int32Array(8);
    return function search(start, count, target) {
      var n, i, lo, hi, found = -1;
      for (n = start; n < start + count; n++) {
        lo = n >>> 0; hi = Math.floor(n / 4294967296) >>> 0;
        tail[0] = lo & 255; tail[1] = (lo >>> 8) & 255; tail[2] = (lo >>> 16) & 255; tail[3] = lo >>> 24;
        tail[4] = hi & 255; tail[5] = (hi >>> 8) & 255; tail[6] = (hi >>> 16) & 255; tail[7] = hi >>> 24;
        H1.set(mid); compress(H1, tail, 0);
        for (i = 0; i < 8; i++) { outer[i * 4] = H1[i] >>> 24; outer[i * 4 + 1] = (H1[i] >>> 16) & 255; outer[i * 4 + 2] = (H1[i] >>> 8) & 255; outer[i * 4 + 3] = H1[i] & 255; }
        H2.set(INIT); compress(H2, outer, 0);
        for (i = 0; i < 8; i++) {
          var a = H2[i] >>> 0, b = target[i] >>> 0;
          if (a < b) { found = n; break; }
          if (a > b) break;
          if (i === 7) found = n;                                 // gleich dem Ziel gilt
        }
        if (found >= 0) break;
      }
      return { nonce: found, tried: (found >= 0 ? found - start + 1 : count) };
    };
  }

  return { digest: digest, twice: twice, makeSearch: makeSearch };
})();
