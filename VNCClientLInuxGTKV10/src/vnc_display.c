#include "vnc_display.h"
#include <cairo.h>
#include <string.h>

struct _VncDisplay {
    GtkDrawingArea parent;
    VncClient     *client;
    VncScaleMode   scale_mode;
    gint           remote_w;
    gint           remote_h;
    gdouble        mouse_x;
    gdouble        mouse_y;
    guint8         mouse_buttons;
};

G_DEFINE_TYPE(VncDisplay, vnc_display, GTK_TYPE_DRAWING_AREA)

static void update_size_request(VncDisplay *self) {
    if (self->remote_w <= 0 || self->remote_h <= 0) {
        gtk_widget_set_size_request(GTK_WIDGET(self), 320, 240);
        return;
    }

    if (self->scale_mode == VNC_SCALE_NONE) {
        gtk_widget_set_size_request(GTK_WIDGET(self), self->remote_w, self->remote_h);
    } else {
        gtk_widget_set_size_request(GTK_WIDGET(self), 1, 1);
    }
}

/* ------------------------------------------------------------------ scale */

static void compute_scale(VncDisplay *self, gint alloc_w, gint alloc_h,
                           gdouble *sx, gdouble *sy, gint *off_x, gint *off_y) {
    *sx = 1.0; *sy = 1.0; *off_x = 0; *off_y = 0;
    if (self->remote_w <= 0 || self->remote_h <= 0) return;

    switch (self->scale_mode) {
    case VNC_SCALE_FIT: {
        gdouble rw = (gdouble)alloc_w / self->remote_w;
        gdouble rh = (gdouble)alloc_h / self->remote_h;
        gdouble r  = MIN(rw, rh);
        *sx = *sy = r;
        *off_x = (gint)((alloc_w - self->remote_w * r) / 2.0);
        *off_y = (gint)((alloc_h - self->remote_h * r) / 2.0);
        break;
    }
    case VNC_SCALE_FILL:
        *sx = (gdouble)alloc_w / self->remote_w;
        *sy = (gdouble)alloc_h / self->remote_h;
        break;
    case VNC_SCALE_NONE:
    default:
        break;
    }
}

/* ------------------------------------------------------------------ draw */

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer ud) {
    (void)ud;
    VncDisplay *self = VNC_DISPLAY(widget);
    if (!self->client || !vnc_client_is_connected(self->client)) {
        /* Dark background with status text */
        cairo_set_source_rgb(cr, 0.1, 0.1, 0.1);
        cairo_paint(cr);
        cairo_set_source_rgb(cr, 0.6, 0.6, 0.6);
        cairo_select_font_face(cr, "Sans", CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_NORMAL);
        cairo_set_font_size(cr, 16.0);
        cairo_move_to(cr, 20, 40);
        cairo_show_text(cr, "Not connected");
        return FALSE;
    }

    gint aw = gtk_widget_get_allocated_width(widget);
    gint ah = gtk_widget_get_allocated_height(widget);
    gdouble sx, sy; gint ox, oy;
    compute_scale(self, aw, ah, &sx, &sy, &ox, &oy);

    const uint32_t *fb = vnc_client_lock_fb(self->client);
    if (!fb) { vnc_client_unlock_fb(self->client); return FALSE; }

    gint rw = vnc_client_get_width(self->client);
    gint rh = vnc_client_get_height(self->client);

    /* Wrap framebuffer in a cairo surface (no copy) */
    cairo_surface_t *surf = cairo_image_surface_create_for_data(
        (unsigned char *)fb,
        CAIRO_FORMAT_RGB24,
        rw, rh,
        rw * 4);

    cairo_translate(cr, ox, oy);
    cairo_scale(cr, sx, sy);
    cairo_set_source_surface(cr, surf, 0, 0);
    cairo_pattern_set_filter(cairo_get_source(cr),
        (sx < 1.0 || sy < 1.0) ? CAIRO_FILTER_BILINEAR : CAIRO_FILTER_NEAREST);
    cairo_paint(cr);

    cairo_surface_destroy(surf);
    vnc_client_unlock_fb(self->client);
    return FALSE;
}

/* ------------------------------------------------------------------ input */

static void widget_to_remote(VncDisplay *self, gdouble wx, gdouble wy,
                              gint *rx, gint *ry) {
    gint aw = gtk_widget_get_allocated_width(GTK_WIDGET(self));
    gint ah = gtk_widget_get_allocated_height(GTK_WIDGET(self));
    gdouble sx, sy; gint ox, oy;
    compute_scale(self, aw, ah, &sx, &sy, &ox, &oy);
    *rx = (gint)((wx - ox) / sx);
    *ry = (gint)((wy - oy) / sy);
}

static gboolean on_button_press(GtkWidget *w, GdkEventButton *ev, gpointer ud) {
    (void)ud;
    VncDisplay *self = VNC_DISPLAY(w);
    gtk_widget_grab_focus(w);

    switch (ev->button) {
    case 1: self->mouse_buttons |= 0x01; break;
    case 2: self->mouse_buttons |= 0x02; break;
    case 3: self->mouse_buttons |= 0x04; break;
    }
    gint rx, ry;
    widget_to_remote(self, ev->x, ev->y, &rx, &ry);
    vnc_client_send_pointer_event(self->client, rx, ry, self->mouse_buttons);
    return TRUE;
}

