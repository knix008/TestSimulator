#include "heif_native.h"

#include "image_io.h"

#include <glib.h>
#include <math.h>
#include <string.h>

#ifdef HAVE_LIBHEIF

#include <libheif/heif.h>

#define HEIF_CHECK(err, label) \
    do { \
        if ((err).code != heif_error_Ok) { \
            goto label; \
        } \
    } while (0)

static double clampd(double v, double lo, double hi) {
    if (v < lo) {
        return lo;
    }
    if (v > hi) {
        return hi;
    }
    return v;
}

/* SMPTE ST 2084 (PQ) EOTF — 신호 0..1 → 선형 휘도 0..1 (10000 nit 기준) */
static double pq_eotf_linear(double n) {
    if (n <= 0.0) {
        return 0.0;
    }
    const double m1 = 2610.0 / 16384.0;
    const double m2 = (2523.0 / 4096.0) * 128.0;
    const double c1 = 3424.0 / 4096.0;
    const double c2 = 2413.0 / 128.0;
    const double c3 = 2392.0 / 128.0;

    double np = pow(n, 1.0 / m2);
    double num = fmax(0.0, np - c1);
    double den = c2 - c3 * np;
    if (den <= 0.0) {
        return 0.0;
    }
    double l = pow(num / den, 1.0 / m1);
    return l / 10000.0;
}

/* HLG 역 OETF (ITU-R BT.2100) — 신호 0..1 → 선형 0..1 */
static double hlg_eotf_linear(double e) {
    if (e <= 0.0) {
        return 0.0;
    }
    if (e <= 0.5) {
        return (e * e) / 3.0;
    }
    return (exp((e - 0.55991073) / 0.17883277) + 0.28466892) / 12.0;
}

static double srgb_oetf(double linear) {
    linear = clampd(linear, 0.0, 1.0);
    if (linear <= 0.0031308) {
        return 12.92 * linear;
    }
    return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
}

