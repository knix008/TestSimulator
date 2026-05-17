/*
 * heif_native.c — HEIF/HIF → GdkPixbuf (C11, libheif C API)
 *
 * SDR(HEIC/HEIF):  heif_chroma_interleaved_RGB (8-bit) → memcpy to GdkPixbuf.
 * HDR(HIF/PQ/HLG): heif_chroma_interleaved_RRGGBB_LE (16-bit) →
 *   PQ EOTF → BT.2020→BT.709 matrix → ACES filmic tone map → sRGB OETF.
 *
 * 참고: https://github.com/strukturag/libheif
 *   convert_hdr_to_8bit 은 단순 비트 축소(>>2)이며 톤 매핑을 하지 않으므로
 *   HDR 파일은 16-bit로 디코딩 후 수동으로 색공간/톤 변환을 수행한다.
 *
 * 성능: pow() 집약적인 PQ EOTF 와 sRGB OETF 를 LUT 로 처리 (~4x 빠름).
 */
#include "heif_native.h"

#include <math.h>
#include <string.h>

#ifdef HAVE_LIBHEIF

#include <libheif/heif.h>

/* ------------------------------------------------------------------ */
/* LUT — 초기화는 g_once 로 스레드 안전하게 한 번만 수행              */
/* ------------------------------------------------------------------ */

#define PQ_LUT_SIZE   1024   /* 10-bit: 0..1023 */
#define SRGB_LUT_SIZE 4096   /* linear [0..1] 분해능 1/4095 */

static float   s_pq_nit[PQ_LUT_SIZE];       /* PQ 신호 → nits */
static float   s_hlg_nit[PQ_LUT_SIZE];      /* HLG 신호 → "nit 등가"  */
static uint8_t s_srgb8[SRGB_LUT_SIZE];      /* linear [0,1] → sRGB 8-bit */

static GOnce s_lut_once = G_ONCE_INIT;

static double pq_eotf_f(double e) {
    static const double m1 = 0.1593017578125, m2 = 78.84375;
    static const double c1 = 0.8359375, c2 = 18.8515625, c3 = 18.6875;
    if (e <= 0.0) return 0.0;
    double ep  = pow(e, 1.0 / m2);
    double num = ep - c1;
    if (num <= 0.0) return 0.0;
    double den = c2 - c3 * ep;
    if (den <= 0.0) return 0.0;
    return pow(num / den, 1.0 / m1) * 10000.0;
}

static double hlg_to_nit_f(double e) {
    static const double a = 0.17883277, b = 0.28466892, c = 0.55991073;
    double l;
    if (e <= 0.5) l = (e * e) / 3.0;
    else          l = (exp((e - c) / a) + b) / 12.0;
    /* reference white (signal=0.75) → 203 nit (HLG reference) */
    return l / 0.1875 * 203.0;
}

static double linear_to_srgb_f(double l) {
    if (l <= 0.0) return 0.0;
    if (l >= 1.0) return 1.0;
    return l <= 0.0031308 ? l * 12.92 : 1.055 * pow(l, 1.0 / 2.4) - 0.055;
}

static gpointer lut_init_once(gpointer unused) {
    (void)unused;
    for (int i = 0; i < PQ_LUT_SIZE; i++) {
        s_pq_nit[i]  = (float)pq_eotf_f(i / (PQ_LUT_SIZE - 1.0));
        s_hlg_nit[i] = (float)hlg_to_nit_f(i / (PQ_LUT_SIZE - 1.0));
    }
    for (int i = 0; i < SRGB_LUT_SIZE; i++) {
        double l = i / (SRGB_LUT_SIZE - 1.0);
        s_srgb8[i] = (uint8_t)(linear_to_srgb_f(l) * 255.0 + 0.5);
    }
    return NULL;
}

#define ENSURE_LUTS() g_once(&s_lut_once, lut_init_once, NULL)

static inline uint8_t lut_srgb8(float l) {
    int idx = (int)(l * (SRGB_LUT_SIZE - 1) + 0.5f);
    if (idx < 0) idx = 0;
    if (idx >= SRGB_LUT_SIZE) idx = SRGB_LUT_SIZE - 1;
    return s_srgb8[idx];
}

/* ------------------------------------------------------------------ */
/* ACES filmic 톤 맵 (Narkowicz 2015)                                  */
/* 입력: linear scene (1.0 = 100 nit), 출력: display linear [0,1]     */
/* ------------------------------------------------------------------ */
static inline float aces_filmic(float x) {
    if (x <= 0.0f) return 0.0f;
    float v = (x * (2.51f * x + 0.03f)) / (x * (2.43f * x + 0.59f) + 0.14f);
    return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
}

/* ------------------------------------------------------------------ */
/* HEIF 유틸리티                                                       */
/* ------------------------------------------------------------------ */

static gboolean path_is_hif(const char *path) {
    const char *ext = strrchr(path, '.');
    return ext && g_ascii_strcasecmp(ext, ".hif") == 0;
}

