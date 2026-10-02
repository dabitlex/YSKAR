package net.yskar.wallet;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Homescreen-Widget: die Mining-Uebersicht.
 *
 *   Mining laeuft    verdient in dieser Sitzung, Stopp-Knopf,
 *                    Hashrate / Laufzeit / Shares
 *   Mining gestoppt  Stand des Netzes: Block / Netz-Hashrate / Belohnung
 *
 * Das Wallet-Guthaben zeigt es nicht. Hell oder Dunkel waehlt der Nutzer in
 * der App (WidgetPlugin.thema); je Darstellung gibt es ein eigenes Layout
 * mit denselben Kennungen.
 *
 * Gerendert wird immer aus WidgetDaten. Waehrend des Minings schreibt der
 * MiningService alle paar Sekunden hinein. Sonst ruft Android onUpdate alle
 * 30 Minuten (widget_info.xml), und das Widget holt den Stand des Netzes
 * selbst. Der Pfeil rechts oben holt sofort, der Stopp-Knopf beendet das
 * Mining, ein Tipp auf den Rest oeffnet die App.
 */
public class YskarWidget extends AppWidgetProvider {

    static final String AKTION_HOLEN = "net.yskar.wallet.WIDGET_HOLEN";
    static final String AKTION_STOPP = "net.yskar.wallet.WIDGET_STOPP";

    /** So alt darf der Stand des Netzes sein, bevor onUpdate neu holt. */
    private static final long FRISCH_MS = 60_000;
    /** So alt darf er sein, solange die App offen ist und nur nachzieht. */
    private static final long NETZ_FRISCH_MS = 5 * 60_000;

