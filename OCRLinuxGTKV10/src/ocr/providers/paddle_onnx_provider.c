/*
 * PaddleOCR ONNX provider — 전체 파이프라인 (각도 분류기 포함).
 * RapidOCR과 동일한 Korean 모델 사용, CLS 단계를 항상 실행.
 * 회전/뒤집힌 텍스트가 있는 문서에 적합.
 */
#include "ocr/ocr_provider.h"
#include "ocr/ocr_provider_ids.h"
#include "ocr/engine_paths.h"
#include "ocr/engine_download.h"
#include "ocr/rapid_engine.h"

typedef struct {
    OcrProvider base;
    RapidEngine *engine;
} PaddleOnnxProvider;

static gboolean paddle_onnx_models_ready(void) {
    char *dir  = engine_paths_paddle_onnx_dir();
    char *det  = g_build_filename(dir, "det.onnx",        NULL);
    char *rec  = g_build_filename(dir, "rec.onnx",        NULL);
    char *dict = g_build_filename(dir, "korean_dict.txt", NULL);
    gboolean ok = g_file_test(det,  G_FILE_TEST_EXISTS)
               && g_file_test(rec,  G_FILE_TEST_EXISTS)
               && g_file_test(dict, G_FILE_TEST_EXISTS);
    g_free(det); g_free(rec); g_free(dict); g_free(dir);
    return ok;
}

static gboolean paddle_onnx_is_installed(const OcrProvider *provider) {
    (void)provider;
    return paddle_onnx_models_ready();
}

static gboolean paddle_onnx_ensure_installed(OcrProvider *provider, OcrInstallContext *ctx, GError **error) {
    (void)provider;
    if (!paddle_onnx_models_ready())
        return engine_download_paddle_onnx_models(ctx, error);
    return TRUE;
}

static gboolean paddle_onnx_init_engine(PaddleOnnxProvider *pp, GError **error) {
    if (pp->engine) return TRUE;

    char *dir  = engine_paths_paddle_onnx_dir();
    char *det  = g_build_filename(dir, "det.onnx",        NULL);
    char *cls  = g_build_filename(dir, "cls.onnx",        NULL);
    char *rec  = g_build_filename(dir, "rec.onnx",        NULL);
    char *dict = g_build_filename(dir, "korean_dict.txt", NULL);
    g_free(dir);

    /* CLS는 항상 사용 (회전 텍스트 처리) */
    const char *cls_path = g_file_test(cls, G_FILE_TEST_EXISTS) ? cls : NULL;
    pp->engine = rapid_engine_create(det, cls_path, rec, dict, error);
    g_free(det); g_free(cls); g_free(rec); g_free(dict);
    return pp->engine != NULL;
}

static gboolean paddle_onnx_recognize(OcrProvider *provider, PIX *image, OcrResult *result, GError **error) {
    PaddleOnnxProvider *pp = (PaddleOnnxProvider *)provider;
    if (!paddle_onnx_init_engine(pp, error)) return FALSE;
    return rapid_engine_recognize(pp->engine, image, result, error);
}

static void paddle_onnx_destroy(OcrProvider *provider) {
    PaddleOnnxProvider *pp = (PaddleOnnxProvider *)provider;
    if (pp->engine) rapid_engine_destroy(pp->engine);
    g_free(pp);
}

OcrProvider *paddle_onnx_provider_create(void) {
    PaddleOnnxProvider *pp = g_new0(PaddleOnnxProvider, 1);
    pp->base.vtable = (OcrProviderVTable){
        .id           = OCR_PROVIDER_PADDLE_ONNX,
        .display_name = "PaddleOCR ONNX (한·영)",
        .description  = "PP-OCRv4 det + Korean rec · 각도 보정 포함 · Python 불필요 (자동 다운로드)",
        .is_installed     = paddle_onnx_is_installed,
        .ensure_installed = paddle_onnx_ensure_installed,
        .recognize    = paddle_onnx_recognize,
        .destroy      = paddle_onnx_destroy,
    };
    return &pp->base;
}
