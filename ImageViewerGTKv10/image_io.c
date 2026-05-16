#include "image_io.h"
#include "heif_native.h"

#include <glib.h>
#include <glib/gstdio.h>
#include <glib/gspawn.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#define JPEG_QUALITY "100"

/* 10-bit PQ/HDR → 8-bit SDR JPEG (heif-convert 단독은 PQ 톤매핑 없음 — libheif #1183) */
static const char *const FFMPEG_TONEMAP_VFS[] = {
    "zscale=transfer=linear:npl=250,format=gbrpf32le,"
    "tonemap=tonemap=mobius:desat=0,"
    "zscale=transfer=bt709:matrix=bt709:primaries=bt709:range=tv,format=yuvj420p",
    "zscale=transfer=linear:npl=100,format=gbrpf32le,"
    "zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=tv,"
    "tonemap=tonemap=hable:desat=0,"
    "zscale=transfer=bt709:matrix=bt709:primaries=bt709:range=tv,format=yuvj420p",
    "zscale=transfer=linear,format=gbrpf32le,"
    "tonemap=tonemap=reinhard:desat=0,"
    "zscale=transfer=bt709:matrix=bt709:primaries=bt709:range=tv,format=yuvj420p",
    "tonemap=tonemap=hable:desat=0,format=yuvj420p",
    NULL,
};

/* ffmpeg colorspace: BT.2020/PQ 입력 → BT.709 출력 */
#define FFMPEG_COLORSPACE_VF \
    "colorspace=all=bt709:iall=bt2020:itrc=smpte2084:iprimaries=bt2020:irange=tv:" \
    "fast=0,format=yuvj420p"

#define FFMPEG_ZSCALE_AUTO_VF \
    "zscale=transfer=linear:tonemap=tonemap=hable:desat=0," \
    "zscale=transfer=bt709:matrix=bt709:primaries=bt709:range=tv,format=yuvj420p"

#define TARGET_SDR_LUMA 0.45

static gboolean spawn_quiet(char **argv) {
    GError *spawn_err = NULL;
    int status = 0;
    gboolean ok = g_spawn_sync(NULL, argv, NULL,
                               G_SPAWN_SEARCH_PATH | G_SPAWN_STDOUT_TO_DEV_NULL |
                                   G_SPAWN_STDERR_TO_DEV_NULL,
                               NULL, NULL, NULL, NULL, &status, &spawn_err);
    if (!ok || spawn_err) {
        g_clear_error(&spawn_err);
        return FALSE;
    }
    return g_spawn_check_wait_status(status, NULL);
}

static char *spawn_capture_stdout(char **argv) {
    GError *spawn_err = NULL;
    gchar *stdout_buf = NULL;
    int status = 0;
    gboolean ok = g_spawn_sync(NULL, argv, NULL,
                               G_SPAWN_SEARCH_PATH | G_SPAWN_STDERR_TO_DEV_NULL,
                               NULL, NULL, &stdout_buf, NULL, &status, &spawn_err);
    if (!ok || spawn_err || !g_spawn_check_wait_status(status, NULL) || !stdout_buf) {
        g_clear_error(&spawn_err);
        g_free(stdout_buf);
        return NULL;
    }
    return stdout_buf;
}

static gboolean output_jpg_ok(const char *jpg_path) {
    return jpg_path && g_file_test(jpg_path, G_FILE_TEST_IS_REGULAR);
}

