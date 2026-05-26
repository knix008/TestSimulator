#include "image_effects.h"

#include <glib/gstdio.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define CLAMP_U8(v) ((guint8)CLAMP((v), 0, 255))

typedef struct {
    int w;
    int h;
    int rs;
    int nc;
    guchar *px;
} FxBuf;

static FxBuf fx_buf(GdkPixbuf *pb) {
    FxBuf b;
    b.w = gdk_pixbuf_get_width(pb);
    b.h = gdk_pixbuf_get_height(pb);
    b.rs = gdk_pixbuf_get_rowstride(pb);
    b.nc = gdk_pixbuf_get_n_channels(pb);
    b.px = gdk_pixbuf_get_pixels(pb);
    return b;
}

static GdkPixbuf *fx_copy_rgba(const GdkPixbuf *src) {
    int w = gdk_pixbuf_get_width(src);
    int h = gdk_pixbuf_get_height(src);
    GdkPixbuf *dst = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, w, h);
    if (!dst) {
        return NULL;
    }
    gdk_pixbuf_copy_area(src, 0, 0, w, h, dst, 0, 0);
    return dst;
}

GdkPixbuf *image_effects_clone(const GdkPixbuf *src) {
    return fx_copy_rgba(src);
}

static int color_dist_sq(guchar r, guchar g, guchar b,
                         guint8 tr, guint8 tg, guint8 tb) {
    int dr = (int)r - (int)tr;
    int dg = (int)g - (int)tg;
    int db = (int)b - (int)tb;
    return dr * dr + dg * dg + db * db;
}

static void rgb_to_hsl(float r, float g, float b,
                       float *h, float *s, float *l) {
    float max = fmaxf(r, fmaxf(g, b));
    float min = fminf(r, fminf(g, b));
    float d = max - min;
    *l = (max + min) * 0.5f;
    if (d < 1e-6f) {
        *h = *s = 0.0f;
        return;
    }
    *s = (*l > 0.5f) ? d / (2.0f - max - min) : d / (max + min);
    if (max == r) {
        *h = (g - b) / d + (g < b ? 6.0f : 0.0f);
    } else if (max == g) {
        *h = (b - r) / d + 2.0f;
    } else {
        *h = (r - g) / d + 4.0f;
    }
    *h /= 6.0f;
}

static float hue2rgb(float p, float q, float t) {
    if (t < 0.0f) {
        t += 1.0f;
    }
    if (t > 1.0f) {
        t -= 1.0f;
    }
    if (t < 1.0f / 6.0f) {
        return p + (q - p) * 6.0f * t;
    }
    if (t < 0.5f) {
        return q;
    }
    if (t < 2.0f / 3.0f) {
        return p + (q - p) * (2.0f / 3.0f - t) * 6.0f;
    }
    return p;
}

static void hsl_to_rgb_fixed(float h, float s, float l,
                             float *r, float *g, float *b) {
    if (s < 1e-6f) {
        *r = *g = *b = l;
        return;
    }
    float q = l < 0.5f ? l * (1.0f + s) : l + s - l * s;
    float p = 2.0f * l - q;
    *r = hue2rgb(p, q, h + 1.0f / 3.0f);
    *g = hue2rgb(p, q, h);
    *b = hue2rgb(p, q, h - 1.0f / 3.0f);
}

