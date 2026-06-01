#include "ocr/ocr_provider.h"
#include "ocr/ocr_provider_ids.h"
#include "ocr/engine_paths.h"
#include "ocr/engine_download.h"
#include "ocr/rapid_engine.h"

typedef struct {
    OcrProvider base;
    RapidEngine *engine;
} RapidProvider;

static gboolean rapid_models_ready(void) {
    char *dir  = engine_paths_rapidocr_dir();
    char *det  = g_build_filename(dir, "det.onnx",  NULL);
    char *rec  = g_build_filename(dir, "rec.onnx",  NULL);
    char *dict = g_build_filename(dir, "korean_dict.txt", NULL);
    gboolean ok = g_file_test(det,  G_FILE_TEST_EXISTS)
               && g_file_test(rec,  G_FILE_TEST_EXISTS)
               && g_file_test(dict, G_FILE_TEST_EXISTS);
    g_free(det); g_free(rec); g_free(dict); g_free(dir);
    return ok;
}

static gboolean rapid_is_installed(const OcrProvider *provider) {
    (void)provider;
    return rapid_models_ready();
}

static gboolean rapid_ensure_installed(OcrProvider *provider, OcrInstallContext *ctx, GError **error) {
    (void)provider;
    if (!rapid_models_ready())
        return engine_download_rapidocr_models(ctx, error);
    return TRUE;
}

static gboolean rapid_init_engine(RapidProvider *rp, GError **error) {
    if (rp->engine) return TRUE;

    char *dir  = engine_paths_rapidocr_dir();
    char *det  = g_build_filename(dir, "det.onnx",  NULL);
    char *cls  = g_build_filename(dir, "cls.onnx",  NULL);
    char *rec  = g_build_filename(dir, "rec.onnx",  NULL);
    char *dict = g_build_filename(dir, "korean_dict.txt", NULL);
    g_free(dir);

    /* cls is optional — pass NULL if not present */
    const char *cls_path = g_file_test(cls, G_FILE_TEST_EXISTS) ? cls : NULL;

    rp->engine = rapid_engine_create(det, cls_path, rec, dict, error);
    g_free(det); g_free(cls); g_free(rec); g_free(dict);
    return rp->engine != NULL;
}

static gboolean rapid_recognize(OcrProvider *provider, PIX *image, OcrResult *result, GError **error) {
    RapidProvider *rp = (RapidProvider *)provider;
    if (!rapid_init_engine(rp, error)) return FALSE;
    return rapid_engine_recognize(rp->engine, image, result, error);
}

static void rapid_destroy(OcrProvider *provider) {
    RapidProvider *rp = (RapidProvider *)provider;
    if (rp->engine) rapid_engine_destroy(rp->engine);
    g_free(rp);
}

OcrProvider *rapid_provider_create(void) {
    RapidProvider *rp = g_new0(RapidProvider, 1);
    rp->base.vtable = (OcrProviderVTable){
        .id           = OCR_PROVIDER_RAPIDOCR,
        .display_name = "RapidOCR (한·영, 권장)",
        .description  = "PP-OCRv4 ONNX · OpenCV DNN · Python 불필요 (자동 다운로드)",
        .is_installed   = rapid_is_installed,
        .ensure_installed = rapid_ensure_installed,
        .recognize    = rapid_recognize,
        .destroy      = rapid_destroy,
    };
    return &rp->base;
}
