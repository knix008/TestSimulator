#include "ocr/ocr_types.h"
#include <stdlib.h>
#include <string.h>

static char *dup_str(const char *s) {
    if (!s) return NULL;
    return strdup(s);
}

void ocr_result_clear(OcrResult *result) {
    if (!result) return;
    free(result->text);
    result->text = NULL;
    for (size_t i = 0; i < result->line_count; i++) {
        free(result->lines[i].text);
        for (size_t j = 0; j < result->lines[i].word_count; j++)
            free(result->lines[i].words[j].text);
        free(result->lines[i].words);
    }
    free(result->lines);
    result->lines = NULL;
    result->line_count = 0;
}

void ocr_result_copy(OcrResult *dst, const OcrResult *src) {
    ocr_result_clear(dst);
    if (!src) return;

    dst->text = dup_str(src->text);
    dst->line_count = src->line_count;
    if (src->line_count == 0) return;

    dst->lines = calloc(src->line_count, sizeof(OcrLine));
    for (size_t i = 0; i < src->line_count; i++) {
        const OcrLine *sl = &src->lines[i];
        OcrLine *dl = &dst->lines[i];
        dl->text = dup_str(sl->text);
        dl->word_count = sl->word_count;
        if (sl->word_count == 0) continue;
        dl->words = calloc(sl->word_count, sizeof(OcrWord));
        for (size_t j = 0; j < sl->word_count; j++) {
            dl->words[j].text = dup_str(sl->words[j].text);
            dl->words[j].bounds = sl->words[j].bounds;
        }
    }
}
