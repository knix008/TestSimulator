#include "image_io.h"
#include "heif_native.h"

#include <glib.h>
#include <glib/gstdio.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#define JPEG_QUALITY "100"
#define JPG_MIN_LUMA 0.07
#define JPG_MAX_LUMA 0.48

static gboolean output_jpg_ok(const char *jpg_path) {
    return jpg_path && g_file_test(jpg_path, G_FILE_TEST_IS_REGULAR);
}

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

static gboolean image_io_jpg_looks_sdr_valid(const char *jpg_path) {
    if (!output_jpg_ok(jpg_path)) {
        return FALSE;
    }
    GdkPixbuf *pb =
        gdk_pixbuf_new_from_file_at_scale(jpg_path, 256, 256, TRUE, NULL);
    if (!pb) {
        return FALSE;
    }
    double luma = image_io_pixbuf_sample_luma_mean(pb);
    g_object_unref(pb);
    return luma >= JPG_MIN_LUMA && luma <= JPG_MAX_LUMA;
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

static bool image_io_heif_to_jpeg_file(const char *heif_path, const char *jpg_path) {
    GError *err = NULL;
    GdkPixbuf *pb = heif_native_load_pixbuf(heif_path, &err);
    if (!pb) {
        g_clear_error(&err);
        return false;
    }

    gboolean saved = image_io_save_jpeg(pb, jpg_path, &err);
    g_object_unref(pb);
    g_clear_error(&err);
    if (!saved) {
        remove_output_jpg(jpg_path);
        return false;
    }
    return image_io_jpg_looks_sdr_valid(jpg_path);
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

    if (!heif_native_is_available()) {
        g_free(jpg_path);
        return NULL;
    }

    if (image_io_heif_to_jpeg_file(path, jpg_path)) {
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
        if (heif_native_is_available()) {
            return heif_native_load_pixbuf(path, err);
        }
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "libheif 없음 — libheif-dev 설치 후 다시 빌드하세요.");
        }
        return NULL;
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
