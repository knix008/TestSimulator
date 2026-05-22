#ifndef LAYER_H
#define LAYER_H

#include <glib.h>
#include <gdk-pixbuf/gdk-pixbuf.h>

typedef struct SelectionRect {
    int x;
    int y;
    int width;
    int height;
    int place_x;
    int place_y;
    int place_w;
    int place_h;
    double place_angle;
} SelectionRect;

typedef struct Layer {
    GdkPixbuf *pixbuf;
    char *filename;
    int x;
    int y;
    double opacity;
    gboolean visible;
    GList *selections;
} Layer;

typedef struct ImageProject {
    int canvas_width;
    int canvas_height;
    GList *layers;
} ImageProject;

ImageProject *image_project_new(int width, int height);
void image_project_free(ImageProject *project);

Layer *layer_new_from_file(const char *path, GError **error);
void layer_free(Layer *layer);

gboolean image_project_add_layer(ImageProject *project, const char *path, GError **error);
void image_project_remove_layer(ImageProject *project, Layer *layer);
void image_project_move_layer_up(ImageProject *project, Layer *layer);
void image_project_move_layer_down(ImageProject *project, Layer *layer);

guint image_project_layer_count(const ImageProject *project);
Layer *image_project_layer_at(const ImageProject *project, guint index);

Layer *image_project_find_background_layer(const ImageProject *project);

void layer_clear_selections(Layer *layer);
gboolean layer_remove_selection(Layer *layer, SelectionRect *selection);
gboolean layer_add_selection(Layer *layer, int roi_x, int roi_y, int roi_w, int roi_h,
                             int place_x, int place_y, int place_w, int place_h);

guint layer_selection_count(const Layer *layer);
SelectionRect *layer_selection_at(const Layer *layer, guint index);
SelectionRect *layer_selection_last(const Layer *layer);

#endif
