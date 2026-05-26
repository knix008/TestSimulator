#include "gtk/score_view.h"

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <math.h>
#include <pango/pangocairo.h>

/* Default viewport height (px) when the widget has not yet been allocated. */
#define SCORE_VIEW_DEFAULT_H 500

struct ScoreView {
    GtkWidget *overlay;
    GtkWidget *scrolled;
    GtkWidget *da;
    GtkWidget *playhead_overlay;
    GtkWidget *placeholder_layer;
    GtkWidget *placeholder;
    cairo_surface_t *surface;
    int surface_w;
    int surface_h;
    int viewport_width;
    int viewport_height;
    double view_origin_x;
    double view_origin_y;
    int playhead_x;
    int playhead_y;
    int playhead_h;
    int playhead_page;
    int playhead_line;
    gboolean show_playhead;
};

void score_view_ensure_ready(ScoreView *view)
{
    if (!view)
        return;
    if (!gtk_widget_get_realized(view->overlay))
        gtk_widget_realize(view->overlay);
    GdkDisplay *dpy = gtk_widget_get_display(view->overlay);
    if (dpy)
        gdk_display_flush(dpy);
}

static void score_view_read_viewport(ScoreView *view)
{
    GtkAllocation alloc;
    gtk_widget_get_allocation(view->scrolled, &alloc);
    if (alloc.width > 80)
        view->viewport_width = alloc.width;
    if (alloc.height > 80)
        view->viewport_height = alloc.height;
    if (view->viewport_width < 80)
        view->viewport_width = 900;
    if (view->viewport_height < 80)
        view->viewport_height = SCORE_VIEW_DEFAULT_H;
}

static int score_view_vp_w(const ScoreView *view)
{
    if (view->viewport_width > 80)
        return view->viewport_width;
    GtkAllocation alloc;
    gtk_widget_get_allocation(view->scrolled, &alloc);
    return alloc.width > 80 ? alloc.width : 900;
}

static int score_view_vp_h(const ScoreView *view)
{
    if (view->viewport_height > 80)
        return view->viewport_height;
    GtkAllocation alloc;
    gtk_widget_get_allocation(view->scrolled, &alloc);
    return alloc.height > 80 ? alloc.height : SCORE_VIEW_DEFAULT_H;
}

/* Vertical scroll: surface fills viewport width; height scrolls downward. */
static void score_view_window_geometry(const ScoreView *view, double *vis_w, double *vis_h,
                                       double *out_scale)
{
    int sw   = view->surface_w > 0 ? view->surface_w : 800;
    int vp_w = score_view_vp_w(view);
    int vp_h = score_view_vp_h(view);

    double s = (double)vp_w / (double)sw;
    if (s < 0.25) s = 0.25;
    if (s > 4.0)  s = 4.0;

    *vis_w    = (double)sw;
    *vis_h    = (double)vp_h / s;
    *out_scale = s;
}

static double score_view_display_scale(const ScoreView *view)
{
    double vis_w = 0.0, vis_h = 0.0, s = 1.0;
    score_view_window_geometry(view, &vis_w, &vis_h, &s);
    return s;
}

static void score_view_apply_size_request(ScoreView *view)
{
    score_view_read_viewport(view);
    gtk_widget_set_size_request(view->da, view->viewport_width, view->viewport_height);
    gtk_widget_queue_allocate(view->da);
}

static void score_view_queue_playhead_redraw(ScoreView *view)
{
    if (!view)
        return;
    if (view->da && GTK_IS_WIDGET(view->da))
        gtk_widget_queue_draw(view->da);
}

static void score_view_update_view_origin(ScoreView *view)
{
    if (!view->surface || view->surface_h < 1)
        return;

    double vis_w = 0.0, vis_h = 0.0, s = 1.0;
    score_view_window_geometry(view, &vis_w, &vis_h, &s);

    view->view_origin_x = 0.0;
    view->view_origin_y = (double)view->playhead_y - vis_h * 0.35;

    double max_y = (double)view->surface_h - vis_h;
    if (max_y < 0.0) max_y = 0.0;
    if (view->view_origin_y < 0.0) view->view_origin_y = 0.0;
    if (view->view_origin_y > max_y) view->view_origin_y = max_y;
}

