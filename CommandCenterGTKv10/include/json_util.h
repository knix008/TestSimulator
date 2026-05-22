#ifndef JSON_UTIL_H
#define JSON_UTIL_H

#include <glib.h>

typedef struct {
    gchar *path;
    gchar *name;
} BookmarkEntry;

GPtrArray *json_load_bookmarks(const char *file_path);
gboolean json_save_bookmarks(const char *file_path, GPtrArray *bookmarks);

gboolean json_load_session(const char *file_path,
                           gchar **left_path,
                           gchar **right_path,
                           gint *splitter_distance);
gboolean json_save_session(const char *file_path,
                           const char *left_path,
                           const char *right_path,
                           gint splitter_distance);

void bookmark_entry_free(gpointer data);

#endif
