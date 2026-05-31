#include "gtk/gtk_app_icon.h"
#include "ocr/engine_paths.h"

#define APP_ICON_NAME "myocr.png"

static void append_icon_path(GPtrArray *paths, const char *path) {
    if (path && path[0])
        g_ptr_array_add(paths, g_strdup(path));
}

static char *resolve_icon_path(void) {
    GPtrArray *paths = g_ptr_array_new_with_free_func(g_free);

    char *app_dir = engine_paths_app_dir();
    append_icon_path(paths, g_build_filename(app_dir, APP_ICON_NAME, NULL));
    append_icon_path(paths, g_build_filename(app_dir, "assets", APP_ICON_NAME, NULL));
    append_icon_path(paths, g_build_filename(app_dir, "..", "assets", APP_ICON_NAME, NULL));
    append_icon_path(paths, g_build_filename(app_dir, "..", APP_ICON_NAME, NULL));
    g_free(app_dir);

    append_icon_path(paths, g_build_filename(g_get_current_dir(), APP_ICON_NAME, NULL));
    append_icon_path(paths, g_build_filename(g_get_current_dir(), "assets", APP_ICON_NAME, NULL));

    char *icon = NULL;
    for (guint i = 0; i < paths->len && !icon; i++) {
        const char *candidate = g_ptr_array_index(paths, i);
        if (g_file_test(candidate, G_FILE_TEST_IS_REGULAR))
            icon = g_strdup(candidate);
    }

    g_ptr_array_free(paths, TRUE);
    return icon;
}

static void set_icon_list(GdkPixbuf *base) {
    static const int sizes[] = {16, 24, 32, 48, 64, 128, 256};
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

void gtk_app_icon_apply(GtkWindow *window) {
    char *icon_path = resolve_icon_path();
    if (!icon_path) {
        g_warning("앱 아이콘을 찾을 수 없습니다: %s", APP_ICON_NAME);
        return;
    }

    GError *error = NULL;
    GdkPixbuf *icon = gdk_pixbuf_new_from_file(icon_path, &error);
    if (!icon) {
        g_warning("앱 아이콘 로드 실패 (%s): %s", icon_path,
                  error ? error->message : "unknown");
        g_clear_error(&error);
        g_free(icon_path);
        return;
    }

    set_icon_list(icon);
    if (window)
        gtk_window_set_icon(window, icon);

    g_object_unref(icon);
    g_free(icon_path);
}
