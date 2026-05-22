#include "app_icon.h"

#include <gdk-pixbuf/gdk-pixbuf.h>

#if defined(__APPLE__)
#include <limits.h>
#include <mach-o/dyld.h>
#endif

#ifndef APP_ICON_FILE
#define APP_ICON_FILE "daemon_hammer.ico"
#endif

static char *executable_dir(void) {
#if defined(__linux__)
    char *exe = g_file_read_link("/proc/self/exe", NULL);
    if (!exe)
        return NULL;
    char *dir = g_path_get_dirname(exe);
    g_free(exe);
    return dir;
#elif defined(__APPLE__)
    char exe_buf[PATH_MAX];
    uint32_t size = sizeof(exe_buf);
    if (_NSGetExecutablePath(exe_buf, &size) != 0)
        return NULL;
    char *resolved = g_canonicalize_filename(exe_buf, NULL);
    if (!resolved)
        return g_strdup(".");
    char *dir = g_path_get_dirname(resolved);
    g_free(resolved);
    return dir;
#else
    return NULL;
#endif
}

static char *resolve_icon_path(void) {
    const char *name = APP_ICON_FILE;

    char *dir = executable_dir();
    if (dir) {
        char *beside = g_build_filename(dir, name, NULL);
        if (g_file_test(beside, G_FILE_TEST_IS_REGULAR)) {
            g_free(dir);
            return beside;
        }
        g_free(beside);

        char *shared = g_build_filename(dir, "..", "share", "commandcenter", name, NULL);
        g_free(dir);
        if (g_file_test(shared, G_FILE_TEST_IS_REGULAR))
            return shared;
        g_free(shared);
    }

    if (g_path_is_absolute(name) && g_file_test(name, G_FILE_TEST_IS_REGULAR))
        return g_strdup(name);

    if (g_file_test(name, G_FILE_TEST_IS_REGULAR))
        return g_canonicalize_filename(name, NULL);

    char *cwd = g_build_filename(g_get_current_dir(), name, NULL);
    if (g_file_test(cwd, G_FILE_TEST_IS_REGULAR))
        return cwd;
    g_free(cwd);

    return NULL;
}

static void set_icon_list(GdkPixbuf *base) {
    static const int sizes[] = { 16, 24, 32, 48, 64, 128, 256 };
    GList *list = NULL;

    for (guint i = 0; i < G_N_ELEMENTS(sizes); i++) {
        int s = sizes[i];
        GdkPixbuf *scaled = gdk_pixbuf_scale_simple(
            base, s, s, GDK_INTERP_BILINEAR);
        if (scaled)
            list = g_list_prepend(list, scaled);
    }

    if (list) {
        gtk_window_set_default_icon_list(list);
        g_list_free_full(list, g_object_unref);
    } else {
        gtk_window_set_default_icon(base);
    }
}

GdkPixbuf *app_icon_load_pixbuf(int max_size) {
    char *icon_path = resolve_icon_path();
    if (!icon_path)
        return NULL;

    GError *err = NULL;
    GdkPixbuf *icon = gdk_pixbuf_new_from_file(icon_path, &err);
    g_free(icon_path);
    if (!icon) {
        if (err)
            g_error_free(err);
        return NULL;
    }

    int w = gdk_pixbuf_get_width(icon);
    int h = gdk_pixbuf_get_height(icon);
    if (max_size > 0 && (w > max_size || h > max_size)) {
        GdkPixbuf *scaled = gdk_pixbuf_scale_simple(
            icon, max_size, max_size, GDK_INTERP_BILINEAR);
        g_object_unref(icon);
        return scaled;
    }
    return icon;
}

void app_icon_apply(GtkWindow *window) {
    GdkPixbuf *icon = app_icon_load_pixbuf(256);
    if (!icon) {
        g_warning("앱 아이콘을 찾을 수 없습니다: %s", APP_ICON_FILE);
        return;
    }

    set_icon_list(icon);
    if (window)
        gtk_window_set_icon(window, icon);

    g_object_unref(icon);
}
