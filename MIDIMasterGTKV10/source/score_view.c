#include "score_view.h"

#include <math.h>
#include <pango/pangocairo.h>

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
    int playhead_x;
    int playhead_y;
    int playhead_h;
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

static double score_view_scale_x(const ScoreView *view, int alloc_w)
{
    if (!view->surface || view->surface_w < 1)
        return 1.0;
    int target = alloc_w > 0 ? alloc_w : view->viewport_width;
    if (target < 1)
        target = view->surface_w;
    return (double)target / (double)view->surface_w;
}

static void score_view_apply_size_request(ScoreView *view)
{
    if (!view->surface || view->surface_w < 1)
        return;

    int w = view->viewport_width;
    if (w < 1)
        w = view->surface_w;

    double sx = score_view_scale_x(view, w);
    int h = (int)ceil((double)view->surface_h * sx);
    if (h < 1)
        h = 1;

    gtk_widget_set_size_request(view->da, w, h);
    gtk_widget_queue_allocate(view->da);
}

static void score_view_queue_playhead_redraw(ScoreView *view)
{
    if (!view)
        return;
    if (view->playhead_overlay && GTK_IS_WIDGET(view->playhead_overlay))
        gtk_widget_queue_draw(view->playhead_overlay);
    if (view->da && GTK_IS_WIDGET(view->da))
        gtk_widget_queue_draw(view->da);
}

static void score_view_scroll_to_playhead(ScoreView *view, double sx)
{
    GtkAdjustment *vadj = gtk_scrolled_window_get_vadjustment(GTK_SCROLLED_WINDOW(view->scrolled));
    if (!vadj)
        return;

    double page = gtk_adjustment_get_page_size(vadj);
    double upper = gtk_adjustment_get_upper(vadj);
    if (page <= 0 || upper <= page)
        return;

    int bar_h = view->playhead_h > 0 ? view->playhead_h : 180;
    double center = ((double)view->playhead_y + (double)bar_h * 0.5) * sx;
    double target = center - page * 0.4;
    if (target < 0.0)
        target = 0.0;
    if (target > upper - page)
        target = upper - page;
    gtk_adjustment_set_value(vadj, target);
}

static void score_view_draw_playhead_bar(cairo_t *cr, double x, double y0, double y1, int clip_h)
{
    if (y1 < 0.0 || y0 > (double)clip_h)
        return;
    if (y0 < 0.0)
        y0 = 0.0;
    if (y1 > (double)clip_h)
        y1 = (double)clip_h;

    cairo_save(cr);
    cairo_set_source_rgba(cr, 1.0, 0.0, 0.0, 0.92);
    cairo_set_line_width(cr, 3.0);
    cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
    cairo_move_to(cr, x + 0.5, y0);
    cairo_line_to(cr, x + 0.5, y1);
    cairo_stroke(cr);
    cairo_restore(cr);
}

