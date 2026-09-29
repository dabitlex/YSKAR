package net.yskar.wallet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * Vordergrunddienst fuers Mining.
 *
 * Das Rechnen selbst passiert weiter in den Web Workern des WebView -- dieser
 * Dienst tut zwei Dinge: Er haelt den Prozess mit einer dauerhaften
 * Benachrichtigung am Leben, damit Android ihn im Hintergrund nicht beendet,
 * und er haelt mit einem WakeLock die CPU wach, wenn der Bildschirm aus ist.
 * Ohne beides pausiert das Mining, sobald man das Telefon weglegt.
 *
 * Die Benachrichtigung traegt einen Stopp-Knopf. Er meldet sich ueber
 * MiningServicePlugin an die Weboberflaeche, die das Mining ordentlich
 * beendet (Session schliessen, Worker stoppen) -- der Dienst selbst faellt
 * keine Entscheidung ueber die Kette.
 */
public class MiningService extends Service {

    public static final String KANAL = "yskar_mining";
    public static final int MELDUNG_ID = 4711;
    public static final String AKTION_START = "net.yskar.wallet.MINING_START";
    public static final String AKTION_TEXT = "net.yskar.wallet.MINING_TEXT";
    public static final String AKTION_STOP = "net.yskar.wallet.MINING_STOP";
    /** Stopp aus der Benachrichtigung -- muss der Oberflaeche gemeldet werden. */
    public static final String AKTION_STOP_NUTZER = "net.yskar.wallet.MINING_STOP_NUTZER";
    public static final String EXTRA_TEXT = "text";

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        kanalAnlegen();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String aktion = intent != null ? intent.getAction() : null;
        if (AKTION_STOP_NUTZER.equals(aktion)) {
            // Stopp aus der Benachrichtigung: erst der Oberflaeche sagen,
            // dann den Dienst beenden. Die Oberflaeche stoppt die Worker.
            MiningServicePlugin.stoppGewuenscht();
            beenden();
            return START_NOT_STICKY;
        }
        if (AKTION_STOP.equals(aktion)) {
            // Stopp aus der Oberflaeche: Die Worker sind schon aus.
            beenden();
            return START_NOT_STICKY;
        }

        String text = intent != null && intent.hasExtra(EXTRA_TEXT)
            ? intent.getStringExtra(EXTRA_TEXT) : "Mining läuft";

        Notification n = meldung(text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(MELDUNG_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(MELDUNG_ID, n);
        }
        wachHalten();
        return START_NOT_STICKY;
    }

    private void wachHalten() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        // PARTIAL: CPU an, Bildschirm darf aus. Genau das, was Mining braucht.
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "yskar:mining");
        wakeLock.acquire();
    }

    private void beenden() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void kanalAnlegen() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(KANAL) != null) return;
        NotificationChannel k = new NotificationChannel(
            KANAL, "Mining", NotificationManager.IMPORTANCE_LOW);
        k.setDescription("Zeigt an, dass dein Gerät gerade für YSKAR rechnet.");
        k.setShowBadge(false);
        nm.createNotificationChannel(k);
    }

    private Notification meldung(String text) {
        Intent oeffnen = new Intent(this, MainActivity.class);
        oeffnen.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tippen = PendingIntent.getActivity(
            this, 0, oeffnen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stop = new Intent(this, MiningService.class).setAction(AKTION_STOP_NUTZER);
        PendingIntent stoppen = PendingIntent.getService(
            this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, KANAL)
            .setSmallIcon(R.drawable.ic_stat_mining)
            .setContentTitle("YSKAR rechnet")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(tippen)
            .addAction(0, "Mining stoppen", stoppen)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }
}
