/*
 * screenshot.c - based on GNOME Screenshot source
 *
 * Capture strategy (mirrors how gnome-screenshot actually works):
 *
 *  Wayland  →  XDG Desktop Portal  (org.freedesktop.portal.Screenshot)
 *              Portal returns a URI via async Response signal.
 *              For window / area modes the full-screen pixbuf is cropped.
 *              Window rect is obtained via _NET_ACTIVE_WINDOW on XWayland.
 *
 *  X11      →  gdk_pixbuf_get_from_window() on the root GdkWindow
 *           +  XFixesGetCursorImage() for cursor compositing
 */

#include "screenshot.h"
#include <gio/gio.h>
#include <glib/gstdio.h>
#include <gdk/gdkx.h>
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/extensions/Xfixes.h>
#include <time.h>
#include <unistd.h>
#include <sys/wait.h>

/* =========================================================================
 * Shared helpers
 * ========================================================================= */

#if 0  /* Unused - kept for reference */
static gboolean __attribute__((unused))
is_wayland_session (void)
{
    /* Check actual GDK display type, not just environment variables */
    GdkDisplay *display = gdk_display_get_default ();
    if (!display) {
        /* Fallback to env check if no display yet */
        return g_getenv ("WAYLAND_DISPLAY") != NULL;
    }
    
    /* If we have an X11 display, use X11 path even on Wayland session */
    if (GDK_IS_X11_DISPLAY (display)) {
        g_print ("Using X11 display - X11 capture path\n");
        return FALSE;
    }
    
    g_print ("Using Wayland display - Portal/Shell capture path\n");
    return TRUE;
}
#endif

/* =========================================================================
 * X11 path  (used when GDK_BACKEND=x11 / pure X11 session)
 * ========================================================================= */

static void
composite_cursor_x11 (GdkDisplay *dpy, GdkPixbuf *screenshot,
                      gint x_off, gint y_off)
{
    Display           *xdpy = GDK_DISPLAY_XDISPLAY (dpy);
    XFixesCursorImage *ci   = XFixesGetCursorImage (xdpy);
    if (!ci) return;

    int cur_w = ci->width, cur_h = ci->height;
    int cx    = (int)ci->x - (int)ci->xhot - x_off;
    int cy    = (int)ci->y - (int)ci->yhot - y_off;

    GdkPixbuf *cpb      = gdk_pixbuf_new (GDK_COLORSPACE_RGB, TRUE, 8, cur_w, cur_h);
    int        rowstride = gdk_pixbuf_get_rowstride (cpb);

    for (int j = 0; j < cur_h; j++) {
        guchar *dst = gdk_pixbuf_get_pixels (cpb) + j * rowstride;
        for (int i = 0; i < cur_w; i++) {
            unsigned long p = ci->pixels[j * cur_w + i];
            guchar a = (p >> 24) & 0xff;
            guchar r = (p >> 16) & 0xff;
            guchar g = (p >>  8) & 0xff;
            guchar b = (p      ) & 0xff;
            if (a > 0) {
                *dst++ = (guchar)((guint)r * 255u / a);
                *dst++ = (guchar)((guint)g * 255u / a);
                *dst++ = (guchar)((guint)b * 255u / a);
            } else {
                *dst++ = 0; *dst++ = 0; *dst++ = 0;
            }
            *dst++ = a;
        }
    }
    XFree (ci);

    int dx = MAX (0, cx), dy = MAX (0, cy);
    int dw = MIN (cur_w, gdk_pixbuf_get_width  (screenshot) - dx);
    int dh = MIN (cur_h, gdk_pixbuf_get_height (screenshot) - dy);

    if (dw > 0 && dh > 0)
        gdk_pixbuf_composite (cpb, screenshot, dx, dy, dw, dh,
                              (gdouble)cx, (gdouble)cy,
                              1.0, 1.0, GDK_INTERP_BILINEAR, 255);
    g_object_unref (cpb);
}