    private static final AtomicBoolean holt = new AtomicBoolean(false);
    private static volatile long letzterVersuch = 0;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        rendern(c);
        SharedPreferences p = WidgetDaten.ablage(c);
        boolean alt = System.currentTimeMillis() - p.getLong(WidgetDaten.K_NETZ_STAND, 0) > FRISCH_MS;
        if (alt && !miningLaeuft(p)) holenImHintergrund(c);
    }

    /** Der Nutzer hat das Widget groesser oder kleiner gezogen. */
    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle optionen) {
        rendern(c);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        String aktion = i.getAction();
        if (AKTION_HOLEN.equals(aktion)) {
            holenImHintergrund(c);
        } else if (AKTION_STOPP.equals(aktion)) {
            stoppen(c);
        }
    }

    /**
     * Stopp-Knopf. Derselbe Weg wie "Stoppen" in der Benachrichtigung: Der
     * Dienst sagt es der Oberflaeche und beendet sich.
     *
     * Der Dienst kann nur laufen, wenn dieser Prozess lebt -- dann ist
     * MiningService.laeuft wahr, und startService ist erlaubt, weil ein
     * Vordergrunddienst laeuft. Ist der Prozess inzwischen neu gestartet,
     * rechnet auch nichts mehr; dann wird nur die Anzeige berichtigt.
     */
    private static void stoppen(Context c) {
        if (MiningService.laeuft) {
            try {
                c.startService(new Intent(c, MiningService.class)
                    .setAction(MiningService.AKTION_STOP_NUTZER));
            } catch (Exception ignored) { /* Anzeige unten trotzdem berichtigen */ }
        }
        WidgetDaten.ablage(c).edit().putBoolean(WidgetDaten.K_MINING, false).apply();
        rendern(c);
        holenImHintergrund(c);
    }

    /**
     * Rechnet gerade jemand? Der Merker in der Ablage allein reicht nicht:
     * Beendet Android den Prozess, bleibt er auf "an" stehen. Der Dienst
     * lebt im selben Prozess -- seine Variable ist die Wahrheit.
     */
    private static boolean miningLaeuft(SharedPreferences p) {
        return MiningService.laeuft && p.getBoolean(WidgetDaten.K_MINING, false);
    }

    /** Stand des Netzes (und beim Mining den Verdienst der Sitzung) holen, dann zeichnen. */
    static void holenImHintergrund(Context c) {
        final Context app = c.getApplicationContext();
        if (!holt.compareAndSet(false, true)) return;
        letzterVersuch = System.currentTimeMillis();
        try {
            new Thread(() -> {
                try {
                    WidgetDaten.holen(app);
                    if (miningLaeuft(WidgetDaten.ablage(app))) WidgetDaten.sitzungHolen(app);
                    rendern(app);
                } finally {
                    holt.set(false);
                }
            }, "widget").start();
        } catch (Throwable t) {
            holt.set(false);
        }
    }

    /**
     * Die App ist offen und meldet ihren Stand: Fehlt der Stand des Netzes
     * oder ist er aelter als fuenf Minuten, holt ihn das Widget nach.
     * Hoechstens ein Versuch je Minute -- auch ohne Netz.
     */
    static void netzNachziehen(Context c) {
        SharedPreferences p = WidgetDaten.ablage(c);
        if (miningLaeuft(p)) return;
        long jetzt = System.currentTimeMillis();
        if (jetzt - p.getLong(WidgetDaten.K_NETZ_STAND, 0) < NETZ_FRISCH_MS) return;
        if (jetzt - letzterVersuch < FRISCH_MS) return;
        holenImHintergrund(c);
    }

    /** Alle Instanzen neu zeichnen. Auch vom Plugin und vom Dienst gerufen. */
    static void rendern(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, YskarWidget.class));
            for (int id : ids) m.updateAppWidget(id, bauen(c, m.getAppWidgetOptions(id)));
        } catch (RuntimeException ignored) {
            // Ein Widget darf weder die App noch den Mining-Dienst mitreissen.
        }
    }

    /* ---- Farben, die sich mit dem Zustand aendern (der Rest steht im Layout) ---- */

    private static final int HELL_TEXT = 0xFF0E1A2F, HELL_GEDIMMT = 0xFF5B6B84, HELL_BLAU = 0xFF1F5BF0;
    private static final int DUNKEL_TEXT = 0xFFEAF0F8, DUNKEL_GEDIMMT = 0xFF9EADC6, DUNKEL_BLAU = 0xFF4F82FF;

    private static RemoteViews bauen(Context c, Bundle optionen) {
        SharedPreferences p = WidgetDaten.ablage(c);
        boolean dunkel = "dunkel".equals(p.getString(WidgetDaten.K_THEMA, "hell"));
        RemoteViews v = new RemoteViews(c.getPackageName(), dunkel ? R.layout.widget_dunkel : R.layout.widget);
        int farbeText = dunkel ? DUNKEL_TEXT : HELL_TEXT;
        int farbeGedimmt = dunkel ? DUNKEL_GEDIMMT : HELL_GEDIMMT;
        int farbeBlau = dunkel ? DUNKEL_BLAU : HELL_BLAU;

        Locale l = Locale.getDefault();
        NumberFormat ganz = NumberFormat.getIntegerInstance(l);

        String adresse = p.getString(WidgetDaten.K_ADRESSE, null);
        boolean wallet = adresse != null && !adresse.isEmpty();
        boolean mining = wallet && miningLaeuft(p);

        if (!wallet) {
            v.setViewVisibility(R.id.w_pille, View.GONE);
            v.setViewVisibility(R.id.w_stopp, View.GONE);
            v.setTextViewText(R.id.w_stand, "");
            v.setTextViewText(R.id.w_gross, c.getString(R.string.widget_keine_wallet));
            gross(c, v, 16);
            v.setTextColor(R.id.w_gross, farbeGedimmt);
            v.setTextViewText(R.id.w_unter, c.getString(R.string.widget_tippen));
        } else {
            v.setViewVisibility(R.id.w_pille, View.VISIBLE);
            long stand = p.getLong(WidgetDaten.K_STAND, 0);
            v.setTextViewText(R.id.w_stand, stand > 0 ? uhrzeit(c, stand, l) : "");

            if (mining) {
                v.setTextViewText(R.id.w_status, c.getString(R.string.widget_laeuft));
                v.setTextColor(R.id.w_status, farbeBlau);
                v.setImageViewResource(R.id.w_punkt,
                    dunkel ? R.drawable.widget_punkt_an_dunkel : R.drawable.widget_punkt_an);

                v.setTextViewText(R.id.w_gross, "+" + betrag(p.getString(WidgetDaten.K_SITZUNG, "0"), l, true) + " YSR");
                gross(c, v, 24);
                v.setTextColor(R.id.w_gross, farbeText);
                v.setTextViewText(R.id.w_unter, c.getString(R.string.widget_sitzung));
                v.setViewVisibility(R.id.w_stopp, View.VISIBLE);

                v.setTextViewText(R.id.w_f1, rate(WidgetDaten.getDouble(p, WidgetDaten.K_HASHRATE, 0), l));
                v.setTextViewText(R.id.w_f1t, c.getString(R.string.widget_hashrate));
                v.setTextViewText(R.id.w_f2, laufzeit(c, p.getLong(WidgetDaten.K_SEIT, 0)));
                v.setTextViewText(R.id.w_f2t, c.getString(R.string.widget_laufzeit));
                v.setTextViewText(R.id.w_f3, ganz.format(p.getInt(WidgetDaten.K_SHARES, 0)));
                v.setTextViewText(R.id.w_f3t, c.getString(R.string.widget_f_shares));
            } else {
                v.setTextViewText(R.id.w_status, c.getString(R.string.widget_gestoppt));
                v.setTextColor(R.id.w_status, farbeGedimmt);
                v.setImageViewResource(R.id.w_punkt,
                    dunkel ? R.drawable.widget_punkt_aus_dunkel : R.drawable.widget_punkt_aus);

                v.setTextViewText(R.id.w_gross, c.getString(R.string.widget_mining_gestoppt));
                gross(c, v, 20);
                v.setTextColor(R.id.w_gross, farbeGedimmt);
                v.setTextViewText(R.id.w_unter, c.getString(R.string.widget_tippen));
                v.setViewVisibility(R.id.w_stopp, View.GONE);

                long hoehe = p.getLong(WidgetDaten.K_HOEHE, 0);
                double netzrate = WidgetDaten.getDouble(p, WidgetDaten.K_NETZRATE, 0);
                String belohnung = p.getString(WidgetDaten.K_BELOHNUNG, "0");
                v.setTextViewText(R.id.w_f1, hoehe > 0 ? "#" + ganz.format(hoehe) : "—");
                v.setTextViewText(R.id.w_f1t, c.getString(R.string.widget_block));
                v.setTextViewText(R.id.w_f2, netzrate > 0 ? rate(netzrate, l) : "—");
                v.setTextViewText(R.id.w_f2t, c.getString(R.string.widget_netzrate));
                v.setTextViewText(R.id.w_f3, istNull(belohnung) ? "—" : betrag(belohnung, l, false) + " YSR");
                v.setTextViewText(R.id.w_f3t, c.getString(R.string.widget_belohnung));
            }
        }

        einpassen(c, v, optionen, wallet, mining);

        // Tipp auf die Flaeche: App oeffnen.
        Intent oeffnen = new Intent(c, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.w_wurzel, PendingIntent.getActivity(
            c, 0, oeffnen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // Pfeil: sofort vom Server holen.
        Intent holen = new Intent(c, YskarWidget.class).setAction(AKTION_HOLEN);
        v.setOnClickPendingIntent(R.id.w_holen, PendingIntent.getBroadcast(
            c, 1, holen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // Stopp: Mining beenden.
        Intent stopp = new Intent(c, YskarWidget.class).setAction(AKTION_STOPP);
        v.setOnClickPendingIntent(R.id.w_stopp, PendingIntent.getBroadcast(
            c, 2, stopp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }

    /**
     * Groesse der grossen Zeile. Sie waechst mit der Schriftgroesse des
     * Systems, aber nur bis 115 % -- darueber passt der Verdienst nicht mehr
     * neben den Stopp-Knopf.
     */
    private static void gross(Context c, RemoteViews v, float sp) {
        v.setTextViewTextSize(R.id.w_gross, TypedValue.COMPLEX_UNIT_DIP, sp * Math.min(schrift(c), 1.15f));
    }

    private static float schrift(Context c) {
        try {
            float f = c.getResources().getConfiguration().fontScale;
            return f > 0 ? f : 1f;
        } catch (RuntimeException e) {
            return 1f;
        }
    }

    /**
     * Passt nicht alles in die Hoehe, faellt zuerst weg, was am wenigsten
     * sagt -- statt dass der Launcher unten etwas abschneidet:
     *
     *   1. die Unterzeile
     *   2. die Beschriftung der drei Felder
     *   3. die Felder (dann wieder mit Unterzeile, wenn sie passt)
     *
     * Die Hoehen sind aus dem Layout gerechnet, in dp: Abstaende fest, eine
     * Textzeile 1,33-mal ihre Schriftgroesse, und die Schrift waechst mit der
     * Schriftgroesse des Systems. Meldet der Launcher keine Groesse, bleibt
     * alles sichtbar.
     */
    private static void einpassen(Context c, RemoteViews v, Bundle optionen, boolean wallet, boolean mining) {
        int hoehe = 0, breite = 0;
        float schrift = schrift(c);
        try {
            if (optionen != null) {
                boolean quer = c.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
                hoehe = optionen.getInt(quer
                    ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
                breite = optionen.getInt(quer
                    ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            }
        } catch (RuntimeException ignored) { }

        // Rand oben/unten 22, Kopf 32, Abstand zur Hauptzeile 2.
        final float kopf = 56f;
        // Grosse Zeile: 24 / 20 / 16 sp, siehe gross().
        float gross = (mining ? 32f : wallet ? 26.6f : 21.3f) * Math.min(schrift, 1.15f);
        float unter = 16.6f * schrift;
        // Der Stopp-Knopf steht neben der Hauptzeile und kann hoeher sein als sie.
        float knopf = mining ? 20f + 16.6f * schrift : 0f;
        float mitUnter = kopf + Math.max(gross + unter, knopf);
        float ohneUnter = kopf + Math.max(gross, knopf);
        // Felder: Abstand 8, Innenrand 12, Wert 13 sp, Beschriftung 10,5 sp.
        // Der Wert waechst nur bis 130 % mit -- sonst passt "2,10 MH/s" nicht
        // mehr in ein Drittel der Breite.
        float wert = Math.min(schrift, 1.3f);
        float felderKnapp = 20f + 17.3f * wert;
        float felderVoll = felderKnapp + 14f * schrift;
        v.setTextViewTextSize(R.id.w_f1, TypedValue.COMPLEX_UNIT_DIP, 13f * wert);
        v.setTextViewTextSize(R.id.w_f2, TypedValue.COMPLEX_UNIT_DIP, 13f * wert);
        v.setTextViewTextSize(R.id.w_f3, TypedValue.COMPLEX_UNIT_DIP, 13f * wert);

        boolean zeigeUnter = true, zeigeFelder = wallet, beschriftung = true;
        if (hoehe > 0) {
            float h = hoehe + 2f;   // ein Hauch Nachsicht fuers Runden
            if (!wallet) {
                zeigeUnter = h >= mitUnter;
            } else if (h >= mitUnter + felderVoll) {
                // alles passt
            } else if (h >= ohneUnter + felderVoll) {
                zeigeUnter = false;
            } else if (h >= ohneUnter + felderKnapp) {
                zeigeUnter = false;
                beschriftung = false;
            } else {
                zeigeFelder = false;
                zeigeUnter = h >= mitUnter;
            }
        }
        v.setViewVisibility(R.id.w_unter, zeigeUnter ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_felder, zeigeFelder ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_f1t, beschriftung ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_f2t, beschriftung ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_f3t, beschriftung ? View.VISIBLE : View.GONE);

        // Schmal: Erst weicht die Uhrzeit, damit der Status Platz behaelt, dann
        // das Wort im Stopp-Knopf, damit der Verdienst Platz behaelt.
        v.setViewVisibility(R.id.w_stand, breite > 0 && breite < 320 * schrift ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.w_stopp_text, breite > 0 && breite < 290 * schrift ? View.GONE : View.VISIBLE);
    }

    /* ---- Zahlen ---- */

    /**
     * "10:42" -- nach der Einstellung des Geraets 24 oder 12 Stunden, aber
     * ohne AM/PM: Der Stand ist nie aelter als ein paar Stunden, und im Kopf
     * ist kein Platz.
     */
    private static String uhrzeit(Context c, long ms, Locale l) {
        boolean h24 = true;
        try { h24 = android.text.format.DateFormat.is24HourFormat(c); } catch (RuntimeException ignored) { }
        return new SimpleDateFormat(h24 ? "HH:mm" : "h:mm", l).format(new Date(ms));
    }

    private static boolean istNull(String einheiten) {
        try { return new BigDecimal(einheiten).signum() <= 0; }
        catch (RuntimeException e) { return true; }
    }

    /**
     * Einheiten (8 Nachkommastellen) als YSR.
     * genau: vier Stellen, ab 1.000 YSR zwei -- fuer den Verdienst.
     * sonst: hoechstens zwei, ohne Nullen am Ende -- fuer die Belohnung.
     */
    static String betrag(String einheiten, Locale l, boolean genau) {
        BigDecimal ysr;
        try { ysr = new BigDecimal(einheiten).movePointLeft(8); }
        catch (RuntimeException e) { ysr = BigDecimal.ZERO; }
        NumberFormat nf = NumberFormat.getNumberInstance(l);
        if (genau) {
            int stellen = ysr.compareTo(new BigDecimal(1000)) >= 0 ? 2 : 4;
            nf.setMinimumFractionDigits(stellen);
            nf.setMaximumFractionDigits(stellen);
            return nf.format(ysr.setScale(stellen, RoundingMode.DOWN));
        }
        nf.setMinimumFractionDigits(0);
        nf.setMaximumFractionDigits(2);
        return nf.format(ysr.setScale(2, RoundingMode.DOWN));
    }

    /** "2,10 MH/s" -- drei gueltige Stellen, in der Schreibweise des Geraets. */
    static String rate(double h, Locale l) {
        if (!(h > 0) || Double.isInfinite(h)) return "0 H/s";
        String[] e = { "H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s" };
        int i = 0;
        // 999,5 und mehr wuerde gerundet "1.000" -- dann lieber die naechste Einheit.
        while (h >= 999.5 && i < e.length - 1) { h /= 1000; i++; }
        int stellen = i == 0 || h >= 99.95 ? 0 : h >= 9.995 ? 1 : 2;
        NumberFormat nf = NumberFormat.getNumberInstance(l);
        nf.setMinimumFractionDigits(stellen);
        nf.setMaximumFractionDigits(stellen);
        return nf.format(h) + " " + e[i];
    }

    /** "24 Min" unter einer Stunde, sonst "1:24 Std". */
    static String laufzeit(Context c, long seit) {
        if (seit <= 0) return "—";
        long minuten = Math.max(0, (System.currentTimeMillis() - seit) / 60_000);
        if (minuten < 60) return c.getString(R.string.widget_min, (int) minuten);
        return c.getString(R.string.widget_std, (int) Math.min(Integer.MAX_VALUE, minuten / 60), (int) (minuten % 60));
    }
}
