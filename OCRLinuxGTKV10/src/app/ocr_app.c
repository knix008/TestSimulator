#include "app/ocr_app.h"
#include "image/image_loader.h"
#include "image/pdf_renderer.h"
#include "ocr/ocr_box_transform.h"
#include "ocr/ocr_result_scorer.h"
#include "ocr/ocr_service.h"
#include "ocr/ocr_text_postprocessor.h"
#include "util/result_save.h"
#include <string.h>

typedef struct {
    PIX **pages;
    gsize page_count;
    int current_page;
    char *source_path;
    gboolean is_pdf;
} AppDocument;

struct OcrApp {
    OcrService *service;
    AppDocument document;
    OcrResult result;
    AppSettings settings;
    PreprocessMode preprocess_mode;
};

static void document_clear(AppDocument *doc) {
    if (!doc) return;
    for (gsize i = 0; i < doc->page_count; i++) {
        if (doc->pages[i])
            pixDestroy(&doc->pages[i]);
    }
    g_free(doc->pages);
    g_free(doc->source_path);
    memset(doc, 0, sizeof(*doc));
}

static PIX *document_current_pix(const AppDocument *doc) {
    if (!doc || doc->page_count == 0 || doc->current_page < 0
        || (gsize)doc->current_page >= doc->page_count)
        return NULL;
    return doc->pages[doc->current_page];
}

static void remember_directory(OcrApp *app, const char *path) {
    char *dir = g_path_get_dirname(path);
    g_free(app->settings.last_directory);
    app->settings.last_directory = dir;
}

OcrApp *ocr_app_new(void) {
    OcrApp *app = g_new0(OcrApp, 1);
    app->service = ocr_service_new();
    app_settings_init_defaults(&app->settings);
    app_settings_load(&app->settings, NULL);
    app->preprocess_mode = (PreprocessMode)app->settings.preprocess_mode;

    const char *provider = app->settings.ocr_provider_id
        ? app->settings.ocr_provider_id
        : ocr_service_get_default_provider_id();
    if (!ocr_service_select_provider(app->service, provider))
        ocr_service_select_provider(app->service, ocr_service_get_default_provider_id());
    return app;
}

void ocr_app_free(OcrApp *app) {
    if (!app) return;
    ocr_app_save_settings(app, NULL);
    document_clear(&app->document);
    ocr_result_clear(&app->result);
    app_settings_clear(&app->settings);
    ocr_service_free(app->service);
    g_free(app);
}

AppSettings *ocr_app_get_settings(OcrApp *app) {
    return app ? &app->settings : NULL;
}

gboolean ocr_app_save_settings(OcrApp *app, GError **error) {
    if (!app) return FALSE;
    app->settings.preprocess_mode = (int)app->preprocess_mode;
    const char *engine = ocr_app_get_active_engine_id(app);
    if (engine) {
        g_free(app->settings.ocr_provider_id);
        app->settings.ocr_provider_id = g_strdup(engine);
    }
    return app_settings_save(&app->settings, error);
}

gsize ocr_app_engine_count(const OcrApp *app) {
    return app ? ocr_service_provider_count(app->service) : 0;
}

gboolean ocr_app_get_engine_info(const OcrApp *app, gsize index, OcrAppEngineInfo *info) {
    if (!app || !info || index >= ocr_app_engine_count(app))
        return FALSE;
    OcrProvider *p = ocr_service_get_provider(app->service, index);
    info->id = ocr_provider_get_id(p);
    info->display_name = ocr_provider_get_display_name(p);
    info->installed = ocr_provider_is_installed(p);
    return TRUE;
}

const char *ocr_app_get_active_engine_id(const OcrApp *app) {
    if (!app) return NULL;
    OcrProvider *p = ocr_service_get_active_provider(app->service);
    return p ? ocr_provider_get_id(p) : NULL;
}

gboolean ocr_app_select_engine(OcrApp *app, const char *provider_id) {
    if (!app || !provider_id) return FALSE;
    return ocr_service_select_provider(app->service, provider_id);
}

