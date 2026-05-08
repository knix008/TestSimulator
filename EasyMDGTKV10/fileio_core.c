/**
 * EasyMD GTK
 * fileio_core.c - Toolkit-agnostic file I/O (no GTK).
 */
#include "fileio_core.h"

#include <string.h>

gchar *fileio_core_read(const gchar *path, GError **error) {
    gchar *contents = NULL;
    gsize  length   = 0;
    if (!g_file_get_contents(path, &contents, &length, error)) {
        return NULL;
    }
    return contents;
}

gboolean fileio_core_write(const gchar *path,
                           const gchar *content,
                           GError **error) {
    gsize len = content ? strlen(content) : 0;
    return g_file_set_contents(path,
                               content ? content : "",
                               (gssize)len,
                               error);
}
