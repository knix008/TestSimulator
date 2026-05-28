#pragma once

#include <glib.h>

typedef struct {
    char  *last_source_dir;
    char  *last_output_file;
    char  *pdf_output_dir;
    char  *font_family;
    double font_size_pt;
    double line_height;
    double paragraph_spacing_em;
    double margin_vertical_inch;
    double margin_horizontal_inch;
} AppSettings;

AppSettings *app_settings_load(void);
void         app_settings_save(const AppSettings *s);
void         app_settings_free(AppSettings *s);
