#ifndef RESULT_JSON_H
#define RESULT_JSON_H

#include <glib.h>
#include "ocr/ocr_types.h"

gboolean ocr_result_from_json(const char *json_text, OcrResult *result, GError **error);

#endif
