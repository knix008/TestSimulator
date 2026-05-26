#include "gtk/svg_raster.h"

#include <librsvg/rsvg.h>
#include <gdk/gdk.h>
#include <math.h>
#include <string.h>

void gtk_svg_raster_flush_display(void)
{
    GdkDisplay *dpy = gdk_display_get_default();
    if (dpy)
        gdk_display_flush(dpy);
}

void gtk_svg_raster_warmup(void)
{
    static int done;
    if (done)
        return;
    done = 1;

    /* Exercise librsvg to ensure it's initialised before the first real page. */
    const char *probe =
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\">"
        "<rect width=\"10\" height=\"10\" fill=\"white\"/>"
        "</svg>";

    GError *err = NULL;
    RsvgHandle *h = rsvg_handle_new_from_data((const guint8 *)probe,
                                              (gsize)strlen(probe), &err);
    if (h)
        g_object_unref(h);
    g_clear_error(&err);
}

gboolean gtk_svg_raster_probe_size(const char *svg, int *out_w, int *out_h)
{
    if (!svg || !svg[0])
        return FALSE;

    GError *err = NULL;
    RsvgHandle *h = rsvg_handle_new_from_data((const guint8 *)svg,
                                              (gsize)strlen(svg), &err);
    if (!h) {
        g_clear_error(&err);
        return FALSE;
    }

    gdouble w = 0, hh = 0;
    gboolean ok = rsvg_handle_get_intrinsic_size_in_pixels(h, &w, &hh);
    g_object_unref(h);

    if (!ok || w < 1.0)
        return FALSE;
    if (out_w)
        *out_w = (int)ceil(w);
    if (out_h)
        *out_h = (int)ceil(hh);
    return TRUE;
}

cairo_surface_t *gtk_svg_raster_string_to_surface(const char *svg, int target_w,
                                                  int *out_w, int *out_h,
                                                  GError **err)
{
    if (!svg || !svg[0]) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Empty SVG");
        return NULL;
    }

    GError *load_err = NULL;
    RsvgHandle *handle = rsvg_handle_new_from_data((const guint8 *)svg,
                                                   (gsize)strlen(svg), &load_err);
    if (!handle) {
        if (err)
            g_propagate_error(err, load_err);
        else
            g_clear_error(&load_err);
        return NULL;
    }

    /* Get the SVG's natural dimensions (in px at 96 DPI). */
    gdouble nat_w = 0.0, nat_h = 0.0;
    if (!rsvg_handle_get_intrinsic_size_in_pixels(handle, &nat_w, &nat_h)
        || nat_w < 1.0) {
        nat_w = target_w > 0 ? (double)target_w : 800.0;
        nat_h = nat_w * 1.4;
    }

    /* Determine target pixel dimensions. */
    int tw = (target_w > 0) ? target_w : (int)ceil(nat_w);
    int th = (int)ceil(nat_h * (double)tw / nat_w);
    if (tw < 1) tw = 1;
    if (th < 1) th = 1;

    cairo_surface_t *surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, tw, th);
    if (cairo_surface_status(surface) != CAIRO_STATUS_SUCCESS) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Cannot allocate %dx%d surface", tw, th);
        cairo_surface_destroy(surface);
        g_object_unref(handle);
        return NULL;
    }

    cairo_t *cr = cairo_create(surface);

    /* White background so notes (black paths) are visible. */
    cairo_set_source_rgb(cr, 1.0, 1.0, 1.0);
    cairo_paint(cr);

    /* Render SVG scaled into the exact viewport. */
    RsvgRectangle viewport = { 0.0, 0.0, (double)tw, (double)th };
    GError *render_err = NULL;
    rsvg_handle_render_document(handle, cr, &viewport, &render_err);
    g_clear_error(&render_err); /* non-fatal; partial render is better than nothing */

    cairo_destroy(cr);
    cairo_surface_flush(surface);
    g_object_unref(handle);

    if (out_w)
        *out_w = tw;
    if (out_h)
        *out_h = th;
    return surface;
}
