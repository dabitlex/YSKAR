package net.yskar.wallet;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Was das Widget zeigt, und woher es das hat.
 *
 * Zwei Quellen, absichtlich getrennt:
 *
 *  1. Die Oberflaeche (ueber WidgetPlugin): Guthaben, Bloecke, Hoehe --
 *     und waehrend des Minings Hashrate, Shares und Share-Ziel. Die
 *     Mining-Werte gibt es NUR von dort, sie entstehen im WebView.
 *  2. Der Server (holen): Guthaben, Bloecke, Hoehe, Difficulty. Fuer die
 *     Zeit, in der die App zu ist. Braucht nur die Adresse.
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

    private WidgetDaten() {}

    static SharedPreferences ablage(Context c) {
        return c.getSharedPreferences(ABLAGE, Context.MODE_PRIVATE);
    }

    /** Vom Server holen. Blockierend -- nur aus einem Hintergrund-Thread. */
    static boolean holen(Context c) {
        SharedPreferences p = ablage(c);
        String adresse = p.getString(K_ADRESSE, null);
        if (adresse == null || adresse.isEmpty()) return false;
        try {
            JSONObject konto = lesen(BASIS + "/api/v2/account/" + adresse);
            JSONObject netz = lesen(BASIS + "/api/v2/summary");
            SharedPreferences.Editor e = p.edit();
            if (konto != null) {
                e.putString(K_GUTHABEN, konto.optString("balance", "0"));
                e.putInt(K_BLOECKE, konto.optInt("blocksFound", 0));
            }
            if (netz != null) {
                e.putLong(K_HOEHE, netz.optLong("height", 0));
                putDouble(e, K_DIFFICULTY, netz.optDouble("difficulty", 0));
            }
            e.putLong(K_STAND, System.currentTimeMillis());
            e.apply();
            return konto != null || netz != null;
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
