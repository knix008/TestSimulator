#ifndef PROGRESS_DIALOG_H
#define PROGRESS_DIALOG_H

#include <glib.h>
#include <gtk/gtk.h>

typedef struct ProgressDialog ProgressDialog;

typedef struct {
    ProgressDialog *dlg;
    guint64 current;
    guint64 total;
} ProgressDialogOpsCtx;

/* Thread-safe progress reporting (worker thread → GTK main loop). */
typedef struct {
    ProgressDialogOpsCtx ops;
    GMutex lock;
    gchar *pending_path;
    guint idle_id;
} ProgressDialogThreadCtx;

ProgressDialog *progress_dialog_begin(GtkWindow *parent, const char *verb);
GCancellable *progress_dialog_get_cancellable(ProgressDialog *pd);
void progress_dialog_update(ProgressDialog *pd, guint64 current, guint64 total,
                            const char *filename);
void progress_dialog_end(ProgressDialog *pd);

void progress_dialog_ops_report(ProgressDialogOpsCtx *ctx, const char *path);
void progress_dialog_ops_callback(const char *path, gpointer user_data);

void progress_dialog_thread_ctx_init(ProgressDialogThreadCtx *ctx,
                                     ProgressDialog *dlg, guint64 total);
void progress_dialog_thread_ctx_flush(ProgressDialogThreadCtx *ctx);
void progress_dialog_thread_ctx_fini(ProgressDialogThreadCtx *ctx);
void progress_dialog_thread_report(ProgressDialogThreadCtx *ctx,
                                   const char *path);
void progress_dialog_thread_callback(const char *path, gpointer user_data);

#endif
