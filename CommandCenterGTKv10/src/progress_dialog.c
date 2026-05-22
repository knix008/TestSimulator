#include "progress_dialog.h"

#define SHOW_DELAY_MS 300

struct ProgressDialog {
    GtkWindow *parent;
    char *title;
    GtkWidget *dialog;
    GtkWidget *progress_bar;
    GtkWidget *detail_label;
    guint show_timeout_id;
    gboolean shown;
    gboolean closed;
};

static gboolean show_timeout_cb(gpointer data) {
    ProgressDialog *pd = data;
    pd->show_timeout_id = 0;
    if (pd->closed)
        return G_SOURCE_REMOVE;

    pd->dialog = gtk_dialog_new();
    gtk_window_set_title(GTK_WINDOW(pd->dialog), pd->title);
    gtk_window_set_transient_for(GTK_WINDOW(pd->dialog), pd->parent);
    gtk_window_set_modal(GTK_WINDOW(pd->dialog), TRUE);
    gtk_window_set_destroy_with_parent(GTK_WINDOW(pd->dialog), TRUE);
    gtk_window_set_default_size(GTK_WINDOW(pd->dialog), 480, 120);
    gtk_window_set_deletable(GTK_WINDOW(pd->dialog), FALSE);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(pd->dialog));
    gtk_container_set_border_width(GTK_CONTAINER(content), 16);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_box_pack_start(GTK_BOX(content), vbox, TRUE, TRUE, 0);

    pd->progress_bar = gtk_progress_bar_new();
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(pd->progress_bar), TRUE);
    gtk_box_pack_start(GTK_BOX(vbox), pd->progress_bar, FALSE, FALSE, 0);

    pd->detail_label = gtk_label_new("");
    gtk_label_set_xalign(GTK_LABEL(pd->detail_label), 0.0);
    gtk_label_set_line_wrap(GTK_LABEL(pd->detail_label), TRUE);
    gtk_label_set_max_width_chars(GTK_LABEL(pd->detail_label), 56);
    gtk_box_pack_start(GTK_BOX(vbox), pd->detail_label, FALSE, FALSE, 0);

    gtk_widget_show_all(pd->dialog);
    pd->shown = TRUE;
    gtk_main_iteration();
    return G_SOURCE_REMOVE;
}

static void pump_events(void) {
    for (int i = 0; i < 8; i++) {
        if (!g_main_context_pending(NULL))
            break;
        g_main_context_iteration(NULL, FALSE);
    }
}

ProgressDialog *progress_dialog_begin(GtkWindow *parent, const char *title) {
    ProgressDialog *pd = g_new0(ProgressDialog, 1);
    pd->parent = parent;
    pd->title = g_strdup(title);
    return pd;
}

void progress_dialog_update(ProgressDialog *pd, guint64 current, guint64 total,
                            const char *detail) {
    if (!pd || pd->closed)
        return;

    if (!pd->shown && !pd->show_timeout_id)
        pd->show_timeout_id = g_timeout_add(SHOW_DELAY_MS, show_timeout_cb, pd);

    if (pd->shown) {
        double frac = 0.0;
        if (total > 0)
            frac = (double)current / (double)total;
        if (frac > 1.0)
            frac = 1.0;
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(pd->progress_bar), frac);
        if (total > 0) {
            char *pct = g_strdup_printf("%.0f%%", frac * 100.0);
            gtk_progress_bar_set_text(GTK_PROGRESS_BAR(pd->progress_bar), pct);
            g_free(pct);
        } else {
            gtk_progress_bar_pulse(GTK_PROGRESS_BAR(pd->progress_bar));
        }
        if (detail && *detail)
            gtk_label_set_text(GTK_LABEL(pd->detail_label), detail);
        pump_events();
    }
}

void progress_dialog_end(ProgressDialog *pd) {
    if (!pd)
        return;
    pd->closed = TRUE;
    if (pd->show_timeout_id) {
        g_source_remove(pd->show_timeout_id);
        pd->show_timeout_id = 0;
    }
    if (pd->dialog)
        gtk_widget_destroy(pd->dialog);
    g_free(pd->title);
    g_free(pd);
}

void progress_dialog_ops_report(ProgressDialogOpsCtx *ctx, const char *detail) {
    if (!ctx || !ctx->dlg)
        return;
    ctx->current++;
    progress_dialog_update(ctx->dlg, ctx->current, ctx->total, detail);
}

void progress_dialog_ops_callback(const char *path, gpointer user_data) {
    progress_dialog_ops_report((ProgressDialogOpsCtx *)user_data, path);
}
