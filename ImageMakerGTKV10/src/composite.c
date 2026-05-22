#include "composite.h"

#include "layer_mask.h"

#include <gdk/gdk.h>
#include <gdk-pixbuf/gdk-pixbuf.h>

static void draw_pixbuf(cairo_t *cr, GdkPixbuf *pixbuf, int x, int y, double opacity) {
    if (!pixbuf)
        return;
    cairo_save(cr);
    cairo_translate(cr, x, y);
    gdk_cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
    cairo_paint_with_alpha(cr, opacity);
    cairo_restore(cr);
}

static void draw_layer(cairo_t *cr, const Layer *layer, const Layer *background_layer) {
    if (!layer->visible || !layer->pixbuf)
        return;

    if (layer == background_layer) {
        draw_pixbuf(cr, layer->pixbuf, 0, 0, layer->opacity);
        return;
    }

    if (layer_has_selection(layer)) {
        for (GList *node = layer->selections; node; node = node->next) {
            SelectionRect *sel = (SelectionRect *)node->data;
            layer_selection_draw(cr, layer, sel, layer->opacity);
        }
        return;
    }

    draw_pixbuf(cr, layer->pixbuf, layer->x, layer->y, layer->opacity);
}

cairo_surface_t *composite_render(const ImageProject *project) {
    int width = project->canvas_width;
    int height = project->canvas_height;

    cairo_surface_t *surface =
        cairo_image_surface_create(CAIRO_FORMAT_ARGB32, width, height);
    cairo_t *cr = cairo_create(surface);

    Layer *background = image_project_find_background_layer(project);

    if (background) {
        draw_layer(cr, background, background);
    } else {
        cairo_set_source_rgba(cr, 1.0, 1.0, 1.0, 1.0);
        cairo_rectangle(cr, 0, 0, width, height);
        cairo_fill(cr);
    }

    for (GList *node = project->layers; node; node = node->next) {
        Layer *layer = (Layer *)node->data;
        if (layer == background)
            continue;
        draw_layer(cr, layer, background);
    }

    cairo_destroy(cr);
    return surface;
}

gboolean composite_save_png(const ImageProject *project, const char *path, GError **error) {
    cairo_surface_t *surface = composite_render(project);
    if (cairo_surface_status(surface) != CAIRO_STATUS_SUCCESS) {
        cairo_surface_destroy(surface);
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "합성 렌더링에 실패했습니다.");
        return FALSE;
    }

    GdkPixbuf *pixbuf = gdk_pixbuf_get_from_surface(surface, 0, 0,
                                                  project->canvas_width,
                                                  project->canvas_height);
    cairo_surface_destroy(surface);

    if (!pixbuf) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "픽스버프 변환에 실패했습니다.");
        return FALSE;
    }

    gboolean ok = gdk_pixbuf_save(pixbuf, path, "png", error, NULL);
    g_object_unref(pixbuf);
    return ok;
}
