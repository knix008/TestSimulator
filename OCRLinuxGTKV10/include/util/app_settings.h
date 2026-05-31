#ifndef APP_SETTINGS_H
#define APP_SETTINGS_H

#include <glib.h>

typedef struct {
    char *last_directory;
    int preprocess_mode;
    char *ocr_provider_id;
    int outer_splitter_pos;
    int inner_splitter_pos;
    int window_width;
    int window_height;
    int window_x;
    int window_y;
    gboolean window_maximized;
} AppSettings;

void app_settings_init_defaults(AppSettings *settings);
void app_settings_clear(AppSettings *settings);
gboolean app_settings_load(AppSettings *settings, GError **error);
gboolean app_settings_save(const AppSettings *settings, GError **error);

#endif
