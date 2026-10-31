package com.quickaccesstv.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.InputStream;

/** Shell: un WebView a pantalla completa que renderiza la UI web compartida (../../web). */
public class MainActivity extends Activity {
    /** La Application de una variante puede enterarse de cada apertura (firetv: reactivar el watchdog). */
    public interface LaunchListener { void onLaunch(Intent intent); }

    /** Apertura hecha por el servicio de vuelta automática (variante firetvWatchdog). */
    public static final String EXTRA_FROM_WATCHDOG = "com.quickaccesstv.app.extra.FROM_WATCHDOG";

    private WebView web;
    private HomeBridge bridge;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setBackgroundDrawable(new ColorDrawable(0xFF55595E));

        web = new WebView(this);
        web.setBackgroundColor(0xFF55595E);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // localStorage (dock, carpetas, orden)
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);                   // respeta <meta viewport width=1920>
        s.setLoadWithOverviewMode(true);              // y lo escala para encajar en la pantalla

        WebView.setWebContentsDebuggingEnabled(true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.i("TVHOME", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });

        bridge = new HomeBridge(this);
        web.addJavascriptInterface(bridge, "AndroidHome");

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/appicon/", path -> {
                    String pkg = path;
                    if (pkg.startsWith("/")) pkg = pkg.substring(1);
                    int q = pkg.indexOf('?');
                    if (q >= 0) pkg = pkg.substring(0, q);
                    InputStream in = bridge.iconStream(Uri.decode(pkg));
                    if (in == null) in = new java.io.ByteArrayInputStream(new byte[0]);
                    return new WebResourceResponse("image/png", null, in);
                })
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }
        });

        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html");
        web.requestFocus();
        notifyLaunch(getIntent());
    }

    // singleTask: abrir la app ya existente llega aquí (no a onCreate). Volver de un diálogo no.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        notifyLaunch(intent);
    }

    private void notifyLaunch(Intent intent) {
        if (getApplication() instanceof LaunchListener) ((LaunchListener) getApplication()).onLaunch(intent);
        // Devuelta por el servicio: la interfaz recuerda cómo llegar al Home del sistema.
        if (intent != null && intent.getBooleanExtra(EXTRA_FROM_WATCHDOG, false) && web != null) {
            web.evaluateJavascript(
                    "window.PLATFORM && PLATFORM.onWatchdogReturn && PLATFORM.onWatchdogReturn();", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); web.requestFocus(); }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    // El botón ATRÁS no llega al WebView como keydown JS: lo reenviamos a la UI y nunca salimos del launcher.
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP && web != null) {
                web.evaluateJavascript("window.__home && window.__home.back && window.__home.back();", null);
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    public void onBackPressed() { /* no salir del launcher */ }
}