void image_effects_adjust(GdkPixbuf *img,
                          int brightness,
                          int contrast,
                          int saturation,
                          int hue,
                          int gamma_pct,
                          int temperature) {
    if (!img) {
        return;
    }
    FxBuf b = fx_buf(img);
    float bf = 1.0f + brightness / 100.0f;
    float cf = 1.0f + contrast / 100.0f;
    float sf = 1.0f + saturation / 100.0f;
    float hue_shift = hue / 360.0f;
    float gamma = gamma_pct / 100.0f;
    int temp_adj = (int)(temperature * 1.28f);

    guchar gamma_lut[256];
    if (gamma_pct != 100 && fabsf(gamma - 1.0f) > 0.001f) {
        float inv = 1.0f / gamma;
        for (int i = 0; i < 256; i++) {
            gamma_lut[i] = CLAMP_U8((int)(powf(i / 255.0f, inv) * 255.0f));
        }
    }

    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            float r = p[0] / 255.0f;
            float g = p[1] / 255.0f;
            float bl = p[2] / 255.0f;

            if (brightness != 0) {
                r *= bf;
                g *= bf;
                bl *= bf;
            }
            if (contrast != 0) {
                r = (r - 0.5f) * cf + 0.5f;
                g = (g - 0.5f) * cf + 0.5f;
                bl = (bl - 0.5f) * cf + 0.5f;
            }
            if (saturation != 0 || hue != 0) {
                float h, s, l;
                rgb_to_hsl(r, g, bl, &h, &s, &l);
                s = CLAMP(s * sf, 0.0f, 1.0f);
                h = h + hue_shift;
                if (h < 0.0f) {
                    h += 1.0f;
                }
                if (h >= 1.0f) {
                    h -= 1.0f;
                }
                hsl_to_rgb_fixed(h, s, l, &r, &g, &bl);
            }
            if (temperature != 0) {
                r = CLAMP(r * 255.0f + temp_adj, 0, 255) / 255.0f;
                bl = CLAMP(bl * 255.0f - temp_adj, 0, 255) / 255.0f;
            }

            p[0] = CLAMP_U8((int)(r * 255.0f));
            p[1] = CLAMP_U8((int)(g * 255.0f));
            p[2] = CLAMP_U8((int)(bl * 255.0f));

            if (gamma_pct != 100) {
                p[0] = gamma_lut[p[0]];
                p[1] = gamma_lut[p[1]];
                p[2] = gamma_lut[p[2]];
            }
        }
    }
}

gboolean image_effects_grayscale(GdkPixbuf *img) {
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            int g = (int)(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]);
            p[0] = p[1] = p[2] = CLAMP_U8(g);
        }
    }
    return TRUE;
}

gboolean image_effects_sepia(GdkPixbuf *img) {
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            int r = p[0], g = p[1], bl = p[2];
            p[0] = CLAMP_U8((int)(r * 0.393 + g * 0.769 + bl * 0.189));
            p[1] = CLAMP_U8((int)(r * 0.349 + g * 0.686 + bl * 0.168));
            p[2] = CLAMP_U8((int)(r * 0.272 + g * 0.534 + bl * 0.131));
        }
    }
    return TRUE;
}

gboolean image_effects_invert(GdkPixbuf *img) {
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            p[0] = 255 - p[0];
            p[1] = 255 - p[1];
            p[2] = 255 - p[2];
        }
    }
    return TRUE;
}

gboolean image_effects_vignette(GdkPixbuf *img) {
    FxBuf b = fx_buf(img);
    float cx = b.w * 0.5f;
    float cy = b.h * 0.5f;
    float maxd = sqrtf(cx * cx + cy * cy);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            float dx = x - cx;
            float dy = y - cy;
            float d = sqrtf(dx * dx + dy * dy) / maxd;
            float factor = 1.0f - 0.65f * d * d;
            p[0] = CLAMP_U8((int)(p[0] * factor));
            p[1] = CLAMP_U8((int)(p[1] * factor));
            p[2] = CLAMP_U8((int)(p[2] * factor));
        }
    }
    return TRUE;
}

gboolean image_effects_detect_edges(GdkPixbuf *img) {
    GdkPixbuf *copy = fx_copy_rgba(img);
    if (!copy) {
        return FALSE;
    }
    FxBuf s = fx_buf(copy);
    FxBuf d = fx_buf(img);
    for (int y = 1; y < d.h - 1; y++) {
        for (int x = 1; x < d.w - 1; x++) {
            guchar *c = s.px + y * s.rs + x * s.nc;
            guchar *l = s.px + y * s.rs + (x - 1) * s.nc;
            guchar *t = s.px + (y - 1) * s.rs + x * s.nc;
            int gx = abs((int)c[0] - (int)l[0]) + abs((int)c[1] - (int)l[1]) +
                     abs((int)c[2] - (int)l[2]);
            int gy = abs((int)c[0] - (int)t[0]) + abs((int)c[1] - (int)t[1]) +
                     abs((int)c[2] - (int)t[2]);
            int e = CLAMP(gx + gy, 0, 255);
            guchar *p = d.px + y * d.rs + x * d.nc;
            p[0] = p[1] = p[2] = (guchar)e;
        }
    }
    g_object_unref(copy);
    return TRUE;
}