/* ImageMagick %[mean] Q16: PQ 미처리(과밝) / 톤매핑 과다(과어두) 결과 걸러냄 */
#define IM_OVERBRIGHT_MEAN 45000.0
#define IM_UNDERDARK_MEAN 6000.0
#define GDK_OVERBRIGHT_LUMA 0.75
#define GDK_UNDERDARK_LUMA 0.06
static double image_io_pixbuf_sample_luma_mean(GdkPixbuf *pb) {
    if (!pb || gdk_pixbuf_get_colorspace(pb) != GDK_COLORSPACE_RGB) {
        return 0.0;
    }
    int w = gdk_pixbuf_get_width(pb);
    int h = gdk_pixbuf_get_height(pb);
    int nc = gdk_pixbuf_get_n_channels(pb);
    if (w < 1 || h < 1 || nc < 3) {
        return 0.0;
    }

    guchar *px = gdk_pixbuf_get_pixels(pb);
    int rs = gdk_pixbuf_get_rowstride(pb);
    double sum = 0.0;
    int samples = 0;

    for (int sy = 0; sy < 12; sy++) {
        int y = (h == 1) ? 0 : (h - 1) * sy / 11;
        for (int sx = 0; sx < 12; sx++) {
            int x = (w == 1) ? 0 : (w - 1) * sx / 11;
            guchar *p = px + y * rs + x * nc;
            sum += 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
            samples++;
        }
    }
    return samples > 0 ? sum / (samples * 255.0) : 0.0;
}

static double image_io_im_jpg_mean(const char *jpg_path) {
    static const char *const cmds[] = {"magick", "convert", NULL};
    for (int i = 0; cmds[i]; i++) {
        char *prog = g_find_program_in_path(cmds[i]);
        if (!prog) {
            continue;
        }
        char *argv[] = {
            prog,
            (char *)"-format",
            (char *)"%[mean]",
            (char *)jpg_path,
            NULL,
        };
        char *out = spawn_capture_stdout(argv);
        g_free(prog);
        if (out) {
            double im_mean = g_ascii_strtod(out, NULL);
            g_free(out);
            return im_mean;
        }
    }
    return -1.0;
}

static double image_io_gdk_jpg_luma_mean(const char *jpg_path) {
    GdkPixbuf *pb =
        gdk_pixbuf_new_from_file_at_scale(jpg_path, 256, 256, TRUE, NULL);
    if (!pb) {
        return -1.0;
    }
    double mean = image_io_pixbuf_sample_luma_mean(pb);
    g_object_unref(pb);
    return mean;
}

static gboolean image_io_jpg_is_overbright(const char *jpg_path) {
    double im_mean = image_io_im_jpg_mean(jpg_path);
    if (im_mean >= 0.0) {
        return im_mean > IM_OVERBRIGHT_MEAN;
    }
    double luma = image_io_gdk_jpg_luma_mean(jpg_path);
    return luma >= 0.0 && luma > GDK_OVERBRIGHT_LUMA;
}

static gboolean image_io_jpg_is_underdark(const char *jpg_path) {
    double im_mean = image_io_im_jpg_mean(jpg_path);
    if (im_mean >= 0.0) {
        return im_mean < IM_UNDERDARK_MEAN;
    }
    double luma = image_io_gdk_jpg_luma_mean(jpg_path);
    return luma >= 0.0 && luma < GDK_UNDERDARK_LUMA;
}

static gboolean image_io_jpg_looks_sdr_valid(const char *jpg_path) {
    if (!output_jpg_ok(jpg_path)) {
        return FALSE;
    }
    if (image_io_jpg_is_overbright(jpg_path) || image_io_jpg_is_underdark(jpg_path)) {
        return FALSE;
    }
    return TRUE;
}

/* 후보 선택용: 극단만 제외 */
static gboolean image_io_jpg_is_plausible(const char *jpg_path) {
    if (!output_jpg_ok(jpg_path)) {
        return FALSE;
    }
    double im_mean = image_io_im_jpg_mean(jpg_path);
    if (im_mean >= 0.0) {
        return im_mean > 3000.0 && im_mean < 52000.0;
    }
    double luma = image_io_gdk_jpg_luma_mean(jpg_path);
    return luma >= 0.05 && luma <= 0.90;
}

static double image_io_jpg_brightness_score(const char *jpg_path) {
    double im_mean = image_io_im_jpg_mean(jpg_path);
    if (im_mean >= 0.0) {
        return fabs(im_mean / 65535.0 - TARGET_SDR_LUMA);
    }
    double luma = image_io_gdk_jpg_luma_mean(jpg_path);
    if (luma >= 0.0) {
        return fabs(luma - TARGET_SDR_LUMA);
    }
    return 1e9;
}

