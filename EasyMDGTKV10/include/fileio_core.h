/**
 * EasyMD GTK
 * fileio_core.h - Toolkit-agnostic file I/O (no GTK).
 *
 * Just wraps g_file_get_contents / g_file_set_contents in a tiny helper layer
 * so the GTK file-chooser dialog code never needs to do raw I/O itself.
 */
#ifndef EASYMD_FILEIO_CORE_H
#define EASYMD_FILEIO_CORE_H

#include <glib.h>

/* Read a UTF-8 text file. Returns a NUL-terminated buffer (free with g_free)
 * or NULL on error (sets *error). */
gchar *fileio_core_read(const gchar *path, GError **error);

/* Write `content` (UTF-8) to `path`, overwriting if present. */
gboolean fileio_core_write(const gchar *path,
                           const gchar *content,
                           GError **error);

#endif /* EASYMD_FILEIO_CORE_H */
