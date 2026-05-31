#ifndef PDF_RENDERER_H
#define PDF_RENDERER_H

#include <glib.h>
#include <leptonica/allheaders.h>

gboolean pdf_renderer_load_pages(
    const char *path,
    double dpi,
    PIX ***pages_out,
    gsize *page_count_out,
    GError **error);

#endif
