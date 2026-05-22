#include "bookmark_manager.h"

struct BookmarkManager {
    gchar *config_dir;
    gchar *file_path;
    GPtrArray *bookmarks;
};

static gchar *config_directory(void) {
    const char *xdg = g_getenv("XDG_CONFIG_HOME");
    if (xdg && *xdg)
        return g_build_filename(xdg, "CommandCenterGTKv10", NULL);
    return g_build_filename(g_get_home_dir(), ".config", "CommandCenterGTKv10", NULL);
}

BookmarkManager *bookmark_manager_new(void) {
    BookmarkManager *mgr = g_new0(BookmarkManager, 1);
    mgr->config_dir = config_directory();
    mgr->file_path = g_build_filename(mgr->config_dir, "bookmarks.json", NULL);
    g_mkdir_with_parents(mgr->config_dir, 0755);
    mgr->bookmarks = json_load_bookmarks(mgr->file_path);
    return mgr;
}

void bookmark_manager_free(BookmarkManager *mgr) {
    if (!mgr) return;
    g_ptr_array_free(mgr->bookmarks, TRUE);
    g_free(mgr->config_dir);
    g_free(mgr->file_path);
    g_free(mgr);
}

GPtrArray *bookmark_manager_get_all(BookmarkManager *mgr) {
    return mgr->bookmarks;
}

gboolean bookmark_manager_add(BookmarkManager *mgr, const char *path, const char *name) {
    for (guint i = 0; i < mgr->bookmarks->len; i++) {
        BookmarkEntry *b = g_ptr_array_index(mgr->bookmarks, i);
        if (g_ascii_strcasecmp(b->path, path) == 0) return FALSE;
    }
    BookmarkEntry *entry = g_new0(BookmarkEntry, 1);
    entry->path = g_strdup(path);
    entry->name = g_strdup(name);
    g_ptr_array_add(mgr->bookmarks, entry);
    json_save_bookmarks(mgr->file_path, mgr->bookmarks);
    return TRUE;
}

void bookmark_manager_remove(BookmarkManager *mgr, const char *path) {
    for (guint i = 0; i < mgr->bookmarks->len; i++) {
        BookmarkEntry *b = g_ptr_array_index(mgr->bookmarks, i);
        if (g_ascii_strcasecmp(b->path, path) == 0) {
            g_ptr_array_remove_index(mgr->bookmarks, i);
            break;
        }
    }
    json_save_bookmarks(mgr->file_path, mgr->bookmarks);
}