static void score_view_paint_playhead(cairo_t *cr, const ScoreView *view)
{
    if (!view->show_playhead)
        return;

    /* x: playhead position within the current system row (surface coordinates).
     * y0/y1: span the full system row height — no pitch offset. */
    double x  = (double)view->playhead_x;
    double y0 = (double)view->playhead_y - view->view_origin_y;
    double y1 = y0 + (double)(view->playhead_h > 0 ? view->playhead_h : 120);

    cairo_save(cr);
    cairo_set_source_rgba(cr, 1.0, 0.0, 0.0, 0.85);
    cairo_set_line_width(cr, 3.0 / score_view_display_scale(view));
    cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT);
    cairo_move_to(cr, x + 0.5, y0);
    cairo_line_to(cr, x + 0.5, y1);
    cairo_stroke(cr);
    cairo_restore(cr);
}

static void score_view_draw_placeholder(cairo_t *cr, GtkWidget *widget, int w, int h)
{
    cairo_set_source_rgb(cr, 0.95, 0.95, 0.97);
    cairo_paint(cr);

    if (w < 1 || h < 1)
        return;

    const char *text = "MIDI 파일을 열어보세요.";
    PangoLayout *layout = gtk_widget_create_pango_layout(widget, text);
    PangoFontDescription *font = pango_font_description_from_string("Sans 15");
    pango_layout_set_font_description(layout, font);
    pango_font_description_free(font);
    pango_layout_set_alignment(layout, PANGO_ALIGN_CENTER);
    pango_layout_set_width(layout, w * PANGO_SCALE);

    int tw = 0, th = 0;
    pango_layout_get_pixel_size(layout, &tw, &th);

    cairo_set_source_rgb(cr, 0.42, 0.44, 0.48);
    cairo_move_to(cr, 0.0, ((double)h - (double)th) * 0.5);
    pango_cairo_show_layout(cr, layout);
    g_object_unref(layout);
}

static gboolean on_score_draw(GtkWidget *widget, cairo_t *cr, gpointer data)
{
    ScoreView *view = data;

    int alloc_w = gtk_widget_get_allocated_width(widget);
    int alloc_h = gtk_widget_get_allocated_height(widget);

    if (!view->surface) {
        score_view_draw_placeholder(cr, widget, alloc_w, alloc_h);
        return FALSE;
    }

    cairo_set_source_rgb(cr, 0.95, 0.95, 0.97);
    cairo_paint(cr);

    if (alloc_w < 1 || alloc_h < 1)
        return FALSE;

    double vis_w = 0.0, vis_h = 0.0, s = 1.0;
    score_view_window_geometry(view, &vis_w, &vis_h, &s);

    cairo_save(cr);
    cairo_rectangle(cr, 0.0, 0.0, (double)alloc_w, (double)alloc_h);
    cairo_clip(cr);
    cairo_scale(cr, s, s);
    cairo_rectangle(cr, 0.0, 0.0, vis_w, vis_h);
    cairo_clip(cr);

    int oy = (int)view->view_origin_y;
    int sw = view->surface_w;
    int sh = view->surface_h;
    int ch = (int)ceil(vis_h) + 8;

    if (oy < 0) oy = 0;
    if (oy >= sh) oy = sh > 1 ? sh - 1 : 0;
    if (oy + ch > sh) ch = sh - oy;
    if (ch < 1) ch = 1;
    if (sw < 1) sw = 1;

    GdkPixbuf *tile = gdk_pixbuf_get_from_surface(view->surface, 0, oy, sw, ch);
    if (tile) {
        gdk_cairo_set_source_pixbuf(cr, tile, 0.0, 0.0);
        cairo_pattern_set_filter(cairo_get_source(cr), CAIRO_FILTER_GOOD);
        cairo_paint(cr);
        g_object_unref(tile);
    } else {
        cairo_set_source_surface(cr, view->surface, 0.0, -view->view_origin_y);
        cairo_pattern_set_filter(cairo_get_source(cr), CAIRO_FILTER_GOOD);
        cairo_paint(cr);
    }

    score_view_paint_playhead(cr, view);
    cairo_restore(cr);

    return FALSE;
}