static gboolean on_playhead_overlay_draw(GtkWidget *widget, cairo_t *cr, gpointer data)
{
    ScoreView *view = data;
    (void)widget;

    if (!view->show_playhead || !view->surface)
        return FALSE;

    int panel_h = gtk_widget_get_allocated_height(view->scrolled);
    int panel_w = gtk_widget_get_allocated_width(view->scrolled);
    if (panel_h < 1 || panel_w < 1)
        return FALSE;

    int alloc_w = gtk_widget_get_allocated_width(view->da);
    if (alloc_w < 1)
        alloc_w = view->viewport_width;
    double sx = score_view_scale_x(view, alloc_w);

    GtkAdjustment *vadj = gtk_scrolled_window_get_vadjustment(GTK_SCROLLED_WINDOW(view->scrolled));
    double scroll_y = vadj ? gtk_adjustment_get_value(vadj) : 0.0;

    int bar_h = view->playhead_h > 0 ? view->playhead_h : 180;
    double x = (double)view->playhead_x * sx;
    double y0 = (double)view->playhead_y * sx - scroll_y;
    double y1 = y0 + (double)bar_h * sx;

    /* At least ~95% of the visible panel so the line is easy to see while scrolling. */
    double want_h = (double)panel_h * 0.95;
    if (y1 - y0 < want_h) {
        double cy = (y0 + y1) * 0.5;
        y0 = cy - want_h * 0.5;
        y1 = cy + want_h * 0.5;
    }

    score_view_draw_playhead_bar(cr, x, y0, y1, panel_h);
    return FALSE;
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

    if (alloc_w > 0) {
        double sx = score_view_scale_x(view, alloc_w);
        cairo_save(cr);
        cairo_scale(cr, sx, sx);
        cairo_set_source_surface(cr, view->surface, 0, 0);
        cairo_pattern_set_filter(cairo_get_source(cr), CAIRO_FILTER_GOOD);
        cairo_paint(cr);
        cairo_restore(cr);
    }

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

static void on_scroll_adjustment_changed(GtkAdjustment *adj, gpointer data)
{
    ScoreView *view = data;
    (void)adj;
    if (view->show_playhead)
        gtk_widget_queue_draw(view->playhead_overlay);
}

ScoreView *score_view_new(void)
{
    ScoreView *view = g_new0(ScoreView, 1);

    view->overlay = gtk_overlay_new();
    view->scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(view->scrolled),
                                 GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_shadow_type(GTK_SCROLLED_WINDOW(view->scrolled),
                                        GTK_SHADOW_NONE);

    view->da = gtk_drawing_area_new();
    gtk_widget_set_hexpand(view->da, TRUE);
    gtk_widget_set_halign(view->da, GTK_ALIGN_FILL);
    gtk_widget_set_size_request(view->da, 600, 400);
    g_signal_connect(view->da, "draw", G_CALLBACK(on_score_draw), view);

    gtk_container_add(GTK_CONTAINER(view->scrolled), view->da);
    gtk_container_add(GTK_CONTAINER(view->overlay), view->scrolled);

    view->playhead_overlay = gtk_drawing_area_new();
    gtk_widget_set_halign(view->playhead_overlay, GTK_ALIGN_FILL);
    gtk_widget_set_valign(view->playhead_overlay, GTK_ALIGN_FILL);
    gtk_widget_set_hexpand(view->playhead_overlay, TRUE);
    gtk_widget_set_vexpand(view->playhead_overlay, TRUE);
    gtk_overlay_add_overlay(GTK_OVERLAY(view->overlay), view->playhead_overlay);
    gtk_overlay_set_overlay_pass_through(GTK_OVERLAY(view->overlay), view->playhead_overlay, TRUE);
    g_signal_connect(view->playhead_overlay, "draw", G_CALLBACK(on_playhead_overlay_draw), view);

    GtkAdjustment *vadj = gtk_scrolled_window_get_vadjustment(GTK_SCROLLED_WINDOW(view->scrolled));
    if (vadj)
        g_signal_connect(vadj, "value-changed", G_CALLBACK(on_scroll_adjustment_changed), view);

    view->placeholder = gtk_label_new("MIDI 파일을 열어보세요.");
    gtk_label_set_xalign(GTK_LABEL(view->placeholder), 0.5);
    gtk_label_set_yalign(GTK_LABEL(view->placeholder), 0.5);
    gtk_widget_set_halign(view->placeholder, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(view->placeholder, GTK_ALIGN_CENTER);
    gtk_style_context_add_class(gtk_widget_get_style_context(view->placeholder),
                                "dim-label");

    view->placeholder_layer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_hexpand(view->placeholder_layer, TRUE);
    gtk_widget_set_vexpand(view->placeholder_layer, TRUE);
    gtk_widget_set_halign(view->placeholder_layer, GTK_ALIGN_FILL);
    gtk_widget_set_valign(view->placeholder_layer, GTK_ALIGN_FILL);
    gtk_box_pack_start(GTK_BOX(view->placeholder_layer), view->placeholder, TRUE, TRUE, 0);
    g_signal_connect(view->placeholder_layer, "draw", G_CALLBACK(on_placeholder_draw), view);
    gtk_overlay_add_overlay(GTK_OVERLAY(view->overlay), view->placeholder_layer);

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
    view->surface_w = w > 0 ? w : (surface ? cairo_image_surface_get_width(surface) : 0);
    view->surface_h = h > 0 ? h : (surface ? cairo_image_surface_get_height(surface) : 0);

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

    score_view_set_surface(view, surface, view->surface_w, view->surface_h);
    return TRUE;
}

void score_view_set_viewport_width(ScoreView *view, int width_px)
{
    if (!view || width_px < 1)
        return;
    view->viewport_width = width_px;
    score_view_apply_size_request(view);
    score_view_queue_playhead_redraw(view);
}

void score_view_set_playhead(ScoreView *view, ScoreVerovio *score,
                             double current_sec, double duration_sec, gboolean visible)
{
    if (!view)
        return;

    view->show_playhead = visible && view->surface != NULL;

    if (view->show_playhead) {
        if (score && score_verovio_playhead_at_time(score, current_sec, duration_sec,
                                                    &view->playhead_x, &view->playhead_y,
                                                    &view->playhead_h)) {
            if (view->playhead_h < 100)
                view->playhead_h = 100;
        } else if (duration_sec > 0.0 && view->surface_h > 0) {
            double t = current_sec / duration_sec;
            if (t < 0.0)
                t = 0.0;
            if (t > 1.0)
                t = 1.0;
            view->playhead_y = 0;
            view->playhead_h = view->surface_h;
            view->playhead_x = (int)(t * (double)view->surface_w * 0.85);
            if (view->playhead_x < 80)
                view->playhead_x = 80;
        }

        int alloc_w = gtk_widget_get_allocated_width(view->da);
        if (alloc_w < 1)
            alloc_w = view->viewport_width;
        score_view_scroll_to_playhead(view, score_view_scale_x(view, alloc_w));
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
    view->show_playhead = FALSE;
    view->playhead_x = view->playhead_y = view->playhead_h = 0;
    gtk_widget_set_size_request(view->da, -1, -1);
    score_view_set_empty_state(view, TRUE);
    score_view_queue_playhead_redraw(view);
}
