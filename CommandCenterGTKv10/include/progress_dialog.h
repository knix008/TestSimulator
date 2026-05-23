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

ProgressDialog *progress_dialog_begin(GtkWindow *parent, const char *verb);
GCancellable *progress_dialog_get_cancellable(ProgressDialog *pd);
void progress_dialog_update(ProgressDialog *pd, guint64 current, guint64 total,
                            const char *filename);
void progress_dialog_end(ProgressDialog *pd);

void progress_dialog_ops_report(ProgressDialogOpsCtx *ctx, const char *path);
void progress_dialog_ops_callback(const char *path, gpointer user_data);

#endif
