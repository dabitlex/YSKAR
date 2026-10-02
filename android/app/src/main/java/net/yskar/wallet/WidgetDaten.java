package net.yskar.wallet;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Was das Widget zeigt, und woher es das hat.
 *
 * Das Widget ist eine Mining-Uebersicht. Drei Quellen:
 *
 *  1. Der Mining-Dienst (MiningService): ob gerechnet wird, Hashrate,
 *     angenommene Shares, Beginn der Sitzung.
 *  2. Der Server, Stand des Netzes (holen): Blockhoehe, Netz-Hashrate,
 *     Blockbelohnung -- das zeigt das Widget, solange nicht gemint wird.
 *  3. Der Server, Verlauf der Adresse (sitzungHolen): was seit dem Start
 *     der laufenden Sitzung als Blockbelohnung oder Pool-Anteil
 *     gutgeschrieben wurde.
 *
 * Die Oberflaeche liefert ueber WidgetPlugin die Adresse und die Wahl
 * Hell/Dunkel. Guthaben und gefundene Bloecke nimmt die Ablage weiter an,
 * das Widget zeigt sie aber nicht mehr.
 *
 * Alles liegt in SharedPreferences; das Widget rendert daraus. Ohne
 * Adresse (keine Wallet eingerichtet) zeigt es einen Hinweis.
 */
final class WidgetDaten {
    static final String ABLAGE = "yskar_widget";
    static final String BASIS = "https://yskar.vercel.app";

    static final String K_ADRESSE = "adresse";
    static final String K_GUTHABEN = "guthaben";     // Einheiten als Text (bigint)
    static final String K_BLOECKE = "bloecke";
    static final String K_HOEHE = "hoehe";
    static final String K_DIFFICULTY = "difficulty";
    static final String K_MINING = "mining";
    static final String K_RATE = "rate";             // fertiger Text, z.B. "1.2 kH/s"
    static final String K_SHARES = "shares";
    static final String K_ZIEL = "ziel";             // Share-Difficulty
    static final String K_STAND = "stand";           // ms seit Epoche
    static final String K_THEMA = "thema";           // "hell" | "dunkel"
    static final String K_HASHRATE = "hashrate";     // eigene Hashrate, H/s
    static final String K_SEIT = "seit";             // Beginn der Sitzung, ms seit Epoche; 0 = keine
    static final String K_SITZUNG = "sitzung";       // seit Beginn gutgeschrieben, Einheiten als Text
    static final String K_NETZRATE = "netzrate";     // Hashrate des Netzes, H/s
    static final String K_BELOHNUNG = "belohnung";   // naechste Blockbelohnung, Einheiten als Text
    static final String K_NETZ_STAND = "netzStand";  // wann der Netzstand geholt wurde, ms

    private WidgetDaten() {}

    static SharedPreferences ablage(Context c) {
        return c.getSharedPreferences(ABLAGE, Context.MODE_PRIVATE);
    }

    /**
     * Stand des Netzes vom Server holen: Blockhoehe, Netz-Hashrate,
     * naechste Blockbelohnung. Das Konto fragt das Widget nicht mehr ab --
     * es zeigt kein Guthaben.
     *
     * Blockierend -- nur aus einem Hintergrund-Thread.
     */
    static boolean holen(Context c) {
        SharedPreferences p = ablage(c);
        String adresse = p.getString(K_ADRESSE, null);
        if (adresse == null || adresse.isEmpty()) return false;
        try {
            JSONObject netz = lesen(BASIS + "/api/v2/summary");
            if (netz == null) return false;
            long jetzt = System.currentTimeMillis();
            SharedPreferences.Editor e = p.edit();
            e.putLong(K_HOEHE, netz.optLong("height", 0));
            putDouble(e, K_DIFFICULTY, netz.optDouble("difficulty", 0));
            // "hashrate" ist null, solange der Server sie nicht schaetzen kann.
            putDouble(e, K_NETZRATE, netz.isNull("hashrate") ? 0 : netz.optDouble("hashrate", 0));
            e.putString(K_BELOHNUNG, netz.optString("nextReward", "0"));
            e.putLong(K_NETZ_STAND, jetzt);
            e.putLong(K_STAND, jetzt);
            e.apply();
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    /**
     * Was seit dem Start der laufenden Sitzung gutgeschrieben wurde.
     *
     * Gezaehlt wird, was die Kette sagt: Blockbelohnungen und Pool-Anteile
     * an diese Adresse in Bloecken ab dem Sitzungsbeginn. Normale
     * Ueberweisungen zaehlen nicht. Die Kette weiss nicht, welches Geraet
     * gerechnet hat -- mint dieselbe Adresse gleichzeitig woanders, zaehlt
     * das mit.
     *
     * Blockierend -- nur aus einem Hintergrund-Thread.
     */
    static boolean sitzungHolen(Context c) {
        SharedPreferences p = ablage(c);
        String adresse = p.getString(K_ADRESSE, null);
        long seit = p.getLong(K_SEIT, 0);
        if (adresse == null || adresse.isEmpty() || seit <= 0) return false;
        try {
            long summe = 0;
            String vor = null;
            // Hoechstens 20 Seiten zu 200 Eintraegen -- weit mehr, als eine
            // Sitzung je braucht; die Grenze verhindert nur eine Endlosschleife.
            for (int seite = 0; seite < 20; seite++) {
                String url = BASIS + "/api/v2/account/" + adresse + "/verlauf?richtung=ein&limit=200&von=" + (seit / 1000);
                if (vor != null) url += "&vor=" + URLEncoder.encode(vor, "UTF-8");
                JSONObject r = lesen(url);
                if (r == null) return false;
                JSONArray liste = r.optJSONArray("eintraege");
                if (liste == null) return false;
                for (int i = 0; i < liste.length(); i++) {
                    JSONObject e = liste.optJSONObject(i);
                    if (e == null) continue;
                    String art = e.optString("kind", "");
                    if (!"reward".equals(art) && !"pool".equals(art)) continue;
                    try { summe += Long.parseLong(e.optString("amount", "0")); }
                    catch (NumberFormatException ignored) { }
                }
                vor = r.isNull("weiter") ? null : r.optString("weiter", "");
                if (vor == null || vor.isEmpty()) break;
            }
            // Nur uebernehmen, wenn inzwischen keine neue Sitzung begonnen hat.
            if (p.getLong(K_SEIT, 0) != seit) return false;
            p.edit().putString(K_SITZUNG, Long.toString(summe)).apply();
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    private static JSONObject lesen(String url) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(8000);
            h.setReadTimeout(8000);
            h.setRequestProperty("accept", "application/json");
            if (h.getResponseCode() != 200) return null;
            BufferedReader r = new BufferedReader(new InputStreamReader(h.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String zeile;
            while ((zeile = r.readLine()) != null) sb.append(zeile);
            r.close();
            return new JSONObject(sb.toString());
        } catch (Exception ex) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    /** SharedPreferences kennt kein double -- als long-Bits ablegen. */
    static void putDouble(SharedPreferences.Editor e, String k, double v) {
        e.putLong(k, Double.doubleToRawLongBits(v));
    }

    static double getDouble(SharedPreferences p, String k, double sonst) {
        if (!p.contains(k)) return sonst;
        return Double.longBitsToDouble(p.getLong(k, Double.doubleToRawLongBits(sonst)));
    }
}
