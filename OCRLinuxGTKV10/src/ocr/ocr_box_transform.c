#include "ocr/ocr_box_transform.h"
#include <math.h>

OcrBoxTransform ocr_box_transform_identity(int width, int height) {
    return ocr_box_transform_from_sizes(width, height, width, height, 0.0f);
}

OcrBoxTransform ocr_box_transform_from_sizes(
    int ocr_w, int ocr_h, int orig_w, int orig_h, float deskew_degrees) {
    OcrBoxTransform t = {
        .ocr_width = ocr_w,
        .ocr_height = ocr_h,
        .original_width = orig_w,
        .original_height = orig_h,
        .deskew_degrees = deskew_degrees
    };
    return t;
}

static float clampf(float v, float lo, float hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static void map_point(OcrBoxTransform t, float x, float y, float *ox, float *oy) {
    float scale_x = t.ocr_width > 0 ? (float)t.original_width / t.ocr_width : 1.0f;
    float scale_y = t.ocr_height > 0 ? (float)t.original_height / t.ocr_height : 1.0f;

    if (fabsf(t.deskew_degrees) < 0.01f) {
        *ox = x * scale_x;
        *oy = y * scale_y;
        return;
    }

    float cx = t.ocr_width / 2.0f;
    float cy = t.ocr_height / 2.0f;
    float rad = -t.deskew_degrees * (float)M_PI / 180.0f;
    float cos_a = cosf(rad);
    float sin_a = sinf(rad);
    float dx = x - cx;
    float dy = y - cy;
    float ux = cx + dx * cos_a - dy * sin_a;
    float uy = cy + dx * sin_a + dy * cos_a;
    *ox = ux * scale_x;
    *oy = uy * scale_y;
}

OcrRect ocr_box_transform_map_rect(OcrBoxTransform t, OcrRect rect) {
    float corners_x[4], corners_y[4];
    map_point(t, rect.x, rect.y, &corners_x[0], &corners_y[0]);
    map_point(t, rect.x + rect.w, rect.y, &corners_x[1], &corners_y[1]);
    map_point(t, rect.x + rect.w, rect.y + rect.h, &corners_x[2], &corners_y[2]);
    map_point(t, rect.x, rect.y + rect.h, &corners_x[3], &corners_y[3]);

    float min_x = corners_x[0], max_x = corners_x[0];
    float min_y = corners_y[0], max_y = corners_y[0];
    for (int i = 1; i < 4; i++) {
        if (corners_x[i] < min_x) min_x = corners_x[i];
        if (corners_x[i] > max_x) max_x = corners_x[i];
        if (corners_y[i] < min_y) min_y = corners_y[i];
        if (corners_y[i] > max_y) max_y = corners_y[i];
    }

    min_x = clampf(min_x, 0, (float)t.original_width);
    min_y = clampf(min_y, 0, (float)t.original_height);
    max_x = clampf(max_x, 0, (float)t.original_width);
    max_y = clampf(max_y, 0, (float)t.original_height);

    OcrRect out = {
        .x = min_x,
        .y = min_y,
        .w = max_x - min_x,
        .h = max_y - min_y
    };
    return out;
}

void ocr_result_map_to_original(OcrResult *result, OcrBoxTransform transform) {
    if (!result) return;
    for (size_t i = 0; i < result->line_count; i++) {
        OcrLine *line = &result->lines[i];
        for (size_t j = 0; j < line->word_count; j++)
            line->words[j].bounds = ocr_box_transform_map_rect(transform, line->words[j].bounds);
    }
}
