package net.yskar.wallet;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bruecke zwischen Weboberflaeche und MiningService.
 *
 *   start(text)   Dienst starten, Benachrichtigung zeigen
 *   update(text)  Text der Benachrichtigung (Hashrate) nachfuehren
 *   stop()        Dienst beenden
 *   Ereignis "stop": Der Nutzer hat in der Benachrichtigung auf Stopp getippt.
 *
 * Ab Android 13 braucht die dauerhafte Benachrichtigung die Erlaubnis
 * POST_NOTIFICATIONS; ohne sie laeuft der Dienst zwar, ist aber unsichtbar --
 * und ein unsichtbarer Vordergrunddienst ist genau das, was man nicht will.
 * Deshalb wird sie beim ersten Start erfragt.
 */
@CapacitorPlugin(
    name = "MiningService",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class MiningServicePlugin extends Plugin {

    private static MiningServicePlugin aktiv;

    @Override
    public void load() { aktiv = this; }

    /** Vom Dienst gerufen, wenn der Nutzer in der Benachrichtigung stoppt. */
    static void stoppGewuenscht() {
        if (aktiv != null) aktiv.notifyListeners("stop", new JSObject(), true);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "nachErlaubnis");
            return;
        }
        starten(call);
    }

    @PermissionCallback
    private void nachErlaubnis(PluginCall call) {
        // Auch ohne Erlaubnis starten: Der Dienst haelt die CPU trotzdem wach.
        // Die Oberflaeche sagt dem Nutzer, dass die Meldung fehlt.
        starten(call);
    }

    private void starten(PluginCall call) {
        Intent i = new Intent(getContext(), MiningService.class)
            .setAction(MiningService.AKTION_START)
            .putExtra(MiningService.EXTRA_TEXT, call.getString("text", "Mining läuft"));
        ContextCompat.startForegroundService(getContext(), i);
        JSObject r = new JSObject();
        r.put("notifications", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent i = new Intent(getContext(), MiningService.class)
            .setAction(MiningService.AKTION_TEXT)
            .putExtra(MiningService.EXTRA_TEXT, call.getString("text", "Mining läuft"));
        ContextCompat.startForegroundService(getContext(), i);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent i = new Intent(getContext(), MiningService.class)
            .setAction(MiningService.AKTION_STOP);
        // Kein startForegroundService: Ein Stopp darf keinen neuen Start
        // verlangen. startService reicht, der Dienst beendet sich selbst.
        getContext().startService(i);
        call.resolve();
    }
}
