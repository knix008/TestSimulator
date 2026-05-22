#ifndef CANVAS_VIEW_H
#define CANVAS_VIEW_H

#include <gtk/gtk.h>
#include "layer.h"

GtkWidget *canvas_view_new(ImageProject *project);
void canvas_view_set_project(GtkWidget *view, ImageProject *project);
void canvas_view_set_active_layer(GtkWidget *view, Layer *layer);
void canvas_view_set_active_selection(GtkWidget *view, SelectionRect *selection);
SelectionRect *canvas_view_get_active_selection(GtkWidget *view);
void canvas_view_refresh(GtkWidget *view);

typedef void (*CanvasViewChangedFunc)(GtkWidget *view, gpointer user_data);
void canvas_view_set_changed_callback(GtkWidget *view, CanvasViewChangedFunc func, gpointer user_data);

#endif
