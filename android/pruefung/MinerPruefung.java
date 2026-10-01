package net.yskar.wallet;

import java.net.HttpURLConnection;
import java.net.URL;

/**
 * NativMiner gegen einen echten, lokal gestarteten Knoten (knoten.ts).
 *
 *  1. Solo: Shares werden angenommen, Bloecke gefunden, Kette waechst.
 *  2. Sitzung verworfen (wie nach dem Einfrieren): neue Sitzung, neue
 *     Extranonce -- danach muessen Shares WEITER angenommen werden.
 *  3. Pool auf einem Knoten ohne Pool: sauberer Abbruch mit Fehler.
 *  4. Stopp: Threads enden.
 */
public class MinerPruefung {
    static void pruefe(boolean b, String was) { if (!b) throw new AssertionError(was); System.out.println("ok  " + was); }

    public static void main(String[] a) throws Exception {
        Thread.setDefaultUncaughtExceptionHandler((t, ex) -> { ex.printStackTrace(); System.exit(1); });
        String basis = a.length > 0 ? a[0] : "http://127.0.0.1:18655";
        // Testnetz-Adresse (MINER_A aus tests/helpers/regtest.ts), per Argument
        String adresse = a.length > 1 ? a[1] : null;

        NativMiner.Einstellung e = new NativMiner.Einstellung();
        e.basis = basis; e.adresse = adresse; e.modus = "solo"; e.plattform = "pruefung"; e.threads = 2; e.duty = 100;
        NativMiner m = new NativMiner(e, () -> {});
        m.starten();
        // Der Knoten regelt das Share-Ziel auf ~1 Share je 30 s hoch (VarDiff);
        // am Anfang kommen sie schneller.
        long ende = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < ende && m.angenommen() < 3) Thread.sleep(200);
        String st = m.statusJson();
        System.out.println(st.substring(0, Math.min(400, st.length())));
        pruefe(m.angenommen() >= 3, "Solo: mindestens 3 Shares angenommen (" + m.angenommen() + ", abgelehnt " + m.abgelehnt() + ")");
        pruefe(m.abgelehnt() == 0, "Kein Share abgelehnt");
        pruefe(m.hashrate() > 0, "Hashrate gemessen: " + String.format("%.0f", m.hashrate()) + " H/s, Rechenweg " + m.rechenweg());

        // 2. Sitzung beim Knoten abmelden -> naechster Share: session_inactive -> neu eroeffnen
        String alt = m.sitzungFuerPruefung();
        post(basis + "/api/v2/session/stop", "{\"sessionId\":\"" + alt + "\"}");
        long vorher = m.angenommen();
        // Neue Sitzung startet wieder mit niedrigem Share-Ziel.
        ende = System.currentTimeMillis() + 60_000;
        while (System.currentTimeMillis() < ende && (m.angenommen() < vorher + 2 || alt.equals(m.sitzungFuerPruefung()))) Thread.sleep(200);
        pruefe(!alt.equals(m.sitzungFuerPruefung()), "Neue Sitzung nach Verwerfen");
        pruefe(m.angenommen() >= vorher + 2, "Shares nach neuer Sitzung angenommen (" + (m.angenommen() - vorher) + ", abgelehnt gesamt " + m.abgelehnt() + ")");

        // Leistungsregler
        m.dutySetzen(10);
        Thread.sleep(3000);
        double r10 = m.hashrate();
        m.dutySetzen(100);
        Thread.sleep(3000);
        double r100 = m.hashrate();
        pruefe(r10 < r100 * 0.5, String.format("Leistungsregler wirkt: 10 %% = %.0f H/s, 100 %% = %.0f H/s", r10, r100));

        m.stoppen("pruefung");
        Thread.sleep(500);
        pruefe(!m.laeuft() && m.hashrate() == 0, "Stopp");

        // 3. Pool auf Knoten ohne Pool
        NativMiner.Einstellung p = new NativMiner.Einstellung();
        p.basis = basis; p.adresse = adresse; p.modus = "pool"; p.plattform = "pruefung"; p.threads = 1; p.duty = 50;
        NativMiner mp = new NativMiner(p, () -> {});
        mp.starten();
        ende = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < ende && mp.laeuft()) Thread.sleep(100);
        pruefe(!mp.laeuft() && "sitzung".equals(mp.fehlerArt()), "Pool ohne Pool-Knoten: Abbruch mit Fehler " + mp.fehler());

        // Falsche Adresse
        NativMiner.Einstellung f = new NativMiner.Einstellung();
        f.basis = basis; f.adresse = "ysr1falsch"; f.modus = "solo"; f.plattform = "pruefung"; f.threads = 1;
        NativMiner mf = new NativMiner(f, () -> {});
        mf.starten();
        ende = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < ende && mf.laeuft()) Thread.sleep(100);
        pruefe(!mf.laeuft() && "bad_address".equals(mf.fehler()), "Falsche Adresse: Abbruch mit " + mf.fehler());

        System.out.println("Protokoll (Auszug):");
        for (String z : NativMiner.protokollLesen(12)) System.out.println("  " + z);
        System.out.println("ALLES OK");
        System.exit(0);
    }

    static void post(String url, String body) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setRequestMethod("POST"); h.setDoOutput(true); h.setRequestProperty("content-type", "application/json");
        h.getOutputStream().write(body.getBytes("UTF-8"));
        h.getResponseCode(); h.disconnect();
    }
}
