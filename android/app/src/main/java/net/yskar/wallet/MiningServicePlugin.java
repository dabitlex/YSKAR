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
 *   Ereignis "stop": Der Nutzer hat in der Benachrichtigung auf Stopp getippt
 *                   (oder der native Miner hat sich mit einem Fehler beendet).
 *
 * Natives Mining (ab App 1.0.9, siehe NativMiner):
 *   faehigkeiten()              { nativMining: true }
 *   nativStart({ basis, address, mode, platform, threads, duty, vorlage })
 *   nativDuty({ duty })
 *   nativStatus()               Zustand des Miners + Protokoll
 *   stop()                      wie bisher -- beendet auch den nativen Miner
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

    @PluginMethod
    public void faehigkeiten(PluginCall call) {
        JSObject r = new JSObject();
        r.put("nativMining", true);
        r.put("version", 1);
        call.resolve(r);
    }

    @PluginMethod
    public void nativStart(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "nativNachErlaubnis");
            return;
        }
        nativStarten(call);
    }

    @PermissionCallback
    private void nativNachErlaubnis(PluginCall call) {
        // Wie beim Web-Mining: auch ohne Erlaubnis starten; die Oberflaeche
        // sagt dem Nutzer, dass die Meldung fehlt.
        nativStarten(call);
    }

    private void nativStarten(PluginCall call) {
        String basis = call.getString("basis", "");
        String adresse = call.getString("address", "");
        if (basis == null || !basis.startsWith("http") || adresse == null || adresse.isEmpty()) {
            call.reject("basis und address sind noetig");
            return;
        }
        Intent i = new Intent(getContext(), MiningService.class)
            .setAction(MiningService.AKTION_NATIV_START)
            .putExtra(MiningService.EXTRA_BASIS, basis)
            .putExtra(MiningService.EXTRA_ADRESSE, adresse)
            .putExtra(MiningService.EXTRA_MODUS, call.getString("mode", "solo"))
            .putExtra(MiningService.EXTRA_PLATTFORM, call.getString("platform", "android"))
            .putExtra(MiningService.EXTRA_THREADS, (int) call.getInt("threads", 2))
            .putExtra(MiningService.EXTRA_DUTY, (int) call.getInt("duty", 50))
            .putExtra(MiningService.EXTRA_VORLAGE, call.getString("vorlage", "{rate}"));
        ContextCompat.startForegroundService(getContext(), i);
        JSObject r = new JSObject();
        r.put("notifications", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void nativDuty(PluginCall call) {
        NativMiner m = MiningService.miner;
        if (m != null) m.dutySetzen((int) call.getInt("duty", 50));
        call.resolve();
    }

    @PluginMethod
    public void nativStatus(PluginCall call) {
        NativMiner m = MiningService.miner;
        JSObject r;
        try {
            r = m != null ? new JSObject(m.statusJson()) : new JSObject();
        } catch (org.json.JSONException e) {
            r = new JSObject();
            r.put("statusFehler", e.getMessage());
        }
        if (m == null) r.put("laeuft", false);
        r.put("dienst", MiningService.laeuft);
        com.getcapacitor.JSArray p = new com.getcapacitor.JSArray();
        for (String z : NativMiner.protokollLesen(80)) p.put(z);
        r.put("protokoll", p);
        call.resolve(r);
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

    /** Diagnose: Kommt der Aufruf am nativen Ende an, laeuft der Dienst? */
    @PluginMethod
    public void ping(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", true);
        r.put("laeuft", MiningService.laeuft);
        r.put("notifications", getPermissionState("notifications") == PermissionState.GRANTED);
        // Herzschlag als Uhrzeiten, aeltester zuerst; dazu die letzte Meldung aus der Oberflaeche.
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.ROOT);
        StringBuilder herz = new StringBuilder();
        synchronized (MiningService.HERZ) {
            for (Long t : MiningService.HERZ) { if (herz.length() > 0) herz.append(' '); herz.append(f.format(new java.util.Date(t))); }
        }
        r.put("herz", herz.toString());
        r.put("letzteMeldung", MiningService.letzteMeldung > 0 ? f.format(new java.util.Date(MiningService.letzteMeldung)) : "");
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