GdkPixbuf *
capture_x11 (ScreenshotMode mode, GdkRectangle *rectangle,
             gboolean include_pointer, gboolean include_border)
{
    GdkDisplay *dpy = gdk_display_get_default ();
    if (!dpy || !GDK_IS_X11_DISPLAY (dpy)) {
        g_warning ("capture_x11: not an X11 display");
        return NULL;
    }

G_GNUC_BEGIN_IGNORE_DEPRECATIONS
    GdkScreen *screen = gdk_display_get_default_screen (dpy);
    GdkWindow *root   = gdk_screen_get_root_window (screen);
G_GNUC_END_IGNORE_DEPRECATIONS

    gint sw = gdk_window_get_width  (root);
    gint sh = gdk_window_get_height (root);
    gint x = 0, y = 0, w = sw, h = sh;

    switch (mode) {
    case SCREENSHOT_MODE_WINDOW: {
G_GNUC_BEGIN_IGNORE_DEPRECATIONS
        GdkWindow *active = gdk_screen_get_active_window (screen);
G_GNUC_END_IGNORE_DEPRECATIONS
        if (active &&
            gdk_window_get_type_hint (active) != GDK_WINDOW_TYPE_HINT_DESKTOP) {
            if (include_border) {
                GdkRectangle f;
                gdk_window_get_frame_extents (active, &f);
                x = f.x; y = f.y; w = f.width; h = f.height;
            } else {
                gdk_window_get_origin   (active, &x, &y);
                gdk_window_get_geometry (active, NULL, NULL, &w, &h);
            }
            g_object_unref (active);
        }
        break;
    }
    case SCREENSHOT_MODE_AREA:
        if (!rectangle) return NULL;
        x = rectangle->x; y = rectangle->y;
        w = rectangle->width; h = rectangle->height;
        break;
    default: break;
    }

    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    w = CLAMP (w, 1, sw - x);
    h = CLAMP (h, 1, sh - y);

    g_print ("X11 capture: screen=%dx%d, region=(%d,%d %dx%d), mode=%d\n", 
             sw, sh, x, y, w, h, mode);

    /* Ensure root window is mapped and compositor has rendered */
    gdk_display_sync (dpy);
    gdk_display_flush (dpy);
    
    GdkPixbuf *pixbuf = gdk_pixbuf_get_from_window (root, x, y, w, h);
    if (!pixbuf) { 
        g_warning ("capture_x11: gdk_pixbuf_get_from_window failed"); 
        return NULL; 
    }
    
    g_print ("X11 capture: got pixbuf %dx%d\n", 
             gdk_pixbuf_get_width(pixbuf), gdk_pixbuf_get_height(pixbuf));

    if (include_pointer) composite_cursor_x11 (dpy, pixbuf, x, y);
    return pixbuf;
}

/* =========================================================================
 * GNOME Shell Screenshot API fallback
 * ========================================================================= */

#if 0  /* Unused Wayland capture methods - kept for reference */

#define SHELL_DEST  "org.gnome.Shell"
#define SHELL_PATH  "/org/gnome/Shell/Screenshot"
#define SHELL_IFACE "org.gnome.Shell.Screenshot"

static GdkPixbuf *
capture_gnome_shell_fullscreen (void)
{
    GDBusConnection *bus;
    GError          *error = NULL;
    GdkPixbuf       *pixbuf = NULL;

    bus = g_bus_get_sync (G_BUS_TYPE_SESSION, NULL, &error);
    if (!bus) {
        g_warning ("GNOME Shell: D-Bus session unavailable: %s", error->message);
        g_clear_error (&error);
        return NULL;
    }

    /* Create temporary file for screenshot */
    char *tmpfile = g_strdup_printf ("/tmp/screenshot-%d-%ld.png", 
                                      getpid(), (long)time(NULL));

    g_print ("GNOME Shell: calling Screenshot method...\n");
    
    GVariant *result = g_dbus_connection_call_sync (
        bus, SHELL_DEST, SHELL_PATH, SHELL_IFACE,
        "Screenshot",
        g_variant_new ("(bbs)", FALSE, FALSE, tmpfile),
        G_VARIANT_TYPE ("(bs)"),
        G_DBUS_CALL_FLAGS_NONE, -1, NULL, &error);

    if (error) {
        g_warning ("GNOME Shell screenshot D-Bus failed: %s", error->message);
        g_clear_error (&error);
        g_object_unref (bus);
        g_free (tmpfile);
        return NULL;
    }

    if (result) {
        gboolean success = FALSE;
        char *filename = NULL;
        g_variant_get (result, "(bs)", &success, &filename);
        g_print ("GNOME Shell: success=%d, filename=%s\n", success, filename);
        
        if (success && filename && g_file_test (filename, G_FILE_TEST_EXISTS)) {
            GError *err = NULL;
            pixbuf = gdk_pixbuf_new_from_file (filename, &err);
            if (err) {
                g_warning ("GNOME Shell: cannot load '%s': %s", filename, err->message);
                g_clear_error (&err);
            } else {
                g_print ("GNOME Shell: successfully loaded pixbuf %dx%d\n",
                        gdk_pixbuf_get_width(pixbuf),
                        gdk_pixbuf_get_height(pixbuf));
            }
            g_unlink (filename);
        }
        g_free (filename);
        g_variant_unref (result);
    }

    g_object_unref (bus);
    g_free (tmpfile);
    return pixbuf;
}

