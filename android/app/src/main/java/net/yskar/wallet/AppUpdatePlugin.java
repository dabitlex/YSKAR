package net.yskar.wallet;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Update aus der App heraus: APK laden, Installer oeffnen.
 *
 *   laden({ url, version })  -> { status: "laedt" | "erlaubnis" }
 *   stand()                  -> { status, prozent }
 *
 * Ohne Play Store bleibt die Bestaetigung des Nutzers im Installer -- das
 * ist eine Grenze von Android, kein Umweg wert. Alles davor uebernimmt
 * die App: Download ueber den DownloadManager (mit Benachrichtigung und
 * Fortschritt), danach oeffnet sich der Installer von selbst.
 *
 * Beim ersten Mal verlangt Android die Freigabe "Apps aus dieser Quelle
 * installieren". Dann oeffnet laden() die Einstellungsseite dafuer und
 * antwortet "erlaubnis"; die Oberflaeche bittet, danach erneut zu tippen.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String ORDNER = "updates";
    private long laufendeId = -1;
    private String zielDatei = null;
    private BroadcastReceiver fertig;

    @PluginMethod
    public void laden(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version", "neu");
        if (url == null || !url.startsWith("https://")) { call.reject("url fehlt"); return; }

        Context c = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !c.getPackageManager().canRequestPackageInstalls()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
            JSObject r = new JSObject();
            r.put("status", "erlaubnis");
            call.resolve(r);
            return;
        }

        File ordner = new File(c.getExternalFilesDir(null), ORDNER);
        if (!ordner.exists()) ordner.mkdirs();
        // Alte Downloads weg -- eine halbe APK von gestern hilft niemandem.
        File[] alte = ordner.listFiles();
        if (alte != null) for (File f : alte) f.delete();

        String name = "yskar-wallet-" + version.replaceAll("[^0-9.]", "") + ".apk";
        zielDatei = new File(ordner, name).getAbsolutePath();

        DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
            .setTitle("YSKAR Wallet " + version)
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(c, null, ORDNER + "/" + name);
        laufendeId = dm.enqueue(req);
        empfaengerAnmelden();

        JSObject r = new JSObject();
        r.put("status", "laedt");
        call.resolve(r);
    }

    @PluginMethod
    public void stand(PluginCall call) {
        JSObject r = new JSObject();
        if (laufendeId < 0) { r.put("status", "keins"); r.put("prozent", 0); call.resolve(r); return; }
        DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        try (Cursor cur = dm.query(new DownloadManager.Query().setFilterById(laufendeId))) {
            if (cur == null || !cur.moveToFirst()) { r.put("status", "keins"); r.put("prozent", 0); call.resolve(r); return; }
            int status = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long soll = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            long ist = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            int prozent = soll > 0 ? (int) (ist * 100 / soll) : 0;
            String s = status == DownloadManager.STATUS_SUCCESSFUL ? "fertig"
                : status == DownloadManager.STATUS_FAILED ? "fehler" : "laedt";
            r.put("status", s);
            r.put("prozent", prozent);
        }
        call.resolve(r);
    }

    /** Installer fuer die zuletzt geladene APK noch einmal oeffnen. */
    @PluginMethod
    public void installieren(PluginCall call) {
        if (zielDatei == null || !new File(zielDatei).exists()) { call.reject("keine APK"); return; }
        installerOeffnen(getContext(), new File(zielDatei));
        call.resolve();
    }

    private void empfaengerAnmelden() {
        if (fertig != null) return;
        fertig = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != laufendeId || zielDatei == null) return;
                File f = new File(zielDatei);
                if (f.exists() && f.length() > 0) installerOeffnen(c, f);
            }
        };
        ContextCompat.registerReceiver(getContext(), fertig,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED);
    }

    private static void installerOeffnen(Context c, File apk) {
        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
        Intent i = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        c.startActivity(i);
    }

    @Override
    protected void handleOnDestroy() {
        if (fertig != null) {
            try { getContext().unregisterReceiver(fertig); } catch (Exception ignored) {}
            fertig = null;
        }
        super.handleOnDestroy();
    }
}
