#include "progress_dialog.h"

#define PROGRESS_DIALOG_WIDTH   540
#define PROGRESS_DIALOG_HEIGHT  150
#define PROGRESS_INNER_WIDTH    500
#define PROGRESS_TITLE_HEIGHT   28
#define PROGRESS_BAR_HEIGHT     24
#define PROGRESS_PATH_WIDTH     420
#define MAX_FULL_PATH_CHARS     48

struct ProgressDialog {
    GtkWindow *parent;
    char *verb;
    GtkWidget *window;
    GtkWidget *path_label;
    GtkWidget *progress_bar;
    GtkWidget *cancel_button;
    GCancellable *cancellable;
    gboolean closed;
    gboolean positioned;
};

static void apply_fixed_window_size(GtkWidget *window) {
    GdkGeometry geom = { 0 };
    geom.min_width = PROGRESS_DIALOG_WIDTH;
    geom.max_width = PROGRESS_DIALOG_WIDTH;
    geom.min_height = PROGRESS_DIALOG_HEIGHT;
    geom.max_height = PROGRESS_DIALOG_HEIGHT;
    gtk_window_set_geometry_hints(GTK_WINDOW(window), NULL, &geom,
                                  GDK_HINT_MIN_SIZE | GDK_HINT_MAX_SIZE);
    gtk_window_set_resizable(GTK_WINDOW(window), FALSE);
    gtk_widget_set_size_request(window, PROGRESS_DIALOG_WIDTH, PROGRESS_DIALOG_HEIGHT);
}

static char *format_path_display(const char *path) {
    if (!path || !*path)
        return g_strdup("...");

    if (g_utf8_strlen(path, -1) <= MAX_FULL_PATH_CHARS)
        return g_strdup(path);

    gchar *base = g_path_get_basename(path);
    if (!base || !*base) {
        g_free(base);
        return g_strdup("...");
    }

    char *result = g_strdup_printf(".../%s", base);
    g_free(base);

    /* Clamp to MAX_FULL_PATH_CHARS so the label never widens the window. */
    if (g_utf8_strlen(result, -1) > MAX_FULL_PATH_CHARS) {
        gchar *end = g_utf8_offset_to_pointer(result, MAX_FULL_PATH_CHARS - 3);
        gchar *clamped = g_strdup_printf("%.*s...", (int)(end - result), result);
        g_free(result);
        result = clamped;
    }

    return result;
}

static void set_path_text(ProgressDialog *pd, const char *path) {
    char *display = format_path_display(path);
    gtk_label_set_text(GTK_LABEL(pd->path_label), display);
    g_free(display);
}

static void on_progress_cancel(GtkButton *button, gpointer user_data) {
    ProgressDialog *pd = user_data;
    (void)button;
    if (pd && pd->cancellable)
        g_cancellable_cancel(pd->cancellable);
    gtk_widget_set_sensitive(pd->cancel_button, FALSE);
}

static void progress_dialog_show(ProgressDialog *pd) {
    pd->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_transient_for(GTK_WINDOW(pd->window), pd->parent);
    gtk_window_set_modal(GTK_WINDOW(pd->window), TRUE);
    gtk_window_set_destroy_with_parent(GTK_WINDOW(pd->window), TRUE);
    gtk_window_set_title(GTK_WINDOW(pd->window), pd->verb);
    gtk_window_set_type_hint(GTK_WINDOW(pd->window), GDK_WINDOW_TYPE_HINT_DIALOG);
    gtk_window_set_position(GTK_WINDOW(pd->window), GTK_WIN_POS_CENTER_ON_PARENT);
    apply_fixed_window_size(pd->window);

    GtkWidget *fixed = gtk_fixed_new();
    gtk_widget_set_size_request(fixed, PROGRESS_INNER_WIDTH, 110);
    gtk_container_add(GTK_CONTAINER(pd->window), fixed);
    gtk_container_set_border_width(GTK_CONTAINER(pd->window), 20);

    char *prefix = g_strdup_printf("%s : ", pd->verb);
    GtkWidget *verb_label = gtk_label_new(prefix);
    g_free(prefix);
    gtk_label_set_xalign(GTK_LABEL(verb_label), 0.0);
    gtk_label_set_yalign(GTK_LABEL(verb_label), 0.5);
    gtk_widget_set_size_request(verb_label, PROGRESS_INNER_WIDTH - PROGRESS_PATH_WIDTH,
                                PROGRESS_TITLE_HEIGHT);
    gtk_fixed_put(GTK_FIXED(fixed), verb_label, 0, 0);

    pd->path_label = gtk_label_new("...");
    gtk_label_set_xalign(GTK_LABEL(pd->path_label), 0.0);
    gtk_label_set_yalign(GTK_LABEL(pd->path_label), 0.5);
    gtk_label_set_line_wrap(GTK_LABEL(pd->path_label), FALSE);
    gtk_label_set_single_line_mode(GTK_LABEL(pd->path_label), TRUE);
    gtk_label_set_ellipsize(GTK_LABEL(pd->path_label), PANGO_ELLIPSIZE_END);
    gtk_label_set_max_width_chars(GTK_LABEL(pd->path_label), MAX_FULL_PATH_CHARS);
    gtk_widget_set_size_request(pd->path_label, PROGRESS_PATH_WIDTH,
                                PROGRESS_TITLE_HEIGHT);
    GtkCssProvider *css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css,
        "label { font-family: Monospace; font-size: 10pt; }", -1, NULL);
    gtk_style_context_add_provider(gtk_widget_get_style_context(pd->path_label),
        GTK_STYLE_PROVIDER(css), GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(css);
    gtk_fixed_put(GTK_FIXED(fixed), pd->path_label,
                  PROGRESS_INNER_WIDTH - PROGRESS_PATH_WIDTH, 0);

    pd->progress_bar = gtk_progress_bar_new();
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(pd->progress_bar), TRUE);
    gtk_widget_set_size_request(pd->progress_bar, PROGRESS_INNER_WIDTH,
                                PROGRESS_BAR_HEIGHT);
    gtk_fixed_put(GTK_FIXED(fixed), pd->progress_bar, 0, 40);

    pd->cancel_button = gtk_button_new_with_mnemonic("_취소");
    gtk_widget_set_size_request(pd->cancel_button, 88, 32);
    g_signal_connect(pd->cancel_button, "clicked", G_CALLBACK(on_progress_cancel), pd);
    gtk_fixed_put(GTK_FIXED(fixed), pd->cancel_button,
                  PROGRESS_INNER_WIDTH - 88, 76);

    set_path_text(pd, NULL);
    gtk_widget_show_all(pd->window);
    pd->positioned = TRUE;
}

