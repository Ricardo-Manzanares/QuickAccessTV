package com.quickaccesstv.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;

/** Picks a glow colour from a banner: the most vivid pixel of a tiny downscale. */
final class Palette {
    private static final int FALLBACK = 0xFF8EA2C0;

    private Palette() {}

    static int accent(Drawable source) {
        if (source == null || source.getConstantState() == null) return FALLBACK;
        // Draw a private copy so the shared drawable's bounds are left alone.
        Drawable d = source.getConstantState().newDrawable().mutate();
        Bitmap bmp = Bitmap.createBitmap(32, 18, Bitmap.Config.ARGB_8888);
        d.setBounds(0, 0, 32, 18);
        d.draw(new Canvas(bmp));

        float[] hsv = new float[3];
        float bestScore = 0;
        float[] best = null;
        for (int y = 0; y < 18; y++) {
            for (int x = 0; x < 32; x++) {
                int px = bmp.getPixel(x, y);
                if (Color.alpha(px) < 128) continue;
                Color.colorToHSV(px, hsv);
                float score = hsv[1] * hsv[2];
                if (score > bestScore) {
                    bestScore = score;
                    best = hsv.clone();
                }
            }
        }
        bmp.recycle();
        if (best == null || bestScore < 0.18f) return FALLBACK;
        best[1] = Math.min(best[1], 0.85f);
        best[2] = 1f;
        return Color.HSVToColor(best);
    }

    static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (alpha << 24);
    }

    /** Blend toward a dark card colour, used behind icon-only tiles. */
    static int darken(int color) {
        int base = 0xFF1C1C1E;
        float t = 0.28f;
        int r = (int) (Color.red(base) + (Color.red(color) - Color.red(base)) * t);
        int g = (int) (Color.green(base) + (Color.green(color) - Color.green(base)) * t);
        int b = (int) (Color.blue(base) + (Color.blue(color) - Color.blue(base)) * t);
        return Color.rgb(r, g, b);
    }
}