/* =========================================================================
 * Wayland path – XDG Desktop Portal
 *
 * Flow mirrors gnome-screenshot's portal usage:
 *   1. Pre-compute expected request handle path (avoids race condition)
 *   2. Subscribe to org.freedesktop.portal.Request.Response signal
 *   3. Call org.freedesktop.portal.Screenshot.Screenshot
 *   4. Run GMainLoop until Response arrives
 *   5. Load pixbuf from the file URI in the response
 * ========================================================================= */

#define PORTAL_DEST   "org.freedesktop.portal.Desktop"
#define PORTAL_PATH   "/org/freedesktop/portal/desktop"
#define PORTAL_IFACE  "org.freedesktop.portal.Screenshot"
#define REQUEST_IFACE "org.freedesktop.portal.Request"

typedef struct {
    gboolean   received;
    GdkPixbuf *pixbuf;
    guint      signal_id;
    GDBusConnection *conn;
} PortalCtx;

static void
on_portal_response (GDBusConnection *conn G_GNUC_UNUSED,
                    const char      *sender_name G_GNUC_UNUSED,
                    const char      *object_path G_GNUC_UNUSED,
                    const char      *iface       G_GNUC_UNUSED,
                    const char      *signal      G_GNUC_UNUSED,
                    GVariant        *params,
                    gpointer         user_data)
{
    PortalCtx *ctx = (PortalCtx *)user_data;
    guint32    response;
    GVariant  *results;

    g_variant_get (params, "(u@a{sv})", &response, &results);
    
    g_print ("Portal Response: code=%u\n", response);

    if (response == 0) {
        const char *uri = NULL;
        if (g_variant_lookup (results, "uri", "&s", &uri) && uri) {
            g_print ("Portal: received URI=%s\n", uri);
            GFile  *file = g_file_new_for_uri (uri);
            char   *path = g_file_get_path (file);
            GError *err  = NULL;
            ctx->pixbuf  = gdk_pixbuf_new_from_file (path, &err);
            if (err) { g_warning ("Portal: cannot load '%s': %s", path, err->message); g_clear_error (&err); }
            else { g_print ("Portal: successfully loaded pixbuf %dx%d\n", 
                           gdk_pixbuf_get_width(ctx->pixbuf), 
                           gdk_pixbuf_get_height(ctx->pixbuf)); }
            g_unlink (path);
            g_free (path);
            g_object_unref (file);
        } else {
            g_warning ("Portal: no URI in response");
        }
        g_variant_unref (results);
    } else {
        g_warning ("Portal: screenshot response=%u (cancelled or error)", response);
    }

    ctx->received = TRUE;
}

