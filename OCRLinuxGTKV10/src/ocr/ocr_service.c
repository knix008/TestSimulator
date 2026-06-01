#include "ocr/ocr_service.h"
#include "ocr/ocr_provider_ids.h"

struct OcrService {
    OcrProvider *providers[4];
    gsize provider_count;
    OcrProvider *active;
};

OcrService *ocr_service_new(void) {
    OcrService *service = g_new0(OcrService, 1);
    service->providers[0] = rapid_provider_create();
    service->providers[1] = paddle_onnx_provider_create();
    service->providers[2] = easyocr_provider_create();
    service->providers[3] = tesseract_provider_create();
    service->provider_count = 4;
    service->active = service->providers[0];
    return service;
}

void ocr_service_free(OcrService *service) {
    if (!service) return;
    for (gsize i = 0; i < service->provider_count; i++)
        ocr_provider_unref(service->providers[i]);
    g_free(service);
}

gsize ocr_service_provider_count(const OcrService *service) {
    return service ? service->provider_count : 0;
}

OcrProvider *ocr_service_get_provider(const OcrService *service, gsize index) {
    if (!service || index >= service->provider_count) return NULL;
    return service->providers[index];
}

int ocr_service_get_provider_index(const OcrService *service, const char *provider_id) {
    if (!service || !provider_id) return -1;
    for (gsize i = 0; i < service->provider_count; i++) {
        if (g_strcmp0(ocr_provider_get_id(service->providers[i]), provider_id) == 0)
            return (int)i;
    }
    return -1;
}

gboolean ocr_service_select_provider(OcrService *service, const char *provider_id) {
    int index = ocr_service_get_provider_index(service, provider_id);
    if (index < 0) return FALSE;
    return ocr_service_select_provider_index(service, (gsize)index);
}

gboolean ocr_service_select_provider_index(OcrService *service, gsize index) {
    if (!service || index >= service->provider_count) return FALSE;
    service->active = service->providers[index];
    return TRUE;
}

OcrProvider *ocr_service_get_active_provider(const OcrService *service) {
    return service ? service->active : NULL;
}

const char *ocr_service_get_default_provider_id(void) {
    return OCR_PROVIDER_DEFAULT;
}

gboolean ocr_service_ensure_ready(OcrService *service, OcrInstallContext *ctx, GError **error) {
    if (!service || !service->active) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "OCR engine not selected");
        return FALSE;
    }
    return ocr_provider_ensure_installed(service->active, ctx, error);
}

gboolean ocr_service_recognize(OcrService *service, PIX *image, OcrResult *result, GError **error) {
    if (!service || !service->active) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "OCR engine not selected");
        return FALSE;
    }
    return ocr_provider_recognize(service->active, image, result, error);
}
