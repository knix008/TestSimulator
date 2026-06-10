#pragma once
#include <gtk/gtk.h>

/* Draw a seven-segment display string into cr.
   x,y = top-left origin, scale = pixels per design-unit.
   Returns total width drawn. */
double seven_segment_draw(cairo_t *cr,
                          const char *text,
                          double x, double y,
                          double scale,
                          double seg_r, double seg_g, double seg_b,
                          double dim_a);