/* Capture full screen via XDG Portal. Returns NULL on failure. */
static GdkPixbuf *
capture_portal_fullscreen (void)
{
    GDBusConnection *bus;
    GError          *error = NULL;
    PortalCtx        ctx   = { 0 };
    static int       token_n = 0;

    bus = g_bus_get_sync (G_BUS_TYPE_SESSION, NULL, &error);
    if (!bus) {
        g_warning ("Portal: D-Bus session unavailable: %s", error->message);
        g_clear_error (&error);
        return NULL;
    }

    /* Build request handle path to subscribe before calling (avoids race).
     * Format: /org/freedesktop/portal/desktop/request/<sender>/<token>
     * where <sender> = unique bus name with ':' stripped and '.' → '_'. */
    char *token  = g_strdup_printf ("scr%d", ++token_n);
    const char *unique = g_dbus_connection_get_unique_name (bus); /* e.g. ":1.164" */
    char *sender = g_strdup (unique + 1); /* skip leading ':' */
    for (char *p = sender; *p; p++)
        if (*p == '.') *p = '_';
    char *handle_path = g_strdup_printf (
        "/org/freedesktop/portal/desktop/request/%s/%s", sender, token);
    g_free (sender);

    /* Subscribe to Response BEFORE the call */
    ctx.received  = FALSE;
    ctx.conn      = bus;
    ctx.signal_id = g_dbus_connection_signal_subscribe (
        bus, NULL, REQUEST_IFACE, "Response", handle_path, NULL,
        G_DBUS_SIGNAL_FLAGS_NONE, on_portal_response, &ctx, NULL);

    GVariantBuilder opts;
    g_variant_builder_init  (&opts, G_VARIANT_TYPE ("a{sv}"));
    g_variant_builder_add   (&opts, "{sv}", "handle_token", g_variant_new_string (token));
    g_variant_builder_add   (&opts, "{sv}", "interactive",  g_variant_new_boolean (TRUE));
    g_variant_builder_add   (&opts, "{sv}", "modal",        g_variant_new_boolean (TRUE));
    
    g_print ("Portal: calling Screenshot with interactive=TRUE, modal=TRUE\n");

    GVariant *result = g_dbus_connection_call_sync (
        bus, PORTAL_DEST, PORTAL_PATH, PORTAL_IFACE,
        "Screenshot",
        g_variant_new ("(sa{sv})", "", &opts),
        G_VARIANT_TYPE ("(o)"),
        G_DBUS_CALL_FLAGS_NONE, -1, NULL, &error);

    g_free (token);
    g_free (handle_path);

    if (error) {
        g_warning ("Portal: Screenshot call failed: %s", error->message);
        g_clear_error (&error);
        g_dbus_connection_signal_unsubscribe (bus, ctx.signal_id);
        g_object_unref (bus);
        return NULL;
    }
    if (result) g_variant_unref (result);

    /* Wait for Response signal using event loop iterations instead of nested GMainLoop */
    GMainContext *context = g_main_context_default ();
    int max_iterations = 300; /* 30 seconds @ 100ms per iteration */
    
    g_print ("Portal: waiting for response...\n");
    for (int i = 0; i < max_iterations && !ctx.received; i++) {
        g_main_context_iteration (context, FALSE);
        g_usleep (100000); /* 100ms */
    }
    
    if (!ctx.received) {
        g_warning ("Portal: timeout waiting for response");
    }

    g_dbus_connection_signal_unsubscribe (bus, ctx.signal_id);
    g_object_unref (bus);

    return ctx.pixbuf;
}

/* Get active window rect via _NET_ACTIVE_WINDOW on XWayland.
 * Returns TRUE and fills rect on success. */
static gboolean
get_active_window_rect (GdkRectangle *rect, gboolean include_border)
{
    const char *display_name = g_getenv ("DISPLAY");
    if (!display_name) return FALSE;

    Display *dpy = XOpenDisplay (display_name);
    if (!dpy) return FALSE;

    Window root = DefaultRootWindow (dpy);
    Atom   prop = XInternAtom (dpy, "_NET_ACTIVE_WINDOW", False);
    Atom   actual; int fmt; unsigned long n, after;
    unsigned char *data = NULL;
    Window active = None;

    if (XGetWindowProperty (dpy, root, prop, 0, 1, False, XA_WINDOW,
                            &actual, &fmt, &n, &after, &data) == Success && data) {
        active = *(Window *)data;
        XFree (data);
    }
    if (active == None || active == root) { XCloseDisplay (dpy); return FALSE; }

    /* Walk to frame window when include_border */
    Window win = active;
    if (include_border) {
        Window par, root_ret, *children;
        unsigned int nc;
        while (TRUE) {
            XQueryTree (dpy, win, &root_ret, &par, &children, &nc);
            if (children) XFree (children);
            if (par == root || par == None) break;
            win = par;
        }
    }

    Window      child;
    int         wx = 0, wy = 0;
    unsigned int ww = 0, wh = 0, bw = 0, depth = 0;
    Window       root_ret;
    XGetGeometry        (dpy, win, &root_ret, &wx, &wy, &ww, &wh, &bw, &depth);
    XTranslateCoordinates (dpy, win, root, 0, 0, &wx, &wy, &child);

    int sw = DisplayWidth  (dpy, DefaultScreen (dpy));
    int sh = DisplayHeight (dpy, DefaultScreen (dpy));
    rect->x      = CLAMP (wx,      0, sw - 1);
    rect->y      = CLAMP (wy,      0, sh - 1);
    rect->width  = CLAMP ((int)ww, 1, sw - rect->x);
    rect->height = CLAMP ((int)wh, 1, sh - rect->y);

    XCloseDisplay (dpy);
    return TRUE;
}

