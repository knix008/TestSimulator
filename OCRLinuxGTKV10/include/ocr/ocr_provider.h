#ifndef OCR_PROVIDER_H
#define OCR_PROVIDER_H

#include <glib.h>
#include <leptonica/allheaders.h>
#include "ocr/ocr_types.h"
#include "ocr/engine_install.h"

typedef struct OcrProvider OcrProvider;

typedef struct {
    const char *id;
    const char *display_name;
    const char *description;
    gboolean (*is_installed)(const OcrProvider *provider);
    gboolean (*ensure_installed)(OcrProvider *provider, OcrInstallContext *ctx, GError **error);
    gboolean (*recognize)(OcrProvider *provider, PIX *image, OcrResult *result, GError **error);
    void (*destroy)(OcrProvider *provider);
} OcrProviderVTable;

struct OcrProvider {
    OcrProviderVTable vtable;
    gpointer user_data;
};

OcrProvider *ocr_provider_ref(OcrProvider *provider);
void ocr_provider_unref(OcrProvider *provider);

const char *ocr_provider_get_id(const OcrProvider *provider);
const char *ocr_provider_get_display_name(const OcrProvider *provider);
const char *ocr_provider_get_description(const OcrProvider *provider);
gboolean ocr_provider_is_installed(const OcrProvider *provider);
gboolean ocr_provider_ensure_installed(OcrProvider *provider, OcrInstallContext *ctx, GError **error);
gboolean ocr_provider_recognize(OcrProvider *provider, PIX *image, OcrResult *result, GError **error);

OcrProvider *tesseract_provider_create(void);
OcrProvider *paddle_provider_create(void);
OcrProvider *easyocr_provider_create(void);

#endif
