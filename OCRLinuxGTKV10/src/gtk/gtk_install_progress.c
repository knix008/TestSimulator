#include "gtk/gtk_install_progress.h"
#include "ocr/engine_install.h"
#include <string.h>

typedef struct {
    GtkWidget *dialog;
    GtkWidget *lbl_title;
    GtkWidget *lbl_message;
    GtkWidget *progress;
    GtkWidget *btn_cancel;

    OcrApp *app;
    GCancellable *cancellable;
    GThread *thread;
    GMainLoop *loop;

    GMutex lock;
    char pending_message[512];
    int pending_percent;
    gboolean has_update;

    gboolean finished;
    gboolean ui_alive;
    gboolean success;
    GError *error;
} InstallProgressDialog;

static void apply_progress_ui(InstallProgressDialog *d, const char *message, int percent) {
    if (!d->ui_alive || !GTK_IS_WIDGET(d->lbl_message) || !GTK_IS_PROGRESS_BAR(d->progress))
        return;
    gtk_label_set_text(GTK_LABEL(d->lbl_message), message);

    if (percent >= 0) {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(d->progress), percent / 100.0);
        gtk_progress_bar_set_pulse_step(GTK_PROGRESS_BAR(d->progress), 0.0);
    } else {
        gtk_progress_bar_pulse(GTK_PROGRESS_BAR(d->progress));
    }
}

static gboolean update_progress_idle(gpointer user_data) {
    InstallProgressDialog *d = user_data;
    if (!d->ui_alive)
        return G_SOURCE_REMOVE;
    char message[512];
    int percent;

    g_mutex_lock(&d->lock);
    g_strlcpy(message, d->pending_message, sizeof(message));
    percent = d->pending_percent;
    d->has_update = FALSE;
    g_mutex_unlock(&d->lock);

    apply_progress_ui(d, message, percent);
    return G_SOURCE_REMOVE;
}

static void install_report_cb(OcrInstallContext *ctx, const char *message, int percent) {
    InstallProgressDialog *d = ctx->user_data;
    if (d->finished || !d->ui_alive)
        return;
    g_mutex_lock(&d->lock);
    g_strlcpy(d->pending_message, message, sizeof(d->pending_message));
    d->pending_percent = percent;
    if (!d->has_update) {
        d->has_update = TRUE;
        g_idle_add(update_progress_idle, d);
    }
    g_mutex_unlock(&d->lock);
}

static void quit_install_loop(InstallProgressDialog *d) {
    d->finished = TRUE;
    if (d->loop)
        g_main_loop_quit(d->loop);
}

static gboolean quit_install_loop_idle(gpointer user_data) {
    quit_install_loop(user_data);
    return G_SOURCE_REMOVE;
}

static gboolean pulse_progress_idle(gpointer user_data) {
    InstallProgressDialog *d = user_data;
    if (d->finished || !d->ui_alive || !GTK_IS_PROGRESS_BAR(d->progress))
        return G_SOURCE_REMOVE;
    g_mutex_lock(&d->lock);
    int percent = d->pending_percent;
    g_mutex_unlock(&d->lock);
    if (percent < 0)
        gtk_progress_bar_pulse(GTK_PROGRESS_BAR(d->progress));
    return G_SOURCE_CONTINUE;
}

static gboolean finish_success_idle(gpointer user_data) {
    InstallProgressDialog *d = user_data;
    if (!d->ui_alive)
        return G_SOURCE_REMOVE;
    apply_progress_ui(d, "설치 완료", 100);
    g_timeout_add(400, quit_install_loop_idle, d);
    return G_SOURCE_REMOVE;
}

static gboolean finish_failure_idle(gpointer user_data) {
    InstallProgressDialog *d = user_data;
    if (!d->ui_alive)
        return G_SOURCE_REMOVE;
    if (d->error && d->error->message && d->error->message[0])
        apply_progress_ui(d, d->error->message, -1);
    else if (g_cancellable_is_cancelled(d->cancellable))
        apply_progress_ui(d, "취소되었습니다.", -1);
    else
        apply_progress_ui(d, "설치에 실패했습니다.", -1);
    g_timeout_add(800, quit_install_loop_idle, d);
    return G_SOURCE_REMOVE;
}

static gpointer install_thread(gpointer user_data) {
    InstallProgressDialog *d = user_data;
    OcrInstallContext ctx = {
        .report = install_report_cb,
        .user_data = d,
        .cancellable = d->cancellable
    };

    g_strlcpy(d->pending_message, "설치를 시작합니다...", sizeof(d->pending_message));
    d->pending_percent = -1;
    g_idle_add(update_progress_idle, d);

    d->success = ocr_app_prepare_engine_ex(d->app, &ctx, &d->error);
    if (d->success)
        g_idle_add(finish_success_idle, d);
    else
        g_idle_add(finish_failure_idle, d);
    return NULL;
}

