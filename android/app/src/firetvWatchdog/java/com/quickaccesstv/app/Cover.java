package com.quickaccesstv.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.PixelFormat;
import android.os.Build;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

/**
 * Solo flavor firetv. Tapa la pantalla con la ultima captura de la app mientras Fire OS retiene
 * ~5 s su vuelta tras pulsar Home (stopAppSwitches; saltarlo exige un permiso de firma del sistema).
 * Necesita SYSTEM_ALERT_WINDOW, concedido por ADB:
 *   adb shell appops set com.quickaccesstv.app.firetv SYSTEM_ALERT_WINDOW allow
 * Ventana TYPE_PHONE (no SYSTEM_ALERT): con ella Home y la pulsacion larga de Home siguen funcionando.
 * Todo en el hilo principal.
 */
final class Cover {
    private static final String TAG = "TVHOME";
    private static final int BG = 0xFF55595E;       // mismo gris que MainActivity

    private static Bitmap shot;
    private static View view;

    private Cover() {}

    /** Captura lo que muestra la actividad (se llama al pausarla, aun con su contenido en pantalla). */
    static void capture(View root) {
        int w = root.getWidth(), h = root.getHeight();
        if (w == 0 || h == 0) return;
        try {
            if (shot == null || shot.getWidth() != w || shot.getHeight() != h) {
                shot = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
            }
            root.draw(new Canvas(shot));
        } catch (Exception | OutOfMemoryError e) {
            Log.e(TAG, "cover capture", e);
            shot = null;
        }
    }

    static void show(Context ctx) {
        if (view != null) return;
        ImageView iv = new ImageView(ctx);
        iv.setBackgroundColor(BG);
        iv.setScaleType(ImageView.ScaleType.FIT_XY);
        if (shot != null) iv.setImageBitmap(shot);
        // Enfocable para tragarse el mando: que no navegue a ciegas por el Home de Amazon de debajo.
        iv.setFocusable(true);
        iv.setOnKeyListener((v, code, ev) -> true);

        @SuppressWarnings("deprecation")
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_FULLSCREEN,
                PixelFormat.OPAQUE);
        lp.gravity = Gravity.TOP | Gravity.START;
        try {
            wm(ctx).addView(iv, lp);
            view = iv;
            iv.requestFocus();
        } catch (Exception e) {
            Log.e(TAG, "cover show (falta SYSTEM_ALERT_WINDOW?)", e);
        }
    }

    static void hide(Context ctx) {
        if (view == null) return;
        try { wm(ctx).removeView(view); } catch (Exception ignored) {}
        view = null;
    }

    private static WindowManager wm(Context ctx) {
        return (WindowManager) ctx.getApplicationContext().getSystemService(Context.WINDOW_SERVICE);
    }
}
