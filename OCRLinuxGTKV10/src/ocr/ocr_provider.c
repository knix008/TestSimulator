#include "ocr/ocr_provider.h"

OcrProvider *ocr_provider_ref(OcrProvider *provider) {
    return provider;
}

void ocr_provider_unref(OcrProvider *provider) {
    if (provider && provider->vtable.destroy)
        provider->vtable.destroy(provider);
}

const char *ocr_provider_get_id(const OcrProvider *provider) {
    return provider ? provider->vtable.id : NULL;
}

const char *ocr_provider_get_display_name(const OcrProvider *provider) {
    return provider ? provider->vtable.display_name : NULL;
}

const char *ocr_provider_get_description(const OcrProvider *provider) {
    return provider ? provider->vtable.description : NULL;
}

gboolean ocr_provider_is_installed(const OcrProvider *provider) {
    return provider && provider->vtable.is_installed
        ? provider->vtable.is_installed(provider)
        : FALSE;
}

gboolean ocr_provider_ensure_installed(OcrProvider *provider, OcrInstallContext *ctx, GError **error) {
    if (!provider) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "OCR provider is NULL");
        return FALSE;
    }
    if (!provider->vtable.ensure_installed) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "ensure_installed not implemented");
        return FALSE;
    }
    return provider->vtable.ensure_installed(provider, ctx, error);
}

gboolean ocr_provider_recognize(OcrProvider *provider, PIX *image, OcrResult *result, GError **error) {
    if (!provider || !image || !result) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "Invalid OCR recognize arguments");
        return FALSE;
    }
    ocr_result_clear(result);
    return provider->vtable.recognize(provider, image, result, error);
}