gboolean image_effects_polaroid(GdkPixbuf *img) {
    image_effects_sepia(img);
    FxBuf b = fx_buf(img);
    int border = MAX(4, MIN(b.w, b.h) / 40);
    for (int y = 0; y < b.h; y++) {
        for (int x = 0; x < b.w; x++) {
            if (x < border || y < border || x >= b.w - border || y >= b.h - border) {
                guchar *p = b.px + y * b.rs + x * b.nc;
                p[0] = p[1] = p[2] = 240;
            }
        }
    }
    return TRUE;
}

static GdkPixbuf *fx_box_blur_copy(const GdkPixbuf *src, int radius) {
    if (radius < 1) {
        return fx_copy_rgba(src);
    }
    GdkPixbuf *tmp = fx_copy_rgba(src);
    GdkPixbuf *dst = fx_copy_rgba(src);
    if (!tmp || !dst) {
        g_clear_object(&tmp);
        g_clear_object(&dst);
        return NULL;
    }
    FxBuf s = fx_buf(tmp);
    FxBuf o = fx_buf(dst);
    int diam = radius * 2 + 1;
    int area = diam * diam;

    for (int y = 0; y < s.h; y++) {
        for (int x = 0; x < s.w; x++) {
            int rs = 0, gs = 0, bs = 0, n = 0;
            for (int dy = -radius; dy <= radius; dy++) {
                int yy = y + dy;
                if (yy < 0 || yy >= s.h) {
                    continue;
                }
                for (int dx = -radius; dx <= radius; dx++) {
                    int xx = x + dx;
                    if (xx < 0 || xx >= s.w) {
                        continue;
                    }
                    guchar *p = s.px + yy * s.rs + xx * s.nc;
                    rs += p[0];
                    gs += p[1];
                    bs += p[2];
                    n++;
                }
            }
            if (n == 0) {
                n = 1;
            }
            guchar *d = o.px + y * o.rs + x * o.nc;
            d[0] = (guchar)(rs / n);
            d[1] = (guchar)(gs / n);
            d[2] = (guchar)(bs / n);
        }
    }
    g_object_unref(tmp);
    (void)area;
    return dst;
}

gboolean image_effects_glow(GdkPixbuf *img) {
    GdkPixbuf *blur = fx_box_blur_copy(img, 6);
    if (!blur) {
        return FALSE;
    }
    FxBuf a = fx_buf(img);
    FxBuf b = fx_buf(blur);
    for (int y = 0; y < a.h; y++) {
        for (int x = 0; x < a.w; x++) {
            guchar *p = a.px + y * a.rs + x * a.nc;
            guchar *q = b.px + y * b.rs + x * b.nc;
            p[0] = CLAMP_U8(p[0] + (int)(q[0] * 0.4));
            p[1] = CLAMP_U8(p[1] + (int)(q[1] * 0.4));
            p[2] = CLAMP_U8(p[2] + (int)(q[2] * 0.4));
        }
    }
    g_object_unref(blur);
    return TRUE;
}

gboolean image_effects_high_contrast_bw(GdkPixbuf *img) {
    image_effects_grayscale(img);
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            p[0] = p[1] = p[2] = p[0] > 128 ? 255 : 0;
        }
    }
    return TRUE;
}

gboolean image_effects_posterize(GdkPixbuf *img, int levels) {
    int step = MAX(1, 256 / MAX(2, levels));
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            p[0] = (guchar)(p[0] / step * step);
            p[1] = (guchar)(p[1] / step * step);
            p[2] = (guchar)(p[2] / step * step);
        }
    }
    return TRUE;
}

gboolean image_effects_emboss(GdkPixbuf *img) {
    GdkPixbuf *copy = fx_copy_rgba(img);
    if (!copy) {
        return FALSE;
    }
    FxBuf s = fx_buf(copy);
    FxBuf d = fx_buf(img);
    for (int y = 1; y < d.h - 1; y++) {
        for (int x = 1; x < d.w - 1; x++) {
            guchar *c = s.px + y * s.rs + x * s.nc;
            guchar *l = s.px + y * s.rs + (x - 1) * s.nc;
            guchar *t = s.px + (y - 1) * s.rs + x * s.nc;
            int gray = CLAMP((int)c[0] - (int)l[0] + 128, 0, 255);
            int gray_g = CLAMP((int)c[1] - (int)t[1] + 128, 0, 255);
            int g = (gray + gray_g) / 2;
            guchar *p = d.px + y * d.rs + x * d.nc;
            p[0] = p[1] = p[2] = (guchar)g;
        }
    }
    g_object_unref(copy);
    return TRUE;
}

