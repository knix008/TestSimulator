#include "assets.h"

#include "utils.h"

#include <glib.h>
#include <string.h>

#ifndef ASSETS_DIR
#define ASSETS_DIR "assets"
#endif

static char *g_icons_dir;

const char *assets_icons_dir(void) {
    if (g_icons_dir) {
        return g_icons_dir;
    }

    const char *candidates[] = {
        ASSETS_DIR "/icons",
        "assets/icons",
        NULL,
    };

    for (int i = 0; candidates[i]; i++) {
        if (g_file_test(candidates[i], G_FILE_TEST_IS_DIR)) {
            g_icons_dir = g_strdup(candidates[i]);
            return g_icons_dir;
        }
    }

    g_icons_dir = g_strdup(ASSETS_DIR "/icons");
    return g_icons_dir;
}

static char *assets_resolve_path(const char *filename, int size) {
    const char *dir = assets_icons_dir();
    if (size > 24) {
        gchar *dot = g_strrstr(filename, ".png");
        if (dot) {
            gchar *stem = g_strndup(filename, (gsize)(dot - filename));
            char *big = g_strdup_printf("%s-128.png", stem);
            char *path = g_build_filename(dir, big, NULL);
            g_free(stem);
            g_free(big);
            if (g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
                return path;
            }
            g_free(path);
        }
    }
    return g_build_filename(dir, filename, NULL);
}

GdkPixbuf *assets_load_icon(const char *filename, int size) {
    if (!filename || !*filename) {
        return NULL;
    }

    char *path = assets_resolve_path(filename, size);
    if (!g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
        g_free(path);
        return NULL;
    }

    GdkPixbuf *pb = gdk_pixbuf_new_from_file(path, NULL);
    g_free(path);
    if (!pb || size < 1) {
        return pb;
    }

    int w = gdk_pixbuf_get_width(pb);
    int h = gdk_pixbuf_get_height(pb);
    if (w == size && h == size) {
        return pb;
    }

    GdkPixbuf *scaled =
        gdk_pixbuf_scale_simple(pb, size, size, GDK_INTERP_BILINEAR);
    g_object_unref(pb);
    return scaled;
}

const char *assets_icon_file_for_path(const char *path) {
    if (!path) {
        return "file-image.png";
    }
    if (utils_is_hif_path(path)) {
        return "file-heif.png";
    }
    const char *ext = strrchr(path, '.');
    if (!ext) {
        return "file-image.png";
    }
    if (utils_is_video_ext(ext)) {
        return "file-video.png";
    }
    if (g_ascii_strcasecmp(ext, ".png") == 0) {
        return "file-png.png";
    }
    if (g_ascii_strcasecmp(ext, ".jpg") == 0 || g_ascii_strcasecmp(ext, ".jpeg") == 0) {
        return "file-jpg.png";
    }
    if (g_ascii_strcasecmp(ext, ".gif") == 0) {
        return "file-gif.png";
    }
    if (g_ascii_strcasecmp(ext, ".bmp") == 0) {
        return "file-bmp.png";
    }
    if (g_ascii_strcasecmp(ext, ".tif") == 0 || g_ascii_strcasecmp(ext, ".tiff") == 0) {
        return "file-tiff.png";
    }
    if (g_ascii_strcasecmp(ext, ".ico") == 0) {
        return "file-ico.png";
    }
    if (g_ascii_strcasecmp(ext, ".webp") == 0) {
        return "file-webp.png";
    }
    if (g_ascii_strcasecmp(ext, ".heif") == 0 || g_ascii_strcasecmp(ext, ".heic") == 0) {
        return "file-heif.png";
    }
    if (g_ascii_strcasecmp(ext, ".avif") == 0) {
        return "file-avif.png";
    }
    return "file-image.png";
}

GdkPixbuf *assets_load_icon_for_path(const char *path, int size) {
    return assets_load_icon(assets_icon_file_for_path(path), size);
}

GdkPixbuf *assets_load_folder_icon(gboolean open, int size) {
    return assets_load_icon(open ? "folder-open.png" : "folder-closed.png", size);
}
