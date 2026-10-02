package net.yskar.wallet;

import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Die Oberflaeche meldet dem Widget, was sie weiss.
 *
 *   stand({ address, balance, blocksFound, height, difficulty,
 *           mining, rate, shares, ziel })
 *
 * Jedes Feld ist optional; was fehlt, bleibt wie es war. So kann der
 * Kontotakt nur Konto und Kette melden und der Mining-Takt nur die
 * Mining-Zeile.
 *
 *   thema({ thema?: "hell" | "dunkel" })  ->  { thema }
 *
 * Darstellung des Widgets. Ohne Angabe nur lesen. Aeltere Huellen kennen
 * die Methode nicht -- daran erkennt die Oberflaeche, ob sie die Auswahl
 * ueberhaupt anbieten soll.
 */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void stand(PluginCall call) {
        SharedPreferences.Editor e = WidgetDaten.ablage(getContext()).edit();
        if (call.hasOption("address")) e.putString(WidgetDaten.K_ADRESSE, call.getString("address"));
        if (call.hasOption("balance")) e.putString(WidgetDaten.K_GUTHABEN, call.getString("balance", "0"));
        if (call.hasOption("blocksFound")) e.putInt(WidgetDaten.K_BLOECKE, call.getInt("blocksFound", 0));
        if (call.hasOption("height")) e.putLong(WidgetDaten.K_HOEHE, call.getInt("height", 0));
        if (call.hasOption("difficulty")) WidgetDaten.putDouble(e, WidgetDaten.K_DIFFICULTY, call.getDouble("difficulty", 0.0));
        if (call.hasOption("mining")) e.putBoolean(WidgetDaten.K_MINING, Boolean.TRUE.equals(call.getBoolean("mining", false)));
        if (call.hasOption("rate")) e.putString(WidgetDaten.K_RATE, call.getString("rate", ""));
        if (call.hasOption("shares")) e.putInt(WidgetDaten.K_SHARES, call.getInt("shares", 0));
        if (call.hasOption("ziel")) WidgetDaten.putDouble(e, WidgetDaten.K_ZIEL, call.getDouble("ziel", 0.0));
        e.putLong(WidgetDaten.K_STAND, System.currentTimeMillis());
        e.apply();
        YskarWidget.rendern(getContext());
        // Den Stand des Netzes (fuer das gestoppte Widget) holt das Widget
        // selbst -- hoechstens alle fuenf Minuten.
        YskarWidget.netzNachziehen(getContext());
        call.resolve(new JSObject());
    }

    /** Hell oder Dunkel -- setzen und/oder lesen. */
    @PluginMethod
    public void thema(PluginCall call) {
        SharedPreferences p = WidgetDaten.ablage(getContext());
        if (call.hasOption("thema")) {
            String t = "dunkel".equals(call.getString("thema")) ? "dunkel" : "hell";
            p.edit().putString(WidgetDaten.K_THEMA, t).apply();
            YskarWidget.rendern(getContext());
        }
        JSObject r = new JSObject();
        r.put("thema", p.getString(WidgetDaten.K_THEMA, "hell"));
        call.resolve(r);
    }

    /** Wallet entfernt: Widget leeren. Die Wahl Hell/Dunkel bleibt. */
    @PluginMethod
    public void leeren(PluginCall call) {
        SharedPreferences p = WidgetDaten.ablage(getContext());
        String thema = p.getString(WidgetDaten.K_THEMA, null);
        SharedPreferences.Editor e = p.edit().clear();
        if (thema != null) e.putString(WidgetDaten.K_THEMA, thema);
        e.apply();
        YskarWidget.rendern(getContext());
        call.resolve();
    }
}