gboolean image_effects_solarize(GdkPixbuf *img, int threshold) {
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            p[0] = p[0] > threshold ? (guchar)(255 - p[0]) : p[0];
            p[1] = p[1] > threshold ? (guchar)(255 - p[1]) : p[1];
            p[2] = p[2] > threshold ? (guchar)(255 - p[2]) : p[2];
        }
    }
    return TRUE;
}

gboolean image_effects_gaussian_blur(GdkPixbuf *img, int sigma) {
    GdkPixbuf *blur = fx_box_blur_copy(img, MAX(1, sigma));
    if (!blur) {
        return FALSE;
    }
    gdk_pixbuf_copy_area(blur, 0, 0,
                         gdk_pixbuf_get_width(blur), gdk_pixbuf_get_height(blur),
                         img, 0, 0);
    g_object_unref(blur);
    if (sigma > 2) {
        GdkPixbuf *blur2 = fx_box_blur_copy(img, MAX(1, sigma / 2));
        if (blur2) {
            gdk_pixbuf_copy_area(blur2, 0, 0,
                                 gdk_pixbuf_get_width(blur2),
                                 gdk_pixbuf_get_height(blur2),
                                 img, 0, 0);
            g_object_unref(blur2);
        }
    }
    return TRUE;
}

gboolean image_effects_sharpen(GdkPixbuf *img, int amount) {
    GdkPixbuf *blur = fx_box_blur_copy(img, MAX(1, amount));
    if (!blur) {
        return FALSE;
    }
    FxBuf a = fx_buf(img);
    FxBuf b = fx_buf(blur);
    float k = 0.5f + amount * 0.05f;
    for (int y = 0; y < a.h; y++) {
        for (int x = 0; x < a.w; x++) {
            guchar *p = a.px + y * a.rs + x * a.nc;
            guchar *q = b.px + y * b.rs + x * b.nc;
            p[0] = CLAMP_U8((int)(p[0] + k * (p[0] - q[0])));
            p[1] = CLAMP_U8((int)(p[1] + k * (p[1] - q[1])));
            p[2] = CLAMP_U8((int)(p[2] + k * (p[2] - q[2])));
        }
    }
    g_object_unref(blur);
    return TRUE;
}

gboolean image_effects_pixelate(GdkPixbuf *img, int block) {
    block = MAX(2, block);
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y += block) {
        for (int x = 0; x < b.w; x += block) {
            int rs = 0, gs = 0, bs = 0, n = 0;
            for (int dy = 0; dy < block && y + dy < b.h; dy++) {
                for (int dx = 0; dx < block && x + dx < b.w; dx++) {
                    guchar *p = b.px + (y + dy) * b.rs + (x + dx) * b.nc;
                    rs += p[0];
                    gs += p[1];
                    bs += p[2];
                    n++;
                }
            }
            if (n == 0) {
                continue;
            }
            guchar cr = (guchar)(rs / n);
            guchar cg = (guchar)(gs / n);
            guchar cb = (guchar)(bs / n);
            for (int dy = 0; dy < block && y + dy < b.h; dy++) {
                for (int dx = 0; dx < block && x + dx < b.w; dx++) {
                    guchar *p = b.px + (y + dy) * b.rs + (x + dx) * b.nc;
                    p[0] = cr;
                    p[1] = cg;
                    p[2] = cb;
                }
            }
        }
    }
    return TRUE;
}

gboolean image_effects_oil_paint(GdkPixbuf *img, int brush) {
    return image_effects_box_blur(img, MAX(1, brush / 2));
}

gboolean image_effects_box_blur(GdkPixbuf *img, int radius) {
    GdkPixbuf *blur = fx_box_blur_copy(img, MAX(1, radius));
    if (!blur) {
        return FALSE;
    }
    gdk_pixbuf_copy_area(blur, 0, 0,
                         gdk_pixbuf_get_width(blur), gdk_pixbuf_get_height(blur),
                         img, 0, 0);
    g_object_unref(blur);
    return TRUE;
}