static gboolean trc_is_pq(enum heif_transfer_characteristics trc) {
    return trc == heif_transfer_characteristic_ITU_R_BT_2100_0_PQ;
}

static gboolean trc_is_hlg(enum heif_transfer_characteristics trc) {
    return trc == heif_transfer_characteristic_ITU_R_BT_2100_0_HLG;
}

static void heif_error_to_gerror(struct heif_error e, GError **err,
                                  const char *prefix) {
    if (!err) return;
    const char *msg = (e.message && e.message[0]) ? e.message : "libheif 오류";
    *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                       "%s: %s", prefix, msg);
}

typedef struct {
    gboolean is_hdr;
    gboolean is_hlg;         /* TRUE=HLG, FALSE=PQ (when is_hdr) */
    gboolean wide_gamut;     /* BT.2020 primaries */
} HeifHdrInfo;

static HeifHdrInfo query_hdr_info(struct heif_image_handle *handle,
                                   const char *path) {
    HeifHdrInfo info = {FALSE, FALSE, FALSE};

    if (path_is_hif(path)) info.is_hdr = TRUE;

    struct heif_color_profile_nclx *nclx = NULL;
    if (heif_image_handle_get_nclx_color_profile(handle, &nclx).code
            == heif_error_Ok && nclx) {
        if (trc_is_pq(nclx->transfer_characteristics))  info.is_hdr = TRUE;
        if (trc_is_hlg(nclx->transfer_characteristics)) {
            info.is_hdr = TRUE;
            info.is_hlg = TRUE;
        }
        info.wide_gamut =
            (nclx->color_primaries
             == heif_color_primaries_ITU_R_BT_2020_2_and_2100_0);
        heif_nclx_color_profile_free(nclx);
    }
    return info;
}

/* ------------------------------------------------------------------ */
/* GdkPixbuf 생성                                                      */
/* ------------------------------------------------------------------ */

/* SDR: libheif 8-bit sRGB → 직접 복사 */
static GdkPixbuf *pixbuf_from_sdr_rgb8(struct heif_image *img) {
    int w = heif_image_get_width(img, heif_channel_interleaved);
    int h = heif_image_get_height(img, heif_channel_interleaved);
    if (w < 1 || h < 1) return NULL;

    int src_stride = 0;
    const uint8_t *plane =
        heif_image_get_plane_readonly(img, heif_channel_interleaved,
                                      &src_stride);
    if (!plane || src_stride < w * 3) return NULL;

    GdkPixbuf *pb = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, w, h);
    if (!pb) return NULL;

    guchar *dst       = gdk_pixbuf_get_pixels(pb);
    int    dst_stride = gdk_pixbuf_get_rowstride(pb);

    for (int y = 0; y < h; y++)
        memcpy(dst + y * dst_stride, plane + y * src_stride, (size_t)w * 3);
    return pb;
}

/* HDR: 16-bit RRGGBB_LE (bpp=10 또는 12) →
 *   (PQ|HLG) EOTF[LUT] → BT.2020→BT.709 → ACES 톤맵 → sRGB[LUT] */
static GdkPixbuf *pixbuf_from_hdr_rgb16(struct heif_image *img,
                                         const HeifHdrInfo *info) {
    int w = heif_image_get_width(img, heif_channel_interleaved);
    int h = heif_image_get_height(img, heif_channel_interleaved);
    if (w < 1 || h < 1) return NULL;

    int bpp = heif_image_get_bits_per_pixel_range(img, heif_channel_interleaved);
    if (bpp < 1 || bpp > 16) bpp = 10;
    int max_val = (1 << bpp) - 1;   /* 1023 for 10-bit */

    /* LUT 인덱스 스케일: 입력값 → PQ/HLG LUT 인덱스 (0..1023) */
    float lut_scale = (float)(PQ_LUT_SIZE - 1) / (float)max_val;

    int src_stride = 0;
    const uint8_t *plane =
        heif_image_get_plane_readonly(img, heif_channel_interleaved,
                                      &src_stride);
    if (!plane) return NULL;

    ENSURE_LUTS();

    const float *eotf_lut = info->is_hlg ? s_hlg_nit : s_pq_nit;

    GdkPixbuf *pb = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, w, h);
    if (!pb) return NULL;

    guchar *dst       = gdk_pixbuf_get_pixels(pb);
    int    dst_stride = gdk_pixbuf_get_rowstride(pb);

    for (int y = 0; y < h; y++) {
        const uint16_t *src_row =
            (const uint16_t *)(plane + y * src_stride);
        guchar *dst_row = dst + y * dst_stride;

        for (int x = 0; x < w; x++) {
            /* 1. EOTF via LUT: 10/12-bit → nits */
            int ir = (int)(src_row[x * 3 + 0] * lut_scale + 0.5f);
            int ig = (int)(src_row[x * 3 + 1] * lut_scale + 0.5f);
            int ib = (int)(src_row[x * 3 + 2] * lut_scale + 0.5f);
            if (ir >= PQ_LUT_SIZE) ir = PQ_LUT_SIZE - 1;
            if (ig >= PQ_LUT_SIZE) ig = PQ_LUT_SIZE - 1;
            if (ib >= PQ_LUT_SIZE) ib = PQ_LUT_SIZE - 1;

            /* nits, normalized to [0,1] relative to 10000 nit peak */
            float r = eotf_lut[ir] * 1e-4f;
            float g = eotf_lut[ig] * 1e-4f;
            float b = eotf_lut[ib] * 1e-4f;

            /* 2. BT.2020 → BT.709 색역 변환 (선형 광 도메인) */
            if (info->wide_gamut) {
                float r7 = 1.6605f*r - 0.5876f*g - 0.0728f*b;
                float g7 =-0.1246f*r + 1.1329f*g - 0.0083f*b;
                float b7 =-0.0182f*r - 0.1006f*g + 1.1187f*b;
                r = r7 < 0.0f ? 0.0f : r7;
                g = g7 < 0.0f ? 0.0f : g7;
                b = b7 < 0.0f ? 0.0f : b7;
            }

            /* 3. ACES 톤맵 (100 nit = 1.0 기준) */
            r = aces_filmic(r * 100.0f);
            g = aces_filmic(g * 100.0f);
            b = aces_filmic(b * 100.0f);

            /* 4. sRGB OETF via LUT */
            dst_row[x * 3 + 0] = lut_srgb8(r);
            dst_row[x * 3 + 1] = lut_srgb8(g);
            dst_row[x * 3 + 2] = lut_srgb8(b);
        }
    }
    return pb;
}

