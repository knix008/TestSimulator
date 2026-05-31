#include "ocr/engine_install.h"

void ocr_install_report(OcrInstallContext *ctx, const char *message, int percent) {
    if (ctx && ctx->report)
        ctx->report(ctx, message, percent);
}

gboolean ocr_install_cancelled(const OcrInstallContext *ctx) {
    return ctx && ctx->cancellable && g_cancellable_is_cancelled(ctx->cancellable);
}
