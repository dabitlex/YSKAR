package net.yskar.wallet;

import java.security.MessageDigest;
import java.util.Random;

/** Sha256d gegen Genesis-Selbsttest und gegen MessageDigest (zufaellige Header). */
public class ShaPruefung {
    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x)); return s.toString(); }
    static byte[] unhex(String h) { byte[] b = new byte[h.length() / 2]; for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16); return b; }

    public static void main(String[] a) throws Exception {
        String kopf = "010000000000000000000000000000000000000000000000000000000000000000000000000000001007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca5780a1a06a000000000010000001000000000000000000000024bf060300000000";
        Sha256d s = new Sha256d();
        s.vorbereiten(unhex(kopf));
        s.hash(50773796, 0);
        String h = hex(s.hashBytes());
        if (!h.equals("000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66")) throw new AssertionError("Genesis: " + h);
        System.out.println("genesis ok " + h);

        Random r = new Random(7);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (int n = 0; n < 2000; n++) {
            byte[] k = new byte[136]; r.nextBytes(k);
            int lo = r.nextInt(), hi = r.nextInt();
            k[128] = (byte) lo; k[129] = (byte) (lo >>> 8); k[130] = (byte) (lo >>> 16); k[131] = (byte) (lo >>> 24);
            k[132] = (byte) hi; k[133] = (byte) (hi >>> 8); k[134] = (byte) (hi >>> 16); k[135] = (byte) (hi >>> 24);
            byte[] soll = md.digest(md.digest(k));
            s.vorbereiten(k); s.hash(lo, hi);
            if (!hex(s.hashBytes()).equals(hex(soll))) throw new AssertionError("Abweichung bei " + n);
        }
        System.out.println("2000 Zufallsheader ok");

        // unterZiel
        int[] ziel = Sha256d.woerter("0000ffff" + "f".repeat(56));
        if (!Sha256d.unterZiel(new int[]{0x0000fffe, -1, -1, -1, -1, -1, -1, -1}, ziel)) throw new AssertionError("unterZiel 1");
        if (Sha256d.unterZiel(new int[]{0x00010000, 0, 0, 0, 0, 0, 0, 0}, ziel)) throw new AssertionError("unterZiel 2");
        if (!Sha256d.unterZiel(new int[]{0x0000ffff, -1, -1, -1, -1, -1, -1, -1}, ziel)) throw new AssertionError("unterZiel gleich");
        System.out.println("unterZiel ok");

        // Alle Rechenwege gegen MessageDigest-Referenz und Genesis
        for (String name : Rechenweg.NAMEN) {
            Rechenweg rw = Rechenweg.neu(name);
            rw.vorbereiten(unhex(kopf));
            int[] alles = Sha256d.woerter("f".repeat(64));
            if (!rw.pruefe(50773796, 0, alles) || !rw.hashHex().equals("000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66"))
                throw new AssertionError(name + " Genesis: " + rw.hashHex());
            Random rr = new Random(11);
            for (int n = 0; n < 500; n++) {
                byte[] k = new byte[136]; rr.nextBytes(k);
                int lo = rr.nextInt(), hi = rr.nextInt();
                rw.vorbereiten(k);
                k[128] = (byte) lo; k[129] = (byte) (lo >>> 8); k[130] = (byte) (lo >>> 16); k[131] = (byte) (lo >>> 24);
                k[132] = (byte) hi; k[133] = (byte) (hi >>> 8); k[134] = (byte) (hi >>> 16); k[135] = (byte) (hi >>> 24);
                byte[] soll = md.digest(md.digest(k));
                // Ziel = genau der Hash: muss treffen; Ziel = Hash - 1 (im letzten Wort): darf nicht
                int[] z = Sha256d.woerter(hex(soll));
                if (!rw.pruefe(lo, hi, z)) throw new AssertionError(name + " Ziel==Hash verfehlt " + n);
                if (!rw.hashHex().equals(hex(soll))) throw new AssertionError(name + " Hash falsch " + n);
                boolean nullHash = true; for (int v : z) if (v != 0) nullHash = false;
                if (!nullHash) {
                    int[] klein = z.clone(); int i = 7; while (klein[i] == 0) { klein[i] = -1; i--; } klein[i]--;
                    if (rw.pruefe(lo, hi, klein)) throw new AssertionError(name + " Ziel<Hash getroffen " + n);
                }
            }
            System.out.println("Rechenweg " + name + " ok");
        }
        System.out.println("Messung: " + Rechenweg.auswaehlen(1500));
    }
}