static void on_cancel_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    InstallProgressDialog *d = user_data;
    gtk_widget_set_sensitive(d->btn_cancel, FALSE);
    apply_progress_ui(d, "취소하는 중...", -1);
    g_cancellable_cancel(d->cancellable);
}

static gboolean on_delete_event(GtkWidget *widget, GdkEvent *event, gpointer user_data) {
    (void)widget;
    (void)event;
    InstallProgressDialog *d = user_data;
    if (!d->finished) {
        g_cancellable_cancel(d->cancellable);
        gtk_widget_set_sensitive(d->btn_cancel, FALSE);
        apply_progress_ui(d, "취소하는 중...", -1);
    }
    return FALSE;
}

gboolean gtk_install_progress_prepare_engine(GtkWindow *parent, OcrApp *app, GError **error) {
    /*
     * 이미 설치된 엔진은 여기서 동기 준비를 수행하지 않는다.
     * (EasyOCR warm-up/초기화와 경합 시 메인 스레드가 잠길 수 있음)
     * 실제 엔진 초기화는 OCR 작업 스레드 경로에서 처리된다.
     */
    if (!ocr_app_engine_needs_install(app))
        return TRUE;

    InstallProgressDialog d = {0};
    d.app = app;
    d.cancellable = g_cancellable_new();
    g_mutex_init(&d.lock);

    d.dialog = gtk_dialog_new();
    GtkWindow *dlg = GTK_WINDOW(d.dialog);
    gtk_window_set_title(dlg, "OCR 엔진 설치");
    gtk_window_set_transient_for(dlg, parent);
    gtk_window_set_modal(dlg, TRUE);
    gtk_window_set_destroy_with_parent(dlg, TRUE);
    gtk_window_set_default_size(dlg, 460, 175);
    gtk_window_set_resizable(dlg, FALSE);
    gtk_window_set_deletable(dlg, TRUE);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(d.dialog));
    gtk_container_set_border_width(GTK_CONTAINER(content), 16);
    gtk_box_set_spacing(GTK_BOX(content), 8);

    char *title_markup = g_strdup_printf("<span weight=\"bold\" size=\"large\">%s</span>",
                                         ocr_app_active_engine_display_name(app));
    d.lbl_title = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(d.lbl_title), title_markup);
    g_free(title_markup);

    gtk_widget_set_halign(d.lbl_title, GTK_ALIGN_START);

    d.lbl_message = gtk_label_new(ocr_app_active_engine_description(app));
    gtk_label_set_line_wrap(GTK_LABEL(d.lbl_message), TRUE);
    gtk_label_set_xalign(GTK_LABEL(d.lbl_message), 0.0);
    gtk_widget_set_size_request(d.lbl_message, 428, -1);

    d.progress = gtk_progress_bar_new();
    gtk_progress_bar_set_pulse_step(GTK_PROGRESS_BAR(d.progress), 0.05);
    gtk_widget_set_size_request(d.progress, 428, -1);

    d.btn_cancel = gtk_dialog_add_button(GTK_DIALOG(d.dialog), "취소", GTK_RESPONSE_CANCEL);
    g_signal_connect(d.btn_cancel, "clicked", G_CALLBACK(on_cancel_clicked), &d);
    g_signal_connect(d.dialog, "delete-event", G_CALLBACK(on_delete_event), &d);

    gtk_box_pack_start(GTK_BOX(content), d.lbl_title, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(content), d.lbl_message, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(content), d.progress, FALSE, FALSE, 8);

    g_strlcpy(d.pending_message, "설치를 시작합니다...", sizeof(d.pending_message));
    d.pending_percent = -1;
    apply_progress_ui(&d, d.pending_message, d.pending_percent);

    gtk_widget_show_all(d.dialog);
    d.ui_alive = TRUE;

    guint pulse_id = g_timeout_add(50, pulse_progress_idle, &d);
    d.loop = g_main_loop_new(NULL, FALSE);
    d.thread = g_thread_new("ocr-install", install_thread, &d);
    g_main_loop_run(d.loop);
    g_source_remove(pulse_id);
    g_main_loop_unref(d.loop);
    d.loop = NULL;

    g_thread_join(d.thread);
    d.ui_alive = FALSE;
    gtk_widget_destroy(d.dialog);
    g_mutex_clear(&d.lock);

    if (d.success) {
        g_object_unref(d.cancellable);
        return TRUE;
    }

    if (d.error) {
        if (error)
            g_propagate_error(error, d.error);
        else
            g_error_free(d.error);
    } else if (error) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "설치가 취소되었습니다");
    }

    g_object_unref(d.cancellable);
    return FALSE;
}
