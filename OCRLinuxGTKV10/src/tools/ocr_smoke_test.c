#include "app/ocr_app.h"
#include "ocr/ocr_provider_ids.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int run_engine(OcrApp *app, const char *engine_id, const char *image_path) {
    GError *error = NULL;

    if (!ocr_app_select_engine(app, engine_id)) {
        printf("  [FAIL] %s — 엔진 선택 실패\n", engine_id);
        return 1;
    }

    if (!ocr_app_prepare_engine(app, &error)) {
        printf("  [SKIP] %s — 준비 실패: %s\n", engine_id, error ? error->message : "?");
        g_clear_error(&error);
        return 2;
    }

    ocr_app_set_preprocess_mode(app, PREPROCESS_MODE_NONE);

    if (!ocr_app_open_path(app, image_path, &error)) {
        printf("  [FAIL] %s — 파일 열기: %s\n", engine_id, error ? error->message : "?");
        g_clear_error(&error);
        return 1;
    }

    if (!ocr_app_run_ocr(app, &error)) {
        printf("  [FAIL] %s — OCR: %s\n", engine_id, error ? error->message : "?");
        g_clear_error(&error);
        return 1;
    }

    const OcrResult *r = ocr_app_get_result(app);
    if (!r || !r->text || !r->text[0]) {
        printf("  [FAIL] %s — 빈 결과\n", engine_id);
        return 1;
    }

    char preview[128];
    g_strlcpy(preview, r->text, sizeof(preview));
    for (char *p = preview; *p; p++) {
        if (*p == '\n' || *p == '\r') *p = ' ';
    }
    printf("  [OK]   %s — \"%s\"\n", engine_id, preview);
    return 0;
}

int main(int argc, char *argv[]) {
    const char *image = argc > 1 ? argv[1] : "scripts/test_sample.png";

    if (!g_file_test(image, G_FILE_TEST_EXISTS)) {
        fprintf(stderr, "Test image not found: %s\n", image);
        return 1;
    }

    printf("OCR engine smoke test\n");
    printf("Image: %s\n\n", image);

    OcrApp *app = ocr_app_new();
    const char *engines[] = {
        OCR_PROVIDER_PADDLE,
        OCR_PROVIDER_EASYOCR,
        OCR_PROVIDER_TESSERACT,
        NULL
    };

    int failed = 0, skipped = 0;
    for (int i = 0; engines[i]; i++) {
        int rc = run_engine(app, engines[i], image);
        if (rc == 1) failed++;
        else if (rc == 2) skipped++;
    }

    ocr_app_free(app);

    printf("\nSummary: ");
    if (failed == 0 && skipped == 0)
        printf("all engines OK\n");
    else
        printf("%d failed, %d skipped\n", failed, skipped);

    return failed > 0 ? 1 : 0;
}
