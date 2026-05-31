#ifndef PREPROCESSOR_H
#define PREPROCESSOR_H

#include <glib.h>
#include <leptonica/allheaders.h>
#include "ocr/ocr_box_transform.h"

typedef enum {
    PREPROCESS_MODE_AUTO = 0,
    PREPROCESS_MODE_HANDWRITING = 1,
    PREPROCESS_MODE_NONE = 2
} PreprocessMode;

typedef struct {
    PIX *image;
    OcrBoxTransform transform;
} PreprocessOutput;

void preprocess_output_free(PreprocessOutput *output);

PreprocessOutput *preprocessor_process(
    PIX *input,
    PreprocessMode mode,
    const char *provider_id,
    GError **error);

PreprocessOutput **preprocessor_process_passes(
    PIX *input,
    PreprocessMode mode,
    const char *provider_id,
    gsize *pass_count_out,
    GError **error);

gboolean preprocessor_uses_document_preprocess(const char *provider_id);

#endif
