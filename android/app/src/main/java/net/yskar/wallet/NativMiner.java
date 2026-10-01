package net.yskar.wallet;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Mining direkt im Android-Dienst, ohne WebView.
 *
 * Warum: Die Diagnose vom 01.10.2026 hat gezeigt, dass der WebView seine
 * Rechen-Threads ~40 s nach dem Wechsel in den Hintergrund einfriert,
 * obwohl der Vordergrunddienst laeuft (Herzschlag lueckenlos, Mining-
 * Protokoll 39 Minuten leer). Hier rechnet der Dienst selbst -- seine
 * Threads friert der WebView nicht ein.
 *
 * Spricht dieselbe Schnittstelle wie der Web-Miner (src/hooks/useMining.ts):
 *   POST {basis}/api/v2/session        { address, platform, mode }
 *   GET  {basis}/api/v2/job?session=   Job mit Header-Feldern und Share-Ziel
 *   POST {basis}/api/v2/share          { sessionId, jobId, nonce }
 *   POST {basis}/api/v2/session/stop   { sessionId }
 * Der Knoten prueft jeden Share selbst nach; der Miner behauptet nichts.
 *
 * Kein Android-Bezug: Thread-Prioritaet und Benachrichtigung kommen ueber
 * {@link Umgebung} von aussen. Dadurch laeuft dieser Kern auch auf dem
 * Rechner gegen einen echten Knoten (android/pruefung/MinerPruefung.java).
 *
 * Threads:
 *   steuerung  Sitzung, Job alle 40 s (oder sofort, wenn noetig)
 *   sender     gefundene Nonces einreichen, Antworten auswerten
 *   rechner-i  Nonce-Schleife, je ein eigener Abschnitt des Nonce-Raums
 */
final class NativMiner {

    /** Was der Kern von seiner Umgebung braucht. */
    interface Umgebung {
        /** Wird in jedem Rechen-Thread einmal gerufen (Android: Prioritaet). */
        void rechnerStart();
    }

    static final class Einstellung {
        String basis;       // z.B. https://yskar-main.dynv6.net
        String adresse;     // ysr1...
        String modus;       // "solo" | "pool"
        String plattform;   // "android"
        int threads = 2;
        int duty = 50;
    }

    private static final int SLOT_STRIDE = 4096;          // wie miner.worker.ts
    private static final long JOB_TAKT_MS = 40_000;       // Jobs leben 90 s
    private static final int MAX_SHARES = 44;             // wie ShareChart
    private static final String UA = "YSKAR-Wallet-Nativ/1";

    private final Einstellung e;
    private final Umgebung u;

    private volatile boolean laeuft = false;
    private volatile int duty;
    private volatile String sessionId;
    private volatile Arbeit arbeit;
    private volatile int[] ziel;
    private volatile boolean jobJetzt = false;
    private final Object wecker = new Object();
    private final LinkedBlockingQueue<Fund> funde = new LinkedBlockingQueue<>();
    private final List<Thread> threads = new ArrayList<>();
    private volatile String rechenweg = "schleife";

    // ---- Zustand fuer die Anzeige
    private final double[] rate;
    private final long[] rateZeit;
    private volatile long seit = 0;
    private volatile long letzteArbeit = 0;
    private volatile long angenommen = 0, abgelehnt = 0;
    private volatile String shareDifficulty = null;
    private volatile String modusIst = null;
    private volatile String poolJson = null;
    private volatile String messung = null;
    private volatile long jobHoehe = 0;
    private volatile String fehler = null, fehlerArt = null, fehlerDetail = null;
    private volatile String letzterShare = null;   // JSON
    private volatile String fund = null;           // JSON
    private final ArrayDeque<String> shares = new ArrayDeque<>();   // JSON-Eintraege

    // ---- Protokoll: prozessweit, ueberlebt einen Neustart des Miners
    private static final ArrayDeque<String> PROTOKOLL = new ArrayDeque<>();
    private static final int PROTOKOLL_MAX = 200;