PreprocessMode ocr_app_get_preprocess_mode(const OcrApp *app) {
    return app ? app->preprocess_mode : PREPROCESS_MODE_AUTO;
}

void ocr_app_set_preprocess_mode(OcrApp *app, PreprocessMode mode) {
    if (!app) return;
    app->preprocess_mode = mode;
    app->settings.preprocess_mode = (int)mode;
}

gboolean ocr_app_open_path(OcrApp *app, const char *path, GError **error) {
    if (!app || !path) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "Invalid open request");
        return FALSE;
    }
    if (!image_loader_is_supported(path)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "지원하지 않는 파일 형식: %s", path);
        return FALSE;
    }

    document_clear(&app->document);
    ocr_result_clear(&app->result);

    if (image_loader_is_pdf(path)) {
        if (!pdf_renderer_load_pages(path, 200.0, &app->document.pages,
                &app->document.page_count, error))
            return FALSE;
        app->document.is_pdf = TRUE;
    } else {
        PIX *pix = image_loader_load_file(path, error);
        if (!pix) return FALSE;
        app->document.pages = g_new0(PIX *, 1);
        app->document.pages[0] = pix;
        app->document.page_count = 1;
        app->document.is_pdf = FALSE;
    }

    app->document.current_page = 0;
    app->document.source_path = g_strdup(path);
    remember_directory(app, path);
    ocr_app_save_settings(app, NULL);
    return TRUE;
}

gboolean ocr_app_has_image(const OcrApp *app) {
    return document_current_pix(&app->document) != NULL;
}

const char *ocr_app_get_file_path(const OcrApp *app) {
    return app ? app->document.source_path : NULL;
}

PIX *ocr_app_get_image_copy(const OcrApp *app) {
    PIX *pix = document_current_pix(&app->document);
    return pix ? pixCopy(NULL, pix) : NULL;
}

gsize ocr_app_page_count(const OcrApp *app) {
    return app ? app->document.page_count : 0;
}

int ocr_app_get_current_page(const OcrApp *app) {
    return app ? app->document.current_page : 0;
}

gboolean ocr_app_set_current_page(OcrApp *app, int page) {
    if (!app || page < 0 || (gsize)page >= app->document.page_count)
        return FALSE;
    app->document.current_page = page;
    ocr_result_clear(&app->result);
    return TRUE;
}

gboolean ocr_app_has_prev_page(const OcrApp *app) {
    return app && app->document.current_page > 0;
}

gboolean ocr_app_has_next_page(const OcrApp *app) {
    return app && (gsize)(app->document.current_page + 1) < app->document.page_count;
}

void ocr_app_prev_page(OcrApp *app) {
    if (ocr_app_has_prev_page(app))
        ocr_app_set_current_page(app, app->document.current_page - 1);
}

void ocr_app_next_page(OcrApp *app) {
    if (ocr_app_has_next_page(app))
        ocr_app_set_current_page(app, app->document.current_page + 1);
}

const OcrResult *ocr_app_get_result(const OcrApp *app) {
    return app ? &app->result : NULL;
}

gboolean ocr_app_has_result_text(const OcrApp *app) {
    const OcrResult *r = ocr_app_get_result(app);
    return r && r->text && r->text[0];
}

void ocr_app_clear_result(OcrApp *app) {
    if (app) ocr_result_clear(&app->result);
}

gboolean ocr_app_prepare_engine(OcrApp *app, GError **error) {
    return ocr_app_prepare_engine_ex(app, NULL, error);
}

gboolean ocr_app_prepare_engine_ex(OcrApp *app, OcrInstallContext *ctx, GError **error) {
    if (!app) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "App is NULL");
        return FALSE;
    }
    return ocr_service_ensure_ready(app->service, ctx, error);
}

gboolean ocr_app_engine_needs_install(const OcrApp *app) {
    if (!app) return FALSE;
    OcrProvider *provider = ocr_service_get_active_provider(app->service);
    return provider && !ocr_provider_is_installed(provider);
}

