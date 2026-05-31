#include "ocr/ocr_result_scorer.h"
#include <string.h>

double ocr_result_score(const OcrResult *result) {
    if (!result || !result->text || !result->text[0])
        return 0.0;

    const char *text = result->text;
    int hangul = 0, jamo = 0, letters = 0, junk = 0;

    for (const char *p = text; *p;) {
        gunichar c = g_utf8_get_char(p);
        if (c >= 0xAC00 && c <= 0xD7A3) hangul++;
        else if (c >= 0x1100 && c <= 0x11FF) jamo++;
        else if (g_unichar_isalnum(c) || g_unichar_ispunct(c) || g_unichar_isspace(c)) letters++;
        else if (c == '?' || c == 0x25A1 || c == 0xFFFD) junk++;
        p = g_utf8_next_char(p);
    }

    int word_bonus = 0;
    for (size_t i = 0; i < result->line_count; i++)
        word_bonus += (int)result->lines[i].word_count;

    return hangul * 4.0 + jamo * 2.0 + letters
        + (int)result->line_count * 2
        + word_bonus * 0.5
        + (int)strlen(text) * 0.15
        - junk * 8.0;
}

void ocr_result_pick_best(const OcrResult *candidates, gsize count, OcrResult *best_out) {
    ocr_result_clear(best_out);
    if (!candidates || count == 0) return;

    gsize best_idx = 0;
    double best_score = ocr_result_score(&candidates[0]);
    for (gsize i = 1; i < count; i++) {
        double score = ocr_result_score(&candidates[i]);
        if (score > best_score) {
            best_score = score;
            best_idx = i;
        }
    }
    ocr_result_copy(best_out, &candidates[best_idx]);
}
