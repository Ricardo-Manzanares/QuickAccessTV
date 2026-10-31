package com.quickaccesstv.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.widget.Toast;

/**
 * Solo flavor firetv. En Fire OS el boton Home siempre abre el launcher de Amazon y una app de
 * terceros no puede reemplazarlo. Este servicio en primer plano sondea UsageStatsManager y, cuando
 * el launcher de Amazon pasa a primer plano, vuelve a abrir MainActivity encima.
 * Necesita el permiso de estadisticas de uso, que se concede por ADB:
 *   adb shell appops set com.quickaccesstv.app.firetv android:get_usage_stats allow
 *
 * Excepciones:
 *  - Pulsacion larga de Inicio: Fire OS abre su menu rapido (HudActivity). Al verlo, el watchdog se
 *    PAUSA (persistente) hasta que abras la app tu mismo (ACTION_RESUME) o se reinicie el aparato.
 *  - Ajustes: la app abre Configuracion a pantalla completa (launcher/.ui.MainSettingsActivity) y sus
 *    submenus son de com.amazon.tv.settings.v2: nada de eso se tapa. Pulsar Inicio desde ahi si vuelve
 *    a la app. android.settings.SETTINGS es otra cosa: una pestaña del propio Home de Amazon a la que
 *    se llega via CTSDummySettingsHandler; ese Home tampoco se tapa.
 */
public class HomeWatchdogService extends Service {

    static final String ACTION_RESUME = "com.quickaccesstv.app.action.WATCHDOG_RESUME";
    static final String EXTRA_FROM_WATCHDOG = MainActivity.EXTRA_FROM_WATCHDOG;

    private static final String TAG = "TVHOME";
    private static final long POLL_MS = 100;        // cadencia del sondeo (cuanto antes se tapa el Home de Amazon)
    private static final long RETRY_MS = 1000;      // Fire OS retrasa ~5 s los arranques tras pulsar Home
    private static final long GIVE_UP_MS = 8000;    // deja de insistir si el launcher sigue delante
    private static final long SEED_MS = 30 * 60_000; // al arrancar, historial para saber quien esta delante
    private static final String CHANNEL = "tvhome_watchdog";
    private static final String PREFS = "watchdog";
    private static final String KEY_PAUSED = "paused";

    // Paquetes cuyo primer plano interceptamos. NO incluir com.amazon.tv.settings.v2 (romperia Ajustes).
    private static final String[] TARGETS = {
            "com.amazon.tv.launcher",
            "com.amazon.firehomestarter",
    };
    private static final String SETTINGS_PKG = "com.amazon.tv.settings.v2";
    private static final String HUD_CLASS = "com.amazon.tv.settings.v2.hud.HudActivity";   // pulsacion larga de Inicio
    // android.settings.SETTINGS pasa por aqui antes de mostrar la pestaña Ajustes del Home de Amazon.
    private static final String SETTINGS_TAB_GATEWAY = "com.amazon.tv.settings.v2.compliance.CTSDummySettingsHandler";
    // Configuración a pantalla completa: vive en el paquete del launcher, pero no es su Home.
    private static final String MAIN_SETTINGS_CLASS = "com.amazon.tv.launcher.ui.MainSettingsActivity";
    // Home provisional del arranque (mismo paquete que Ajustes, pero no son Ajustes).
    private static final String FALLBACK_HOME_CLASS = "com.amazon.tv.settings.v2.system.FallbackHome";

    private HandlerThread thread;
    private Handler handler;
    private final Handler main = new Handler(Looper.getMainLooper());
    private UsageStatsManager usm;
    private volatile boolean running = false;
    private volatile boolean paused = false;

    // Solo los toca el hilo del sondeo.
    private long lastEventTs;                // marca del ultimo evento ya procesado (reloj de pared)
    private String fgPkg;                    // paquete en primer plano segun el ultimo evento
    private String fgCls;                    // y su actividad
    private long fgSince;                    // uptime al verlo
    private boolean inSettings = false;      // el usuario esta en Ajustes de Fire TV
    private long lastRedirect = 0L;
    private boolean covered = false;         // Cover mostrado (o pedido al hilo principal)
    private boolean seeding = true;          // primer sondeo: reconstruye el estado sin reaccionar a la HUD

    private final Runnable poll = new Runnable() {
        @Override public void run() {
            try { tick(); } catch (Exception e) { Log.e(TAG, "watchdog tick", e); }
            if (running) handler.postDelayed(this, POLL_MS);
        }
    };

