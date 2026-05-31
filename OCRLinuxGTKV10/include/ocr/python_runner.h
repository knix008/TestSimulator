#ifndef PYTHON_RUNNER_H
#define PYTHON_RUNNER_H

#include <glib.h>
#include <leptonica/allheaders.h>
#include "ocr/ocr_types.h"

gboolean python_runner_recognize(
    const char *script_path,
    const char *const *extra_args,
    PIX *image,
    OcrResult *result,
    GError **error);

#endif
