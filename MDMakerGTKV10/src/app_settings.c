#include "app_settings.h"

#include <string.h>

static char *settings_path(void)
{
    return g_build_filename(g_get_user_config_dir(), "MDMakerGTKV10", "settings.ini", NULL);
}

static char *default_pdf_output_dir(void)
{
    const char *docs = g_get_user_special_dir(G_USER_DIRECTORY_DOCUMENTS);
    if (docs && g_file_test(docs, G_FILE_TEST_IS_DIR))
        return g_strdup(docs);
    return g_strdup(g_get_home_dir());
}

AppSettings *app_settings_load(void)
{
    AppSettings *s = g_new0(AppSettings, 1);
    /* defaults */
    s->font_family            = g_strdup("sans-serif");
    s->font_size_pt           = 10.0;
    s->line_height            = 1.6;
    s->paragraph_spacing_em   = 0.5;
    s->margin_vertical_inch   = 0.75;
    s->margin_horizontal_inch = 1.0;
    s->pdf_output_dir         = default_pdf_output_dir();

    char *path = settings_path();
    GKeyFile *kf = g_key_file_new();
    if (g_key_file_load_from_file(kf, path, G_KEY_FILE_NONE, NULL)) {
        char *v;
        v = g_key_file_get_string(kf, "General", "LastSourceDir", NULL);
        if (v) { g_free(s->last_source_dir);  s->last_source_dir  = v; }
        v = g_key_file_get_string(kf, "General", "LastOutputFile", NULL);
        if (v) { g_free(s->last_output_file); s->last_output_file = v; }

        v = g_key_file_get_string(kf, "Pdf", "FontFamily", NULL);
        if (v) { g_free(s->font_family); s->font_family = v; }

        GError *err = NULL;
        double d;
        d = g_key_file_get_double(kf, "Pdf", "FontSizePt", &err);
        if (!err) { s->font_size_pt = d; } g_clear_error(&err);
        d = g_key_file_get_double(kf, "Pdf", "LineHeight", &err);
        if (!err) { s->line_height = d; } g_clear_error(&err);
        d = g_key_file_get_double(kf, "Pdf", "ParagraphSpacingEm", &err);
        if (!err) { s->paragraph_spacing_em = d; } g_clear_error(&err);
        d = g_key_file_get_double(kf, "Pdf", "MarginVerticalInch", &err);
        if (!err) { s->margin_vertical_inch = d; } g_clear_error(&err);
        d = g_key_file_get_double(kf, "Pdf", "MarginHorizontalInch", &err);
        if (!err) { s->margin_horizontal_inch = d; } g_clear_error(&err);

        v = g_key_file_get_string(kf, "Pdf", "OutputDir", NULL);
        if (v) { g_free(s->pdf_output_dir); s->pdf_output_dir = v; }
    }
    g_key_file_unref(kf);
    g_free(path);
    return s;
}

void app_settings_save(const AppSettings *s)
{
    char *path = settings_path();
    char *dir  = g_path_get_dirname(path);
    g_mkdir_with_parents(dir, 0755);
    g_free(dir);

    GKeyFile *kf = g_key_file_new();
    if (s->last_source_dir)
        g_key_file_set_string(kf, "General", "LastSourceDir",  s->last_source_dir);
    if (s->last_output_file)
        g_key_file_set_string(kf, "General", "LastOutputFile", s->last_output_file);

    g_key_file_set_string(kf, "Pdf", "FontFamily",           s->font_family ? s->font_family : "sans-serif");
    g_key_file_set_double(kf, "Pdf", "FontSizePt",           s->font_size_pt);
    g_key_file_set_double(kf, "Pdf", "LineHeight",           s->line_height);
    g_key_file_set_double(kf, "Pdf", "ParagraphSpacingEm",   s->paragraph_spacing_em);
    g_key_file_set_double(kf, "Pdf", "MarginVerticalInch",   s->margin_vertical_inch);
    g_key_file_set_double(kf, "Pdf", "MarginHorizontalInch", s->margin_horizontal_inch);
    if (s->pdf_output_dir)
        g_key_file_set_string(kf, "Pdf", "OutputDir", s->pdf_output_dir);

    g_key_file_save_to_file(kf, path, NULL);
    g_key_file_unref(kf);
    g_free(path);
}

void app_settings_free(AppSettings *s)
{
    if (!s) return;
    g_free(s->last_source_dir);
    g_free(s->last_output_file);
    g_free(s->pdf_output_dir);
    g_free(s->font_family);
    g_free(s);
}
