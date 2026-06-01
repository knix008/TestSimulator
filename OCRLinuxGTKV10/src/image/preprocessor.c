#include "image/preprocessor.h"
#include "ocr/ocr_provider_ids.h"
#include <math.h>

static const int MIN_DIM = 500;
static const int MAX_DIM = 4000;
static const int DOC_MIN_DIM = 960;
static const int DOC_MAX_DIM = 4800;
static const int TESS_MIN_DIM = 1200;

gboolean preprocessor_uses_document_preprocess(const char *provider_id) {
    return provider_id &&
        g_strcmp0(provider_id, OCR_PROVIDER_TESSERACT) == 0;
}

/* 신경망 기반 엔진 (ONNX/EasyOCR):
 * 이진화 없이 대비 정규화만 적용. */
static gboolean is_neural_provider(const char *provider_id) {
    if (!provider_id) return FALSE;
    return g_strcmp0(provider_id, OCR_PROVIDER_RAPIDOCR)    == 0
        || g_strcmp0(provider_id, OCR_PROVIDER_PADDLE_ONNX) == 0
        || g_strcmp0(provider_id, OCR_PROVIDER_EASYOCR)     == 0;
}

void preprocess_output_free(PreprocessOutput *output) {
    if (!output) return;
    if (output->image)
        pixDestroy(&output->image);
    g_free(output);
}

static PIX *to_gray(PIX *src) {
    if (pixGetDepth(src) == 8 && pixGetColormap(src) == NULL)
        return pixClone(src);
    return pixConvertRGBToGray(src, 0.0f, 0.0f, 0.0f);
}

static PIX *to_rgb(PIX *src) {
    if (pixGetDepth(src) == 32)
        return pixClone(src);
    PIX *rgb = pixConvertTo32(src);
    return rgb ? rgb : pixClone(src);
}

static PIX *ensure_size(PIX *gray, int min_dim, int max_dim) {
    int w = pixGetWidth(gray);
    int h = pixGetHeight(gray);
    int max_side = MAX(w, h);
    int min_side = MIN(w, h);
    float scale = 1.0f;

    if (max_side > max_dim)
        scale = (float)max_dim / max_side;
    else if (min_side < min_dim)
        scale = (float)min_dim / min_side;

    if (fabsf(scale - 1.0f) < 0.001f)
        return pixClone(gray);

    return pixScale(gray, scale, scale);
}

static void normalize_polarity(PIX *gray) {
    l_float32 mean = 0.0f;
    if (pixGetAverageMasked(gray, NULL, 0, 0, 1, 1, &mean) == 0 && mean < 110.0f)
        pixInvert(gray, gray);
}

static PIX *enhance_gray(PIX *gray) {
    int w = pixGetWidth(gray), h = pixGetHeight(gray);
    /* sx, sy: 타일 픽셀 크기 (≥5 필수). 이미지를 ~16분할하되 최소 5 보장 */
    int sx = MAX(5, w / 16);
    int sy = MAX(5, h / 16);
    /* smoothx, smoothy: 타일 수 기준 스무딩 폭 (타일 수의 절반 미만이어야 함) */
    int ntx = MAX(1, w / sx);
    int nty = MAX(1, h / sy);
    int sm = MAX(1, MIN(3, MIN(ntx, nty) / 4));
    PIX *contrast = pixContrastNorm(NULL, gray, sx, sy, 50, sm, sm);
    if (!contrast) contrast = pixClone(gray);
    return contrast;
}

static float deskew_pix(PIX **gray) {
    l_float32 angle, conf;
    PIX *deskewed = pixDeskewGeneral(*gray, 2, 7.0f, 1.0f, 0, 10, &angle, &conf);
    if (deskewed) {
        pixDestroy(gray);
        *gray = deskewed;
        return angle;
    }
    return 0.0f;
}

static PreprocessOutput *make_output(PIX *rgb, int orig_w, int orig_h, float deskew) {
    PreprocessOutput *out = g_new0(PreprocessOutput, 1);
    out->image = rgb;
    out->transform = ocr_box_transform_from_sizes(
        pixGetWidth(rgb), pixGetHeight(rgb), orig_w, orig_h, deskew);
    return out;
}

static PreprocessOutput *process_document(PIX *input, const char *provider_id) {
    int orig_w = pixGetWidth(input);
    int orig_h = pixGetHeight(input);
    int min_dim = (provider_id && g_strcmp0(provider_id, OCR_PROVIDER_TESSERACT) == 0)
        ? TESS_MIN_DIM : DOC_MIN_DIM;

    PIX *gray = to_gray(input);
    PIX *scaled = ensure_size(gray, min_dim, DOC_MAX_DIM);
    pixDestroy(&gray);
    normalize_polarity(scaled);

    PIX *enhanced = enhance_gray(scaled);
    pixDestroy(&scaled);
    float angle = deskew_pix(&enhanced);

    PIX *rgb = to_rgb(enhanced);
    pixDestroy(&enhanced);
    return make_output(rgb, orig_w, orig_h, angle);
}

