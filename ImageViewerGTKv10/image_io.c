#include "image_io.h"

#include <glib.h>
#include <glib/gstdio.h>
#include <glib/gspawn.h>
#include <stdio.h>
#include <string.h>

#define JPEG_QUALITY "100"

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

static bool try_heif_convert_to_jpeg(const char *heif_path, const char *jpg_path) {
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
    GError *spawn_err = NULL;
    int status = 0;
    gboolean ok = g_spawn_sync(NULL, argv, NULL,
                               G_SPAWN_SEARCH_PATH | G_SPAWN_STDOUT_TO_DEV_NULL |
                                   G_SPAWN_STDERR_TO_DEV_NULL,
                               NULL, NULL, NULL, NULL, &status, &spawn_err);
    g_free(heif_convert);

    if (!ok || spawn_err) {
        g_clear_error(&spawn_err);
        return false;
    }
    if (!g_spawn_check_wait_status(status, NULL)) {
        return false;
    }
    return g_file_test(jpg_path, G_FILE_TEST_EXISTS);
}

static void image_io_copy_icc_option(GdkPixbuf *src, GdkPixbuf *dst) {
    const char *icc = gdk_pixbuf_get_option(src, "icc-profile");
    if (icc) {
        gdk_pixbuf_set_option(dst, "icc-profile", icc);
    }
}

/* JPEG는 알파를 지원하지 않음 — 흰 배경에 합성해 색이 탁해지는 것을 방지. */
static GdkPixbuf *image_io_flatten_alpha(GdkPixbuf *src) {
    if (!gdk_pixbuf_get_has_alpha(src)) {
        return g_object_ref(src);
    }

    int w = gdk_pixbuf_get_width(src);
    int h = gdk_pixbuf_get_height(src);
    GdkPixbuf *dst = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, w, h);
    if (!dst) {
        return NULL;
    }
    gdk_pixbuf_fill(dst, 0xffffffff);
    gdk_pixbuf_composite(src, dst, 0, 0, w, h, 0, 0, 1.0, 1.0, GDK_INTERP_HYPER, 255);
    image_io_copy_icc_option(src, dst);
    return dst;
}

char *image_io_heif_jpg_path(const char *path) {
    char *jpg_path = path_with_ext(path, ".jpg");
    if (g_file_test(jpg_path, G_FILE_TEST_EXISTS)) {
        return jpg_path;
    }

    if (try_heif_convert_to_jpeg(path, jpg_path)) {
        return jpg_path;
    }

    GError *err = NULL;
    GdkPixbuf *pb = gdk_pixbuf_new_from_file(path, &err);
    if (!pb) {
        g_free(jpg_path);
        g_clear_error(&err);
        return NULL;
    }

    gdk_pixbuf_apply_embedded_orientation(pb);

    if (!image_io_save_jpeg(pb, jpg_path, &err)) {
        g_object_unref(pb);
        g_free(jpg_path);
        if (g_file_test(jpg_path, G_FILE_TEST_EXISTS)) {
            g_unlink(jpg_path);
        }
        g_clear_error(&err);
        return NULL;
    }
    g_object_unref(pb);
    return jpg_path;
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
    /* 썸네일 등: HEIF도 메모리에서만 디코딩. JPG 파일은 만들지 않음. */
    if (utils_is_heif_path(path)) {
        char *jpg = image_io_heif_existing_jpg_path(path);
        if (jpg) {
            GdkPixbuf *pb = gdk_pixbuf_new_from_file(jpg, err);
            g_free(jpg);
            return pb;
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
