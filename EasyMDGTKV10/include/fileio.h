/**
 * EasyMD GTK
 * fileio.h - File open/save helpers (dialogs + raw I/O).
 */
#ifndef EASYMD_FILEIO_H
#define EASYMD_FILEIO_H

#include <gtk/gtk.h>

/* Show a file-open dialog filtered to markdown files. *out_path is set on
 * success and must be freed with g_free(). Returns TRUE if user picked one. */
gboolean fileio_open_dialog(GtkWindow *parent, gchar **out_path);

/* Show a file-save dialog. If current_path is provided it is used as suggestion.
 * On success *out_path is set (free with g_free()). */
gboolean fileio_save_dialog(GtkWindow *parent,
                            const gchar *current_path,
                            gchar **out_path);

/* Generic save-as dialog: caller provides title, default filename, and start
 * directory (may be NULL to use home). On success *out_path is set. */
gboolean fileio_save_as_dialog(GtkWindow *parent,
                               const gchar *title,
                               const gchar *default_name,
                               const gchar *start_dir,
                               gchar **out_path);

/* Export the given markdown source as a standalone HTML file. */
gboolean fileio_export_html(const gchar *path, const gchar *markdown,
                            GError **error);

/* Export markdown as an Office Open XML Word document (.docx). */
gboolean fileio_export_word(const gchar *path, const gchar *markdown,
                            GError **error);

/* Read a UTF-8 text file. Returns malloc'd buffer (NUL terminated) on success,
 * NULL on error (sets *error). Free with g_free(). */
gchar *fileio_read_file(const gchar *path, GError **error);

/* Write content to a file (UTF-8). */
gboolean fileio_write_file(const gchar *path,
                           const gchar *content,
                           GError **error);

#endif /* EASYMD_FILEIO_H */
