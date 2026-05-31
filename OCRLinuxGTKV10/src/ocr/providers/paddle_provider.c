#include "ocr/ocr_provider.h"
#include "ocr/ocr_provider_ids.h"
#include "ocr/engine_paths.h"
#include "ocr/engine_download.h"
#include "ocr/python_runner.h"

typedef struct {
    OcrProvider base;
} PaddleProvider;

static gboolean paddle_models_ready(void) {
    const char *folders[] = {
        "PP-OCRv5_mobile_det",
        "PP-LCNet_x1_0_textline_ori",
        "korean_PP-OCRv5_mobile_rec",
        NULL
    };

    for (int i = 0; folders[i]; i++) {
        char *dir = engine_paths_paddle_model(folders[i]);
        char *json = g_build_filename(dir, "inference.json", NULL);
        char *params = g_build_filename(dir, "inference.pdiparams", NULL);
        gboolean ok = g_file_test(json, G_FILE_TEST_EXISTS)
            && g_file_test(params, G_FILE_TEST_EXISTS);
        g_free(json);
        g_free(params);
        g_free(dir);
        if (!ok) return FALSE;
    }
    return TRUE;
}

static gboolean paddle_is_installed(const OcrProvider *provider) {
    (void)provider;
    return paddle_models_ready();
}

static gboolean paddle_ensure_installed(OcrProvider *provider, OcrInstallContext *ctx, GError **error) {
    (void)provider;
    if (!paddle_models_ready()) {
        if (!engine_download_paddle_models(ctx, error))
            return FALSE;
    }
    return engine_ensure_python_module("paddleocr", ctx, error);
}

static gboolean paddle_recognize(OcrProvider *provider, PIX *image, OcrResult *result, GError **error) {
    (void)provider;
    char *script = engine_paths_script("paddle_ocr.py");
    if (!g_file_test(script, G_FILE_TEST_IS_REGULAR)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_NOENT, "Script not found: %s", script);
        g_free(script);
        return FALSE;
    }

    char *cache_root = engine_paths_engines_root();
    char *models_root = g_build_filename(cache_root, "paddle", NULL);
    g_free(cache_root);

    const char *extra[] = { models_root, NULL };
    gboolean ok = python_runner_recognize(script, extra, image, result, error);
    g_free(models_root);
    g_free(script);
    return ok;
}

static void paddle_destroy(OcrProvider *provider) {
    g_free(provider);
}

OcrProvider *paddle_provider_create(void) {
    PaddleProvider *pp = g_new0(PaddleProvider, 1);
    pp->base.vtable = (OcrProviderVTable){
        .id = OCR_PROVIDER_PADDLE,
        .display_name = "PaddleOCR (한·영, 권장)",
        .description = "한국어 V5 · 한글·영문 혼합 문서 (모델 자동 다운로드)",
        .is_installed = paddle_is_installed,
        .ensure_installed = paddle_ensure_installed,
        .recognize = paddle_recognize,
        .destroy = paddle_destroy
    };
    return &pp->base;
}
