#include "image/pdf_renderer.h"
#include <cairo/cairo.h>
#include <poppler-document.h>
#include <poppler-page.h>
#include <string.h>

static PIX *pix_from_cairo_surface(cairo_surface_t *surface) {
    cairo_surface_flush(surface);
    int w = cairo_image_surface_get_width(surface);
    int h = cairo_image_surface_get_height(surface);
    int stride = cairo_image_surface_get_stride(surface);
    guchar *data = cairo_image_surface_get_data(surface);

    PIX *pix = pixCreate(w, h, 32);
    if (!pix) return NULL;

    l_uint32 *dst = pixGetData(pix);
    int dst_wpl = pixGetWpl(pix);

    for (int y = 0; y < h; y++) {
        guchar *row = data + y * stride;
        for (int x = 0; x < w; x++) {
            guchar *p = row + x * 4;
            l_uint8 r = p[2];
            l_uint8 g = p[1];
            l_uint8 b = p[0];
            composeRGBPixel(r, g, b, dst + y * dst_wpl + x);
        }
    }
    return pix;
}

gboolean pdf_renderer_load_pages(
    const char *path,
    double dpi,
    PIX ***pages_out,
    gsize *page_count_out,
    GError **error) {
    if (!path || !pages_out || !page_count_out) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "Invalid arguments");
        return FALSE;
    }

    *pages_out = NULL;
    *page_count_out = 0;

    char *uri = g_filename_to_uri(path, NULL, error);
    if (!uri) return FALSE;

    GError *local = NULL;
    PopplerDocument *doc = poppler_document_new_from_file(uri, NULL, &local);
    g_free(uri);
    if (!doc) {
        g_propagate_error(error, local);
        return FALSE;
    }

    int n_pages = poppler_document_get_n_pages(doc);
    if (n_pages <= 0) {
        g_object_unref(doc);
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "PDF has no pages");
        return FALSE;
    }

    PIX **pages = g_new0(PIX *, n_pages);
    double scale = dpi / 72.0;

    for (int i = 0; i < n_pages; i++) {
        PopplerPage *page = poppler_document_get_page(doc, i);
        if (!page) continue;

        double pw, ph;
        poppler_page_get_size(page, &pw, &ph);
        int iw = (int)(pw * scale);
        int ih = (int)(ph * scale);
        if (iw < 1) iw = 1;
        if (ih < 1) ih = 1;

        cairo_surface_t *surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, iw, ih);
        cairo_t *cr = cairo_create(surface);
        cairo_set_source_rgb(cr, 1, 1, 1);
        cairo_paint(cr);
        cairo_scale(cr, scale, scale);
        poppler_page_render(page, cr);
        cairo_destroy(cr);

        pages[i] = pix_from_cairo_surface(surface);
        cairo_surface_destroy(surface);
        g_object_unref(page);

        if (!pages[i]) {
            for (int j = 0; j < i; j++)
                pixDestroy(&pages[j]);
            g_free(pages);
            g_object_unref(doc);
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Failed to render PDF page %d", i + 1);
            return FALSE;
        }
    }

    g_object_unref(doc);
    *pages_out = pages;
    *page_count_out = (gsize)n_pages;
    return TRUE;
}