ProgressDialog *progress_dialog_begin(GtkWindow *parent, const char *verb) {
    ProgressDialog *pd = g_new0(ProgressDialog, 1);
    pd->parent = parent;
    pd->verb = g_strdup(verb ? verb : "작업 중");
    pd->cancellable = g_cancellable_new();
    progress_dialog_show(pd);
    return pd;
}

GCancellable *progress_dialog_get_cancellable(ProgressDialog *pd) {
    return pd ? pd->cancellable : NULL;
}

void progress_dialog_update(ProgressDialog *pd, guint64 current, guint64 total,
                            const char *path) {
    if (!pd || pd->closed || !pd->window)
        return;

    set_path_text(pd, path);

    double frac = 0.0;
    if (total > 0)
        frac = (double)current / (double)total;
    if (frac > 1.0)
        frac = 1.0;
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(pd->progress_bar), frac);

    char pct[16];
    if (total > 0)
        g_snprintf(pct, sizeof pct, "%3.0f%%", frac * 100.0);
    else
        g_strlcpy(pct, "   ", sizeof pct);
    gtk_progress_bar_set_text(GTK_PROGRESS_BAR(pd->progress_bar), pct);
}

void progress_dialog_end(ProgressDialog *pd) {
    if (!pd)
        return;
    pd->closed = TRUE;
    if (pd->window)
        gtk_widget_destroy(pd->window);
    g_clear_object(&pd->cancellable);
    g_free(pd->verb);
    g_free(pd);
}

void progress_dialog_ops_report(ProgressDialogOpsCtx *ctx, const char *path) {
    if (!ctx || !ctx->dlg)
        return;
    ctx->current++;
    progress_dialog_update(ctx->dlg, ctx->current, ctx->total, path);
}

void progress_dialog_ops_callback(const char *path, gpointer user_data) {
    progress_dialog_ops_report((ProgressDialogOpsCtx *)user_data, path);
}

static gboolean progress_dialog_thread_idle(gpointer user_data) {
    ProgressDialogThreadCtx *ctx = user_data;
    gchar *detail = NULL;

    g_mutex_lock(&ctx->lock);
    ctx->idle_id = 0;
    detail = g_steal_pointer(&ctx->pending_path);
    g_mutex_unlock(&ctx->lock);

    if (detail) {
        progress_dialog_ops_report(&ctx->ops, detail);
        g_free(detail);
    }
    return G_SOURCE_REMOVE;
}

void progress_dialog_thread_ctx_init(ProgressDialogThreadCtx *ctx,
                                     ProgressDialog *dlg, guint64 total) {
    ctx->ops.dlg = dlg;
    ctx->ops.current = 0;
    ctx->ops.total = total;
    ctx->pending_path = NULL;
    ctx->idle_id = 0;
    g_mutex_init(&ctx->lock);
}

void progress_dialog_thread_ctx_flush(ProgressDialogThreadCtx *ctx) {
    guint idle_id = 0;
    gchar *detail = NULL;

    g_mutex_lock(&ctx->lock);
    idle_id = ctx->idle_id;
    ctx->idle_id = 0;
    detail = g_steal_pointer(&ctx->pending_path);
    g_mutex_unlock(&ctx->lock);

    if (idle_id)
        g_source_remove(idle_id);

    if (detail) {
        progress_dialog_ops_report(&ctx->ops, detail);
        g_free(detail);
    }
}

void progress_dialog_thread_ctx_fini(ProgressDialogThreadCtx *ctx) {
    progress_dialog_thread_ctx_flush(ctx);
    g_mutex_clear(&ctx->lock);
}

void progress_dialog_thread_report(ProgressDialogThreadCtx *ctx,
                                   const char *path) {
    if (!ctx)
        return;

    g_mutex_lock(&ctx->lock);
    g_free(ctx->pending_path);
    ctx->pending_path = g_strdup(path);
    if (!ctx->idle_id)
        ctx->idle_id = g_idle_add(progress_dialog_thread_idle, ctx);
    g_mutex_unlock(&ctx->lock);
}

void progress_dialog_thread_callback(const char *path, gpointer user_data) {
    progress_dialog_thread_report((ProgressDialogThreadCtx *)user_data, path);
}
