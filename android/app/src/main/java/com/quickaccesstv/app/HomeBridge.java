package com.quickaccesstv.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.text.Collator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Puente que la UI web (window.AndroidHome) usa para listar/lanzar apps, pedir iconos, red y ajustes. */
public class HomeBridge {
    private final Context ctx;
    // Drawables de la última lista, para servir sus PNG a /appicon/<pkg>.
    private final Map<String, Drawable> art = new ConcurrentHashMap<>();
    private final Map<String, Boolean> banner = new ConcurrentHashMap<>();

    // Primera apertura tras una actualización en Fire TV: hay que avisar de que reinicie (ver updateNotice).
    private boolean pendingUpdateNotice;

    HomeBridge(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        pendingUpdateNotice = isFireTv() && UpdateCheck.justUpdated(this.ctx);
    }

    /**
     * El launcher de Fire TV solo vuelve a leer el icono de las apps instaladas fuera de la Appstore al
     * reiniciar: tras actualizar, el tile de favoritos sale en blanco hasta entonces. Devuelve true una vez.
     */
    @JavascriptInterface
    public boolean consumeUpdateNotice() {
        boolean r = pendingUpdateNotice;
        pendingUpdateNotice = false;
        return r;
    }

    /** Fire TV: Ajustes → Mi Fire TV, donde está «Reiniciar». */
    @JavascriptInterface
    public void openDeviceSettings() { open("com.amazon.device.settings.action.DEVICE"); }

    @JavascriptInterface
    public String listApps() {
        PackageManager pm = ctx.getPackageManager();
        Map<String, JSONObject> out = new LinkedHashMap<>();
        collect(pm, Intent.CATEGORY_LEANBACK_LAUNCHER, out);
        collect(pm, Intent.CATEGORY_LAUNCHER, out);
        List<JSONObject> list = new ArrayList<>(out.values());
        final Collator col = Collator.getInstance();
        list.sort((a, b) -> col.compare(a.optString("title"), b.optString("title")));
        JSONArray arr = new JSONArray();
        for (JSONObject o : list) arr.put(o);
        return arr.toString();
    }

    private void collect(PackageManager pm, String category, Map<String, JSONObject> out) {
        Intent query = new Intent(Intent.ACTION_MAIN).addCategory(category);
        for (ResolveInfo ri : pm.queryIntentActivities(query, 0)) {
            ActivityInfo ai = ri.activityInfo;
            String pkg = ai.packageName;
            if (out.containsKey(pkg) || pkg.equals(ctx.getPackageName())) continue;
            Drawable bnr = ai.loadBanner(pm);
            if (bnr == null) bnr = ai.applicationInfo.loadBanner(pm);
            boolean cover = bnr != null;
            Drawable d = cover ? bnr : ri.loadIcon(pm);
            art.put(pkg, d);
            banner.put(pkg, cover);
            int color = cover ? 0xFF000000 : Palette.darken(Palette.accent(d));
            try {
                JSONObject o = new JSONObject();
                o.put("id", pkg);
                o.put("title", ri.loadLabel(pm).toString());
                o.put("color", String.format("#%06X", color & 0xFFFFFF));
                o.put("cover", cover);
                // Preinstalada en la imagen del sistema (también si se actualizó desde la tienda).
                o.put("system", (ai.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                out.put(pkg, o);
            } catch (JSONException ignored) {}
        }
    }

    /** PNG del banner (16:9) o del icono para servir desde /appicon/<pkg>. */
    InputStream iconStream(String pkg) {
        Drawable d = art.get(pkg);
        if (d == null || d.getConstantState() == null) return null;
        boolean cover = Boolean.TRUE.equals(banner.get(pkg));
        int w = cover ? 320 : 160, h = cover ? 180 : 160;
        Drawable copy = d.getConstantState().newDrawable().mutate();
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        copy.setBounds(0, 0, w, h);
        copy.draw(new Canvas(bmp));
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, bos);
        bmp.recycle();
        return new ByteArrayInputStream(bos.toByteArray());
    }

    @JavascriptInterface
    public boolean launch(String pkg) {
        try {
            PackageManager pm = ctx.getPackageManager();
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            ctx.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String network() {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            NetworkCapabilities caps = n == null ? null : cm.getNetworkCapabilities(n);
            if (caps == null) return json("none", "Sin conexión");
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return json("wired", "Ethernet");
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return json("wifi", wifiName());
            return json("other", "Conectado");
        } catch (Exception e) {
            return json("none", "Sin conexión");
        }
    }

    private String wifiName() {
        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            WifiInfo wi = wm.getConnectionInfo();
            String s = wi != null ? wi.getSSID() : null;
            if (s == null) return "Wi-Fi";
            s = s.replace("\"", "");
            return (s.isEmpty() || s.equals("<unknown ssid>")) ? "Wi-Fi" : s;
        } catch (Exception e) {
            return "Wi-Fi";
        }
    }

    private String json(String type, String label) {
        try {
            return new JSONObject().put("type", type).put("label", label).toString();
        } catch (JSONException e) {
            return "{\"type\":\"none\",\"label\":\"Sin conexión\"}";
        }
    }

    @JavascriptInterface
    public void uninstall(String pkg) {
        try {
            Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception ignored) {}
    }

    /** Fire TV (Fire OS): la UI oculta ahí las apps de sistema de Amazon. */
    @JavascriptInterface
    public boolean isFireTv() {
        return ctx.getPackageManager().hasSystemFeature("amazon.hardware.fire_tv");
    }

    // Fire TV: la pantalla de Configuración a pantalla completa (la del menú de pulsación larga), con el
    // foco ya en la rejilla; android.settings.SETTINGS daría la pestaña del Home de Amazon con el foco arriba.
    @JavascriptInterface
    public void openSettings() {
        if (isFireTv()) {
            try {
                ctx.startActivity(new Intent(Intent.ACTION_MAIN)
                        .addCategory("android.intent.category.LEANBACK_SETTINGS")
                        .setPackage("com.amazon.tv.launcher")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return;
            } catch (Exception ignored) {}
        }
        open(Settings.ACTION_SETTINGS);
    }

    @JavascriptInterface
    public void openWifiSettings() { open(Settings.ACTION_WIFI_SETTINGS); }

    private void open(String action) {
        try {
            ctx.startActivity(new Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {}
    }
}