static gboolean on_button_release(GtkWidget *w, GdkEventButton *ev, gpointer ud) {
    (void)ud;
    VncDisplay *self = VNC_DISPLAY(w);
    switch (ev->button) {
    case 1: self->mouse_buttons &= (guint8)~0x01; break;
    case 2: self->mouse_buttons &= (guint8)~0x02; break;
    case 3: self->mouse_buttons &= (guint8)~0x04; break;
    }
    gint rx, ry;
    widget_to_remote(self, ev->x, ev->y, &rx, &ry);
    vnc_client_send_pointer_event(self->client, rx, ry, self->mouse_buttons);
    return TRUE;
}

static gboolean on_motion(GtkWidget *w, GdkEventMotion *ev, gpointer ud) {
    (void)ud;
    VncDisplay *self = VNC_DISPLAY(w);
    self->mouse_x = ev->x;
    self->mouse_y = ev->y;
    gint rx, ry;
    widget_to_remote(self, ev->x, ev->y, &rx, &ry);
    vnc_client_send_pointer_event(self->client, rx, ry, self->mouse_buttons);
    return TRUE;
}

static gboolean on_scroll(GtkWidget *w, GdkEventScroll *ev, gpointer ud) {
    (void)ud;
    VncDisplay *self = VNC_DISPLAY(w);
    gint rx, ry;
    widget_to_remote(self, ev->x, ev->y, &rx, &ry);

    guint8 btn = 0;
    if (ev->direction == GDK_SCROLL_UP)   btn = 0x08;
    if (ev->direction == GDK_SCROLL_DOWN)  btn = 0x10;

    if (btn) {
        vnc_client_send_pointer_event(self->client, rx, ry, self->mouse_buttons | btn);
        vnc_client_send_pointer_event(self->client, rx, ry, self->mouse_buttons);
    }
    return TRUE;
}

static gboolean on_key_press(GtkWidget *w, GdkEventKey *ev, gpointer ud) {
    (void)ud;
    VncDisplay *self = VNC_DISPLAY(w);
    vnc_client_send_key_event(self->client, ev->keyval, TRUE);
    return TRUE;
}

static gboolean on_key_release(GtkWidget *w, GdkEventKey *ev, gpointer ud) {
    (void)ud;
    VncDisplay *self = VNC_DISPLAY(w);
    vnc_client_send_key_event(self->client, ev->keyval, FALSE);
    return TRUE;
}

/* ------------------------------------------------------------------ GObject */

static void vnc_display_init(VncDisplay *self) {
    self->scale_mode = VNC_SCALE_FIT;
    gtk_widget_set_can_focus(GTK_WIDGET(self), TRUE);
    gtk_widget_set_hexpand(GTK_WIDGET(self), TRUE);
    gtk_widget_set_vexpand(GTK_WIDGET(self), TRUE);
    update_size_request(self);
    gtk_widget_add_events(GTK_WIDGET(self),
        GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK |
        GDK_POINTER_MOTION_MASK | GDK_SCROLL_MASK |
        GDK_KEY_PRESS_MASK | GDK_KEY_RELEASE_MASK);

    g_signal_connect(self, "draw",           G_CALLBACK(on_draw),           NULL);
    g_signal_connect(self, "button-press-event",   G_CALLBACK(on_button_press),  NULL);
    g_signal_connect(self, "button-release-event", G_CALLBACK(on_button_release),NULL);
    g_signal_connect(self, "motion-notify-event",  G_CALLBACK(on_motion),        NULL);
    g_signal_connect(self, "scroll-event",         G_CALLBACK(on_scroll),        NULL);
    g_signal_connect(self, "key-press-event",      G_CALLBACK(on_key_press),     NULL);
    g_signal_connect(self, "key-release-event",    G_CALLBACK(on_key_release),   NULL);
}

static void vnc_display_class_init(VncDisplayClass *klass) { (void)klass; }

/* ------------------------------------------------------------------ public */

GtkWidget *vnc_display_new(void) {
    return GTK_WIDGET(g_object_new(VNC_TYPE_DISPLAY, NULL));
}

void vnc_display_set_client(VncDisplay *self, VncClient *client) {
    self->client = client;
    gtk_widget_queue_draw(GTK_WIDGET(self));
}

VncClient *vnc_display_get_client(VncDisplay *self) { return self->client; }

void vnc_display_set_scale_mode(VncDisplay *self, VncScaleMode mode) {
    self->scale_mode = mode;
    update_size_request(self);
    gtk_widget_queue_draw(GTK_WIDGET(self));
}

VncScaleMode vnc_display_get_scale_mode(VncDisplay *self) { return self->scale_mode; }

void vnc_display_refresh(VncDisplay *self, gint x, gint y, gint w, gint h) {
    if (self->scale_mode == VNC_SCALE_NONE) {
        gtk_widget_queue_draw_area(GTK_WIDGET(self), x, y, w, h);
    } else {
        gtk_widget_queue_draw(GTK_WIDGET(self));
    }
}

void vnc_display_on_resize(VncDisplay *self, gint width, gint height) {
    self->remote_w = width;
    self->remote_h = height;
    update_size_request(self);
    gtk_widget_queue_draw(GTK_WIDGET(self));
}
