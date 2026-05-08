/*
 * screenshot-area-selection.c - based on GNOME Screenshot source
 * Original: src/screenshot-area-selection.c
 *
 * Creates a full-screen, transparent, grab-owning GTK window that the user
 * can drag across to pick a rectangular region.  The same rubber-band
 * technique is used by gnome-screenshot's area-selection dialog:
 *  - a fullscreen, undecorated, RGBA window captures all pointer/keyboard
 *    events via gdk_seat_grab()
 *  - the "draw" handler renders a dimmed overlay with a bright selection box
 *  - on button-release the callback is fired and the window is destroyed
 */

#include "screenshot-area-selection.h"
#include "screenshot.h"
#include <stdlib.h>
#include <stdio.h>

typedef struct {
    GtkWidget            *window;
    GdkPixbuf            *desktop_pixbuf; /* background snapshot */
    gboolean              dragging;
    gint                  start_x, start_y;
    gint                  end_x,   end_y;
    AreaSelectionCallback callback;
    gpointer              user_data;
} AreaSelectionData;

/* ---- helpers ------------------------------------------------------------ */

static void
get_selection_rect (AreaSelectionData *asd, GdkRectangle *rect)
{
    rect->x      = MIN (asd->start_x, asd->end_x);
    rect->y      = MIN (asd->start_y, asd->end_y);
    rect->width  = abs (asd->end_x - asd->start_x);
    rect->height = abs (asd->end_y - asd->start_y);
}

static void
finish_selection (AreaSelectionData *asd, gboolean cancelled)
{
    GdkSeat *seat;

    seat = gdk_display_get_default_seat (gdk_display_get_default ());
    gdk_seat_ungrab (seat);

    gtk_widget_hide (asd->window);

    if (!cancelled) {
        GdkRectangle rect;
        get_selection_rect (asd, &rect);
        if (rect.width > 1 && rect.height > 1)
            asd->callback (&rect, asd->user_data);
        else
            asd->callback (NULL, asd->user_data);
    } else {
        asd->callback (NULL, asd->user_data);
    }

    gtk_widget_destroy (asd->window);
}

/* ---- signal handlers ---------------------------------------------------- */

/* Draw a filled rounded-rectangle label at (lx, ly) with text. */
static void
draw_size_label (cairo_t *cr, double lx, double ly,
                 int sel_w, int sel_h, int screen_w, int screen_h)
{
    char label[64];
    snprintf (label, sizeof (label), " %d × %d ", sel_w, sel_h);

    cairo_select_font_face (cr, "Sans", CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_BOLD);
    cairo_set_font_size    (cr, 14.0);

    cairo_text_extents_t te;
    cairo_text_extents (cr, label, &te);

    double pad  = 5.0;
    double bw   = te.width  + pad * 2;
    double bh   = te.height + pad * 2;

    /* Keep label inside screen */
    if (lx + bw > screen_w) lx = screen_w - bw - 4;
    if (lx < 4)             lx = 4;
    if (ly + bh > screen_h) ly = screen_h - bh - 4;
    if (ly < 4)             ly = 4;

    /* Dark semi-transparent background */
    cairo_set_source_rgba (cr, 0.0, 0.0, 0.0, 0.75);
    cairo_rectangle       (cr, lx, ly, bw, bh);
    cairo_fill            (cr);

    /* White text */
    cairo_set_source_rgba (cr, 1.0, 1.0, 1.0, 1.0);
    cairo_move_to         (cr, lx + pad - te.x_bearing,
                               ly + pad - te.y_bearing);
    cairo_show_text       (cr, label);
}

/* Draw small square handles at each corner of the selection. */
static void
draw_corner_handles (cairo_t *cr, GdkRectangle *sel)
{
    const double hs = 6.0; /* handle half-size */
    double corners[4][2] = {
        { sel->x,              sel->y               },
        { sel->x + sel->width, sel->y               },
        { sel->x,              sel->y + sel->height },
        { sel->x + sel->width, sel->y + sel->height },
    };

    cairo_set_source_rgba (cr, 1.0, 1.0, 1.0, 1.0);
    for (int i = 0; i < 4; i++) {
        cairo_rectangle (cr,
                         corners[i][0] - hs, corners[i][1] - hs,
                         hs * 2,             hs * 2);
        cairo_fill (cr);
    }
}

