package net.yskar.wallet;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DateFormat;
import java.text.NumberFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Homescreen-Widget: Guthaben, gefundene Bloecke, Mining-Zeile.
 *
 * Gerendert wird immer aus WidgetDaten. Android ruft onUpdate alle 30
 * Minuten (widget_info.xml); dann holt das Widget die Serverwerte selbst,
 * sofern die App sie nicht gerade frisch geliefert hat. Der Pfeil rechts
 * oben holt sofort. Ein Tipp auf die Flaeche oeffnet die App.
 */
public class YskarWidget extends AppWidgetProvider {

    static final String AKTION_HOLEN = "net.yskar.wallet.WIDGET_HOLEN";
    private static final long FRISCH_MS = 60_000;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        rendern(c);
        SharedPreferences p = WidgetDaten.ablage(c);
        boolean alt = System.currentTimeMillis() - p.getLong(WidgetDaten.K_STAND, 0) > FRISCH_MS;
        if (alt && !p.getBoolean(WidgetDaten.K_MINING, false)) holenImHintergrund(c);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (AKTION_HOLEN.equals(i.getAction())) holenImHintergrund(c);
    }

    private static void holenImHintergrund(Context c) {
        final Context app = c.getApplicationContext();
        new Thread(() -> { WidgetDaten.holen(app); rendern(app); }).start();
    }

    /** Alle Instanzen neu zeichnen. Auch vom Plugin gerufen. */
    static void rendern(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, YskarWidget.class));
        if (ids.length == 0) return;
        RemoteViews v = bauen(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    private static RemoteViews bauen(Context c) {
        SharedPreferences p = WidgetDaten.ablage(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Locale l = Locale.getDefault();
        NumberFormat ganz = NumberFormat.getIntegerInstance(l);

        String adresse = p.getString(WidgetDaten.K_ADRESSE, null);
        if (adresse == null || adresse.isEmpty()) {
            v.setTextViewText(R.id.w_guthaben, "—");
            v.setTextViewText(R.id.w_bloecke, c.getString(R.string.widget_keine_wallet));
            v.setTextViewText(R.id.w_mining, "");
            v.setTextViewText(R.id.w_stand, "");
        } else {
            BigDecimal einheiten = new BigDecimal(p.getString(WidgetDaten.K_GUTHABEN, "0"));
            BigDecimal ysr = einheiten.movePointLeft(8).setScale(4, RoundingMode.DOWN);
            NumberFormat nf = NumberFormat.getNumberInstance(l);
            nf.setMinimumFractionDigits(4);
            nf.setMaximumFractionDigits(4);
            v.setTextViewText(R.id.w_guthaben, nf.format(ysr) + " YSR");

            int bloecke = p.getInt(WidgetDaten.K_BLOECKE, 0);
            long hoehe = p.getLong(WidgetDaten.K_HOEHE, 0);
            String bl = c.getResources().getQuantityString(R.plurals.widget_bloecke, bloecke, ganz.format(bloecke));
            if (hoehe > 0) bl += "  ·  #" + ganz.format(hoehe);
            v.setTextViewText(R.id.w_bloecke, bl);

            if (p.getBoolean(WidgetDaten.K_MINING, false)) {
                String rate = p.getString(WidgetDaten.K_RATE, "");
                int shares = p.getInt(WidgetDaten.K_SHARES, 0);
                double ziel = WidgetDaten.getDouble(p, WidgetDaten.K_ZIEL, 0);
                String text = c.getString(R.string.widget_mining) + " · " + rate
                    + " · " + ganz.format(shares) + " " + c.getString(R.string.widget_shares);
                if (ziel > 0) text += " · " + c.getString(R.string.widget_ziel) + " " + ganz.format(Math.round(ziel));
                v.setTextViewText(R.id.w_mining, text);
                v.setTextColor(R.id.w_mining, 0xFF1F5BF0);
                v.setInt(R.id.w_punkt, "setColorFilter", 0xFF1F5BF0);
            } else {
                v.setTextViewText(R.id.w_mining, c.getString(R.string.widget_gestoppt));
                v.setTextColor(R.id.w_mining, 0xFF5B6B84);
                v.setInt(R.id.w_punkt, "setColorFilter", 0xFF8E9AB0);
            }

            long stand = p.getLong(WidgetDaten.K_STAND, 0);
            v.setTextViewText(R.id.w_stand, stand > 0
                ? DateFormat.getTimeInstance(DateFormat.SHORT, l).format(new Date(stand)) : "");
        }
        v.setViewVisibility(R.id.w_punkt, adresse == null ? View.GONE : View.VISIBLE);

        // Tipp auf die Flaeche: App oeffnen.
        Intent oeffnen = new Intent(c, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.w_wurzel, PendingIntent.getActivity(
            c, 0, oeffnen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // Pfeil: sofort vom Server holen.
        Intent holen = new Intent(c, YskarWidget.class).setAction(AKTION_HOLEN);
        v.setOnClickPendingIntent(R.id.w_holen, PendingIntent.getBroadcast(
            c, 1, holen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
