#ifndef LAYER_MASK_H
#define LAYER_MASK_H

#include "layer.h"
#include <cairo.h>

gboolean layer_has_selection(const Layer *layer);

GdkPixbuf *layer_selection_extract_pixbuf(const Layer *layer, const SelectionRect *selection,
                                          int *out_w, int *out_h);
void layer_selection_draw(cairo_t *cr, const Layer *layer, const SelectionRect *selection,
                          double opacity);

#endif
