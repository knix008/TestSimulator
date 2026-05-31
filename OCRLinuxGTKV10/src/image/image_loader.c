#include "image/image_loader.h"
#include <string.h>

static const char *supported_exts[] = {
    ".jpg", ".jpeg", ".jpe", ".png", ".bmp", ".dib",
    ".tif", ".tiff", ".gif", ".webp", NULL
};

gboolean image_loader_is_pdf(const char *path) {
    if (!path) return FALSE;
    const char *ext = strrchr(path, '.');
    return ext && g_ascii_strcasecmp(ext, ".pdf") == 0;
}

gboolean image_loader_is_supported(const char *path) {
    if (!path) return FALSE;
    if (image_loader_is_pdf(path)) return TRUE;
    const char *ext = strrchr(path, '.');
    if (!ext) return FALSE;
    for (int i = 0; supported_exts[i]; i++) {
        if (g_ascii_strcasecmp(ext, supported_exts[i]) == 0)
            return TRUE;
    }
    return FALSE;
}

PIX *image_loader_load_file(const char *path, GError **error) {
    if (!path || !*path) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "Empty path");
        return NULL;
    }
    if (image_loader_is_pdf(path)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL,
                    "PDF files must be loaded via pdf_renderer_load_pages");
        return NULL;
    }

    PIX *pix = pixRead(path);
    if (!pix) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot load image: %s", path);
        return NULL;
    }
    return pix;
}
