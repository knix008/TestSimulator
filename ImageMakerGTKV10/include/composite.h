#ifndef COMPOSITE_H
#define COMPOSITE_H

#include "layer.h"
#include <cairo.h>

cairo_surface_t *composite_render(const ImageProject *project);
gboolean composite_save_png(const ImageProject *project, const char *path, GError **error);

#endif
