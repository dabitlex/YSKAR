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
 * Zwei Betriebsarten:
 *
 *  - NATIV (ab App 1.0.9): Der Dienst rechnet selbst ({@link NativMiner}).
 *    Die Oberflaeche steuert nur und zeigt an. Grund: Die Diagnose vom
 *    01.10.2026 zeigte, dass der WebView seine Worker ~40 s nach dem
 *    Wechsel in den Hintergrund einfriert, obwohl dieser Dienst laeuft.
 *  - WEB (bisher, bleibt fuer aeltere Oberflaechen): Die Worker im WebView
 *    rechnen, der Dienst haelt nur Prozess und CPU wach. Beschreibung dazu
 *    folgt.
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

    public static final String KANAL = "yskar_mining_2";
    public static final int MELDUNG_ID = 4711;
    public static final String AKTION_START = "net.yskar.wallet.MINING_START";
    public static final String AKTION_TEXT = "net.yskar.wallet.MINING_TEXT";
    public static final String AKTION_STOP = "net.yskar.wallet.MINING_STOP";
    /** Stopp aus der Benachrichtigung -- muss der Oberflaeche gemeldet werden. */
    public static final String AKTION_STOP_NUTZER = "net.yskar.wallet.MINING_STOP_NUTZER";
    public static final String EXTRA_TEXT = "text";

    /** Nativ: Dienst rechnet selbst. Extras siehe nativStarten(). */
    public static final String AKTION_NATIV_START = "net.yskar.wallet.MINING_NATIV_START";
    public static final String EXTRA_BASIS = "basis";
    public static final String EXTRA_ADRESSE = "adresse";
    public static final String EXTRA_MODUS = "modus";
    public static final String EXTRA_PLATTFORM = "plattform";
    public static final String EXTRA_THREADS = "threads";
    public static final String EXTRA_DUTY = "duty";
    /** Text der Benachrichtigung mit Platzhalter {rate}, in der Sprache der App. */
    public static final String EXTRA_VORLAGE = "vorlage";

    /** Der laufende (oder zuletzt gelaufene) native Miner -- fuer Status und Leistung. */
    static volatile NativMiner miner;
    private String vorlage = "{rate}";
    private final Runnable anzeigeTakt = new Runnable() {
        @Override public void run() { nativAnzeigen(); }
    };

    private PowerManager.WakeLock wakeLock;
    /** Fuer die Diagnose in der Oberflaeche. */
    static volatile boolean laeuft = false;

    /*
      Herzschlag des Dienstes -- unabhaengig vom WebView. Alle 10 s ein
      Zeitstempel, die letzten 30 bleiben. Dazu der Zeitpunkt der letzten
      Textmeldung aus der Oberflaeche. Stehen beide, hat Android die ganze
      App eingefroren; laeuft der Herzschlag weiter, aber die Meldungen
      bleiben aus, ist nur der WebView-Renderer eingefroren. Ohne diese
      Unterscheidung wuerde man am falschen Ende schrauben.
    */
    static final java.util.ArrayDeque<Long> HERZ = new java.util.ArrayDeque<>();
    static volatile long letzteMeldung = 0;
    private final android.os.Handler takt = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable schlag = new Runnable() {
        @Override public void run() {
            synchronized (HERZ) { HERZ.addLast(System.currentTimeMillis()); while (HERZ.size() > 30) HERZ.removeFirst(); }
            if (laeuft) takt.postDelayed(this, 10_000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        kanalAnlegen();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String aktion = intent != null ? intent.getAction() : null;
        if (AKTION_NATIV_START.equals(aktion)) {
            nativStarten(intent);
            return START_NOT_STICKY;
        }
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
            ? intent.getStringExtra(EXTRA_TEXT) : getString(R.string.mining_laeuft);
        if (AKTION_TEXT.equals(aktion)) letzteMeldung = System.currentTimeMillis();

        Notification n = meldung(text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(MELDUNG_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(MELDUNG_ID, n);
        }
        wachHalten();
        if (!laeuft) { laeuft = true; takt.removeCallbacks(schlag); takt.post(schlag); }
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
        laeuft = false;
        takt.removeCallbacks(schlag);
        takt.removeCallbacks(anzeigeTakt);
        NativMiner m = miner;
        if (m != null && m.laeuft()) m.stoppen("dienst beendet");
        widgetMining(false, null, 0, null);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        laeuft = false;
        takt.removeCallbacks(anzeigeTakt);
        NativMiner m = miner;
        if (m != null && m.laeuft()) m.stoppen("dienst zerstoert");
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ================================================================ Nativ

    private void nativStarten(Intent i) {
        String v = i.getStringExtra(EXTRA_VORLAGE);
        if (v != null && v.contains("{rate}")) vorlage = v;
        startForeground2(meldung(vorlage.replace("{rate}", "…")));
        wachHalten();
        if (!laeuft) { laeuft = true; takt.removeCallbacks(schlag); takt.post(schlag); }

        NativMiner alt = miner;
        if (alt != null && alt.laeuft()) alt.stoppen("neuer start");

        NativMiner.Einstellung e = new NativMiner.Einstellung();
        e.basis = i.getStringExtra(EXTRA_BASIS);
        e.adresse = i.getStringExtra(EXTRA_ADRESSE);
        e.modus = "pool".equals(i.getStringExtra(EXTRA_MODUS)) ? "pool" : "solo";
        e.plattform = i.getStringExtra(EXTRA_PLATTFORM) != null ? i.getStringExtra(EXTRA_PLATTFORM) : "android";
        e.threads = i.getIntExtra(EXTRA_THREADS, 2);
        e.duty = i.getIntExtra(EXTRA_DUTY, 50);
        /*
          Prioritaet der Rechen-Threads: etwas unter normal (nice +5), damit
          die Oberflaeche fluessig bleibt -- aber bewusst NICHT
          THREAD_PRIORITY_BACKGROUND (+10): Ab dort kann Android den Thread
          auf die sparsamen Kerne verbannen.
        */
        NativMiner m = new NativMiner(e, () -> android.os.Process.setThreadPriority(5));
        miner = m;
        m.starten();
        takt.removeCallbacks(anzeigeTakt);
        takt.postDelayed(anzeigeTakt, 2_000);
    }

    private void startForeground2(Notification n) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(MELDUNG_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(MELDUNG_ID, n);
        }
    }

    /** Alle 4 s: Benachrichtigung und Widget aus dem Miner nachfuehren. */
    private void nativAnzeigen() {
        NativMiner m = miner;
        if (m == null || !laeuft) return;
        if (!m.laeuft()) {
            // Der Miner hat sich selbst beendet (z.B. Adresse ungueltig,
            // Pool nicht verfuegbar). Der Oberflaeche Bescheid geben, die
            // den Fehler aus nativStatus liest -- dann den Dienst beenden.
            MiningServicePlugin.stoppGewuenscht();
            beenden();
            return;
        }
        String rate = rateText(m.hashrate());
        letzteMeldung = System.currentTimeMillis();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(MELDUNG_ID, meldung(vorlage.replace("{rate}", rate + " · " + m.duty() + " %")));
        widgetMining(true, rate, m.angenommen(), m.shareDifficulty());
        takt.postDelayed(anzeigeTakt, 4_000);
    }

    /** Wie hashrateText() in src/lib/format/hashrate.ts, nur knapper. */
    static String rateText(double h) {
        if (!(h > 0)) return "0 H/s";
        String[] e = { "H/s", "kH/s", "MH/s", "GH/s", "TH/s" };
        int i = 0;
        while (h >= 1000 && i < e.length - 1) { h /= 1000; i++; }
        return String.format(java.util.Locale.ROOT, i == 0 ? "%.0f %s" : "%.2f %s", h, e[i]);
    }

    private void widgetMining(boolean an, String rate, long shares, String ziel) {
        try {
            android.content.SharedPreferences.Editor ed = WidgetDaten.ablage(this).edit();
            ed.putBoolean(WidgetDaten.K_MINING, an);
            if (rate != null) ed.putString(WidgetDaten.K_RATE, rate);
            if (an) ed.putInt(WidgetDaten.K_SHARES, (int) Math.min(Integer.MAX_VALUE, shares));
            if (ziel != null) {
                try { WidgetDaten.putDouble(ed, WidgetDaten.K_ZIEL, Double.parseDouble(ziel)); } catch (NumberFormatException ignored) { }
            }
            ed.putLong(WidgetDaten.K_STAND, System.currentTimeMillis());
            ed.apply();
            YskarWidget.rendern(this);
        } catch (Exception ignored) { }
    }

    /*
      Kanal "yskar_mining_2" statt "yskar_mining": Die Einstellungen eines
      Kanals lassen sich nach dem Anlegen nicht mehr aendern. Der alte hatte
      IMPORTANCE_LOW -- solche "stillen" Meldungen blendet Android (und
      HyperOS) auf dem Sperrbildschirm oft aus. Der neue ist DEFAULT, aber
      ohne Ton und Vibration, und ausdruecklich auf dem Sperrbildschirm
      sichtbar. Ob er dort erscheint, entscheidet am Ende die
      Systemeinstellung des Nutzers.
    */
    private void kanalAnlegen() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel("yskar_mining") != null) nm.deleteNotificationChannel("yskar_mining");
        if (nm.getNotificationChannel(KANAL) != null) return;
        NotificationChannel k = new NotificationChannel(
            KANAL, getString(R.string.mining_kanal), NotificationManager.IMPORTANCE_DEFAULT);
        k.setDescription(getString(R.string.mining_kanal_text));
        k.setShowBadge(false);
        k.setSound(null, null);
        k.enableVibration(false);
        k.enableLights(false);
        k.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
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
            .setContentTitle(getString(R.string.mining_titel))
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(tippen)
            .addAction(0, getString(R.string.mining_stoppen), stoppen)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }
}