/* ACES fitted — HDR 선형 RGB → 0..1 디스플레이 */
static void aces_tonemap_rgb(double *r, double *g, double *b) {
    double a = 2.51, bb = 0.03, c = 2.43, d = 0.59, e = 0.14;
    double in[3] = {*r * 4.0, *g * 4.0, *b * 4.0};
    for (int i = 0; i < 3; i++) {
        double x = fmax(0.0, in[i]);
        in[i] = clampd((x * (a * x + bb)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    *r = in[0];
    *g = in[1];
    *b = in[2];
}

static void apply_transfer_to_linear(double *r, double *g, double *b,
                                     enum heif_transfer_characteristics trc) {
    switch (trc) {
    case heif_transfer_characteristic_ITU_R_BT_2100_0_PQ:
        *r = pq_eotf_linear(*r);
        *g = pq_eotf_linear(*g);
        *b = pq_eotf_linear(*b);
        break;
    case heif_transfer_characteristic_ITU_R_BT_2100_0_HLG:
        *r = hlg_eotf_linear(*r);
        *g = hlg_eotf_linear(*g);
        *b = hlg_eotf_linear(*b);
        break;
    case heif_transfer_characteristic_linear:
        break;
    default:
        /* sRGB/709 등: 감마 2.2 근사 */
        *r = pow(clampd(*r, 0.0, 1.0), 2.2);
        *g = pow(clampd(*g, 0.0, 1.0), 2.2);
        *b = pow(clampd(*b, 0.0, 1.0), 2.2);
        break;
    }
}

bool heif_native_is_available(void) {
    return TRUE;
}

bool heif_native_heif_to_jpeg(const char *heif_path, const char *jpg_path) {
    if (!heif_path || !jpg_path) {
        return false;
    }

    struct heif_context *ctx = heif_context_alloc();
    if (!ctx) {
        return false;
    }

    struct heif_error err = heif_context_read_from_file(ctx, heif_path, NULL);
    if (err.code != heif_error_Ok) {
        heif_context_free(ctx);
        return false;
    }

    struct heif_image_handle *handle = NULL;
    err = heif_context_get_primary_image_handle(ctx, &handle);
    if (err.code != heif_error_Ok) {
        heif_context_free(ctx);
        return false;
    }

    enum heif_transfer_characteristics trc =
        heif_transfer_characteristic_ITU_R_BT_709_5;
    struct heif_color_profile_nclx *nclx = NULL;
    err = heif_image_handle_get_nclx_color_profile(handle, &nclx);
    if (err.code == heif_error_Ok && nclx) {
        trc = nclx->transfer_characteristics;
        heif_nclx_color_profile_free(nclx);
    }

    struct heif_image *img = NULL;
    err = heif_decode_image(handle, &img, heif_colorspace_RGB,
                            heif_chroma_interleaved_RGB, NULL);
    if (err.code != heif_error_Ok) {
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        return false;
    }

    int w = heif_image_get_width(img, heif_channel_interleaved);
    int h = heif_image_get_height(img, heif_channel_interleaved);
    if (w < 1 || h < 1) {
        heif_image_release(img);
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        return false;
    }

    int bpp = heif_image_get_bits_per_pixel(img, heif_channel_interleaved);
    int range_min = 0, range_max = 255;
    heif_image_get_bits_per_pixel_range(img, heif_channel_interleaved, &range_min,
                                        &range_max);
    double inv_max = 1.0 / (double)MAX(1, range_max);

    int stride = 0;
    const uint8_t *plane =
        heif_image_get_plane_readonly(img, heif_channel_interleaved, &stride);
    if (!plane) {
        heif_image_release(img);
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        return false;
    }

    gboolean use_16bit = bpp > 8;

    GdkPixbuf *pb = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, w, h);
    if (!pb) {
        heif_image_release(img);
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        return false;
    }

    guchar *out = gdk_pixbuf_get_pixels(pb);
    int out_stride = gdk_pixbuf_get_rowstride(pb);

    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            double r, g, b;
            if (use_16bit) {
                const uint16_t *row =
                    (const uint16_t *)(plane + y * stride);
                const uint16_t *p = row + x * 3;
                r = p[0] * inv_max;
                g = p[1] * inv_max;
                b = p[2] * inv_max;
            } else {
                const uint8_t *p = plane + y * stride + x * 3;
                r = p[0] * inv_max;
                g = p[1] * inv_max;
                b = p[2] * inv_max;
            }

            apply_transfer_to_linear(&r, &g, &b, trc);

            gboolean hdr_trc =
                trc == heif_transfer_characteristic_ITU_R_BT_2100_0_PQ ||
                trc == heif_transfer_characteristic_ITU_R_BT_2100_0_HLG;
            if (hdr_trc) {
                aces_tonemap_rgb(&r, &g, &b);
            }

            r = srgb_oetf(r);
            g = srgb_oetf(g);
            b = srgb_oetf(b);

            guchar *op = out + y * out_stride + x * 3;
            op[0] = (guchar)CLAMP((int)(r * 255.0 + 0.5), 0, 255);
            op[1] = (guchar)CLAMP((int)(g * 255.0 + 0.5), 0, 255);
            op[2] = (guchar)CLAMP((int)(b * 255.0 + 0.5), 0, 255);
        }
    }

    GError *save_err = NULL;
    gboolean saved = image_io_save_jpeg(pb, jpg_path, &save_err);
    g_object_unref(pb);
    heif_image_release(img);
    heif_image_handle_release(handle);
    heif_context_free(ctx);
    g_clear_error(&save_err);
    return saved;
}

#else

bool heif_native_is_available(void) {
    return false;
}

bool heif_native_heif_to_jpeg(const char *heif_path, const char *jpg_path) {
    (void)heif_path;
    (void)jpg_path;
    return false;
}

#endif
