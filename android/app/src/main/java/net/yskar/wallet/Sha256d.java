package net.yskar.wallet;

/**
 * SHA-256d fuer den 136-Byte-Header der YSKAR-Kette, in reinem Java.
 *
 * Warum selbst geschrieben und nicht MessageDigest: Der Header besteht aus
 * drei SHA-256-Bloecken zu 64 Byte. Die Nonce steht in den Bytes 128..135,
 * also nur im DRITTEN Block. Die ersten beiden haengen allein am Job und
 * werden einmal vorgerechnet (Midstate). Je Nonce bleiben damit genau zwei
 * Kompressionen: der dritte Block des ersten Hashes und der eine Block des
 * zweiten. MessageDigest muesste jedes Mal alle 136 Byte neu verarbeiten.
 *
 * Kein Android-Bezug: Die Klasse wird auf dem Rechner gegen den
 * Genesis-Selbsttest und gegen den Server-Code der Kette geprueft
 * (android/test/NativMinerTest.java).
 *
 * Byte-Layout (muss zu serializeHeader() in src/lib/core/block.ts passen):
 *   128..131  Nonce, untere 32 Bit, little-endian
 *   132..135  Nonce, obere 32 Bit, little-endian
 */
final class Sha256d {

    static final int HEADER = 136;

    private static final int[] K = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    };
    private static final int[] IV = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    };

    /** Zustand nach den ersten zwei Bloecken (Bytes 0..127). */
    private final int[] mid = new int[8];
    /** Arbeitsspeicher -- je Instanz, also je Thread eine eigene. */
    private final int[] w = new int[64];
    private final int[] s = new int[8];
    /** Ergebnis des letzten hash(): die 8 Woerter des Doppel-Hashes. */
    final int[] out = new int[8];

    /** Header ohne Nonce setzen (Bytes 128..135 werden ignoriert). */
    void vorbereiten(byte[] header) {
        if (header.length < 128) throw new IllegalArgumentException("Header zu kurz");
        System.arraycopy(IV, 0, mid, 0, 8);
        block(mid, header, 0);
        block(mid, header, 64);
    }

    /**
     * Doppel-Hash fuer eine Nonce. Ergebnis in {@link #out}, Wort 0 zuerst --
     * als Bytes gelesen big-endian, also genau die Reihenfolge, in der die
     * Kette den Hash als Zahl vergleicht.
     *
     * Schlichte Schleifen. Bytes 128..135 sind little-endian, SHA-256 liest
     * big-endian -- daher reverseBytes.
     */
    void hash(int nonceLow, int nonceHigh) {
        w[0] = Integer.reverseBytes(nonceLow);
        w[1] = Integer.reverseBytes(nonceHigh);
        w[2] = 0x80000000;
        for (int i = 3; i < 15; i++) w[i] = 0;
        w[15] = HEADER * 8;
        System.arraycopy(mid, 0, s, 0, 8);
        kompression(s);

        System.arraycopy(s, 0, w, 0, 8);
        w[8] = 0x80000000;
        for (int i = 9; i < 15; i++) w[i] = 0;
        w[15] = 256;
        System.arraycopy(IV, 0, out, 0, 8);
        kompression(out);
    }

    /**
     * Dasselbe, ausgerollt und mit gefalteten Konstanten (Sha256dKern, erzeugt
     * von android/pruefung/gen_sha.py). Welche Fassung auf einem Geraet
     * schneller ist, misst der Miner beim Start (Rechenweg.auswaehlen).
     */
    void hashKern(int nonceLow, int nonceHigh) {
        Sha256dKern.block3(mid, Integer.reverseBytes(nonceLow), Integer.reverseBytes(nonceHigh), w, s);
        Sha256dKern.zweiter(s, w, out);
    }

    /** Ergebnis als 32 Byte (big-endian je Wort). */
    byte[] hashBytes() {
        byte[] b = new byte[32];
        for (int i = 0; i < 8; i++) {
            b[i * 4] = (byte) (out[i] >>> 24);
            b[i * 4 + 1] = (byte) (out[i] >>> 16);
            b[i * 4 + 2] = (byte) (out[i] >>> 8);
            b[i * 4 + 3] = (byte) out[i];
        }
        return b;
    }

    /**
     * Hash <= Ziel? Beide als 256-Bit-Zahl, big-endian. Fast immer
     * entscheidet schon das erste Wort.
     */
    static boolean unterZiel(int[] hash, int[] ziel) {
        for (int i = 0; i < 8; i++) {
            if (hash[i] != ziel[i]) return Integer.compareUnsigned(hash[i], ziel[i]) < 0;
        }
        return true;
    }

    /** 32 Byte (64 Hex-Zeichen) -> 8 Woerter, big-endian. */
    static int[] woerter(String hex) {
        if (hex == null || hex.length() != 64) throw new IllegalArgumentException("Ziel muss 32 Byte sein");
        int[] r = new int[8];
        for (int i = 0; i < 8; i++) r[i] = (int) Long.parseLong(hex.substring(i * 8, i * 8 + 8), 16);
        return r;
    }

    private void block(int[] zustand, byte[] d, int off) {
        for (int i = 0; i < 16; i++) {
            int j = off + i * 4;
            w[i] = ((d[j] & 0xff) << 24) | ((d[j + 1] & 0xff) << 16) | ((d[j + 2] & 0xff) << 8) | (d[j + 3] & 0xff);
        }
        kompression(zustand);
    }

    /** Eine SHA-256-Kompression; w[0..15] muss gefuellt sein. */
    private void kompression(int[] h) {
        final int[] w = this.w;
        for (int i = 16; i < 64; i++) {
            int x = w[i - 15], y = w[i - 2];
            int s0 = Integer.rotateRight(x, 7) ^ Integer.rotateRight(x, 18) ^ (x >>> 3);
            int s1 = Integer.rotateRight(y, 17) ^ Integer.rotateRight(y, 19) ^ (y >>> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        int a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; i++) {
            int S1 = Integer.rotateRight(e, 6) ^ Integer.rotateRight(e, 11) ^ Integer.rotateRight(e, 25);
            int ch = (e & f) ^ (~e & g);
            int t1 = hh + S1 + ch + K[i] + w[i];
            int S0 = Integer.rotateRight(a, 2) ^ Integer.rotateRight(a, 13) ^ Integer.rotateRight(a, 22);
            int maj = (a & b) ^ (a & c) ^ (b & c);
            int t2 = S0 + maj;
            hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
}
