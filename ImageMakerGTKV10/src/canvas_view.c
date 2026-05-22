#include "canvas_view.h"

#include "composite.h"
#include "layer_mask.h"
#include "selection_geom.h"

#include <math.h>
#include <stdlib.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef enum {
    DRAG_NONE = 0,
    DRAG_NEW_ROI,
    DRAG_MOVE,
    DRAG_RESIZE,
    DRAG_ROTATE
} DragMode;

typedef struct {
    ImageProject *project;
    GtkWidget *drawing_area;
    Layer *active_layer;
    SelectionRect *active_selection;
    DragMode drag_mode;
    int resize_handle;
    gboolean dragging;
    int drag_x0;
    int drag_y0;
    int drag_x1;
    int drag_y1;
    double move_off_x;
    double move_off_y;
    double rotate_drag_start;
    double rotate_angle_start;
    double resize_center_x;
    double resize_center_y;
    CanvasViewChangedFunc changed_cb;
    gpointer changed_data;
} CanvasViewData;

static void notify_changed(CanvasViewData *data) {
    if (data->changed_cb && data->drawing_area)
        data->changed_cb(data->drawing_area, data->changed_data);
}

static double deg_to_rad(double deg) {
    return deg * M_PI / 180.0;
}

static SelectionRect *hit_selection_at(CanvasViewData *data, int px, int py) {
    if (!data->active_layer)
        return NULL;

    for (GList *node = g_list_last(data->active_layer->selections); node;
         node = node->prev) {
        SelectionRect *sel = (SelectionRect *)node->data;
        if (selection_hit_inside(sel, px, py))
            return sel;
    }
    return NULL;
}

static void with_selection_transform(cairo_t *cr, const SelectionRect *sel) {
    double cx, cy;
    selection_get_center(sel, &cx, &cy);
    cairo_translate(cr, cx, cy);
    cairo_rotate(cr, deg_to_rad(sel->place_angle));
}

static void draw_transformed_box(cairo_t *cr, const SelectionRect *sel) {
    cairo_save(cr);
    with_selection_transform(cr, sel);
    cairo_rectangle(cr, -sel->place_w / 2.0 + 0.5, -sel->place_h / 2.0 + 0.5,
                    sel->place_w, sel->place_h);
    cairo_stroke(cr);
    cairo_restore(cr);
}

static void draw_handles(cairo_t *cr, const SelectionRect *sel) {
    static const double corners[][2] = {
        {-1, -1}, {1, -1}, {-1, 1}, {1, 1}
    };
    double hw = sel->place_w / 2.0;
    double hh = sel->place_h / 2.0;
    int hs = SELECTION_HANDLE_SIZE;

    cairo_set_source_rgba(cr, 1.0, 0.5, 0.0, 1.0);

    for (int i = 0; i < 4; i++) {
        double lx = corners[i][0] * hw;
        double ly = corners[i][1] * hh;
        double px, py;
        selection_local_to_canvas(sel, lx, ly, &px, &py);
        cairo_rectangle(cr, px - hs / 2.0, py - hs / 2.0, hs, hs);
    }

    double rx, ry;
    selection_local_to_canvas(sel, 0, -hh - SELECTION_ROTATE_HANDLE_DIST, &rx, &ry);
    cairo_rectangle(cr, rx - hs / 2.0, ry - hs / 2.0, hs, hs);

    cairo_fill(cr);

    cairo_set_source_rgba(cr, 0.2, 0.8, 1.0, 0.9);
    cairo_set_line_width(cr, 1.5);
    double cx, cy;
    selection_get_center(sel, &cx, &cy);
    cairo_move_to(cr, cx, cy);
    cairo_line_to(cr, rx, ry);
    cairo_stroke(cr);
}

static void draw_selection_overlays(cairo_t *cr, CanvasViewData *data) {
    if (!data->active_layer || !data->active_layer->pixbuf)
        return;

    Layer *layer = data->active_layer;
    int ox = layer->x;
    int oy = layer->y;

    for (GList *node = layer->selections; node; node = node->next) {
        SelectionRect *sel = (SelectionRect *)node->data;
        gboolean active = (sel == data->active_selection);

        if (active) {
            cairo_set_source_rgba(cr, 0.1, 0.85, 0.2, 0.95);
            cairo_set_line_width(cr, 2.0);
        } else {
            cairo_set_source_rgba(cr, 0.1, 0.6, 1.0, 0.7);
            cairo_set_line_width(cr, 1.5);
        }
        draw_transformed_box(cr, sel);

        if (active)
            draw_handles(cr, sel);

        cairo_set_source_rgba(cr, 0.5, 0.5, 0.5, 0.6);
        cairo_set_line_width(cr, 1.0);
        cairo_rectangle(cr, ox + sel->x + 0.5, oy + sel->y + 0.5, sel->width, sel->height);
        cairo_stroke(cr);
    }

    if (data->dragging && data->drag_mode == DRAG_NEW_ROI) {
        int x0 = data->drag_x0 < data->drag_x1 ? data->drag_x0 : data->drag_x1;
        int y0 = data->drag_y0 < data->drag_y1 ? data->drag_y0 : data->drag_y1;
        int w = abs(data->drag_x1 - data->drag_x0);
        int h = abs(data->drag_y1 - data->drag_y0);
        cairo_set_source_rgba(cr, 1.0, 0.3, 0.1, 0.9);
        cairo_set_line_width(cr, 2.0);
        cairo_rectangle(cr, x0 + 0.5, y0 + 0.5, w, h);
        cairo_stroke(cr);
    }
}

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data) {
    (void)widget;
    CanvasViewData *data = (CanvasViewData *)user_data;
    if (!data || !data->project)
        return FALSE;

    cairo_surface_t *surface = composite_render(data->project);
    if (!surface)
        return FALSE;

    int width = data->project->canvas_width;
    int height = data->project->canvas_height;

    cairo_set_source_surface(cr, surface, 0, 0);
    cairo_paint(cr);
    cairo_surface_destroy(surface);

    draw_selection_overlays(cr, data);

    cairo_set_source_rgba(cr, 0.4, 0.4, 0.4, 1.0);
    cairo_set_line_width(cr, 1.0);
    cairo_rectangle(cr, 0.5, 0.5, width - 1.0, height - 1.0);
    cairo_stroke(cr);

    return FALSE;
}

