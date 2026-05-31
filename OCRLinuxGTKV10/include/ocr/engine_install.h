#ifndef ENGINE_INSTALL_H
#define ENGINE_INSTALL_H

#include <glib.h>
#include <gio/gio.h>

typedef struct OcrInstallContext OcrInstallContext;

typedef void (*OcrInstallReportFn)(OcrInstallContext *ctx, const char *message, int percent);

struct OcrInstallContext {
    OcrInstallReportFn report;
    gpointer user_data;
    GCancellable *cancellable;
};

void ocr_install_report(OcrInstallContext *ctx, const char *message, int percent);
gboolean ocr_install_cancelled(const OcrInstallContext *ctx);

#endif
