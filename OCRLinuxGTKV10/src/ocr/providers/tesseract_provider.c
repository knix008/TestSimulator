#include "ocr/ocr_provider.h"
#include "ocr/ocr_provider_ids.h"
#include "ocr/engine_paths.h"
#include "ocr/engine_download.h"
#include <tesseract/capi.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    OcrProvider base;
    TessBaseAPI *engine;
} TesseractProvider;

static gboolean tesseract_is_installed(const OcrProvider *provider) {
    (void)provider;
    char *tessdir = engine_paths_tessdata_dir();
    char *kor = g_build_filename(tessdir, "kor.traineddata", NULL);
    gboolean ok = g_file_test(kor, G_FILE_TEST_EXISTS);
    g_free(kor);
    g_free(tessdir);
    return ok;
}

static gboolean tesseract_init_engine(TesseractProvider *tp, GError **error) {
    if (tp->engine) return TRUE;

    char *tessdir = engine_paths_tessdata_dir();
    tp->engine = TessBaseAPICreate();
    if (TessBaseAPIInit3(tp->engine, tessdir, "kor+eng") != 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Tesseract init failed (tessdata: %s)", tessdir);
        TessBaseAPIDelete(tp->engine);
        tp->engine = NULL;
        g_free(tessdir);
        return FALSE;
    }
    TessBaseAPISetVariable(tp->engine, "user_defined_dpi", "300");
    TessBaseAPISetVariable(tp->engine, "preserve_interword_spaces", "1");
    g_free(tessdir);
    return TRUE;
}

static gboolean tesseract_ensure_installed(OcrProvider *provider, OcrInstallContext *ctx, GError **error) {
    TesseractProvider *tp = (TesseractProvider *)provider;
    if (!tesseract_is_installed(provider)) {
        if (!engine_download_tessdata(ctx, error))
            return FALSE;
    }
    return tesseract_init_engine(tp, error);
}

static void tesseract_add_word(GPtrArray *words, const char *text, OcrRect bounds) {
    OcrWord w;
    w.text = g_strdup(text);
    w.bounds = bounds;
    g_ptr_array_add(words, g_memdup2(&w, sizeof(w)));
}

static gboolean tesseract_recognize(OcrProvider *provider, PIX *image, OcrResult *result, GError **error) {
    TesseractProvider *tp = (TesseractProvider *)provider;
    if (!tesseract_init_engine(tp, error))
        return FALSE;

    ocr_result_clear(result);
    TessBaseAPISetImage2(tp->engine, image);

    char *utf8 = TessBaseAPIGetUTF8Text(tp->engine);
    if (utf8) {
        result->text = g_strdup(utf8);
        TessDeleteText(utf8);
    } else {
        result->text = g_strdup("");
    }

    GPtrArray *line_list = g_ptr_array_new();
    GPtrArray *current_words = g_ptr_array_new();
    float line_y = -1.0f;
    const float line_merge = 12.0f;

    TessResultIterator *iter = TessBaseAPIGetIterator(tp->engine);
    if (iter) {
        do {
            char *word = TessResultIteratorGetUTF8Text(iter, RIL_WORD);
            if (!word || !*word) {
                if (word) TessDeleteText(word);
                continue;
            }

            int x1, y1, x2, y2;
            if (!TessPageIteratorBoundingBox(TessResultIteratorGetPageIterator(iter), RIL_WORD, &x1, &y1, &x2, &y2)) {
                TessDeleteText(word);
                continue;
            }

            OcrRect bounds = {
                .x = (float)x1,
                .y = (float)y1,
                .w = (float)(x2 - x1),
                .h = (float)(y2 - y1)
            };
            float center_y = bounds.y + bounds.h / 2.0f;

            if (line_y < 0 || fabsf(center_y - line_y) > line_merge) {
                if (current_words->len > 0) {
                    g_ptr_array_add(line_list, current_words);
                    current_words = g_ptr_array_new();
                }
                line_y = center_y;
            }

            tesseract_add_word(current_words, word, bounds);
            TessDeleteText(word);
        } while (TessPageIteratorNext(TessResultIteratorGetPageIterator(iter), RIL_WORD));

        if (current_words->len > 0) {
            g_ptr_array_add(line_list, current_words);
            current_words = NULL;
        }

        TessResultIteratorDelete(iter);
    } else {
        g_ptr_array_unref(current_words);
        current_words = NULL;
    }

    result->line_count = line_list->len;
    result->lines = g_new0(OcrLine, result->line_count);

    for (guint i = 0; i < line_list->len; i++) {
        GPtrArray *words = g_ptr_array_index(line_list, i);
        GString *line_text = g_string_new(NULL);
        OcrLine *line = &result->lines[i];
        line->word_count = words->len;
        line->words = g_new0(OcrWord, line->word_count);

        for (guint j = 0; j < words->len; j++) {
            OcrWord *src = g_ptr_array_index(words, j);
            line->words[j].text = g_strdup(src->text);
            line->words[j].bounds = src->bounds;
            if (line_text->len > 0) g_string_append_c(line_text, ' ');
            g_string_append(line_text, src->text);
            g_free(src->text);
            g_free(src);
        }
        line->text = g_string_free(line_text, FALSE);
        g_ptr_array_unref(words);
    }

    if (current_words)
        g_ptr_array_unref(current_words);
    g_ptr_array_unref(line_list);

    if (result->line_count == 0 && result->text && result->text[0]) {
        result->line_count = 1;
        result->lines = g_new0(OcrLine, 1);
        result->lines[0].text = g_strdup(result->text);
    }

    return TRUE;
}

static void tesseract_destroy(OcrProvider *provider) {
    TesseractProvider *tp = (TesseractProvider *)provider;
    if (tp->engine) {
        TessBaseAPIDelete(tp->engine);
        tp->engine = NULL;
    }
    g_free(tp);
}

OcrProvider *tesseract_provider_create(void) {
    TesseractProvider *tp = g_new0(TesseractProvider, 1);
    tp->base.vtable = (OcrProviderVTable){
        .id = OCR_PROVIDER_TESSERACT,
        .display_name = "Tesseract (한·영)",
        .description = "tessdata_best kor+eng · LSTM (자동 다운로드)",
        .is_installed = tesseract_is_installed,
        .ensure_installed = tesseract_ensure_installed,
        .recognize = tesseract_recognize,
        .destroy = tesseract_destroy
    };
    return &tp->base;
}