static char *image_io_temp_jpg_path(void) {
    GError *err = NULL;
    char *path = NULL;
    int fd = g_file_open_tmp("iv-heif-cand-XXXXXX.jpg", &path, &err);
    if (fd < 0 || !path) {
        g_clear_error(&err);
        g_free(path);
        return NULL;
    }
    close(fd);
    g_unlink(path);
    return path;
}

static void remove_output_jpg(const char *jpg_path) {
    if (jpg_path && g_file_test(jpg_path, G_FILE_TEST_EXISTS)) {
        g_unlink(jpg_path);
    }
}

bool utils_is_heif_path(const char *path) {
    if (!path) {
        return false;
    }
    const char *ext = strrchr(path, '.');
    if (!ext) {
        return false;
    }
    return g_ascii_strcasecmp(ext, ".heif") == 0 ||
           g_ascii_strcasecmp(ext, ".heic") == 0 ||
           g_ascii_strcasecmp(ext, ".hif") == 0;
}

static char *path_with_ext(const char *path, const char *new_ext) {
    char *dir = g_path_get_dirname(path);
    char *base = g_path_get_basename(path);
    char *dot = strrchr(base, '.');
    if (dot) {
        *dot = '\0';
    }
    char *out = g_strdup_printf("%s%c%s%s", dir, G_DIR_SEPARATOR, base, new_ext);
    g_free(dir);
    g_free(base);
    return out;
}

char *image_io_heif_existing_jpg_path(const char *path) {
    if (!utils_is_heif_path(path)) {
        return NULL;
    }
    char *jpg_path = path_with_ext(path, ".jpg");
    if (g_file_test(jpg_path, G_FILE_TEST_EXISTS)) {
        return jpg_path;
    }
    g_free(jpg_path);
    return NULL;
}

static const char *find_srgb_icc_path(void) {
    static const char *const candidates[] = {
        "/usr/share/color/icc/colord/sRGB.icc",
        "/usr/share/color/icc/sRGB.icc",
        "/usr/local/share/color/icc/sRGB.icc",
        "/opt/homebrew/share/color/icc/sRGB.icc",
        NULL,
    };
    static const char *cached;
    static gboolean looked;

    if (looked) {
        return cached;
    }
    looked = TRUE;
    for (int i = 0; candidates[i]; i++) {
        if (g_file_test(candidates[i], G_FILE_TEST_IS_REGULAR)) {
            cached = candidates[i];
            return cached;
        }
    }
    return NULL;
}

static bool try_ffmpeg_heif_to_jpeg_vf(const char *heif_path, const char *jpg_path,
                                       const char *vf) {
    char *ffmpeg = g_find_program_in_path("ffmpeg");
    if (!ffmpeg || !vf) {
        g_free(ffmpeg);
        return false;
    }

    char *argv[] = {
        ffmpeg,
        (char *)"-y",
        (char *)"-hide_banner",
        (char *)"-loglevel",
        (char *)"error",
        (char *)"-i",
        (char *)heif_path,
        (char *)"-vf",
        (char *)vf,
        (char *)"-frames:v",
        (char *)"1",
        (char *)"-q:v",
        (char *)"1",
        (char *)jpg_path,
        NULL,
    };
    gboolean ok = spawn_quiet(argv);
    g_free(ffmpeg);
    if (ok && output_jpg_ok(jpg_path)) {
        return true;
    }
    remove_output_jpg(jpg_path);
    return false;
}

static bool try_ffmpeg_colorspace_jpeg(const char *heif_path, const char *jpg_path) {
    return try_ffmpeg_heif_to_jpeg_vf(heif_path, jpg_path, FFMPEG_COLORSPACE_VF) ||
           try_ffmpeg_heif_to_jpeg_vf(heif_path, jpg_path, FFMPEG_ZSCALE_AUTO_VF);
}