gboolean image_effects_brightness_factor(GdkPixbuf *img, float factor) {
    FxBuf b = fx_buf(img);
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            p[0] = CLAMP_U8((int)(p[0] * factor));
            p[1] = CLAMP_U8((int)(p[1] * factor));
            p[2] = CLAMP_U8((int)(p[2] * factor));
        }
    }
    return TRUE;
}

GdkPixbuf *image_effects_resize(const GdkPixbuf *src, int w, int h) {
    w = MAX(1, w);
    h = MAX(1, h);
    return gdk_pixbuf_scale_simple(src, w, h, GDK_INTERP_BILINEAR);
}

GdkPixbuf *image_effects_rotate(const GdkPixbuf *src, double degrees) {
    if (fabs(degrees) < 0.01) {
        return fx_copy_rgba(src);
    }
    int w = gdk_pixbuf_get_width(src);
    int h = gdk_pixbuf_get_height(src);
    double rad = degrees * G_PI / 180.0;
    double cos_a = cos(rad);
    double sin_a = sin(rad);
    int nw = (int)(fabs(w * cos_a) + fabs(h * sin_a)) + 2;
    int nh = (int)(fabs(w * sin_a) + fabs(h * cos_a)) + 2;

    GdkPixbuf *dst = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, nw, nh);
    if (!dst) {
        return NULL;
    }
    gdk_pixbuf_fill(dst, 0x00000000);

    double cx = w * 0.5;
    double cy = h * 0.5;
    double ncx = nw * 0.5;
    double ncy = nh * 0.5;

    FxBuf s = fx_buf((GdkPixbuf *)src);
    FxBuf d = fx_buf(dst);

    for (int y = 0; y < nh; y++) {
        for (int x = 0; x < nw; x++) {
            double dx = x - ncx;
            double dy = y - ncy;
            double sx = dx * cos_a + dy * sin_a + cx;
            double sy = -dx * sin_a + dy * cos_a + cy;
            int ix = (int)(sx + 0.5);
            int iy = (int)(sy + 0.5);
            if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
                continue;
            }
            guchar *sp = s.px + iy * s.rs + ix * s.nc;
            guchar *dp = d.px + y * d.rs + x * d.nc;
            dp[0] = sp[0];
            dp[1] = sp[1];
            dp[2] = sp[2];
            if (d.nc > 3) {
                dp[3] = sp[3];
            }
        }
    }
    return dst;
}

GdkPixbuf *image_effects_flip_h(const GdkPixbuf *src) {
    return gdk_pixbuf_flip(src, TRUE);
}

GdkPixbuf *image_effects_flip_v(const GdkPixbuf *src) {
    return gdk_pixbuf_flip(src, FALSE);
}

GdkPixbuf *image_effects_crop(const GdkPixbuf *src, int x, int y, int cw, int ch) {
    int sw = gdk_pixbuf_get_width(src);
    int sh = gdk_pixbuf_get_height(src);
    x = CLAMP(x, 0, sw - 1);
    y = CLAMP(y, 0, sh - 1);
    cw = CLAMP(cw, 1, sw - x);
    ch = CLAMP(ch, 1, sh - y);
    GdkPixbuf *dst = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, cw, ch);
    if (!dst) {
        return NULL;
    }
    gdk_pixbuf_copy_area(src, x, y, cw, ch, dst, 0, 0);
    return dst;
}

gboolean image_effects_remove_bg_color(GdkPixbuf *img,
                                     guint8 tr, guint8 tg, guint8 tb,
                                     int tolerance,
                                     ImageEffectsProgressFn progress,
                                     gpointer progress_data) {
    int t_sq = tolerance * tolerance * 3;
    FxBuf b = fx_buf(img);
    if (progress) {
        progress(0, "색상 기반 배경 제거 준비 중...", progress_data);
    }
    for (int y = 0; y < b.h; y++) {
        guchar *row = b.px + y * b.rs;
        for (int x = 0; x < b.w; x++) {
            guchar *p = row + x * b.nc;
            if (color_dist_sq(p[0], p[1], p[2], tr, tg, tb) <= t_sq) {
                p[0] = p[1] = p[2] = 0;
                if (b.nc > 3) {
                    p[3] = 0;
                }
            }
        }
        if (progress && (y % 32 == 0 || y == b.h - 1)) {
            int pct = (y + 1) * 100 / MAX(1, b.h);
            progress(pct, "색상 기반 배경 제거 중...", progress_data);
        }
    }
    if (progress) {
        progress(100, "색상 기반 배경 제거 완료", progress_data);
    }
    return TRUE;
}

