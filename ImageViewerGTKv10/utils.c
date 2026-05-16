#include "utils.h"

#include <glib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static bool ext_in_set(const char *ext, const char *const *list) {
    if (!ext || !*ext) {
        return false;
    }
    for (const char *const *p = list; *p; p++) {
        if (g_ascii_strcasecmp(ext, *p) == 0) {
            return true;
        }
    }
    return false;
}

static const char *const k_image_exts[] = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".ico", ".webp",
    ".heif", ".heic", ".hif", ".avif",
    NULL};

static const char *const k_video_exts[] = {
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".m4v",
    ".mpeg", ".mpg", ".ts", ".m2ts", ".flv", NULL};

bool utils_is_image_ext(const char *ext) {
    return ext_in_set(ext, k_image_exts);
}

bool utils_is_video_ext(const char *ext) {
    return ext_in_set(ext, k_video_exts);
}

bool utils_is_previewable_ext(const char *ext) {
    return utils_is_image_ext(ext) || utils_is_video_ext(ext);
}

char *utils_format_file_size(int64_t bytes) {
    double v = (double)bytes;
    const char *units[] = {"B", "KB", "MB", "GB", "TB"};
    int u = 0;
    while (v >= 1024.0 && u < 4) {
        v /= 1024.0;
        u++;
    }
    char *out = g_malloc(32);
    g_snprintf(out, 32, "%.2f %s", v, units[u]);
    return out;
}

char *utils_format_mtime(time_t t) {
    char *out = g_malloc(32);
    struct tm tm;
    localtime_r(&t, &tm);
    strftime(out, 32, "%Y-%m-%d %H:%M", &tm);
    return out;
}

int utils_gcd(int a, int b) {
    a = abs(a);
    b = abs(b);
    while (b != 0) {
        int t = b;
        b = a % b;
        a = t;
    }
    return a == 0 ? 1 : a;
}

char *utils_get_default_pictures_dir(void) {
    const char *pictures = g_get_user_special_dir(G_USER_DIRECTORY_PICTURES);
    if (pictures && g_file_test(pictures, G_FILE_TEST_IS_DIR)) {
        return g_strdup(pictures);
    }
    return g_strdup(g_get_home_dir());
}

char *utils_path_join(const char *a, const char *b) {
    return g_build_filename(a, b, NULL);
}

char *utils_dup(const char *s) {
    return s ? g_strdup(s) : NULL;
}

void utils_free(void *p) {
    g_free(p);
}

bool utils_dir_has_subdirs(const char *path) {
    GDir *dir = g_dir_open(path, 0, NULL);
    if (!dir) {
        return false;
    }
    const gchar *name;
    bool found = false;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) {
            continue;
        }
        char *child = g_build_filename(path, name, NULL);
        if (g_file_test(child, G_FILE_TEST_IS_DIR)) {
            found = true;
            g_free(child);
            break;
        }
        g_free(child);
    }
    g_dir_close(dir);
    return found;
}

char *utils_basename_dup(const char *path) {
    return g_path_get_basename(path);
}
