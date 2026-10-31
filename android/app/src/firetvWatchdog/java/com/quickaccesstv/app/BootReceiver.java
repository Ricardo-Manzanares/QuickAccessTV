package com.quickaccesstv.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Solo flavor firetv: arranca el watchdog al encender el aparato (BOOT_COMPLETED), siempre activo. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Una pausa por pulsación larga de Inicio no sobrevive a un reinicio.
        HomeWatchdogService.setPaused(context, false);
        // En Android 7.1.2 (Fire OS 6) startService en background está permitido.
        context.startService(new Intent(context, HomeWatchdogService.class));
        // Al encender, el Home de Amazon ya está delante y el historial de uso puede no recogerlo:
        // se abre la app directamente en vez de esperar a detectarlo.
        context.startActivity(new Intent(context, MainActivity.class)
                .putExtra(HomeWatchdogService.EXTRA_FROM_WATCHDOG, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
}