static gboolean
on_draw (GtkWidget *widget, cairo_t *cr, gpointer user_data)
{
    AreaSelectionData *asd = (AreaSelectionData *)user_data;
    gint               w   = gtk_widget_get_allocated_width  (widget);
    gint               h   = gtk_widget_get_allocated_height (widget);

    /* Draw the frozen desktop snapshot as background */
    if (asd->desktop_pixbuf) {
        gdk_cairo_set_source_pixbuf (cr, asd->desktop_pixbuf, 0, 0);
        cairo_paint (cr);
    }

    /* Dim the whole screen – same as gnome-screenshot's overlay */
    cairo_set_source_rgba (cr, 0.0, 0.0, 0.0, 0.5);
    cairo_rectangle (cr, 0, 0, w, h);
    cairo_fill (cr);

    if (asd->dragging) {
        GdkRectangle sel;
        get_selection_rect (asd, &sel);

        if (sel.width > 1 && sel.height > 1) {
            /* Cut a hole through the dim so the selected area shows clearly */
            cairo_set_operator (cr, CAIRO_OPERATOR_CLEAR);
            cairo_rectangle    (cr, sel.x, sel.y, sel.width, sel.height);
            cairo_fill         (cr);

            /* White border around the selection */
            cairo_set_operator    (cr, CAIRO_OPERATOR_OVER);
            cairo_set_source_rgba (cr, 1.0, 1.0, 1.0, 0.9);
            cairo_set_line_width  (cr, 1.5);
            cairo_rectangle       (cr, sel.x + 0.5, sel.y + 0.5,
                                       sel.width - 1, sel.height - 1);
            cairo_stroke          (cr);

            /* Corner handles */
            draw_corner_handles (cr, &sel);

            /* Dimension label just below the bottom-right corner */
            draw_size_label (cr,
                             sel.x + sel.width  + 8,
                             sel.y + sel.height + 8,
                             sel.width, sel.height, w, h);
        }
    } else if (!asd->dragging &&
               asd->start_x == 0 && asd->start_y == 0 &&
               asd->end_x == 0 && asd->end_y == 0) {
        /* Before first drag: show a crosshair hint at screen center */
        const double cx = w / 2.0, cy = h / 2.0, cl = 20.0;
        cairo_set_operator    (cr, CAIRO_OPERATOR_OVER);
        cairo_set_source_rgba (cr, 1.0, 1.0, 1.0, 0.7);
        cairo_set_line_width  (cr, 1.5);
        cairo_move_to (cr, cx - cl, cy); cairo_line_to (cr, cx + cl, cy);
        cairo_move_to (cr, cx, cy - cl); cairo_line_to (cr, cx, cy + cl);
        cairo_stroke (cr);
    }

    return FALSE;
}

static gboolean
on_button_press (GtkWidget *widget, GdkEventButton *event, gpointer user_data)
{
    AreaSelectionData *asd = (AreaSelectionData *)user_data;
    (void)widget;

    if (event->button == GDK_BUTTON_PRIMARY) {
        asd->dragging = TRUE;
        asd->start_x  = (gint)event->x_root;
        asd->start_y  = (gint)event->y_root;
        asd->end_x    = asd->start_x;
        asd->end_y    = asd->start_y;
    }
    return TRUE;
}

static gboolean
on_button_release (GtkWidget *widget, GdkEventButton *event, gpointer user_data)
{
    AreaSelectionData *asd = (AreaSelectionData *)user_data;
    (void)widget;

    if (event->button == GDK_BUTTON_PRIMARY && asd->dragging) {
        asd->dragging = FALSE;
        asd->end_x    = (gint)event->x_root;
        asd->end_y    = (gint)event->y_root;
        finish_selection (asd, FALSE);
    }
    return TRUE;
}

