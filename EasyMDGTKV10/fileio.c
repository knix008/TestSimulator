/**
 * EasyMD GTK
 * fileio.c - GTK file-chooser dialogs only.
 *
 * Raw file I/O lives in fileio_core.c (no GTK), so this file only has to
 * worry about widgets, filters and overwrite confirmation.
 */
#include "fileio.h"

#include <string.h>

#include "fileio_core.h"
#include "utils.h"

static void add_md_filters(GtkFileChooser *chooser) {
    GtkFileFilter *md = gtk_file_filter_new();
    gtk_file_filter_set_name(md, "Markdown (*.md, *.markdown)");
    gtk_file_filter_add_pattern(md, "*.md");
    gtk_file_filter_add_pattern(md, "*.markdown");
    gtk_file_filter_add_pattern(md, "*.MD");
    gtk_file_chooser_add_filter(chooser, md);

    GtkFileFilter *all = gtk_file_filter_new();
    gtk_file_filter_set_name(all, "All files (*)");
    gtk_file_filter_add_pattern(all, "*");
    gtk_file_chooser_add_filter(chooser, all);
}

gboolean fileio_open_dialog(GtkWindow *parent, gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "Markdown 파일 열기",
        parent,
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "_Cancel", GTK_RESPONSE_CANCEL,
        "_Open",   GTK_RESPONSE_ACCEPT,
        NULL);
    add_md_filters(GTK_FILE_CHOOSER(dlg));

    gboolean ok = FALSE;
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        *out_path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        ok = (*out_path != NULL);
    }
    gtk_widget_destroy(dlg);
    return ok;
}

gboolean fileio_save_dialog(GtkWindow *parent,
                            const gchar *current_path,
                            gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "Markdown 파일 저장",
        parent,
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_Cancel", GTK_RESPONSE_CANCEL,
        "_Save",   GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);
    add_md_filters(GTK_FILE_CHOOSER(dlg));

    if (current_path && *current_path) {
        gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(dlg), current_path);
    } else {
        gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), "untitled.md");
    }

    gboolean ok = FALSE;
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        gchar *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        if (path) {
            /* Auto-append .md if there is no extension at all. */
            if (!strchr(path, '.') ||
                !utils_str_has_suffix_ci(path, ".md")) {
                if (!strchr(path, '.')) {
                    gchar *with_ext = g_strconcat(path, ".md", NULL);
                    g_free(path);
                    path = with_ext;
                }
            }
            *out_path = path;
            ok = TRUE;
        }
    }
    gtk_widget_destroy(dlg);
    return ok;
}

gchar *fileio_read_file(const gchar *path, GError **error) {
    return fileio_core_read(path, error);
}

gboolean fileio_write_file(const gchar *path,
                           const gchar *content,
                           GError **error) {
    return fileio_core_write(path, content, error);
}
