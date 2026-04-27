/*
 * Auto-save functionality
 */

#include "autosave.h"
#include <time.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>

char* get_default_save_directory(void) {
    const char *home = g_get_home_dir();
    char *pictures_dir = g_build_filename(home, "Pictures", "Screenshots", NULL);
    
    // Create directory if it doesn't exist
    g_mkdir_with_parents(pictures_dir, 0755);
    
    return pictures_dir;
}

char* generate_auto_save_filename(const char *directory) {
    time_t now;
    struct tm *tm_info;
    char timestamp[64];
    char *filename;
    
    time(&now);
    tm_info = localtime(&now);
    
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d_%H-%M-%S", tm_info);
    
    filename = g_strdup_printf("%s/Screenshot_%s.png", directory, timestamp);
    
    return filename;
}

bool save_screenshot(GdkPixbuf *pixbuf, const char *filename) {
    GError *error = NULL;
    
    if (pixbuf == NULL) {
        g_warning("Cannot save NULL pixbuf");
        return false;
    }
    
    // Ensure directory exists
    char *dirname = g_path_get_dirname(filename);
    g_mkdir_with_parents(dirname, 0755);
    g_free(dirname);
    
    // Save as PNG
    gboolean success = gdk_pixbuf_save(pixbuf, filename, "png", &error, NULL);
    
    if (!success) {
        g_warning("Failed to save screenshot: %s", error->message);
        g_error_free(error);
        return false;
    }
    
    return true;
}