static PreprocessOutput *process_binary(PIX *input, int min_dim, int max_dim) {
    int orig_w = pixGetWidth(input);
    int orig_h = pixGetHeight(input);

    PIX *gray = to_gray(input);
    PIX *scaled = ensure_size(gray, min_dim, max_dim);
    pixDestroy(&gray);
    normalize_polarity(scaled);

    PIX *enhanced = enhance_gray(scaled);
    pixDestroy(&scaled);

    PIX *binary = NULL;
    pixOtsuAdaptiveThreshold(enhanced, 2000, 2000, 0, 0, 0.0f, NULL, &binary);
    if (!binary)
        binary = pixThresholdToBinary(enhanced, 128);
    pixDestroy(&enhanced);

    float angle = deskew_pix(&binary);
    PIX *rgb = to_rgb(binary);
    pixDestroy(&binary);
    return make_output(rgb, orig_w, orig_h, angle);
}

static PreprocessOutput *process_soft(PIX *input) {
    int orig_w = pixGetWidth(input);
    int orig_h = pixGetHeight(input);

    PIX *gray = to_gray(input);
    PIX *scaled = ensure_size(gray, DOC_MIN_DIM, DOC_MAX_DIM);
    pixDestroy(&gray);
    normalize_polarity(scaled);

    PIX *enhanced = enhance_gray(scaled);
    pixDestroy(&scaled);
    float angle = deskew_pix(&enhanced);

    PIX *rgb = to_rgb(enhanced);
    pixDestroy(&enhanced);
    return make_output(rgb, orig_w, orig_h, angle);
}

static PreprocessOutput *process_none(PIX *input) {
    int orig_w = pixGetWidth(input);
    int orig_h = pixGetHeight(input);
    PIX *gray = to_gray(input);
    PIX *scaled = ensure_size(gray, MIN_DIM, MAX_DIM);
    pixDestroy(&gray);
    PIX *rgb = to_rgb(scaled);
    pixDestroy(&scaled);
    return make_output(rgb, orig_w, orig_h, 0.0f);
}

PreprocessOutput *preprocessor_process(
    PIX *input,
    PreprocessMode mode,
    const char *provider_id,
    GError **error) {
    (void)error;
    if (!input) return NULL;

    switch (mode) {
    case PREPROCESS_MODE_NONE:
        return process_none(input);
    case PREPROCESS_MODE_HANDWRITING:
        return process_soft(input);
    case PREPROCESS_MODE_AUTO:
    default:
        if (preprocessor_uses_document_preprocess(provider_id))
            return process_document(input, provider_id);
        if (is_neural_provider(provider_id))
            return process_document(input, provider_id);  /* 이진화 없이 */
        return process_binary(input, MIN_DIM, MAX_DIM);
    }
}

PreprocessOutput **preprocessor_process_passes(
    PIX *input,
    PreprocessMode mode,
    const char *provider_id,
    gsize *pass_count_out,
    GError **error) {
    (void)error;
    *pass_count_out = 0;
    if (!input) return NULL;

    if (mode == PREPROCESS_MODE_HANDWRITING) {
        PreprocessOutput **passes = g_new0(PreprocessOutput *, 3);
        passes[0] = process_soft(input);
        passes[1] = process_binary(input, DOC_MIN_DIM, DOC_MAX_DIM);
        passes[2] = process_none(input);
        *pass_count_out = 3;
        return passes;
    }

    if (mode == PREPROCESS_MODE_AUTO && preprocessor_uses_document_preprocess(provider_id)) {
        /* Tesseract: document 전처리 + binary 전처리 (2 패스) */
        PreprocessOutput **passes = g_new0(PreprocessOutput *, 2);
        passes[0] = process_document(input, provider_id);
        passes[1] = process_binary(input, DOC_MIN_DIM, DOC_MAX_DIM);
        *pass_count_out = 2;
        return passes;
    }

    if (mode == PREPROCESS_MODE_AUTO && is_neural_provider(provider_id)) {
        /* ONNX/EasyOCR: 이진화 없이 document 전처리 + 원본 리사이즈 (2 패스)
         * 신경망은 그레이스케일/컬러 이미지를 직접 처리하므로 이진화가 오히려 손해 */
        PreprocessOutput **passes = g_new0(PreprocessOutput *, 2);
        passes[0] = process_document(input, provider_id);
        passes[1] = process_none(input);
        *pass_count_out = 2;
        return passes;
    }

    PreprocessOutput **passes = g_new0(PreprocessOutput *, 1);
    passes[0] = preprocessor_process(input, mode, provider_id, error);
    *pass_count_out = 1;
    return passes;
}
