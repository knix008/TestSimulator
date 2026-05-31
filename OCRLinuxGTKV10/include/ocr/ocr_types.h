#ifndef OCR_TYPES_H
#define OCR_TYPES_H

#include <stddef.h>

typedef struct {
    float x;
    float y;
    float w;
    float h;
} OcrRect;

typedef struct {
    char *text;
    OcrRect bounds;
} OcrWord;

typedef struct {
    char *text;
    OcrWord *words;
    size_t word_count;
} OcrLine;

typedef struct {
    char *text;
    OcrLine *lines;
    size_t line_count;
} OcrResult;

void ocr_result_clear(OcrResult *result);
void ocr_result_copy(OcrResult *dst, const OcrResult *src);

#endif
