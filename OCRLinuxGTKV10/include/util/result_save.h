#ifndef RESULT_SAVE_H
#define RESULT_SAVE_H

#include <glib.h>
#include <leptonica/allheaders.h>
#include "ocr/ocr_types.h"

gboolean result_save_text_file(const char *path, const char *text, GError **error);
gboolean result_save_pix_file(const char *path, PIX *pix, GError **error);

PIX *result_save_render_boxes(PIX *source, const OcrResult *result);

char *result_save_boxes_extension(const char *source_path);
char *result_save_build_boxes_filename(const char *base_name, const char *source_path);

#endif