/* HDR/PQ: zscale+tonemap 으로 10-bit → 8-bit SDR JPEG */
static bool try_ffmpeg_heif_to_jpeg(const char *heif_path, const char *jpg_path) {
    for (int i = 0; FFMPEG_TONEMAP_VFS[i]; i++) {
        if (try_ffmpeg_heif_to_jpeg_vf(heif_path, jpg_path, FFMPEG_TONEMAP_VFS[i])) {
            return true;
        }
    }
    return false;
}

static bool try_imagemagick_argv(const char *prog, char **argv, const char *jpg_path) {
    (void)prog;
    gboolean ok = spawn_quiet(argv);
    if (ok && output_jpg_ok(jpg_path)) {
        return true;
    }
    remove_output_jpg(jpg_path);
    return false;
}

/* PQ/HDR → sRGB: 반드시 -colorspace RGB 후 출력 sRGB ICC (프로필만으로는 과다 노출) */
static bool try_imagemagick_srgb_jpeg(const char *input_path, const char *jpg_path) {
    static const char *const cmds[] = {"magick", "convert", NULL};
    const char *icc = find_srgb_icc_path();
    if (!icc) {
        return false;
    }

    for (int i = 0; cmds[i]; i++) {
        char *prog = g_find_program_in_path(cmds[i]);
        if (!prog) {
            continue;
        }

        char *argv[] = {
            prog,
            (char *)input_path,
            (char *)"-auto-orient",
            (char *)"-colorspace",
            (char *)"RGB",
            (char *)"-profile",
            (char *)icc,
            (char *)"-intent",
            (char *)"Relative",
            (char *)"-black-point-compensation",
            (char *)"-define",
            (char *)"jpeg:sampling-factor=4:4:4",
            (char *)"-quality",
            (char *)"100",
            (char *)jpg_path,
            NULL,
        };
        gboolean ok = try_imagemagick_argv(prog, argv, jpg_path);
        g_free(prog);
        if (ok && image_io_jpg_looks_sdr_valid(jpg_path)) {
            return true;
        }
        remove_output_jpg(jpg_path);
    }
    return false;
}

static bool try_imagemagick_heif_to_jpeg(const char *heif_path, const char *jpg_path) {
    return try_imagemagick_srgb_jpeg(heif_path, jpg_path);
}

/* ImageMagick 6 + libheif: 단순 sRGB 출력 (ICC 강제 없음) */
static bool try_imagemagick_direct_jpeg(const char *input_path, const char *jpg_path) {
    static const char *const cmds[] = {"magick", "convert", NULL};
    for (int i = 0; cmds[i]; i++) {
        char *prog = g_find_program_in_path(cmds[i]);
        if (!prog) {
            continue;
        }
        char *argv[] = {
            prog,
            (char *)input_path,
            (char *)"-auto-orient",
            (char *)"-strip",
            (char *)"-quality",
            (char *)"100",
            (char *)jpg_path,
            NULL,
        };
        gboolean ok = try_imagemagick_argv(prog, argv, jpg_path);
        g_free(prog);
        if (ok) {
            return true;
        }
    }
    return false;
}

static bool try_imagemagick_gamma_jpeg(const char *input_path, const char *jpg_path) {
    static const char *const cmds[] = {"magick", "convert", NULL};
    for (int i = 0; cmds[i]; i++) {
        char *prog = g_find_program_in_path(cmds[i]);
        if (!prog) {
            continue;
        }
        char *argv[] = {
            prog,
            (char *)input_path,
            (char *)"-auto-orient",
            (char *)"-gamma",
            (char *)"0.4545",
            (char *)"-strip",
            (char *)"-quality",
            (char *)"100",
            (char *)jpg_path,
            NULL,
        };
        gboolean ok = try_imagemagick_argv(prog, argv, jpg_path);
        g_free(prog);
        if (ok) {
            return true;
        }
    }
    return false;
}

