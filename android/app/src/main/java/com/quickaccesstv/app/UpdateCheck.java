package com.quickaccesstv.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;

/**
 * Detecta la primera apertura tras actualizar la app (no tras la primera instalación) cuando el aparato
 * aún no se ha reiniciado desde la actualización.
 */
final class UpdateCheck {
    private static final String PREFS = "update_check";
    private static final String KEY = "last_update";

    private UpdateCheck() {}

    static boolean justUpdated(Context ctx) {
        try {
            long updated = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).lastUpdateTime;
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            long seen = prefs.getLong(KEY, 0);
            if (seen == updated) return false;
            prefs.edit().putLong(KEY, updated).apply();
            long bootTime = System.currentTimeMillis() - SystemClock.elapsedRealtime();
            return seen != 0 && bootTime < updated;
        } catch (Exception e) {
            return false;
        }
    }
}
