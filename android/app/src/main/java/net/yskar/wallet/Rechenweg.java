package net.yskar.wallet;

import java.security.MessageDigest;

/**
 * Wie ein Miner-Thread SHA-256d rechnet.
 *
 * Drei Wege, gleiches Ergebnis:
 *   schleife  reines Java, Midstate, schlichte Schleifen      (Sha256d.hash)
 *   kern      reines Java, Midstate, ausgerollt + gefaltet     (Sha256d.hashKern)
 *   digest    MessageDigest des Systems -- auf Android meist BoringSSL,
 *             das auf ARM die SHA-Befehle der CPU nutzt
 *
 * Welcher am schnellsten ist, haengt vom Geraet ab und laesst sich nicht
 * vorhersagen. Deshalb misst {@link #auswaehlen} beim Start jeden kurz und
 * nimmt den schnellsten. Die Messwerte gehen ins Protokoll.
 *
 * Jede Instanz gehoert genau einem Thread.
 */
abstract class Rechenweg {

    static final String[] NAMEN = { "schleife", "kern", "digest" };

    abstract String name();
    /** Header setzen; die Nonce-Bytes 128..135 werden ignoriert. */
    abstract void vorbereiten(byte[] header);
    /** Hash dieser Nonce <= Ziel? Danach liefert hashHex() den Hash. */
    abstract boolean pruefe(int nonceLow, int nonceHigh, int[] ziel);
    abstract String hashHex();

    static Rechenweg neu(String name) {
        switch (name) {
            case "kern": return new Midstate(true);
            case "digest":
                try { return new Digest(); } catch (Exception e) { return new Midstate(false); }
            default: return new Midstate(false);
        }
    }

    /** Ergebnis der Messung: Name des Siegers und Hashes/s je Weg. */
    static final class Messung {
        String sieger;
        final double[] rate = new double[NAMEN.length];
        @Override public String toString() {
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < NAMEN.length; i++) {
                if (i > 0) b.append(", ");
                b.append(NAMEN[i]).append(' ').append(String.format(java.util.Locale.ROOT, "%.2f", rate[i] / 1e6)).append(" MH/s");
            }
            return b.append(" -> ").append(sieger).toString();
        }
    }

    /**
     * Jeden Weg ~ms Millisekunden auf einem Thread rechnen lassen. Zuerst
     * eine kurze Aufwaermrunde, damit der JIT uebersetzt hat -- sonst misst
     * man den Interpreter.
     */
    static Messung auswaehlen(long ms) {
        Messung m = new Messung();
        byte[] kopf = new byte[Sha256d.HEADER];
        int[] nie = new int[8];   // Ziel 0: nie ein Treffer
        double beste = -1;
        for (int i = 0; i < NAMEN.length; i++) {
            Rechenweg r = neu(NAMEN[i]);
            if (!r.name().equals(NAMEN[i])) { m.rate[i] = 0; continue; }   // digest nicht verfuegbar
            r.vorbereiten(kopf);
            for (int n = 0; n < 20_000; n++) r.pruefe(n, 0, nie);
            long t0 = System.nanoTime(), ende = t0 + ms * 1_000_000L;
            int n = 0;
            while (System.nanoTime() < ende) { for (int k = 0; k < 2_000; k++) r.pruefe(n++, 1, nie); }
            m.rate[i] = n / ((System.nanoTime() - t0) / 1e9);
            if (m.rate[i] > beste) { beste = m.rate[i]; m.sieger = NAMEN[i]; }
        }
        return m;
    }

    // ------------------------------------------------------------------

    private static final class Midstate extends Rechenweg {
        private final Sha256d s = new Sha256d();
        private final boolean kern;
        Midstate(boolean kern) { this.kern = kern; }
        @Override String name() { return kern ? "kern" : "schleife"; }
        @Override void vorbereiten(byte[] header) { s.vorbereiten(header); }
        @Override boolean pruefe(int lo, int hi, int[] ziel) {
            if (kern) s.hashKern(lo, hi); else s.hash(lo, hi);
            return Sha256d.unterZiel(s.out, ziel);
        }
        @Override String hashHex() { return hex(s.hashBytes()); }
    }

    private static final class Digest extends Rechenweg {
        private final MessageDigest md = MessageDigest.getInstance("SHA-256");
        private final byte[] kopf = new byte[Sha256d.HEADER];
        private final byte[] d1 = new byte[32];
        private final byte[] d2 = new byte[32];
        private final int[] wort = new int[8];
        Digest() throws Exception {}
        @Override String name() { return "digest"; }
        @Override void vorbereiten(byte[] header) { System.arraycopy(header, 0, kopf, 0, Sha256d.HEADER); }
        @Override boolean pruefe(int lo, int hi, int[] ziel) {
            kopf[128] = (byte) lo; kopf[129] = (byte) (lo >>> 8); kopf[130] = (byte) (lo >>> 16); kopf[131] = (byte) (lo >>> 24);
            kopf[132] = (byte) hi; kopf[133] = (byte) (hi >>> 8); kopf[134] = (byte) (hi >>> 16); kopf[135] = (byte) (hi >>> 24);
            try {
                md.update(kopf, 0, Sha256d.HEADER);
                md.digest(d1, 0, 32);
                md.update(d1, 0, 32);
                md.digest(d2, 0, 32);
            } catch (java.security.DigestException e) {
                throw new IllegalStateException(e);
            }
            // Erstes Wort entscheidet fast immer; nur bei Gleichstand alle.
            int w0 = ((d2[0] & 0xff) << 24) | ((d2[1] & 0xff) << 16) | ((d2[2] & 0xff) << 8) | (d2[3] & 0xff);
            if (w0 != ziel[0]) return Integer.compareUnsigned(w0, ziel[0]) < 0;
            for (int i = 0; i < 8; i++) {
                int j = i * 4;
                wort[i] = ((d2[j] & 0xff) << 24) | ((d2[j + 1] & 0xff) << 16) | ((d2[j + 2] & 0xff) << 8) | (d2[j + 3] & 0xff);
            }
            return Sha256d.unterZiel(wort, ziel);
        }
        @Override String hashHex() { return hex(d2); }
    }

    static String hex(byte[] b) {
        char[] z = "0123456789abcdef".toCharArray();
        char[] o = new char[b.length * 2];
        for (int i = 0; i < b.length; i++) { o[i * 2] = z[(b[i] >> 4) & 15]; o[i * 2 + 1] = z[b[i] & 15]; }
        return new String(o);
    }
}