typedef struct {
    FxBuf b;
    int w;
    int h;
    int t_sq;
    guint8 tr, tg, tb;
    gboolean *visited;
    int *qx;
    int *qy;
    int tail;
} FloodCtx;

static void flood_enqueue(FloodCtx *ctx, int px, int py) {
    if (px < 0 || py < 0 || px >= ctx->w || py >= ctx->h) {
        return;
    }
    if (ctx->visited[py * ctx->w + px]) {
        return;
    }
    guchar *p = ctx->b.px + py * ctx->b.rs + px * ctx->b.nc;
    if (color_dist_sq(p[0], p[1], p[2], ctx->tr, ctx->tg, ctx->tb) <= ctx->t_sq) {
        ctx->visited[py * ctx->w + px] = TRUE;
        ctx->qx[ctx->tail] = px;
        ctx->qy[ctx->tail] = py;
        ctx->tail++;
    }
}

gboolean image_effects_remove_bg_flood(GdkPixbuf *img,
                                       guint8 tr, guint8 tg, guint8 tb,
                                       int tolerance,
                                       ImageEffectsProgressFn progress,
                                       gpointer progress_data) {
    FxBuf b = fx_buf(img);
    int w = b.w;
    int h = b.h;
    int t_sq = tolerance * tolerance * 3;
    gboolean *visited = g_new0(gboolean, (size_t)w * (size_t)h);
    int *qx = g_malloc((size_t)w * (size_t)h * sizeof(int));
    int *qy = g_malloc((size_t)w * (size_t)h * sizeof(int));
    int head = 0;

    if (progress) {
        progress(0, "가장자리 색상 분석 중...", progress_data);
    }

    FloodCtx ctx = {.b = b,
                    .w = w,
                    .h = h,
                    .t_sq = t_sq,
                    .tr = tr,
                    .tg = tg,
                    .tb = tb,
                    .visited = visited,
                    .qx = qx,
                    .qy = qy,
                    .tail = 0};

    for (int x = 0; x < w; x++) {
        flood_enqueue(&ctx, x, 0);
        flood_enqueue(&ctx, x, h - 1);
    }
    for (int y = 1; y < h - 1; y++) {
        flood_enqueue(&ctx, 0, y);
        flood_enqueue(&ctx, w - 1, y);
    }

    static const int dx[] = {0, 0, 1, -1};
    static const int dy[] = {1, -1, 0, 0};
    int total_pixels = w * h;
    int expanded = 0;

    if (progress) {
        progress(10, "배경 영역 확장 중...", progress_data);
    }

    while (head < ctx.tail) {
        int cx = qx[head];
        int cy = qy[head];
        head++;
        expanded++;
        for (int d = 0; d < 4; d++) {
            flood_enqueue(&ctx, cx + dx[d], cy + dy[d]);
        }
        if (progress && expanded % 5000 == 0) {
            int pct = 10 + (int)(60.0 * expanded / MAX(1, total_pixels));
            progress(MIN(pct, 70), "배경 영역 확장 중...", progress_data);
        }
    }

    if (progress) {
        progress(75, "투명 처리 적용 중...", progress_data);
    }

    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            if (visited[y * w + x]) {
                guchar *p = b.px + y * b.rs + x * b.nc;
                p[0] = p[1] = p[2] = 0;
                if (b.nc > 3) {
                    p[3] = 0;
                }
            }
        }
        if (progress && (y % 32 == 0 || y == h - 1)) {
            int pct = 75 + (y + 1) * 24 / MAX(1, h);
            progress(pct, "투명 처리 적용 중...", progress_data);
        }
    }

    g_free(visited);
    g_free(qx);
    g_free(qy);
    if (progress) {
        progress(100, "플러드 필 배경 제거 완료", progress_data);
    }
    return TRUE;
}