static GdkPixbuf * __attribute__((unused))
capture_wayland (ScreenshotMode mode, GdkRectangle *rectangle, gboolean include_border)
{
    /* Try XDG Portal first */
    g_print ("Attempting screenshot via XDG Desktop Portal...\n");
    GdkPixbuf *full = capture_portal_fullscreen ();
    
    /* Fallback to GNOME Shell API if portal fails */
    if (!full) {
        g_print ("Portal failed, trying GNOME Shell API...\n");
        full = capture_gnome_shell_fullscreen ();
    }
    
    if (!full) {
        g_warning ("All Wayland screenshot methods failed");
        return NULL;
    }

    GdkRectangle crop = { 0, 0,
        gdk_pixbuf_get_width  (full),
        gdk_pixbuf_get_height (full) };

    switch (mode) {
    case SCREENSHOT_MODE_FULL_SCREEN:
        break; /* use full pixbuf as-is */

    case SCREENSHOT_MODE_WINDOW:
        if (!get_active_window_rect (&crop, include_border))
            break; /* fallback: full screen */
        break;

    case SCREENSHOT_MODE_AREA:
        if (rectangle) crop = *rectangle;
        break;

    default:
        break;
    }

    /* Clip crop to pixbuf bounds */
    int pw = gdk_pixbuf_get_width  (full);
    int ph = gdk_pixbuf_get_height (full);
    if (crop.x < 0) { crop.width  += crop.x; crop.x = 0; }
    if (crop.y < 0) { crop.height += crop.y; crop.y = 0; }
    crop.width  = CLAMP (crop.width,  1, pw - crop.x);
    crop.height = CLAMP (crop.height, 1, ph - crop.y);

    if (crop.x == 0 && crop.y == 0 &&
        crop.width == pw && crop.height == ph) {
        return full; /* nothing to crop */
    }

    GdkPixbuf *sub    = gdk_pixbuf_new_subpixbuf (full, crop.x, crop.y, crop.width, crop.height);
    GdkPixbuf *result = gdk_pixbuf_copy (sub);
    g_object_unref (sub);
    g_object_unref (full);
    return result;
}

#endif  /* End of unused Wayland capture methods */

/* =========================================================================
 * Public API
 * ========================================================================= */

GdkWindow *
screenshot_find_current_window (void)
{
G_GNUC_BEGIN_IGNORE_DEPRECATIONS
    GdkWindow *w = gdk_screen_get_active_window (gdk_screen_get_default ());
G_GNUC_END_IGNORE_DEPRECATIONS
    return w ? w : gdk_get_default_root_window ();
}

GdkPixbuf *
screenshot_get_pixbuf (ScreenshotMode  mode,
                       GdkWindow      *window G_GNUC_UNUSED,
                       GdkRectangle   *rectangle,
                       gboolean        include_pointer,
                       gboolean        include_border)
{
    GdkDisplay *display = gdk_display_get_default ();
    
    if (!display) {
        g_warning ("No display available");
        return NULL;
    }

    /* Check if we're on Wayland or X11 */
    if (GDK_IS_X11_DISPLAY (display)) {
        g_print ("X11 session detected, using direct capture...\n");
        return capture_x11 (mode, rectangle, include_pointer, include_border);
    } else {
        g_print ("Wayland session detected, using PipeWire/Portal...\n");
        
        /* For area mode with rectangle, capture full screen then crop */
        if (mode == SCREENSHOT_MODE_AREA && rectangle) {
            GdkPixbuf *full = screenshot_get_pixbuf_pipewire (SCREENSHOT_MODE_FULL_SCREEN);
            if (!full) return NULL;
            
            int full_w = gdk_pixbuf_get_width (full);
            int full_h = gdk_pixbuf_get_height (full);
            
            int x = CLAMP (rectangle->x, 0, full_w - 1);
            int y = CLAMP (rectangle->y, 0, full_h - 1);
            int w = CLAMP (rectangle->width, 1, full_w - x);
            int h = CLAMP (rectangle->height, 1, full_h - y);
            
            GdkPixbuf *cropped = gdk_pixbuf_new_subpixbuf (full, x, y, w, h);
            GdkPixbuf *result = gdk_pixbuf_copy (cropped);
            g_object_unref (cropped);
            g_object_unref (full);
            
            return result;
        }
        
        return screenshot_get_pixbuf_pipewire (mode);
    }
}