static gboolean on_button_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    CanvasViewData *data = (CanvasViewData *)user_data;
    (void)widget;

    if (event->button != 1 || !data->active_layer)
        return FALSE;

    int px = (int)event->x;
    int py = (int)event->y;

    SelectionRect *hit = hit_selection_at(data, px, py);
    if (!hit) {
        for (GList *node = g_list_last(data->active_layer->selections); node;
             node = node->prev) {
            SelectionRect *sel = (SelectionRect *)node->data;
            if (selection_hit_rotate_handle(sel, px, py) ||
                selection_hit_resize_handle(sel, px, py)) {
                hit = sel;
                break;
            }
        }
    }

    if (hit) {
        data->active_selection = hit;

        if (selection_hit_rotate_handle(hit, px, py)) {
            double cx, cy;
            selection_get_center(hit, &cx, &cy);
            data->drag_mode = DRAG_ROTATE;
            data->rotate_drag_start = atan2(py - cy, px - cx);
            data->rotate_angle_start = hit->place_angle;
        } else {
            int rh = selection_hit_resize_handle(hit, px, py);
            if (rh != 0) {
                data->drag_mode = DRAG_RESIZE;
                data->resize_handle = rh;
                selection_get_center(hit, &data->resize_center_x, &data->resize_center_y);
            } else {
                data->drag_mode = DRAG_MOVE;
                double cx, cy;
                selection_get_center(hit, &cx, &cy);
                data->move_off_x = px - cx;
                data->move_off_y = py - cy;
            }
        }
    } else {
        data->active_selection = NULL;
        data->drag_mode = DRAG_NEW_ROI;
    }

    data->dragging = TRUE;
    data->drag_x0 = px;
    data->drag_y0 = py;
    data->drag_x1 = px;
    data->drag_y1 = py;
    gtk_widget_queue_draw(data->drawing_area);
    return TRUE;
}

static void apply_resize_local(SelectionRect *sel, int handle, double lx, double ly) {
    double hw = 0, hh = 0;

    switch (handle) {
    case 1:
        hw = -lx;
        hh = -ly;
        break;
    case 2:
        hw = lx;
        hh = -ly;
        break;
    case 3:
        hw = -lx;
        hh = ly;
        break;
    case 4:
        hw = lx;
        hh = ly;
        break;
    default:
        return;
    }

    if (hw < 4)
        hw = 4;
    if (hh < 4)
        hh = 4;

    sel->place_w = (int)(hw * 2);
    sel->place_h = (int)(hh * 2);
}

static gboolean on_motion(GtkWidget *widget, GdkEventMotion *event, gpointer user_data) {
    CanvasViewData *data = (CanvasViewData *)user_data;
    (void)widget;

    if (!data->dragging)
        return FALSE;

    int px = (int)event->x;
    int py = (int)event->y;
    data->drag_x1 = px;
    data->drag_y1 = py;

    SelectionRect *sel = data->active_selection;
    if (!sel)
        goto redraw;

    if (data->drag_mode == DRAG_MOVE) {
        selection_set_center(sel, px - data->move_off_x, py - data->move_off_y);
        notify_changed(data);
    } else if (data->drag_mode == DRAG_RESIZE) {
        double lx, ly;
        selection_canvas_to_local(sel, px, py, &lx, &ly);
        apply_resize_local(sel, data->resize_handle, lx, ly);
        selection_set_center(sel, data->resize_center_x, data->resize_center_y);
        notify_changed(data);
    } else if (data->drag_mode == DRAG_ROTATE) {
        double cx, cy;
        selection_get_center(sel, &cx, &cy);
        double cur = atan2(py - cy, px - cx);
        double delta = (cur - data->rotate_drag_start) * 180.0 / M_PI;
        sel->place_angle = data->rotate_angle_start + delta;
        while (sel->place_angle > 180.0)
            sel->place_angle -= 360.0;
        while (sel->place_angle < -180.0)
            sel->place_angle += 360.0;
        notify_changed(data);
    }

redraw:
    gtk_widget_queue_draw(data->drawing_area);
    return TRUE;
}

