/*
 * heif_native.c — HEIF/HIF → GdkPixbuf (C11, libheif C API)
 *
 * 공식 예제 흐름 (https://github.com/strukturag/libheif):
 *   heif_context_alloc / heif_context_read_from_file
 *   heif_context_get_primary_image_handle
 *   heif_decode_image(..., heif_colorspace_RGB, heif_chroma_interleaved_RGB, opts)
 *   heif_image_get_plane_readonly(heif_channel_interleaved)
 *
 * HDR(PQ/HLG): heif_decoding_options.convert_hdr_to_8bit = 1
 *   (libheif 내장 색공간 변환 — README "correct color transform")
 *
 * JPEG 저장: image_io_save_jpeg() (gdk-pixbuf)
 */
#include "heif_native.h"

#include <math.h>
#include <string.h>

#ifdef HAVE_LIBHEIF

#include <libheif/heif.h>

typedef struct {
    enum heif_transfer_characteristics trc;
    gboolean hdr_trc;
    gboolean force_hdr;
    gboolean libheif_hdr_to_sdr;
} HeifColorInfo;

static double clampd(double v, double lo, double hi) {
    if (v < lo) {
        return lo;
    }
    if (v > hi) {
        return hi;
    }
    return v;
}

static gboolean path_is_hif(const char *path) {
    const char *ext = strrchr(path, '.');
    return ext && g_ascii_strcasecmp(ext, ".hif") == 0;
}

static gboolean trc_is_hdr(enum heif_transfer_characteristics trc) {
    return trc == heif_transfer_characteristic_ITU_R_BT_2100_0_PQ ||
           trc == heif_transfer_characteristic_ITU_R_BT_2100_0_HLG;
}

static void heif_error_to_gerror(struct heif_error e, GError **err, const char *prefix) {
    if (!err) {
        return;
    }
    const char *msg = (e.message && e.message[0]) ? e.message : "libheif 오류";
    *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s: %s", prefix, msg);
}

static void read_color_info(struct heif_image_handle *handle, const char *path,
                            HeifColorInfo *info) {
    info->trc = heif_transfer_characteristic_ITU_R_BT_709_5;
    info->hdr_trc = FALSE;
    info->force_hdr = path_is_hif(path);
    info->libheif_hdr_to_sdr = FALSE;

    struct heif_color_profile_nclx *nclx = NULL;
    struct heif_error err = heif_image_handle_get_nclx_color_profile(handle, &nclx);
    if (err.code == heif_error_Ok && nclx) {
        info->trc = nclx->transfer_characteristics;
        info->hdr_trc = trc_is_hdr(info->trc);
        heif_nclx_color_profile_free(nclx);
    }
    if (info->hdr_trc) {
        info->force_hdr = TRUE;
    }
}

static gboolean wants_hdr_to_sdr(const HeifColorInfo *ci) {
    return ci->hdr_trc || ci->force_hdr;
}

static struct heif_error decode_rgb_image(struct heif_image_handle *handle, HeifColorInfo *ci,
                                          struct heif_image **img_out) {
    struct heif_decoding_options *opts = heif_decoding_options_alloc();
    if (!opts) {
        struct heif_error err;
        err.code = heif_error_Memory_allocation_error;
        err.subcode = heif_suberror_Unspecified;
        err.message = "decoding options";
        return err;
    }

    if (wants_hdr_to_sdr(ci)) {
        opts->convert_hdr_to_8bit = 1;
        ci->libheif_hdr_to_sdr = TRUE;
    }

    struct heif_error err = heif_decode_image(handle, img_out, heif_colorspace_RGB,
                                            heif_chroma_interleaved_RGB, opts);

    if (err.code != heif_error_Ok && ci->libheif_hdr_to_sdr) {
        opts->convert_hdr_to_8bit = 0;
        ci->libheif_hdr_to_sdr = FALSE;
        err = heif_decode_image(handle, img_out, heif_colorspace_RGB,
                                heif_chroma_interleaved_RGB, opts);
    }

    heif_decoding_options_free(opts);
    return err;
}

static double sample_to_unit(guint64 v, int range_min, int range_max) {
    double denom = (double)MAX(1, range_max - range_min);
    return clampd(((double)v - range_min) / denom, 0.0, 1.0);
}

static double linear_to_srgb_display(double linear) {
    linear = clampd(linear, 0.0, 1.0);
    if (linear <= 0.0031308) {
        return 12.92 * linear;
    }
    return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
}

#define SDR_TARGET_LUMA 0.30

static double pixbuf_sample_luma_mean(GdkPixbuf *pb) {
    int w = gdk_pixbuf_get_width(pb);
    int h = gdk_pixbuf_get_height(pb);
    int rs = gdk_pixbuf_get_rowstride(pb);
    guchar *px = gdk_pixbuf_get_pixels(pb);
    double sum = 0.0;
    int n = 0;
    int step_x = MAX(1, w / 48);
    int step_y = MAX(1, h / 48);
    for (int y = 0; y < h; y += step_y) {
        for (int x = 0; x < w; x += step_x) {
            guchar *p = px + y * rs + x * 3;
            sum += 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
            n++;
        }
    }
    return n > 0 ? sum / (n * 255.0) : 0.0;
}