/* SDR HEIF 전용: heif-convert → JPEG (HDR 은 PQ 값이 그대로 들어가 밝기가 깨짐) */
static bool try_heif_convert_direct_sdr(const char *heif_path, const char *jpg_path) {
    char *heif_convert = g_find_program_in_path("heif-convert");
    if (!heif_convert) {
        return false;
    }
    char *argv[] = {
        heif_convert,
        (char *)"-q",
        (char *)"100",
        (char *)heif_path,
        (char *)jpg_path,
        NULL,
    };
    gboolean ok = spawn_quiet(argv);
    g_free(heif_convert);
    if (!ok || !image_io_jpg_looks_sdr_valid(jpg_path)) {
        remove_output_jpg(jpg_path);
        return false;
    }
    return true;
}

static bool try_heif_convert_to_jpeg(const char *heif_path, const char *jpg_path) {
    char *heif_convert = g_find_program_in_path("heif-convert");
    if (!heif_convert) {
        return false;
    }

    char *base = g_strdup("/tmp/iv-heif-jpg-XXXXXX");
    int fd = g_mkstemp(base);
    if (fd < 0) {
        g_free(heif_convert);
        g_free(base);
        return false;
    }
    close(fd);
    g_unlink(base);

    char *tmp_jpg = g_strdup_printf("%s.jpg", base);
    g_free(base);
    if (!tmp_jpg) {
        g_free(heif_convert);
        return false;
    }

    char *argv[] = {
        heif_convert,
        (char *)"-q",
        (char *)"100",
        (char *)heif_path,
        tmp_jpg,
        NULL,
    };
    gboolean ok = spawn_quiet(argv);
    g_free(heif_convert);
    if (!ok || !g_file_test(tmp_jpg, G_FILE_TEST_IS_REGULAR)) {
        g_unlink(tmp_jpg);
        g_free(tmp_jpg);
        return false;
    }

    ok = try_imagemagick_srgb_jpeg(tmp_jpg, jpg_path);
    g_unlink(tmp_jpg);
    g_free(tmp_jpg);
    return ok;
}

static void image_io_copy_icc_option(GdkPixbuf *src, GdkPixbuf *dst) {
    const char *icc = gdk_pixbuf_get_option(src, "icc-profile");
    if (icc) {
        gdk_pixbuf_set_option(dst, "icc-profile", icc);
    }
}

static gboolean image_io_pixbuf_needs_flatten(GdkPixbuf *src) {
    if (!gdk_pixbuf_get_has_alpha(src)) {
        return FALSE;
    }

    int w = gdk_pixbuf_get_width(src);
    int h = gdk_pixbuf_get_height(src);
    if (w < 1 || h < 1) {
        return FALSE;
    }

    guchar *px = gdk_pixbuf_get_pixels(src);
    int rs = gdk_pixbuf_get_rowstride(src);
    int nc = gdk_pixbuf_get_n_channels(src);
    int alpha_idx = nc - 1;

    for (int sy = 0; sy < 8; sy++) {
        int y = (h == 1) ? 0 : (h - 1) * sy / 7;
        for (int sx = 0; sx < 8; sx++) {
            int x = (w == 1) ? 0 : (w - 1) * sx / 7;
            if (px[y * rs + x * nc + alpha_idx] != 255) {
                return TRUE;
            }
        }
    }
    return FALSE;
}

/* JPEG는 알파 미지원 — 실제 투명 픽셀이 있을 때만 흰 배경 합성. */
static GdkPixbuf *image_io_flatten_alpha(GdkPixbuf *src) {
    if (!image_io_pixbuf_needs_flatten(src)) {
        return g_object_ref(src);
    }

    int w = gdk_pixbuf_get_width(src);
    int h = gdk_pixbuf_get_height(src);
    GdkPixbuf *dst = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, w, h);
    if (!dst) {
        return NULL;
    }
    gdk_pixbuf_fill(dst, 0x000000ff);
    gdk_pixbuf_composite(src, dst, 0, 0, w, h, 0, 0, 1.0, 1.0, GDK_INTERP_HYPER, 255);
    image_io_copy_icc_option(src, dst);
    return dst;
}