    static void setPaused(Context ctx, boolean value) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_PAUSED, value).apply();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        // Al encender, el Home de Amazon ya esta delante y no habra evento nuevo: el primer sondeo
        // repasa el historial reciente para saber quien esta en primer plano ahora mismo.
        lastEventTs = System.currentTimeMillis() - SEED_MS;
        thread = new HandlerThread("tvhome-watchdog");
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(1, buildNotification());
        paused = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_PAUSED, false);
        if (intent != null && ACTION_RESUME.equals(intent.getAction()) && paused) {
            paused = false;
            setPaused(this, false);
            toast(R.string.watchdog_resumed);
            Log.i(TAG, "watchdog reactivado (app abierta a mano)");
        }
        if (!running) {
            running = true;
            handler.post(poll);
            Log.i(TAG, "watchdog ON" + (paused ? " (en pausa)" : ""));
        }
        return START_STICKY;
    }

    /** Procesa los eventos de uso nuevos y relanza la app si el launcher de Amazon quedo delante. */
    private void tick() {
        if (usm == null) return;
        UsageEvents events = usm.queryEvents(lastEventTs, System.currentTimeMillis());
        if (events == null) return;

        UsageEvents.Event e = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() != UsageEvents.Event.MOVE_TO_FOREGROUND || e.getTimeStamp() <= lastEventTs) continue;
            lastEventTs = e.getTimeStamp();
            onForeground(e.getPackageName(), e.getClassName());
        }
        if (seeding) {
            seeding = false;
            fgSince = SystemClock.uptimeMillis();      // lo que haya delante cuenta como recien visto
        }

        long up = SystemClock.uptimeMillis();
        boolean redirect = fgPkg != null && isTarget(fgPkg) && !inSettings && !paused && up - fgSince <= GIVE_UP_MS;
        setCovered(redirect);     // tapa el Home de Amazon mientras Fire OS retiene nuestra vuelta
        if (!redirect || up - lastRedirect < RETRY_MS) return;
        lastRedirect = up;

        Intent i = new Intent(this, MainActivity.class)
                .putExtra(EXTRA_FROM_WATCHDOG, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try {
            startActivity(i);
            Log.i(TAG, "watchdog: " + fgPkg + " delante -> relanzo MainActivity");
        } catch (Exception ex) {
            Log.e(TAG, "watchdog relanzar", ex);
        }
    }

    private void onForeground(String pkg, String cls) {
        if (HUD_CLASS.equals(cls) && !paused && !seeding) {
            paused = true;
            setPaused(this, true);
            toast(R.string.watchdog_paused);
            Log.i(TAG, "watchdog en pausa (pulsacion larga de Inicio)");
        }
        if (SETTINGS_PKG.equals(pkg)) inSettings = !FALLBACK_HOME_CLASS.equals(cls);
        else if (MAIN_SETTINGS_CLASS.equals(cls)) inSettings = true;
        // Home de Amazon: solo es "Ajustes" si llega desde android.settings.SETTINGS (su pestaña);
        // pulsar Inicio desde Configuración o desde otra app debe volver a la nuestra.
        else if (isTarget(pkg)) inSettings = SETTINGS_TAB_GATEWAY.equals(fgCls);
        else inSettings = false;                         // otra app (o la nuestra): se rearma
        fgPkg = pkg;
        fgCls = cls;
        fgSince = SystemClock.uptimeMillis();
    }

    private void setCovered(boolean on) {
        if (on == covered) return;
        covered = on;
        main.post(() -> { if (on) Cover.show(this); else Cover.hide(this); });
    }

    private static boolean isTarget(String pkg) {
        for (String t : TARGETS) { if (t.equals(pkg)) return true; }
        return false;
    }

    private void toast(int res) {
        main.post(() -> Toast.makeText(getApplicationContext(), res, Toast.LENGTH_LONG).show());
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(new NotificationChannel(
                        CHANNEL, "tv-home", NotificationManager.IMPORTANCE_MIN));
            }
            return new Notification.Builder(this, CHANNEL)
                    .setContentTitle(getString(R.string.app_name))
                    .setContentText(getString(R.string.watchdog_text))
                    .setSmallIcon(R.drawable.ic_launcher)
                    .build();
        }
        return new Notification.Builder(this)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(getString(R.string.watchdog_text))
                .setSmallIcon(R.drawable.ic_launcher)
                .setPriority(Notification.PRIORITY_MIN)
                .build();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        running = false;
        main.post(() -> Cover.hide(this));
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }
}
