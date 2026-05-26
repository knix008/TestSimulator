#ifndef GTK_SVG_RASTER_H
#define GTK_SVG_RASTER_H

#include <cairo.h>
#include <glib.h>

/* Flush pending GDK drawing operations (call from UI thread). */
void gtk_svg_raster_flush_display(void);

/* Prime librsvg SVG loader after gtk_init(). */
void gtk_svg_raster_warmup(void);

/* Natural pixel size of an SVG as rendered by librsvg. */
gboolean gtk_svg_raster_probe_size(const char *svg, int *out_w, int *out_h);

/* Rasterize an SVG string to a Cairo image surface at target_w pixels wide.
 * The height is computed proportionally from the SVG's intrinsic aspect ratio.
 * Pass target_w <= 0 to use the SVG's natural width. */
cairo_surface_t *gtk_svg_raster_string_to_surface(const char *svg, int target_w,
                                                  int *out_w, int *out_h,
                                                  GError **err);

#endif