static gboolean on_placeholder_draw(GtkWidget *widget, cairo_t *cr, gpointer data)
{
    (void)data;
    int w = gtk_widget_get_allocated_width(widget);
    int h = gtk_widget_get_allocated_height(widget);
    score_view_draw_placeholder(cr, widget, w, h);
    return FALSE;
}

static void score_view_set_empty_state(ScoreView *view, gboolean empty)
{
    if (!view)
        return;

    if (empty) {
        gtk_widget_show(view->placeholder_layer);
        gtk_widget_set_size_request(view->da, -1, -1);
    } else {
        gtk_widget_hide(view->placeholder_layer);
    }
}

static void on_scrolled_allocate(GtkWidget *widget, GtkAllocation *alloc, gpointer data)
{
    ScoreView *view = data;
    (void)widget;

    if (alloc->width > 80)
        view->viewport_width = alloc->width;
    if (alloc->height > 80)
        view->viewport_height = alloc->height;
    score_view_apply_size_request(view);
    if (view->surface)
        score_view_update_view_origin(view);
    score_view_queue_playhead_redraw(view);
}

ScoreView *score_view_new(void)
{
    ScoreView *view = g_new0(ScoreView, 1);

    view->overlay = gtk_overlay_new();
    view->scrolled = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_hexpand(view->scrolled, TRUE);
    gtk_widget_set_vexpand(view->scrolled, TRUE);

    view->da = gtk_drawing_area_new();
    gtk_widget_set_hexpand(view->da, FALSE);
    gtk_widget_set_vexpand(view->da, FALSE);
    gtk_widget_set_halign(view->da, GTK_ALIGN_FILL);
    gtk_widget_set_valign(view->da, GTK_ALIGN_FILL);
    gtk_widget_set_size_request(view->da, 900, SCORE_VIEW_DEFAULT_H);
    g_signal_connect(view->da, "draw", G_CALLBACK(on_score_draw), view);

    gtk_box_pack_start(GTK_BOX(view->scrolled), view->da, FALSE, FALSE, 0);
    gtk_container_add(GTK_CONTAINER(view->overlay), view->scrolled);
    g_signal_connect(view->scrolled, "size-allocate", G_CALLBACK(on_scrolled_allocate), view);

    view->playhead_overlay = gtk_drawing_area_new();
    gtk_overlay_add_overlay(GTK_OVERLAY(view->overlay), view->playhead_overlay);
    gtk_overlay_set_overlay_pass_through(GTK_OVERLAY(view->overlay), view->playhead_overlay, TRUE);
    gtk_widget_set_sensitive(view->playhead_overlay, FALSE);

    view->placeholder = gtk_label_new("MIDI 파일을 열어보세요.");
    view->placeholder_layer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_box_pack_start(GTK_BOX(view->placeholder_layer), view->placeholder, TRUE, TRUE, 0);
    g_signal_connect(view->placeholder_layer, "draw", G_CALLBACK(on_placeholder_draw), view);
    gtk_overlay_add_overlay(GTK_OVERLAY(view->overlay), view->placeholder_layer);

    view->viewport_width  = 900;
    view->viewport_height = SCORE_VIEW_DEFAULT_H;
    score_view_set_empty_state(view, TRUE);
    return view;
}

GtkWidget *score_view_widget(ScoreView *view)
{
    return view->overlay;
}

