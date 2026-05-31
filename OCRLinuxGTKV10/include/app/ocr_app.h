#ifndef OCR_APP_H
#define OCR_APP_H

#include <glib.h>
#include <leptonica/allheaders.h>
#include "image/preprocessor.h"
#include "ocr/ocr_types.h"
#include "ocr/engine_install.h"
#include "util/app_settings.h"

typedef struct OcrApp OcrApp;

typedef struct {
    const char *id;
    const char *display_name;
    gboolean installed;
} OcrAppEngineInfo;

OcrApp *ocr_app_new(void);
void ocr_app_free(OcrApp *app);

AppSettings *ocr_app_get_settings(OcrApp *app);
gboolean ocr_app_save_settings(OcrApp *app, GError **error);

gsize ocr_app_engine_count(const OcrApp *app);
gboolean ocr_app_get_engine_info(const OcrApp *app, gsize index, OcrAppEngineInfo *info);
const char *ocr_app_get_active_engine_id(const OcrApp *app);
gboolean ocr_app_select_engine(OcrApp *app, const char *provider_id);

PreprocessMode ocr_app_get_preprocess_mode(const OcrApp *app);
void ocr_app_set_preprocess_mode(OcrApp *app, PreprocessMode mode);

gboolean ocr_app_open_path(OcrApp *app, const char *path, GError **error);
gboolean ocr_app_has_image(const OcrApp *app);
const char *ocr_app_get_file_path(const OcrApp *app);
PIX *ocr_app_get_image_copy(const OcrApp *app);

gsize ocr_app_page_count(const OcrApp *app);
int ocr_app_get_current_page(const OcrApp *app);
gboolean ocr_app_set_current_page(OcrApp *app, int page);
gboolean ocr_app_has_prev_page(const OcrApp *app);
gboolean ocr_app_has_next_page(const OcrApp *app);
void ocr_app_prev_page(OcrApp *app);
void ocr_app_next_page(OcrApp *app);

const OcrResult *ocr_app_get_result(const OcrApp *app);
gboolean ocr_app_has_result_text(const OcrApp *app);
void ocr_app_clear_result(OcrApp *app);

gboolean ocr_app_prepare_engine(OcrApp *app, GError **error);
gboolean ocr_app_prepare_engine_ex(OcrApp *app, OcrInstallContext *ctx, GError **error);
gboolean ocr_app_engine_needs_install(const OcrApp *app);
const char *ocr_app_active_engine_display_name(const OcrApp *app);
const char *ocr_app_active_engine_description(const OcrApp *app);

typedef void (*OcrProgressReportFn)(gpointer user_data, const char *message, int percent);

typedef struct {
    OcrProgressReportFn report;
    gpointer user_data;
} OcrProgressContext;

gboolean ocr_app_run_ocr(OcrApp *app, GError **error);
gboolean ocr_app_run_ocr_ex(OcrApp *app, OcrProgressContext *ctx, GError **error);

PIX *ocr_app_render_boxes_image(const OcrApp *app);
char *ocr_app_get_result_base_name(const OcrApp *app);

#endif
