/*
 * screenshot.h - based on GNOME Screenshot (gnome-screenshot 41)
 * src/screenshot-utils.h
 */

#ifndef SCREENSHOT_H
#define SCREENSHOT_H

#include <gtk/gtk.h>

typedef enum {
    SCREENSHOT_MODE_FULL_SCREEN,
    SCREENSHOT_MODE_WINDOW,
    SCREENSHOT_MODE_AREA
} ScreenshotMode;

/* Main capture function matching gnome-screenshot's screenshot_get_pixbuf().
 * window:    the GdkWindow to capture (only used for SCREENSHOT_MODE_WINDOW)
 * rectangle: the area to capture   (only used for SCREENSHOT_MODE_AREA)
 * include_pointer: composite the mouse cursor onto the result (XFixes)
 * include_border:  include window manager decorations / frame extents
 */
GdkPixbuf *screenshot_get_pixbuf        (ScreenshotMode  mode,
                                          GdkWindow      *window,
                                          GdkRectangle   *rectangle,
                                          gboolean        include_pointer,
                                          gboolean        include_border);

/* Find the currently active (focused) window, same as gnome-screenshot */
GdkWindow *screenshot_find_current_window (void);

/* PipeWire-based Wayland native screenshot (via XDG Portal) */
GdkPixbuf *screenshot_get_pixbuf_pipewire (ScreenshotMode mode);

/* Direct X11 capture (for area selection background) */
GdkPixbuf *capture_x11 (ScreenshotMode  mode,
                        GdkRectangle   *rectangle,
                        gboolean        include_pointer,
                        gboolean        include_border);

#endif /* SCREENSHOT_H */
