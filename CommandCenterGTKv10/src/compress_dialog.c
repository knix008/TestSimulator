#include "compress_dialog.h"

#include <string.h>

static const char * const known_sfx[] = {
    ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz",
    ".tar", ".zip", NULL
};

/* ------------------------------------------------------------------ */
/* Internal                                                             */
/* ------------------------------------------------------------------ */

typedef struct {
    GtkWidget *name_entry;
    GtkWidget *format_combo;
    GtkWidget *split_check;
    GtkWidget *split_box;
    GtkWidget *size_entry;
    GtkWidget *unit_combo;
} CDWidgets;

static void on_split_toggled(GtkToggleButton *btn, gpointer data) {
    CDWidgets *w = data;
    gtk_widget_set_sensitive(w->split_box,
                             gtk_toggle_button_get_active(btn));
}

/* Strip any known archive extension from s (modifies in-place). */
static void strip_archive_ext(char *s) {
    for (int i = 0; known_sfx[i]; i++) {
        size_t slen = strlen(s), elen = strlen(known_sfx[i]);
        if (slen > elen && strcmp(s + slen - elen, known_sfx[i]) == 0) {
            s[slen - elen] = '\0';
            return;
        }
    }
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

gboolean compress_dialog_run(GtkWindow *parent, const char *default_name,
                             const char *default_dir,
                             CompressDialogResult *out_result) {
    GtkWidget *dlg = gtk_dialog_new_with_buttons(
        "파일 압축",
        parent,
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "취소",  GTK_RESPONSE_CANCEL,
        "압축",  GTK_RESPONSE_OK,
        NULL);
    gtk_dialog_set_default_response(GTK_DIALOG(dlg), GTK_RESPONSE_OK);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    gtk_container_set_border_width(GTK_CONTAINER(content), 12);

    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 8);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 10);
    gtk_box_pack_start(GTK_BOX(content), grid, FALSE, FALSE, 0);

    CDWidgets w = { 0 };

    /* Row 0: archive name */
    GtkWidget *name_lbl = gtk_label_new("파일 이름:");
    gtk_label_set_xalign(GTK_LABEL(name_lbl), 1.0);
    gtk_grid_attach(GTK_GRID(grid), name_lbl, 0, 0, 1, 1);

    w.name_entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(w.name_entry),
                       (default_name && *default_name) ? default_name : "archive");
    gtk_entry_set_width_chars(GTK_ENTRY(w.name_entry), 28);
    gtk_entry_set_activates_default(GTK_ENTRY(w.name_entry), TRUE);
    gtk_grid_attach(GTK_GRID(grid), w.name_entry, 1, 0, 2, 1);

    /* Row 1: format */
    GtkWidget *fmt_lbl = gtk_label_new("형식:");
    gtk_label_set_xalign(GTK_LABEL(fmt_lbl), 1.0);
    gtk_grid_attach(GTK_GRID(grid), fmt_lbl, 0, 1, 1, 1);

    w.format_combo = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(w.format_combo), ".tar.gz");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(w.format_combo), ".tar.bz2");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(w.format_combo), ".zip");
    gtk_combo_box_set_active(GTK_COMBO_BOX(w.format_combo), 0);
    gtk_grid_attach(GTK_GRID(grid), w.format_combo, 1, 1, 2, 1);

    /* Row 2: split toggle */
    w.split_check = gtk_check_button_new_with_label("분할 압축");
    gtk_grid_attach(GTK_GRID(grid), w.split_check, 1, 2, 2, 1);

    /* Row 3: split size */
    GtkWidget *size_lbl = gtk_label_new("분할 크기:");
    gtk_label_set_xalign(GTK_LABEL(size_lbl), 1.0);
    gtk_grid_attach(GTK_GRID(grid), size_lbl, 0, 3, 1, 1);

    w.split_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    w.size_entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(w.size_entry), "10");
    gtk_entry_set_width_chars(GTK_ENTRY(w.size_entry), 8);
    gtk_entry_set_activates_default(GTK_ENTRY(w.size_entry), TRUE);
    gtk_box_pack_start(GTK_BOX(w.split_box), w.size_entry, FALSE, FALSE, 0);

    w.unit_combo = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(w.unit_combo), "KB");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(w.unit_combo), "MB");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(w.unit_combo), "GB");
    gtk_combo_box_set_active(GTK_COMBO_BOX(w.unit_combo), 1);
    gtk_box_pack_start(GTK_BOX(w.split_box), w.unit_combo, FALSE, FALSE, 0);

    gtk_grid_attach(GTK_GRID(grid), w.split_box, 1, 3, 2, 1);
    gtk_widget_set_sensitive(w.split_box, FALSE);

    g_signal_connect(w.split_check, "toggled", G_CALLBACK(on_split_toggled), &w);

    gtk_widget_show_all(content);

    gboolean confirmed = FALSE;
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_OK) {
        const char *name = gtk_entry_get_text(GTK_ENTRY(w.name_entry));
        if (name && *name) {
            int fmt_idx = gtk_combo_box_get_active(GTK_COMBO_BOX(w.format_combo));
            if (fmt_idx < 0) fmt_idx = 0;
            ArchiveFormat fmt = (ArchiveFormat)fmt_idx;
            out_result->opts.format = fmt;
            out_result->opts.split  = gtk_toggle_button_get_active(
                GTK_TOGGLE_BUTTON(w.split_check));

            if (out_result->opts.split) {
                const char *sz_str = gtk_entry_get_text(GTK_ENTRY(w.size_entry));
                guint64 sz = (guint64)g_ascii_strtoull(sz_str, NULL, 10);
                if (sz == 0) sz = 10;
                int unit = gtk_combo_box_get_active(GTK_COMBO_BOX(w.unit_combo));
                static const guint64 mult[] = {
                    1024ULL,
                    1024ULL * 1024,
                    1024ULL * 1024 * 1024
                };
                int u = (unit >= 0 && unit < 3) ? unit : 1;
                out_result->opts.split_size = sz * mult[u];
            } else {
                out_result->opts.split_size = 0;
            }

            const char *ext = archive_format_ext_for(&out_result->opts);

            /* Build base name without extension */
            char *base = g_strdup(name);
            strip_archive_ext(base);

            const char *dir = (default_dir && *default_dir) ? default_dir
                                                             : g_get_home_dir();
            char *base_path = g_build_filename(dir, base, NULL);
            g_free(base);

            out_result->dest_path = g_strdup_printf("%s%s", base_path, ext);
            g_free(base_path);

            confirmed = TRUE;
        }
    }

    gtk_widget_destroy(dlg);
    return confirmed;
}

void compress_dialog_result_free(CompressDialogResult *r) {
    if (r) {
        g_free(r->dest_path);
        r->dest_path = NULL;
    }
}
