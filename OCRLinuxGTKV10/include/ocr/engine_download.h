#ifndef ENGINE_DOWNLOAD_H
#define ENGINE_DOWNLOAD_H

#include <glib.h>
#include "ocr/engine_install.h"

typedef void (*EngineDownloadProgressFn)(const char *message, int percent, gpointer user_data);

gboolean engine_download_file(
    const char *url,
    const char *destination,
    OcrInstallContext *ctx,
    EngineDownloadProgressFn progress,
    gpointer user_data,
    GError **error);

gboolean engine_download_rapidocr_models(OcrInstallContext *ctx, GError **error);
gboolean engine_download_paddle_onnx_models(OcrInstallContext *ctx, GError **error);
gboolean engine_download_tessdata(OcrInstallContext *ctx, GError **error);

/* EasyOCR (Python venv 기반) */
gboolean engine_ensure_python_module(const char *module_name, OcrInstallContext *ctx, GError **error);
gboolean engine_python_can_import(const char *module_name, GError **error);

#endif