/* gdk-pixbuf HEIF 디코더가 PQ/HDR을 밝게 낼 때 보정 (ICC 없음·평균 휘도 과다) */
static GdkPixbuf *image_io_correct_overbright_pixbuf(GdkPixbuf *pb) {
    if (!pb || gdk_pixbuf_get_colorspace(pb) != GDK_COLORSPACE_RGB) {
        return pb;
    }
    if (gdk_pixbuf_get_option(pb, "icc-profile")) {
        return pb;
    }

    int w = gdk_pixbuf_get_width(pb);
    int h = gdk_pixbuf_get_height(pb);
    int nc = gdk_pixbuf_get_n_channels(pb);
    if (w < 1 || h < 1 || nc < 3) {
        return pb;
    }

    double mean = image_io_pixbuf_sample_luma_mean(pb);
    if (mean < 0.62) {
        return pb;
    }

    double gamma = (mean > 0.82) ? 2.2 : 1.65;
    GdkPixbuf *out = gdk_pixbuf_copy(pb);
    if (!out) {
        return pb;
    }

    guchar *opx = gdk_pixbuf_get_pixels(out);
    int ors = gdk_pixbuf_get_rowstride(out);
    for (int y = 0; y < h; y++) {
        guchar *row = opx + y * ors;
        for (int x = 0; x < w; x++) {
            guchar *p = row + x * nc;
            for (int c = 0; c < 3; c++) {
                double n = pow(p[c] / 255.0, gamma);
                p[c] = (guchar)CLAMP((int)(n * 255.0 + 0.5), 0, 255);
            }
        }
    }
    g_object_unref(pb);
    return out;
}

static char *heif_convert_temp_png(const char *heif_path) {
    char *heif_convert = g_find_program_in_path("heif-convert");
    if (!heif_convert) {
        return NULL;
    }

    char *base = g_strdup("/tmp/iv-heif-XXXXXX");
    int fd = g_mkstemp(base);
    if (fd < 0) {
        g_free(heif_convert);
        g_free(base);
        return NULL;
    }
    close(fd);
    g_unlink(base);

    char *png = g_strdup_printf("%s.png", base);
    g_free(base);
    if (!png) {
        g_free(heif_convert);
        return NULL;
    }

    char *argv[] = {
        heif_convert,
        (char *)"-q",
        (char *)"100",
        (char *)heif_path,
        png,
        NULL,
    };
    gboolean ok = spawn_quiet(argv);
    g_free(heif_convert);
    if (!ok || !g_file_test(png, G_FILE_TEST_IS_REGULAR)) {
        g_unlink(png);
        g_free(png);
        return NULL;
    }
    return png;
}

/* heif-convert(16-bit PNG) → ffmpeg 톤매핑 (ffmpeg 가 HIF 를 직접 못 읽을 때) */
static bool try_heif_png_ffmpeg_jpeg(const char *heif_path, const char *jpg_path) {
    char *png_tmp = heif_convert_temp_png(heif_path);
    if (!png_tmp) {
        return false;
    }
    bool ok = try_ffmpeg_heif_to_jpeg(png_tmp, jpg_path);
    g_unlink(png_tmp);
    g_free(png_tmp);
    return ok;
}

typedef bool (*image_io_heif_conv_fn)(const char *, const char *);

