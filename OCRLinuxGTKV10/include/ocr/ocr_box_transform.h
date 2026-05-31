#ifndef OCR_BOX_TRANSFORM_H
#define OCR_BOX_TRANSFORM_H

#include "ocr/ocr_types.h"

typedef struct {
    int ocr_width;
    int ocr_height;
    int original_width;
    int original_height;
    float deskew_degrees;
} OcrBoxTransform;

OcrBoxTransform ocr_box_transform_identity(int width, int height);
OcrBoxTransform ocr_box_transform_from_sizes(
    int ocr_w, int ocr_h, int orig_w, int orig_h, float deskew_degrees);

OcrRect ocr_box_transform_map_rect(OcrBoxTransform t, OcrRect rect);
void ocr_result_map_to_original(OcrResult *result, OcrBoxTransform transform);

#endif
