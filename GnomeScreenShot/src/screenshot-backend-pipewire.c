/*
 * screenshot-backend-pipewire.c - Direct GNOME Shell Screenshot API
 * 
 * Uses GNOME Shell Screenshot API directly via D-Bus
 * This is the native way GNOME apps capture screenshots on Wayland.
 */

#include "screenshot.h"
#include <gio/gio.h>
#include <glib.h>
#include <time.h>

#define SHELL_BUS_NAME   "org.gnome.Shell.Screenshot"
#define SHELL_OBJECT_PATH "/org/gnome/Shell/Screenshot"
#define SHELL_INTERFACE "org.gnome.Shell.Screenshot"

static gchar *
generate_temp_filename (void)
{
    gchar *tmp_dir = g_strdup ("/tmp");
    time_t t = time (NULL);
    gchar *filename = g_strdup_printf ("%s/gnome-screenshot-%ld.png", tmp_dir, (long)t);
    g_free (tmp_dir);
    return filename;
}

GdkPixbuf *
screenshot_get_pixbuf_pipewire (ScreenshotMode mode)
{
    GError *error = NULL;
    GDBusProxy *proxy;
    GVariant *result = NULL;
    GdkPixbuf *pixbuf = NULL;
    gchar *filename = NULL;
    gboolean success = FALSE;
    gboolean flash = FALSE;
    
    g_print ("Using GNOME Shell Screenshot API (mode=%d)...\n", mode);
    
    proxy = g_dbus_proxy_new_for_bus_sync (
        G_BUS_TYPE_SESSION,
        G_DBUS_PROXY_FLAGS_NONE,
        NULL,
        SHELL_BUS_NAME,
        SHELL_OBJECT_PATH,
        SHELL_INTERFACE,
        NULL,
        &error
    );
    
    if (error) {
        g_warning ("Failed to create GNOME Shell proxy: %s", error->message);
        g_error_free (error);
        return NULL;
    }
    
    filename = generate_temp_filename ();
    g_print ("Temporary file: %s\n", filename);
    
    /* Call appropriate method based on mode */
    if (mode == SCREENSHOT_MODE_FULL_SCREEN) {
        result = g_dbus_proxy_call_sync (
            proxy,
            "Screenshot",
            g_variant_new ("(bbs)", FALSE, flash, filename),
            G_DBUS_CALL_FLAGS_NONE,
            -1,
            NULL,
            &error
        );
    } else if (mode == SCREENSHOT_MODE_WINDOW) {
        result = g_dbus_proxy_call_sync (
            proxy,
            "ScreenshotWindow",
            g_variant_new ("(bbbs)", TRUE, FALSE, flash, filename),
            G_DBUS_CALL_FLAGS_NONE,
            -1,
            NULL,
            &error
        );
    } else {
        /* For area mode, we need coordinates - capture full screen first */
        result = g_dbus_proxy_call_sync (
            proxy,
            "Screenshot",
            g_variant_new ("(bbs)", FALSE, flash, filename),
            G_DBUS_CALL_FLAGS_NONE,
            -1,
            NULL,
            &error
        );
    }
    
    if (error) {
        g_warning ("GNOME Shell Screenshot failed: %s", error->message);
        g_error_free (error);
        g_object_unref (proxy);
        g_free (filename);
        return NULL;
    }
    
    if (result) {
        g_variant_get (result, "(bs)", &success, &filename);
        g_print ("Screenshot result: success=%d, filename=%s\n", success, filename);
        
        if (success && filename && g_file_test (filename, G_FILE_TEST_EXISTS)) {
            pixbuf = gdk_pixbuf_new_from_file (filename, &error);
            
            if (error) {
                g_warning ("Failed to load screenshot: %s", error->message);
                g_error_free (error);
            } else {
                g_print ("Loaded screenshot: %dx%d\n",
                        gdk_pixbuf_get_width (pixbuf),
                        gdk_pixbuf_get_height (pixbuf));
            }
            
            unlink (filename);
        }
        
        g_variant_unref (result);
    }
    
    g_object_unref (proxy);
    g_free (filename);
    
    return pixbuf;
}