    static void protokoll(String text) {
        String z = new SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new Date()) + " " + text;
        synchronized (PROTOKOLL) {
            PROTOKOLL.addLast(z.length() > 160 ? z.substring(0, 160) : z);
            while (PROTOKOLL.size() > PROTOKOLL_MAX) PROTOKOLL.removeFirst();
        }
    }

    static List<String> protokollLesen(int n) {
        synchronized (PROTOKOLL) {
            List<String> l = new ArrayList<>(PROTOKOLL);
            return l.subList(Math.max(0, l.size() - n), l.size());
        }
    }

    NativMiner(Einstellung e, Umgebung u) {
        this.e = e;
        this.u = u;
        this.duty = Math.max(1, Math.min(100, e.duty));
        int n = Math.max(1, Math.min(16, e.threads));
        e.threads = n;
        rate = new double[n];
        rateZeit = new long[n];
    }

    // ================================================================ Steuerung

    synchronized void starten() {
        if (laeuft) return;
        laeuft = true;
        seit = System.currentTimeMillis();
        letzteArbeit = seit;
        protokoll("nativ start " + e.modus + " " + e.threads + " threads " + duty + " %");
        Thread s = new Thread(this::steuerung, "yskar-steuerung");
        Thread v = new Thread(this::sender, "yskar-sender");
        // Daemon: Haengt einmal etwas, haelt es wenigstens den Prozess nicht fest.
        s.setDaemon(true); v.setDaemon(true);
        threads.add(s); threads.add(v);
        s.start(); v.start();
    }

    /** Anhalten. Die Sitzung wird im Hintergrund beim Knoten abgemeldet. */
    synchronized void stoppen(String grund) {
        if (!laeuft) return;
        laeuft = false;
        protokoll("nativ stop" + (grund != null ? " (" + grund + ")" : ""));
        for (Thread t : threads) t.interrupt();
        threads.clear();
        final String sid = sessionId;
        sessionId = null;
        if (sid != null) {
            new Thread(() -> {
                try { post("/session/stop", "{\"sessionId\":" + MiniJson.zk(sid) + "}"); }
                catch (Exception ignored) { }
            }, "yskar-abmelden").start();   // bewusst kein Daemon: Abmelden soll durchgehen
        }
    }

    boolean laeuft() { return laeuft; }

    void dutySetzen(int d) {
        duty = Math.max(1, Math.min(100, d));
        protokoll("leistung " + duty + " %");
    }

    int duty() { return duty; }

    private void wecken() {
        synchronized (wecker) { wecker.notifyAll(); }
    }

    private void jobAnfordern() {
        jobJetzt = true;
        wecken();
    }

    private void steuerung() {
        // Rechenweg messen: auf diesem Geraet, nicht angenommen.
        try {
            Rechenweg.Messung m = Rechenweg.auswaehlen(250);
            rechenweg = m.sieger;
            messung = m.toString();
            protokoll("messung " + messung);
        } catch (Throwable t) {
            protokoll("messung FEHLER " + t);
        }
        if (!laeuft) return;

        for (int i = 0; i < e.threads; i++) {
            final int slot = i;
            Thread t = new Thread(() -> rechner(slot), "yskar-rechner-" + i);
            t.setDaemon(true);
            synchronized (this) { if (!laeuft) return; threads.add(t); }
            t.start();
        }

        long naechster = 0;
        int fehlschlaege = 0;
        while (laeuft) {
            long jetzt = System.currentTimeMillis();
            if (jobJetzt || jetzt >= naechster) {
                jobJetzt = false;
                boolean ok;
                try { ok = jobHolen(); }
                catch (Fatal f) { fehlerSetzen(f.art, f.getMessage(), f.detail); stoppen(f.art); return; }
                catch (Exception ex) {
                    ok = false;
                    protokoll("job FEHLER " + kurz(ex));
                    fehlerSetzen("netz", kurz(ex), null);
                }
                if (ok) { fehlschlaege = 0; naechster = System.currentTimeMillis() + JOB_TAKT_MS; }
                else { fehlschlaege++; naechster = System.currentTimeMillis() + Math.min(60_000, 5_000L * fehlschlaege); }
            }
            long warten = Math.max(50, Math.min(1_000, naechster - System.currentTimeMillis()));
            synchronized (wecker) {
                try { if (!jobJetzt && laeuft) wecker.wait(warten); }
                catch (InterruptedException ie) { return; }
            }
        }
    }

    /** Fehler, nach denen Weiterversuchen sinnlos ist. */
    private static final class Fatal extends Exception {
        final String art, detail;
        Fatal(String art, String text, String detail) { super(text); this.art = art; this.detail = detail; }
    }

    private void sitzung() throws Exception {
        String body = "{\"address\":" + MiniJson.zk(e.adresse)
            + ",\"platform\":" + MiniJson.zk(e.plattform)
            + ",\"mode\":" + MiniJson.zk(e.modus) + "}";
        Map<String, Object> s = MiniJson.objekt(post("/session", body));
        String err = MiniJson.text(s, "error");
        if (err != null) {
            // Adresse falsch oder Pool fehlt: wiederholen hilft nicht.
            throw new Fatal("sitzung", err, MiniJson.text(s, "detail"));
        }
        String sid = MiniJson.text(s, "sessionId");
        if (sid == null) throw new IllegalStateException("keine sessionId");
        String modus = MiniJson.text(s, "mode");
        /*
          Wer Pool angefragt hat und Solo bekommt, wuerde im Glauben minen,
          seine Arbeit werde geteilt (wie useMining.ts).
        */
        if ("pool".equals(e.modus) && !"pool".equals(modus)) {
            throw new Fatal("kein_pool", "kein_pool", null);
        }
        sessionId = sid;
        modusIst = modus;
        Object pool = s.get("pool");
        poolJson = pool == null ? null : MiniJson.schreiben(pool);
        protokoll("session " + sid.substring(0, Math.min(8, sid.length())) + " " + modus + " " + e.threads + " threads");
    }

    private boolean jobHolen() throws Exception {
        if (sessionId == null) sitzung();
        Map<String, Object> j = MiniJson.objekt(get("/job?session=" + sessionId));
        if ("session_inactive".equals(MiniJson.text(j, "error"))) {
            // Der Knoten hat die Sitzung verworfen. Neue Sitzung, dann der
            // Job noch einmal -- mit neuer Extranonce, die der Job mitbringt.
            protokoll("session verworfen -- neu eroeffnen");
            sessionId = null;
            sitzung();
            j = MiniJson.objekt(get("/job?session=" + sessionId));
        }
        String jobId = MiniJson.text(j, "jobId");
        if (jobId == null) {
            String err = MiniJson.text(j, "error");
            protokoll("job FEHLER " + err);
            fehlerSetzen("netz", err != null ? err : "kein Job", null);
            return false;
        }

        byte[] kopf = header(j);
        String ex = MiniJson.text(j, "extranonce");
        Arbeit alt = arbeit;
        String zielHex = MiniJson.text(j, "target");
        if (zielHex != null && zielHex.length() == 64) ziel = Sha256d.woerter(zielHex);
        String sd = MiniJson.text(j, "shareDifficulty");
        if (sd != null) shareDifficulty = sd;
        jobHoehe = MiniJson.zahl(j, "height", 0);

        if (alt == null || !alt.jobId.equals(jobId) || !alt.extranonce.equals(ex)) {
            arbeit = new Arbeit(jobId, kopf, ex, alt == null ? 1 : alt.gen + 1);
        }
        if (fehler != null && "netz".equals(fehlerArt)) fehlerSetzen(null, null, null);
        protokoll("job " + jobId.substring(0, Math.min(8, jobId.length())) + " hoehe " + jobHoehe + " ziel " + sd);
        return true;
    }

    /** Header wie serializeHeader() in src/lib/core/block.ts (Nonce = 0). */
    static byte[] header(Map<String, Object> j) {
        byte[] b = new byte[Sha256d.HEADER];
        u32(b, 0, MiniJson.zahl(j, "version", 1));
        u32(b, 4, MiniJson.zahl(j, "height", 0));
        hex(b, 8, MiniJson.text(j, "prevHash"));
        hex(b, 40, MiniJson.text(j, "merkleRoot"));
        hex(b, 72, MiniJson.text(j, "stateRoot"));
        u64(b, 104, Long.parseUnsignedLong(MiniJson.text(j, "timestamp")));
        // Das ROHE Header-Feld (ab Konsens v4 kodiert), nicht difficultyWert.
        u32(b, 112, Long.parseLong(MiniJson.text(j, "difficulty")));
        u32(b, 116, MiniJson.zahl(j, "txCount", 0));
        String ex = MiniJson.text(j, "extranonce");
        u64(b, 120, ex == null ? 0 : Long.parseUnsignedLong(ex));
        return b;
    }

    private static void u32(byte[] b, int o, long v) {
        b[o] = (byte) v; b[o + 1] = (byte) (v >>> 8); b[o + 2] = (byte) (v >>> 16); b[o + 3] = (byte) (v >>> 24);
    }

    private static void u64(byte[] b, int o, long v) {
        for (int i = 0; i < 8; i++) b[o + i] = (byte) (v >>> (8 * i));
    }

    private static void hex(byte[] b, int o, String h) {
        if (h == null || h.length() != 64) throw new IllegalArgumentException("Hash erwartet 32 Byte");
        for (int i = 0; i < 32; i++) b[o + i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16);
    }

    private void zielAusDifficulty(String d) {
        try {
            BigInteger diff = new BigInteger(d);
            if (diff.signum() <= 0) return;
            String h = BigInteger.ONE.shiftLeft(240).divide(diff).toString(16);
            if (h.length() > 64) return;
            while (h.length() < 64) h = "0" + h;
            ziel = Sha256d.woerter(h);
            shareDifficulty = d;
        } catch (Exception ignored) { }
    }

    // ================================================================ Rechnen

    private static final class Arbeit {
        final String jobId, extranonce;
        final byte[] header;
        final int gen;
        Arbeit(String jobId, byte[] header, String extranonce, int gen) {
            this.jobId = jobId; this.header = header; this.extranonce = extranonce == null ? "" : extranonce; this.gen = gen;
        }
    }

    private static final class Fund {
        final String jobId, nonce, hash;
        Fund(String jobId, String nonce, String hash) { this.jobId = jobId; this.nonce = nonce; this.hash = hash; }
    }

    private void rechner(int slot) {
        try { u.rechnerStart(); } catch (Throwable ignored) { }
        Rechenweg rw = Rechenweg.neu(rechenweg);
        int gen = -1;
        String job = null, ex = null;
        int hi = 0, lo = 0;
        int stapel = 20_000;
        long fensterStart = System.nanoTime(), fensterHashes = 0;

        while (laeuft) {
            Arbeit a = arbeit;
            int[] z = ziel;
            if (a == null || z == null) {
                try { Thread.sleep(200); } catch (InterruptedException ie) { return; }
                continue;
            }
            if (a.gen != gen) {
                rw.vorbereiten(a.header);
                // Nur bei einem WIRKLICH neuen Job (oder neuer Extranonce) von
                // vorn -- sonst durchsuchte der Thread denselben Bereich erneut.
                if (!a.jobId.equals(job) || !a.extranonce.equals(ex)) { hi = slot * SLOT_STRIDE; lo = 0; }
                job = a.jobId; ex = a.extranonce; gen = a.gen;
            }

            long t0 = System.nanoTime();
            for (int k = 0; k < stapel; k++) {
                if (rw.pruefe(lo, hi, z)) {
                    long nonce = ((long) hi << 32) | (lo & 0xffffffffL);
                    funde.offer(new Fund(a.jobId, Long.toUnsignedString(nonce), rw.hashHex()));
                }
                lo++;
                if (lo == 0) hi++;
            }
            long t1 = System.nanoTime();
            long dt = Math.max(1, t1 - t0);
            fensterHashes += stapel;
            // Stapel auf ~35 ms einregeln, wie der Web-Worker.
            stapel = (int) Math.max(1_000, Math.min(4_000_000, (long) stapel * 35_000_000L / dt));

            if (t1 - fensterStart >= 1_000_000_000L) {
                rate[slot] = fensterHashes * 1e9 / (t1 - fensterStart);
                rateZeit[slot] = System.currentTimeMillis();
                letzteArbeit = rateZeit[slot];
                fensterHashes = 0;
                fensterStart = t1;
            }

            // Leistungsregler: weniger Prozent = weniger gerechnete Hashes.
            int d = duty;
            if (d < 100) {
                long pause = dt * (100 - d) / d;
                try { TimeUnit.NANOSECONDS.sleep(pause); } catch (InterruptedException ie) { return; }
            }
        }
    }

    // ================================================================ Einreichen

    private void sender() {
        while (laeuft) {
            Fund f;
            try { f = funde.poll(1, TimeUnit.SECONDS); } catch (InterruptedException ie) { return; }
            if (f == null) continue;
            String sid = sessionId;
            Arbeit a = arbeit;
            if (sid == null || a == null || !a.jobId.equals(f.jobId)) continue;   // alter Job: der Knoten lehnte ihn ab
            try {
                String body = "{\"sessionId\":" + MiniJson.zk(sid) + ",\"jobId\":" + MiniJson.zk(f.jobId)
                    + ",\"nonce\":" + MiniJson.zk(f.nonce) + "}";
                antwort(MiniJson.objekt(post("/share", body)), f);
            } catch (Exception ex) {
                protokoll("share FEHLER " + kurz(ex));
                fehlerSetzen("netz", kurz(ex), null);
            }
        }
    }

    private void antwort(Map<String, Object> r, Fund f) {
        boolean ok = MiniJson.wahr(r, "accepted");
        boolean block = MiniJson.wahr(r, "block");
        String grund = MiniJson.text(r, "reason");
        protokoll("share " + (ok ? "ok" : "abgelehnt " + grund) + (block ? " BLOCK" : ""));
        long jetzt = System.currentTimeMillis();

        String achieved = MiniJson.text(r, "achieved");
        if (achieved != null) {
            String eintrag = "{\"achieved\":" + zahlOderNull(achieved)
                + ",\"required\":" + zahlOderNull(MiniJson.text(r, "required"))
                + ",\"blockDifficulty\":" + zahlOderNull(MiniJson.text(r, "blockDifficulty"))
                + ",\"accepted\":" + ok + ",\"isBlock\":" + block + ",\"at\":" + jetzt + "}";
            synchronized (shares) {
                shares.addLast(eintrag);
                while (shares.size() > MAX_SHARES) shares.removeFirst();
            }
        }

        if (!ok) {
            abgelehnt++;
            if ("job_expired".equals(grund) || "stale_job".equals(grund) || "job_foreign".equals(grund)
                || "session_inactive".equals(grund)) {
                jobAnfordern();
                return;
            }
            fehlerSetzen("share", grund, MiniJson.text(r, "detail"));
            return;
        }
        angenommen++;
        if ("share".equals(fehlerArt) || "netz".equals(fehlerArt)) fehlerSetzen(null, null, null);
        letzterShare = "{\"hash\":" + MiniJson.zk(f.hash) + ",\"difficulty\":" + MiniJson.zk(MiniJson.text(r, "credited"))
            + ",\"at\":" + jetzt + "}";
        String neu = MiniJson.text(r, "shareDifficulty");
        if (neu != null && !neu.equals(shareDifficulty)) zielAusDifficulty(neu);
        if (block) {
            fund = "{\"height\":" + zahlOderNull(MiniJson.text(r, "height"))
                + ",\"reward\":" + MiniJson.zk(MiniJson.text(r, "reward"))
                + ",\"hash\":" + MiniJson.zk(MiniJson.text(r, "hash")) + ",\"at\":" + jetzt + "}";
            jobAnfordern();
        }
    }

    private static String zahlOderNull(String t) {
        if (t == null) return "null";
        return t.matches("-?\\d+(\\.\\d+)?([eE][-+]?\\d+)?") ? t : MiniJson.zk(t);
    }

    private void fehlerSetzen(String art, String text, String detail) {
        fehlerArt = art; fehler = text; fehlerDetail = detail;
    }

    // ================================================================ Anzeige

    /** Summe der Thread-Raten; wer > 3 s nichts gemeldet hat, zaehlt nicht. */
    double hashrate() {
        long jetzt = System.currentTimeMillis();
        double s = 0;
        for (int i = 0; i < rate.length; i++) if (jetzt - rateZeit[i] <= 3_000) s += rate[i];
        return laeuft ? s : 0;
    }

    long angenommen() { return angenommen; }
    long abgelehnt() { return abgelehnt; }
    /** Nur fuer die Pruefung auf dem Rechner (android/pruefung). */
    String sitzungFuerPruefung() { return sessionId; }
    String fehlerArt() { return fehlerArt; }
    String fehler() { return fehler; }
    String rechenweg() { return rechenweg; }
    String shareDifficulty() { return shareDifficulty; }

    /** Zustand als JSON fuer die Oberflaeche (MiningServicePlugin.nativStatus). */
    String statusJson() {
        StringBuilder b = new StringBuilder("{");
        b.append("\"laeuft\":").append(laeuft);
        b.append(",\"seit\":").append(seit);
        b.append(",\"hashrate\":").append(String.format(Locale.ROOT, "%.1f", hashrate()));
        b.append(",\"threads\":").append(e.threads);
        b.append(",\"duty\":").append(duty);
        b.append(",\"modus\":").append(MiniJson.zk(e.modus));
        b.append(",\"modusIst\":").append(MiniJson.zk(modusIst));
        b.append(",\"rechenweg\":").append(MiniJson.zk(rechenweg));
        b.append(",\"messung\":").append(MiniJson.zk(messung));
        b.append(",\"angenommen\":").append(angenommen);
        b.append(",\"abgelehnt\":").append(abgelehnt);
        b.append(",\"ziel\":").append(MiniJson.zk(shareDifficulty));
        b.append(",\"letzteArbeit\":").append(letzteArbeit);
        b.append(",\"jobHoehe\":").append(jobHoehe);
        b.append(",\"pool\":").append(poolJson == null ? "null" : poolJson);
        b.append(",\"fehler\":").append(MiniJson.zk(fehler));
        b.append(",\"fehlerArt\":").append(MiniJson.zk(fehlerArt));
        b.append(",\"fehlerDetail\":").append(MiniJson.zk(fehlerDetail));
        b.append(",\"letzterShare\":").append(letzterShare == null ? "null" : letzterShare);
        b.append(",\"fund\":").append(fund == null ? "null" : fund);
        b.append(",\"shares\":[");
        synchronized (shares) {
            boolean erst = true;
            for (String s : shares) { if (!erst) b.append(','); erst = false; b.append(s); }
        }
        b.append("]}");
        return b.toString();
    }

    // ================================================================ HTTP

    private String get(String pfad) throws Exception { return http("GET", pfad, null); }
    private String post(String pfad, String body) throws Exception { return http("POST", pfad, body); }

    private String http(String methode, String pfad, String body) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(e.basis + "/api/v2" + pfad).openConnection();
        try {
            h.setRequestMethod(methode);
            h.setConnectTimeout(15_000);
            h.setReadTimeout(20_000);
            h.setRequestProperty("accept", "application/json");
            h.setRequestProperty("user-agent", UA);
            if (body != null) {
                h.setDoOutput(true);
                h.setRequestProperty("content-type", "application/json");
                byte[] d = body.getBytes(StandardCharsets.UTF_8);
                h.setFixedLengthStreamingMode(d.length);
                try (OutputStream o = h.getOutputStream()) { o.write(d); }
            }
            int code = h.getResponseCode();
            InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
            String text = in == null ? "" : lesen(in);
            if (code >= 400) {
                // Erklaerenden Text des Servers mitnehmen, wenn es einen gibt.
                try {
                    Map<String, Object> m = MiniJson.objekt(text);
                    String d = MiniJson.text(m, "detail"), err = MiniJson.text(m, "error");
                    throw new IllegalStateException("HTTP " + code + (err != null ? " " + err : "") + (d != null ? ": " + d : ""));
                } catch (IllegalArgumentException kein) {
                    throw new IllegalStateException("HTTP " + code);
                }
            }
            return text;
        } finally {
            h.disconnect();
        }
    }

    private static String lesen(InputStream in) throws Exception {
        try (InputStream i = in) {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = i.read(buf)) > 0) o.write(buf, 0, n);
            return o.toString("UTF-8");
        }
    }

    private static String kurz(Throwable t) {
        String m = t.getMessage();
        String s = t.getClass().getSimpleName() + (m != null ? ": " + m : "");
        return s.length() > 120 ? s.substring(0, 120) : s;
    }
}