static bool image_io_heif_convert_best(const char *heif_path, const char *jpg_path) {
    static const image_io_heif_conv_fn convs[] = {
        try_ffmpeg_colorspace_jpeg,
        try_ffmpeg_heif_to_jpeg,
        try_imagemagick_direct_jpeg,
        try_imagemagick_gamma_jpeg,
        try_imagemagick_heif_to_jpeg,
        try_heif_convert_direct_sdr,
        try_heif_convert_to_jpeg,
        try_heif_png_ffmpeg_jpeg,
    };

    char *best_tmp = NULL;
    double best_score = 1e9;

    for (guint i = 0; i < G_N_ELEMENTS(convs); i++) {
        char *tmp = image_io_temp_jpg_path();
        if (!tmp) {
            continue;
        }
        if (!convs[i](heif_path, tmp) || !image_io_jpg_is_plausible(tmp)) {
            remove_output_jpg(tmp);
            g_free(tmp);
            continue;
        }
        double score = image_io_jpg_brightness_score(tmp);
        if (score < best_score) {
            if (best_tmp) {
                remove_output_jpg(best_tmp);
                g_free(best_tmp);
            }
            best_tmp = tmp;
            best_score = score;
        } else {
            remove_output_jpg(tmp);
            g_free(tmp);
        }
    }

    if (!best_tmp) {
        return false;
    }

    gboolean ok = FALSE;
    GError *err = NULL;
    if (g_file_test(jpg_path, G_FILE_TEST_EXISTS)) {
        g_unlink(jpg_path);
    }
    if (g_rename(best_tmp, jpg_path) == 0) {
        ok = TRUE;
    } else {
        GFile *src = g_file_new_for_path(best_tmp);
        GFile *dst = g_file_new_for_path(jpg_path);
        if (g_file_copy(src, dst, G_FILE_COPY_OVERWRITE, NULL, NULL, NULL, &err)) {
            ok = TRUE;
        }
        g_clear_error(&err);
        g_object_unref(src);
        g_object_unref(dst);
    }
    remove_output_jpg(best_tmp);
    g_free(best_tmp);
    return ok && image_io_jpg_looks_sdr_valid(jpg_path);
}

static bool image_io_heif_to_jpeg_via_pixbuf(const char *heif_path, const char *jpg_path) {
    char *png_tmp = heif_convert_temp_png(heif_path);
    if (png_tmp && try_imagemagick_srgb_jpeg(png_tmp, jpg_path)) {
        g_unlink(png_tmp);
        g_free(png_tmp);
        return true;
    }
    if (png_tmp) {
        g_unlink(png_tmp);
        g_free(png_tmp);
    }

    GError *err = NULL;
    GdkPixbuf *pb = gdk_pixbuf_new_from_file(heif_path, &err);
    if (!pb) {
        g_clear_error(&err);
        return false;
    }

    gdk_pixbuf_apply_embedded_orientation(pb);
    GdkPixbuf *corrected = image_io_correct_overbright_pixbuf(pb);
    gboolean saved = image_io_save_jpeg(corrected, jpg_path, &err);
    g_object_unref(corrected);
    if (!saved) {
        g_clear_error(&err);
        remove_output_jpg(jpg_path);
        return false;
    }
    if (!image_io_jpg_looks_sdr_valid(jpg_path)) {
        remove_output_jpg(jpg_path);
        return false;
    }
    return true;
}

char *image_io_heif_jpg_path(const char *path) {
    if (!utils_is_heif_path(path)) {
        return NULL;
    }

    char *jpg_path = path_with_ext(path, ".jpg");
    if (g_file_test(jpg_path, G_FILE_TEST_EXISTS)) {
        if (image_io_jpg_looks_sdr_valid(jpg_path)) {
            return jpg_path;
        }
        g_unlink(jpg_path);
    }

    if (!g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(jpg_path);
        return NULL;
    }

    gboolean ok = FALSE;

    /* 1) libheif 직접 디코드 + PQ/HLG 톤매핑 (권장, libheif-dev 필요) */
    if (heif_native_is_available() &&
        heif_native_heif_to_jpeg(path, jpg_path) &&
        image_io_jpg_looks_sdr_valid(jpg_path)) {
        ok = TRUE;
    } else {
        remove_output_jpg(jpg_path);
        /* 2) 여러 외부 도구 결과 중 밝기가 가장 자연스러운 JPG 선택 */
        ok = image_io_heif_convert_best(path, jpg_path) ||
             image_io_heif_to_jpeg_via_pixbuf(path, jpg_path);
    }
    if (ok) {
        return jpg_path;
    }

    g_free(jpg_path);
    return NULL;
}