static gboolean on_button_release(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    CanvasViewData *data = (CanvasViewData *)user_data;
    (void)widget;

    if (event->button != 1 || !data->dragging)
        return FALSE;

    data->dragging = FALSE;
    data->drag_x1 = (int)event->x;
    data->drag_y1 = (int)event->y;

    if (data->drag_mode == DRAG_NEW_ROI && data->active_layer) {
        int cx0 = data->drag_x0 < data->drag_x1 ? data->drag_x0 : data->drag_x1;
        int cy0 = data->drag_y0 < data->drag_y1 ? data->drag_y0 : data->drag_y1;
        int cx1 = data->drag_x0 > data->drag_x1 ? data->drag_x0 : data->drag_x1;
        int cy1 = data->drag_y0 > data->drag_y1 ? data->drag_y0 : data->drag_y1;
        int cw = cx1 - cx0;
        int ch = cy1 - cy0;

        if (cw >= 4 && ch >= 4) {
            Layer *layer = data->active_layer;
            int roi_x = cx0 - layer->x;
            int roi_y = cy0 - layer->y;
            if (layer_add_selection(layer, roi_x, roi_y, cw, ch, cx0, cy0, cw, ch)) {
                data->active_selection = layer_selection_last(layer);
                notify_changed(data);
            }
        }
    } else if (data->drag_mode == DRAG_MOVE || data->drag_mode == DRAG_RESIZE ||
               data->drag_mode == DRAG_ROTATE) {
        notify_changed(data);
    }

    data->drag_mode = DRAG_NONE;
    gtk_widget_queue_draw(data->drawing_area);
    return TRUE;
}

GtkWidget *canvas_view_new(ImageProject *project) {
    CanvasViewData *data = g_new0(CanvasViewData, 1);
    data->project = project;

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC,
                                   GTK_POLICY_AUTOMATIC);

    data->drawing_area = gtk_drawing_area_new();
    gtk_widget_set_size_request(data->drawing_area,
                                project->canvas_width,
                                project->canvas_height);
    gtk_widget_add_events(data->drawing_area,
                          GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK |
                              GDK_POINTER_MOTION_MASK);

    g_signal_connect(data->drawing_area, "draw", G_CALLBACK(on_draw), data);
    g_signal_connect(data->drawing_area, "button-press-event", G_CALLBACK(on_button_press), data);
    g_signal_connect(data->drawing_area, "button-release-event", G_CALLBACK(on_button_release), data);
    g_signal_connect(data->drawing_area, "motion-notify-event", G_CALLBACK(on_motion), data);

    gtk_container_add(GTK_CONTAINER(scroll), data->drawing_area);
    g_object_set_data_full(G_OBJECT(scroll), "canvas-view-data", data, g_free);

    return scroll;
}

void canvas_view_set_project(GtkWidget *view, ImageProject *project) {
    CanvasViewData *data = g_object_get_data(G_OBJECT(view), "canvas-view-data");
    if (!data)
        return;
    data->project = project;
    if (data->drawing_area && project) {
        gtk_widget_set_size_request(data->drawing_area,
                                    project->canvas_width,
                                    project->canvas_height);
    }
}

void canvas_view_set_active_layer(GtkWidget *view, Layer *layer) {
    CanvasViewData *data = g_object_get_data(G_OBJECT(view), "canvas-view-data");
    if (!data)
        return;
    data->active_layer = layer;
    if (!layer)
        data->active_selection = NULL;
    else if (!data->active_selection ||
             g_list_find(layer->selections, data->active_selection) == NULL)
        data->active_selection = layer_selection_last(layer);
    data->dragging = FALSE;
    gtk_widget_queue_draw(data->drawing_area);
}

void canvas_view_set_active_selection(GtkWidget *view, SelectionRect *selection) {
    CanvasViewData *data = g_object_get_data(G_OBJECT(view), "canvas-view-data");
    if (!data)
        return;
    data->active_selection = selection;
    gtk_widget_queue_draw(data->drawing_area);
}

SelectionRect *canvas_view_get_active_selection(GtkWidget *view) {
    CanvasViewData *data = g_object_get_data(G_OBJECT(view), "canvas-view-data");
    return data ? data->active_selection : NULL;
}

void canvas_view_refresh(GtkWidget *view) {
    CanvasViewData *data = g_object_get_data(G_OBJECT(view), "canvas-view-data");
    if (!data || !data->drawing_area)
        return;
    gtk_widget_queue_draw(data->drawing_area);
}

void canvas_view_set_changed_callback(GtkWidget *view, CanvasViewChangedFunc func,
                                      gpointer user_data) {
    CanvasViewData *data = g_object_get_data(G_OBJECT(view), "canvas-view-data");
    if (!data)
        return;
    data->changed_cb = func;
    data->changed_data = user_data;
}