/* ------------------------------------------------------------------ */
/* 공개 API                                                            */
/* ------------------------------------------------------------------ */

bool heif_native_is_available(void) { return TRUE; }

GdkPixbuf *heif_native_load_pixbuf(const char *heif_path, GError **err) {
    if (!heif_path) {
        if (err)
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_INVAL,
                               "경로가 비어 있습니다.");
        return NULL;
    }

    struct heif_context *ctx = heif_context_alloc();
    if (!ctx) {
        if (err)
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "libheif 컨텍스트 생성 실패");
        return NULL;
    }

    struct heif_error herr =
        heif_context_read_from_file(ctx, heif_path, NULL);
    if (herr.code != heif_error_Ok) {
        heif_context_free(ctx);
        heif_error_to_gerror(herr, err, "HEIF 파일 읽기");
        return NULL;
    }

    struct heif_image_handle *handle = NULL;
    herr = heif_context_get_primary_image_handle(ctx, &handle);
    if (herr.code != heif_error_Ok) {
        heif_context_free(ctx);
        heif_error_to_gerror(herr, err, "기본 이미지 핸들");
        return NULL;
    }

    HeifHdrInfo hdr_info = query_hdr_info(handle, heif_path);

    struct heif_decoding_options *opts = heif_decoding_options_alloc();
    if (!opts) {
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        if (err)
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "decoding options 할당 실패");
        return NULL;
    }

    struct heif_image *img = NULL;
    GdkPixbuf        *pb   = NULL;

    if (hdr_info.is_hdr) {
        /* HDR: 16-bit 디코딩 후 수동 톤 매핑 */
        opts->convert_hdr_to_8bit = 0;
        herr = heif_decode_image(handle, &img,
                                 heif_colorspace_RGB,
                                 heif_chroma_interleaved_RRGGBB_LE,
                                 opts);
        if (herr.code == heif_error_Ok) {
            pb = pixbuf_from_hdr_rgb16(img, &hdr_info);
            heif_image_release(img);
            img = NULL;
        }
        /* 16-bit 실패 시 8-bit 폴백 (단순 비트 축소지만 최소한 표시는 됨) */
        if (!pb) {
            opts->convert_hdr_to_8bit = 1;
            herr = heif_decode_image(handle, &img,
                                     heif_colorspace_RGB,
                                     heif_chroma_interleaved_RGB,
                                     opts);
            if (herr.code == heif_error_Ok) {
                pb = pixbuf_from_sdr_rgb8(img);
                heif_image_release(img);
                img = NULL;
            }
        }
    } else {
        /* SDR: 8-bit 직접 디코딩 */
        opts->convert_hdr_to_8bit = 0;
        herr = heif_decode_image(handle, &img,
                                 heif_colorspace_RGB,
                                 heif_chroma_interleaved_RGB,
                                 opts);
        if (herr.code == heif_error_Ok) {
            pb = pixbuf_from_sdr_rgb8(img);
            heif_image_release(img);
            img = NULL;
        }
    }

    heif_decoding_options_free(opts);
    heif_image_handle_release(handle);
    heif_context_free(ctx);

    if (!pb && err && !*err)
        heif_error_to_gerror(herr, err, "HEIF 디코드");
    return pb;
}

#else

bool heif_native_is_available(void) { return false; }

GdkPixbuf *heif_native_load_pixbuf(const char *heif_path, GError **err) {
    (void)heif_path;
    if (err)
        *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                           "libheif 없음 — libheif-dev 설치 후 다시 빌드하세요.");
    return NULL;
}

#endif
