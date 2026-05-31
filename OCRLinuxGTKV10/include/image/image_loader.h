#ifndef IMAGE_LOADER_H
#define IMAGE_LOADER_H

#include <glib.h>
#include <leptonica/allheaders.h>

gboolean image_loader_is_pdf(const char *path);
gboolean image_loader_is_supported(const char *path);

PIX *image_loader_load_file(const char *path, GError **error);

#endif
