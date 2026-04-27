/*
 * Screenshot capture functionality
 * Based on GNOME Screenshot
 */

#include "screenshot.h"
#include <gdk/gdkx.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>

GdkPixbuf* capture_screenshot(ScreenshotType type) {
    GdkPixbuf *screenshot = NULL;
    
    switch (type) {
        case SCREENSHOT_FULL_SCREEN: {
            GdkDisplay *display = gdk_display_get_default();
            if (display == NULL) {
                g_warning("Cannot get default display");
                return NULL;
            }
            
            // Check if we're on X11
            if (GDK_IS_X11_DISPLAY(display)) {
                GdkWindow *root_window = gdk_get_default_root_window();
                
                if (root_window == NULL) {
                    g_warning("Cannot get root window");
                    return NULL;
                }
                
                gint width = gdk_window_get_width(root_window);
                gint height = gdk_window_get_height(root_window);
                
                // Validate dimensions
                if (width <= 0 || height <= 0) {
                    // Try to get screen size from monitor
                    GdkMonitor *monitor = gdk_display_get_primary_monitor(display);
                    if (monitor == NULL && gdk_display_get_n_monitors(display) > 0) {
                        monitor = gdk_display_get_monitor(display, 0);
                    }
                    
                    if (monitor != NULL) {
                        GdkRectangle geometry;
                        gdk_monitor_get_geometry(monitor, &geometry);
                        width = geometry.width;
                        height = geometry.height;
                        g_print("Using monitor geometry: %dx%d\n", width, height);
                    } else {
                        g_warning("Cannot determine screen size");
                        return NULL;
                    }
                }
                
                g_print("Capturing screenshot: %dx%d\n", width, height);
                screenshot = gdk_pixbuf_get_from_window(root_window, 0, 0, width, height);
                
                if (screenshot == NULL) {
                    g_warning("Failed to capture screenshot from window");
                }
            } else {
                g_warning("Wayland is not fully supported yet. Please use X11.");
                g_warning("You can run with: GDK_BACKEND=x11 ./enhanced-screenshot");
                
                // Attempt basic capture anyway
                GdkWindow *root_window = gdk_get_default_root_window();
                if (root_window != NULL) {
                    gint width = gdk_window_get_width(root_window);
                    gint height = gdk_window_get_height(root_window);
                    
                    if (width > 0 && height > 0) {
                        screenshot = gdk_pixbuf_get_from_window(root_window, 0, 0, width, height);
                    }
                }
            }
            break;
        }
            
        case SCREENSHOT_WINDOW:
            // TODO: Implement window selection
            g_warning("Window screenshot not yet implemented");
            break;
            
        case SCREENSHOT_AREA:
            // TODO: Implement area selection
            g_warning("Area screenshot not yet implemented");
            break;
            
        default:
            break;
    }
    
    return screenshot;
}

GdkPixbuf* capture_screenshot_with_delay(ScreenshotType type, int delay_seconds) {
    // Simple implementation - just sleep
    g_usleep(delay_seconds * 1000000);
    return capture_screenshot(type);
}
