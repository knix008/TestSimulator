#include "ocr/ocr_provider.h"
#include "ocr/ocr_provider_ids.h"
#include "ocr/engine_paths.h"
#include "ocr/engine_download.h"
#include "ocr/python_runner.h"

typedef struct {
    OcrProvider base;
} EasyOcrProvider;

static gboolean easyocr_is_installed(const OcrProvider *provider) {
    (void)provider;
    char *models = engine_paths_easyocr_models_dir();
    gboolean has_dir = g_file_test(models, G_FILE_TEST_IS_DIR);
    g_free(models);
    return has_dir;
}

static gboolean easyocr_ensure_installed(OcrProvider *provider, OcrInstallContext *ctx, GError **error) {
    (void)provider;
    char *models = engine_paths_easyocr_models_dir();
    g_mkdir_with_parents(models, 0755);
    g_free(models);
    return engine_ensure_python_module("easyocr", ctx, error);
}

static gboolean easyocr_recognize(OcrProvider *provider, PIX *image, OcrResult *result, GError **error) {
    (void)provider;
    char *script = engine_paths_script("easyocr_ocr.py");
    if (!g_file_test(script, G_FILE_TEST_IS_REGULAR)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_NOENT, "Script not found: %s", script);
        g_free(script);
        return FALSE;
    }

    char *models = engine_paths_easyocr_models_dir();
    const char *extra[] = { models, NULL };
    gboolean ok = python_runner_recognize(script, extra, image, result, error);
    g_free(models);
    g_free(script);
    return ok;
}

static void easyocr_destroy(OcrProvider *provider) {
    g_free(provider);
}

OcrProvider *easyocr_provider_create(void) {
    EasyOcrProvider *ep = g_new0(EasyOcrProvider, 1);
    ep->base.vtable = (OcrProviderVTable){
        .id = OCR_PROVIDER_EASYOCR,
        .display_name = "EasyOCR (한·영)",
        .description = "한국어(ko)+영어(en) · 모델 ~100MB 자동 다운로드",
        .is_installed = easyocr_is_installed,
        .ensure_installed = easyocr_ensure_installed,
        .recognize = easyocr_recognize,
        .destroy = easyocr_destroy
    };
    return &ep->base;
}
