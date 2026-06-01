#ifndef RAPID_ENGINE_H
#define RAPID_ENGINE_H

#include <glib.h>
#include <leptonica/allheaders.h>
#include "ocr/ocr_types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct RapidEngine RapidEngine;

/* cls_model may be NULL to skip angle classification */
RapidEngine *rapid_engine_create(
    const char *det_model,
    const char *cls_model,
    const char *rec_model,
    const char *dict_file,
    GError **error);

void rapid_engine_destroy(RapidEngine *engine);

gboolean rapid_engine_recognize(
    RapidEngine *engine,
    PIX *image,
    OcrResult *result,
    GError **error);

#ifdef __cplusplus
}
#endif

#endif
