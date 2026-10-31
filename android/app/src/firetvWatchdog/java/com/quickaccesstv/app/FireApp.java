package com.quickaccesstv.app;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;

/**
 * Solo flavor firetv: arranca el watchdog cuando el proceso de la app se levanta (al abrirla) y,
 * si la abres tú (no el watchdog), lo reactiva tras una pausa por pulsación larga de Inicio.
 * Al pausar MainActivity guarda una captura para que el watchdog tape el Home de Amazon con ella.
 */
public class FireApp extends Application implements MainActivity.LaunchListener {
    @Override
    public void onCreate() {
        super.onCreate();
        startService(new Intent(this, HomeWatchdogService.class));
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityPaused(Activity a) {
                if (a instanceof MainActivity) Cover.capture(a.getWindow().getDecorView());
            }
            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityStarted(Activity a) {}
            @Override public void onActivityResumed(Activity a) {}
            @Override public void onActivityStopped(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {}
        });
    }

    @Override
    public void onLaunch(Intent intent) {
        if (intent != null && intent.getBooleanExtra(HomeWatchdogService.EXTRA_FROM_WATCHDOG, false)) return;
        startService(new Intent(this, HomeWatchdogService.class).setAction(HomeWatchdogService.ACTION_RESUME));
    }
}