static void pixbuf_apply_luma_gain(GdkPixbuf *pb, double gain) {
    int w = gdk_pixbuf_get_width(pb);
    int h = gdk_pixbuf_get_height(pb);
    int rs = gdk_pixbuf_get_rowstride(pb);
    guchar *px = gdk_pixbuf_get_pixels(pb);
    for (int y = 0; y < h; y++) {
        guchar *row = px + y * rs;
        for (int x = 0; x < w; x++) {
            guchar *p = row + x * 3;
            for (int c = 0; c < 3; c++) {
                p[c] = (guchar)CLAMP((int)(p[c] * gain + 0.5), 0, 255);
            }
        }
    }
}

static void pixbuf_tone_map_to_target(GdkPixbuf *pb, double target) {
    double mean = pixbuf_sample_luma_mean(pb);
    if (mean > target + 0.012) {
        double gain = target / mean;
        gain = clampd(gain, 0.50, 1.0);
        pixbuf_apply_luma_gain(pb, gain);
    }
}

/* libheif RGB 8-bit → GdkPixbuf (공식 예제: plane 직접 복사) */
static GdkPixbuf *pixbuf_from_heif_image(struct heif_image *img, const HeifColorInfo *ci) {
    int w = heif_image_get_width(img, heif_channel_interleaved);
    int h = heif_image_get_height(img, heif_channel_interleaved);
    if (w < 1 || h < 1) {
        return NULL;
    }

    int range_bits =
        heif_image_get_bits_per_pixel_range(img, heif_channel_interleaved);
    int range_min = 0;
    int range_max = (range_bits > 0) ? ((1 << range_bits) - 1) : 255;
    if (range_max < 255) {
        range_max = 255;
    }
    gboolean use_16bit = range_bits > 8;

    int stride = 0;
    const uint8_t *plane =
        heif_image_get_plane_readonly(img, heif_channel_interleaved, &stride);
    if (!plane) {
        return NULL;
    }

    GdkPixbuf *pb = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, w, h);
    if (!pb) {
        return NULL;
    }

    guchar *out = gdk_pixbuf_get_pixels(pb);
    int out_stride = gdk_pixbuf_get_rowstride(pb);

    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            double r, g, b;
            if (use_16bit) {
                const uint16_t *p = (const uint16_t *)(plane + y * stride) + x * 3;
                r = sample_to_unit(p[0], range_min, range_max);
                g = sample_to_unit(p[1], range_min, range_max);
                b = sample_to_unit(p[2], range_min, range_max);
            } else {
                const uint8_t *p = plane + y * stride + x * 3;
                r = sample_to_unit(p[0], range_min, range_max);
                g = sample_to_unit(p[1], range_min, range_max);
                b = sample_to_unit(p[2], range_min, range_max);
            }

            if (!ci->libheif_hdr_to_sdr && !ci->force_hdr) {
                r = linear_to_srgb_display(r);
                g = linear_to_srgb_display(g);
                b = linear_to_srgb_display(b);
            }

            guchar *op = out + y * out_stride + x * 3;
            op[0] = (guchar)CLAMP((int)(r * 255.0 + 0.5), 0, 255);
            op[1] = (guchar)CLAMP((int)(g * 255.0 + 0.5), 0, 255);
            op[2] = (guchar)CLAMP((int)(b * 255.0 + 0.5), 0, 255);
        }
    }

    if (ci->libheif_hdr_to_sdr || ci->force_hdr) {
        pixbuf_tone_map_to_target(pb, SDR_TARGET_LUMA);
    }

    return pb;
}

bool heif_native_is_available(void) {
    return TRUE;
}

GdkPixbuf *heif_native_load_pixbuf(const char *heif_path, GError **err) {
    if (!heif_path) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_INVAL, "경로가 비어 있습니다.");
        }
        return NULL;
    }

    struct heif_context *ctx = heif_context_alloc();
    if (!ctx) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "libheif 컨텍스트 생성 실패");
        }
        return NULL;
    }

    struct heif_error herr = heif_context_read_from_file(ctx, heif_path, NULL);
    if (herr.code != heif_error_Ok) {
        heif_context_free(ctx);
        heif_error_to_gerror(herr, err, "HEIF 파일 읽기");
        return NULL;
    }

    struct heif_image_handle *handle = NULL;
    herr = heif_context_get_primary_image_handle(ctx, &handle);
    if (herr.code != heif_error_Ok) {
        heif_context_free(ctx);
        heif_error_to_gerror(herr, err, "기본 이미지");
        return NULL;
    }

    HeifColorInfo ci;
    read_color_info(handle, heif_path, &ci);

    struct heif_image *img = NULL;
    herr = decode_rgb_image(handle, &ci, &img);
    if (herr.code != heif_error_Ok) {
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        heif_error_to_gerror(herr, err, "HEIF 디코드");
        return NULL;
    }

    GdkPixbuf *pb = pixbuf_from_heif_image(img, &ci);

    heif_image_release(img);
    heif_image_handle_release(handle);
    heif_context_free(ctx);

    if (!pb && err) {
        *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "sRGB 픽셀 버퍼 생성 실패");
    }
    return pb;
}

#else

bool heif_native_is_available(void) {
    return false;
}

GdkPixbuf *heif_native_load_pixbuf(const char *heif_path, GError **err) {
    (void)heif_path;
    if (err) {
        *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                           "libheif 없음 — libheif-dev 설치 후 다시 빌드하세요.");
    }
    return NULL;
}

#endif
