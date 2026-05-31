#ifndef OCR_RESULT_SCORER_H
#define OCR_RESULT_SCORER_H

#include <glib.h>
#include "ocr/ocr_types.h"

double ocr_result_score(const OcrResult *result);
void ocr_result_pick_best(const OcrResult *candidates, gsize count, OcrResult *best_out);

#endif
