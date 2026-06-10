#pragma once
#include <gtk/gtk.h>

/* Draw a dot-matrix clock string (5×7 dot grid per char).
   Returns total width drawn. */
double dot_matrix_draw(cairo_t *cr,
                       const char *text,
                       double x, double y,
                       double dot_size,
                       double gap,
                       double r, double g, double b,
                       double dim_a);