void score_view_set_surface(ScoreView *view, cairo_surface_t *surface, int w, int h)
{
    if (!view)
        return;

    score_view_ensure_ready(view);

    if (view->surface) {
        cairo_surface_destroy(view->surface);
        view->surface = NULL;
    }

    view->surface = surface;
    if (surface)
        cairo_surface_flush(surface);
    view->surface_w = w > 0 ? w : (surface ? cairo_image_surface_get_width(surface) : 0);
    view->surface_h = h > 0 ? h : (surface ? cairo_image_surface_get_height(surface) : 0);
    view->view_origin_x = 0.0;
    view->view_origin_y = 0.0;

    if (view->surface) {
        score_view_set_empty_state(view, FALSE);
        score_view_apply_size_request(view);
    } else {
        score_view_set_empty_state(view, TRUE);
    }
    score_view_queue_playhead_redraw(view);
}

gboolean score_view_load(ScoreView *view, ScoreVerovio *score, ScoreProgressFn progress,
                         gpointer progress_data, GError **err)
{
    cairo_surface_t *surface = score_verovio_render_surface(score, 1.0, &view->surface_w,
                                                            &view->surface_h, progress,
                                                            progress_data);
    if (!surface) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Score rendering failed");
        return FALSE;
    }

    view->playhead_h = score_verovio_playhead_bar_h(score);
    if (view->playhead_h < 1)
        view->playhead_h = 120;

    score_view_set_surface(view, surface, view->surface_w, view->surface_h);
    return TRUE;
}

void score_view_set_viewport_width(ScoreView *view, int width_px)
{
    score_view_set_viewport_size(view, width_px, view->viewport_height);
}

void score_view_set_viewport_size(ScoreView *view, int width_px, int height_px)
{
    if (!view)
        return;
    if (width_px > 0)
        view->viewport_width = width_px;
    if (height_px > 0)
        view->viewport_height = height_px;
    score_view_apply_size_request(view);
    if (view->surface && view->show_playhead)
        score_view_update_view_origin(view);
    score_view_queue_playhead_redraw(view);
}

void score_view_reset_scroll_tracking(ScoreView *view)
{
    (void)view;
}

void score_view_set_playhead(ScoreView *view, ScoreVerovio *score,
                             double current_sec, double duration_sec, gboolean visible,
                             ScoreScrollMode scroll_mode)
{
    if (!view)
        return;

    view->show_playhead = visible && view->surface != NULL;

    if (view->show_playhead) {
        if (score) {
            int bh = score_verovio_playhead_bar_h(score);
            if (bh > 0)
                view->playhead_h = bh;
        }

        int page = 0, line = 0;
        if (score && score_verovio_playhead_at_time(score, current_sec, duration_sec,
                                                    &view->playhead_x, &view->playhead_y,
                                                    &view->playhead_h, &page, &line)) {
            view->playhead_page = page;
            view->playhead_line = line;
        } else if (duration_sec > 0.0 && view->surface_w > 0) {
            double t = current_sec / duration_sec;
            if (t < 0.0)
                t = 0.0;
            if (t > 1.0)
                t = 1.0;
            view->playhead_x = (int)(t * (double)view->surface_w * 0.92);
            if (view->playhead_x < 40)
                view->playhead_x = 40;
            view->playhead_page = 0;
            view->playhead_line = 0;
        }

        if (scroll_mode == SCORE_SCROLL_FOLLOW || scroll_mode == SCORE_SCROLL_JUMP)
            score_view_update_view_origin(view);
    }

    score_view_queue_playhead_redraw(view);
}

void score_view_clear(ScoreView *view)
{
    if (view->surface) {
        cairo_surface_destroy(view->surface);
        view->surface = NULL;
    }
    view->surface_w = view->surface_h = 0;
    view->viewport_width = 0;
    view->viewport_height = 0;
    view->view_origin_x = view->view_origin_y = 0.0;
    view->show_playhead = FALSE;
    view->playhead_x = view->playhead_y = view->playhead_h = 0;
    view->playhead_page = view->playhead_line = 0;
    gtk_widget_set_size_request(view->da, -1, -1);
    score_view_set_empty_state(view, TRUE);
    score_view_queue_playhead_redraw(view);
}
