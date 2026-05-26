#include "app_icon.h"

#include <gdk-pixbuf/gdk-pixbuf.h>

#ifndef APP_ICON_FILE
#define APP_ICON_FILE "daemon_hammer.ico"
#endif

static char *executable_dir(void)
{
    char *exe = g_file_read_link("/proc/self/exe", NULL);
    if (!exe)
        return NULL;
    char *dir = g_path_get_dirname(exe);
    g_free(exe);
    return dir;
}

static char *resolve_icon_path(void)
{
    const char *name = APP_ICON_FILE;
    GPtrArray *paths = g_ptr_array_new_with_free_func(g_free);

    char *dir = executable_dir();
    if (dir) {
        g_ptr_array_add(paths, g_build_filename(dir, name, NULL));
        g_ptr_array_add(paths, g_build_filename(dir, "..", name, NULL));
        g_ptr_array_add(paths, g_build_filename(dir, "..", "..", name, NULL));
        g_free(dir);
    }

    g_ptr_array_add(paths, g_build_filename(g_get_current_dir(), name, NULL));
    g_ptr_array_add(paths, g_strdup(name));

    char *icon = NULL;
    for (guint i = 0; i < paths->len && !icon; i++) {
        const char *p = g_ptr_array_index(paths, i);
        if (p && g_file_test(p, G_FILE_TEST_IS_REGULAR))
            icon = g_strdup(p);
    }

    g_ptr_array_free(paths, TRUE);
    return icon;
}

static void set_icon_list(GdkPixbuf *base)
{
    static const int sizes[] = { 16, 24, 32, 48, 64, 128, 256 };
    GList *list = NULL;

    for (guint i = 0; i < G_N_ELEMENTS(sizes); i++) {
        GdkPixbuf *scaled =
            gdk_pixbuf_scale_simple(base, sizes[i], sizes[i], GDK_INTERP_BILINEAR);
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

GdkPixbuf *app_icon_load_pixbuf(int max_size)
{
    char *icon_path = resolve_icon_path();
    if (!icon_path)
        return NULL;

    GError *err = NULL;
    GdkPixbuf *icon = gdk_pixbuf_new_from_file(icon_path, &err);
    g_free(icon_path);
    if (!icon) {
        g_clear_error(&err);
        return NULL;
    }

    int w = gdk_pixbuf_get_width(icon);
    int h = gdk_pixbuf_get_height(icon);
    if (max_size > 0 && (w > max_size || h > max_size)) {
        GdkPixbuf *scaled =
            gdk_pixbuf_scale_simple(icon, max_size, max_size, GDK_INTERP_BILINEAR);
        g_object_unref(icon);
        return scaled;
    }
    return icon;
}

void app_icon_apply(GtkWindow *window)
{
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