bool image_io_move_heif_to_subdir(const char *file_path) {
    char *dir = g_path_get_dirname(file_path);
    char *sub = g_build_filename(dir, "hif", NULL);
    g_free(dir);

    if (g_mkdir_with_parents(sub, 0755) != 0) {
        g_free(sub);
        return false;
    }

    char *dest = g_build_filename(sub, g_path_get_basename(file_path), NULL);
    g_free(sub);

    if (g_file_test(dest, G_FILE_TEST_EXISTS)) {
        g_unlink(dest);
    }
    if (g_rename(file_path, dest) != 0) {
        g_free(dest);
        return false;
    }
    g_free(dest);
    return true;
}

GdkPixbuf *image_io_load_pixbuf(const char *path, GError **err) {
    /* 썸네일·목록 미리보기: 디스크에 JPG를 만들지 않음.
     * HEIF는 기존 JPG가 있으면 그것을 쓰고, 없으면 원본을 메모리에서만 디코딩. */
    if (utils_is_heif_path(path)) {
        char *jpg = image_io_heif_existing_jpg_path(path);
        if (jpg) {
            GdkPixbuf *pb = gdk_pixbuf_new_from_file(jpg, err);
            g_free(jpg);
            return pb;
        }
        if (!g_file_test(path, G_FILE_TEST_EXISTS)) {
            if (err) {
                *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_NOENT,
                                   "HEIF 파일을 찾을 수 없습니다.");
            }
            return NULL;
        }
    }
    return gdk_pixbuf_new_from_file(path, err);
}

bool image_io_save_jpeg(GdkPixbuf *pixbuf, const char *path, GError **err) {
    GdkPixbuf *flattened = image_io_flatten_alpha(pixbuf);
    if (!flattened) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "JPEG용 이미지 준비 실패");
        }
        return false;
    }

    const char *icc = gdk_pixbuf_get_option(pixbuf, "icc-profile");
    if (!icc) {
        icc = gdk_pixbuf_get_option(flattened, "icc-profile");
    }

    gboolean ok;
    if (icc) {
        ok = gdk_pixbuf_save(flattened, path, "jpeg", err,
                             "quality", JPEG_QUALITY,
                             "icc-profile", icc,
                             NULL);
    } else {
        ok = gdk_pixbuf_save(flattened, path, "jpeg", err,
                             "quality", JPEG_QUALITY,
                             NULL);
    }

    if (flattened != pixbuf) {
        g_object_unref(flattened);
    }
    return ok;
}

static GdkPixbuf *transform_pixbuf(GdkPixbuf *src, ImageTransform op) {
    switch (op) {
    case IMAGE_TRANSFORM_ROTATE_CCW:
        return gdk_pixbuf_rotate_simple(src, GDK_PIXBUF_ROTATE_COUNTERCLOCKWISE);
    case IMAGE_TRANSFORM_ROTATE_CW:
        return gdk_pixbuf_rotate_simple(src, GDK_PIXBUF_ROTATE_CLOCKWISE);
    case IMAGE_TRANSFORM_FLIP_HORIZONTAL:
        return gdk_pixbuf_flip(src, TRUE);
    }
    return NULL;
}

GdkPixbuf *image_io_apply_transform_file(const char *edit_path,
                                         ImageTransform op,
                                         GError **err) {
    GdkPixbuf *src = gdk_pixbuf_new_from_file(edit_path, err);
    if (!src) {
        return NULL;
    }

    GdkPixbuf *dst = transform_pixbuf(src, op);
    if (dst) {
        image_io_copy_icc_option(src, dst);
    }
    g_object_unref(src);
    if (!dst) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "이미지 변환 실패");
        }
        return NULL;
    }

    char *tmp = g_strconcat(edit_path, ".tmp", NULL);
    if (!image_io_save_jpeg(dst, tmp, err)) {
        g_object_unref(dst);
        g_free(tmp);
        return NULL;
    }

    if (g_unlink(edit_path) != 0) {
        g_object_unref(dst);
        g_unlink(tmp);
        g_free(tmp);
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "기존 파일을 덮어쓸 수 없습니다.");
        }
        return NULL;
    }
    if (g_rename(tmp, edit_path) != 0) {
        g_object_unref(dst);
        g_free(tmp);
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "파일 저장 실패");
        }
        return NULL;
    }
    g_free(tmp);
    return dst;
}