static gboolean
on_motion_notify (GtkWidget *widget, GdkEventMotion *event, gpointer user_data)
{
    AreaSelectionData *asd = (AreaSelectionData *)user_data;

    if (asd->dragging) {
        asd->end_x = (gint)event->x_root;
        asd->end_y = (gint)event->y_root;
        gtk_widget_queue_draw (widget);
    }
    return TRUE;
}

static gboolean
on_key_press (GtkWidget *widget, GdkEventKey *event, gpointer user_data)
{
    AreaSelectionData *asd = (AreaSelectionData *)user_data;
    (void)widget;

    if (event->keyval == GDK_KEY_Escape) {
        finish_selection (asd, TRUE);
        return TRUE;
    }
    return FALSE;
}

/* ---- public API --------------------------------------------------------- */

void
screenshot_select_area_async (AreaSelectionCallback callback,
                               gpointer              user_data)
{
    AreaSelectionData *asd;
    GtkWidget         *window;
    GdkScreen         *screen;
    GdkVisual         *visual;
    GdkDisplay        *display;
    GdkSeat           *seat;
    GdkCursor         *cursor;

    asd            = g_new0 (AreaSelectionData, 1);
    asd->callback  = callback;
    asd->user_data = user_data;

    /* Capture the desktop directly using X11 for immediate feedback.
     * This works even on Wayland because the window is already hidden. */
    g_print ("Capturing background for area selection...\n");
    asd->desktop_pixbuf = capture_x11 (SCREENSHOT_MODE_FULL_SCREEN,
                                       NULL, FALSE, FALSE);
    
    if (!asd->desktop_pixbuf) {
        g_warning ("Failed to capture background for area selection");
        /* Continue anyway with no background */
    } else {
        g_print ("Background captured: %dx%d\n",
                gdk_pixbuf_get_width (asd->desktop_pixbuf),
                gdk_pixbuf_get_height (asd->desktop_pixbuf));
    }

    /* Create the overlay window */
    window = gtk_window_new (GTK_WINDOW_TOPLEVEL);
    asd->window = window;

    gtk_window_set_decorated          (GTK_WINDOW (window), FALSE);
    gtk_window_set_skip_taskbar_hint  (GTK_WINDOW (window), TRUE);
    gtk_window_set_skip_pager_hint    (GTK_WINDOW (window), TRUE);
    gtk_window_set_keep_above         (GTK_WINDOW (window), TRUE);
    gtk_widget_set_app_paintable      (window, TRUE);

    /* Use an RGBA visual so the selection punch-through is truly transparent */
    screen = gtk_widget_get_screen (window);
    visual = gdk_screen_get_rgba_visual (screen);
    if (visual)
        gtk_widget_set_visual (window, visual);

    gtk_widget_add_events (window,
                           GDK_BUTTON_PRESS_MASK   |
                           GDK_BUTTON_RELEASE_MASK |
                           GDK_POINTER_MOTION_MASK |
                           GDK_KEY_PRESS_MASK);

    g_signal_connect (window, "draw",                 G_CALLBACK (on_draw),           asd);
    g_signal_connect (window, "button-press-event",   G_CALLBACK (on_button_press),   asd);
    g_signal_connect (window, "button-release-event", G_CALLBACK (on_button_release), asd);
    g_signal_connect (window, "motion-notify-event",  G_CALLBACK (on_motion_notify),  asd);
    g_signal_connect (window, "key-press-event",      G_CALLBACK (on_key_press),      asd);

    gtk_window_fullscreen (GTK_WINDOW (window));
    gtk_widget_show_all   (window);

    /* Grab pointer and keyboard – same as gnome-screenshot to prevent
     * other windows from receiving events during selection. */
    display = gdk_display_get_default ();
    seat    = gdk_display_get_default_seat (display);
    cursor  = gdk_cursor_new_from_name (display, "crosshair");

    gdk_seat_grab (seat,
                   gtk_widget_get_window (window),
                   GDK_SEAT_CAPABILITY_ALL,
                   FALSE,
                   cursor,
                   NULL, NULL, NULL);

    g_object_unref (cursor);
}
