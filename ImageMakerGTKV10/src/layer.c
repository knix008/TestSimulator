#include "layer.h"

#include "layer_mask.h"

#include <string.h>

ImageProject *image_project_new(int width, int height) {
    ImageProject *project = g_new0(ImageProject, 1);
    project->canvas_width = width > 0 ? width : 800;
    project->canvas_height = height > 0 ? height : 600;
    project->layers = NULL;
    return project;
}

void image_project_free(ImageProject *project) {
    if (!project)
        return;
    for (GList *node = project->layers; node; node = node->next)
        layer_free((Layer *)node->data);
    g_list_free(project->layers);
    g_free(project);
}

Layer *layer_new_from_file(const char *path, GError **error) {
    GdkPixbuf *pixbuf = gdk_pixbuf_new_from_file(path, error);
    if (!pixbuf)
        return NULL;

    Layer *layer = g_new0(Layer, 1);
    layer->pixbuf = pixbuf;
    layer->filename = g_path_get_basename(path);
    layer->x = 0;
    layer->y = 0;
    layer->opacity = 1.0;
    layer->visible = TRUE;
    return layer;
}

static void selection_rect_free(gpointer data) {
    g_free(data);
}

void layer_clear_selections(Layer *layer) {
    if (!layer || !layer->selections)
        return;
    g_list_free_full(layer->selections, selection_rect_free);
    layer->selections = NULL;
}

gboolean layer_add_selection(Layer *layer, int roi_x, int roi_y, int roi_w, int roi_h,
                             int place_x, int place_y, int place_w, int place_h) {
    if (!layer || !layer->pixbuf || roi_w <= 0 || roi_h <= 0 || place_w <= 0 || place_h <= 0)
        return FALSE;

    int img_w = gdk_pixbuf_get_width(layer->pixbuf);
    int img_h = gdk_pixbuf_get_height(layer->pixbuf);

    if (roi_x < 0) {
        roi_w += roi_x;
        roi_x = 0;
    }
    if (roi_y < 0) {
        roi_h += roi_y;
        roi_y = 0;
    }
    if (roi_x + roi_w > img_w)
        roi_w = img_w - roi_x;
    if (roi_y + roi_h > img_h)
        roi_h = img_h - roi_y;

    if (roi_w < 2 || roi_h < 2)
        return FALSE;

    SelectionRect *rect = g_new(SelectionRect, 1);
    rect->x = roi_x;
    rect->y = roi_y;
    rect->width = roi_w;
    rect->height = roi_h;
    rect->place_x = place_x;
    rect->place_y = place_y;
    rect->place_w = place_w;
    rect->place_h = place_h;
    rect->place_angle = 0.0;
    layer->selections = g_list_append(layer->selections, rect);
    return TRUE;
}

gboolean layer_remove_selection(Layer *layer, SelectionRect *selection) {
    GList *node = g_list_find(layer->selections, selection);
    if (!node)
        return FALSE;
    layer->selections = g_list_remove_link(layer->selections, node);
    g_free(node->data);
    g_list_free_1(node);
    return TRUE;
}

guint layer_selection_count(const Layer *layer) {
    return g_list_length(layer->selections);
}

SelectionRect *layer_selection_at(const Layer *layer, guint index) {
    GList *node = g_list_nth(layer->selections, index);
    return node ? (SelectionRect *)node->data : NULL;
}

SelectionRect *layer_selection_last(const Layer *layer) {
    if (!layer || !layer->selections)
        return NULL;
    return (SelectionRect *)g_list_last(layer->selections)->data;
}

void layer_free(Layer *layer) {
    if (!layer)
        return;
    layer_clear_selections(layer);
    g_clear_object(&layer->pixbuf);
    g_free(layer->filename);
    g_free(layer);
}

gboolean image_project_add_layer(ImageProject *project, const char *path, GError **error) {
    Layer *layer = layer_new_from_file(path, error);
    if (!layer)
        return FALSE;
    project->layers = g_list_append(project->layers, layer);
    return TRUE;
}

void image_project_remove_layer(ImageProject *project, Layer *layer) {
    GList *node = g_list_find(project->layers, layer);
    if (!node)
        return;
    project->layers = g_list_remove_link(project->layers, node);
    layer_free((Layer *)node->data);
    g_list_free_1(node);
}

static void swap_layer_nodes(GList *a, GList *b) {
    gpointer tmp = a->data;
    a->data = b->data;
    b->data = tmp;
}

void image_project_move_layer_up(ImageProject *project, Layer *layer) {
    GList *node = g_list_find(project->layers, layer);
    if (!node || !node->next)
        return;
    swap_layer_nodes(node, node->next);
}

void image_project_move_layer_down(ImageProject *project, Layer *layer) {
    GList *node = g_list_find(project->layers, layer);
    if (!node || !node->prev)
        return;
    swap_layer_nodes(node, node->prev);
}

guint image_project_layer_count(const ImageProject *project) {
    return g_list_length(project->layers);
}

Layer *image_project_layer_at(const ImageProject *project, guint index) {
    GList *node = g_list_nth(project->layers, index);
    return node ? (Layer *)node->data : NULL;
}

Layer *image_project_find_background_layer(const ImageProject *project) {
    if (!project)
        return NULL;
    for (GList *node = project->layers; node; node = node->next) {
        Layer *layer = (Layer *)node->data;
        if (!layer_has_selection(layer))
            return layer;
    }
    return NULL;
}