const char *ocr_app_active_engine_display_name(const OcrApp *app) {
    if (!app) return "";
    OcrProvider *provider = ocr_service_get_active_provider(app->service);
    return provider ? ocr_provider_get_display_name(provider) : "";
}

const char *ocr_app_active_engine_description(const OcrApp *app) {
    if (!app) return "";
    OcrProvider *provider = ocr_service_get_active_provider(app->service);
    return provider ? ocr_provider_get_description(provider) : "";
}

gboolean ocr_app_run_ocr(OcrApp *app, GError **error) {
    return ocr_app_run_ocr_ex(app, NULL, error);
}

static void ocr_progress_report(OcrProgressContext *ctx, const char *message, int percent) {
    if (ctx && ctx->report)
        ctx->report(ctx->user_data, message, percent);
}

gboolean ocr_app_run_ocr_ex(OcrApp *app, OcrProgressContext *ctx, GError **error) {
    PIX *original = document_current_pix(&app->document);
    if (!app || !original) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "열린 이미지가 없습니다");
        return FALSE;
    }

    ocr_progress_report(ctx, "이미지 전처리 중...", 25);

    const char *provider_id = ocr_app_get_active_engine_id(app);
    gsize pass_count = 0;
    PreprocessOutput **passes = preprocessor_process_passes(
        original, app->preprocess_mode, provider_id, &pass_count, error);
    if (!passes || pass_count == 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "전처리 실패");
        return FALSE;
    }

    ocr_progress_report(ctx, "전처리 완료", 45);

    gsize valid_passes = 0;
    for (gsize i = 0; i < pass_count; i++) {
        if (passes[i] && passes[i]->image)
            valid_passes++;
    }
    if (valid_passes == 0)
        valid_passes = 1;

    OcrResult *candidates = g_new0(OcrResult, pass_count);
    gsize pass_index = 0;
    for (gsize i = 0; i < pass_count; i++) {
        if (!passes[i] || !passes[i]->image) continue;

        int pct = 55 + (int)(30 * pass_index / valid_passes);
        char msg[96];
        g_snprintf(msg, sizeof(msg), "OCR 인식 중 (%zu/%zu)", pass_index + 1, valid_passes);
        ocr_progress_report(ctx, msg, pct);

        if (!ocr_service_recognize(app->service, passes[i]->image, &candidates[i], error)) {
            for (gsize j = 0; j < pass_count; j++)
                ocr_result_clear(&candidates[j]);
            g_free(candidates);
            for (gsize j = 0; j < pass_count; j++)
                preprocess_output_free(passes[j]);
            g_free(passes);
            return FALSE;
        }
        ocr_result_map_to_original(&candidates[i], passes[i]->transform);
        ocr_text_postprocess(&candidates[i]);
        pass_index++;
    }

    ocr_progress_report(ctx, "최적 결과 선택 중...", 82);

    ocr_result_clear(&app->result);
    ocr_result_pick_best(candidates, pass_count, &app->result);

    ocr_progress_report(ctx, "결과 정리 중...", 92);

    for (gsize i = 0; i < pass_count; i++) {
        ocr_result_clear(&candidates[i]);
        preprocess_output_free(passes[i]);
    }
    g_free(candidates);
    g_free(passes);

    ocr_progress_report(ctx, "OCR 완료", 100);
    return TRUE;
}

PIX *ocr_app_render_boxes_image(const OcrApp *app) {
    PIX *source = document_current_pix(&app->document);
    if (!source) return NULL;
    return result_save_render_boxes(source, ocr_app_get_result(app));
}

char *ocr_app_get_result_base_name(const OcrApp *app) {
    if (!app || !app->document.source_path)
        return g_strdup("ocr_result");
    char *copy = g_strdup(app->document.source_path);
    char *base = g_path_get_basename(copy);
    char *dot = strrchr(base, '.');
    if (dot) *dot = '\0';
    char *result = g_strdup(base);
    g_free(base);
    g_free(copy);
    return result;
}
