#ifndef OCR_SERVICE_H
#define OCR_SERVICE_H

#include "ocr/ocr_provider.h"

typedef struct OcrService OcrService;

OcrService *ocr_service_new(void);
void ocr_service_free(OcrService *service);

gsize ocr_service_provider_count(const OcrService *service);
OcrProvider *ocr_service_get_provider(const OcrService *service, gsize index);
int ocr_service_get_provider_index(const OcrService *service, const char *provider_id);
gboolean ocr_service_select_provider(OcrService *service, const char *provider_id);
gboolean ocr_service_select_provider_index(OcrService *service, gsize index);
OcrProvider *ocr_service_get_active_provider(const OcrService *service);
const char *ocr_service_get_default_provider_id(void);

gboolean ocr_service_ensure_ready(OcrService *service, OcrInstallContext *ctx, GError **error);
gboolean ocr_service_recognize(OcrService *service, PIX *image, OcrResult *result, GError **error);

#endif
